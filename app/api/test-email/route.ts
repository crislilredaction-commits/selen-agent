import { NextResponse } from "next/server";
import { sendProspectQuestionnaireEmail } from "@/src/lib/email";

export async function GET() {
  await sendProspectQuestionnaireEmail({
    to: "crislil.redaction@gmail.com",
    organizationName: "Test Selen",
    prospectId: "test-prospect-id",
  });

  return NextResponse.json({ message: "Email envoyé" });
}
