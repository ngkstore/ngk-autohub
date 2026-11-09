import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente de DADOS do servidor (server components, rotas de API, lib/**).
// S4 do plano de melhorias (09/11/2026): usa a SERVICE ROLE, que ignora o RLS —
// o escopo por conta continua sendo feito no código (lib/conta.ts). Com o RLS
// ligado em todas as tabelas, a chave anon (pública, vai ao navegador no login)
// deixa de enxergar qualquer dado.
// Enquanto SUPABASE_SERVICE_ROLE_KEY não existir no ambiente, cai na anon para
// nada quebrar — mas o RLS só pode ser ligado DEPOIS da service role estar na Vercel.
// `server-only` faz o build falhar se este arquivo for importado em "use client".
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!serviceRole && process.env.NODE_ENV === "production") {
  console.warn("[supabase] SUPABASE_SERVICE_ROLE_KEY ausente: usando a chave anon (não ligue o RLS antes de configurar).");
}

export const supabase = createClient(supabaseUrl, serviceRole || supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
