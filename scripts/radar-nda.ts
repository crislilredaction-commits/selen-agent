import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} manquant`);
  }
  return value;
}

const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const NDA_CSV_URL = getRequiredEnv("NDA_CSV_URL");

const supabase = createClient(supabaseUrl, serviceRoleKey);

const HISTORY_DAYS = 3;
const SNAPSHOT_BATCH_SIZE = 1000;
const HISTORY_PAGE_SIZE = 20000;
const PROSPECT_BATCH_SIZE = 500;

type CsvRow = Record<string, string>;

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
}) {
  if (!row.organization_name?.trim()) return false;

  const siret = onlyDigits(row.siret);
  if (!siret || siret.length !== 14) return false;

  return true;
}

function getTodayParis(): string {
  const now = new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function getPastParisDate(baseDate: string, daysBack: number): string {
  const d = new Date(`${baseDate}T12:00:00`);
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

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
}) {
  const nda = onlyDigits(item.nda_number ?? "");
  if (nda) return `NDA:${nda}`;

  if (item.siret) return `SIRET:${item.siret}`;

  return `ORG:${normalizeText(item.organization_name)}::CITY:${normalizeText(item.city)}`;
}

function buildNameKey(name: string | null | undefined) {
  return `NAME:${normalizeText(name)}`;
}

async function fetchCsvWithTimeout(
  url: string,
  timeoutMs = 60000,
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

async function fetchHistoryRows(
  historyFrom: string,
  today: string,
): Promise<
  Array<{
    comparison_key: string | null;
    siret: string | null;
    organization_name: string | null;
  }>
> {
  const historyRows: Array<{
    comparison_key: string | null;
    siret: string | null;
    organization_name: string | null;
  }> = [];

  let rangeFrom = 0;

  while (true) {
    const { data, error } = await supabase
      .from("nda_snapshots")
      .select("comparison_key, siret, organization_name")
      .gte("snapshot_date", historyFrom)
      .lt("snapshot_date", today)
      .range(rangeFrom, rangeFrom + HISTORY_PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      break;
    }

    historyRows.push(...data);

    console.log(
      `Historique récupéré : ${historyRows.length} lignes (page à partir de ${rangeFrom})`,
    );

    if (data.length < HISTORY_PAGE_SIZE) {
      break;
    }

    rangeFrom += HISTORY_PAGE_SIZE;
  }

  return historyRows;
}

async function main() {
  console.log("radar-nda.ts démarrage");

  const today = getTodayParis();

  const runInsert = await supabase
    .from("nda_import_runs")
    .insert({
      import_date: today,
      source_url: NDA_CSV_URL,
      file_name: `nda-${today}.csv`,
      status: "running",
    })
    .select("id")
    .single();

  if (runInsert.error || !runInsert.data) {
    throw new Error(
      runInsert.error?.message || "Impossible de créer le run d'import",
    );
  }

  const runId = runInsert.data.id;

  try {
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
    console.log("7. Exemple ligne =", extracted[0]);

    const uniqueMap = new Map<
      string,
      {
        snapshot_date: string;
        siret: string | null;
        nda_number: string | null;
        organization_name: string;
        city: string | null;
        comparison_key: string;
        raw_json: unknown;
      }
    >();

    for (const row of extracted) {
      const comparisonKey = buildComparisonKey(row);

      if (!uniqueMap.has(comparisonKey)) {
        uniqueMap.set(comparisonKey, {
          snapshot_date: today,
          siret: row.siret || null,
          organization_name: row.organization_name,
          city: row.city || null,
          comparison_key: comparisonKey,
          raw_json: row,
          nda_number: row.nda_number || null,
        });
      }
    }

    const snapshotRows = Array.from(uniqueMap.values());
    console.log("8. Lignes uniques à snapshotter =", snapshotRows.length);

    if (snapshotRows.length > 0) {
      for (let i = 0; i < snapshotRows.length; i += SNAPSHOT_BATCH_SIZE) {
        const batch = snapshotRows.slice(i, i + SNAPSHOT_BATCH_SIZE);

        const insertSnapshot = await supabase
          .from("nda_snapshots")
          .upsert(batch, {
            onConflict: "snapshot_date,comparison_key",
            ignoreDuplicates: true,
          });

        if (insertSnapshot.error) {
          throw new Error(insertSnapshot.error.message);
        }

        console.log(
          `Snapshots insérés : ${Math.min(i + batch.length, snapshotRows.length)} / ${snapshotRows.length}`,
        );
      }
    }

    const historyFrom = getPastParisDate(today, HISTORY_DAYS);
    console.log(
      `9. Recherche historique depuis ${historyFrom} jusqu’à ${today}`,
    );

    const historyRows = await fetchHistoryRows(historyFrom, today);
    console.log("10. Lignes snapshot historique =", historyRows.length);

    if (historyRows.length === 0) {
      console.log(
        "11. Aucun historique récent : initialisation uniquement, aucun prospect créé.",
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
        message: `Initialisation NDA terminée : ${extracted.length} lignes snapshotées, aucun prospect créé.`,
        details: {
          import_date: today,
          total: extracted.length,
          bootstrap: true,
        },
      });

      console.log("Import bootstrap OK.");
      return;
    }

    const historyComparisonKeys = new Set(
      historyRows
        .map((row) => row.comparison_key)
        .filter((value): value is string => Boolean(value)),
    );

    const historySiretKeys = new Set(
      historyRows
        .map((row) => onlyDigits(row.siret ?? ""))
        .filter(Boolean)
        .map((siret) => `SIRET:${siret}`),
    );

    const historyNameKeys = new Set(
      historyRows
        .map((row) => row.organization_name ?? "")
        .filter(Boolean)
        .map((name) => buildNameKey(name)),
    );

    console.log(
      "12. Clés historique comparaison =",
      historyComparisonKeys.size,
    );
    console.log("13. Clés historique SIRET =", historySiretKeys.size);
    console.log("14. Clés historique NOM =", historyNameKeys.size);

    const newOrganizations = snapshotRows.filter((row) => {
      const comparisonKey = row.comparison_key;
      const siretKey = row.siret ? `SIRET:${row.siret}` : "";
      const nameKey = buildNameKey(row.organization_name);

      const alreadySeenByComparison = historyComparisonKeys.has(comparisonKey);
      const alreadySeenBySiret = siretKey
        ? historySiretKeys.has(siretKey)
        : false;
      const alreadySeenByName = historyNameKeys.has(nameKey);

      return (
        !alreadySeenByComparison && !alreadySeenBySiret && !alreadySeenByName
      );
    });

    console.log("15. Nouveaux OF potentiels =", newOrganizations.length);

    const ndaNumbers = newOrganizations
      .map((org) => org.nda_number)
      .filter(Boolean);

    let existingNdaSet = new Set<string>();

    if (ndaNumbers.length > 0) {
      const { data: existingByNda, error: existingByNdaError } = await supabase
        .from("prospects")
        .select("nda_number")
        .in("nda_number", ndaNumbers);

      if (existingByNdaError) {
        throw new Error(existingByNdaError.message);
      }

      existingNdaSet = new Set(
        (existingByNda ?? [])
          .map((row) => row.nda_number)
          .filter((value): value is string => Boolean(value)),
      );
    }

    let rowsNew = 0;
    const prospectsToInsert: Array<{
      source: string;
      organization_name: string;
      siret: string | null;
      nda_number: string | null;
      city: string | null;
      status: string;
      is_visible: boolean;
    }> = [];

    for (let i = 0; i < newOrganizations.length; i++) {
      const org = newOrganizations[i];

      if (i % 100 === 0) {
        console.log(`Traitement ligne ${i} / ${newOrganizations.length}`);
      }

      if (org.nda_number && existingNdaSet.has(org.nda_number)) {
        continue;
      }

      prospectsToInsert.push({
        source: "selion_1_nda",
        organization_name: org.organization_name,
        siret: org.siret || null,
        nda_number: org.nda_number || null,
        city: org.city || null,
        status: "new",
        is_visible: true,
      });

      rowsNew += 1;
    }

    console.log("16. Prospects à insérer =", prospectsToInsert.length);

    if (prospectsToInsert.length > 0) {
      for (let i = 0; i < prospectsToInsert.length; i += PROSPECT_BATCH_SIZE) {
        const batch = prospectsToInsert.slice(i, i + PROSPECT_BATCH_SIZE);

        const insertProspect = await supabase.from("prospects").insert(batch);

        if (insertProspect.error) {
          throw new Error(insertProspect.error.message);
        }

        console.log(
          `Prospects insérés : ${Math.min(i + batch.length, prospectsToInsert.length)} / ${prospectsToInsert.length}`,
        );
      }
    }

    const purgeBefore = getPastParisDate(today, 7);

    await supabase
      .from("nda_snapshots")
      .delete()
      .lt("snapshot_date", purgeBefore);

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
        total: extracted.length,
        new_rows: rowsNew,
      },
    });

    console.log(`Import OK — total: ${extracted.length}, nouveaux: ${rowsNew}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await supabase
      .from("nda_import_runs")
      .update({
        status: "error",
      })
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
