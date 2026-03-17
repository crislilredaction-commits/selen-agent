export const dynamic = "force-dynamic";
export const revalidate = 0;

import SelionCompanion from "../components/SelionCompanion";
import DashboardReminders from "../components/DashboardReminders";
import { supabase } from "../lib/supabaseClient";
import Link from "next/link";
import LogoutButton from "../components/LogoutButton";

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ activePath }: { activePath: string }) {
  const navItems = [
    { href: "/prospects", label: "Prospects", icon: "☰" },
    { href: "/conclusions-appels", label: "Conclusions d'appels", icon: "📋" },
  ];

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="mb-6">
        <p className="sidebar-brand-label">Selen Studio</p>
        <h1 className="sidebar-title">Agent</h1>
        <p className="sidebar-subtitle">Pipeline NDA · Robot 1</p>
      </div>

      <div className="sidebar-divider" />

      {/* Nav */}
      <div className="mb-4">
        <p className="sidebar-nav-label">Navigation</p>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-nav-item ${activePath === item.href ? "active" : ""}`}
          >
            <span className="text-xs opacity-60">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </div>

      <div className="sidebar-divider" />

      {/* Sélion widget — ⚠️ animations intouchables */}
      <div className="sidebar-selion-widget mt-auto">
        <div
          className="relative flex-shrink-0"
          style={{ width: 111, height: 111 }}
        >
          <SelionCompanion compact />
        </div>
        <div>
          <p className="sidebar-selion-label">Sélion</p>
          <p className="sidebar-selion-text">
            Je cherche les prospects perdus dans la brume ✨
          </p>
        </div>
      </div>

      {/* Version + logout */}
      <div className="mt-3 flex items-center justify-between">
        <span style={{ fontSize: "0.65rem", color: "var(--text-faint)" }}>
          Version V0 · Studio Selen
        </span>
        <LogoutButton />
      </div>
    </aside>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  icon,
  accent = false,
  delay = 0,
}: {
  title: string;
  value: string | number;
  icon?: string;
  accent?: boolean;
  delay?: number;
}) {
  return (
    <div
      className={`stat-card animate-fade-in-up ${accent ? "stat-card-accent" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {icon && <span className="mb-2 block text-sm opacity-50">{icon}</span>}
      <p className="stat-label">{title}</p>
      <p className={`stat-value ${accent ? "stat-value-accent" : ""}`}>
        {value}
      </p>
    </div>
  );
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  const label = status ?? "inconnu";

  const cls: Record<string, string> = {
    "email envoyé": "badge badge-green",
    contacted: "badge badge-blue",
    replied: "badge badge-blue",
    qualified: "badge badge-gold",
    new: "badge badge-muted",
  };

  return <span className={cls[label] ?? "badge badge-muted"}>{label}</span>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getParisDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function Home() {
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
    .order("created_at", { ascending: false })
    .limit(10);

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
    <div className="app-shell">
      <Sidebar activePath="/" />

      <main className="main-content">
        {/* Header */}
        <header className="mb-8 animate-fade-in-up">
          <p className="page-eyebrow">Studio Agent</p>
          <h2 className="page-title">Tableau de bord</h2>
          <p className="page-subtitle">
            Vue d'ensemble du pipeline NDA · Robot 1
          </p>
        </header>

        {/* Stats */}
        <section className="mb-8">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Prospects visibles"
              value={stats.prospects}
              icon="👁"
              delay={0}
            />
            <StatCard
              title="Contactables"
              value={stats.contactable}
              icon="✉️"
              delay={40}
            />
            <StatCard
              title="Emails envoyés"
              value={stats.contacted}
              icon="📤"
              delay={80}
            />
            <StatCard
              title="Réponses reçues"
              value={stats.replies}
              icon="💬"
              delay={120}
            />
            <StatCard
              title="Qualifiés"
              value={stats.qualified}
              icon="⭐"
              delay={160}
            />
            <StatCard
              title="RDV programmés"
              value={stats.meetings}
              icon="📅"
              delay={200}
            />
            <StatCard
              title="Ventes conclues"
              value={stats.salesWon}
              icon="🏆"
              accent
              delay={240}
            />
            <StatCard
              title="CA généré"
              value={`${stats.revenue.toLocaleString("fr-FR")} €`}
              icon="💶"
              accent
              delay={280}
            />
          </div>
        </section>

        {/* Contenu principal */}
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          {/* Tableau prospects du jour */}
          <div
            className="card overflow-hidden animate-fade-in-up"
            style={{ animationDelay: "120ms" }}
          >
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <div>
                <p className="section-title" style={{ marginBottom: 0 }}>
                  Portefeuille prospects du jour
                </p>
                <p
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--text-muted)",
                    marginTop: "0.15rem",
                  }}
                >
                  Contactables · ajoutés aujourd'hui
                </p>
              </div>
              <Link href="/prospects" className="btn-secondary">
                Voir tout →
              </Link>
            </div>

            {(recentProspects ?? []).length === 0 ? (
              <div
                className="flex h-36 items-center justify-center text-sm"
                style={{ color: "var(--text-faint)" }}
              >
                Aucun prospect contactable aujourd'hui
              </div>
            ) : (
              <table className="table-studio">
                <thead>
                  <tr>
                    <th>Organisme</th>
                    <th>Email</th>
                    <th>Type</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {(recentProspects ?? []).map((prospect) => (
                    <tr key={prospect.id}>
                      <td>
                        <Link
                          href={`/prospects/${prospect.id}`}
                          style={{
                            color: "var(--text-primary)",
                            fontWeight: 500,
                            textDecoration: "none",
                          }}
                          className="hover:underline"
                        >
                          {prospect.organization_name ?? "Sans nom"}
                        </Link>
                      </td>
                      <td>
                        <span
                          className="font-mono"
                          style={{
                            fontSize: "0.78rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          {prospect.email_found || prospect.email || "—"}
                        </span>
                      </td>
                      <td
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {prospect.prospect_type === "nouvel_entrant" &&
                          "Nouvel entrant"}
                        {prospect.prospect_type === "qp_ok" && "QP OK"}
                        {prospect.prospect_type === "no_nda" && "No NDA"}
                      </td>
                      <td>
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
            )}
          </div>

          {/* Notes internes */}
          <div
            className="card p-5 animate-fade-in-up"
            style={{ animationDelay: "160ms" }}
          >
            <p className="section-title">Notes internes</p>
            <p
              style={{
                fontSize: "0.78rem",
                color: "var(--text-muted)",
                marginBottom: "1rem",
                marginTop: "-0.5rem",
              }}
            >
              Rappels · infos équipe
            </p>
            <DashboardReminders />
            <div className="mt-5">
              <Link
                href="/conclusions-appels"
                className="btn-primary w-full justify-center"
              >
                Conclusions d'appels →
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
