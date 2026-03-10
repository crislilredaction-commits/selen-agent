import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { spawn } from "child_process";
import { createClient } from "@supabase/supabase-js";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} manquant`);
  }
  return value;
}

const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, serviceRoleKey);

function runScript(script: string, timeoutMs = 15 * 60 * 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n--- Lancement ${script} ---`);

    const child = spawn("npx", ["tsx", `scripts/${script}`], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      env: process.env,
    });

    const timeout = setTimeout(() => {
      console.error(`\n--- Timeout ${script} après ${timeoutMs / 1000}s ---`);
      child.kill("SIGTERM");
      reject(new Error(`${script} timeout`));
    }, timeoutMs);

    child.stdout.on("data", (data) => {
      process.stdout.write(data.toString());
    });

    child.stderr.on("data", (data) => {
      process.stderr.write(data.toString());
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        console.log(`\n--- Fin ${script} ---`);
        resolve();
      } else {
        reject(new Error(`${script} a échoué avec le code ${code}`));
      }
    });
  });
}

async function main() {
  console.log("\n==============================");
  console.log("SÉLION AGENT — DÉMARRAGE");
  console.log("==============================\n");

  try {
    await runScript("radar-nda.ts");
    await runScript("enrich-prospects-V3.ts");
    await runScript("purge-prospects.ts");

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
