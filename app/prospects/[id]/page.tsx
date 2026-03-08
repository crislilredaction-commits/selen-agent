import { notFound } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import ProspectDetailClient from "../../../components/ProspectDetailClient";

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
    <ProspectDetailClient
      prospect={prospect}
      messages={messages ?? []}
      meetings={meetings ?? []}
      reminders={reminders ?? []}
    />
  );
}
