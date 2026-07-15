import { createBrowserClient } from "@supabase/ssr";

// Cliente do navegador só para AUTENTICAÇÃO (login/logout). Os dados continuam
// usando o cliente anon em lib/supabase.ts.
export function criarSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
