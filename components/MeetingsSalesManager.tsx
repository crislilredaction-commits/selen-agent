"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

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

export default function MeetingsSalesManager() {
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [prospects, setProspects] = useState<ProspectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError("");

      const { data: meetingsData, error: meetingsError } = await supabase
        .from("meetings")
        .select("id, prospect_id, meeting_status, sale_status, sale_amount")
        .order("created_at", { ascending: false });

      if (meetingsError) {
        setError(meetingsError.message);
        setLoading(false);
        return;
      }

      const { data: prospectsData, error: prospectsError } = await supabase
        .from("prospects")
        .select("id, organization_name");

      if (prospectsError) {
        setError(prospectsError.message);
        setLoading(false);
        return;
      }

      setMeetings(meetingsData ?? []);
      setProspects(prospectsData ?? []);
      setLoading(false);
    }

    loadData();
  }, []);

  const prospectMap = useMemo(() => {
    return Object.fromEntries(
      prospects.map((p) => [p.id, p.organization_name ?? "Sans nom"]),
    );
  }, [prospects]);

  async function updateMeeting(
    meetingId: string,
    updates: Partial<Pick<MeetingRow, "sale_status" | "sale_amount">>,
  ) {
    setSavingId(meetingId);
    setError("");

    const { error: updateError } = await supabase
      .from("meetings")
      .update(updates)
      .eq("id", meetingId);

    if (updateError) {
      setError(updateError.message);
      setSavingId(null);
      return;
    }

    setMeetings((prev) =>
      prev.map((m) => (m.id === meetingId ? { ...m, ...updates } : m)),
    );

    setSavingId(null);
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-amber-800/30 bg-[#241b15]/85 p-6 shadow-xl">
        <h2 className="text-2xl font-semibold text-amber-100">
          Ventes sur RDV
        </h2>
        <p className="mt-4 text-amber-200/70">Chargement des rendez-vous…</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-amber-800/30 bg-[#241b15]/85 p-6 shadow-xl">
      <h2 className="text-2xl font-semibold text-amber-100">Ventes sur RDV</h2>

      {error && (
        <div className="mt-4 rounded-xl border border-red-900/40 bg-red-950/20 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {meetings.length === 0 ? (
        <p className="mt-4 text-amber-200/70">
          Aucun rendez-vous enregistré pour le moment.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {meetings.map((meeting) => (
            <div
              key={meeting.id}
              className="rounded-2xl border border-amber-900/40 bg-[#2b211b] p-4"
            >
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-base font-semibold text-amber-100">
                    {prospectMap[meeting.prospect_id] ?? "Prospect inconnu"}
                  </p>
                  <p className="mt-1 text-sm text-amber-200/70">
                    RDV : {meeting.meeting_status ?? "non défini"}
                  </p>
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <select
                    value={meeting.sale_status ?? "none"}
                    onChange={(e) =>
                      updateMeeting(meeting.id, {
                        sale_status: e.target.value,
                      })
                    }
                    className="rounded-xl border border-amber-700/30 bg-[#1f1813] px-3 py-2 text-sm text-amber-100 outline-none"
                    disabled={savingId === meeting.id}
                  >
                    <option value="none">Pas de vente</option>
                    <option value="won">Vente gagnée</option>
                    <option value="lost">Vente perdue</option>
                  </select>

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
                    className="rounded-xl border border-amber-700/30 bg-[#1f1813] px-3 py-2 text-sm text-amber-100 outline-none"
                    disabled={savingId === meeting.id}
                  />

                  <span className="text-sm text-amber-200/70">€</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
