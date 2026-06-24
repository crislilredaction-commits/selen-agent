import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { sendProspectQuestionnaireEmail } from "../src/lib/email";
import { canSendOutboundEmails } from "../src/lib/outbound-email-guard";

// ─── Env ──────────────────────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant`);
  return value;
}

const supabase = createClient(
  getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
);

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Nombre maximum d'emails envoyés par run.
 */
const DAILY_SEND_LIMIT = 20;

/**
 * Nombre de prospects récupérés AVANT filtrage.
 *
 * Important :
 * Si on récupère seulement 20 prospects et que les 20 sont filtrés,
 * le robot envoie 0 alors qu'il peut y avoir des prospects valides ensuite.
 */
const FETCH_LIMIT = 100;

const MIN_DELAY_MS = 2_000;
const MAX_EXTRA_DELAY_MS = 3_000;

/**
 * Un prospect resté à "sending" depuis plus de SENDING_TIMEOUT_MS est
 * considéré comme un crash.
 */
const SENDING_TIMEOUT_MS = 15 * 60 * 1_000;

// ─── Domaines / règles ────────────────────────────────────────────────────────

const BLOCKED_EXACT_DOMAINS = new Set([
  "dataprospects.fr",
  "eterritoire.com",
  "eterritoire.fr",
  "example.com",
  "domain.com",
  "email.com",
]);

const BLOCKED_PLATFORM_DOMAINS = new Set(["hellowork.com", "societe.com"]);

const ALLOWED_GENERIC_PROVIDERS = new Set([
  "gmail.com",
  "gmail.fr",
  "yahoo.com",
  "yahoo.fr",
  "hotmail.com",
  "hotmail.fr",
  "outlook.com",
  "outlook.fr",
  "icloud.com",
  "live.fr",
  "live.com",
  "orange.fr",
  "wanadoo.fr",
  "free.fr",
  "sfr.fr",
  "laposte.net",
  "bbox.fr",
  "numericable.fr",
  "proton.me",
  "protonmail.com",
]);

const ALLOWED_THIRD_PARTY_DOMAINS = new Set(["simplebo.fr"]);

// ─── Types ────────────────────────────────────────────────────────────────────

type ProspectRow = {
  id: string;
  organization_name: string | null;
  email: string | null;
  email_found: string | null;
  website: string | null;
  website_found: string | null;
  first_email_status: string | null;
  workflow_status: string | null;
  prospect_type: string | null;
  created_at: string | null;
  enriched_at: string | null;
  auto_send_allowed: boolean | null;
  needs_human_validation: boolean | null;
  manual_review_needed: boolean | null;
  last_contact_at: string | null;
  source: string | null;
  enrichment_status: string | null;
};

type CandidateProspect = ProspectRow & {
  cleaned_email: string;
  email_warning: string | null;
};

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomDelay(): number {
  return MIN_DELAY_MS + Math.floor(Math.random() * MAX_EXTRA_DELAY_MS);
}

function cleanEmail(rawEmail: string | null | undefined): string {
  if (!rawEmail) return "";

  let value = rawEmail.trim().toLowerCase();

  try {
    value = decodeURIComponent(value);
  } catch {
    // Si la chaîne est mal encodée, on garde la valeur brute.
  }

  value = value.replace(/^mailto:/i, "");
  value = value.replace(/\s+/g, "");
  value = value.replace(/[<>]/g, "");

  // Cas fréquents : email suivi d'un point, d'une virgule ou d'un point-virgule
  value = value.replace(/[.,;:]+$/g, "");

  return value;
}

function extractDomainFromEmail(email: string): string {
  const cleaned = cleanEmail(email);
  return cleaned.split("@")[1]?.trim().toLowerCase() ?? "";
}

