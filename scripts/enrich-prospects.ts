import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ENRICHMENT_BATCH_SIZE = 10;

type ProspectRow = {
  id: string;
  organization_name: string | null;
  city: string | null;
  website: string | null;
  website_found: string | null;
  email: string | null;
  email_found: string | null;
  enrichment_status: string | null;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEmailsFromText(text: string): string[] {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const blocked = [
    "example.com",
    "domain.com",
    "email.com",
    "wixpress.com",
    "sentry.io",
  ];

  return [...new Set(matches)]
    .map((e) => e.trim().toLowerCase())
    .filter((email) => !blocked.some((bad) => email.includes(bad)));
}

function scoreEmail(email: string): number {
  let score = 0;

  if (/contact|info|bonjour|hello|formation|admin|accueil/i.test(email))
    score += 5;
  if (!/no-reply|noreply|do-not-reply/i.test(email)) score += 3;
  if (email.length < 40) score += 1;

  return score;
}

function chooseBestEmail(emails: string[]): string | null {
  if (!emails.length) return null;

  return (
    emails
      .map((email) => ({ email, score: scoreEmail(email) }))
      .sort((a, b) => b.score - a.score)[0]?.email ?? null
  );
}

function ensureAbsoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
      },
      redirect: "follow",
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    return await response.text();
  } catch {
    return null;
  }
}

/**
 * V1 simple :
 * - si on a déjà un website dans la fiche, on l'utilise
 * - sinon on essaye des variantes ultra simples
 *
 * Plus tard, on branchera ici une vraie recherche web/API.
 */
function buildWebsiteCandidates(
  orgName: string,
  city: string | null,
): string[] {
  const org = normalizeText(orgName)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9-]/g, "");

  const cityNorm = normalizeText(city)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9-]/g, "");

  const candidates = [
    `${org}.fr`,
    `${org}.com`,
    cityNorm ? `${org}-${cityNorm}.fr` : "",
    cityNorm ? `${org}-${cityNorm}.com` : "",
  ].filter(Boolean);

  return [...new Set(candidates)];
}

async function tryFindWebsite(
  organizationName: string,
  city: string | null,
  existingWebsite?: string | null,
): Promise<string | null> {
  const candidates = [
    ...(existingWebsite ? [existingWebsite] : []),
    ...buildWebsiteCandidates(organizationName, city),
  ];

  for (const candidate of candidates) {
    const url = ensureAbsoluteUrl(candidate);
    const html = await fetchHtml(url);

    if (html && html.length > 200) {
      return url;
    }
  }

  return null;
}

async function extractEmailFromWebsite(
  websiteUrl: string,
): Promise<string | null> {
  const html = await fetchHtml(websiteUrl);
  if (!html) return null;

  const $ = cheerio.load(html);

  const bodyText = $("body").text();
  const hrefs = $("a")
    .map((_, el) => $(el).attr("href") ?? "")
    .get();

  const mailtoEmails = hrefs
    .filter((href) => href.startsWith("mailto:"))
    .map((href) =>
      href
        .replace(/^mailto:/i, "")
        .split("?")[0]
        .trim()
        .toLowerCase(),
    );

  const textEmails = extractEmailsFromText(bodyText + "\n" + html);
  const allEmails = [...new Set([...mailtoEmails, ...textEmails])];

  if (allEmails.length > 0) {
    return chooseBestEmail(allEmails);
  }

  // Bonus simple : essayer /contact si pas trouvé sur la home
  try {
    const contactUrl = new URL("/contact", websiteUrl).toString();
    const contactHtml = await fetchHtml(contactUrl);

    if (contactHtml) {
      const emails = extractEmailsFromText(contactHtml);
      return chooseBestEmail(emails);
    }
  } catch {
    // ignore
  }

  return null;
}

async function main() {
  console.log("Enrichissement prospects — démarrage");

  const { data: prospects, error } = await supabase
    .from("prospects")
    .select(
      "id, organization_name, city, website, website_found, email, email_found, enrichment_status",
    )
    .in("enrichment_status", ["pending", "error", "no_result"])
    .order("created_at", { ascending: true })
    .limit(ENRICHMENT_BATCH_SIZE);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (prospects ?? []) as ProspectRow[];

  console.log(`Prospects à enrichir : ${rows.length}`);

  for (const prospect of rows) {
    const organizationName = prospect.organization_name ?? "";
    if (!organizationName) continue;

    console.log(`\n--- ${organizationName} ---`);

    await supabase
      .from("prospects")
      .update({ enrichment_status: "searching" })
      .eq("id", prospect.id);

    try {
      const website =
        prospect.website_found ||
        prospect.website ||
        (await tryFindWebsite(
          organizationName,
          prospect.city,
          prospect.website,
        ));

      const email =
        prospect.email_found ||
        prospect.email ||
        (website ? await extractEmailFromWebsite(website) : null);

      const finalStatus = website || email ? "enriched" : "no_result";

      const { error: updateError } = await supabase
        .from("prospects")
        .update({
          website_found: website ?? null,
          email_found: email ?? null,
          enrichment_status: finalStatus,
          enrichment_source: "website_guess_v1",
          enriched_at: new Date().toISOString(),
        })
        .eq("id", prospect.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      await supabase.from("robot_logs").insert({
        run_type: "enrichment",
        level: "info",
        message: `Enrichissement prospect terminé : ${organizationName}`,
        details: {
          prospect_id: prospect.id,
          website_found: website,
          email_found: email,
          status: finalStatus,
        },
      });

      console.log(
        `OK → website: ${website ?? "aucun"} | email: ${email ?? "aucun"}`,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);

      await supabase
        .from("prospects")
        .update({
          enrichment_status: "error",
        })
        .eq("id", prospect.id);

      await supabase.from("robot_logs").insert({
        run_type: "enrichment",
        level: "error",
        message: `Erreur enrichissement prospect : ${organizationName}`,
        details: {
          prospect_id: prospect.id,
          error: message,
        },
      });

      console.error(`ERREUR → ${organizationName}: ${message}`);
    }
  }

  console.log("\nEnrichissement terminé.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
