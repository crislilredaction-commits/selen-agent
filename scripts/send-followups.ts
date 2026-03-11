import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { sendProspectFollowupEmail } from "../src/lib/email";

const EMAIL_SENDING_ENABLED = process.env.EMAIL_SENDING_ENABLED === "true";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("Robot relance prospects — démarrage");

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: prospects, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("source", "selion_1_nda")
    .eq("is_visible", true)
    .eq("auto_send_allowed", true)
    .eq("needs_human_validation", false)
    .eq("manual_review_needed", false)
    .eq("questionnaire_status", "sent")
    .neq("followup_email_status", "sent")
    .is("questionnaire_completed_at", null)
    .lt("questionnaire_last_sent_at", sevenDaysAgo.toISOString());

  if (error) {
    console.error(error);
    return;
  }

  const filteredProspects = prospects ?? [];

  if (!filteredProspects || filteredProspects.length === 0) {
    console.log("Aucun prospect à relancer");
    return;
  }

  console.log(`Prospects récupérés pour relance : ${(prospects ?? []).length}`);
  console.log(`Prospects à relancer : ${filteredProspects.length}`);

  for (const prospect of filteredProspects) {
    const email = prospect.email_found || prospect.email;

    if (!email) continue;

    console.log(`Relance → ${prospect.organization_name}`);

    if (!EMAIL_SENDING_ENABLED) {
      console.log("EMAIL BLOQUÉ (mode test)");
      continue;
    }

    try {
      await sendProspectFollowupEmail({
        to: email,
        organizationName: prospect.organization_name,
        prospectId: prospect.id,
      });

      await supabase
        .from("prospects")
        .update({
          followup_email_status: "sent",
          followup_sent_at: new Date().toISOString(),
        })
        .eq("id", prospect.id);

      const delay = 120000 + Math.floor(Math.random() * 120000);
      await sleep(delay);
    } catch (error) {
      console.error("Erreur relance :", error);

      await supabase
        .from("prospects")
        .update({
          followup_email_status: "failed",
        })
        .eq("id", prospect.id);
    }
  }

  console.log("Robot relance terminé");
}

main();
