import dotenv from "dotenv";
import { Resend } from "resend";
import fs from "fs";
import path from "path";

dotenv.config({ path: ".env.local" });

const EMAIL_SENDING_ENABLED = process.env.EMAIL_SENDING_ENABLED === "true";

function getResendClient() {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY manquant");
  }

  return new Resend(resendApiKey);
}

function getLogoAttachment() {
  const logoPath = path.join(
    process.cwd(),
    "public",
    "logo-selen-editions.png",
  );
  const logoBuffer = fs.readFileSync(logoPath);

  return {
    filename: "logo-selen-editions.png",
    content: logoBuffer,
    cid: "selenlogo",
  };
}

export async function sendProspectQuestionnaireEmail({
  to,
  organizationName,
  prospectId,
}: {
  to: string;
  organizationName?: string | null;
  prospectId: string;
}) {
  const questionnaireLink = `https://tally.so/r/9q11o1?prospect_id=${prospectId}`;

  if (!EMAIL_SENDING_ENABLED) {
    console.log("EMAIL NON ENVOYÉ (EMAIL_SENDING_ENABLED=false)", {
      to,
      subject: "Félicitations pour votre NDA ✨",
      organizationName,
    });
    return { blocked: true };
  }

  const resend = getResendClient();

  return await resend.emails.send({
    from: "Selion ✨ <hello@selen-editions.fr>",

    to,

    subject: "Félicitations pour cette nouvelle étape ✨",

    attachments: [getLogoAttachment()],

    html: `
  <p>Bonjour ✨</p>

  <p><strong>Félicitations pour cette nouvelle étape dans votre activité de formation 🎉</strong></p>

  <p>Vous le savez peut-être déjà : transmettre, former, accompagner… c’est une chose 🌟  
  Mais gérer toute la partie administrative au quotidien, c’en est une autre.</p>

  <p>Depuis plusieurs années, nous accompagnons et auditons des centaines de formateurs et d’organismes de formation.  
  Et une réalité revient souvent : <strong>les papiers, ce n’est pas ce qu’ils préfèrent</strong> 😅</p>

  <p>Entre la gestion du quotidien, les obligations administratives et les grandes étapes comme <strong>Qualiopi</strong> ou certains audits, il est facile de se sentir un peu perdu… ou de remettre certaines choses à plus tard 🧭</p>

  <p>Chez <strong>Selen Editions</strong>, notre mission est justement de rendre tout cela plus simple, plus clair et plus rassurant ✨</p>

  <p>Cette semaine, nous proposons un <strong>mini diagnostic gratuit</strong> pour mieux comprendre où vous en êtes aujourd’hui.</p>

  <p>⭐ En remerciement, vous recevrez ensuite un <strong>guide offert</strong> pour vous aider à structurer plus sereinement votre gestion administrative, éviter les erreurs fréquentes et avancer avec davantage de clarté…</p>

  <p style="margin:20px 0;">
    <a href="${questionnaireLink}" style="background:#c25b12;color:white;padding:12px 18px;text-decoration:none;border-radius:6px;">
      Répondre au questionnaire 🔮
    </a>
  </p>

  <p>Cela prend environ <strong>2 minutes</strong> ⏳  
  et peut déjà vous aider à voir plus clairement les prochains points à sécuriser.</p>

  <p>À bientôt 🌿<br>
  <strong>Sélion ✨</strong><br>
  Selen Editions</p>

  <img src="cid:selenlogo" alt="Selen Editions" width="200" style="display:block;margin-top:20px;" />
`,
  });
}

function getOfferLabel(offer: string | null | undefined) {
  switch (offer) {
    case "prepa_qualiopi":
      return "la préparation à l’audit Qualiopi";
    case "audit_blanc":
      return "l’audit blanc";
    case "gestion_quotidienne":
      return "la gestion administrative au quotidien";
    case "infos_uniquement":
      return "des ressources d’information";
    case "garder_contact":
      return "un maintien du contact pour la suite";
    default:
      return "un accompagnement adapté à votre situation";
  }
}

function getOfferIntro(offer: string | null | undefined) {
  switch (offer) {
    case "prepa_qualiopi":
      return "Au vu de vos réponses, il semble que la préparation à l’audit Qualiopi soit l’accompagnement le plus pertinent pour vous en ce moment.";
    case "audit_blanc":
      return "Au vu de vos réponses, un audit blanc semble être la meilleure étape pour vérifier sereinement ce qui est déjà prêt et ce qui mérite encore quelques ajustements.";
    case "gestion_quotidienne":
      return "Au vu de vos réponses, un accompagnement autour de la gestion administrative au quotidien semble pouvoir vous apporter le plus de sérénité et de structure.";
    case "infos_uniquement":
      return "Au vu de vos réponses, il semble plus juste de commencer par vous transmettre des repères utiles et concrets, sans vous bousculer.";
    case "garder_contact":
      return "Au vu de vos réponses, le plus simple est sans doute de garder le contact pour le moment, afin que vous puissiez avancer à votre rythme.";
    default:
      return "Au vu de vos réponses, nous pensons qu’un accompagnement adapté pourrait vous être utile.";
  }
}

