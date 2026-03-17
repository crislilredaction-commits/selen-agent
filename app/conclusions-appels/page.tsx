import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}

function buildOutcomeLabel(value: string | null) {
  switch (value) {
    case "won_audit_blanc":
      return "Vente audit blanc";
    case "won_preparation_qualiopi":
      return "Vente préparation Qualiopi";
    case "won_preparation_nda":
      return "Vente préparation NDA";
    case "won_gestion_quotidienne":
      return "Vente gestion quotidienne";
    case "needs_followup_call":
      return "À rappeler";
    case "not_interested":
      return "Pas intéressé";
    case "no_answer":
      return "Injoignable";
    case "other":
      return "Autre";
    default:
      return "—";
  }
}

function buildProspectTypeLabel(value: string | null) {
  switch (value) {
    case "nouvel_entrant":
      return "Nouvel entrant";
    case "qp_ok":
      return "QP OK";
    case "no_nda":
      return "No NDA";
    default:
      return "—";
  }
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  const label = buildOutcomeLabel(outcome);
  const isWon = outcome?.startsWith("won_");
  const isFollowup = outcome === "needs_followup_call";

  let cls = "badge badge-muted";
  if (isWon) cls = "badge badge-gold";
  if (isFollowup) cls = "badge badge-orange";

  return <span className={cls}>{label}</span>;
}

function SaleBadge({ status }: { status: string | null }) {
  if (status === "won")
    return <span className="badge badge-green">Gagnée</span>;
  if (status === "lost") return <span className="badge badge-red">Perdue</span>;
  return (
    <span style={{ color: "var(--text-faint)", fontSize: "0.8rem" }}>—</span>
  );
}

// ─── Types & Pagination ───────────────────────────────────────────────────────

type SearchParams = {
  search?: string;
  outcome?: string;
  sale?: string;
  page?: string;
};

const PAGE_SIZE = 25;

