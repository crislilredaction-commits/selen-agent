import SelionCompanion from "../components/SelionCompanion";
import MeetingsSalesManager from "../components/MeetingsSalesManager";
import DashboardReminders from "../components/DashboardReminders";
import { supabase } from "../lib/supabaseClient";
import Link from "next/link";

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="rounded-3xl border border-amber-900/40 bg-[#2a211b]/80 p-5 shadow-lg">
      <p className="text-sm text-amber-200/70">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-amber-100">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const label = status ?? "inconnu";

  return (
    <span className="rounded-full border border-amber-700/40 bg-[#2b211b] px-3 py-1 text-xs text-amber-200">
      {label}
    </span>
  );
}

export default async function Home() {
  const { count: prospectsCount, error: prospectsCountError } = await supabase
    .from("prospects")
    .select("*", { count: "exact", head: true });

  const { count: contactableCount, error: contactableCountError } =
    await supabase
      .from("prospects")
      .select("*", { count: "exact", head: true })
      .or("email_found.not.is.null,email.not.is.null");

  const { data: recentProspects, error: recentProspectsError } = await supabase
    .from("prospects")
    .select(
      "id, organization_name, email, email_found, status, prospect_type, first_email_status, created_at",
    )
    .or("email_found.not.is.null,email.not.is.null")
    .order("created_at", { ascending: false })
    .limit(8);

  const { data: allProspectsForStatuses, error: prospectsError } =
    await supabase.from("prospects").select("id, status, first_email_status");

  const { data: meetings, error: meetingsError } = await supabase
    .from("meetings")
    .select("id, meeting_status, sale_status, sale_amount");

  const allProspects = allProspectsForStatuses ?? [];
  const allMeetings = meetings ?? [];

  const salesWon = allMeetings.filter((m) => m.sale_status === "won").length;

  const revenue = allMeetings
    .filter((m) => m.sale_status === "won")
    .reduce((sum, m) => sum + (Number(m.sale_amount) || 0), 0);

  const stats = {
    prospects: prospectsCount ?? 0,
    contactable: contactableCount ?? 0,
    contacted: allProspects.filter((p) => p.first_email_status === "sent")
      .length,
    replies: allProspects.filter((p) => p.status === "replied").length,
    qualified: allProspects.filter((p) => p.status === "qualified").length,
    meetings: allProspects.filter((p) => p.status === "meeting_booked").length,
    salesWon,
    revenue,
  };

  return (
    <main className="min-h-screen bg-[#1a1410] text-amber-50">
      <div className="fixed right-6 top-6 w-[220px]">
        <SelionCompanion />
      </div>

      <div className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-4xl font-bold text-amber-100">
          Tableau de bord — Sélion
        </h1>

        <p className="mt-2 text-amber-200/70">
          Agent de prospection automatique pour Selen Editions
        </p>

        {(prospectsError || meetingsError) && (
          <div className="mt-6 rounded-2xl border border-red-900/40 bg-red-950/20 p-4 text-red-200">
            Erreur Supabase :{" "}
            {prospectsError?.message || meetingsError?.message}
          </div>
        )}

        <section className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Prospects détectés" value={stats.prospects} />
          <StatCard title="Prospects contactables" value={stats.contactable} />
          <StatCard title="Emails envoyés" value={stats.contacted} />
          <StatCard title="Réponses reçues" value={stats.replies} />
          <StatCard title="Prospects qualifiés" value={stats.qualified} />
          <StatCard title="RDV programmés" value={stats.meetings} />
          <StatCard title="Ventes conclues" value={stats.salesWon} />
          <StatCard title="CA généré" value={`${stats.revenue} €`} />
        </section>

        <section className="mt-8 grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-amber-800/30 bg-[#241b15]/85 p-6 shadow-xl">
            <h2 className="text-2xl font-semibold text-amber-100">
              Prospects contactables récents
            </h2>

            <div className="mt-4">
              <Link
                href="/prospects"
                className="inline-block rounded-xl bg-amber-200/80 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
              >
                Voir tous les prospects
              </Link>
            </div>

            {(recentProspects ?? []).length === 0 ? (
              <p className="mt-4 text-amber-200/70">
                Aucun prospect avec email trouvé pour le moment.
              </p>
            ) : (
              <div className="mt-5 overflow-hidden rounded-2xl border border-amber-900/40">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#2b211b] text-amber-200/80">
                    <tr>
                      <th className="px-4 py-3 font-medium">Organisme</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    (recentProspects ?? []).map((prospect) => (
                      <tr
                        key={prospect.id}
                        className="border-t border-amber-900/30 bg-[#201813]/80 hover:bg-[#2b211b] cursor-pointer"
                      >
                        <td className="px-4 py-3 text-amber-100">
                          <Link
                            href={`/prospects/${prospect.id}`}
                            className="hover:underline"
                          >
                            {prospect.organization_name ?? "Sans nom"}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-amber-200/70">
                          {prospect.email_found || prospect.email || "—"}
                        </td>
                        <td className="px-4 py-3 text-amber-200/70">
                          {prospect.prospect_type === "nouvel_entrant" &&
                            "Nouvel entrant"}
                          {prospect.prospect_type === "qp_ok" && "QP OK"}
                          {prospect.prospect_type === "no_nda" && "No NDA"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            status={
                              prospect.first_email_status === "sent"
                                ? "email envoyé"
                                : prospect.status
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-amber-800/30 bg-[#241b15]/85 p-6 shadow-xl">
            <h2 className="text-2xl font-semibold text-amber-100">
              Journal de Sélion
            </h2>

            <div className="mt-4 space-y-3 text-sm text-amber-200/80">
              <div className="rounded-xl border border-amber-900/40 bg-[#2b211b] p-3">
                Sélion est prêt à détecter les nouveaux organismes de formation.
              </div>

              <div className="rounded-xl border border-amber-900/40 bg-[#2b211b] p-3">
                {stats.prospects === 0
                  ? "Aucun prospect en base pour le moment."
                  : `${stats.prospects} prospect(s) actuellement enregistrés.`}
              </div>

              <div className="rounded-xl border border-amber-900/40 bg-[#2b211b] p-3">
                {stats.contactable === 0
                  ? "Aucun prospect contactable pour le moment."
                  : `${stats.contactable} prospect(s) contactable(s).`}
              </div>

              <div className="rounded-xl border border-amber-900/40 bg-[#2b211b] p-3">
                {stats.salesWon === 0
                  ? "Aucune vente conclue pour le moment."
                  : `${stats.salesWon} vente(s) conclue(s) pour un total de ${stats.revenue} €.`}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <MeetingsSalesManager />
        </section>
        <section className="mt-8">
          <DashboardReminders />
        </section>
      </div>
    </main>
  );
}
