"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { criarSupabaseBrowser } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(
    params.get("erro") === "sem-permissao"
      ? "Seu e-mail não tem permissão para acessar este sistema."
      : ""
  );

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro("");

    const supabase = criarSupabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });

    if (error) {
      setErro("E-mail ou senha inválidos.");
      setCarregando(false);
      return;
    }

    const destino = params.get("next") || "/";
    router.push(destino);
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fundo p-6">
      <form
        onSubmit={entrar}
        className="w-full max-w-sm rounded-2xl border border-borda bg-superficie p-8 text-texto"
      >
        <h1 className="text-3xl font-bold">NGK AutoHub</h1>
        <p className="mt-1 text-sm text-texto-2">
          Entre com sua conta para acessar o sistema.
        </p>

        <label className="mt-6 block text-sm text-texto">E-mail</label>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-borda bg-superficie-2 px-4 py-2 text-texto outline-none focus:border-primaria"
        />

        <label className="mt-4 block text-sm text-texto">Senha</label>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="mt-1 w-full rounded-lg border border-borda bg-superficie-2 px-4 py-2 text-texto outline-none focus:border-primaria"
        />

        {erro && (
          <p className="mt-4 rounded-lg bg-chip-vermelho-fundo/60 px-3 py-2 text-sm text-perigo">
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={carregando}
          className="mt-6 w-full rounded-xl bg-primaria px-4 py-2.5 font-semibold text-texto hover:bg-primaria-hover disabled:opacity-50"
        >
          {carregando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
