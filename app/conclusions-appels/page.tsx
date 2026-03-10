import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

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
      return "Injoignable / sans retour";
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

function buildSaleStatusLabel(value: string | null) {
  switch (value) {
    case "won":
      return "Gagnée";
    case "lost":
      return "Perdue";
    default:
      return "—";
  }
}

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

export default async function ConclusionsAppelsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};

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
      `
        id,
        created_at,
        meeting_status,
        sale_status,
        sale_amount,
        call_outcome,
        call_summary,
        followup_needed,
        followup_date,
        prospect:prospects (
          id,
          organization_name,
          email,
          email_found,
          prospect_type,
          workflow_status,
          is_visible,
          source
        )
      `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (selectedOutcome) {
    query = query.eq("call_outcome", selectedOutcome);
  }

  if (selectedSale === "won") {
    query = query.eq("sale_status", "won");
  } else if (selectedSale === "lost") {
    query = query.eq("sale_status", "lost");
  } else if (selectedSale === "none") {
    query = query.is("sale_status", null);
  }

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, count, error } = await query.range(from, to);

  const safeRows =
    (data ?? []).filter((row: any) => {
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
    }) ?? [];

  const totalResults = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));

  const salesWonCount = safeRows.filter(
    (row: any) => row.sale_status === "won",
  ).length;
  const revenue = safeRows
    .filter((row: any) => row.sale_status === "won")
    .reduce((sum: number, row: any) => sum + (Number(row.sale_amount) || 0), 0);

  return (
    <main className="min-h-screen bg-[#1a1410] p-8 text-amber-50">
      <div className="mb-4 flex gap-3">
        <Link
          href="/"
          className="inline-block rounded-xl bg-[#2b211b] px-4 py-2 text-sm text-amber-100 hover:bg-[#3a2c24]"
        >
          ← Dashboard
        </Link>

        <Link
          href="/prospects"
          className="inline-block rounded-xl bg-[#2b211b] px-4 py-2 text-sm text-amber-100 hover:bg-[#3a2c24]"
        >
          ← Liste prospects
        </Link>
      </div>

      <h1 className="mb-2 text-3xl font-bold text-amber-100">
        Conclusions d’appel
      </h1>

      <p className="mb-6 text-sm text-amber-200/70">
        Vue synthèse des appels et rendez-vous saisis dans les fiches prospects.
      </p>

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-900/40 bg-red-950/20 p-4 text-red-200">
          Erreur Supabase : {error.message}
        </div>
      ) : null}

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-amber-900/40 bg-[#241b15]/85 p-4">
          <p className="text-sm text-amber-200/70">Conclusions affichées</p>
          <p className="mt-2 text-3xl font-semibold text-amber-100">
            {safeRows.length}
          </p>
        </div>

        <div className="rounded-2xl border border-amber-900/40 bg-[#241b15]/85 p-4">
          <p className="text-sm text-amber-200/70">Ventes gagnées</p>
          <p className="mt-2 text-3xl font-semibold text-amber-100">
            {salesWonCount}
          </p>
        </div>

        <div className="rounded-2xl border border-amber-900/40 bg-[#241b15]/85 p-4">
          <p className="text-sm text-amber-200/70">CA visible</p>
          <p className="mt-2 text-3xl font-semibold text-amber-100">
            {revenue.toLocaleString("fr-FR")} €
          </p>
        </div>
      </section>

      <form
        method="GET"
        className="mb-6 grid gap-4 rounded-2xl border border-amber-900/40 bg-[#241b15]/85 p-4 md:grid-cols-4"
      >
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm text-amber-200/80">
            Rechercher
          </label>
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="Nom organisme ou email"
            className="w-full rounded-xl border border-amber-900/40 bg-[#2b211b] px-4 py-3 text-amber-50 outline-none placeholder:text-amber-200/40"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-amber-200/80">
            Conclusion
          </label>
          <select
            name="outcome"
            defaultValue={selectedOutcome}
            className="w-full rounded-xl border border-amber-900/40 bg-[#2b211b] px-4 py-3 text-amber-50 outline-none"
          >
            <option value="">Toutes</option>
            <option value="won_audit_blanc">Vente audit blanc</option>
            <option value="won_preparation_qualiopi">
              Vente préparation Qualiopi
            </option>
            <option value="won_preparation_nda">Vente préparation NDA</option>
            <option value="won_gestion_quotidienne">
              Vente gestion quotidienne
            </option>
            <option value="needs_followup_call">À rappeler</option>
            <option value="not_interested">Pas intéressé</option>
            <option value="no_answer">Injoignable / sans retour</option>
            <option value="other">Autre</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm text-amber-200/80">Vente</label>
          <select
            name="sale"
            defaultValue={selectedSale}
            className="w-full rounded-xl border border-amber-900/40 bg-[#2b211b] px-4 py-3 text-amber-50 outline-none"
          >
            <option value="">Toutes</option>
            <option value="won">Gagnée</option>
            <option value="lost">Perdue</option>
            <option value="none">Sans issue de vente</option>
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
            href="/conclusions-appels"
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
              <th className="px-4 py-3">Conclusion</th>
              <th className="px-4 py-3">Résumé</th>
              <th className="px-4 py-3">Vente</th>
              <th className="px-4 py-3">Montant</th>
              <th className="px-4 py-3">Relance</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>

          <tbody>
            {safeRows.length === 0 ? (
              <tr className="border-t border-amber-900/30 bg-[#201813]/80">
                <td
                  colSpan={9}
                  className="px-4 py-6 text-center text-amber-200/70"
                >
                  Aucune conclusion d’appel ne correspond à ces filtres.
                </td>
              </tr>
            ) : (
              safeRows.map((row: any) => {
                const prospect = Array.isArray(row.prospect)
                  ? row.prospect[0]
                  : row.prospect;

                return (
                  <tr
                    key={row.id}
                    className="border-t border-amber-900/30 bg-[#201813]/80 align-top hover:bg-[#2b211b]"
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
                      {buildProspectTypeLabel(prospect.prospect_type)}
                    </td>

                    <td className="px-4 py-3 text-amber-200/70">
                      {buildOutcomeLabel(row.call_outcome)}
                    </td>

                    <td className="px-4 py-3 text-amber-200/70">
                      <div className="max-w-[320px] whitespace-pre-wrap">
                        {row.call_summary || "—"}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-amber-200/70">
                      {buildSaleStatusLabel(row.sale_status)}
                    </td>

                    <td className="px-4 py-3 text-amber-200/70">
                      {row.sale_amount != null
                        ? `${Number(row.sale_amount).toLocaleString("fr-FR")} €`
                        : "—"}
                    </td>

                    <td className="px-4 py-3 text-amber-200/70">
                      {row.followup_needed
                        ? `Oui${row.followup_date ? ` · ${formatDate(row.followup_date)}` : ""}`
                        : "Non"}
                    </td>

                    <td className="px-4 py-3 text-amber-200/70">
                      {formatDate(row.created_at)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-amber-200/70">
          Page {currentPage} sur {totalPages}
        </p>

        <div className="flex gap-3">
          {currentPage > 1 ? (
            <Link
              href={buildPageLink({
                search,
                outcome: selectedOutcome,
                sale: selectedSale,
                page: currentPage - 1,
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

          {currentPage < totalPages ? (
            <Link
              href={buildPageLink({
                search,
                outcome: selectedOutcome,
                sale: selectedSale,
                page: currentPage + 1,
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