function getDiagnosticTitle(offer: string | null | undefined) {
  switch (offer) {
    case "prepa_qualiopi":
      return "Diagnostic Selen : vous entrez dans une phase de structuration importante ✨";
    case "audit_blanc":
      return "Diagnostic Selen : votre base semble posée, mais un regard extérieur serait utile 🔎";
    case "gestion_quotidienne":
      return "Diagnostic Selen : vous gagneriez à alléger et structurer votre gestion au quotidien 🌿";
    case "infos_uniquement":
      return "Diagnostic Selen : vous avez surtout besoin de repères simples et concrets 📘";
    case "garder_contact":
      return "Diagnostic Selen : votre situation semble encore en mouvement, sans urgence immédiate 🌱";
    default:
      return "Diagnostic Selen : voici une première lecture de votre situation ✨";
  }
}

function getDiagnosticSummary(offer: string | null | undefined) {
  switch (offer) {
    case "prepa_qualiopi":
      return "Vos réponses montrent que vous êtes probablement à un moment charnière : il devient important de consolider votre organisation pour avancer plus sereinement vers les prochaines exigences qualité.";
    case "audit_blanc":
      return "Vos réponses laissent penser que certaines bases sont déjà présentes, mais qu’un audit blanc pourrait vous aider à repérer plus clairement ce qui est sécurisé… et ce qui mérite encore quelques ajustements.";
    case "gestion_quotidienne":
      return "Vos réponses montrent surtout un besoin de clarté et de fluidité dans la gestion administrative du quotidien, afin d’éviter l’accumulation, les oublis et la charge mentale inutile.";
    case "infos_uniquement":
      return "Vos réponses montrent qu’il n’est pas forcément nécessaire de passer tout de suite à un accompagnement poussé. En revanche, quelques repères concrets peuvent déjà vous faire gagner en compréhension et en sérénité.";
    case "garder_contact":
      return "Vos réponses montrent qu’il est sans doute plus juste, pour le moment, de vous laisser avancer à votre rythme, tout en gardant un point de contact si vos besoins évoluent dans les prochaines semaines.";
    default:
      return "Vos réponses nous donnent une première vision de votre situation et mettent en lumière quelques axes simples à clarifier pour avancer plus sereinement.";
  }
}

function getDiagnosticNextStep(offer: string | null | undefined) {
  switch (offer) {
    case "prepa_qualiopi":
      return "Le prochain pas le plus utile serait de clarifier vos bases administratives et qualité avant qu’un audit ou une échéance importante n’arrive.";
    case "audit_blanc":
      return "Le prochain pas le plus utile serait de faire un point objectif sur ce qui est déjà en place, pour éviter de naviguer à l’aveugle.";
    case "gestion_quotidienne":
      return "Le prochain pas le plus utile serait de simplifier votre organisation quotidienne, afin de gagner du temps et de réduire la pression administrative.";
    case "infos_uniquement":
      return "Le prochain pas le plus utile serait de vous appuyer sur quelques repères concrets pour mieux comprendre vos priorités, sans vous surcharger.";
    case "garder_contact":
      return "Le prochain pas le plus utile est peut-être simplement de garder un lien, puis de refaire un point au moment le plus opportun pour vous.";
    default:
      return "Le prochain pas le plus utile est de clarifier vos priorités administratives pour avancer avec plus de sérénité.";
  }
}

