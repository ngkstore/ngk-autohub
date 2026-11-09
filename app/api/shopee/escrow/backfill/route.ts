import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";
import { buscarEscrow, obterTokenLoja, type TokenLoja } from "@/lib/shopee/enriquecerEscrow";
import { guardarEscrowBruto, type EscrowBruto } from "@/lib/shopee/escrowBruto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// BACKFILL da Camada 1: re-puxa o detalhamento (get_escrow_detail) dos pedidos
// que ainda não têm o bruto em pedido_escrow, do mais recente para o mais
// antigo, e gera as linhas de custos_pedido. O escrow atual já foi lido uma
// vez para preencher as colunas do pedido, mas o bruto não foi guardado.
//
// Uso: GET /api/shopee/escrow/backfill?limite=400&loja=<id>&desde=2026-01-01&ate=2026-12-31
//   cron (Bearer CRON_SECRET) ou admin logado. Orçamento de ~240s por rodada.
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const viaCron = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!viaCron) {
    const escopo = await escopoDoUsuario();
    if (!escopo.admin) return NextResponse.json({ sucesso: false, erro: "Só o administrador." }, { status: 403 });
  }
  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;
  const baseUrl = process.env.SHOPEE_API_BASE_URL || "https://partner.shopeemobile.com";
  if (!partnerId || !partnerKey) return NextResponse.json({ sucesso: false, erro: "Credenciais Shopee ausentes." }, { status: 500 });

  const sp = request.nextUrl.searchParams;
  const limite = Math.min(2000, Number(sp.get("limite")) || 400);
  const loja = sp.get("loja");
  const desde = sp.get("desde") || "2026-01-01";
  const ate = sp.get("ate") || null;
  const inicio = Date.now();
  const ORCAMENTO_MS = 240_000;

  const { data: pendentes, error } = await supabase.rpc("pedidos_sem_escrow_bruto", {
    p_loja: loja, p_desde: desde, p_ate: ate, p_limite: limite,
  });
  if (error) return NextResponse.json({ sucesso: false, erro: error.message }, { status: 500 });
  const lista = (pendentes as { loja_id: string; pedido_externo_id: string }[]) || [];

  // Paralelismo: a Shopee responde em ~0,7 s por pedido; com um pedido por vez a
  // rodada parava em ~330. Com CONCORRENCIA trabalhadores puxando da mesma fila
  // passa de ~900 por rodada, ainda longe do limite de chamadas da Shopee.
  const CONCORRENCIA = Math.min(6, Math.max(1, Number(sp.get("paralelo")) || 3));
  const tokens = new Map<string, Promise<TokenLoja>>();
  const obterToken = (lojaId: string) => {
    let t = tokens.get(lojaId);
    if (!t) {
      t = obterTokenLoja(lojaId);
      tokens.set(lojaId, t);
    }
    return t;
  };
  let brutos: EscrowBruto[] = [];
  let erros = 0;
  let errosToken = 0;
  let ultimoErro: string | undefined;
  let processados = 0;
  let parar = false;
  let proximo = 0;
  let gravando: Promise<void> = Promise.resolve();

  // Grava em blocos de 100 p/ não perder tudo se estourar o tempo (sem bloquear
  // os trabalhadores: a gravação anterior encadeia com a próxima).
  const gravarBloco = () => {
    const bloco = brutos;
    brutos = [];
    gravando = gravando.then(async () => {
      const g = await guardarEscrowBruto(bloco);
      if (g.erro) ultimoErro = g.erro;
    });
  };

  const trabalhador = async () => {
    while (!parar) {
      if (Date.now() - inicio > ORCAMENTO_MS) break;
      const p = lista[proximo++];
      if (!p) break;
      processados++;
      try {
        const token = await obterToken(p.loja_id);
        const escrow = await buscarEscrow({ baseUrl, partnerId, partnerKey, token, orderSn: p.pedido_externo_id });
        if (escrow?.order_income) {
          brutos.push({ lojaId: p.loja_id, orderSn: p.pedido_externo_id, income: escrow.order_income, buyer: escrow.buyer_payment_info ?? null });
        } else {
          erros++;
          ultimoErro = "escrow sem order_income";
        }
      } catch (e) {
        erros++;
        ultimoErro = e instanceof Error ? e.message : "erro";
        // Erro de token/permissão repetido: para a rodada para não queimar cota.
        if (/token|permission|unauthor/i.test(ultimoErro) && ++errosToken > 5) parar = true;
      }
      if (brutos.length >= 100) gravarBloco();
    }
  };
  await Promise.all(Array.from({ length: CONCORRENCIA }, trabalhador));
  gravarBloco();
  await gravando;

  return NextResponse.json({
    sucesso: true,
    pendentes_na_fila: lista.length,
    paralelo: CONCORRENCIA,
    processados,
    gravados_rodada: processados - erros,
    erros,
    ultimo_erro: ultimoErro ?? null,
    segundos: Math.round((Date.now() - inicio) / 1000),
  });
}
