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
    .eq("is_visible", true)
    .or("email_found.not.is.null,email.not.is.null")
    .order("created_at", { ascending: false });

  if (search) {
    query = query.ilike("organization_name", `%${search}%`);
  }

  if (selectedType) {
    query = query.eq("prospect_type", selectedType);
  }

  if (selectedDate === "today") {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    query = query.gte("created_at", startOfToday.toISOString());
  }

  if (selectedStatus === "email_envoye") {
    query = query.eq("first_email_status", "sent");
  } else if (selectedStatus === "nouveau") {
    query = query.or("workflow_status.is.null,workflow_status.eq.new");
  } else if (selectedStatus === "questionnaire_sent") {
    query = query.eq("workflow_status", "questionnaire_sent");
  } else if (selectedStatus === "questionnaire_completed") {
    query = query.eq("workflow_status", "questionnaire_completed");
  } else if (selectedStatus === "meeting_booked") {
    query = query.eq("workflow_status", "meeting_booked");
  }

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: prospects, count, error } = await query.range(from, to);

  const safeProspects = prospects ?? [];
  const totalResults = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));

  const previousPage = currentPage > 1 ? currentPage - 1 : null;
  const nextPage = currentPage < totalPages ? currentPage + 1 : null;

  return (
    <main className="min-h-screen bg-[#1a1410] p-8 text-amber-50">
      <div className="mb-4">
        <Link
          href="/"
          className="inline-block rounded-xl bg-[#2b211b] px-4 py-2 text-sm text-amber-100 hover:bg-[#3a2c24]"
        >
          ← Retour au dashboard
        </Link>
      </div>

      <h1 className="mb-2 text-3xl font-bold text-amber-100">
        Tous les prospects
      </h1>

      <p className="mb-6 text-sm text-amber-200/70">
        {totalResults} prospect(s) avec email trouvé.
      </p>

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-900/40 bg-red-950/20 p-4 text-red-200">
          Erreur Supabase : {error.message}
        </div>
      ) : null}

      <form
        method="GET"
        className="mb-6 grid gap-4 rounded-2xl border border-amber-900/40 bg-[#241b15]/85 p-4 md:grid-cols-4"
      >
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm text-amber-200/80">
            Rechercher par nom
          </label>
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="Nom de l’organisme"
            className="w-full rounded-xl border border-amber-900/40 bg-[#2b211b] px-4 py-3 text-amber-50 outline-none placeholder:text-amber-200/40"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-amber-200/80">Type</label>
          <select
            name="type"
            defaultValue={selectedType}
            className="w-full rounded-xl border border-amber-900/40 bg-[#2b211b] px-4 py-3 text-amber-50 outline-none"
          >
            <option value="">Tous</option>
            <option value="nouvel_entrant">Nouvel entrant</option>
            <option value="qp_ok">QP OK</option>
            <option value="no_nda">No NDA</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm text-amber-200/80">Statut</label>
          <select
            name="status"
            defaultValue={selectedStatus}
            className="w-full rounded-xl border border-amber-900/40 bg-[#2b211b] px-4 py-3 text-amber-50 outline-none"
          >
            <option value="">Tous</option>
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
          <label className="mb-2 block text-sm text-amber-200/80">
            Période
          </label>
          <select
            name="date"
            defaultValue={selectedDate}
            className="w-full rounded-xl border border-amber-900/40 bg-[#2b211b] px-4 py-3 text-amber-50 outline-none"
          >
            <option value="">Toutes</option>
            <option value="today">Ajoutés aujourd’hui</option>
          </select>
        </div>

        <input type="hidden" name="page" value="1" />

        <div className="md:col-span-4 flex gap-3">
          <button
            type="submit"
            className="rounded-xl bg-amber-200/80 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
          >
            Filtrer
          </button>

          <Link
            href="/prospects"
            className="rounded-xl bg-[#2b211b] px-4 py-2 text-sm text-amber-100 hover:bg-[#3a2c24]"
          >
            Réinitialiser
          </Link>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-amber-900/40">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#2b211b] text-amber-200/80">
            <tr>
              <th className="px-4 py-3">Organisme</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>

          <tbody>
            {safeProspects.length === 0 ? (
              <tr className="border-t border-amber-900/30 bg-[#201813]/80">
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-amber-200/70"
                >
                  Aucun prospect ne correspond à ces filtres.
                </td>
              </tr>
            ) : (
              safeProspects.map((prospect) => (
                <tr
                  key={prospect.id}
                  className="border-t border-amber-900/30 bg-[#201813]/80 hover:bg-[#2b211b]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/prospects/${prospect.id}`}
                      className="text-amber-100 underline"
                    >
                      {prospect.organization_name ?? "Sans nom"}
                    </Link>
                  </td>

                  <td className="px-4 py-3 text-amber-200/70">
                    {prospect.email_found || prospect.email || "—"}
                  </td>

                  <td className="px-4 py-3 text-amber-200/70">
                    {buildTypeLabel(prospect.prospect_type)}
                  </td>

                  <td className="px-4 py-3 text-amber-200/70">
                    {buildStatusLabel(
                      prospect.first_email_status,
                      prospect.workflow_status,
                    )}
                  </td>

                  <td className="px-4 py-3 text-amber-200/70">
                    {formatDate(prospect.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-amber-200/70">
          Page {currentPage} sur {totalPages}
        </p>

        <div className="flex gap-3">
          {previousPage ? (
            <Link
              href={buildPageLink({
                search,
                type: selectedType,
                status: selectedStatus,
                date: selectedDate,
                page: previousPage,
              })}
              className="rounded-xl bg-[#2b211b] px-4 py-2 text-sm text-amber-100 hover:bg-[#3a2c24]"
            >
              ← Précédent
            </Link>
          ) : (
            <span className="rounded-xl bg-[#2b211b]/50 px-4 py-2 text-sm text-amber-100/40">
              ← Précédent
            </span>
          )}

          {nextPage ? (
            <Link
              href={buildPageLink({
                search,
                type: selectedType,
                status: selectedStatus,
                date: selectedDate,
                page: previousPage,
              })}
              className="rounded-xl bg-[#2b211b] px-4 py-2 text-sm text-amber-100 hover:bg-[#3a2c24]"
            >
              Suivant →
            </Link>
          ) : (
            <span className="rounded-xl bg-[#2b211b]/50 px-4 py-2 text-sm text-amber-100/40">
              Suivant →
            </span>
          )}
        </div>
      </div>
    </main>
  );
}
