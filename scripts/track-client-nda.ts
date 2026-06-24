import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  assertOutboundEmailsEnabled,
  canSendOutboundEmails,
  getOutboundEmailBlockedResult,
} from "../src/lib/outbound-email-guard";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant`);
  return value;
}

function getOptionalEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function splitEnvList(name: string, fallback: string[]): string[] {
  const value = process.env[name];
  if (!value) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const supabase = createClient(
  getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
);

const CLIENT_NDA_TABLE = getOptionalEnv("SELEN_NDA_CASES_TABLE", "nda_variables");
const CASE_ID_COLUMN = getOptionalEnv("SELEN_NDA_CASE_ID_COLUMN", "id");
const STATUS_COLUMN = getOptionalEnv(
  "SELEN_NDA_STATUS_COLUMN",
  "nda_deposit_status",
);
const NDA_OBTAINED_AT_COLUMN = getOptionalEnv(
  "SELEN_NDA_OBTAINED_AT_COLUMN",
  "nda_obtained_at",
);
const SIRET_COLUMN = getOptionalEnv("SELEN_NDA_SIRET_COLUMN", "siret");
const EMAIL_COLUMN = getOptionalEnv("SELEN_NDA_EMAIL_COLUMN", "email");
const ORGANIZATION_COLUMN = getOptionalEnv(
  "SELEN_NDA_ORGANIZATION_COLUMN",
  "organization_name",
);
const TESTIMONIAL_LINK = process.env.SELEN_TESTIMONIAL_LINK?.trim() || null;

const MONITORED_STATUSES = splitEnvList("SELEN_NDA_MONITORED_STATUSES", [
  "nda_deposit_pending",
  "waiting_dreets_response",
  "compliant",
]);

const SNAPSHOT_BATCH_SIZE = 200;

type AnyRow = Record<string, any>;

type PublicNdaSnapshot = {
  snapshot_date: string;
  siret: string | null;
  nda_number: string | null;
  organization_name: string | null;
  city: string | null;
  raw_json: unknown;
};

type Counters = {
  watched: number;
  withoutSiret: number;
  found: number;
  updated: number;
  emailSent: number;
  emailSkippedAlreadySent: number;
  emailSkippedNoEmail: number;
  emailSkippedTestMode: number;
  emailFailed: number;
};

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function getCaseId(row: AnyRow): string {
  return String(row[CASE_ID_COLUMN] ?? row.id);
}

function getClientEmail(row: AnyRow): string | null {
  return row[EMAIL_COLUMN] ?? row.client_email ?? row.customer_email ?? null;
}

function getOrganizationName(row: AnyRow): string | null {
  return (
    row[ORGANIZATION_COLUMN] ??
    row.company_name ??
    row.client_name ??
    row.raison_sociale ??
    null
  );
}

async function fetchLatestSnapshotDate(): Promise<string | null> {
  const { data, error } = await supabase
    .from("nda_snapshots")
    .select("snapshot_date")
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`fetchLatestSnapshotDate: ${error.message}`);
  return data?.snapshot_date ?? null;
}

async function fetchWatchedCases(): Promise<AnyRow[]> {
  const { data, error } = await supabase
    .from(CLIENT_NDA_TABLE)
    .select("*")
    .in(STATUS_COLUMN, MONITORED_STATUSES)
    .is(NDA_OBTAINED_AT_COLUMN, null);

  if (error) throw new Error(`fetchWatchedCases: ${error.message}`);
  return data ?? [];
}

async function fetchSnapshotsBySiret(
  snapshotDate: string,
  sirets: string[],
): Promise<Map<string, PublicNdaSnapshot>> {
  const found = new Map<string, PublicNdaSnapshot>();
  const uniqueSirets = [...new Set(sirets.map(onlyDigits).filter(Boolean))];

  for (let i = 0; i < uniqueSirets.length; i += SNAPSHOT_BATCH_SIZE) {
    const batch = uniqueSirets.slice(i, i + SNAPSHOT_BATCH_SIZE);

    const { data, error } = await supabase
      .from("nda_snapshots")
      .select("snapshot_date, siret, nda_number, organization_name, city, raw_json")
      .eq("snapshot_date", snapshotDate)
      .in("siret", batch);

    if (error) throw new Error(`fetchSnapshotsBySiret: ${error.message}`);

    for (const row of data ?? []) {
      const siret = onlyDigits(row.siret);
      if (siret && !found.has(siret)) found.set(siret, row);
    }
  }

  return found;
}

function getResendClient(): Resend {
  assertOutboundEmailsEnabled();
  return new Resend(getRequiredEnv("RESEND_API_KEY"));
}

async function sendCongratulationsEmail({
  to,
  organizationName,
}: {
  to: string;
  organizationName: string | null;
}) {
  const cerfaLink =
    "https://www.impots.gouv.fr/sites/default/files/formulaires/3511-sd/2026/3511-sd_4894.pdf";
  const subject =
    "F\u00e9licitations, votre num\u00e9ro de d\u00e9claration d'activit\u00e9 est obtenu";

  if (!canSendOutboundEmails()) {
    console.log("Outbound emails disabled, skipping send", {
      to,
      subject,
      organizationName,
    });
    return getOutboundEmailBlockedResult();
  }

  const testimonialBlock = TESTIMONIAL_LINK
    ? `<p>Si vous souhaitez partager votre experience, vous pouvez laisser un temoignage ici : <a href="${TESTIMONIAL_LINK}">${TESTIMONIAL_LINK}</a>.</p>`
    : `<p>Nous preparons aussi un lien pour recueillir les temoignages clients. Nous vous le transmettrons des qu'il sera pret.</p>`;

  return await getResendClient().emails.send({
    from: "Selion <hello@selen-editions.fr>",
    to,
    subject,
    html: `
<p>Bonjour${organizationName ? ` ${organizationName}` : ""},</p>

<p>F&eacute;licitations, votre num&eacute;ro de d&eacute;claration d'activit&eacute; est obtenu.</p>

<p>Votre organisme appara&icirc;t d&eacute;sormais dans la liste publique des organismes de formation. Cela signifie que la d&eacute;marche NDA est valid&eacute;e.</p>

<p>Si vous le souhaitez, vous pouvez maintenant t&eacute;l&eacute;charger le CERFA 3511-SD afin de demander l'exon&eacute;ration de TVA formation.</p>

<p style="margin:20px 0;">
  <a href="${cerfaLink}" style="background:#c25b12;color:white;padding:12px 18px;text-decoration:none;border-radius:6px;display:inline-block;">
    T&eacute;l&eacute;charger le CERFA 3511-SD
  </a>
</p>

<p>Le formulaire doit &ecirc;tre compl&eacute;t&eacute;, puis envoy&eacute; par courrier &agrave; la DREETS de votre r&eacute;gion.</p>

${testimonialBlock}

<p>Encore bravo pour cette belle etape.</p>

<p>A tres bientot,<br>
<strong>Selen Editions</strong><br>
<a href="https://selen-editions.fr">selen-editions.fr</a></p>
`,
  });
}

