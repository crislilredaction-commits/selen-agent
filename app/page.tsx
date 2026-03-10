import SelionCompanion from "../components/SelionCompanion";
import MeetingsSalesManager from "../components/MeetingsSalesManager";
import DashboardReminders from "../components/DashboardReminders";
import { supabase } from "../lib/supabaseClient";
import Link from "next/link";
import LogoutButton from "../components/LogoutButton";

function StatCard({
  title,
  value,
  icon,
  accent = false,
}: {
  title: string;
  value: string | number;
  icon?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-5 shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-amber-900/30 ${
        accent
          ? "border-amber-500/50 bg-gradient-to-br from-amber-900/60 to-amber-800/30"
          : "border-amber-900/30 bg-gradient-to-br from-[#2a1f17]/90 to-[#1e1610]/90"
      }`}
    >
      {/* Decorative corner accent */}
      <div className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full bg-amber-500/5" />
      <div className="pointer-events-none absolute -right-2 -top-2 h-8 w-8 rounded-full bg-amber-400/8" />

      {icon && <span className="mb-2 block text-lg opacity-70">{icon}</span>}
      <p className="text-xs font-medium uppercase tracking-widest text-amber-300/50">
        {title}
      </p>
      <p
        className={`mt-1.5 font-cinzel text-3xl font-bold ${accent ? "text-amber-300" : "text-amber-100"}`}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const label = status ?? "inconnu";

  const colors: Record<string, string> = {
    "email envoyé": "bg-emerald-900/40 border-emerald-700/40 text-emerald-300",
    contacted: "bg-blue-900/40 border-blue-700/40 text-blue-300",
    replied: "bg-violet-900/40 border-violet-700/40 text-violet-300",
    qualified: "bg-amber-900/40 border-amber-600/40 text-amber-300",
  };

  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors[label] ?? "border-amber-800/30 bg-[#2b211b] text-amber-400/70"}`}
    >
      {label}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="h-px flex-1 bg-gradient-to-r from-amber-800/40 to-transparent" />
      <h2 className="font-cinzel text-lg font-semibold tracking-wide text-amber-200/80">
        {children}
      </h2>
      <div className="h-px flex-1 bg-gradient-to-l from-amber-800/40 to-transparent" />
    </div>
  );
}

function getTodayParisStartIso() {
  const todayParis = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return `${todayParis}T00:00:00+01:00`;
}

