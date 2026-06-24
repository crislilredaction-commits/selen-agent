import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

// ─── Supabase ─────────────────────────────────────────────────────────────────

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
 * Sécurité :
 * Tant que SELION_PURGE_ENABLED n'est pas explicitement à "true",
 * le script analyse et logue, mais ne masque rien.
 */
const SELION_PURGE_ENABLED = process.env.SELION_PURGE_ENABLED === "true";

/**
 * Nombre maximum de prospects à analyser par run.
 * Évite de faire travailler trop lourdement Supabase.
 */
const FETCH_LIMIT = 2_000;

/**
 * Taille des batchs pour les UPDATE.
 */
const PURGE_BATCH_SIZE = 250;

/**
 * On ne masque pas les no_result récents.
 * Cela laisse une chance aux autres scripts / corrections / enrichissements futurs.
 */
const MIN_AGE_DAYS_BEFORE_HIDE = 7;

// ─── Types ────────────────────────────────────────────────────────────────────

type ProspectToPurge = {
  id: string;
  organization_name: string | null;
  email: string | null;
  email_found: string | null;
  enrichment_status: string | null;
  created_at: string | null;
  updated_at: string | null;
  first_email_status: string | null;
  workflow_status: string | null;
  status: string | null;
  last_contact_at: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim() === "";
}

function getCutoffIso(): string {
  const cutoff = new Date(
    Date.now() - MIN_AGE_DAYS_BEFORE_HIDE * 24 * 60 * 60 * 1_000,
  );

  return cutoff.toISOString();
}

/**
 * Nouvelle logique prudente :
 *
 * On masque uniquement les prospects :
 * - visibles ;
 * - source Sélion NDA ;
 * - sans email dans email_found ET email ;
 * - enrichment_status = "no_result" ;
 * - anciens de plus de 7 jours ;
 * - jamais contactés ;
 * - sans workflow métier actif.
 *
 * On ne masque PLUS "enriched" sans email.
 */
function shouldHideProspect(prospect: ProspectToPurge): boolean {
  const hasEmail = !isBlank(prospect.email_found) || !isBlank(prospect.email);

  if (hasEmail) return false;

  if (prospect.enrichment_status !== "no_result") {
    return false;
  }

  if (!isBlank(prospect.last_contact_at)) {
    return false;
  }

  if (!isBlank(prospect.first_email_status)) {
    return false;
  }

  const workflowStatus = prospect.workflow_status ?? "";
  const globalStatus = prospect.status ?? "";

  const hasActiveWorkflow =
    workflowStatus === "questionnaire_sent" ||
    workflowStatus === "questionnaire_completed" ||
    workflowStatus === "meeting_booked" ||
    globalStatus === "contacted" ||
    globalStatus === "replied" ||
    globalStatus === "qualified";

  if (hasActiveWorkflow) return false;

  return true;
}

// ─── Fetch candidats ──────────────────────────────────────────────────────────

async function fetchPurgeCandidates(): Promise<ProspectToPurge[]> {
  const cutoffIso = getCutoffIso();

  const { data, error } = await supabase
    .from("prospects")
    .select(
      "id, organization_name, email, email_found, enrichment_status, created_at, updated_at, first_email_status, workflow_status, status, last_contact_at",
    )
    .eq("is_visible", true)
    .eq("source", "selion_1_nda")
    .eq("enrichment_status", "no_result")
    .is("email_found", null)
    .lt("updated_at", cutoffIso)
    .order("updated_at", { ascending: true })
    .limit(FETCH_LIMIT);

  if (error) {
    throw new Error(`fetchPurgeCandidates: ${error.message}`);
  }

  return (data ?? []) as ProspectToPurge[];
}

// ─── Masquage en batch ────────────────────────────────────────────────────────

async function hideProspectsBatch(ids: string[]): Promise<number> {
  let hidden = 0;

  for (let i = 0; i < ids.length; i += PURGE_BATCH_SIZE) {
    const batch = ids.slice(i, i + PURGE_BATCH_SIZE);

    const { data, error } = await supabase
      .from("prospects")
      .update({
        is_visible: false,
      })
      .in("id", batch)
      .eq("is_visible", true)
      .select("id");

    if (error) {
      console.error(
        `hideProspectsBatch erreur batch ${i}-${i + batch.length}: ${error.message}`,
      );
      continue;
    }

    hidden += data?.length ?? 0;

    console.log(
      `Masqués : ${Math.min(i + batch.length, ids.length)} / ${ids.length} (réels: ${hidden})`,
    );
  }

  return hidden;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Purge prudente prospects — démarrage");
  console.log(
    `SELION_PURGE_ENABLED = ${SELION_PURGE_ENABLED ? "true" : "false"}`,
  );

  const rawCandidates = await fetchPurgeCandidates();

  console.log(`Candidats récupérés : ${rawCandidates.length}`);

  const toHide = rawCandidates.filter(shouldHideProspect);

  console.log(`Prospects masquables après filtre prudent : ${toHide.length}`);

  const sample = toHide.slice(0, 10).map((p) => ({
    id: p.id,
    name: p.organization_name,
    enrichment_status: p.enrichment_status,
    updated_at: p.updated_at,
  }));

  const { error: logError } = await supabase.from("robot_logs").insert({
    run_type: "purge",
    level: "info",
    message: SELION_PURGE_ENABLED
      ? `Purge prudente : ${toHide.length} prospect(s) à masquer`
      : `Purge prudente en mode simulation : ${toHide.length} prospect(s) seraient masqués`,
    details: {
      purge_enabled: SELION_PURGE_ENABLED,
      fetched: rawCandidates.length,
      to_hide: toHide.length,
      min_age_days: MIN_AGE_DAYS_BEFORE_HIDE,
      rule: "hide only old no_result without email and without active workflow",
      sample,
    },
  });

  if (logError) {
    console.error("Erreur log purge :", logError.message);
  }

  if (toHide.length === 0) {
    console.log("Aucun prospect à masquer.");
    return;
  }

  if (!SELION_PURGE_ENABLED) {
    console.log(
      "Mode simulation : aucun prospect masque. Pour activer, ajouter SELION_PURGE_ENABLED=true dans .env.local",
    );
    return;
  }

  const ids = toHide.map((p) => p.id);
  const hidden = await hideProspectsBatch(ids);

  const { error: logFinalError } = await supabase.from("robot_logs").insert({
    run_type: "purge",
    level: "info",
    message: `Purge prudente terminée : ${hidden} prospect(s) masqués sur ${toHide.length} candidats`,
    details: {
      candidates: toHide.length,
      hidden,
      purge_enabled: SELION_PURGE_ENABLED,
    },
  });

  if (logFinalError) {
    console.error("Erreur log purge final :", logFinalError.message);
  }

  console.log(
    `Purge prudente terminée | candidats: ${toHide.length}, masqués: ${hidden}`,
  );
}

main().catch((error) => {
  console.error("Erreur globale purge :", error);
  process.exit(1);
});