async function markCaseObtained(row: AnyRow): Promise<AnyRow> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from(CLIENT_NDA_TABLE)
    .update({
      [STATUS_COLUMN]: "nda_obtained",
      [NDA_OBTAINED_AT_COLUMN]: now,
    })
    .eq(CASE_ID_COLUMN, getCaseId(row))
    .select("*")
    .single();

  if (error) throw new Error(`markCaseObtained(${getCaseId(row)}): ${error.message}`);
  return data ?? { ...row, [STATUS_COLUMN]: "nda_obtained", [NDA_OBTAINED_AT_COLUMN]: now };
}

async function logDetection(
  row: AnyRow,
  snapshot: PublicNdaSnapshot,
): Promise<void> {
  const { error } = await supabase.from("robot_logs").insert({
    run_type: "nda_obtained_detection",
    level: "info",
    message: `NDA obtenu detecte pour le dossier ${getCaseId(row)}`,
    details: {
      table: CLIENT_NDA_TABLE,
      case_id: getCaseId(row),
      siret: onlyDigits(row[SIRET_COLUMN]),
      source: "nda_public_list",
      snapshot_date: snapshot.snapshot_date,
      public_nda_number: snapshot.nda_number,
      public_organization_name: snapshot.organization_name,
      public_city: snapshot.city,
    },
  });

  if (error) console.error("logDetection:", error.message);
}

async function wasCongratulationsEmailAlreadySent(
  row: AnyRow,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("robot_logs")
    .select("id")
    .eq("run_type", "nda_obtained_email")
    .eq("level", "info")
    .eq("details->>case_id", getCaseId(row))
    .limit(1);

  if (error) {
    console.error("wasCongratulationsEmailAlreadySent:", error.message);
    return false;
  }

  return Boolean(data?.length);
}

