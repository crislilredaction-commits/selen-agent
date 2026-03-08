import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { exec } from "child_process";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL manquant");
}

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

function runScript(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n--- Lancement ${script} ---`);

    exec(`npx ts-node scripts/${script}`, (error, stdout, stderr) => {
      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function cleanupOldSnapshots() {
  console.log("\nNettoyage snapshots > 3 jours");

  const { error } = await supabase.rpc("cleanup_old_snapshots");

  if (error) {
    console.error("Erreur nettoyage :", error.message);
  } else {
    console.log("Snapshots anciens supprimés");
  }
}

async function main() {
  console.log("\n==============================");
  console.log("SÉLION AGENT — DÉMARRAGE");
  console.log("==============================\n");

  try {
    await runScript("radar-nda.ts");

    await runScript("enrich-prospects.ts");

    await cleanupOldSnapshots();

    await supabase.from("robot_logs").insert({
      run_type: "agent",
      level: "info",
      message: "Cycle complet Sélion terminé",
      details: {
        time: new Date().toISOString(),
      },
    });

    console.log("\nCycle Sélion terminé");
  } catch (err) {
    console.error("Erreur agent :", err);

    await supabase.from("robot_logs").insert({
      run_type: "agent",
      level: "error",
      message: "Erreur cycle Sélion",
      details: {
        error: String(err),
      },
    });
  }
}

main();
