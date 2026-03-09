import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

export default async function ProspectsPage() {
  const { data: prospects } = await supabase
    .from("prospects")
    .select("*")
    .or("email_found.not.is.null,email.not.is.null")
    .order("created_at", { ascending: false });

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
      <h1 className="mb-6 text-3xl font-bold text-amber-100">
        Tous les prospects
      </h1>

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
            {prospects?.map((prospect) => (
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
                  {prospect.prospect_type === "nouvel_entrant" &&
                    "Nouvel entrant"}
                  {prospect.prospect_type === "qp_ok" && "QP OK"}
                  {prospect.prospect_type === "no_nda" && "No NDA"}
                  {!prospect.prospect_type && "—"}
                </td>

                <td className="px-4 py-3 text-amber-200/70">
                  {prospect.first_email_status === "sent"
                    ? "email envoyé"
                    : prospect.workflow_status || "nouveau"}
                </td>

                <td className="px-4 py-3 text-amber-200/70">
                  {prospect.created_at
                    ? new Date(prospect.created_at).toLocaleDateString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
