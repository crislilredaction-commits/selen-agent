"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

type MeetingRow = {
  id: string;
  prospect_id: string;
  meeting_status: string | null;
  sale_status: string | null;
  sale_amount: number | null;
};

type ProspectRow = {
  id: string;
  organization_name: string | null;
};

type NewMeetingForm = {
  prospect_id: string;
  meeting_status: string;
  sale_status: string;
  sale_amount: string;
};

// ─── Helpers visuels ──────────────────────────────────────────────────────────

function meetingStatusLabel(s: string | null) {
  switch (s) {
    case "planned":
      return "RDV prévu";
    case "done":
      return "RDV réalisé";
    case "cancelled":
      return "RDV annulé";
    default:
      return "Non défini";
  }
}

function SaleBadge({ status }: { status: string | null }) {
  if (status === "won")
    return <span className="badge badge-green">Vente gagnée</span>;
  if (status === "lost")
    return <span className="badge badge-red">Vente perdue</span>;
  return <span className="badge badge-muted">Pas de vente</span>;
}

// ─── Composant ────────────────────────────────────────────────────────────────

export default function MeetingsSalesManager() {
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [prospects, setProspects] = useState<ProspectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>("");

  const [newMeeting, setNewMeeting] = useState<NewMeetingForm>({
    prospect_id: "",
    meeting_status: "planned",
    sale_status: "none",
    sale_amount: "",
  });

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError("");

      const { data: meetingsData, error: mErr } = await supabase
        .from("meetings")
        .select("id, prospect_id, meeting_status, sale_status, sale_amount")
        .order("created_at", { ascending: false });

      if (mErr) {
        setError(mErr.message);
        setLoading(false);
        return;
      }

      const { data: prospectsData, error: pErr } = await supabase
        .from("prospects")
        .select("id, organization_name");

      if (pErr) {
        setError(pErr.message);
        setLoading(false);
        return;
      }

      setMeetings(meetingsData ?? []);
      setProspects(prospectsData ?? []);
      setLoading(false);
    }
    loadData();
  }, []);

  const prospectMap = useMemo(
    () =>
      Object.fromEntries(
        prospects.map((p) => [p.id, p.organization_name ?? "Sans nom"]),
      ),
    [prospects],
  );

  async function createMeeting() {
    if (!newMeeting.prospect_id) {
      setError("Choisis d'abord un prospect.");
      return;
    }
    setCreating(true);
    setError("");

    const { data, error: err } = await supabase
      .from("meetings")
      .insert({
        prospect_id: newMeeting.prospect_id,
        meeting_status: newMeeting.meeting_status,
        sale_status:
          newMeeting.sale_status === "none" ? null : newMeeting.sale_status,
        sale_amount: newMeeting.sale_amount
          ? Number(newMeeting.sale_amount)
          : null,
      })
      .select("id, prospect_id, meeting_status, sale_status, sale_amount")
      .single();

    if (err) {
      setError(err.message);
      setCreating(false);
      return;
    }

    setMeetings((prev) => [data, ...prev]);
    setNewMeeting({
      prospect_id: "",
      meeting_status: "planned",
      sale_status: "none",
      sale_amount: "",
    });
    setCreating(false);
  }

  async function updateMeeting(
    id: string,
    updates: Partial<Pick<MeetingRow, "sale_status" | "sale_amount">>,
  ) {
    setSavingId(id);
    setError("");
    const { error: err } = await supabase
      .from("meetings")
      .update(updates)
      .eq("id", id);
    if (err) {
      setError(err.message);
      setSavingId(null);
      return;
    }
    setMeetings((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    );
    setSavingId(null);
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="card p-5">
        <p className="section-title">Ventes sur RDV</p>
        <p
          style={{
            fontSize: "0.85rem",
            color: "var(--text-muted)",
            marginTop: "0.5rem",
          }}
        >
          Chargement des rendez-vous…
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      {/* En-tête */}
      <div
        className="px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <p className="section-title" style={{ marginBottom: 0 }}>
          Ventes sur RDV
        </p>
      </div>

      <div className="p-5 space-y-5">
        {/* Erreur */}
        {error && (
          <div
            className="rounded-lg border p-3 text-sm"
            style={{
              background: "rgba(127,29,29,0.2)",
              borderColor: "rgba(239,68,68,0.25)",
              color: "#f87171",
            }}
          >
            {error}
          </div>
        )}

        {/* Formulaire ajout */}
        <div
          className="rounded-xl p-4"
          style={{
            background: "var(--bg-input)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <p
            className="mb-3 font-semibold"
            style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}
          >
            Enregistrer un RDV manuellement
          </p>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <select
              value={newMeeting.prospect_id}
              onChange={(e) =>
                setNewMeeting((p) => ({ ...p, prospect_id: e.target.value }))
              }
              className="input-studio"
              disabled={creating}
            >
              <option value="">Choisir un prospect…</option>
              {prospects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.organization_name ?? "Sans nom"}
                </option>
              ))}
            </select>

            <select
              value={newMeeting.meeting_status}
              onChange={(e) =>
                setNewMeeting((p) => ({ ...p, meeting_status: e.target.value }))
              }
              className="input-studio"
              disabled={creating}
            >
              <option value="planned">RDV prévu</option>
              <option value="done">RDV réalisé</option>
              <option value="cancelled">RDV annulé</option>
            </select>

            <select
              value={newMeeting.sale_status}
              onChange={(e) =>
                setNewMeeting((p) => ({ ...p, sale_status: e.target.value }))
              }
              className="input-studio"
              disabled={creating}
            >
              <option value="none">Pas de vente</option>
              <option value="won">Vente gagnée</option>
              <option value="lost">Vente perdue</option>
            </select>

            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="1"
                value={newMeeting.sale_amount}
                onChange={(e) =>
                  setNewMeeting((p) => ({ ...p, sale_amount: e.target.value }))
                }
                placeholder="Montant €"
                className="input-studio"
                disabled={creating}
              />
              <button
                type="button"
                onClick={createMeeting}
                disabled={creating}
                className="btn-primary"
                style={{ whiteSpace: "nowrap" }}
              >
                {creating ? "…" : "+ Ajouter"}
              </button>
            </div>
          </div>
        </div>

        {/* Liste des RDV */}
        {meetings.length === 0 ? (
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Aucun rendez-vous enregistré pour le moment.
          </p>
        ) : (
          <div className="space-y-3">
            {meetings.map((meeting) => (
              <div
                key={meeting.id}
                className="rounded-xl p-4"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-subtle)",
                  transition: "border-color 0.15s",
                }}
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  {/* Infos prospect */}
                  <div>
                    <p
                      className="font-semibold"
                      style={{
                        fontSize: "0.9rem",
                        color: "var(--text-primary)",
                      }}
                    >
                      {prospectMap[meeting.prospect_id] ?? "Prospect inconnu"}
                    </p>
                    <p
                      style={{
                        fontSize: "0.78rem",
                        color: "var(--text-muted)",
                        marginTop: "0.15rem",
                      }}
                    >
                      {meetingStatusLabel(meeting.meeting_status)}
                    </p>
                  </div>

                  {/* Contrôles vente */}
                  <div className="flex flex-wrap items-center gap-3">
                    <SaleBadge status={meeting.sale_status} />

                    <select
                      value={meeting.sale_status ?? "none"}
                      onChange={(e) =>
                        updateMeeting(meeting.id, {
                          sale_status:
                            e.target.value === "none" ? null : e.target.value,
                        })
                      }
                      className="input-studio"
                      style={{ width: "auto", minWidth: 140 }}
                      disabled={savingId === meeting.id}
                    >
                      <option value="none">Pas de vente</option>
                      <option value="won">Vente gagnée</option>
                      <option value="lost">Vente perdue</option>
                    </select>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={meeting.sale_amount ?? 0}
                        onChange={(e) =>
                          updateMeeting(meeting.id, {
                            sale_amount: Number(e.target.value) || 0,
                          })
                        }
                        className="input-studio"
                        style={{ width: 100 }}
                        disabled={savingId === meeting.id}
                      />
                      <span
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        €
                      </span>
                    </div>

                    {savingId === meeting.id && (
                      <span
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        Enregistrement…
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