export default async function Home() {
  const startOfTodayParis = getTodayParisStartIso();

  const { count: prospectsCount } = await supabase
    .from("prospects")
    .select("*", { count: "exact", head: true })
    .eq("source", "selion_1_nda")
    .eq("is_visible", true);

  const { count: contactableCount } = await supabase
    .from("prospects")
    .select("*", { count: "exact", head: true })
    .eq("source", "selion_1_nda")
    .eq("is_visible", true)
    .or("email_found.not.is.null,email.not.is.null");

  const { data: recentProspects } = await supabase
    .from("prospects")
    .select(
      "id, organization_name, email, email_found, status, prospect_type, first_email_status, created_at",
    )
    .eq("source", "selion_1_nda")
    .eq("is_visible", true)
    .or("email_found.not.is.null,email.not.is.null")
    .gte("created_at", startOfTodayParis)
    .order("created_at", { ascending: false })
    .limit(8);

  const { data: allProspectsForStatuses } = await supabase
    .from("prospects")
    .select("id, status, first_email_status")
    .eq("source", "selion_1_nda")
    .eq("is_visible", true);

  const { data: meetings } = await supabase
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
    <main className="relative min-h-screen overflow-x-hidden bg-[#120d09] text-amber-50">
      {/* Background texture / grid */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(251,191,36,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(251,191,36,0.5) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Top ambient glow */}
      <div className="pointer-events-none fixed left-1/2 top-0 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-amber-600/5 blur-[120px]" />

      {/* Fixed UI elements */}
      <div className="fixed right-6 top-6 z-50">
        <LogoutButton />
      </div>
      <div className="fixed right-10 top-24 z-40 w-[260px] pointer-events-none">
        <SelionCompanion />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 py-12">
        {/* Header */}
        <header className="mb-12">
          <div className="mb-1 flex items-center gap-2">
            <div className="h-px w-8 bg-amber-500/60" />
            <span className="text-xs font-medium uppercase tracking-[0.25em] text-amber-500/70">
              Sélion — Robot 1
            </span>
          </div>
          <h1 className="font-cinzel text-5xl font-bold tracking-tight text-amber-100">
            Tableau de bord
          </h1>
        </header>

        {/* Stats grid */}
        <section className="mb-10">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Prospects visibles"
              value={stats.prospects}
              icon="👁"
            />
            <StatCard
              title="Contactables"
              value={stats.contactable}
              icon="✉️"
            />
            <StatCard
              title="Emails envoyés"
              value={stats.contacted}
              icon="📤"
            />
            <StatCard title="Réponses reçues" value={stats.replies} icon="💬" />
            <StatCard title="Qualifiés" value={stats.qualified} icon="⭐" />
            <StatCard title="RDV programmés" value={stats.meetings} icon="📅" />
            <StatCard
              title="Ventes conclues"
              value={stats.salesWon}
              icon="🏆"
              accent
            />
            <StatCard
              title="CA généré"
              value={`${stats.revenue.toLocaleString("fr-FR")} €`}
              icon="💶"
              accent
            />
          </div>
        </section>

        {/* Main content */}
        <section className="mb-8 grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
          {/* Prospects table */}
          <div className="rounded-3xl border border-amber-800/20 bg-gradient-to-b from-[#1e1610]/90 to-[#170f0a]/90 p-6 shadow-2xl backdrop-blur-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-cinzel text-xl font-semibold text-amber-100">
                  Prospects du jour
                </h2>
                <p className="mt-0.5 text-xs text-amber-400/50">
                  Contactables · ajoutés aujourd'hui
                </p>
              </div>
              <Link
                href="/prospects"
                className="group flex items-center gap-2 rounded-xl border border-amber-700/30 bg-amber-900/20 px-4 py-2 text-xs font-medium text-amber-300 transition-all hover:border-amber-600/50 hover:bg-amber-900/40"
              >
                Voir tout
                <span className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
            </div>

            {(recentProspects ?? []).length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-amber-900/30 text-sm text-amber-400/40">
                Aucun prospect contactable aujourd'hui
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-amber-900/20">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-amber-900/20 bg-amber-950/40">
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-amber-400/50">
                        Organisme
                      </th>
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-amber-400/50">
                        Email
                      </th>
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-amber-400/50">
                        Type
                      </th>
                      <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-amber-400/50">
                        Statut
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(recentProspects ?? []).map((prospect, i) => (
                      <tr
                        key={prospect.id}
                        className={`border-t border-amber-900/10 transition-colors hover:bg-amber-900/10 ${
                          i % 2 === 0 ? "bg-transparent" : "bg-amber-950/20"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/prospects/${prospect.id}`}
                            className="font-medium text-amber-100 hover:text-amber-300 hover:underline"
                          >
                            {prospect.organization_name ?? "Sans nom"}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-amber-300/60">
                          {prospect.email_found || prospect.email || "—"}
                        </td>
                        <td className="px-4 py-3 text-amber-400/60 text-xs">
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

          {/* Notes internes */}
          <section className="mb-8">
            <div className="rounded-3xl border border-amber-800/20 bg-gradient-to-b from-[#1e1610]/90 to-[#170f0a]/90 p-6 shadow-2xl">
              <h2 className="font-cinzel text-xl font-semibold text-amber-100">
                Notes internes
              </h2>

              <p className="mt-0.5 mb-5 text-xs text-amber-400/50">
                Informations commerciales · rappels équipe
              </p>

              <DashboardReminders />

              <div className="mt-5 flex justify-end">
                <Link
                  href="/conclusions-appels"
                  className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-medium text-white shadow hover:bg-amber-600"
                >
                  Voir les conclusions d’appels
                </Link>
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
