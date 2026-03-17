import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";

// ─── Env ──────────────────────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant`);
  return value;
}

const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const NDA_CSV_URL = getRequiredEnv("NDA_CSV_URL");

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ─── Config ───────────────────────────────────────────────────────────────────

const SNAPSHOT_BATCH_SIZE = 1000;
const HISTORY_PAGE_SIZE = 1000;
const PROSPECT_BATCH_SIZE = 500;

// ─── Types ────────────────────────────────────────────────────────────────────

type CsvRow = Record<string, string>;

type SnapshotRow = {
  snapshot_date: string;
  siret: string | null;
  nda_number: string | null;
  organization_name: string;
  city: string | null;
  comparison_key: string;
  raw_json: unknown;
};

// ─── Normalisation ────────────────────────────────────────────────────────────

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function isValidOrganization(row: {
  organization_name: string;
  siret: string;
}): boolean {
  if (!row.organization_name?.trim()) return false;
  const siret = onlyDigits(row.siret);
  if (!siret || siret.length !== 14) return false;
  return true;
}

// ─── Timezone Paris ───────────────────────────────────────────────────────────

/**
 * Retourne la date courante à Paris au format YYYY-MM-DD.
 * Utilise Intl.DateTimeFormat — pas de concaténation de chaîne ISO.
 */
function getTodayParis(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function guessField(row: CsvRow, candidates: string[]): string {
  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const found = entries.find(([key]) =>
      normalizeText(key).includes(normalizeText(candidate)),
    );
    if (found) return found[1] ?? "";
  }
  return "";
}

function extractRowData(row: CsvRow) {
  const organizationName =
    guessField(row, [
      "raison sociale",
      "denomination",
      "nom organisme",
      "organisme",
    ]) || "";

  const siret =
    guessField(row, ["siret", "numero siret", "siret etablissement"]) || "";

  const city =
    guessField(row, ["ville", "commune", "localite", "adresse ville"]) || "";

  const ndaNumber =
    guessField(row, [
      "numero declaration activite",
      "nda",
      "numero nda",
      "declaration activite",
    ]) || "";

  return {
    organization_name: organizationName.trim(),
    siret: onlyDigits(siret),
    city: city.trim(),
    nda_number: onlyDigits(ndaNumber),
  };
}

function buildComparisonKey(item: {
  nda_number?: string | null;
  siret: string;
  organization_name: string;
  city: string;
}): string {
  const nda = onlyDigits(item.nda_number ?? "");
  if (nda) return `NDA:${nda}`;
  if (item.siret) return `SIRET:${item.siret}`;
  return `ORG:${normalizeText(item.organization_name)}::CITY:${normalizeText(item.city)}`;
}

// ─── Fetch CSV ────────────────────────────────────────────────────────────────

async function fetchCsvWithTimeout(
  url: string,
  timeoutMs = 60_000,
): Promise<string> {
  console.log("1. Téléchargement du CSV...");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    console.log("2. Réponse reçue :", response.status);

    if (!response.ok) {
      throw new Error(`Téléchargement CSV impossible: ${response.status}`);
    }

    const csvText = await response.text();
    console.log("3. CSV téléchargé, longueur =", csvText.length);
    return csvText;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Historique : dernier snapshot connu ─────────────────────────────────────

/**
 * Retourne la date du snapshot le plus récent ANTÉRIEUR à aujourd'hui.
 *
 * C'est le cœur du correctif : on ne compare plus sur une fenêtre fixe
 * de N jours, mais toujours contre le dernier état connu du registre.
 *
 * Avantage : si le robot est absent 4 jours (week-end, panne),
 * on compare quand même contre le bon snapshot — aucun faux positif.
 */
async function fetchLastSnapshotDate(today: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("nda_snapshots")
    .select("snapshot_date")
    .lt("snapshot_date", today)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`fetchLastSnapshotDate: ${error.message}`);
  return data?.snapshot_date ?? null;
}

/**
 * Charge toutes les comparison_key du snapshot de référence (paginé).
 * On ne charge QUE les clés — pas les colonnes larges — pour rester léger
 * même sur 150k lignes.
 */
