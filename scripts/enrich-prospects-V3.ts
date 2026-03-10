import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ENRICHMENT_BATCH_SIZE = 200;

type ProspectRow = {
  id: string;
  organization_name: string | null;
  city: string | null;
  website: string | null;
  website_found: string | null;
  email: string | null;
  email_found: string | null;
  enrichment_status: string | null;
  prospect_type: string | null;
  linkedin_url?: string | null;
  facebook_url?: string | null;
  whatsapp_url?: string | null;
  phone_found?: string | null;
};

type AnnuaireResult = {
  website: string | null;
  phone: string | null;
  isOrganismeFormation: boolean;
  isQualiopi: boolean;
  naf: string | null;
  city: string | null;
};

type ContactExtractionResult = {
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  facebookUrl: string | null;
  whatsappUrl: string | null;
  qualiopi: boolean;
};

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchHtml(url: string) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      redirect: "follow",
    });

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    return await res.text();
  } catch {
    return null;
  }
}

function extractEmails(text: string) {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];

  const blockedPatterns = [
    /\.png$/i,
    /\.jpg$/i,
    /\.jpeg$/i,
    /\.gif$/i,
    /\.webp$/i,
    /\.svg$/i,
    /\.ico$/i,
    /\.css$/i,
    /\.js$/i,
    /example\.com/i,
    /domain\.com/i,
    /email\.com/i,
    /wixpress\.com/i,
    /sentry\.io/i,
    /@\d+x\./i,
  ];

  return [...new Set(matches.map((e) => e.trim().toLowerCase()))].filter(
    (email) => !blockedPatterns.some((pattern) => pattern.test(email)),
  );
}

