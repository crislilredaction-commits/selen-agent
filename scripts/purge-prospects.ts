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
  email_found: string | null;
  phone_found: string | null;
  linkedin_url: string | null;
  facebook_url: string | null;
  whatsapp_url: string | null;
};

function hasAnyContact(prospect: ProspectToPurge) {
  return Boolean(
    prospect.email_found ||
    prospect.phone_found ||
    prospect.linkedin_url ||
    prospect.facebook_url ||
    prospect.whatsapp_url,
  );
}

async function main() {
  console.log("Purge prospects — démarrage");

  const { data, error } = await supabase
    .from("prospects")
    .select(
      "id, organization_name, enrichment_status, prospect_type, email_found, phone_found, linkedin_url, facebook_url, whatsapp_url",
    )
    .eq("enrichment_status", "no_result");

  if (error) {
    throw new Error(error.message);
  }

  const prospects = (data ?? []) as ProspectToPurge[];

  const toDelete = prospects.filter((prospect) => {
    const protectedType =
      prospect.prospect_type === "nouvel_entrant" ||
      prospect.prospect_type === "qp_ok";

    const protectedStatus =
      prospect.enrichment_status === "identified" ||
      prospect.enrichment_status === "enriched";

    if (protectedType || protectedStatus) {
      return false;
    }

    return !hasAnyContact(prospect);
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
      message: `Prospect supprimé après enrichissement sans résultat`,
      details: {
        prospect_id: prospect.id,
        organization_name: prospect.organization_name,
        enrichment_status: prospect.enrichment_status,
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
