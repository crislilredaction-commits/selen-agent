import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";

console.log("SUPABASE URL =", process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log(
  "SERVICE ROLE =",
  process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20),
);
console.log("CSV URL =", process.env.NDA_CSV_URL);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const NDA_CSV_URL = process.env.NDA_CSV_URL!;

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

  // SIRET doit faire 14 chiffres
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
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Paris",
      dateStyle: "short",
      timeStyle: "medium",
    })
      .format(now)
      .replace(" ", "T"),
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

async function main() {
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
    console.log("1. Téléchargement du CSV...");
    const response = await fetch(NDA_CSV_URL);
    console.log("2. Réponse reçue :", response.status);

    if (!response.ok) {
      throw new Error(`Téléchargement CSV impossible: ${response.status}`);
    }

    const csvText = await response.text();
    console.log("3. CSV téléchargé, longueur =", csvText.length);

    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      delimiter: ";",
      relax_column_count: true,
    }) as CsvRow[];
    console.log("4. CSV parsé, lignes =", records.length);

    const extracted = records
      .map(extractRowData)
      .filter((row) => isValidOrganization(row));

    console.log("5. Lignes exploitables =", extracted.length);
    console.log("6. Exemple ligne =", extracted[0]);

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

    console.log("6b. Lignes uniques à snapshotter =", snapshotRows.length);

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

    console.log("7. Lignes snapshot veille =", (yesterdayRows ?? []).length);

    const yesterdayCount = (yesterdayRows ?? []).length;

    if (yesterdayCount === 0) {
      console.log(
        "8. Aucun snapshot de veille : initialisation uniquement, aucun prospect créé.",
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
        message: `Initialisation NDA terminée : ${extracted.length} lignes snapshotées, aucun prospect créé (pas de veille disponible).`,
        details: {
          import_date: today,
          total: extracted.length,
          bootstrap: true,
        },
      });

      console.log("Import bootstrap OK.");
      process.exit(0);
    }

    if (yesterdayError) {
      throw new Error(yesterdayError.message);
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

    console.log("8. Clés veille prêtes =", yesterdayKeys.size);

    const newOrganizations = extracted.filter((row) => {
      const key = buildComparisonKey(row);
      return !yesterdayKeys.has(key);
    });

    let rowsNew = 0;

    for (const org of newOrganizations) {
      let existing;

      if (org.siret) {
        existing = await supabase
          .from("prospects")
          .select("id")
          .eq("siret", org.siret)
          .limit(1);
      } else {
        existing = await supabase
          .from("prospects")
          .select("id")
          .eq("organization_name", org.organization_name)
          .eq("city", org.city || "")
          .limit(1);
      }

      if (existing.error) {
        throw new Error(existing.error.message);
      }

      if ((existing.data ?? []).length > 0) continue;

      const insertProspect = await supabase.from("prospects").insert({
        source: "of_public_list",
        organization_name: org.organization_name,
        siret: org.siret || null,
        nda_number: org.nda_number || null,
        city: org.city || null,
        status: "new",
      });

      if (insertProspect.error) {
        throw new Error(insertProspect.error.message);
      }

      rowsNew += 1;
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
