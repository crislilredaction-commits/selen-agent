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
  email: string | null;
  email_found: string | null;
  enrichment_status: string | null;
};

function hasEmail(prospect: ProspectToPurge): boolean {
  return Boolean(
    (prospect.email_found && prospect.email_found.trim() !== "") ||
    (prospect.email && prospect.email.trim() !== ""),
  );
}

function enrichmentFinished(status: string | null): boolean {
  return ["enriched", "identified", "no_result", "failed"].includes(
    status ?? "",
  );
}

async function main() {
  console.log("Purge prospects — démarrage");

  const { data, error } = await supabase
    .from("prospects")
    .select("id, organization_name, email, email_found, enrichment_status")
    .eq("is_visible", true);

  if (error) {
    throw new Error(error.message);
  }

  const prospects = (data ?? []) as ProspectToPurge[];

  const toHide = prospects.filter(
    (prospect) =>
      enrichmentFinished(prospect.enrichment_status) && !hasEmail(prospect),
  );

  console.log(`Prospects candidats au masquage : ${toHide.length}`);

  if (toHide.length === 0) {
    console.log("Aucun prospect à masquer.");
    return;
  }

  for (const prospect of toHide) {
    console.log(
      `Masquage → ${prospect.organization_name ?? "Sans nom"} (${prospect.id})`,
    );

    const { error: logError } = await supabase.from("robot_logs").insert({
      run_type: "purge",
      level: "info",
      message: "Prospect masqué car sans email après enrichissement terminé",
      details: {
        prospect_id: prospect.id,
        organization_name: prospect.organization_name,
        enrichment_status: prospect.enrichment_status,
      },
    });

    if (logError) {
      console.error("Erreur log purge :", logError.message);
    }

    const { error: updateError } = await supabase
      .from("prospects")
      .update({ is_visible: false })
      .eq("id", prospect.id);

    if (updateError) {
      console.error(
        `Erreur masquage ${prospect.organization_name ?? "Sans nom"}: ${updateError.message}`,
      );
    }
  }

  console.log("Purge prospects — terminée");
}

main().catch((error) => {
  console.error("Erreur globale purge :", error);
  process.exit(1);
});
