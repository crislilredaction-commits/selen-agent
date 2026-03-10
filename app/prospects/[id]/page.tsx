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
    <div className="relative min-h-screen bg-[#120d09]">
      {/* Background grid */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(251,191,36,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(251,191,36,0.6) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      <div className="pointer-events-none fixed left-1/4 top-0 h-[300px] w-[500px] rounded-full bg-amber-700/4 blur-[100px]" />

      {/* Breadcrumb */}
      <div className="relative border-b border-amber-900/15 bg-[#120d09]/80 px-6 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-2 text-xs text-amber-500/50">
          <Link href="/" className="hover:text-amber-400 transition-colors">
            Dashboard
          </Link>
          <span>/</span>
          <Link
            href="/prospects"
            className="hover:text-amber-400 transition-colors"
          >
            Prospects
          </Link>
          <span>/</span>
          <span className="text-amber-300/60">
            {prospect.organization_name ?? id}
          </span>
        </div>
      </div>

      <ProspectDetailClient
        prospect={prospect}
        messages={messages ?? []}
        meetings={meetings ?? []}
        reminders={reminders ?? []}
      />
    </div>
  );
}
