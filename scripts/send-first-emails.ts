import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { sendProspectQuestionnaireEmail } from "../src/lib/email";

const EMAIL_SENDING_ENABLED = true;
const DAILY_SEND_LIMIT = 20;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL manquant");
}

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log("Envoi des premiers emails — démarrage");

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const { data: prospects, error } = await supabase
    .from("prospects")
    .select(
      "id, organization_name, email, email_found, first_email_status, workflow_status, prospect_type, created_at",
    )
    .eq("prospect_type", "nouvel_entrant")
    .or("first_email_status.is.null,first_email_status.eq.not_sent")
    .gte("created_at", startOfToday.toISOString())
    .order("created_at", { ascending: false })
    .limit(DAILY_SEND_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  const candidates = (prospects ?? []).filter((p) => {
    const email = p.email_found || p.email;
    return !!email;
  });

  console.log(`Prospects à contacter : ${candidates.length}`);

  for (const prospect of candidates) {
    const email = prospect.email_found || prospect.email;
    if (!email) continue;

    try {
      console.log(
        `Préparation envoi à ${prospect.organization_name || "Prospect"} <${email}>`,
      );

      const { error: markSendingError } = await supabase
        .from("prospects")
        .update({
          first_email_status: "sending",
        })
        .eq("id", prospect.id)
        .or("first_email_status.is.null,first_email_status.eq.not_sent");

      if (markSendingError) {
        throw new Error(markSendingError.message);
      }

      if (!EMAIL_SENDING_ENABLED) {
        console.log(
          `EMAIL BLOQUÉ (mode test) → ${prospect.organization_name || "Prospect"} <${email}>`,
        );
        continue;
      }

      await sendProspectQuestionnaireEmail({
        to: email,
        organizationName: prospect.organization_name,
        prospectId: prospect.id,
      });

      const now = new Date().toISOString();
      const followupDate = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { error: updateError } = await supabase
        .from("prospects")
        .update({
          first_email_status: "sent",
          first_outreach_sent_at: now,
          questionnaire_status: "sent",
          questionnaire_last_sent_at: now,
          last_contacted_at: now,
          next_followup_due_at: followupDate,
          workflow_status: "questionnaire_sent",
          status: "contacted",
        })
        .eq("id", prospect.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

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
        console.error("Erreur log message :", logError.message);
      }
    } catch (err) {
      console.error(`Erreur envoi ${email}:`, err);

      await supabase
        .from("prospects")
        .update({
          first_email_status: "failed",
        })
        .eq("id", prospect.id);
    }
  }

  console.log("Envoi des premiers emails — terminé");
}

main().catch((error) => {
  console.error("Erreur globale :", error);
  process.exit(1);
});
