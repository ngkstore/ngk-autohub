import { NextRequest, NextResponse } from "next/server";
import { escopoDoUsuario, podeVerLoja } from "@/lib/conta";
import { aplicarAjuste } from "@/lib/shopee/adsAjuste";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ajuste ASSISTIDO de orçamento diário / meta ROAS de uma campanha (Fase 4).
// - Só usuário logado E dono da loja (podeVerLoja) — não é rota de cron.
// - A confirmação manual é feita na tela (AjusteAds / AjusteInline); cada chamada = 1 item.
// - Toda a contabilidade (auditoria, snapshot, relógio, reforço, 'aplicada') está em
//   lib/shopee/adsAjuste.ts. Body {simular:true} só monta.
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export async function POST(request: NextRequest) {
  try {
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const lojaId = String(b.lojaId || "");
    const campaignId = Number(b.campaignId);
    const itemId = b.itemId != null && b.itemId !== "" ? Number(b.itemId) : null;
    const simular = b.simular === true;
    const orcamento = num(b.orcamento);
    const metaRoas = num(b.metaRoas);

    if (!lojaId || !Number.isFinite(campaignId)) {
      return NextResponse.json({ sucesso: false, erro: "lojaId e campaignId são obrigatórios." }, { status: 400 });
    }
    if (orcamento !== null && (Number.isNaN(orcamento) || orcamento < 0)) {
      return NextResponse.json({ sucesso: false, erro: "Orçamento inválido." }, { status: 400 });
    }
    if (metaRoas !== null && (Number.isNaN(metaRoas) || metaRoas <= 0)) {
      return NextResponse.json({ sucesso: false, erro: "Meta ROAS inválida (tem que ser > 0)." }, { status: 400 });
    }

    const escopo = await escopoDoUsuario();
    if (!podeVerLoja(escopo, lojaId)) {
      return NextResponse.json({ sucesso: false, erro: "Loja fora da sua conta." }, { status: 403 });
    }

    const { resultados, nadaAAlterar } = await aplicarAjuste({
      lojaId, campaignId, itemId, orcamento, metaRoas, simular, usuario: escopo.email || "usuário",
    });
    if (nadaAAlterar) {
      return NextResponse.json({ sucesso: false, erro: "Nada a alterar (valores iguais aos atuais)." }, { status: 400 });
    }
    return NextResponse.json({ sucesso: resultados.every((r) => r.sucesso), simular, resultados });
  } catch (error) {
    return NextResponse.json(
      { sucesso: false, erro: error instanceof Error ? error.message : "Erro ao ajustar campanha." },
      { status: 500 }
    );
  }
}
