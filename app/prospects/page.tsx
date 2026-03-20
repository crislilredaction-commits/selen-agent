import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

type SearchParams = {
  search?: string;
  type?: string;
  status?: string;
  date?: string;
  page?: string;
};

const PAGE_SIZE = 25;

function buildTypeLabel(prospectType: string | null) {
  if (prospectType === "nouvel_entrant") return "Nouvel entrant";
  if (prospectType === "qp_ok") return "QP OK";
  if (prospectType === "no_nda") return "No NDA";
  return "—";
}

function buildStatusLabel(
  firstEmailStatus: string | null,
  workflowStatus: string | null,
) {
  if (firstEmailStatus === "sent") return "email envoyé";
  return workflowStatus || "nouveau";
}

function buildPageLink(params: {
  search: string;
  type: string;
  status: string;
  date: string;
  page: number;
}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.type) query.set("type", params.type);
  if (params.status) query.set("status", params.status);
  if (params.date) query.set("date", params.date);
  query.set("page", String(params.page));
  return `/prospects?${query.toString()}`;
}

function formatDate(dateString: string | null) {
  if (!dateString) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(dateString));
}

const typeColors: Record<string, string> = {
  nouvel_entrant: "text-emerald-400 bg-emerald-900/30 border-emerald-800/40",
  qp_ok: "text-sky-400 bg-sky-900/30 border-sky-800/40",
  no_nda: "text-rose-400 bg-rose-900/30 border-rose-800/40",
};

