import { sendProspectQuestionnaireEmail } from "../src/lib/email";

async function main() {
  console.log("Test premier mail — démarrage");

  await sendProspectQuestionnaireEmail({
    to: "crislil.redaction@gmail.com",
    organizationName: "Test Selen",
    prospectId: "test-prospect-id",
  });

  console.log("Test premier mail — terminé");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
