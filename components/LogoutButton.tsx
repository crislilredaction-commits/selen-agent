"use client";

import { supabase } from "../lib/supabaseClient";

export default function LogoutButton() {
  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <button
      onClick={handleLogout}
      className="rounded-xl bg-[#2b211b] px-4 py-2 text-sm text-amber-100 hover:bg-[#3a2c24]"
    >
      Déconnexion
    </button>
  );
}