const statusColors: Record<string, string> = {
  "email envoyé": "text-emerald-300 bg-emerald-900/20 border-emerald-800/30",
  questionnaire_sent: "text-amber-300 bg-amber-900/20 border-amber-800/30",
  questionnaire_completed:
    "text-violet-300 bg-violet-900/20 border-violet-800/30",
  meeting_booked: "text-sky-300 bg-sky-900/20 border-sky-800/30",
  nouveau: "text-amber-400/60 bg-transparent border-amber-900/20",
};

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const search = (resolvedSearchParams.search ?? "").trim();
  const selectedType = (resolvedSearchParams.type ?? "").trim();
  const selectedStatus = (resolvedSearchParams.status ?? "").trim();
  const selectedDate = (resolvedSearchParams.date ?? "").trim();
  const currentPage = Math.max(
    1,
    Number(resolvedSearchParams.page ?? "1") || 1,
  );

  let query = supabase
    .from("prospects")
    .select("*", { count: "exact" })
    .eq("source", "selion_1_nda")
    .eq("is_visible", true)
    .or("email_found.not.is.null,email.not.is.null")
    .order("created_at", { ascending: false });

  if (search) query = query.ilike("organization_name", `%${search}%`);
  if (selectedType) query = query.eq("prospect_type", selectedType);

  if (selectedDate === "today") {
    const todayParis = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    query = query.gte("created_at", `${todayParis}T00:00:00+01:00`);
  }

  if (selectedStatus === "email_envoye")
    query = query.eq("first_email_status", "sent");
  else if (selectedStatus === "nouveau")
    query = query.or("workflow_status.is.null,workflow_status.eq.new");
  else if (selectedStatus === "questionnaire_sent")
    query = query.eq("workflow_status", "questionnaire_sent");
  else if (selectedStatus === "questionnaire_completed")
    query = query.eq("workflow_status", "questionnaire_completed");
  else if (selectedStatus === "meeting_booked")
    query = query.eq("workflow_status", "meeting_booked");

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: prospects, count, error } = await query.range(from, to);

  const safeProspects = prospects ?? [];
  const totalResults = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#120d09] text-amber-50">
      {/* Background grid */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(251,191,36,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(251,191,36,0.6) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      <div className="pointer-events-none fixed left-1/2 top-0 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-amber-600/4 blur-[100px]" />

      <div className="relative mx-auto max-w-7xl px-6 py-10">
        {/* Breadcrumb */}
        <div className="mb-8 flex items-center gap-2 text-xs text-amber-500/50">
          <Link href="/" className="hover:text-amber-400 transition-colors">
            Dashboard
          </Link>
          <span>/</span>
          <span className="text-amber-300/70">Prospects</span>
        </div>

        {/* Header */}
        <header className="mb-8">
          <div className="mb-1 flex items-center gap-2">
            <div className="h-px w-8 bg-amber-500/60" />
            <span className="text-xs font-medium uppercase tracking-[0.25em] text-amber-500/70">
              Sélion 1 · NDA
            </span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="font-cinzel text-4xl font-bold text-amber-100">
                Prospects
              </h1>
              <p className="mt-1 text-sm text-amber-400/50">
                {totalResults} prospect(s) contactable(s)
              </p>
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-900/40 bg-red-950/20 p-4 text-sm text-red-300">
            Erreur : {error.message}
          </div>
        )}

        {/* Filters */}
        <form
          method="GET"
          className="mb-6 rounded-2xl border border-amber-900/20 bg-gradient-to-b from-[#1e1610]/80 to-[#170f0a]/80 p-5 backdrop-blur-sm"
        >
          <p className="mb-4 text-xs font-medium uppercase tracking-widest text-amber-500/50">
            Filtres
          </p>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs text-amber-300/50">
                Rechercher
              </label>
              <input
                type="text"
                name="search"
                defaultValue={search}
                placeholder="Nom de l'organisme..."
                className="w-full rounded-xl border border-amber-900/30 bg-[#1a1108]/80 px-4 py-2.5 text-sm text-amber-100 outline-none placeholder:text-amber-700/40 focus:border-amber-700/50 transition-colors"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-amber-300/50">
                Type
              </label>
              <select
                name="type"
                defaultValue={selectedType}
                className="w-full rounded-xl border border-amber-900/30 bg-[#1a1108]/80 px-4 py-2.5 text-sm text-amber-100 outline-none focus:border-amber-700/50 transition-colors"
              >
                <option value="">Tous les types</option>
                <option value="nouvel_entrant">Nouvel entrant</option>
                <option value="qp_ok">QP OK</option>
                <option value="no_nda">No NDA</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-amber-300/50">
                Statut
              </label>
              <select
                name="status"
                defaultValue={selectedStatus}
                className="w-full rounded-xl border border-amber-900/30 bg-[#1a1108]/80 px-4 py-2.5 text-sm text-amber-100 outline-none focus:border-amber-700/50 transition-colors"
              >
                <option value="">Tous les statuts</option>
                <option value="nouveau">Nouveau</option>
                <option value="email_envoye">Email envoyé</option>
                <option value="questionnaire_sent">Questionnaire envoyé</option>
                <option value="questionnaire_completed">
                  Questionnaire complété
                </option>
                <option value="meeting_booked">RDV programmé</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-amber-300/50">
                Période
              </label>
              <select
                name="date"
                defaultValue={selectedDate}
                className="w-full rounded-xl border border-amber-900/30 bg-[#1a1108]/80 px-4 py-2.5 text-sm text-amber-100 outline-none focus:border-amber-700/50 transition-colors"
              >
                <option value="">Toutes les périodes</option>
                <option value="today">Aujourd'hui</option>
              </select>
            </div>

            <input type="hidden" name="page" value="1" />

            <div className="md:col-span-4 flex gap-3">
              <button
                type="submit"
                className="rounded-xl bg-amber-700/70 px-5 py-2.5 text-xs font-medium uppercase tracking-wider text-amber-100 transition-all hover:bg-amber-600/80 border border-amber-600/30"
              >
                Appliquer
              </button>
              <Link
                href="/prospects"
                className="rounded-xl border border-amber-900/30 bg-transparent px-5 py-2.5 text-xs font-medium uppercase tracking-wider text-amber-400/70 transition-all hover:border-amber-800/50 hover:text-amber-300"
              >
                Réinitialiser
              </Link>
            </div>
          </div>
        </form>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-amber-900/20">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-amber-900/20 bg-[#1a1108]/80">
                <th className="px-4 py-3.5 text-xs font-medium uppercase tracking-wider text-amber-400/40">
                  Organisme
                </th>
                <th className="px-4 py-3.5 text-xs font-medium uppercase tracking-wider text-amber-400/40">
                  Email
                </th>
                <th className="px-4 py-3.5 text-xs font-medium uppercase tracking-wider text-amber-400/40">
                  Type
                </th>
                <th className="px-4 py-3.5 text-xs font-medium uppercase tracking-wider text-amber-400/40">
                  Statut
                </th>
                <th className="px-4 py-3.5 text-xs font-medium uppercase tracking-wider text-amber-400/40">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {safeProspects.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="bg-[#120d09] px-4 py-12 text-center text-sm text-amber-400/30"
                  >
                    Aucun prospect ne correspond à ces filtres
                  </td>
                </tr>
              ) : (
                safeProspects.map((prospect, i) => {
                  const statusLabel = buildStatusLabel(
                    prospect.first_email_status,
                    prospect.workflow_status,
                  );
                  return (
                    <tr
                      key={prospect.id}
                      className={`border-t border-amber-900/10 transition-colors hover:bg-amber-900/8 ${
                        i % 2 === 0 ? "bg-[#130e0a]/60" : "bg-[#0f0b08]/60"
                      }`}
                    >
                      <td className="px-4 py-3.5">
                        <Link
                          href={`/prospects/${prospect.id}`}
                          className="font-medium text-amber-100 transition-colors hover:text-amber-300"
                        >
                          {prospect.organization_name ?? "Sans nom"}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-amber-300/50">
                        {prospect.email_found || prospect.email || "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            typeColors[prospect.prospect_type] ??
                            "border-amber-900/20 bg-transparent text-amber-400/40"
                          }`}
                        >
                          {buildTypeLabel(prospect.prospect_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            statusColors[statusLabel] ??
                            "border-amber-900/20 bg-transparent text-amber-400/50"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-amber-400/40">
                        {formatDate(prospect.created_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-5 flex items-center justify-between">
          <p className="text-xs text-amber-400/40">
            Page {currentPage} / {totalPages} · {totalResults} résultat(s)
          </p>
          <div className="flex gap-2">
            {currentPage > 1 ? (
              <Link
                href={buildPageLink({
                  search,
                  type: selectedType,
                  status: selectedStatus,
                  date: selectedDate,
                  page: currentPage - 1,
                })}
                className="rounded-xl border border-amber-900/30 bg-[#1e1610]/60 px-4 py-2 text-xs text-amber-300 transition-all hover:border-amber-700/40 hover:bg-amber-900/20"
              >
                ← Précédent
              </Link>
            ) : (
              <span className="rounded-xl border border-amber-900/15 px-4 py-2 text-xs text-amber-700/30">
                ← Précédent
              </span>
            )}
            {currentPage < totalPages ? (
              <Link
                href={buildPageLink({
                  search,
                  type: selectedType,
                  status: selectedStatus,
                  date: selectedDate,
                  page: currentPage + 1,
                })}
                className="rounded-xl border border-amber-900/30 bg-[#1e1610]/60 px-4 py-2 text-xs text-amber-300 transition-all hover:border-amber-700/40 hover:bg-amber-900/20"
              >
                Suivant →
              </Link>
            ) : (
              <span className="rounded-xl border border-amber-900/15 px-4 py-2 text-xs text-amber-700/30">
                Suivant →
              </span>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
