import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { Resend } from "resend";

function getResendClient() {
  const resendApiKey = process.env.RESEND_API_KEY;

  console.log("RESEND_API_KEY présente ?", !!resendApiKey);

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

  return await resend.emails.send({
    from: "Selion ✨ <selion@selen-editions.fr>",
    to,
    subject: "Félicitations pour votre NDA ✨",
    html: `
      <img src="https://selion.selen-editions.fr/Logo%20Selen%20Editions.png" alt="Selen Editions" style="max-width:200px;margin-bottom:20px;" />

      <p>Bonjour ✨</p>

      <p>Nous avons remarqué que votre organisme de formation venait d’obtenir son numéro de déclaration d’activité. <strong>Félicitations pour cette belle étape 🎉</strong></p>

      <p>Se lancer dans la formation est une aventure passionnante… mais on découvre vite que l’administratif peut parfois ressembler à un petit labyrinthe 🧭</p>

      <p>Chez <strong>Selen Editions</strong>, nous accompagnons des formateurs et des organismes de formation à différents moments de leur parcours : certains démarrent tout juste 🌱, d’autres sont déjà bien installés et souhaitent simplement gagner en sérénité dans leur gestion.</p>

      <p>Nous avons conçu nos accompagnements pour rester accessibles aux formateurs indépendants comme aux structures plus installées.</p>

      <p>Notre mission est simple : transmettre notre expertise pour que l’administratif devienne un allié… et non un obstacle à votre mission de transmission ✨</p>

      <p>Pour mieux comprendre votre situation, nous avons préparé un court questionnaire (2 minutes environ) :</p>

      <p style="margin:20px 0;">
        <a href="${questionnaireLink}" style="background:#c25b12;color:white;padding:12px 18px;text-decoration:none;border-radius:6px;">
          Répondre au questionnaire 🔮
        </a>
      </p>

      <p>Vos réponses nous permettront simplement de voir si nous pouvons vous être utiles et de quelle manière.</p>

      <p>Dans tous les cas, nous serons ravis de découvrir votre projet.</p>

      <p>À bientôt,<br>
      <strong>Sélion ✨</strong><br>
      Selen Editions</p>
    `,
  });
}

export async function sendTestEmail() {
  const resend = getResendClient();

  return await resend.emails.send({
    from: "Selion ✨ <selion@selen-editions.fr>",
    to: ["crislil.redaction@gmail.com"],
    subject: "Test Selion ✨",
    html: `<p>Test email Selion ✨</p>`,
  });
}