function extractPhones(text: string) {
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

function chooseBestEmail(emails: string[]) {
  if (!emails.length) return null;

  const cleaned = emails.filter(
    (email) =>
      !/\.(png|jpg|jpeg|gif|webp|svg|ico|css|js)$/i.test(email) &&
      !/@\d+x\./i.test(email),
  );

  if (!cleaned.length) return null;

  return (
    cleaned
      .map((email) => ({ email, score: scoreEmail(email) }))
      .sort((a, b) => b.score - a.score)[0]?.email ?? null
  );
}

function chooseBestPhone(phones: string[]) {
  if (!phones.length) return null;
  return phones[0] ?? null;
}

async function searchAnnuaireEntreprises(
  name: string,
): Promise<AnnuaireResult | null> {
  try {
    const query = encodeURIComponent(name);
    const url = `https://recherche-entreprises.api.gouv.fr/search?q=${query}`;

    const res = await fetch(url);
    const data = await res.json();

    const company = data.results?.[0];
    if (!company) return null;

    console.log("Annuaire Entreprises résultat :", company);

    return {
      website: company?.site_web ?? null,
      phone: company?.telephone ?? null,
      isOrganismeFormation:
        company?.complements?.est_organisme_formation ?? false,
      isQualiopi: company?.complements?.est_qualiopi ?? false,
      naf: company?.activite_principale ?? null,
      city: company?.siege?.libelle_commune ?? null,
    };
  } catch {
    return null;
  }
}

async function searchDuckDuckGo(name: string, city?: string | null) {
  try {
    const query = encodeURIComponent(`${name} ${city ?? ""} formation`.trim());
    const url = `https://duckduckgo.com/html/?q=${query}`;

    const html = await fetchHtml(url);

    if (!html) {
      console.log(`DDG: pas de HTML pour ${name}`);
      return null;
    }

    const $ = cheerio.load(html);
    const rawHref = $(".result__a").first().attr("href");

    if (!rawHref) {
      console.log(`DDG: aucun lien trouvé pour ${name}`);
      return null;
    }

    console.log(`DDG raw href pour ${name}: ${rawHref}`);

    let decodedUrl: string | null = null;

    if (rawHref.includes("uddg=")) {
      const match = rawHref.match(/uddg=([^&]+)/);
      decodedUrl = match ? decodeURIComponent(match[1]) : null;
    } else if (rawHref.startsWith("//")) {
      decodedUrl = `https:${rawHref}`;
    } else if (rawHref.startsWith("/")) {
      decodedUrl = `https://duckduckgo.com${rawHref}`;
    } else {
      decodedUrl = rawHref;
    }

    if (!decodedUrl) {
      console.log(`DDG: impossible de décoder le lien pour ${name}`);
      return null;
    }

    console.log(`DDG decoded url pour ${name}: ${decodedUrl}`);

    const blockedDomains = [
      "pagesjaunes.fr",
      "societe.com",
      "pappers.fr",
      "annuaire-entreprises.data.gouv.fr",
      "linkedin.com",
      "facebook.com",
      "instagram.com",
      "youtube.com",
    ];

    if (blockedDomains.some((domain) => decodedUrl.includes(domain))) {
      console.log(`DDG: domaine ignoré pour ${name}: ${decodedUrl}`);
      return null;
    }

    return decodedUrl;
  } catch (error) {
    console.log(`DDG erreur pour ${name}:`, error);
    return null;
  }
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

async function extractContacts(
  website: string,
): Promise<ContactExtractionResult> {
  const pagesToTry = [
    website,
    new URL("/contact", website).toString(),
    new URL("/contactez-nous", website).toString(),
    new URL("/mentions-legales", website).toString(),
    new URL("/qui-sommes-nous", website).toString(),
    new URL("/about", website).toString(),
  ];

  const visited = new Set<string>();
  const allEmails = new Set<string>();
  const allPhones = new Set<string>();
  const allUrls = new Set<string>();
  let hasQualiopiMention = false;

  for (const pageUrl of pagesToTry) {
    if (visited.has(pageUrl)) continue;
    visited.add(pageUrl);

    const html = await fetchHtml(pageUrl);
    if (!html) continue;

    const $ = cheerio.load(html);

    const bodyText = $("body").text();
    const hrefs = $("a")
      .map((_, el) => $(el).attr("href") ?? "")
      .get()
      .filter(Boolean);

    const mailtoEmails = hrefs
      .filter((href) => href.startsWith("mailto:"))
      .map((href) =>
        href
          .replace(/^mailto:/i, "")
          .split("?")[0]
          .trim()
          .toLowerCase(),
      );

    const textEmails = extractEmails(bodyText + "\n" + html);
    const textPhones = extractPhones(bodyText + "\n" + html);

    for (const email of [...mailtoEmails, ...textEmails]) {
      allEmails.add(email);
    }

    for (const phone of textPhones) {
      allPhones.add(phone);
    }

    for (const href of hrefs) {
      try {
        allUrls.add(new URL(href, website).toString());
      } catch {
        // ignore
      }
    }

    if ((bodyText + " " + html).toLowerCase().includes("qualiopi")) {
      hasQualiopiMention = true;
    }
  }

  const normalizedUrls = [...allUrls];
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

  return {
    email: chooseBestEmail([...allEmails]),
    phone: chooseBestPhone([...allPhones]),
    linkedinUrl,
    facebookUrl,
    whatsappUrl,
    qualiopi: hasQualiopiMention,
  };
}

async function main() {
  console.log("Robot enrichissement V4 démarrage");

  const todayParis = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const todayParis = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const { data: prospects } = await supabase
    .from("prospects")
    .select("*")
    .eq("source", "selion_1_nda")
    .eq("is_visible", true)
    .is("email_found", null)
    .in("enrichment_status", ["pending", "error"])
    .gte("created_at", `${todayParis}T00:00:00+01:00`)
    .order("created_at", { ascending: false })
    .limit(ENRICHMENT_BATCH_SIZE);

  if (!prospects?.length) {
    console.log("Aucun prospect à enrichir.");
    return;
  }

  for (const prospect of prospects as ProspectRow[]) {
    const name = prospect.organization_name;
    if (!name) continue;

    console.log("Recherche :", name);

    let website: string | null = null;
    let phone: string | null = null;
    let email: string | null = null;
    let linkedinUrl: string | null = prospect.linkedin_url ?? null;
    let facebookUrl: string | null = prospect.facebook_url ?? null;
    let whatsappUrl: string | null = prospect.whatsapp_url ?? null;
    let qualiopi = false;
    let isOrganismeFormation = false;
    let naf: string | null = null;

    const annuaire = await searchAnnuaireEntreprises(name);

    if (annuaire) {
      website = annuaire.website;
      phone = annuaire.phone;
      qualiopi = annuaire.isQualiopi;
      isOrganismeFormation = annuaire.isOrganismeFormation;
      naf = annuaire.naf;
    }

    if (annuaire && isOrganismeFormation === false) {
      console.log(`Ignoré (pas OF) : ${name}`);

      await supabase
        .from("prospects")
        .update({
          enrichment_status: "identified",
          enrichment_source: "annuaire_entreprises_v1",
          already_qualiopi: qualiopi,
          naf_code: naf,
          enriched_at: new Date().toISOString(),
        })
        .eq("id", prospect.id);

      continue;
    }

    if (!website) {
      website = await searchDuckDuckGo(name, prospect.city);
    }

    if (website) {
      const contacts = await extractContacts(website);

      email = contacts.email ?? null;
      phone = phone ?? contacts.phone ?? null;
      linkedinUrl = linkedinUrl ?? contacts.linkedinUrl ?? null;
      facebookUrl = facebookUrl ?? contacts.facebookUrl ?? null;
      whatsappUrl = whatsappUrl ?? contacts.whatsappUrl ?? null;
      qualiopi = qualiopi || Boolean(contacts.qualiopi);
    }

    const hasUsefulData =
      Boolean(website) ||
      Boolean(email) ||
      Boolean(phone) ||
      Boolean(linkedinUrl) ||
      Boolean(facebookUrl) ||
      Boolean(whatsappUrl);

    const status = isOrganismeFormation
      ? hasUsefulData
        ? "enriched"
        : "identified"
      : hasUsefulData
        ? "enriched"
        : "no_result";

    const computedProspectType = qualiopi
      ? "qp_ok"
      : isOrganismeFormation
        ? "nouvel_entrant"
        : (prospect.prospect_type ?? null);

    await supabase
      .from("prospects")
      .update({
        website_found: website,
        email_found: email,
        phone_found: phone,
        linkedin_url: linkedinUrl,
        facebook_url: facebookUrl,
        whatsapp_url: whatsappUrl,
        already_qualiopi: qualiopi,
        naf_code: naf,
        prospect_type: computedProspectType,
        enrichment_status: status,
        enrichment_source: "annuaire_plus_ddg_v4",
        enriched_at: new Date().toISOString(),
      })
      .eq("id", prospect.id);

    console.log(
      `OK → ${name} | site: ${website ?? "aucun"} | email: ${email ?? "aucun"} | phone: ${phone ?? "aucun"} | linkedin: ${linkedinUrl ?? "aucun"} | facebook: ${facebookUrl ?? "aucun"} | whatsapp: ${whatsappUrl ?? "aucun"} | status: ${status}`,
    );
  }

  console.log("Robot terminé");
}

main().catch((error) => {
  console.error("Erreur globale :", error);
  process.exit(1);
});
