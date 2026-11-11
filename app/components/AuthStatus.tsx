"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { criarSupabaseBrowser } from "@/lib/supabase/client";
import Icone from "./Icone";

// Avatar com as iniciais do e-mail; clique abre o menu com o e-mail e "Sair".
export default function AuthStatus() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = criarSupabaseBrowser();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, [aberto]);

  async function sair() {
    const supabase = criarSupabaseBrowser();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (!email) return null;
  const iniciais = email.slice(0, 2).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Conta ${email}`}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-primaria-suave text-xs font-bold text-primaria-texto"
      >
        {iniciais}
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 min-w-56 rounded-lg border border-borda bg-superficie p-1 shadow-cartao">
          <p className="truncate px-3 py-2 text-xs text-texto-2">{email}</p>
          <button
            type="button"
            role="menuitem"
            onClick={sair}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] text-texto hover:bg-superficie-2"
          >
            <Icone nome="sair" tamanho={15} className="text-texto-2" />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
