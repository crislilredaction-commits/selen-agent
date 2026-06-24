import { sendTestEmail } from "../src/lib/email";

async function main() {
  delete process.env.SELION_OUTBOUND_EMAILS_ENABLED;
  delete process.env.RESEND_API_KEY;

  const result = await sendTestEmail();

  if (!("blocked" in result) || !result.blocked) {
    throw new Error("Outbound email guard did not block sendTestEmail");
  }

  console.log("Outbound email guard verified: Resend not required when disabled.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
