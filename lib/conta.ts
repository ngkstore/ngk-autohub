import { supabase } from "@/lib/supabase";
import { criarSupabaseServer } from "@/lib/supabase/server";

export type Escopo = {
  email: string | null;
  admin: boolean;
  contaId: string | null;
  lojaIds: string[]; // lojas que o usuário pode ver (todas, se admin)
  preSetup: boolean; // true = tabelas de conta ainda não criadas (só o dono)
};

// Resolve o escopo do usuário logado: quais lojas ele pode ver.
// - admin -> todas as lojas.
// - membro de uma conta -> só as lojas daquela conta.
// - sem vínculo -> nenhuma.
// Antes de rodar contas.sql (tabelas ainda não existem) -> trata como admin,
// para o dono não ficar sem acesso durante a migração.
export async function escopoDoUsuario(): Promise<Escopo> {
  const authClient = await criarSupabaseServer();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  const email = user?.email?.toLowerCase() ?? null;

  let admin = false;
  let contaId: string | null = null;
  let preSetup = false;

  if (email) {
    const { data: membro, error } = await supabase
      .from("conta_membros")
      .select("conta_id, admin")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      // Tabela ainda não existe (pré-migração): mantém o dono com acesso total.
      preSetup = true;
      admin = true;
    } else if (membro) {
      admin = !!membro.admin;
      contaId = membro.conta_id ?? null;
    }
    // membro null (logado sem vínculo) -> admin=false, contaId=null -> sem lojas.
  }

  // Cada usuário (inclusive o admin/dono) vê só as lojas da SUA conta.
  // O flag `admin` continua servindo às páginas administrativas (ex.: /uso),
  // mas NÃO dá mais visão de todas as lojas no dia a dia.
  // Exceção: pré-setup (tabelas de conta ainda não existem) -> dono vê tudo.
  let lojaIds: string[] = [];
  if (preSetup) {
    const { data } = await supabase.from("lojas").select("id");
    lojaIds = (data || []).map((l) => l.id);
  } else if (contaId) {
    const { data } = await supabase
      .from("lojas")
      .select("id")
      .eq("conta_id", contaId);
    lojaIds = (data || []).map((l) => l.id);
  }

  return { email, admin, contaId, lojaIds, preSetup };
}

// Lista de loja_ids para filtrar as consultas, dado o ?loja da URL (um loja_id).
//   null  -> sem filtro (admin vendo tudo).
//   [...] -> restringe a essas lojas (a loja escolhida, ou a conta do usuário).
export function filtroLojas(
  escopo: Escopo,
  lojaParam?: string
): string[] | null {
  if (lojaParam && escopo.lojaIds.includes(lojaParam)) return [lojaParam];
  return escopo.lojaIds; // sempre escopa pela conta do usuário (vazio = nenhuma)
}

// O usuário pode operar/ver esta loja? Admin vê tudo; senão só as da conta.
// Use nas rotas que recebem um lojaId do cliente, para não deixar um usuário
// acionar ações em loja de outra conta.
export function podeVerLoja(escopo: Escopo, lojaId?: string | null): boolean {
  if (!lojaId) return false;
  return escopo.admin || escopo.lojaIds.includes(lojaId);
}