async function logEmailResult({
  row,
  status,
  error,
}: {
  row: AnyRow;
  status: "sent" | "blocked_test_mode" | "skipped_no_email" | "failed";
  error?: string;
}): Promise<void> {
  const level = status === "failed" ? "error" : "info";
  const { error: logError } = await supabase.from("robot_logs").insert({
    run_type: "nda_obtained_email",
    level,
    message: `Email felicitation NDA ${status} pour le dossier ${getCaseId(row)}`,
    details: {
      table: CLIENT_NDA_TABLE,
      case_id: getCaseId(row),
      status,
      email: getClientEmail(row),
      error,
    },
  });

  if (logError) console.error("logEmailResult:", logError.message);
}

async function logSummary(
  counters: Counters,
  snapshotDate: string | null,
): Promise<void> {
  const { error } = await supabase.from("robot_logs").insert({
    run_type: "nda_client_tracking",
    level: "info",
    message: `Suivi NDA clients termine : ${counters.watched} dossier(s) surveille(s), ${counters.found} SIRET trouve(s), ${counters.updated} dossier(s) mis a jour, ${counters.emailSent} email(s) envoye(s).`,
    details: {
      snapshot_date: snapshotDate,
      table: CLIENT_NDA_TABLE,
      monitored_statuses: MONITORED_STATUSES,
      status_column: STATUS_COLUMN,
      obtained_at_column: NDA_OBTAINED_AT_COLUMN,
      ...counters,
      prospect_emails_sent: 0,
      new_entrant_emails_sent: 0,
    },
  });

  if (error) console.error("logSummary:", error.message);
}

async function main() {
  console.log("Suivi NDA clients - demarrage");

  const counters: Counters = {
    watched: 0,
    withoutSiret: 0,
    found: 0,
    updated: 0,
    emailSent: 0,
    emailSkippedAlreadySent: 0,
    emailSkippedNoEmail: 0,
    emailSkippedTestMode: 0,
    emailFailed: 0,
  };

  const snapshotDate = await fetchLatestSnapshotDate();
  if (!snapshotDate) {
    console.log("Aucun snapshot public NDA disponible.");
    await logSummary(counters, null);
    return;
  }

  const watchedCases = await fetchWatchedCases();
  counters.watched = watchedCases.length;

  const casesWithSiret = watchedCases.filter((row) => {
    const siret = onlyDigits(row[SIRET_COLUMN]);
    if (!siret) counters.withoutSiret++;
    return Boolean(siret);
  });

  const snapshots = await fetchSnapshotsBySiret(
    snapshotDate,
    casesWithSiret.map((row) => row[SIRET_COLUMN]),
  );

  for (const row of casesWithSiret) {
    const siret = onlyDigits(row[SIRET_COLUMN]);
    const snapshot = snapshots.get(siret);
    if (!snapshot) continue;

    counters.found++;

    try {
      const updatedRow = await markCaseObtained(row);
      counters.updated++;
      await logDetection(updatedRow, snapshot);

      if (await wasCongratulationsEmailAlreadySent(updatedRow)) {
        counters.emailSkippedAlreadySent++;
        continue;
      }

      const email = getClientEmail(updatedRow);
      if (!email) {
        counters.emailSkippedNoEmail++;
        await logEmailResult({ row: updatedRow, status: "skipped_no_email" });
        continue;
      }

      const result = await sendCongratulationsEmail({
        to: email,
        organizationName: getOrganizationName(updatedRow),
      });

      if ("blocked" in result && result.blocked) {
        counters.emailSkippedTestMode++;
        await logEmailResult({ row: updatedRow, status: "blocked_test_mode" });
        continue;
      }

      counters.emailSent++;
      await logEmailResult({ row: updatedRow, status: "sent" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      counters.emailFailed++;
      console.error(`Erreur suivi NDA dossier ${getCaseId(row)}: ${message}`);

      await supabase.from("robot_logs").insert({
        run_type: "nda_client_tracking",
        level: "error",
        message: `Erreur suivi NDA dossier ${getCaseId(row)}: ${message}`,
        details: { case_id: getCaseId(row), siret },
      });
    }
  }

  console.log(
    `Suivi NDA clients termine | surveilles: ${counters.watched}, trouves: ${counters.found}, mis a jour: ${counters.updated}, emails: ${counters.emailSent}, deja envoyes: ${counters.emailSkippedAlreadySent}, sans email: ${counters.emailSkippedNoEmail}, test: ${counters.emailSkippedTestMode}, erreurs: ${counters.emailFailed}`,
  );

  await logSummary(counters, snapshotDate);
}

main().catch((error) => {
  console.error("Erreur globale suivi NDA clients :", error);
  process.exit(1);
});
