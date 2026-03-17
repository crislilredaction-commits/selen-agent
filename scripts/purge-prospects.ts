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
 * Taille des batchs pour les UPDATE en base.
 * Évite les requêtes trop larges sur gros volumes.
 */
const PURGE_BATCH_SIZE = 500;

// ─── Types ────────────────────────────────────────────────────────────────────

type ProspectToPurge = {
  id: string;
  organization_name: string | null;
  email: string | null;
  email_found: string | null;
  enrichment_status: string | null;
};

// ─── Logique de purge ─────────────────────────────────────────────────────────

/**
 * Retourne true si l'enrichissement est définitivement terminé
 * et que le prospect peut légitimement être masqué.
 *
 * Statuts terminaux éligibles à la purge :
 *   - "no_result"  : enrichissement terminé, aucun contact trouvé
 *   - "enriched"   : enrichissement terminé mais sans email_found
 *                    (données partielles, non utilisables pour l'envoi)
 *
 * Statuts EXCLUS de la purge (intentionnellement) :
 *   - "pending"     : pas encore enrichi → ne pas purger
 *   - "in_progress" : enrichissement en cours → ne pas purger
 *   - "error"       : erreur temporaire, sera retenté → ne pas purger
 *   - "failed"      : idem error → ne pas purger
 *   - null          : statut inconnu → ne pas purger par sécurité
 */
function isTerminalWithoutEmail(prospect: ProspectToPurge): boolean {
  const terminalStatuses = ["no_result", "enriched"];

  if (!terminalStatuses.includes(prospect.enrichment_status ?? "")) {
    return false;
  }

  const hasEmail =
    (prospect.email_found?.trim() ?? "") !== "" ||
    (prospect.email?.trim() ?? "") !== "";

  return !hasEmail;
}

// ─── Fetch paginé des candidats à la purge ───────────────────────────────────

/**
 * Récupère les prospects éligibles à la purge directement filtrés en DB.
 *
 * On délègue le filtre à Supabase plutôt que de charger tous les prospects
 * visibles en mémoire (évite le SELECT * de 150k lignes).
 *
 * Critères DB :
 *   - is_visible = true
 *   - source = "selion_1_nda"
 *   - enrichment_status IN ("no_result", "enriched")
 *   - email_found IS NULL
 *
 * Le check sur email (colonne legacy) est fait en JS après récupération
 * car la colonne peut contenir des chaînes vides plutôt que NULL.
 */
async function fetchPurgeCandidates(): Promise<ProspectToPurge[]> {
  const candidates: ProspectToPurge[] = [];
  let rangeFrom = 0;
  const PAGE_SIZE = 1_000;

  while (true) {
    const { data, error } = await supabase
      .from("prospects")
      .select("id, organization_name, email, email_found, enrichment_status")
      .eq("is_visible", true)
      .eq("source", "selion_1_nda")
      .in("enrichment_status", ["no_result", "enriched"])
      .is("email_found", null)
      .range(rangeFrom, rangeFrom + PAGE_SIZE - 1);

    if (error) throw new Error(`fetchPurgeCandidates: ${error.message}`);
    if (!data || data.length === 0) break;

    candidates.push(...(data as ProspectToPurge[]));

    console.log(
      `Candidats récupérés : ${candidates.length} (page à partir de ${rangeFrom})`,
    );

    if (data.length < PAGE_SIZE) break;
    rangeFrom += PAGE_SIZE;
  }

  return candidates;
}

// ─── Masquage en batch ────────────────────────────────────────────────────────

/**
 * Masque les prospects par batch d'IDs.
 * Beaucoup plus efficace qu'un UPDATE par prospect (une seule requête
 * par batch vs N requêtes séquentielles).
 *
 * Retourne le nombre de prospects réellement masqués.
 */
async function hideProspectsBatch(ids: string[]): Promise<number> {
  let hidden = 0;

  for (let i = 0; i < ids.length; i += PURGE_BATCH_SIZE) {
    const batch = ids.slice(i, i + PURGE_BATCH_SIZE);

    const { data, error } = await supabase
      .from("prospects")
      .update({ is_visible: false })
      .in("id", batch)
      .eq("is_visible", true) // idempotence : ne touche pas les déjà masqués
      .select("id");

    if (error) {
      console.error(
        `hideProspectsBatch erreur (batch ${i}-${i + batch.length}): ${error.message}`,
      );
      // On continue les autres batchs malgré l'erreur
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
  console.log("Purge prospects — démarrage");

  // ── 1. Récupérer les candidats éligibles (filtrés en DB) ──────────────────
  const rawCandidates = await fetchPurgeCandidates();
  console.log(`Candidats pré-filtrés (DB) : ${rawCandidates.length}`);

  // ── 2. Filtre JS complémentaire ───────────────────────────────────────────
  // Couvre le cas des colonnes email legacy avec chaîne vide au lieu de NULL.
  const toHide = rawCandidates.filter(isTerminalWithoutEmail);

  console.log(`Prospects à masquer (après filtre JS) : ${toHide.length}`);

  if (toHide.length === 0) {
    console.log("Aucun prospect à masquer.");
    return;
  }

  // ── 3. Log récapitulatif avant masquage ───────────────────────────────────
  // Un seul log pour N prospects — évite N×2 requêtes séquentielles.
  const { error: logError } = await supabase.from("robot_logs").insert({
    run_type: "purge",
    level: "info",
    message: `Purge : ${toHide.length} prospect(s) à masquer (sans email, enrichissement terminal)`,
    details: {
      count: toHide.length,
      statuses: [...new Set(toHide.map((p) => p.enrichment_status))],
      sample_ids: toHide.slice(0, 10).map((p) => ({
        id: p.id,
        name: p.organization_name,
        status: p.enrichment_status,
      })),
    },
  });

  if (logError) {
    console.error("Erreur log purge :", logError.message);
    // Non bloquant — on continue la purge même si le log échoue
  }

  // ── 4. Masquage en batch ──────────────────────────────────────────────────
  const ids = toHide.map((p) => p.id);
  const hidden = await hideProspectsBatch(ids);

  // ── 5. Log final ──────────────────────────────────────────────────────────
  const { error: logFinalError } = await supabase.from("robot_logs").insert({
    run_type: "purge",
    level: "info",
    message: `Purge terminée : ${hidden} prospect(s) masqués sur ${toHide.length} candidats`,
    details: {
      candidates: toHide.length,
      hidden,
    },
  });

  if (logFinalError) {
    console.error("Erreur log purge final :", logFinalError.message);
  }

  console.log(
    `Purge prospects — terminée | candidats: ${toHide.length}, masqués: ${hidden}`,
  );
}

main().catch((error) => {
  console.error("Erreur globale purge :", error);
  process.exit(1);
});
