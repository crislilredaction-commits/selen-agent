"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import ProspectSpellbook from "./ProspectSpellbook";

type Prospect = {
  id: string;
  organization_name: string | null;
  email: string | null;
  email_found: string | null;
  website: string | null;
  website_found: string | null;
  linkedin_url: string | null;
  facebook_url: string | null;
  whatsapp_url: string | null;
  prospect_type: string | null;
  qualiopi_status: string | null;
  naf_code: string | null;
  training_domain: string | null;
  workflow_status: string | null;
  preferred_contact_channel: string | null;
  internal_notes: string | null;
  created_at: string | null;
  first_email_status: string | null;
  first_outreach_sent_at: string | null;
  questionnaire_status: string | null;
  questionnaire_response_json: any;
  questionnaire_completed_at: string | null;
  recommended_offer_primary: string | null;
  recommended_offer_secondary: string | null;
  sales_angle: string | null;
};

type ProspectMessage = {
  id: string;
  channel: string | null;
  direction: string | null;
  message_type: string | null;
  subject: string | null;
  body: string | null;
  delivery_status: string | null;
  created_at: string | null;
};

type Meeting = {
  id: string;
  meeting_status: string | null;
  sale_status: string | null;
  sale_amount: number | null;
  call_outcome: string | null;
  call_summary: string | null;
  followup_needed: boolean | null;
  followup_date: string | null;
};

type Reminder = {
  id: string;
  title: string;
  note: string | null;
  remind_at: string;
  status: string;
};

type Props = {
  prospect: Prospect;
  messages: ProspectMessage[];
  meetings: Meeting[];
  reminders: Reminder[];
};

type ActiveTab = "overview" | "questionnaire" | "history";

type OrderOfferKey =
  | "selen_review"
  | "selen_prepa"
  | "selen_daily"
  | "selen_news"
  | "selen_studio";

const ORDER_OFFERS: Record<
  OrderOfferKey,
  { label: string; price: string; shortDescription: string }
> = {
  selen_review: {
    label: "Selen Review",
    price: "397 €",
    shortDescription: "Audit blanc Qualiopi",
  },
  selen_prepa: {
    label: "Selen Prepa",
    price: "900 €",
    shortDescription: "Système administratif conforme clé en main",
  },
  selen_daily: {
    label: "Selen Daily",
    price: "9 € / apprenant",
    shortDescription: "Gestion administrative quotidienne avec agent dédié",
  },
  selen_news: {
    label: "Selen News",
    price: "7 € / mois",
    shortDescription: "Outil de veille",
  },
  selen_studio: {
    label: "Selen Studio",
    price: "59 € / mois",
    shortDescription: "Plateforme complète",
  },
};

function getOfferKeyFromRecommendedOffer(
  value: string | null | undefined,
): OrderOfferKey {
  const normalized = (value || "").toLowerCase();

  if (normalized.includes("daily")) return "selen_daily";
  if (normalized.includes("news")) return "selen_news";
  if (normalized.includes("studio")) return "selen_studio";
  if (normalized.includes("review") || normalized.includes("audit blanc")) {
    return "selen_review";
  }
  if (
    normalized.includes("prepa") ||
    normalized.includes("prépa") ||
    normalized.includes("qualiopi")
  ) {
    return "selen_prepa";
  }

  return "selen_review";
}

function getOfferKeyFromCallOutcome(
  value: string | null | undefined,
): OrderOfferKey {
  switch (value) {
    case "won_audit_blanc":
      return "selen_review";
    case "won_preparation_qualiopi":
    case "won_preparation_nda":
      return "selen_prepa";
    case "won_gestion_quotidienne":
      return "selen_daily";
    default:
      return "selen_review";
  }
}

function buildOrderMessage(params: {
  organizationName: string;
  offerKey: OrderOfferKey;
  paymentProvider: string;
  paymentLink: string;
  amount?: string;
}) {
  const offer = ORDER_OFFERS[params.offerKey];

  return `Bonjour,

Suite à notre échange, voici votre bon de commande pour ${offer.label}.

Prestation :
${offer.label} — ${offer.shortDescription}

Tarif :
${params.amount || offer.price}

Lien de paiement ${params.paymentProvider === "paypal" ? "PayPal" : "Stripe"} :
${params.paymentLink || "[à compléter]"}

N’hésitez pas à revenir vers nous si vous avez la moindre question.

Bien cordialement,
Romaric`;
}

const SALE_OUTCOMES = new Set([
  "won_audit_blanc",
  "won_preparation_qualiopi",
  "won_preparation_nda",
  "won_gestion_quotidienne",
]);

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function parseTallyResponses(
  data: any,
): { question: string; answer: string }[] {
  if (!data?.data?.fields) return [];

  const fields = data.data.fields;

  return fields
    .filter((f: any) => f.type !== "HIDDEN_FIELDS")
    .map((field: any) => {
      let answer = field.value;

      if (Array.isArray(answer) && field.options) {
        answer = answer
          .map((id: string) => {
            const option = field.options.find((o: any) => o.id === id);
            return option?.text || id;
          })
          .join(", ");
      }

      if (Array.isArray(answer)) {
        answer = answer.join(", ");
      }

      return {
        question: field.label,
        answer: answer || "—",
      };
    });
}

function cardTitle(title: string) {
  return (
    <h2 className="mb-4 text-base font-semibold uppercase tracking-wide text-amber-100">
      {title}
    </h2>
  );
}

