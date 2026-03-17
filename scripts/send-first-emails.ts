import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { sendProspectQuestionnaireEmail } from "../src/lib/email";

// ─── Env ──────────────────────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant`);
  return value;
}

const EMAIL_SENDING_ENABLED = process.env.EMAIL_SENDING_ENABLED === "true";

const supabase = createClient(
  getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
);

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Nombre maximum d'emails envoyés par run.
 * On ne filtre plus par date de création — cette limite journalière
 * est le seul régulateur de débit.
 */
const DAILY_SEND_LIMIT = 20;

const MIN_DELAY_MS = 2_000;
const MAX_EXTRA_DELAY_MS = 3_000;

/**
 * Un prospect resté à "sending" depuis plus de SENDING_TIMEOUT_MS est
 * considéré comme un crash (le process a été tué entre markSending et
 * l'écriture du statut "sent"). On le repasse à "failed" pour retry.
 */
const SENDING_TIMEOUT_MS = 15 * 60 * 1_000; // 15 minutes

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomDelay(): number {
  return MIN_DELAY_MS + Math.floor(Math.random() * MAX_EXTRA_DELAY_MS);
}

function extractDomainFromEmail(email: string): string {
  return email.split("@")[1]?.trim().toLowerCase() ?? "";
}

function extractDomainFromWebsite(website: string | null | undefined): string {
  if (!website) return "";
  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

// ─── Validation email ─────────────────────────────────────────────────────────

function isSuspiciousEmail(
  email: string,
  websiteFound?: string | null,
  website?: string | null,
): { suspicious: boolean; reason?: string } {
  const normalized = email.trim().toLowerCase();
  const domain = extractDomainFromEmail(normalized);

  if (!normalized.includes("@") || !domain) {
    return { suspicious: true, reason: "email invalide" };
  }

  const blockedExactDomains = new Set([
    "dataprospects.fr",
    "example.com",
    "domain.com",
    "email.com",
  ]);

  if (blockedExactDomains.has(domain)) {
    return { suspicious: true, reason: `domaine bloqué (${domain})` };
  }

  if (
    /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js)$/i.test(normalized) ||
    /@\d+x\./i.test(normalized)
  ) {
    return { suspicious: true, reason: "email manifestement parasité" };
  }

  if (/\.(edu)$/i.test(domain)) {
    return {
      suspicious: true,
      reason: `domaine académique suspect (${domain})`,
    };
  }

  const referenceWebsiteDomain =
    extractDomainFromWebsite(websiteFound) || extractDomainFromWebsite(website);

  if (referenceWebsiteDomain) {
    const sameDomain =
      domain === referenceWebsiteDomain ||
      domain.endsWith(`.${referenceWebsiteDomain}`) ||
      referenceWebsiteDomain.endsWith(`.${domain}`);

    const isGenericProvider =
      /(gmail\.com|yahoo\.com|hotmail\.com|outlook\.com|icloud\.com|live\.fr|live\.com)$/i.test(
        domain,
      );

    // Email sur un domaine tiers non-générique et différent du site → suspect
    if (!sameDomain && !isGenericProvider) {
      return {
        suspicious: true,
        reason: `domaine incohérent avec le site (${domain} vs ${referenceWebsiteDomain})`,
      };
    }
  }

  return { suspicious: false };
}

// ─── Cleanup des "sending" orphelins ─────────────────────────────────────────

/**
 * Repasse à "failed" les prospects coincés en statut "sending" depuis
 * plus de SENDING_TIMEOUT_MS.
 *
 * Cas couvert : process tué entre le markSending et l'écriture du "sent".
 * Sans ce cleanup, ces prospects resteraient bloqués indéfiniment car ils
 * ne correspondent plus aux filtres de sélection (null / not_sent / failed).
 */
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

// ─── Claim prospect (test-and-set) ───────────────────────────────────────────

/**
 * Réserve atomiquement un prospect pour cet envoi en passant son statut
 * à "sending". La condition sur les statuts éligibles est un test-and-set :
 * si un autre run a déjà pris ce prospect, la mise à jour touche 0 lignes
 * et on retourne false → on saute ce prospect.
 *
 * Garantit qu'un même email n'est jamais envoyé deux fois en parallèle.
 */
