import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import { listarDevolucoes } from "@/lib/devolucoes/consultas";
import { brl, agoraMs } from "@/lib/formato";
import Cabecalho from "../Cabecalho";
import Recebimento from "./Recebimento";
import { Kpi } from "../../components/ui";

export const dynamic = "force-dynamic";

export default async function RecebimentoPage({ searchParams }: { searchParams: Promise<{ loja?: string; q?: string }> }) {
  const params = await searchParams;
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);
  const abertas = await listarDevolucoes(lojas);
  const agora = agoraMs();
  const voltando = abertas.filter((d) => d.etapa === "voltando");
  const aguardando = abertas.filter((d) => d.etapa === "recebido" || (d.etapa === "inspecao"));
  const maisAntiga = aguardando.reduce<number | null>((m, d) => {
    const t = d.chegou_em ? new Date(d.chegou_em).getTime() : null;
    return t === null ? m : m === null ? t : Math.min(m, t);
  }, null);
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);
  const contestar = abertas.filter((d) => d.chegou_em && d.prazo_contestar && new Date(d.prazo_contestar).getTime() - agora < 2 * 86400000 && new Date(d.prazo_contestar).getTime() > agora).length;
  const fila = [...aguardando, ...voltando].map((d) => ({
    id: d.id,
    canal: d.canal,
    plataforma_id: d.plataforma_id,
    pedido_id: d.pedido_id,
    etapa: d.etapa,
    motivo: d.motivo_texto || d.motivo_codigo,
    itens: d.itens,
    rastreio: d.rastreio_reverso,
    chegou_em: d.chegou_em,
    loja: d.lojas?.apelido ?? null,
    valor: Number(d.valor_reembolso_pedido || 0),
  }));

  return (
    <>
      <Cabecalho ativa="recebimento" titulo="Recebimento e inspeção" descricao="Bipe o pacote que voltou, confira o que veio e decida o destino do produto." />
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <Kpi icone="devolucoes" cor="ceu" rotulo="Voltando (rastreio reverso)" valor={voltando.length} detalhe={`${brl(voltando.reduce((s, d) => s + Number(d.valor_reembolso_pedido || 0), 0), 0)} em produtos`} />
        <Kpi icone="estoque" cor="laranja" rotulo="Aguardando inspeção" valor={aguardando.length} detalhe={maisAntiga ? `mais antiga há ${Math.max(0, Math.round((agora - maisAntiga) / 86400000))} dia(s)` : "nenhuma"} />
        <Kpi icone="auditoria" cor="verde" rotulo="Inspecionadas hoje" valor={abertas.filter((d) => d.etapa === "inspecao" && new Date(d.atualizado_em) >= inicioHoje).length} />
        <Kpi icone="alertas" cor={contestar ? "vermelho" : "indigo"} rotulo="Prazo para contestar vencendo" valor={contestar} detalhe="após receber, o prazo corre" />
      </div>
      <Recebimento fila={fila} termoInicial={params.q || ""} />
    </>
  );
}
