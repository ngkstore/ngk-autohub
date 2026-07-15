import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente de servidor (server components / route handlers) para ler a sessão
// do usuário logado a partir dos cookies.
export async function criarSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // chamado de um Server Component: ignora (a sessão é atualizada
            // pelo middleware). Sem problema.
          }
        },
      },
    }
  );
}