async function fetchReferenceKeys(referenceDate: string): Promise<Set<string>> {
  const keys = new Set<string>();
  let rangeFrom = 0;

  while (true) {
    const { data, error } = await supabase
      .from("nda_snapshots")
      .select("comparison_key")
      .eq("snapshot_date", referenceDate)
      .range(rangeFrom, rangeFrom + HISTORY_PAGE_SIZE - 1);

    if (error) throw new Error(`fetchReferenceKeys: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.comparison_key) keys.add(row.comparison_key);
    }

    console.log(
      `Clés de référence chargées : ${keys.size} (page à partir de ${rangeFrom})`,
    );

    if (data.length < HISTORY_PAGE_SIZE) break;
    rangeFrom += HISTORY_PAGE_SIZE;
  }

  return keys;
}

// ─── Snapshots ────────────────────────────────────────────────────────────────

async function upsertSnapshots(rows: SnapshotRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += SNAPSHOT_BATCH_SIZE) {
    const batch = rows.slice(i, i + SNAPSHOT_BATCH_SIZE);

    const { error } = await supabase.from("nda_snapshots").upsert(batch, {
      onConflict: "snapshot_date,comparison_key",
      ignoreDuplicates: true,
    });

    if (error) throw new Error(`upsertSnapshots: ${error.message}`);

    console.log(
      `Snapshots upsertés : ${Math.min(i + batch.length, rows.length)} / ${rows.length}`,
    );
  }
}

// ─── Prospects ────────────────────────────────────────────────────────────────

/**
 * Insère les nouveaux prospects via upsert sur nda_number.
 *
 * La contrainte UNIQUE partielle sur nda_number (côté DB) garantit
 * qu'un prospect déjà existant n'est jamais dupliqué, même en cas de
 * double run ou de retry. Pas besoin de pré-charger les NDA existants
 * en mémoire — la DB fait le travail.
 *
 * Retourne le nombre de lignes réellement insérées (les ignorées ne comptent pas).
 */
async function upsertProspects(orgs: SnapshotRow[]): Promise<number> {
  let inserted = 0;

  const rows = orgs.map((org) => ({
    source: "selion_1_nda",
    organization_name: org.organization_name,
    siret: org.siret || null,
    nda_number: org.nda_number || null,
    city: org.city || null,
    status: "new",
    is_visible: true,
    enrichment_status: "pending",
  }));

  for (let i = 0; i < rows.length; i += PROSPECT_BATCH_SIZE) {
    const batch = rows.slice(i, i + PROSPECT_BATCH_SIZE);

    const { data, error } = await supabase
      .from("prospects")
      .insert(batch)
      .select("id");

    if (error) throw new Error(`upsertProspects: ${error.message}`);

    // data contient uniquement les lignes réellement insérées (pas les ignorées)
    inserted += data?.length ?? 0;

    console.log(
      `Prospects traités : ${Math.min(i + batch.length, rows.length)} / ${rows.length} (insérés : ${inserted})`,
    );
  }

  return inserted;
}

// ─── Purge anciens snapshots ──────────────────────────────────────────────────

/**
 * Conserve uniquement les 2 derniers snapshots distincts (aujourd'hui + veille).
 *
 * On détermine la seuil dynamiquement plutôt que "today - N jours"
 * pour ne pas purger accidentellement si le robot a sauté des jours.
 */
async function purgeOldSnapshots(today: string): Promise<void> {
  const { data, error } = await supabase
    .from("nda_snapshots")
    .select("snapshot_date")
    .lte("snapshot_date", today)
    .order("snapshot_date", { ascending: false });

  if (error) {
    console.error(
      "purgeOldSnapshots: impossible de lire les dates :",
      error.message,
    );
    return;
  }

  if (!data || data.length === 0) return;

  const distinctDates = [
    ...new Set(data.map((row) => row.snapshot_date).filter(Boolean)),
  ];

  if (distinctDates.length < 2) {
    return;
  }

  const oldestKept = distinctDates[1];

  const { error: deleteError } = await supabase
    .from("nda_snapshots")
    .delete()
    .lt("snapshot_date", oldestKept);

  if (deleteError) {
    console.error(
      "purgeOldSnapshots: erreur suppression :",
      deleteError.message,
    );
  } else {
    console.log(`Anciens snapshots purgés (antérieurs à ${oldestKept})`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("radar-nda.ts démarrage");

  const today = getTodayParis();

  // Créer le run d'import
  const { data: runData, error: runError } = await supabase
    .from("nda_import_runs")
    .insert({
      import_date: today,
      source_url: NDA_CSV_URL,
      file_name: `nda-${today}.csv`,
      status: "running",
    })
    .select("id")
    .single();

  if (runError || !runData) {
    throw new Error(runError?.message ?? "Impossible de créer le run d'import");
  }

  const runId = runData.id;

  try {
    // ── 1. Télécharger et parser le CSV ───────────────────────────────────────

    const csvText = await fetchCsvWithTimeout(NDA_CSV_URL);

    console.log("4. Parsing CSV...");
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      delimiter: ";",
      relax_column_count: true,
    }) as CsvRow[];

    console.log("5. CSV parsé, lignes =", records.length);

    const extracted = records
      .map(extractRowData)
      .filter((row) => isValidOrganization(row));

    console.log("6. Lignes exploitables =", extracted.length);
    if (extracted.length > 0) {
      console.log("7. Exemple ligne =", extracted[0]);
    }

    // ── 2. Déduplication mémoire intra-CSV (par comparison_key) ──────────────
    // Nécessaire pour éviter les conflits intra-batch avant l'upsert DB.

    const uniqueMap = new Map<string, SnapshotRow>();

    for (const row of extracted) {
      const comparisonKey = buildComparisonKey(row);
      if (!uniqueMap.has(comparisonKey)) {
        uniqueMap.set(comparisonKey, {
          snapshot_date: today,
          siret: row.siret || null,
          nda_number: row.nda_number || null,
          organization_name: row.organization_name,
          city: row.city || null,
          comparison_key: comparisonKey,
          raw_json: row,
        });
      }
    }

    const snapshotRows = Array.from(uniqueMap.values());
    console.log("8. Lignes uniques à snapshotter =", snapshotRows.length);

    // ── 3. Upsert snapshot du jour ────────────────────────────────────────────
    // Idempotent grâce à la contrainte UNIQUE(snapshot_date, comparison_key).

    if (snapshotRows.length > 0) {
      await upsertSnapshots(snapshotRows);
    }

    // ── 4. Trouver le snapshot de référence ───────────────────────────────────
    //
    // CORRECTIF PRINCIPAL : on cherche le dernier snapshot réellement présent
    // en base, pas "today - 3 jours".
    // → Élimine les faux positifs lors des gaps (week-end, panne, etc.)

    const referenceDate = await fetchLastSnapshotDate(today);
    console.log(
      "9. Date de référence =",
      referenceDate ?? "aucune (bootstrap)",
    );

    if (!referenceDate) {
      // Premier run : aucun historique disponible, aucun prospect créé.
      console.log(
        "10. Mode bootstrap : initialisation uniquement, aucun prospect créé.",
      );

      await supabase
        .from("nda_import_runs")
        .update({
          rows_total: extracted.length,
          rows_new: 0,
          status: "success",
        })
        .eq("id", runId);

      await supabase.from("robot_logs").insert({
        run_type: "nda_import",
        level: "info",
        message: `Initialisation NDA : ${extracted.length} lignes snapshotées, aucun prospect créé.`,
        details: {
          import_date: today,
          total: extracted.length,
          bootstrap: true,
        },
      });

      await purgeOldSnapshots(today);
      console.log("Import bootstrap OK.");
      return;
    }

    // ── 5. Charger les comparison_key du snapshot de référence ────────────────

    console.log(`10. Chargement des clés du snapshot ${referenceDate}...`);
    const referenceKeys = await fetchReferenceKeys(referenceDate);
    console.log("11. Clés de référence =", referenceKeys.size);

    // ── 6. Détecter les nouveaux OF ───────────────────────────────────────────
    // Un OF est "nouveau" si sa comparison_key est absente du snapshot de référence.
    // La comparison_key encode déjà la hiérarchie NDA > SIRET > ORG+CITY,
    // donc une seule comparaison suffit.

    const newOrganizations = snapshotRows.filter(
      (row) => !referenceKeys.has(row.comparison_key),
    );

    console.log("12. Nouveaux OF détectés =", newOrganizations.length);

    // ── 7. Insérer les prospects (upsert safe sur nda_number) ─────────────────

    let rowsNew = 0;

    if (newOrganizations.length > 0) {
      rowsNew = await upsertProspects(newOrganizations);
    }

    console.log("13. Prospects réellement insérés =", rowsNew);

    // ── 8. Purger les anciens snapshots ───────────────────────────────────────

    await purgeOldSnapshots(today);

    // ── 9. Finaliser le run ───────────────────────────────────────────────────

    await supabase
      .from("nda_import_runs")
      .update({
        rows_total: extracted.length,
        rows_new: rowsNew,
        status: "success",
      })
      .eq("id", runId);

    await supabase.from("robot_logs").insert({
      run_type: "nda_import",
      level: "info",
      message: `Import NDA terminé : ${extracted.length} lignes, ${rowsNew} nouveaux prospects.`,
      details: {
        import_date: today,
        reference_date: referenceDate,
        total: extracted.length,
        detected_new: newOrganizations.length,
        inserted_new: rowsNew,
      },
    });

    console.log(
      `Import OK — total: ${extracted.length}, détectés: ${newOrganizations.length}, insérés: ${rowsNew}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await supabase
      .from("nda_import_runs")
      .update({ status: "error" })
      .eq("id", runId);

    await supabase.from("robot_logs").insert({
      run_type: "nda_import",
      level: "error",
      message: `Erreur import NDA : ${message}`,
      details: { import_date: today },
    });

    throw error;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
