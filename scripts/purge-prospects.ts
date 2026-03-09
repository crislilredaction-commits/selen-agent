import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type ProspectToPurge = {
  id: string;
  organization_name: string | null;
  enrichment_status: string | null;
  prospect_type: string | null;
  workflow_status: string | null;
  questionnaire_status: string | null;
  questionnaire_completed_at: string | null;
  questionnaire_last_sent_at: string | null;
  first_email_status: string | null;
  email_found: string | null;
  phone_found: string | null;
  linkedin_url: string | null;
  facebook_url: string | null;
  whatsapp_url: string | null;
  created_at: string | null;
  website_found: string | null;
};

function hasAnyUsefulContact(prospect: ProspectToPurge) {
  return Boolean(
    prospect.email_found ||
    prospect.phone_found ||
    prospect.linkedin_url ||
    prospect.facebook_url ||
    prospect.whatsapp_url ||
    prospect.website_found,
  );
}

function isProtectedWorkflowStatus(status: string | null) {
  return [
    "questionnaire_sent",
    "questionnaire_completed",
    "offer_sent",
    "meeting_booked",
    "closed_won",
  ].includes(status ?? "");
}

function isOlderThanDays(dateValue: string | null, days: number) {
  if (!dateValue) return false;

  const date = new Date(dateValue);
  const limit = new Date();
  limit.setDate(limit.getDate() - days);

  return date < limit;
}

async function main() {
  console.log("Purge prospects — démarrage");

  const { data, error } = await supabase.from("prospects").select(
    `
      id,
      organization_name,
      enrichment_status,
      prospect_type,
      workflow_status,
      questionnaire_status,
      questionnaire_completed_at,
      questionnaire_last_sent_at,
      first_email_status,
      email_found,
      phone_found,
      linkedin_url,
      facebook_url,
      whatsapp_url,
      website_found,
      created_at
    `,
  );

  if (error) {
    throw new Error(error.message);
  }

  const prospects = (data ?? []) as ProspectToPurge[];

  const toDelete = prospects.filter((prospect) => {
    const hasContact = hasAnyUsefulContact(prospect);

    const protectedWorkflow = isProtectedWorkflowStatus(
      prospect.workflow_status,
    );

    const hasAnsweredQuestionnaire = Boolean(
      prospect.questionnaire_completed_at,
    );

    const alreadyContacted = prospect.first_email_status === "sent";

    // CAS 1 : non contactable, jamais contacté, pas de réponse, pas de statut utile
    const shouldDeleteBecauseNotContactable =
      !hasContact &&
      !alreadyContacted &&
      !hasAnsweredQuestionnaire &&
      !protectedWorkflow;

    // CAS 2 : questionnaire envoyé il y a plus de 30 jours, jamais répondu, pas de suite utile
    const shouldDeleteBecauseNoResponseAfter30Days =
      prospect.questionnaire_status === "sent" &&
      !hasAnsweredQuestionnaire &&
      isOlderThanDays(prospect.questionnaire_last_sent_at, 30) &&
      !["offer_sent", "meeting_booked", "closed_won"].includes(
        prospect.workflow_status ?? "",
      );

    return (
      shouldDeleteBecauseNotContactable ||
      shouldDeleteBecauseNoResponseAfter30Days
    );
  });

  console.log(`Prospects candidats à la suppression : ${toDelete.length}`);

  if (toDelete.length === 0) {
    console.log("Aucun prospect à supprimer.");
    return;
  }

  for (const prospect of toDelete) {
    console.log(
      `Suppression → ${prospect.organization_name ?? "Sans nom"} (${prospect.id})`,
    );

    const { error: logError } = await supabase.from("robot_logs").insert({
      run_type: "purge",
      level: "info",
      message: "Prospect supprimé par purge métier",
      details: {
        prospect_id: prospect.id,
        organization_name: prospect.organization_name,
        enrichment_status: prospect.enrichment_status,
        workflow_status: prospect.workflow_status,
        questionnaire_status: prospect.questionnaire_status,
      },
    });

    if (logError) {
      console.error("Erreur log purge :", logError.message);
    }

    console.log(
      `SIMULATION suppression → ${prospect.organization_name ?? "Sans nom"} (${prospect.id})`,
    );
    continue;
  }

  console.log("Purge prospects — terminée");
}

main().catch((error) => {
  console.error("Erreur globale purge :", error);
  process.exit(1);
});