function extractDomainFromWebsite(website: string | null | undefined): string {
  if (!website) return "";

  try {
    const value = website.trim();
    const url = value.startsWith("http") ? value : `https://${value}`;
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function getRootLabel(domain: string): string {
  if (!domain) return "";

  const parts = domain.split(".").filter(Boolean);
  if (parts.length < 2) return domain;

  return parts[parts.length - 2] ?? domain;
}

function normalizeBrandToken(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function areDomainsCompatible(
  emailDomain: string,
  websiteDomain: string,
): boolean {
  if (!emailDomain) return false;
  if (!websiteDomain) return true;

  if (ALLOWED_GENERIC_PROVIDERS.has(emailDomain)) return true;
  if (ALLOWED_THIRD_PARTY_DOMAINS.has(emailDomain)) return true;

  if (
    emailDomain === websiteDomain ||
    emailDomain.endsWith(`.${websiteDomain}`) ||
    websiteDomain.endsWith(`.${emailDomain}`)
  ) {
    return true;
  }

  const emailRoot = normalizeBrandToken(getRootLabel(emailDomain));
  const websiteRoot = normalizeBrandToken(getRootLabel(websiteDomain));

  if (!emailRoot || !websiteRoot) return false;
  if (emailRoot === websiteRoot) return true;

  if (emailRoot.includes(websiteRoot) || websiteRoot.includes(emailRoot)) {
    return true;
  }

  return false;
}

// ─── Validation email ─────────────────────────────────────────────────────────

function validateEmailForSending(
  email: string,
  websiteFound?: string | null,
  website?: string | null,
): {
  sendable: boolean;
  reason?: string;
  cleanedEmail?: string;
  warning?: string;
} {
  const normalized = cleanEmail(email);
  const domain = extractDomainFromEmail(normalized);

  if (!normalized || !normalized.includes("@") || !domain) {
    return { sendable: false, reason: "email invalide" };
  }

  const basicEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

  if (!basicEmailRegex.test(normalized)) {
    return { sendable: false, reason: "email invalide" };
  }

  if (BLOCKED_EXACT_DOMAINS.has(domain)) {
    return {
      sendable: false,
      reason: `domaine bloqué (${domain})`,
    };
  }

  if (BLOCKED_PLATFORM_DOMAINS.has(domain)) {
    return {
      sendable: false,
      reason: `plateforme bloquée (${domain})`,
    };
  }

  if (
    /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js)$/i.test(normalized) ||
    /@\d+x\./i.test(normalized)
  ) {
    return {
      sendable: false,
      reason: "email manifestement parasité",
    };
  }

  if (/\.edu$/i.test(domain)) {
    return {
      sendable: false,
      reason: `domaine académique suspect (${domain})`,
    };
  }

  const referenceWebsiteDomain =
    extractDomainFromWebsite(websiteFound) || extractDomainFromWebsite(website);

  if (referenceWebsiteDomain) {
    const compatible = areDomainsCompatible(domain, referenceWebsiteDomain);

    if (!compatible) {
      return {
        sendable: true,
        cleanedEmail: normalized,
        warning: `domaine différent du site (${domain} vs ${referenceWebsiteDomain})`,
      };
    }
  }

  return {
    sendable: true,
    cleanedEmail: normalized,
  };
}

// ─── Cleanup des "sending" orphelins ──────────────────────────────────────────

async function cleanupStaleSending(): Promise<void> {
  const cutoff = new Date(Date.now() - SENDING_TIMEOUT_MS).toISOString();

  const { data, error } = await supabase
    .from("prospects")
    .update({ first_email_status: "failed" })
    .eq("source", "selion_1_nda")
    .eq("first_email_status", "sending")
    .lt("updated_at", cutoff)
    .select("id, organization_name");

  if (error) {
    console.error("cleanupStaleSending erreur :", error.message);
    return;
  }

  if (data && data.length > 0) {
    console.log(
      `Cleanup sending orphelins : ${data.length} prospect(s) repassés à "failed"`,
      data.map((p) => p.organization_name ?? p.id),
    );
  }
}

// ─── Claim prospect ───────────────────────────────────────────────────────────

async function claimForSending(prospectId: string): Promise<boolean> {
  const { data: currentRow, error: readError } = await supabase
    .from("prospects")
    .select("first_email_status")
    .eq("id", prospectId)
    .single();

  if (readError) {
    throw new Error(
      `claimForSending lecture erreur pour ${prospectId}: ${readError.message}`,
    );
  }

  const currentStatus = currentRow?.first_email_status ?? null;

  const allowed =
    currentStatus === null ||
    currentStatus === "not_sent" ||
    currentStatus === "failed";

  if (!allowed) {
    return false;
  }

  let updateQuery = supabase
    .from("prospects")
    .update({ first_email_status: "sending" })
    .eq("id", prospectId);

  if (currentStatus === null) {
    updateQuery = updateQuery.is("first_email_status", null);
  } else {
    updateQuery = updateQuery.eq("first_email_status", currentStatus);
  }

  const { data: updatedRows, error: updateError } =
    await updateQuery.select("id");

  if (updateError) {
    throw new Error(
      `claimForSending update erreur pour ${prospectId}: ${updateError.message}`,
    );
  }

  return (updatedRows?.length ?? 0) > 0;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Envoi des premiers emails — démarrage");

  if (!canSendOutboundEmails()) {
    console.log("Outbound emails disabled, skipping send");
    return;
  }

  await cleanupStaleSending();

  const { data: prospects, error } = await supabase
    .from("prospects")
    .select(
      "id, organization_name, email, email_found, website, website_found, first_email_status, workflow_status, prospect_type, created_at, enriched_at, auto_send_allowed, needs_human_validation, manual_review_needed, last_contact_at, source, enrichment_status",
    )
    .eq("is_visible", true)
    .eq("source", "selion_1_nda")
    .eq("prospect_type", "nouvel_entrant")
    .eq("auto_send_allowed", true)
    .eq("needs_human_validation", false)
    .eq("manual_review_needed", false)
    .eq("enrichment_status", "enriched")
    .is("last_contact_at", null)
    .or(
      "first_email_status.is.null,first_email_status.eq.not_sent,first_email_status.eq.failed",
    )
    .order("enriched_at", { ascending: true, nullsFirst: false })
    .limit(FETCH_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  const fetchedProspects = (prospects ?? []) as ProspectRow[];

  const candidates: CandidateProspect[] = [];

  for (const prospect of fetchedProspects) {
    const rawEmail = prospect.email_found || prospect.email;

    if (!rawEmail) {
      continue;
    }

    const check = validateEmailForSending(
      rawEmail,
      prospect.website_found,
      prospect.website,
    );

    if (!check.sendable) {
      console.log(
        `Email exclu → ${
          prospect.organization_name || "Prospect"
        } <${rawEmail}> | raison: ${check.reason}`,
      );
      continue;
    }

    if (check.warning) {
      console.log(
        `Email conservé avec alerte → ${
          prospect.organization_name || "Prospect"
        } <${check.cleanedEmail}> | ${check.warning}`,
      );
    }

    candidates.push({
      ...prospect,
      cleaned_email: check.cleanedEmail ?? cleanEmail(rawEmail),
      email_warning: check.warning ?? null,
    });

    if (candidates.length >= DAILY_SEND_LIMIT) {
      break;
    }
  }

  console.log(`Prospects récupérés : ${fetchedProspects.length}`);
  console.log(`Prospects à contacter : ${candidates.length}`);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const prospect of candidates) {
    const email = prospect.cleaned_email;
    if (!email) continue;

    const label = prospect.organization_name || "Prospect";

    try {
      console.log(`Préparation envoi → ${label} <${email}>`);

      if (!canSendOutboundEmails()) {
        console.log(`EMAIL BLOQUÉ (mode test) → ${label} <${email}>`);
        skipped++;
        continue;
      }

      const claimed = await claimForSending(prospect.id);

      if (!claimed) {
        console.log(`Skipped (déjà en cours d'envoi) → ${label}`);
        skipped++;
        continue;
      }

      await sendProspectQuestionnaireEmail({
        to: email,
        organizationName: prospect.organization_name,
        prospectId: prospect.id,
      });

      const now = new Date().toISOString();

      const followupDate = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1_000,
      ).toISOString();

      const { error: updateError } = await supabase
        .from("prospects")
        .update({
          first_email_status: "sent",
          first_outreach_sent_at: now,
          questionnaire_status: "sent",
          questionnaire_last_sent_at: now,
          last_contact_at: now,
          next_followup_due_at: followupDate,
          workflow_status: "questionnaire_sent",
          status: "contacted",
        })
        .eq("id", prospect.id);

      if (updateError) {
        console.error(
          `Erreur mise à jour post-envoi pour ${label}: ${updateError.message}`,
        );
      }

      const questionnaireLink = `https://tally.so/r/9q11o1?prospect_id=${prospect.id}`;

      const { error: logError } = await supabase
        .from("prospect_messages")
        .insert({
          prospect_id: prospect.id,
          channel: "email",
          direction: "outbound",
          message_type: "first_questionnaire_email",
          subject: "Préparer la suite après votre NDA",
          body: `Mail automatique envoyé. Proposition : rendez-vous ou auto-audit Qualiopi. Lien questionnaire historique : ${questionnaireLink}`,
          delivery_status: "sent",
          auto_generated: true,
          human_validated: false,
          validation_required: false,
          metadata: {
            cleaned_email: email,
            email_warning: prospect.email_warning,
          },
        });

      if (logError) {
        console.error("Erreur log prospect_messages :", logError.message);
      }

      sent++;
      console.log(`Envoyé ✓ → ${label} <${email}>`);

      const delay = getRandomDelay();
      console.log(`Pause : ${delay} ms`);
      await sleep(delay);
    } catch (err) {
      failed++;

      const message = err instanceof Error ? err.message : String(err);

      console.error(`Erreur envoi ${email}: ${message}`);

      await supabase
        .from("prospects")
        .update({ first_email_status: "failed" })
        .eq("id", prospect.id);
    }
  }

  console.log(
    `Envoi des premiers emails — terminé | envoyés: ${sent}, skipped: ${skipped}, erreurs: ${failed}`,
  );
}

main().catch((error) => {
  console.error("Erreur globale :", error);
  process.exit(1);
});
