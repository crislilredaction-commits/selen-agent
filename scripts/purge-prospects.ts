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
};

function hasEmail(prospect: ProspectToPurge) {
  return Boolean(
    (prospect.email_found && prospect.email_found.trim() !== "") ||
    (prospect.email && prospect.email.trim() !== ""),
  );
}

async function main() {
  console.log("Purge prospects — démarrage");

  const { data, error } = await supabase
    .from("prospects")
    .select("id, organization_name, email, email_found");

  if (error) {
    throw new Error(error.message);
  }

  const prospects = (data ?? []) as ProspectToPurge[];

  const toDelete = prospects.filter((prospect) => !hasEmail(prospect));

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
      message: "Prospect supprimé car sans email exploitable",
      details: {
        prospect_id: prospect.id,
        organization_name: prospect.organization_name,
      },
    });

    if (logError) {
      console.error("Erreur log purge :", logError.message);
    }

    const { error: deleteError } = await supabase
      .from("prospects")
      .delete()
      .eq("id", prospect.id);

    if (deleteError) {
      console.error(
        `Erreur suppression ${prospect.organization_name}: ${deleteError.message}`,
      );
    }
  }

  console.log("Purge prospects — terminée");
}

main().catch((error) => {
  console.error("Erreur globale purge :", error);
  process.exit(1);
});
