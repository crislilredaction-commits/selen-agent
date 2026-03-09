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
  city: string;
}) {
  if (!row.organization_name) return false;
  if (!row.city) return false;

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

function getYesterdayParis(): string {
  const now = new Date();
  const parisNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Europe/Paris" }),
  );
  parisNow.setDate(parisNow.getDate() - 1);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parisNow);
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
    nda_number: ndaNumber.trim(),
  };
}

function buildComparisonKey(item: {
  siret: string;
  organization_name: string;
  city: string;
}) {
  if (item.siret) return `SIRET:${item.siret}`;
  return `ORG:${normalizeText(item.organization_name)}::CITY:${normalizeText(item.city)}`;
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

async function main() {
  console.log("radar-nda.ts démarrage");

  const today = getTodayParis();
  const yesterday = getYesterdayParis();

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
        });
      }
    }

    const snapshotRows = Array.from(uniqueMap.values());
    console.log("8. Lignes uniques à snapshotter =", snapshotRows.length);

    if (snapshotRows.length > 0) {
      const batchSize = 1000;

      for (let i = 0; i < snapshotRows.length; i += batchSize) {
        const batch = snapshotRows.slice(i, i + batchSize);

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

    const { data: yesterdayRows, error: yesterdayError } = await supabase
      .from("nda_snapshots")
      .select("siret, organization_name, city")
      .eq("snapshot_date", yesterday);

    if (yesterdayError) {
      throw new Error(yesterdayError.message);
    }

    console.log("9. Lignes snapshot veille =", (yesterdayRows ?? []).length);

    if ((yesterdayRows ?? []).length === 0) {
      console.log(
        "10. Aucun snapshot de veille : initialisation uniquement, aucun prospect créé.",
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

    const yesterdayKeys = new Set(
      (yesterdayRows ?? []).map((row) =>
        buildComparisonKey({
          siret: row.siret ?? "",
          organization_name: row.organization_name ?? "",
          city: row.city ?? "",
        }),
      ),
    );

    console.log("11. Clés veille prêtes =", yesterdayKeys.size);

    const newOrganizations = extracted.filter((row) => {
      const key = buildComparisonKey(row);
      return !yesterdayKeys.has(key);
    });

    console.log("12. Nouveaux OF potentiels =", newOrganizations.length);

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
        source: "of_public_list",
        organization_name: org.organization_name,
        siret: org.siret || null,
        nda_number: org.nda_number || null,
        city: org.city || null,
        status: "new",
      });

      rowsNew += 1;
    }

    console.log("13. Prospects à insérer =", prospectsToInsert.length);

    if (prospectsToInsert.length > 0) {
      const batchSize = 500;

      for (let i = 0; i < prospectsToInsert.length; i += batchSize) {
        const batch = prospectsToInsert.slice(i, i + batchSize);

        const insertProspect = await supabase.from("prospects").insert(batch);

        if (insertProspect.error) {
          throw new Error(insertProspect.error.message);
        }

        console.log(
          `Prospects insérés : ${Math.min(i + batch.length, prospectsToInsert.length)} / ${prospectsToInsert.length}`,
        );
      }
    }

    const purgeDate = new Date(today);
    purgeDate.setDate(purgeDate.getDate() - 2);
    const purgeBefore = purgeDate.toISOString().slice(0, 10);

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