function inputClass() {
  return "w-full rounded-xl border border-amber-700/30 bg-[#1f1813] px-3 py-2 text-sm text-amber-100 placeholder:text-amber-200/40 outline-none transition focus:border-amber-500/50";
}

function panelClass() {
  return "rounded-2xl border border-amber-900/40 bg-[#241b15] p-5 shadow-lg";
}

function miniCardClass() {
  return "rounded-xl border border-amber-900/30 bg-[#2b211b] px-3 py-2 text-sm text-amber-200/80";
}

function actionButtonClass(variant: "primary" | "secondary" = "secondary") {
  if (variant === "primary") {
    return "rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-amber-600 transition";
  }

  return "rounded-xl border border-amber-700/30 bg-[#2b211b] px-4 py-2.5 text-sm text-amber-100 hover:bg-[#3a2c24] transition";
}

function getWorkflowLabel(value: string | null) {
  switch (value) {
    case "new":
      return "Nouveau";
    case "questionnaire_sent":
      return "Questionnaire envoyé";
    case "waiting_reply":
      return "En attente réponse";
    case "followup_sent":
      return "Relance envoyée";
    case "questionnaire_completed":
      return "Questionnaire rempli";
    case "offer_sent":
      return "Offre envoyée";
    case "meeting_booked":
      return "RDV pris";
    case "closed_no_reply":
      return "Clos sans réponse";
    case "closed_won":
      return "Clos gagné";
    case "closed_lost":
      return "Clos perdu";
    default:
      return value || "—";
  }
}

function getProspectTypeLabel(value: string | null) {
  switch (value) {
    case "nouvel_entrant":
      return "Nouvel entrant";
    case "qp_ok":
      return "QP OK";
    case "no_nda":
      return "No NDA";
    default:
      return value || "—";
  }
}

function getQualiopiLabel(value: string | null) {
  switch (value) {
    case "unknown":
      return "Qualiopi inconnu";
    case "certified":
      return "Certifié";
    case "not_certified":
      return "Non certifié";
    default:
      return value || "—";
  }
}

function getChannelLabel(value: string | null) {
  switch (value) {
    case "email":
      return "Email";
    case "facebook":
      return "Facebook";
    case "whatsapp":
      return "WhatsApp";
    case "linkedin":
      return "LinkedIn";
    case "phone":
      return "Téléphone";
    case "none":
      return "Aucun";
    default:
      return value || "—";
  }
}

function getCallOutcomeLabel(value: string | null) {
  switch (value) {
    case "won_audit_blanc":
      return "Vente Selen Review";
    case "won_preparation_qualiopi":
      return "Vente Selen Prepa";
    case "won_preparation_nda":
      return "Vente Selen Prepa";
    case "won_gestion_quotidienne":
      return "Vente Selen Daily";
    case "needs_followup_call":
      return "Nécessite un nouvel appel";
    case "not_interested":
      return "Pas intéressé";
    case "no_answer":
      return "Injoignable / sans retour";
    case "other":
      return "Autre";
    default:
      return value || "—";
  }
}

