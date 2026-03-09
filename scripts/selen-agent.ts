import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { spawn } from "child_process";
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

    const child = spawn("npx", ["tsx", `scripts/${script}`], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      env: process.env,
    });

    child.stdout.on("data", (data) => {
      process.stdout.write(data.toString());
    });

    child.stderr.on("data", (data) => {
      process.stderr.write(data.toString());
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`\n--- Fin ${script} ---`);
        resolve();
      } else {
        reject(new Error(`${script} a échoué avec le code ${code}`));
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
    await runScript("enrich-prospects-V3.ts");
    await runScript("purge-prospects.ts");

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