function buildPageLink(params: {
  search: string;
  outcome: string;
  sale: string;
  page: number;
}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.outcome) query.set("outcome", params.outcome);
  if (params.sale) query.set("sale", params.sale);
  query.set("page", String(params.page));
  return `/conclusions-appels?${query.toString()}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ConclusionsAppelsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const resolvedSearchParams = searchParams ?? {};

  const search = (resolvedSearchParams.search ?? "").trim();
  const selectedOutcome = (resolvedSearchParams.outcome ?? "").trim();
  const selectedSale = (resolvedSearchParams.sale ?? "").trim();
  const currentPage = Math.max(
    1,
    Number(resolvedSearchParams.page ?? "1") || 1,
  );

  let query = supabase
    .from("meetings")
    .select(
      `id, created_at, meeting_status, sale_status, sale_amount, call_outcome,
       call_summary, followup_needed, followup_date,
       prospect:prospects (
         id, organization_name, email, email_found,
         prospect_type, workflow_status, is_visible, source
       )`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (selectedOutcome) query = query.eq("call_outcome", selectedOutcome);
  if (selectedSale === "won") query = query.eq("sale_status", "won");
  else if (selectedSale === "lost") query = query.eq("sale_status", "lost");
  else if (selectedSale === "none") query = query.is("sale_status", null);

  const from = (currentPage - 1) * PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);

  const safeRows = (data ?? []).filter((row: any) => {
    const prospect = Array.isArray(row.prospect)
      ? row.prospect[0]
      : row.prospect;
    if (!prospect) return false;
    if (prospect.source !== "selion_1_nda") return false;
    if (prospect.is_visible !== true) return false;
    if (!search) return true;
    const text =
      `${prospect.organization_name ?? ""} ${prospect.email_found ?? ""} ${prospect.email ?? ""}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const salesWon = safeRows.filter((r: any) => r.sale_status === "won").length;
  const revenue = safeRows
    .filter((r: any) => r.sale_status === "won")
    .reduce((s: number, r: any) => s + (Number(r.sale_amount) || 0), 0);

  return (
    <div className="app-shell">
      {/* Sidebar */}
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
          <Link href="/prospects" className="sidebar-nav-item">
            <span className="text-xs opacity-60">☰</span> Prospects
          </Link>
          <Link href="/conclusions-appels" className="sidebar-nav-item active">
            <span className="text-xs opacity-60">📋</span> Conclusions d'appels
          </Link>
        </div>
        <div className="sidebar-divider" />
        <div
          style={{
            fontSize: "0.65rem",
            color: "var(--text-faint)",
            marginTop: "auto",
            paddingTop: "1rem",
          }}
        >
          Version V0 · Studio Selen
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        {/* Header */}
        <header className="mb-8 animate-fade-in-up">
          <p className="page-eyebrow">Studio Agent</p>
          <h2 className="page-title">Conclusions d'appel</h2>
          <p className="page-subtitle">
            Synthèse des appels et rendez-vous · {count ?? 0} entrée
            {(count ?? 0) > 1 ? "s" : ""}
          </p>
        </header>

        {/* Stats rapides */}
        <section
          className="mb-6 grid gap-3 sm:grid-cols-3 animate-fade-in-up"
          style={{ animationDelay: "60ms" }}
        >
          <div className="stat-card">
            <p className="stat-label">Conclusions</p>
            <p className="stat-value">{safeRows.length}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Ventes gagnées</p>
            <p className="stat-value">{salesWon}</p>
          </div>
          <div className="stat-card stat-card-accent">
            <p className="stat-label">CA visible</p>
            <p className="stat-value stat-value-accent">
              {revenue.toLocaleString("fr-FR")} €
            </p>
          </div>
        </section>

        {/* Filtres */}
        <form
          method="GET"
          className="card mb-6 p-4 animate-fade-in-up"
          style={{ animationDelay: "100ms" }}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <label
                className="mb-1.5 block"
                style={{
                  fontSize: "0.72rem",
                  color: "var(--text-muted)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Rechercher
              </label>
              <input
                type="text"
                name="search"
                defaultValue={search}
                placeholder="Nom organisme ou email…"
                className="input-studio"
              />
            </div>

            <div>
              <label
                className="mb-1.5 block"
                style={{
                  fontSize: "0.72rem",
                  color: "var(--text-muted)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Conclusion
              </label>
              <select
                name="outcome"
                defaultValue={selectedOutcome}
                className="input-studio"
              >
                <option value="">Toutes</option>
                <option value="won_audit_blanc">Vente audit blanc</option>
                <option value="won_preparation_qualiopi">
                  Vente préparation Qualiopi
                </option>
                <option value="won_preparation_nda">
                  Vente préparation NDA
                </option>
                <option value="won_gestion_quotidienne">
                  Vente gestion quotidienne
                </option>
                <option value="needs_followup_call">À rappeler</option>
                <option value="not_interested">Pas intéressé</option>
                <option value="no_answer">Injoignable</option>
                <option value="other">Autre</option>
              </select>
            </div>

            <div>
              <label
                className="mb-1.5 block"
                style={{
                  fontSize: "0.72rem",
                  color: "var(--text-muted)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Vente
              </label>
              <select
                name="sale"
                defaultValue={selectedSale}
                className="input-studio"
              >
                <option value="">Toutes</option>
                <option value="won">Gagnée</option>
                <option value="lost">Perdue</option>
                <option value="none">Sans issue</option>
              </select>
            </div>
          </div>

          <input type="hidden" name="page" value="1" />

          <div className="mt-3 flex gap-2">
            <button type="submit" className="btn-primary">
              Filtrer
            </button>
            <Link href="/conclusions-appels" className="btn-secondary">
              Réinitialiser
            </Link>
          </div>
        </form>

        {/* Erreur Supabase */}
        {error && (
          <div
            className="mb-4 rounded-xl border p-3 text-sm"
            style={{
              background: "rgba(127,29,29,0.2)",
              borderColor: "rgba(239,68,68,0.25)",
              color: "#f87171",
            }}
          >
            Erreur Supabase : {error.message}
          </div>
        )}

        {/* Tableau */}
        <div
          className="card overflow-hidden animate-fade-in-up"
          style={{ animationDelay: "140ms" }}
        >
          <table className="table-studio">
            <thead>
              <tr>
                <th>Organisme</th>
                <th>Email</th>
                <th>Type</th>
                <th>Conclusion</th>
                <th>Résumé</th>
                <th>Vente</th>
                <th>Montant</th>
                <th>Relance</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {safeRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="py-10 text-center"
                    style={{ color: "var(--text-faint)" }}
                  >
                    Aucune conclusion ne correspond à ces filtres.
                  </td>
                </tr>
              ) : (
                safeRows.map((row: any) => {
                  const prospect = Array.isArray(row.prospect)
                    ? row.prospect[0]
                    : row.prospect;

                  return (
                    <tr key={row.id}>
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
                      <td style={{ fontSize: "0.78rem" }}>
                        {prospect.email_found || prospect.email || "—"}
                      </td>
                      <td style={{ fontSize: "0.78rem" }}>
                        {buildProspectTypeLabel(prospect.prospect_type)}
                      </td>
                      <td>
                        <OutcomeBadge outcome={row.call_outcome} />
                      </td>
                      <td>
                        <div
                          style={{
                            maxWidth: 280,
                            whiteSpace: "pre-wrap",
                            fontSize: "0.8rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          {row.call_summary || "—"}
                        </div>
                      </td>
                      <td>
                        <SaleBadge status={row.sale_status} />
                      </td>
                      <td style={{ fontSize: "0.82rem" }}>
                        {row.sale_amount != null
                          ? `${Number(row.sale_amount).toLocaleString("fr-FR")} €`
                          : "—"}
                      </td>
                      <td style={{ fontSize: "0.78rem", whiteSpace: "nowrap" }}>
                        {row.followup_needed
                          ? `Oui${row.followup_date ? ` · ${formatDate(row.followup_date)}` : ""}`
                          : "Non"}
                      </td>
                      <td style={{ fontSize: "0.78rem", whiteSpace: "nowrap" }}>
                        {formatDate(row.created_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div
          className="mt-5 flex items-center justify-between"
          style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}
        >
          <span>
            Page {currentPage} sur {totalPages}
          </span>
          <div className="flex gap-2">
            {currentPage > 1 ? (
              <Link
                href={buildPageLink({
                  search,
                  outcome: selectedOutcome,
                  sale: selectedSale,
                  page: currentPage - 1,
                })}
                className="btn-secondary"
              >
                ← Précédent
              </Link>
            ) : (
              <span
                className="btn-secondary"
                style={{ opacity: 0.35, pointerEvents: "none" }}
              >
                ← Précédent
              </span>
            )}
            {currentPage < totalPages ? (
              <Link
                href={buildPageLink({
                  search,
                  outcome: selectedOutcome,
                  sale: selectedSale,
                  page: currentPage + 1,
                })}
                className="btn-secondary"
              >
                Suivant →
              </Link>
            ) : (
              <span
                className="btn-secondary"
                style={{ opacity: 0.35, pointerEvents: "none" }}
              >
                Suivant →
              </span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