export async function sendQuestionnaireFollowupEmail({
  to,
  organizationName,
  recommendedOfferPrimary,
}: {
  to: string;
  organizationName?: string | null;
  recommendedOfferPrimary?: string | null;
}) {
  const pdfLink =
    "https://selion.selen-editions.fr/guide-dossier-stagiaire-qualiopi.pdf";
  const calendlyLink = "https://calendly.com/romaric-paymal/rdv-romaric-paymal";

  const diagnosticTitle = getDiagnosticTitle(recommendedOfferPrimary);
  const diagnosticSummary = getDiagnosticSummary(recommendedOfferPrimary);
  const diagnosticNextStep = getDiagnosticNextStep(recommendedOfferPrimary);

  if (!EMAIL_SENDING_ENABLED) {
    console.log("EMAIL NON ENVOYÉ (EMAIL_SENDING_ENABLED=false)", {
      to,
      subject: "Votre guide Selen + la suite la plus adaptée ✨",
      organizationName,
      recommendedOfferPrimary,
    });
    return { blocked: true };
  }

  const resend = getResendClient();

  return await resend.emails.send({
    from: "Selion ✨ <hello@selen-editions.fr>",
    to,
    subject: "Votre guide Selen + la suite la plus adaptée ✨",
    attachments: [getLogoAttachment()],
    html: `
  <p>Bonjour${organizationName ? ` ${organizationName}` : ""} ✨</p>

  <p><strong>Merci d’avoir pris le temps de répondre à notre questionnaire 🌟</strong></p>

  <p><strong>${diagnosticTitle}</strong></p>

  <p>${diagnosticSummary}</p>

  <p>👉 ${diagnosticNextStep}</p>

  <p>${offerIntro}</p>

  <p>Comme promis, voici votre <strong>guide Selen</strong>, conçu pour vous aider à structurer plus sereinement la gestion administrative de votre activité de formation.</p>

  <p>Vous y découvrirez comment poser des bases solides, éviter certaines erreurs fréquentes… et avancer avec plus de clarté dans les prochaines étapes importantes.</p>

  <p style="margin:20px 0;">
    <a href="${pdfLink}" style="background:#c25b12;color:white;padding:12px 18px;text-decoration:none;border-radius:6px;">
      Télécharger le guide 📘✨
    </a>
  </p>

  <p>L’objectif de ce guide est simple : vous permettre de <strong>reprendre le contrôle sur votre organisation</strong>, gagner du temps au quotidien et vous concentrer pleinement sur votre mission de formateur 🌿</p>

  <p>Si vous souhaitez aller plus loin, nous pouvons échanger tranquillement sur <strong>${offerLabel}</strong> et voir ensemble ce qui serait le plus utile pour votre organisme.</p>

  <p style="margin:20px 0;">
    <a href="${calendlyLink}" style="background:#2b211b;color:#f3d9a2;padding:12px 18px;text-decoration:none;border-radius:6px;border:1px solid #7a5a31;">
      Réserver un échange avec Romaric 📅⭐
    </a>
  </p>

  <p>Chez <strong>Selen</strong>, nous aimons aider les formateurs et organismes de formation à avancer avec moins de brouillard administratif… et beaucoup plus de sérénité au quotidien ✨</p>

  <p>À très bientôt 🌱<br>
  <strong>Sélion ✨</strong><br>
  Selen Editions</p>

  <img src="cid:selenlogo" alt="Selen Editions" width="200" style="display:block;margin-top:20px;" />
`,
  });
}

export async function sendProspectFollowupEmail({
  to,
  organizationName,
  prospectId,
}: {
  to: string;
  organizationName?: string | null;
  prospectId: string;
}) {
  const questionnaireLink = `https://tally.so/r/9q11o1?prospect_id=${prospectId}`;

  if (!EMAIL_SENDING_ENABLED) {
    console.log("EMAIL NON ENVOYÉ (EMAIL_SENDING_ENABLED=false)", {
      to,
      subject: "Je me permets de vous relancer 🙂",
      organizationName,
    });
    return { blocked: true };
  }

  const resend = getResendClient();

  return await resend.emails.send({
    from: "Selion ✨ <hello@selen-editions.fr>",
    to,
    subject: "Votre diagnostic administratif Selen est prêt ⭐",
    attachments: [getLogoAttachment()],
    html: `
  <p>Bonjour${organizationName ? ` ${organizationName}` : ""} ✨</p>

  <p>Je me permets de revenir vers vous suite à mon précédent message.</p>

  <p>Lorsque l’on développe une activité de formation, il est fréquent de découvrir progressivement certaines obligations administratives…  
  et de ne pas toujours savoir par où commencer 🌿</p>

  <p>Pour vous aider à y voir plus clair, nous avons préparé un <strong>mini diagnostic gratuit</strong> qui permet de faire rapidement le point sur votre organisation actuelle.</p>

  <p style="margin:20px 0;">
    <a href="${questionnaireLink}" style="background:#c25b12;color:white;padding:12px 18px;text-decoration:none;border-radius:6px;">
      Répondre au questionnaire 🔮✨
    </a>
  </p>

  <p>Cela prend environ <strong>2 minutes</strong> ⏳  
  et peut déjà vous aider à identifier les points sécurisés… et ceux qui méritent simplement un peu d’attention.</p>

  <p>Si ce sujet ne vous concerne pas pour le moment ou si vous ne souhaitez pas être accompagné, aucun souci 🙂  
  <strong>Sans réponse de votre part, nous ne vous recontacterons pas.</strong></p>

  <p>À très bientôt 🌱<br>
  <strong>Sélion ✨</strong><br>
  Selen Editions</p>

  <img src="cid:selenlogo" alt="Selen Editions" width="200" style="display:block;margin-top:20px;" />
`,
  });
}

export async function sendTestEmail() {
  if (!EMAIL_SENDING_ENABLED) {
    console.log("EMAIL NON ENVOYÉ (EMAIL_SENDING_ENABLED=false)", {
      to: "crislil.redaction@gmail.com",
      subject: "Test Selion ✨",
    });
    return { blocked: true };
  }

  const resend = getResendClient();

  return await resend.emails.send({
    from: "Selion ✨ <selion@selen-editions.fr>",
    to: ["crislil.redaction@gmail.com"],
    subject: "Test Selion ✨",
    attachments: [getLogoAttachment()],
    html: `<p>Test email Selion ✨</p>`,
  });
}
