import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { spawn } from "child_process";
import { createClient } from "@supabase/supabase-js";

// ─── Env ──────────────────────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant`);
  return value;
}

const supabase = createClient(
  getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
);

// ─── Config ───────────────────────────────────────────────────────────────────

const LOCK_NAME = "selen_agent";

/**
 * Durée maximale d'un cycle complet avant que le lock soit considéré
 * comme orphelin (run précédent crashé sans libérer).
 * 2h est largement suffisant pour 5 scripts séquentiels.
 */
const LOCK_TTL_MS = 2 * 60 * 60 * 1_000; // 2 heures

// ─── Lock distribué ───────────────────────────────────────────────────────────

/**
 * Tente d'acquérir le lock exclusif pour ce cycle.
 *
 * Algorithme :
 * 1. On cherche un lock existant pour "selen_agent"
 * 2. S'il existe et n'est pas expiré → un autre run est actif → on refuse
 * 3. S'il existe mais expiré → le run précédent a crashé → on le prend (upsert)
 * 4. S'il n'existe pas → on l'insère
 *
 * Retourne true si le lock est acquis, false sinon.
 */
async function acquireLock(): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS).toISOString();

  // Cherche un lock existant
  const { data: existing, error: selectError } = await supabase
    .from("robot_run_lock")
    .select("lock_name, expires_at, started_at")
    .eq("lock_name", LOCK_NAME)
    .maybeSingle();

  if (selectError) {
    console.error("acquireLock: erreur lecture lock :", selectError.message);
    // En cas d'erreur de lecture, on refuse par sécurité
    return false;
  }

  if (existing) {
    const lockExpiry = new Date(existing.expires_at);

    if (now < lockExpiry) {
      // Lock actif et non expiré → un autre run tourne
      console.warn(
        `Lock actif depuis ${existing.started_at} (expire à ${existing.expires_at}). Abandon du run.`,
      );
      return false;
    }

    // Lock expiré → run précédent crashé → on prend le lock
    console.warn(
      `Lock expiré trouvé (était ${existing.started_at}). Run précédent probablement crashé. On reprend le lock.`,
    );
  }

  // Insert ou update du lock (upsert sur lock_name)
  const { error: upsertError } = await supabase.from("robot_run_lock").upsert(
    {
      lock_name: LOCK_NAME,
      started_at: now.toISOString(),
      expires_at: expiresAt,
    },
    { onConflict: "lock_name" },
  );

  if (upsertError) {
    console.error("acquireLock: erreur upsert lock :", upsertError.message);
    return false;
  }

  console.log(`Lock acquis (expire à ${expiresAt})`);
  return true;
}

/**
 * Libère le lock à la fin du cycle (succès ou erreur).
 * Appelé dans le bloc finally pour garantir la libération même en cas de crash.
 */
async function releaseLock(): Promise<void> {
  const { error } = await supabase
    .from("robot_run_lock")
    .delete()
    .eq("lock_name", LOCK_NAME);

  if (error) {
    console.error("releaseLock: erreur suppression lock :", error.message);
  } else {
    console.log("Lock libéré.");
  }
}

// ─── Exécution de scripts ─────────────────────────────────────────────────────

function runScript(script: string, timeoutMs = 45 * 60 * 1_000): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n--- Lancement ${script} ---`);

    const child = spawn("npx", ["tsx", `scripts/${script}`], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      env: process.env,
    });

    const timeout = setTimeout(() => {
      console.error(`\n--- Timeout ${script} après ${timeoutMs / 1_000}s ---`);
      child.kill("SIGTERM");
      reject(new Error(`${script} timeout après ${timeoutMs / 1_000}s`));
    }, timeoutMs);

    child.stdout.on("data", (data) => process.stdout.write(data.toString()));
    child.stderr.on("data", (data) => process.stderr.write(data.toString()));

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

/**
 * Lance un script en mode non-bloquant :
 * une erreur est loguée mais ne stoppe pas le cycle.
 */
async function runScriptSafe(
  script: string,
  timeoutMs?: number,
): Promise<void> {
  try {
    await runScript(script, timeoutMs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n⚠️  ${script} en erreur (non bloquant) : ${message}`);

    await supabase.from("robot_logs").insert({
      run_type: "agent",
      level: "warn",
      message: `Étape non-bloquante en erreur : ${script}`,
      details: { script, error: message },
    });
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n==============================");
  console.log("SÉLION AGENT — DÉMARRAGE");
  console.log(`Heure : ${new Date().toISOString()}`);
  console.log("==============================\n");

  // ── 1. Acquisition du lock ────────────────────────────────────────────────
  const locked = await acquireLock();

  if (!locked) {
    console.log("Cycle annulé : un autre run est déjà actif.");
    await supabase.from("robot_logs").insert({
      run_type: "agent",
      level: "warn",
      message: "Cycle Sélion annulé : lock déjà actif",
      details: { time: new Date().toISOString() },
    });
    process.exit(0);
  }

  const startedAt = Date.now();

  try {
    // ── 2. Radar NDA — BLOQUANT ───────────────────────────────────────────
    // Si radar plante, pas de nouveaux prospects → inutile de continuer.
    await runScript("radar-nda.ts");

    // ── 3. Enrichissement — non bloquant ──────────────────────────────────
    // Un crash d'enrichissement ne doit pas empêcher les envois du backlog
    // déjà enrichi lors des runs précédents.
    await runScriptSafe("enrich-prospects-V3.ts");

    // ── 4. Purge — non bloquant ───────────────────────────────────────────
    // Nettoyage cosmétique, pas critique pour le pipeline d'envoi.
    await runScriptSafe("purge-prospects.ts");

    // ── 5. Envoi premiers emails — non bloquant ───────────────────────────
    // Un crash SMTP partiel ne doit pas bloquer les relances.
    await runScriptSafe("send-first-emails.ts");

    // ── 6. Relances — non bloquant ────────────────────────────────────────
    await runScriptSafe("send-followups.ts");

    // ── 7. Log succès ─────────────────────────────────────────────────────
    const durationMs = Date.now() - startedAt;

    await supabase.from("robot_logs").insert({
      run_type: "agent",
      level: "info",
      message: `Cycle complet Sélion terminé en ${Math.round(durationMs / 1_000)}s`,
      details: {
        started_at: new Date(startedAt).toISOString(),
        ended_at: new Date().toISOString(),
        duration_ms: durationMs,
      },
    });

    console.log(
      `\n✅ Cycle Sélion terminé en ${Math.round(durationMs / 1_000)}s`,
    );
  } catch (err) {
    // Seul radar-nda peut arriver ici (étape bloquante).
    const message = err instanceof Error ? err.message : String(err);
    console.error("\n❌ Erreur bloquante agent :", message);

    await supabase.from("robot_logs").insert({
      run_type: "agent",
      level: "error",
      message: `Erreur bloquante cycle Sélion : ${message}`,
      details: {
        error: message,
        started_at: new Date(startedAt).toISOString(),
        failed_at: new Date().toISOString(),
      },
    });

    // On ne fait pas process.exit(1) ici pour laisser le finally s'exécuter
    throw err;
  } finally {
    // ── 8. Libération du lock — toujours exécuté ──────────────────────────
    // Même en cas d'exception non catchée, le lock est libéré.
    await releaseLock();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
