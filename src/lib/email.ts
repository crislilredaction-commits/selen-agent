import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { Resend } from "resend";

const EMAIL_SENDING_ENABLED = process.env.EMAIL_SENDING_ENABLED === false;

function getResendClient() {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY manquant");
  }

  return new Resend(resendApiKey);
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
  const resend = getResendClient();
  const questionnaireLink = `https://tally.so/r/9q11o1?prospect_id=${prospectId}`;
  if (!EMAIL_SENDING_ENABLED) {
    console.log("EMAIL BLOQUÉ (mode test)", {
      to,
      subject: "...",
    });
    return { blocked: true };
  }

  return await resend.emails.send({
    from: "Selion ✨ <hello@selen-editions.fr>",
    to,
    subject: "Félicitations pour votre NDA ✨",
    html: `
      
      <p>Bonjour ✨</p>

      <p>Vous venez d’obtenir votre numéro de déclaration d’activité. <strong>Félicitations pour cette belle étape 🎉</strong></p>

      <p>Se lancer dans la formation est une aventure passionnante… mais on découvre vite que l’administratif peut parfois ressembler à un petit labyrinthe 🧭</p>

      <p>Chez <strong>Selen Editions</strong>, nous accompagnons des formateurs et des organismes de formation à différents moments de leur parcours : certains démarrent tout juste 🌱, d’autres sont déjà bien installés et souhaitent simplement gagner en sérénité dans leur gestion.</p>

      <p>Nous avons conçu nos accompagnements pour rester accessibles aux formateurs indépendants comme aux structures plus installées.</p>

      <p>Notre mission est simple : transmettre notre expertise pour que l’administratif devienne un allié… et non un obstacle à votre mission de transmission ✨</p>

      <p>Nous avons préparé un mini diagnostic gratuit pour évaluer la préparation administrative de votre organisme :</p>

      <p style="margin:20px 0;">
        <a href="${questionnaireLink}" style="background:#c25b12;color:white;padding:12px 18px;text-decoration:none;border-radius:6px;">
          Répondre au questionnaire 🔮
        </a>
      </p>

      <p>Cela prend 2 minutes et vous permettra de savoir si votre structure est déjà prête pour les obligations de la formation professionnelle ou si certains points méritent d’être sécurisés.</p>

      <p>À bientôt,<br>
      <strong>Sélion ✨</strong><br>
      Selen Editions</p>
      <img src="https://selion.selen-editions.fr/logo-selen-editions.png" alt="Selen Editions" style="max-width:200px;margin-bottom:20px;" />
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

export async function sendQuestionnaireFollowupEmail({
  to,
  organizationName,
  recommendedOfferPrimary,
}: {
  to: string;
  organizationName?: string | null;
  recommendedOfferPrimary?: string | null;
}) {
  const resend = getResendClient();

  const pdfLink =
    "https://selion.selen-editions.fr/guide-dossier-stagiaire-qualiopi.pdf";
  const calendlyLink = "https://calendly.com/romaric-paymal/rdv-romaric-paymal";

  const offerLabel = getOfferLabel(recommendedOfferPrimary);
  const offerIntro = getOfferIntro(recommendedOfferPrimary);

  return await resend.emails.send({
    from: "Selion ✨ <hello@selen-editions.fr>",
    to,
    subject: "Votre guide Selen + la suite la plus adaptée ✨",
    html: `
      
      <p>Bonjour${organizationName ? ` ${organizationName}` : ""} ✨</p>

      <p>Merci d’avoir pris le temps de répondre à notre questionnaire.</p>

      <p>${offerIntro}</p>

      <p>Comme promis, voici le guide Selen consacré aux documents essentiels pour structurer vos dossiers stagiaires et sécuriser votre conformité Qualiopi :</p>

      <p style="margin:20px 0;">
        <a href="${pdfLink}" style="background:#c25b12;color:white;padding:12px 18px;text-decoration:none;border-radius:6px;">
          Télécharger le guide 📘
        </a>
      </p>

      <p>Ce guide vous aidera à mieux comprendre les pièces clés liées aux dossiers clients : présentation de formation, dossier d’inscription, convocation, émargement, évaluations, contenus pédagogiques et questionnaire de satisfaction.</p>

      <p>Si vous souhaitez aller plus loin, nous pouvons échanger sur <strong>${offerLabel}</strong> et voir ce qui serait le plus utile pour votre organisme.</p>

      <p style="margin:20px 0;">
        <a href="${calendlyLink}" style="background:#2b211b;color:#f3d9a2;padding:12px 18px;text-decoration:none;border-radius:6px;border:1px solid #7a5a31;">
          Réserver un échange avec Romaric 📅
        </a>
      </p>

      <p>Chez Selen, nous aimons aider les formateurs et organismes de formation à avancer avec plus de clarté, moins de brouillard administratif… et un peu plus de sérénité au quotidien ✨</p>

      <p>À très bientôt,<br>
      <strong>Sélion ✨</strong><br>
      Selen Editions</p>
      <img src="https://selion.selen-editions.fr/logo-selen-editions.png" alt="Selen Editions" style="max-width:200px;margin-bottom:20px;" />
    `,
  });
}

export async function sendTestEmail() {
  const resend = getResendClient();

  return await resend.emails.send({
    from: "Selion ✨ <selion@selen-editions.fr>",
    to: ["crisli.redaction@gmail.com"],
    subject: "Test Selion ✨",
    html: `<p>Test email Selion ✨</p>`,
  });
}
