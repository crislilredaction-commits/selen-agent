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
  phone_found: string | null;
  linkedin_url: string | null;
  facebook_url: string | null;
  whatsapp_url: string | null;
  training_domain: string | null;
  enrichment_status: string | null;
};

type ExtractedData = {
  emails: string[];
  phones: string[];
  linkedinUrl: string | null;
  facebookUrl: string | null;
  whatsappUrl: string | null;
  trainingDomain: string | null;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureAbsoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

async function fetchHtml(
  url: string,
  timeoutMs = 8000,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractEmailsFromText(text: string): string[] {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];

  const blocked = [
    "example.com",
    "domain.com",
    "email.com",
    "wixpress.com",
    "sentry.io",
    "yourdomain",
    "votredomaine",
  ];

  return [...new Set(matches)]
    .map((e) => e.trim().toLowerCase())
    .filter((email) => !blocked.some((bad) => email.includes(bad)));
}

function extractPhonesFromText(text: string): string[] {
  const matches =
    text.match(
      /(?:\+33[\s.-]?[1-9](?:[\s.-]?\d{2}){4}|0[1-9](?:[\s.-]?\d{2}){4})/g,
    ) ?? [];

  return [...new Set(matches.map((p) => p.replace(/\s+/g, " ").trim()))];
}

function scoreEmail(email: string): number {
  let score = 0;

  if (/contact|info|bonjour|hello|formation|admin|accueil/i.test(email)) {
    score += 5;
  }

  if (!/no-reply|noreply|do-not-reply/i.test(email)) {
    score += 3;
  }

  if (email.length < 40) {
    score += 1;
  }

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

function chooseBestPhone(phones: string[]): string | null {
  if (!phones.length) return null;
  return phones[0] ?? null;
}

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
    `${org}-formation.fr`,
    `${org}-formation.com`,
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

function detectTrainingDomainFromText(text: string): string | null {
  const content = normalizeText(text).toLowerCase();

  const rules: Array<{ label: string; keywords: string[] }> = [
    {
      label: "bien-être / accompagnement",
      keywords: [
        "massage",
        "bien etre",
        "therapie",
        "therapeute",
        "coaching",
        "relaxation",
        "energetique",
        "naturopathie",
      ],
    },
    {
      label: "sécurité / prévention",
      keywords: [
        "securite",
        "habilitation",
        "incendie",
        "sst",
        "prevention",
        "risques",
      ],
    },
    {
      label: "bureautique / numérique",
      keywords: [
        "excel",
        "word",
        "bureautique",
        "informatique",
        "digital",
        "numerique",
        "logiciel",
      ],
    },
    {
      label: "management / RH",
      keywords: [
        "management",
        "ressources humaines",
        "rh",
        "leadership",
        "recrutement",
        "equipe",
      ],
    },
    {
      label: "commerce / vente / marketing",
      keywords: [
        "vente",
        "commerce",
        "marketing",
        "communication",
        "prospection",
        "reseaux sociaux",
      ],
    },
    {
      label: "langues",
      keywords: ["anglais", "francais", "espagnol", "langue", "linguistique"],
    },
    {
      label: "sport / fitness",
      keywords: [
        "sport",
        "fitness",
        "remise en forme",
        "personal trainer",
        "musculation",
      ],
    },
  ];

  for (const rule of rules) {
    if (rule.keywords.some((keyword) => content.includes(keyword))) {
      return rule.label;
    }
  }

  return null;
}

function pickFirstMatchingUrl(
  urls: string[],
  patterns: RegExp[],
): string | null {
  for (const url of urls) {
    if (patterns.some((pattern) => pattern.test(url))) {
      return url;
    }
  }
  return null;
}

async function extractDataFromWebsite(
  websiteUrl: string,
): Promise<ExtractedData> {
  const pagesToTry = [
    websiteUrl,
    new URL("/contact", websiteUrl).toString(),
    new URL("/contactez-nous", websiteUrl).toString(),
    new URL("/qui-sommes-nous", websiteUrl).toString(),
    new URL("/about", websiteUrl).toString(),
    new URL("/mentions-legales", websiteUrl).toString(),
  ];

  const visited = new Set<string>();
  const aggregatedEmails = new Set<string>();
  const aggregatedPhones = new Set<string>();
  const aggregatedUrls = new Set<string>();
  const pageTexts: string[] = [];

  for (const pageUrl of pagesToTry) {
    if (visited.has(pageUrl)) continue;
    visited.add(pageUrl);

    const html = await fetchHtml(pageUrl);
    if (!html) continue;

    const $ = cheerio.load(html);

    const bodyText = $("body").text();
    pageTexts.push(bodyText);
    pageTexts.push(html);

    const hrefs = $("a")
      .map((_, el) => $(el).attr("href") ?? "")
      .get()
      .filter(Boolean);

    for (const href of hrefs) {
      aggregatedUrls.add(href);
    }

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
    const textPhones = extractPhonesFromText(bodyText + "\n" + html);

    for (const email of [...mailtoEmails, ...textEmails]) {
      aggregatedEmails.add(email);
    }

    for (const phone of textPhones) {
      aggregatedPhones.add(phone);
    }
  }

  const normalizedUrls = [...aggregatedUrls]
    .map((url) => {
      try {
        return new URL(url, websiteUrl).toString();
      } catch {
        return null;
      }
    })
    .filter((url): url is string => Boolean(url));

  const linkedinUrl = pickFirstMatchingUrl(normalizedUrls, [/linkedin\.com/i]);

  const facebookUrl = pickFirstMatchingUrl(normalizedUrls, [
    /facebook\.com/i,
    /fb\.me/i,
  ]);

  const whatsappUrl = pickFirstMatchingUrl(normalizedUrls, [
    /wa\.me/i,
    /whatsapp\.com/i,
    /api\.whatsapp\.com/i,
  ]);

  const trainingDomain = detectTrainingDomainFromText(pageTexts.join("\n"));

  return {
    emails: [...aggregatedEmails],
    phones: [...aggregatedPhones],
    linkedinUrl,
    facebookUrl,
    whatsappUrl,
    trainingDomain,
  };
}

async function main() {
  console.log("Enrichissement prospects — démarrage");

  const { data: prospects, error } = await supabase
    .from("prospects")
    .select(
      "id, organization_name, city, website, website_found, email, email_found, phone_found, linkedin_url, facebook_url, whatsapp_url, training_domain, enrichment_status",
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

      const extracted = website
        ? await extractDataFromWebsite(website)
        : {
            emails: [],
            phones: [],
            linkedinUrl: null,
            facebookUrl: null,
            whatsappUrl: null,
            trainingDomain: null,
          };

      const email =
        prospect.email_found ||
        prospect.email ||
        chooseBestEmail(extracted.emails);

      const phone = prospect.phone_found || chooseBestPhone(extracted.phones);

      const linkedinUrl = prospect.linkedin_url || extracted.linkedinUrl;
      const facebookUrl = prospect.facebook_url || extracted.facebookUrl;
      const whatsappUrl = prospect.whatsapp_url || extracted.whatsappUrl;
      const trainingDomain =
        prospect.training_domain || extracted.trainingDomain;

      const hasContact =
        Boolean(email) ||
        Boolean(phone) ||
        Boolean(linkedinUrl) ||
        Boolean(facebookUrl) ||
        Boolean(whatsappUrl);

      const hasAnyUsefulData =
        Boolean(website) || hasContact || Boolean(trainingDomain);

      const finalStatus = hasAnyUsefulData ? "enriched" : "no_result";

      const { error: updateError } = await supabase
        .from("prospects")
        .update({
          website_found: website ?? null,
          email_found: email ?? null,
          phone_found: phone ?? null,
          linkedin_url: linkedinUrl ?? null,
          facebook_url: facebookUrl ?? null,
          whatsapp_url: whatsappUrl ?? null,
          training_domain: trainingDomain ?? null,
          enrichment_status: finalStatus,
          enrichment_source: "website_guess_v2",
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
          phone_found: phone,
          linkedin_url: linkedinUrl,
          facebook_url: facebookUrl,
          whatsapp_url: whatsappUrl,
          training_domain: trainingDomain,
          status: finalStatus,
        },
      });

      console.log(
        `OK → website: ${website ?? "aucun"} | email: ${email ?? "aucun"} | phone: ${phone ?? "aucun"} | linkedin: ${linkedinUrl ?? "aucun"} | facebook: ${facebookUrl ?? "aucun"} | whatsapp: ${whatsappUrl ?? "aucun"} | domaine: ${trainingDomain ?? "aucun"}`,
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