async function claimForSending(prospectId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("prospects")
    .update({ first_email_status: "sending" })
    .eq("id", prospectId)
    .or(
      "first_email_status.is.null,first_email_status.eq.not_sent,first_email_status.eq.failed",
    )
    .select("id");

  if (error) {
    console.error(`claimForSending erreur pour ${prospectId}:`, error.message);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Envoi des premiers emails — démarrage");

  // ── 1. Cleanup des "sending" orphelins ────────────────────────────────────
  await cleanupStaleSending();

  // ── 2. Récupération des prospects éligibles ───────────────────────────────
  //
  // CORRECTIF PRINCIPAL : suppression du filtre .gte("created_at", today).
  // Ce qui pilote l'éligibilité c'est uniquement l'état du prospect,
  // pas sa date de création. Cela permet de traiter le backlog (prospects
  // enrichis hier soir, après un run raté, etc.).
  //
  // On inclut "failed" dans les statuts récupérables pour le retry,
  // et on ne filtre plus sur "sending" (géré par le cleanup ci-dessus).

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
    .limit(DAILY_SEND_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  // ── 3. Filtrage email valide + non-suspect ────────────────────────────────

  const candidates = (prospects ?? []).filter((p) => {
    const email = p.email_found || p.email;
    if (!email) return false;

    const check = isSuspiciousEmail(email, p.website_found, p.website);

    if (check.suspicious) {
      console.log(
        `Email exclu → ${p.organization_name || "Prospect"} <${email}> | raison: ${check.reason}`,
      );
      return false;
    }

    return true;
  });

  console.log(`Prospects récupérés : ${(prospects ?? []).length}`);
  console.log(`Prospects à contacter : ${candidates.length}`);

  // ── 4. Envoi ──────────────────────────────────────────────────────────────

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const prospect of candidates) {
    const email = prospect.email_found || prospect.email;
    if (!email) continue;

    const label = prospect.organization_name || "Prospect";

    try {
      console.log(`Préparation envoi → ${label} <${email}>`);

      if (!EMAIL_SENDING_ENABLED) {
        // Mode dry-run : on ne touche pas à la DB, on simule juste le log
        console.log(`EMAIL BLOQUÉ (mode test) → ${label} <${email}>`);
        skipped++;
        continue;
      }

      // ── Test-and-set : réserver ce prospect pour cet envoi ────────────────
      // Si retourne false → un autre run l'a déjà pris → on saute
      const claimed = await claimForSending(prospect.id);
      if (!claimed) {
        console.log(`Skipped (déjà en cours d'envoi) → ${label}`);
        skipped++;
        continue;
      }

      // ── Envoi effectif ────────────────────────────────────────────────────
      await sendProspectQuestionnaireEmail({
        to: email,
        organizationName: prospect.organization_name,
        prospectId: prospect.id,
      });

      // ── Mise à jour statut post-envoi ─────────────────────────────────────
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
        // L'email est parti mais la DB n'a pas été mise à jour.
        // On log l'erreur mais on ne lève pas d'exception pour ne pas
        // masquer l'envoi réussi dans les stats.
        console.error(
          `Erreur mise à jour post-envoi pour ${label}: ${updateError.message}`,
        );
      }

      // ── Log dans prospect_messages ────────────────────────────────────────
      const questionnaireLink = `https://tally.so/r/9q11o1?prospect_id=${prospect.id}`;

      const { error: logError } = await supabase
        .from("prospect_messages")
        .insert({
          prospect_id: prospect.id,
          channel: "email",
          direction: "outbound",
          message_type: "first_questionnaire_email",
          subject: "Félicitations pour votre NDA ✨",
          body: `Mail automatique envoyé avec lien questionnaire : ${questionnaireLink}`,
          delivery_status: "sent",
          auto_generated: true,
          human_validated: false,
          validation_required: false,
        });

      if (logError) {
        console.error("Erreur log prospect_messages :", logError.message);
      }

      sent++;
      console.log(`Envoyé ✓ → ${label} <${email}>`);

      // ── Délai anti-spam entre envois ──────────────────────────────────────
      const delay = getRandomDelay();
      console.log(`Pause : ${delay} ms`);
      await sleep(delay);
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Erreur envoi ${email}: ${message}`);

      // Repasse à "failed" pour retry au prochain run
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