export default function ProspectDetailClient({
  prospect,
  messages,
  meetings,
  reminders,
}: Props) {
  const firstMeeting = meetings[0] ?? null;
  const questionnaireItems = useMemo(
    () => parseTallyResponses(prospect.questionnaire_response_json),
    [prospect.questionnaire_response_json],
  );

  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");

  const [form, setForm] = useState({
    organization_name: prospect.organization_name ?? "",
    email_found: prospect.email_found ?? prospect.email ?? "",
    website_found: prospect.website_found ?? prospect.website ?? "",
    linkedin_url: prospect.linkedin_url ?? "",
    facebook_url: prospect.facebook_url ?? "",
    whatsapp_url: prospect.whatsapp_url ?? "",
    prospect_type: prospect.prospect_type ?? "nouvel_entrant",
    qualiopi_status: prospect.qualiopi_status ?? "unknown",
    naf_code: prospect.naf_code ?? "",
    training_domain: prospect.training_domain ?? "",
    workflow_status: prospect.workflow_status ?? "new",
    preferred_contact_channel: prospect.preferred_contact_channel ?? "email",
    internal_notes: prospect.internal_notes ?? "",
  });

  const [newNote, setNewNote] = useState("");

  const [callOutcome, setCallOutcome] = useState(
    firstMeeting?.call_outcome ?? "",
  );
  const [callSummary, setCallSummary] = useState(
    firstMeeting?.call_summary ?? "",
  );
  const [saleAmount, setSaleAmount] = useState(
    firstMeeting?.sale_amount != null ? String(firstMeeting.sale_amount) : "",
  );
  const [followupNeeded, setFollowupNeeded] = useState(
    firstMeeting?.followup_needed ?? false,
  );
  const [followupDate, setFollowupDate] = useState(
    firstMeeting?.followup_date ? firstMeeting.followup_date.slice(0, 16) : "",
  );
  const [followupTitle, setFollowupTitle] = useState("Rappeler ce prospect");
  const [followupNote, setFollowupNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const [showQuickEmail, setShowQuickEmail] = useState(false);
  const [showOrderPanel, setShowOrderPanel] = useState(false);
  const [showSpellbook, setShowSpellbook] = useState(false);

  const [quickEmailRecipient, setQuickEmailRecipient] = useState(
    prospect.email_found ?? prospect.email ?? "",
  );
  const [quickEmailSubject, setQuickEmailSubject] = useState("");
  const [quickEmailBody, setQuickEmailBody] = useState("");

  const [orderOffer, setOrderOffer] = useState<OrderOfferKey>(
    getOfferKeyFromRecommendedOffer(prospect.recommended_offer_primary),
  );
  const [orderAmount, setOrderAmount] = useState(
    ORDER_OFFERS[
      getOfferKeyFromRecommendedOffer(prospect.recommended_offer_primary)
    ].price,
  );
  const [orderPaymentProvider, setOrderPaymentProvider] = useState<
    "stripe" | "paypal"
  >("stripe");
  const [orderPaymentLink, setOrderPaymentLink] = useState("");
  const [orderRecipientEmail, setOrderRecipientEmail] = useState(
    prospect.email_found ?? prospect.email ?? "",
  );
  const [orderMessage, setOrderMessage] = useState(
    buildOrderMessage({
      organizationName: prospect.organization_name ?? "votre organisme",
      offerKey: getOfferKeyFromRecommendedOffer(
        prospect.recommended_offer_primary,
      ),
      paymentProvider: "stripe",
      paymentLink: "",
      amount:
        ORDER_OFFERS[
          getOfferKeyFromRecommendedOffer(prospect.recommended_offer_primary)
        ].price,
    }),
  );

  const isSaleOutcome = useMemo(
    () => SALE_OUTCOMES.has(callOutcome),
    [callOutcome],
  );

  useEffect(() => {
    const suggestedOffer = isSaleOutcome
      ? getOfferKeyFromCallOutcome(callOutcome)
      : getOfferKeyFromRecommendedOffer(prospect.recommended_offer_primary);

    setOrderOffer(suggestedOffer);
  }, [callOutcome, isSaleOutcome, prospect.recommended_offer_primary]);

  useEffect(() => {
    setOrderAmount(ORDER_OFFERS[orderOffer].price);
    setOrderMessage(
      buildOrderMessage({
        organizationName: prospect.organization_name ?? "votre organisme",
        offerKey: orderOffer,
        paymentProvider: orderPaymentProvider,
        paymentLink: orderPaymentLink,
        amount: orderAmount,
      }),
    );
  }, [
    orderOffer,
    orderPaymentProvider,
    orderPaymentLink,
    orderAmount,
    prospect.organization_name,
  ]);

  function updateField(name: string, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function saveProspect() {
    setSaving(true);
    setFeedback("");

    const { error } = await supabase
      .from("prospects")
      .update({
        organization_name: form.organization_name || null,
        email_found: form.email_found || null,
        website_found: form.website_found || null,
        linkedin_url: form.linkedin_url || null,
        facebook_url: form.facebook_url || null,
        whatsapp_url: form.whatsapp_url || null,
        prospect_type: form.prospect_type || null,
        qualiopi_status: form.qualiopi_status || null,
        naf_code: form.naf_code || null,
        training_domain: form.training_domain || null,
        workflow_status: form.workflow_status || null,
        preferred_contact_channel: form.preferred_contact_channel || null,
        internal_notes: form.internal_notes || null,
        updated_by_human_at: new Date().toISOString(),
      })
      .eq("id", prospect.id);

    if (error) {
      setFeedback(`Erreur sauvegarde : ${error.message}`);
      setSaving(false);
      return;
    }

    setFeedback("Fiche prospect mise à jour.");
    setSaving(false);
  }

  async function addInternalNote() {
    if (!newNote.trim()) return;

    setSaving(true);
    setFeedback("");

    const { error } = await supabase.from("prospect_messages").insert({
      prospect_id: prospect.id,
      channel: "internal",
      direction: "draft",
      message_type: "internal_note",
      body: newNote.trim(),
      delivery_status: "draft",
      auto_generated: false,
      human_validated: true,
      validation_required: false,
    });

    if (error) {
      setFeedback(`Erreur note : ${error.message}`);
      setSaving(false);
      return;
    }

    setFeedback("Note ajoutée. Recharge la page pour la voir.");
    setNewNote("");
    setSaving(false);
  }

  async function saveCallConclusion() {
    setSaving(true);
    setFeedback("");

    if (isSaleOutcome && !saleAmount.trim()) {
      setFeedback("Merci de renseigner le montant de la vente.");
      setSaving(false);
      return;
    }

    const computedSaleStatus = isSaleOutcome ? "won" : null;
    const computedSaleAmount = isSaleOutcome ? Number(saleAmount) || 0 : null;

    let meetingId = firstMeeting?.id ?? null;

    if (!meetingId) {
      const { data, error } = await supabase
        .from("meetings")
        .insert({
          prospect_id: prospect.id,
          meeting_status: "completed",
          call_outcome: callOutcome || null,
          call_summary: callSummary || null,
          followup_needed: followupNeeded,
          followup_date: followupDate || null,
          sale_status: computedSaleStatus,
          sale_amount: computedSaleAmount,
        })
        .select("id")
        .single();

      if (error) {
        setFeedback(`Erreur conclusion appel : ${error.message}`);
        setSaving(false);
        return;
      }

      meetingId = data.id;
    } else {
      const { error } = await supabase
        .from("meetings")
        .update({
          call_outcome: callOutcome || null,
          call_summary: callSummary || null,
          followup_needed: followupNeeded,
          followup_date: followupDate || null,
          sale_status: computedSaleStatus,
          sale_amount: computedSaleAmount,
        })
        .eq("id", meetingId);

      if (error) {
        setFeedback(`Erreur conclusion appel : ${error.message}`);
        setSaving(false);
        return;
      }
    }

    if (followupNeeded && followupDate) {
      const { error: reminderError } = await supabase
        .from("prospect_reminders")
        .insert({
          prospect_id: prospect.id,
          title: followupTitle.trim() || "Rappeler ce prospect",
          note: followupNote.trim() || null,
          remind_at: followupDate,
          status: "pending",
        });

      if (reminderError) {
        setFeedback(
          `Conclusion enregistrée, mais rappel non créé : ${reminderError.message}`,
        );
        setSaving(false);
        return;
      }
    }

    setFeedback("Conclusion d’appel enregistrée.");
    setSaving(false);
  }

  async function saveOrderDraft() {
    setSaving(true);
    setFeedback("");

    const selectedOffer = ORDER_OFFERS[orderOffer];
    const subject = `Bon de commande - ${selectedOffer.label}`;

    const { error: messageError } = await supabase
      .from("prospect_messages")
      .insert({
        prospect_id: prospect.id,
        channel: "email",
        direction: "draft",
        message_type: "order_form",
        subject,
        body: `Destinataire : ${orderRecipientEmail || "—"}

${orderMessage}`,
        delivery_status: "draft",
        auto_generated: false,
        human_validated: true,
        validation_required: false,
      });

    if (messageError) {
      setFeedback(`Erreur bon de commande : ${messageError.message}`);
      setSaving(false);
      return;
    }

    const { error: prospectError } = await supabase
      .from("prospects")
      .update({
        workflow_status: "offer_sent",
        updated_by_human_at: new Date().toISOString(),
      })
      .eq("id", prospect.id);

    if (prospectError) {
      setFeedback(
        `Brouillon créé, mais statut non mis à jour : ${prospectError.message}`,
      );
      setSaving(false);
      return;
    }

    setForm((prev) => ({ ...prev, workflow_status: "offer_sent" }));
    setFeedback(
      `Bon de commande préparé pour ${selectedOffer.label}. Un brouillon a été ajouté à l’historique.`,
    );
    setShowOrderPanel(false);
    setSaving(false);
  }

  async function generateStripePaymentLink() {
    setSaving(true);
    setFeedback("");

    try {
      const response = await fetch("/api/create-stripe-payment-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          offerLabel: ORDER_OFFERS[orderOffer].label,
          amount: orderAmount,
          prospectId: prospect.id,
          organizationName: prospect.organization_name ?? "",
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setFeedback(
          result.error || "Erreur lors de la génération du lien Stripe.",
        );
        setSaving(false);
        return;
      }

      setOrderPaymentProvider("stripe");
      setOrderPaymentLink(result.url);
      setFeedback("Lien Stripe généré.");
      setSaving(false);
    } catch (error: any) {
      setFeedback(
        error?.message || "Erreur lors de la génération du lien Stripe.",
      );
      setSaving(false);
    }
  }

  async function sendOrderEmail() {
    setSaving(true);
    setFeedback("");

    const selectedOffer = ORDER_OFFERS[orderOffer];
    const subject = `Bon de commande - ${selectedOffer.label}`;

    if (!orderRecipientEmail.trim()) {
      setFeedback("Merci de renseigner l’email du destinataire.");
      setSaving(false);
      return;
    }

    if (!orderMessage.trim()) {
      setFeedback("Le message du bon de commande est vide.");
      setSaving(false);
      return;
    }

    const response = await fetch("/api/send-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prospectId: prospect.id,
        recipientEmail: orderRecipientEmail.trim(),
        subject,
        message: orderMessage,
        workflowStatus: "offer_sent",
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setFeedback(result.error || "Erreur lors de l’envoi du bon de commande.");
      setSaving(false);
      return;
    }

    setForm((prev) => ({ ...prev, workflow_status: "offer_sent" }));
    setFeedback(`Bon de commande envoyé pour ${selectedOffer.label}.`);
    setShowOrderPanel(false);
    setSaving(false);
  }

  async function sendQuickEmail() {
    setSaving(true);
    setFeedback("");

    if (!quickEmailRecipient.trim()) {
      setFeedback("Merci de renseigner l’email du destinataire.");
      setSaving(false);
      return;
    }

    if (!quickEmailSubject.trim()) {
      setFeedback("Merci de renseigner l’objet du mail.");
      setSaving(false);
      return;
    }

    if (!quickEmailBody.trim()) {
      setFeedback("Le message du mail est vide.");
      setSaving(false);
      return;
    }

    const response = await fetch("/api/send-prospect-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prospectId: prospect.id,
        recipientEmail: quickEmailRecipient.trim(),
        subject: quickEmailSubject.trim(),
        message: quickEmailBody.trim(),
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setFeedback(result.error || "Erreur lors de l’envoi du mail.");
      setSaving(false);
      return;
    }

    setFeedback(`Mail envoyé à ${quickEmailRecipient.trim()}.`);
    setShowQuickEmail(false);
    setQuickEmailSubject("");
    setQuickEmailBody("");
    setForm((prev) => ({
      ...prev,
      workflow_status:
        prev.workflow_status === "new" ? "followup_sent" : prev.workflow_status,
    }));
    setSaving(false);
  }

  const topBadges = [
    { label: "Statut", value: getWorkflowLabel(form.workflow_status) },
    { label: "Type", value: getProspectTypeLabel(form.prospect_type) },
    { label: "Canal", value: getChannelLabel(form.preferred_contact_channel) },
    {
      label: "Offre recommandée",
      value: prospect.recommended_offer_primary || "—",
    },
  ];

  return (
    <main className="min-h-screen bg-[#1a1410] p-6 text-amber-50">
      <div className="mb-4 flex gap-3">
        <Link
          href="/"
          className="inline-block rounded-xl bg-[#2b211b] px-4 py-2 text-sm text-amber-100 hover:bg-[#3a2c24]"
        >
          ← Dashboard
        </Link>

        <Link
          href="/prospects"
          className="inline-block rounded-xl bg-[#2b211b] px-4 py-2 text-sm text-amber-100 hover:bg-[#3a2c24]"
        >
          ← Liste prospects
        </Link>
      </div>

      <section className="mb-4 rounded-2xl border border-amber-900/40 bg-[#241b15] p-5 shadow-lg">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-amber-100">
              {form.organization_name || "Prospect"}
            </h1>

            <div className="mt-2 flex flex-wrap gap-2">
              {topBadges.map((badge) => (
                <span
                  key={badge.label}
                  className="rounded-full border border-amber-700/30 bg-[#2b211b] px-3 py-1 text-xs text-amber-200/85"
                >
                  <strong className="text-amber-100">{badge.label} :</strong>{" "}
                  {badge.value}
                </span>
              ))}
            </div>

            <div className="mt-3 grid gap-2 text-sm text-amber-200/75 md:grid-cols-2">
              <p>
                <strong className="text-amber-100">Email :</strong>{" "}
                {form.email_found || "—"}
              </p>
              <p>
                <strong className="text-amber-100">Site :</strong>{" "}
                {form.website_found || "—"}
              </p>
              <p>
                <strong className="text-amber-100">Qualiopi :</strong>{" "}
                {getQualiopiLabel(form.qualiopi_status)}
              </p>
              <p>
                <strong className="text-amber-100">Créé le :</strong>{" "}
                {formatDate(prospect.created_at)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 xl:justify-end">
            <button
              type="button"
              onClick={() => {
                setQuickEmailRecipient(
                  prospect.email_found ?? prospect.email ?? "",
                );
                setShowQuickEmail((prev) => !prev);
              }}
              className={actionButtonClass()}
            >
              ✉️ Envoyer un mail
            </button>

            <button
              type="button"
              onClick={() => {
                const suggestedOffer = isSaleOutcome
                  ? getOfferKeyFromCallOutcome(callOutcome)
                  : getOfferKeyFromRecommendedOffer(
                      prospect.recommended_offer_primary,
                    );

                setOrderOffer(suggestedOffer);
                setOrderAmount(ORDER_OFFERS[suggestedOffer].price);
                setOrderRecipientEmail(
                  prospect.email_found ?? prospect.email ?? "",
                );
                setOrderPaymentProvider("stripe");
                setOrderPaymentLink("");
                setOrderMessage(
                  buildOrderMessage({
                    organizationName:
                      prospect.organization_name ?? "votre organisme",
                    offerKey: suggestedOffer,
                    paymentProvider: "stripe",
                    paymentLink: "",
                    amount: ORDER_OFFERS[suggestedOffer].price,
                  }),
                );
                setShowOrderPanel((prev) => !prev);
              }}
              className={actionButtonClass()}
            >
              📄 Bon de commande
            </button>

            <button
              type="button"
              onClick={() => setShowSpellbook((prev) => !prev)}
              className={actionButtonClass()}
            >
              📖 Grimoire
            </button>

            <button
              onClick={saveProspect}
              disabled={saving}
              className={actionButtonClass("primary")}
            >
              Enregistrer la fiche
            </button>
          </div>
        </div>

        {feedback && (
          <div className="mt-4 rounded-xl border border-amber-700/30 bg-[#2b211b] p-3 text-sm text-amber-200">
            {feedback}
          </div>
        )}

        {showQuickEmail && (
          <div className="mt-4 rounded-2xl border border-amber-700/25 bg-[#201812] p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-100">
              Envoi rapide d’un mail
            </h3>

            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                className={inputClass()}
                value={quickEmailRecipient}
                onChange={(e) => setQuickEmailRecipient(e.target.value)}
                placeholder="Adresse email du prospect"
              />
              <Link
                href="/mailbox"
                className="rounded-xl border border-amber-700/30 bg-[#2b211b] px-4 py-2.5 text-sm text-amber-100 hover:bg-[#3a2c24] text-center"
              >
                Ouvrir la boîte mail
              </Link>
            </div>

            <input
              className={`${inputClass()} mt-3`}
              value={quickEmailSubject}
              onChange={(e) => setQuickEmailSubject(e.target.value)}
              placeholder="Objet"
            />

            <textarea
              className="mt-3 min-h-[120px] w-full rounded-xl border border-amber-700/30 bg-[#1f1813] px-3 py-3 text-sm text-amber-100 placeholder:text-amber-200/40 outline-none transition focus:border-amber-500/50"
              value={quickEmailBody}
              onChange={(e) => setQuickEmailBody(e.target.value)}
              placeholder="Message rapide..."
            />

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={sendQuickEmail}
                disabled={saving}
                className={actionButtonClass("primary")}
              >
                Envoyer
              </button>
            </div>
          </div>
        )}

        {showOrderPanel && (
          <div className="mt-4 rounded-2xl border border-amber-700/25 bg-[#201812] p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-100">
              Bon de commande
            </h3>

            <div className="grid gap-3 md:grid-cols-2">
              <input
                className={inputClass()}
                value={orderRecipientEmail}
                onChange={(e) => setOrderRecipientEmail(e.target.value)}
                placeholder="Email du prospect"
              />

              <select
                className={inputClass()}
                value={orderOffer}
                onChange={(e) => setOrderOffer(e.target.value as OrderOfferKey)}
              >
                <option value="selen_review">Selen Review</option>
                <option value="selen_prepa">Selen Prepa</option>
                <option value="selen_daily">Selen Daily</option>
                <option value="selen_news">Selen News</option>
                <option value="selen_studio">Selen Studio</option>
              </select>

              <input
                className={inputClass()}
                value={orderAmount}
                onChange={(e) => setOrderAmount(e.target.value)}
                placeholder="Montant / tarif affiché"
              />

              <div className="rounded-xl border border-amber-900/30 bg-[#2b211b] px-3 py-2 text-sm text-amber-200/80">
                <strong>Mode de paiement :</strong> Stripe
              </div>

              <div className="md:col-span-2">
                <div className="flex flex-col gap-2 md:flex-row">
                  <input
                    className={inputClass()}
                    value={orderPaymentLink}
                    onChange={(e) => setOrderPaymentLink(e.target.value)}
                    placeholder="Lien de paiement Stripe"
                  />
                  <button
                    type="button"
                    onClick={generateStripePaymentLink}
                    disabled={saving}
                    className={actionButtonClass()}
                  >
                    Générer lien Stripe
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-amber-900/30 bg-[#2b211b] px-3 py-2 text-sm text-amber-200/80">
              <strong>Prestation :</strong> {ORDER_OFFERS[orderOffer].label} —{" "}
              {ORDER_OFFERS[orderOffer].shortDescription}
            </div>

            <textarea
              className="mt-3 min-h-[180px] w-full rounded-xl border border-amber-700/30 bg-[#1f1813] px-3 py-3 text-sm text-amber-100 placeholder:text-amber-200/40 outline-none transition focus:border-amber-500/50"
              value={orderMessage}
              onChange={(e) => setOrderMessage(e.target.value)}
              placeholder="Message d’accompagnement du bon de commande..."
            />

            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={saveOrderDraft}
                disabled={saving}
                className={actionButtonClass()}
              >
                Générer le brouillon
              </button>

              <button
                type="button"
                onClick={sendOrderEmail}
                disabled={saving}
                className={actionButtonClass("primary")}
              >
                Envoyer le bon de commande
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-[1.1fr_0.72fr]">
        <div className="relative min-w-0">
          {showSpellbook && (
            <ProspectSpellbook onClose={() => setShowSpellbook(false)} />
          )}
          <div className={panelClass()}>
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("overview")}
                className={
                  activeTab === "overview"
                    ? "rounded-xl bg-amber-700 px-4 py-2 text-sm font-medium text-white shadow"
                    : "rounded-xl border border-amber-700/30 bg-[#2b211b] px-4 py-2 text-sm text-amber-100 hover:bg-[#3a2c24]"
                }
              >
                Vue d’ensemble
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("questionnaire")}
                className={
                  activeTab === "questionnaire"
                    ? "rounded-xl bg-amber-700 px-4 py-2 text-sm font-medium text-white shadow"
                    : "rounded-xl border border-amber-700/30 bg-[#2b211b] px-4 py-2 text-sm text-amber-100 hover:bg-[#3a2c24]"
                }
              >
                Questionnaire
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={
                  activeTab === "history"
                    ? "rounded-xl bg-amber-700 px-4 py-2 text-sm font-medium text-white shadow"
                    : "rounded-xl border border-amber-700/30 bg-[#2b211b] px-4 py-2 text-sm text-amber-100 hover:bg-[#3a2c24]"
                }
              >
                Historique
              </button>
            </div>

            {activeTab === "overview" && (
              <div className="space-y-4">
                <section>
                  {cardTitle("Informations prospect")}

                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      className={inputClass()}
                      value={form.organization_name}
                      onChange={(e) =>
                        updateField("organization_name", e.target.value)
                      }
                      placeholder="Nom organisme"
                    />
                    <input
                      className={inputClass()}
                      value={form.email_found}
                      onChange={(e) =>
                        updateField("email_found", e.target.value)
                      }
                      placeholder="Email"
                    />
                    <input
                      className={inputClass()}
                      value={form.website_found}
                      onChange={(e) =>
                        updateField("website_found", e.target.value)
                      }
                      placeholder="Site web"
                    />
                    <input
                      className={inputClass()}
                      value={form.naf_code}
                      onChange={(e) => updateField("naf_code", e.target.value)}
                      placeholder="Code NAF"
                    />
                    <input
                      className={inputClass()}
                      value={form.training_domain}
                      onChange={(e) =>
                        updateField("training_domain", e.target.value)
                      }
                      placeholder="Domaine de formation"
                    />
                    <select
                      className={inputClass()}
                      value={form.prospect_type}
                      onChange={(e) =>
                        updateField("prospect_type", e.target.value)
                      }
                    >
                      <option value="nouvel_entrant">Nouvel entrant</option>
                      <option value="qp_ok">QP OK</option>
                      <option value="no_nda">No NDA</option>
                    </select>
                    <input
                      className={inputClass()}
                      value={form.linkedin_url}
                      onChange={(e) =>
                        updateField("linkedin_url", e.target.value)
                      }
                      placeholder="LinkedIn"
                    />
                    <input
                      className={inputClass()}
                      value={form.facebook_url}
                      onChange={(e) =>
                        updateField("facebook_url", e.target.value)
                      }
                      placeholder="Facebook"
                    />
                    <input
                      className={inputClass()}
                      value={form.whatsapp_url}
                      onChange={(e) =>
                        updateField("whatsapp_url", e.target.value)
                      }
                      placeholder="WhatsApp"
                    />
                    <select
                      className={inputClass()}
                      value={form.qualiopi_status}
                      onChange={(e) =>
                        updateField("qualiopi_status", e.target.value)
                      }
                    >
                      <option value="unknown">Qualiopi inconnu</option>
                      <option value="certified">Certifié</option>
                      <option value="not_certified">Non certifié</option>
                    </select>
                    <select
                      className={inputClass()}
                      value={form.workflow_status}
                      onChange={(e) =>
                        updateField("workflow_status", e.target.value)
                      }
                    >
                      <option value="new">Nouveau</option>
                      <option value="questionnaire_sent">
                        Questionnaire envoyé
                      </option>
                      <option value="waiting_reply">En attente réponse</option>
                      <option value="followup_sent">Relance envoyée</option>
                      <option value="questionnaire_completed">
                        Questionnaire rempli
                      </option>
                      <option value="offer_sent">Offre envoyée</option>
                      <option value="meeting_booked">RDV pris</option>
                      <option value="closed_no_reply">Clos sans réponse</option>
                      <option value="closed_won">Clos gagné</option>
                      <option value="closed_lost">Clos perdu</option>
                    </select>
                    <select
                      className={inputClass()}
                      value={form.preferred_contact_channel}
                      onChange={(e) =>
                        updateField("preferred_contact_channel", e.target.value)
                      }
                    >
                      <option value="email">Email</option>
                      <option value="facebook">Facebook</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="phone">Téléphone</option>
                      <option value="none">Aucun</option>
                    </select>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className={miniCardClass()}>
                      <strong>Premier email :</strong>{" "}
                      {prospect.first_email_status === "sent"
                        ? "envoyé"
                        : "non envoyé"}
                    </div>

                    <div className={miniCardClass()}>
                      <strong>Date envoi :</strong>{" "}
                      {prospect.first_outreach_sent_at
                        ? new Date(
                            prospect.first_outreach_sent_at,
                          ).toLocaleString()
                        : "—"}
                    </div>
                  </div>

                  <textarea
                    className="mt-3 min-h-[90px] w-full rounded-xl border border-amber-700/30 bg-[#1f1813] px-3 py-3 text-sm text-amber-100 placeholder:text-amber-200/40 outline-none transition focus:border-amber-500/50"
                    value={form.internal_notes}
                    onChange={(e) =>
                      updateField("internal_notes", e.target.value)
                    }
                    placeholder="Notes internes"
                  />
                </section>

                <section>
                  {cardTitle("Recommandation commerciale")}

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className={miniCardClass()}>
                      <strong>Offre principale :</strong>{" "}
                      {prospect.recommended_offer_primary || "—"}
                    </div>

                    <div className={miniCardClass()}>
                      <strong>Offre secondaire :</strong>{" "}
                      {prospect.recommended_offer_secondary || "—"}
                    </div>
                  </div>

                  <div className={`mt-3 ${miniCardClass()}`}>
                    <strong>Angle commercial :</strong>{" "}
                    {prospect.sales_angle || "—"}
                  </div>
                </section>

                <section>
                  {cardTitle("Résumé rapide")}

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className={miniCardClass()}>
                      <strong>Questionnaire :</strong>{" "}
                      {prospect.questionnaire_status || "non envoyé"}
                    </div>
                    <div className={miniCardClass()}>
                      <strong>Date réponse :</strong>{" "}
                      {prospect.questionnaire_completed_at
                        ? new Date(
                            prospect.questionnaire_completed_at,
                          ).toLocaleString()
                        : "—"}
                    </div>
                    <div className={miniCardClass()}>
                      <strong>Dernière conclusion :</strong>{" "}
                      {getCallOutcomeLabel(firstMeeting?.call_outcome ?? null)}
                    </div>
                    <div className={miniCardClass()}>
                      <strong>Montant vente :</strong>{" "}
                      {firstMeeting?.sale_amount != null
                        ? `${firstMeeting.sale_amount} €`
                        : "—"}
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === "questionnaire" && (
              <div>
                {cardTitle("Questionnaire")}

                <div className="grid gap-3 md:grid-cols-2">
                  <div className={miniCardClass()}>
                    <strong>Statut :</strong>{" "}
                    {prospect.questionnaire_status || "non envoyé"}
                  </div>

                  <div className={miniCardClass()}>
                    <strong>Date de réponse :</strong>{" "}
                    {prospect.questionnaire_completed_at
                      ? new Date(
                          prospect.questionnaire_completed_at,
                        ).toLocaleString()
                      : "—"}
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-amber-900/30 bg-[#2b211b] p-3 text-sm text-amber-200/80">
                  {questionnaireItems.length === 0 ? (
                    <p>Aucune réponse enregistrée pour le moment.</p>
                  ) : (
                    <div className="space-y-2">
                      {questionnaireItems.map((item, index) => (
                        <div
                          key={index}
                          className="rounded-lg border border-amber-900/20 bg-[#1f1813] px-3 py-2"
                        >
                          <p className="font-medium text-amber-100">
                            {item.question}
                          </p>
                          <p className="text-amber-200/80">{item.answer}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "history" && (
              <div>
                {cardTitle("Historique des communications")}

                {messages.length === 0 ? (
                  <p className="text-sm text-amber-200/70">
                    Aucune communication enregistrée.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className="rounded-xl border border-amber-900/30 bg-[#2b211b] px-4 py-3 text-sm text-amber-200/80"
                      >
                        <div className="mb-2 flex flex-wrap gap-2 text-xs text-amber-300/70">
                          <span className="rounded-full bg-[#1f1813] px-2 py-1">
                            {msg.channel || "—"}
                          </span>
                          <span className="rounded-full bg-[#1f1813] px-2 py-1">
                            {msg.direction || "—"}
                          </span>
                          <span className="rounded-full bg-[#1f1813] px-2 py-1">
                            {msg.message_type || "—"}
                          </span>
                          <span className="rounded-full bg-[#1f1813] px-2 py-1">
                            {msg.delivery_status || "—"}
                          </span>
                          <span className="rounded-full bg-[#1f1813] px-2 py-1">
                            {formatDate(msg.created_at)}
                          </span>
                        </div>

                        {msg.subject && (
                          <p className="font-medium text-amber-100">
                            {msg.subject}
                          </p>
                        )}

                        <p className="mt-1 whitespace-pre-wrap leading-relaxed">
                          {msg.body || "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="xl:sticky xl:top-6">
          <div className="space-y-4">
            <div className={`${panelClass()} h-fit`}>
              {cardTitle("Conclusion d’appel")}

              <div className="grid gap-3">
                <select
                  className={inputClass()}
                  value={callOutcome}
                  onChange={(e) => setCallOutcome(e.target.value)}
                >
                  <option value="">Choisir une conclusion</option>
                  <option value="won_audit_blanc">Vente Selen Review</option>
                  <option value="won_preparation_qualiopi">
                    Vente Selen Prepa
                  </option>
                  <option value="won_preparation_nda">Vente Selen Prepa</option>
                  <option value="won_gestion_quotidienne">
                    Vente Selen Daily
                  </option>
                  <option value="needs_followup_call">
                    Nécessite un nouvel appel
                  </option>
                  <option value="not_interested">Pas intéressé</option>
                  <option value="no_answer">Injoignable / sans retour</option>
                  <option value="other">Autre</option>
                </select>

                {isSaleOutcome && (
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={inputClass()}
                    value={saleAmount}
                    onChange={(e) => setSaleAmount(e.target.value)}
                    placeholder="Montant de la vente (€)"
                  />
                )}

                <textarea
                  className="min-h-[110px] w-full rounded-xl border border-amber-700/30 bg-[#1f1813] px-3 py-3 text-sm text-amber-100 placeholder:text-amber-200/40 outline-none transition focus:border-amber-500/50"
                  value={callSummary}
                  onChange={(e) => setCallSummary(e.target.value)}
                  placeholder="Résumé de l’appel"
                />

                <label className="flex items-center gap-2 text-sm text-amber-200/80">
                  <input
                    type="checkbox"
                    checked={followupNeeded}
                    onChange={(e) => setFollowupNeeded(e.target.checked)}
                  />
                  Suivi nécessaire
                </label>

                {followupNeeded && (
                  <div className="rounded-xl border border-amber-900/30 bg-[#2b211b] p-3">
                    <div className="grid gap-3">
                      <input
                        className={inputClass()}
                        value={followupTitle}
                        onChange={(e) => setFollowupTitle(e.target.value)}
                        placeholder="Titre du rappel"
                      />
                      <textarea
                        className="min-h-[70px] w-full rounded-xl border border-amber-700/30 bg-[#1f1813] px-3 py-3 text-sm text-amber-100 placeholder:text-amber-200/40 outline-none transition focus:border-amber-500/50"
                        value={followupNote}
                        onChange={(e) => setFollowupNote(e.target.value)}
                        placeholder="Détail du rappel"
                      />
                      <input
                        type="datetime-local"
                        className={inputClass()}
                        value={followupDate}
                        onChange={(e) => setFollowupDate(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <button
                  onClick={saveCallConclusion}
                  disabled={saving}
                  className={actionButtonClass("primary")}
                >
                  Enregistrer la conclusion d’appel
                </button>
              </div>
            </div>

            <div className={panelClass()}>
              {cardTitle("Note rapide / suivi manuel")}

              <div className="rounded-xl border border-amber-900/30 bg-[#2b211b] p-3">
                <textarea
                  className="min-h-[120px] w-full resize-none rounded-lg border border-amber-700/20 bg-[#1f1813] px-3 py-3 text-sm text-amber-100 placeholder:text-amber-200/40 outline-none transition focus:border-amber-500/50"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Ex : réponse au mail auto, question du prospect, échange manuel..."
                />
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={addInternalNote}
                    disabled={saving}
                    className={actionButtonClass("primary")}
                  >
                    Ajouter au suivi
                  </button>
                </div>
              </div>
            </div>

            <div className={panelClass()}>
              {cardTitle("Rappels internes")}

              <div className="rounded-xl border border-amber-900/30 bg-[#2b211b] p-3 min-h-[178px]">
                {reminders.length === 0 ? (
                  <p className="text-sm text-amber-200/70">
                    Aucun rappel enregistré.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {reminders.map((reminder) => (
                      <div
                        key={reminder.id}
                        className="rounded-lg border border-amber-900/20 bg-[#1f1813] px-3 py-2 text-sm text-amber-200/80"
                      >
                        <p className="font-medium text-amber-100">
                          {reminder.title}
                        </p>
                        <p>{reminder.note || "—"}</p>
                        <p className="text-xs text-amber-300/70">
                          {formatDate(reminder.remind_at)} • {reminder.status}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
