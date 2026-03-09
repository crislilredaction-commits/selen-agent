import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendQuestionnaireFollowupEmail } from "@/src/lib/email";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL manquant");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function computeRecommendation(fields: any[]) {
  const offers: Record<string, number> = {
    prepa_qualiopi: 0,
    audit_blanc: 0,
    gestion_quotidienne: 0,
    infos_uniquement: 0,
    garder_contact: 0,
  };

  const findAnswer = (label: string) => fields.find((f) => f.label === label);

  const getOptionText = (field: any) => {
    if (!field || !field.options || !field.value) return null;
    const id = Array.isArray(field.value) ? field.value[0] : field.value;
    const option = field.options.find((o: any) => o.id === id);
    return option?.text || null;
  };

  const q1 = getOptionText(
    findAnswer("Aujourd’hui, où en êtes-vous avec Qualiopi ?"),
  );

  if (q1 === "Je me renseigne encore") {
    offers.gestion_quotidienne++;
    offers.prepa_qualiopi++;
  }

  if (q1 === "Je pense la passer mais pas tout de suite") {
    offers.gestion_quotidienne++;
    offers.prepa_qualiopi++;
  }

  if (q1 === "Je souhaite passer la certification prochainement") {
    offers.prepa_qualiopi += 2;
  }

  if (q1 === "Je suis déjà certifié Qualiopi") {
    offers.audit_blanc++;
    offers.gestion_quotidienne++;
  }

  if (q1 === "Je ne pense pas la passer") {
    offers.garder_contact += 2;
  }

  const q2 = getOptionText(
    findAnswer(
      "Aujourd'hui, comment vous sentez-vous avec la partie de votre activité ?",
    ),
  );

  if (q2 === "Très à l'aise" || q2 === "Plutôt à l'aise") {
    offers.audit_blanc++;
    offers.prepa_qualiopi++;
  }

  if (q2 === "Moyennement à l'aise") {
    offers.gestion_quotidienne++;
    offers.audit_blanc++;
    offers.prepa_qualiopi++;
  }

  if (
    q2 === "C'est un peu compliqué pour moi" ||
    q2 === "C'est clairement mon point faible 😅"
  ) {
    offers.gestion_quotidienne += 2;
    offers.prepa_qualiopi++;
  }

  const q3 = getOptionText(
    findAnswer("Quel type d’accompagnement vous semblerait le plus utile ?"),
  );

  if (q3 === "Une aide ponctuelle sur certaines étapes importantes") {
    offers.prepa_qualiopi++;
    offers.audit_blanc++;
  }

  if (q3 === "Un accompagnement complet jusqu’à la certification") {
    offers.gestion_quotidienne++;
    offers.prepa_qualiopi++;
  }

  if (q3 === "Un audit blanc pour vérifier si tout est prêt") {
    offers.audit_blanc += 2;
  }

  if (q3 === "Une aide pour simplifier mon suivi administratif au quotidien") {
    offers.gestion_quotidienne += 2;
    offers.prepa_qualiopi++;
  }

  if (q3 === "Je préfère recevoir des informations pour le moment") {
    offers.infos_uniquement += 2;
  }

  const q4 = getOptionText(
    findAnswer("Si vous deviez décrire votre situation aujourd’hui :"),
  );

  if (
    q4 === "Je démarre mon activité" ||
    q4 === "Je suis déjà lancé mais je structure encore mon organisation"
  ) {
    offers.prepa_qualiopi++;
    offers.gestion_quotidienne++;
  }

  if (q4 === "Mon activité est bien installée") {
    offers.gestion_quotidienne++;
  }

  if (q4 === "Je suis déjà certifié Qualiopi") {
    offers.gestion_quotidienne++;
  }

  const q5 = getOptionText(
    findAnswer("Avez-vous déjà une échéance en tête pour Qualiopi ?"),
  );

  if (q5 === "Oui, dans les 3 mois") {
    offers.prepa_qualiopi += 2;
  }

  if (q5 === "Oui, dans les 6 mois" || q5 === "Oui, dans l'année") {
    offers.prepa_qualiopi++;
    offers.gestion_quotidienne++;
  }

  if (q5 === "Non pas encore") {
    offers.garder_contact++;
  }

  const sorted = Object.entries(offers)
    .sort((a, b) => b[1] - a[1])
    .map((x) => x[0]);

  return {
    primary: sorted[0] ?? null,
    secondary: sorted[1] ?? null,
  };
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    const fields = body?.data?.fields ?? [];

    const prospectField = fields.find(
      (field: any) =>
        field.label === "prospect_id" || field.key === "prospect_id",
    );

    const prospectId = prospectField?.value ?? null;

    if (!prospectId) {
      return NextResponse.json(
        { error: "prospect_id manquant" },
        { status: 400 },
      );
    }

    const recommendation = computeRecommendation(fields);

    const { data: existingProspect, error: fetchError } = await supabase
      .from("prospects")
      .select(
        "id, organization_name, email, email_found, recommended_offer_primary, offer_mail_sent_at",
      )
      .eq("id", prospectId)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("prospects")
      .update({
        questionnaire_status: "completed",
        questionnaire_response_json: body,
        questionnaire_completed_at: now,
        workflow_status: "questionnaire_completed",
        recommended_offer_primary: recommendation.primary,
        recommended_offer_secondary: recommendation.secondary,
      })
      .eq("id", prospectId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const targetEmail =
      existingProspect.email_found || existingProspect.email || null;

    if (targetEmail && !existingProspect.offer_mail_sent_at) {
      await sendQuestionnaireFollowupEmail({
        to: targetEmail,
        organizationName: existingProspect.organization_name,
        recommendedOfferPrimary: recommendation.primary,
      });

      const sentAt = new Date().toISOString();

      const { error: mailUpdateError } = await supabase
        .from("prospects")
        .update({
          offer_mail_sent_at: sentAt,
          pdf_sent_at: sentAt,
          calendly_sent_at: sentAt,
        })
        .eq("id", prospectId);

      if (mailUpdateError) {
        return NextResponse.json(
          { error: mailUpdateError.message },
          { status: 500 },
        );
      }

      const { error: logError } = await supabase
        .from("prospect_messages")
        .insert({
          prospect_id: prospectId,
          channel: "email",
          direction: "outbound",
          message_type: "questionnaire_followup_email",
          subject: "Votre guide Selen + la suite la plus adaptée ✨",
          body: `Mail automatique envoyé après questionnaire avec guide PDF + lien Calendly. Recommandation principale : ${recommendation.primary ?? "—"}.`,
          delivery_status: "sent",
          auto_generated: true,
          human_validated: false,
          validation_required: false,
        });

      if (logError) {
        console.error("LOG ERROR =", logError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("WEBHOOK ERROR =", error);
    return NextResponse.json(
      { error: "Erreur webhook Tally" },
      { status: 500 },
    );
  }
}
