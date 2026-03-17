import { notFound } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import ProspectDetailClient from "../../../components/ProspectDetailClient";
import Link from "next/link";

type ProspectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProspectPage({ params }: ProspectPageProps) {
  const { id } = await params;

  const { data: prospect, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !prospect) {
    notFound();
  }

  const { data: messages } = await supabase
    .from("prospect_messages")
    .select("*")
    .eq("prospect_id", id)
    .order("created_at", { ascending: false });

  const { data: meetings } = await supabase
    .from("meetings")
    .select("*")
    .eq("prospect_id", id)
    .order("created_at", { ascending: false });

  const { data: reminders } = await supabase
    .from("prospect_reminders")
    .select("*")
    .eq("prospect_id", id)
    .order("remind_at", { ascending: true });

  return (
    <div className="app-shell">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="mb-6">
          <p className="sidebar-brand-label">Selen Studio</p>
          <h1 className="sidebar-title">Agent</h1>
          <p className="sidebar-subtitle">Pipeline NDA · Robot 1</p>
        </div>

        <div className="sidebar-divider" />

        <div className="mb-4">
          <p className="sidebar-nav-label">Navigation</p>
          <Link href="/" className="sidebar-nav-item">
            <span className="text-xs opacity-60">⊞</span> Dashboard
          </Link>
          <Link href="/prospects" className="sidebar-nav-item active">
            <span className="text-xs opacity-60">☰</span> Prospects
          </Link>
          <Link href="/conclusions-appels" className="sidebar-nav-item">
            <span className="text-xs opacity-60">📋</span> Conclusions d'appels
          </Link>
        </div>

        <div className="sidebar-divider" />

        {/* Fil d'Ariane dans la sidebar */}
        <div style={{ marginTop: "0.5rem" }}>
          <p className="sidebar-nav-label">Fiche ouverte</p>
          <div
            className="rounded-lg px-3 py-2"
            style={{
              background: "var(--bg-active)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <p
              className="font-cinzel font-semibold truncate"
              style={{ fontSize: "0.82rem", color: "var(--text-primary)" }}
            >
              {prospect.organization_name ?? "Sans nom"}
            </p>
            {prospect.city && (
              <p
                style={{
                  fontSize: "0.72rem",
                  color: "var(--text-muted)",
                  marginTop: "0.1rem",
                }}
              >
                {prospect.city}
              </p>
            )}
          </div>
        </div>

        <div
          style={{
            marginTop: "auto",
            fontSize: "0.65rem",
            color: "var(--text-faint)",
            paddingTop: "1rem",
          }}
        >
          Version V0 · Studio Selen
        </div>
      </aside>

      {/* ── Contenu principal ─────────────────────────────────────────────── */}
      <main className="main-content">
        {/* Breadcrumb */}
        <nav
          className="mb-6 flex items-center gap-2 animate-fade-in-up"
          style={{ fontSize: "0.78rem" }}
        >
          <Link
            href="/"
            className="transition-colors hover:underline"
            style={{ color: "var(--text-muted)" }}
          >
            Dashboard
          </Link>
          <span style={{ color: "var(--text-faint)" }}>/</span>
          <Link
            href="/prospects"
            className="transition-colors hover:underline"
            style={{ color: "var(--text-muted)" }}
          >
            Prospects
          </Link>
          <span style={{ color: "var(--text-faint)" }}>/</span>
          <span style={{ color: "var(--text-secondary)" }}>
            {prospect.organization_name ?? id}
          </span>
        </nav>

        {/* Header fiche */}
        <header
          className="mb-8 animate-fade-in-up"
          style={{ animationDelay: "40ms" }}
        >
          <p className="page-eyebrow">Fiche prospect</p>
          <h2 className="page-title">
            {prospect.organization_name ?? "Sans nom"}
          </h2>
          {prospect.city && <p className="page-subtitle">{prospect.city}</p>}
        </header>

        {/* Composant client (inchangé) */}
        <div className="animate-fade-in-up" style={{ animationDelay: "80ms" }}>
          <ProspectDetailClient
            prospect={prospect}
            messages={messages ?? []}
            meetings={meetings ?? []}
            reminders={reminders ?? []}
          />
        </div>
      </main>
    </div>
  );
}
