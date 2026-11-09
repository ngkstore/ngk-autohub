import { NextResponse } from "next/server";
import { escopoDoUsuario, podeVerLoja, type Escopo } from "@/lib/conta";

// Autorização das rotas de API que o middleware deixa passar para QUALQUER
// usuário logado (lista ROTAS_CRON). Duas formas de entrar:
//   a) cron da Vercel / scripts: "Authorization: Bearer $CRON_SECRET";
//   b) usuário logado pela tela: precisa ter acesso a CADA loja pedida.
// Sem loja informada (operação em lote, todas as lojas) só cron ou admin.
export type Autorizacao =
  | { ok: true; viaCron: boolean; escopo: Escopo | null }
  | { ok: false; resposta: NextResponse };

export function ehCron(request: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  return request.headers.get("authorization") === `Bearer ${segredo}`;
}

export async function autorizar(request: Request, lojas?: (string | null | undefined)[]): Promise<Autorizacao> {
  if (ehCron(request)) return { ok: true, viaCron: true, escopo: null };

  const escopo = await escopoDoUsuario();
  const pedidas = (lojas || []).filter((l): l is string => !!l);

  if (pedidas.length === 0) {
    if (escopo.admin) return { ok: true, viaCron: false, escopo };
    return {
      ok: false,
      resposta: NextResponse.json(
        { sucesso: false, erro: "Operação em lote: só o cron ou o administrador." },
        { status: 403 }
      ),
    };
  }
  for (const loja of pedidas) {
    if (!podeVerLoja(escopo, loja)) {
      return {
        ok: false,
        resposta: NextResponse.json({ sucesso: false, erro: "Loja fora da sua conta." }, { status: 403 }),
      };
    }
  }
  return { ok: true, viaCron: false, escopo };
}

// Só administrador (ou cron).
export async function autorizarAdmin(request: Request): Promise<Autorizacao> {
  if (ehCron(request)) return { ok: true, viaCron: true, escopo: null };
  const escopo = await escopoDoUsuario();
  if (escopo.admin) return { ok: true, viaCron: false, escopo };
  return {
    ok: false,
    resposta: NextResponse.json({ sucesso: false, erro: "Só o administrador." }, { status: 403 }),
  };
}
