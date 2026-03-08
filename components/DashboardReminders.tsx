"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";

type Reminder = {
  id: string;
  title: string;
  note: string | null;
  remind_at: string;
  status: string;
  prospect_id: string;
  prospects: {
    organization_name: string | null;
  } | null;
};

export default function DashboardReminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadReminders() {
    const { data, error } = await supabase
      .from("prospect_reminders")
      .select(
        `
        id,
        title,
        note,
        remind_at,
        status,
        prospect_id,
        prospects (
          organization_name
        )
      `,
      )
      .eq("status", "pending")
      .order("remind_at", { ascending: true })
      .limit(20);

    if (!error && data) {
      setReminders(data as Reminder[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadReminders();
  }, []);

  async function markDone(id: string) {
    await supabase
      .from("prospect_reminders")
      .update({ status: "done" })
      .eq("id", id);

    setReminders((prev) => prev.filter((r) => r.id !== id));
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-amber-900/40 bg-[#241b15] p-6">
        Chargement des rappels...
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-900/40 bg-[#241b15] p-6">
      <h2 className="mb-4 text-xl font-semibold text-amber-100">
        Rappels internes
      </h2>

      {reminders.length === 0 ? (
        <p className="text-sm text-amber-200/70">Aucun rappel en attente.</p>
      ) : (
        <div className="space-y-3">
          {reminders.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-amber-900/30 bg-[#2b211b] p-4 text-sm"
            >
              <div className="flex justify-between items-start gap-4">
                <div>
                  <p className="font-semibold text-amber-100">{r.title}</p>

                  <p className="text-amber-200/80">
                    {r.prospects?.organization_name ?? "Prospect"}
                  </p>

                  <p className="text-xs text-amber-200/60">
                    {new Date(r.remind_at).toLocaleString()}
                  </p>

                  {r.note && <p className="mt-2 text-amber-200/70">{r.note}</p>}

                  <Link
                    href={`/prospects/${r.prospect_id}`}
                    className="mt-2 inline-block text-xs text-amber-400 underline"
                  >
                    Voir la fiche prospect
                  </Link>
                </div>

                <button
                  onClick={() => markDone(r.id)}
                  className="rounded-lg bg-green-700 px-3 py-1 text-xs text-white hover:bg-green-600"
                >
                  Fait
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
