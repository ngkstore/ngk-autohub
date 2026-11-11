import { escopoDoUsuario } from "@/lib/conta";
import { supabase } from "@/lib/supabase";
import { getFlagConta } from "@/lib/flags";
import { configDevolucoes } from "@/lib/devolucoes/config";
import { brl, agoraMs } from "@/lib/formato";
import Cabecalho from "../Cabecalho";
import RegrasEditor from "./RegrasEditor";
import { Card, CardHeader, LinhaDetalhe, BotaoLink, Dica } from "../../components/ui";

export const dynamic = "force-dynamic";

export default async function RegrasPage() {
  const escopo = await escopoDoUsuario();
  const contaId = escopo.contaId;
  const [{ data: regras }, modoAprova, cfg] = await Promise.all([
    supabase.from("regras_devolucao").select("*").or(contaId ? `conta_id.eq.${contaId},conta_id.is.null` : "conta_id.is.null").order("ordem"),
    contaId ? getFlagConta("devolucoes_modo_assistente", contaId) : Promise.resolve(false),
    contaId ? configDevolucoes(contaId) : Promise.resolve(null),
  ]);
  const desde = new Date(agoraMs() - 30 * 86400000).toISOString();
  const { data: usos } = await supabase.from("devolucoes").select("regra_id").not("regra_id", "is", null).gte("atualizado_em", desde);
  const usos30 = new Map<string, number>();
  for (const u of usos || []) usos30.set(u.regra_id as string, (usos30.get(u.regra_id as string) || 0) + 1);

  return (
    <>
      <Cabecalho ativa="regras" titulo="Regras e assistente" descricao="Defina o que o sistema resolve sozinho, o que pede sua aprovação e o que só avisa." />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <RegrasEditor
            regras={(regras || []).map((r) => ({ id: r.id, conta_id: r.conta_id, ordem: r.ordem, ativa: r.ativa, nome: r.nome, condicao: r.condicao, acao: r.acao, modo: r.modo, usos30: usos30.get(r.id) ?? 0 }))}
            modoAssistente={modoAprova ? "aprovar" : "sugerir"}
            acoesApi={!!cfg?.acoes_api}
            admin={escopo.admin}
          />
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader titulo="Limites de segurança" descricao="fixos no código; só os valores mudam em Configurações" acoes={<BotaoLink href="/configuracoes" pequeno>Configurações</BotaoLink>} />
            <LinhaDetalhe rotulo="Aprovação automática por caso" valor={`até ${brl(cfg?.limites.auto_caso_max ?? 100, 0)}`} />
            <LinhaDetalhe rotulo="Total aprovado sozinho por dia" valor={`até ${brl(cfg?.limites.auto_dia_max ?? 500, 0)}`} />
            <LinhaDetalhe rotulo="Recusa, disputa e oferta" valor="sempre pedem aprovação" />
            <LinhaDetalhe rotulo="Comprador suspeito" valor="nunca aprovado sozinho" />
            <LinhaDetalhe rotulo="Ações pela API" valor={cfg?.acoes_api ? "ligadas" : "desligadas"} destaque />
            {!cfg?.acoes_api && <Dica className="mt-3">Com as ações pela API desligadas, as regras automáticas viram pedidos de aprovação e nada é enviado às plataformas.</Dica>}
          </Card>
          <Card>
            <CardHeader titulo="Avisos no Telegram" />
            <ul className="space-y-1 text-[13px] text-texto">
              <li>✅ Pedido de aprovação (sugestão do assistente ou regra)</li>
              <li>✅ Prazo com menos de {cfg?.limites.alerta_horas ?? 4} h</li>
              <li>✅ Disputa ganha sem crédito em {cfg?.limites.credito_dias ?? 3} dias</li>
              <li className="text-texto-2">Resumo às 8 h e 14 h: Painel do dia (Parte C)</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
