import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { sendProspectFollowupEmail } from "../src/lib/email";

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

/** Délai minimum entre deux relances : 7 jours après le dernier envoi questionnaire */
const FOLLOWUP_DELAY_DAYS = 7;

/** Délai anti-spam entre deux envois (2 à 4 minutes, aléatoire) */
const MIN_DELAY_MS = 120_000;
const MAX_EXTRA_DELAY_MS = 120_000;

/**
 * Un prospect resté à "sending_followup" depuis plus de SENDING_TIMEOUT_MS
 * est considéré comme un crash → repassé à "failed" pour retry.
 */
const SENDING_TIMEOUT_MS = 15 * 60 * 1_000; // 15 minutes

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomDelay(): number {
  return MIN_DELAY_MS + Math.floor(Math.random() * MAX_EXTRA_DELAY_MS);
}

/**
 * Calcule la date seuil au-delà de laquelle un prospect peut être relancé.
 * Utilise Date + soustraction en ms — pas de concaténation de chaîne ISO.
 */
function getFollowupCutoff(): string {
  return new Date(
    Date.now() - FOLLOWUP_DELAY_DAYS * 24 * 60 * 60 * 1_000,
  ).toISOString();
}

// ─── Cleanup des "sending_followup" orphelins ─────────────────────────────────

/**
 * Repasse à "failed" les prospects coincés en statut "sending_followup"
 * depuis plus de SENDING_TIMEOUT_MS (crash entre claim et confirmation).
 */
async function cleanupStaleSendingFollowup(): Promise<void> {
  const cutoff = new Date(Date.now() - SENDING_TIMEOUT_MS).toISOString();

  const { data, error } = await supabase
    .from("prospects")
    .update({ followup_email_status: "failed" })
    .eq("source", "selion_1_nda")
    .eq("followup_email_status", "sending_followup")
    .lt("updated_at", cutoff)
    .select("id, organization_name");

  if (error) {
    console.error("cleanupStaleSendingFollowup erreur :", error.message);
    return;
  }

  if (data && data.length > 0) {
    console.log(
      `Cleanup followup orphelins : ${data.length} prospect(s) repassés à "failed"`,
      data.map((p) => p.organization_name ?? p.id),
    );
  }
}

// ─── Claim prospect pour relance (test-and-set) ───────────────────────────────

/**
 * Réserve atomiquement le prospect pour cet envoi de relance.
 * Si un autre run a déjà pris ce prospect (statut != null/failed),
 * la mise à jour touche 0 lignes → retourne false → on saute.
 */
async function claimForFollowup(prospectId: string): Promise<boolean> {
  const { data: currentRow, error: readError } = await supabase
    .from("prospects")
    .select("followup_email_status")
    .eq("id", prospectId)
    .single();

  if (readError) {
    throw new Error(
      `claimForFollowup lecture erreur pour ${prospectId}: ${readError.message}`,
    );
  }

  const currentStatus = currentRow?.followup_email_status ?? null;

  const allowed =
    currentStatus === null ||
    currentStatus === "not_sent" ||
    currentStatus === "failed";

  if (!allowed) {
    return false;
  }

  let updateQuery = supabase
    .from("prospects")
    .update({ followup_email_status: "sending_followup" })
    .eq("id", prospectId);

  if (currentStatus === null) {
    updateQuery = updateQuery.is("followup_email_status", null);
  } else {
    updateQuery = updateQuery.eq("followup_email_status", currentStatus);
  }

  const { data: updatedRows, error: updateError } =
    await updateQuery.select("id");

  if (updateError) {
    throw new Error(
      `claimForFollowup update erreur pour ${prospectId}: ${updateError.message}`,
    );
  }

  return (updatedRows?.length ?? 0) > 0;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Robot relance prospects — démarrage");

  // ── 1. Cleanup des "sending_followup" orphelins ───────────────────────────
  await cleanupStaleSendingFollowup();

  // ── 2. Calcul du seuil de 7 jours ────────────────────────────────────────
  // On utilise Date.now() - N jours en ms, pas new Date().setDate()
  // ni concaténation de chaîne ISO avec timezone hardcodée.
  const followupCutoff = getFollowupCutoff();
  console.log(`Seuil relance (questionnaire envoyé avant) : ${followupCutoff}`);

  // ── 3. Récupération des prospects éligibles ───────────────────────────────
  const { data: prospects, error } = await supabase
    .from("prospects")
    .select(
      "id, organization_name, email, email_found, questionnaire_status, questionnaire_last_sent_at, followup_email_status, questionnaire_completed_at",
    )
    .eq("source", "selion_1_nda")
    .eq("is_visible", true)
    .eq("auto_send_allowed", true)
    .eq("needs_human_validation", false)
    .eq("manual_review_needed", false)
    .eq("questionnaire_status", "sent")
    .is("questionnaire_completed_at", null)
    .or(
      "followup_email_status.is.null,followup_email_status.eq.failed,followup_email_status.eq.not_sent",
    )
    .lt("questionnaire_last_sent_at", followupCutoff)
    .order("questionnaire_last_sent_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const candidates = (prospects ?? []).filter((p) => {
    const email = p.email_found || p.email;
    if (!email) {
      console.log(`Skipped (pas d'email) → ${p.organization_name ?? p.id}`);
      return false;
    }
    return true;
  });

  if (candidates.length === 0) {
    console.log("Aucun prospect à relancer.");
    return;
  }

  console.log(`Prospects à relancer : ${candidates.length}`);

  // ── 4. Envoi des relances ─────────────────────────────────────────────────

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const prospect of candidates) {
    const email = prospect.email_found || prospect.email;
    if (!email) continue;

    const label = prospect.organization_name ?? prospect.id;

    try {
      console.log(`Relance → ${label} <${email}>`);

      if (!EMAIL_SENDING_ENABLED) {
        // Dry-run : pas de touche DB, juste le log
        console.log(`EMAIL BLOQUÉ (mode test) → ${label}`);
        skipped++;
        continue;
      }

      // ── Test-and-set : réserver ce prospect pour cet envoi ────────────────
      const claimed = await claimForFollowup(prospect.id);
      if (!claimed) {
        console.log(`Skipped (déjà en cours d'envoi) → ${label}`);
        skipped++;
        continue;
      }

      // ── Envoi effectif ────────────────────────────────────────────────────
      await sendProspectFollowupEmail({
        to: email,
        organizationName: prospect.organization_name,
        prospectId: prospect.id,
      });

      // ── Mise à jour statut post-envoi ─────────────────────────────────────
      const { error: updateError } = await supabase
        .from("prospects")
        .update({
          followup_email_status: "sent",
          followup_sent_at: new Date().toISOString(),
          last_contact_at: new Date().toISOString(),
        })
        .eq("id", prospect.id);

      if (updateError) {
        console.error(
          `Erreur mise à jour post-relance pour ${label}: ${updateError.message}`,
        );
      }

      sent++;
      console.log(`Relance envoyée ✓ → ${label}`);

      // ── Délai anti-spam ───────────────────────────────────────────────────
      const delay = getRandomDelay();
      console.log(`Pause : ${delay} ms`);
      await sleep(delay);
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Erreur relance ${email}: ${message}`);

      // Repasse à "failed" pour retry au prochain run
      await supabase
        .from("prospects")
        .update({ followup_email_status: "failed" })
        .eq("id", prospect.id);
    }
  }

  console.log(
    `Robot relance terminé | envoyés: ${sent}, skipped: ${skipped}, erreurs: ${failed}`,
  );
}

main().catch((error) => {
  console.error("Erreur globale relance :", error);
  process.exit(1);
});
