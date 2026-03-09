"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-[#1a1410] text-amber-50 flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-amber-900/40 bg-[#241b15]/90 p-8 shadow-2xl">
        <h1 className="text-3xl font-bold text-amber-100">
          Connexion à Sélion
        </h1>
        <p className="mt-2 text-sm text-amber-200/70">
          Accès réservé à l’équipe Selen Editions
        </p>

        <form onSubmit={handleLogin} className="mt-8 space-y-5">
          <div>
            <label className="mb-2 block text-sm text-amber-200/80">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-amber-900/40 bg-[#2b211b] px-4 py-3 text-amber-50 outline-none placeholder:text-amber-200/40"
              placeholder="adresse email"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-amber-200/80">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-xl border border-amber-900/40 bg-[#2b211b] px-4 py-3 text-amber-50 outline-none placeholder:text-amber-200/40"
              placeholder="••••••••"
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-amber-200/80 px-4 py-3 font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </div>
    </main>
  );
}
