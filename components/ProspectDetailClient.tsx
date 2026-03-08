"use client";

import { useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

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

function cardTitle(title: string) {
  return (
    <h2 className="mb-4 text-base font-semibold uppercase tracking-wide text-amber-100">
      {title}
    </h2>
  );
}

function inputClass() {
  return "w-full rounded-xl border border-amber-700/30 bg-[#1f1813] px-3 py-2 text-sm text-amber-100 placeholder:text-amber-200/40";
}

export default function ProspectDetailClient({
  prospect,
  messages,
  meetings,
  reminders,
}: Props) {
  const firstMeeting = meetings[0] ?? null;

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

  const isSaleOutcome = useMemo(
    () => SALE_OUTCOMES.has(callOutcome),
    [callOutcome],
  );

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

  return (
    <main className="min-h-screen bg-[#1a1410] p-6 text-amber-50">
      <h1 className="mb-4 text-2xl font-bold text-amber-100">
        {form.organization_name || "Prospect"}
      </h1>

      {feedback && (
        <div className="mb-4 rounded-xl border border-amber-700/30 bg-[#2b211b] p-3 text-sm text-amber-200">
          {feedback}
        </div>
      )}

      <section className="grid items-start gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-amber-900/40 bg-[#241b15] p-5 shadow-lg">
          {cardTitle("Informations prospect")}

          <div className="grid gap-3 md:grid-cols-2">
            <input
              className={inputClass()}
              value={form.organization_name}
              onChange={(e) => updateField("organization_name", e.target.value)}
              placeholder="Nom organisme"
            />
            <input
              className={inputClass()}
              value={form.email_found}
              onChange={(e) => updateField("email_found", e.target.value)}
              placeholder="Email"
            />
            <input
              className={inputClass()}
              value={form.website_found}
              onChange={(e) => updateField("website_found", e.target.value)}
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
              onChange={(e) => updateField("training_domain", e.target.value)}
              placeholder="Domaine de formation"
            />
            <select
              className={inputClass()}
              value={form.prospect_type}
              onChange={(e) => updateField("prospect_type", e.target.value)}
            >
              <option value="nouvel_entrant">Nouvel entrant</option>
              <option value="qp_ok">QP OK</option>
              <option value="no_nda">No NDA</option>
            </select>
            <input
              className={inputClass()}
              value={form.linkedin_url}
              onChange={(e) => updateField("linkedin_url", e.target.value)}
              placeholder="LinkedIn"
            />
            <input
              className={inputClass()}
              value={form.facebook_url}
              onChange={(e) => updateField("facebook_url", e.target.value)}
              placeholder="Facebook"
            />
            <input
              className={inputClass()}
              value={form.whatsapp_url}
              onChange={(e) => updateField("whatsapp_url", e.target.value)}
              placeholder="WhatsApp"
            />
            <select
              className={inputClass()}
              value={form.qualiopi_status}
              onChange={(e) => updateField("qualiopi_status", e.target.value)}
            >
              <option value="unknown">Qualiopi inconnu</option>
              <option value="certified">Certifié</option>
              <option value="not_certified">Non certifié</option>
            </select>
            <select
              className={inputClass()}
              value={form.workflow_status}
              onChange={(e) => updateField("workflow_status", e.target.value)}
            >
              <option value="new">Nouveau</option>
              <option value="questionnaire_sent">Questionnaire envoyé</option>
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

          <textarea
            className="mt-3 min-h-[90px] w-full rounded-xl border border-amber-700/30 bg-[#1f1813] px-3 py-3 text-sm text-amber-100 placeholder:text-amber-200/40"
            value={form.internal_notes}
            onChange={(e) => updateField("internal_notes", e.target.value)}
            placeholder="Notes internes"
          />

          <div className="mt-3 flex justify-end">
            <button
              onClick={saveProspect}
              disabled={saving}
              className="rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-amber-600 disabled:opacity-50"
            >
              Enregistrer la fiche
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-900/40 bg-[#241b15] p-5 shadow-lg h-fit">
          {cardTitle("Conclusion d’appel")}

          <div className="grid gap-3">
            <select
              className={inputClass()}
              value={callOutcome}
              onChange={(e) => setCallOutcome(e.target.value)}
            >
              <option value="">Choisir une conclusion</option>
              <option value="won_audit_blanc">Vente audit blanc</option>
              <option value="won_preparation_qualiopi">
                Vente préparation Qualiopi
              </option>
              <option value="won_preparation_nda">Vente préparation NDA</option>
              <option value="won_gestion_quotidienne">
                Vente gestion quotidienne
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
              className="min-h-[88px] w-full rounded-xl border border-amber-700/30 bg-[#1f1813] px-3 py-3 text-sm text-amber-100 placeholder:text-amber-200/40"
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
                    className="min-h-[70px] w-full rounded-xl border border-amber-700/30 bg-[#1f1813] px-3 py-3 text-sm text-amber-100 placeholder:text-amber-200/40"
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
              className="rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-amber-600 disabled:opacity-50"
            >
              Enregistrer la conclusion d’appel
            </button>
          </div>
        </div>
      </section>

      <section className="mt-4 grid items-start gap-4 xl:grid-cols-[1fr_0.65fr]">
        <div className="rounded-2xl border border-amber-900/40 bg-[#241b15] p-5 shadow-lg">
          {cardTitle("Ajouter une note / communication manuelle")}

          <div className="rounded-xl border border-amber-900/30 bg-[#2b211b] p-3">
            <textarea
              className="min-h-[120px] w-full resize-none rounded-lg border border-amber-700/20 bg-[#1f1813] px-3 py-3 text-sm text-amber-100 placeholder:text-amber-200/40"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Ex : réponse au mail auto, question du prospect, échange manuel..."
            />
            <div className="mt-3 flex justify-end">
              <button
                onClick={addInternalNote}
                disabled={saving}
                className="rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-amber-600 disabled:opacity-50"
              >
                Ajouter au suivi
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-900/40 bg-[#241b15] p-5 shadow-lg">
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
      </section>

      <section className="mt-4 rounded-2xl border border-amber-900/40 bg-[#241b15] p-5 shadow-lg">
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
                  <p className="font-medium text-amber-100">{msg.subject}</p>
                )}

                <p className="mt-1 whitespace-pre-wrap leading-relaxed">
                  {msg.body || "—"}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
