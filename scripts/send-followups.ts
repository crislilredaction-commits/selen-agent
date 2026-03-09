import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const EMAIL_SENDING_ENABLED = false;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log("Robot relance prospects — démarrage");

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: prospects, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("questionnaire_status", "sent")
    .is("questionnaire_answered_at", null)
    .lt("questionnaire_sent_at", sevenDaysAgo.toISOString());

  if (error) {
    console.error(error);
    return;
  }

  if (!prospects || prospects.length === 0) {
    console.log("Aucun prospect à relancer");
    return;
  }

  console.log(`Prospects à relancer : ${prospects.length}`);

  for (const prospect of prospects) {
    console.log(`Relance → ${prospect.organization_name}`);

    if (!EMAIL_SENDING_ENABLED) {
      console.log("EMAIL BLOQUÉ (mode test)");
      continue;
    }

    await supabase
      .from("prospects")
      .update({
        followup_email_status: "sent",
        followup_sent_at: new Date().toISOString(),
      })
      .eq("id", prospect.id);
  }

  console.log("Robot relance terminé");
}

main();
