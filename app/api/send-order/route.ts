import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      prospectId,
      recipientEmail,
      subject,
      message,
      workflowStatus = "offer_sent",
    } = body ?? {};

    if (!prospectId) {
      return NextResponse.json(
        { error: "prospectId manquant." },
        { status: 400 },
      );
    }

    if (!recipientEmail) {
      return NextResponse.json(
        { error: "Email destinataire manquant." },
        { status: 400 },
      );
    }

    if (!subject) {
      return NextResponse.json({ error: "Sujet manquant." }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ error: "Message manquant." }, { status: 400 });
    }

    const fromEmail =
      process.env.ORDER_FROM_EMAIL ||
      process.env.RESEND_FROM_EMAIL ||
      "Sélion <onboarding@resend.dev>";

    const sendResult = await resend.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject,
      text: message,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #2b211b; white-space: pre-wrap;">
          ${escapeHtml(message).replace(/\n/g, "<br />")}
        </div>
      `,
    });

    if (sendResult.error) {
      return NextResponse.json(
        { error: sendResult.error.message || "Erreur Resend." },
        { status: 500 },
      );
    }

    const { error: messageError } = await supabase
      .from("prospect_messages")
      .insert({
        prospect_id: prospectId,
        channel: "email",
        direction: "outbound",
        message_type: "order_form",
        subject,
        body: `Destinataire : ${recipientEmail}\n\n${message}`,
        delivery_status: "sent",
        auto_generated: false,
        human_validated: true,
        validation_required: false,
      });

    if (messageError) {
      return NextResponse.json(
        {
          error: `Mail envoyé, mais impossible d’enregistrer l’historique : ${messageError.message}`,
        },
        { status: 500 },
      );
    }

    const { error: prospectError } = await supabase
      .from("prospects")
      .update({
        workflow_status: workflowStatus,
        updated_by_human_at: new Date().toISOString(),
      })
      .eq("id", prospectId);

    if (prospectError) {
      return NextResponse.json(
        {
          error: `Mail envoyé, mais impossible de mettre à jour le prospect : ${prospectError.message}`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erreur serveur." },
      { status: 500 },
    );
  }
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
