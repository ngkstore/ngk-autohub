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

  const tokens = new Map<string, TokenLoja>();
  const brutos: EscrowBruto[] = [];
  let erros = 0;
  let ultimoErro: string | undefined;
  let processados = 0;

  for (const p of lista) {
    if (Date.now() - inicio > ORCAMENTO_MS) break;
    processados++;
    try {
      let token = tokens.get(p.loja_id);
      if (!token) {
        token = await obterTokenLoja(p.loja_id);
        tokens.set(p.loja_id, token);
      }
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
      if (/token|permission|unauthor/i.test(ultimoErro) && erros > 5) break;
    }
    // Grava a cada 100 p/ não perder tudo se estourar o tempo.
    if (brutos.length >= 100) {
      const g = await guardarEscrowBruto(brutos.splice(0, brutos.length));
      if (g.erro) ultimoErro = g.erro;
    }
  }
  const g = await guardarEscrowBruto(brutos);

  return NextResponse.json({
    sucesso: true,
    pendentes_na_fila: lista.length,
    processados,
    gravados_rodada: processados - erros,
    erros,
    ultimo_erro: g.erro ?? ultimoErro ?? null,
    segundos: Math.round((Date.now() - inicio) / 1000),
  });
}
