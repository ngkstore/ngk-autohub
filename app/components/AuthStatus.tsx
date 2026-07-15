"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { criarSupabaseBrowser } from "@/lib/supabase/client";

export default function AuthStatus() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = criarSupabaseBrowser();
    supabase.auth
      .getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function sair() {
    const supabase = criarSupabaseBrowser();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (!email) return null;

  return (
    <div className="text-right">
      <p className="text-sm font-semibold">{email}</p>
      <button
        onClick={sair}
        className="text-xs text-slate-400 hover:text-red-300"
      >
        Sair
      </button>
    </div>
  );
}
