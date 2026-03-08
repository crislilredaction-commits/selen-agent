import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL manquant");
}

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    console.log("TALLY WEBHOOK BODY =", JSON.stringify(body, null, 2));

    const prospectId =
      body?.hidden?.prospect_id ||
      body?.fields?.find((f: any) => f.key === "prospect_id")?.value ||
      null;

    if (!prospectId) {
      return NextResponse.json(
        { error: "prospect_id manquant" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("prospects")
      .update({
        questionnaire_status: "completed",
        questionnaire_response_json: body,
        questionnaire_completed_at: new Date().toISOString(),
      })
      .eq("id", prospectId);

    if (error) {
      console.error("SUPABASE ERROR =", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("WEBHOOK ERROR =", error);
    return NextResponse.json(
      { error: "Erreur webhook Tally" },
      { status: 500 },
    );
  }
}
