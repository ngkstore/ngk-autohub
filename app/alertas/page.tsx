import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import GerarAlertasButton from "../components/GerarAlertasButton";

export const dynamic = "force-dynamic";

function getCorTipo(tipo?: string | null) {
  switch (tipo) {
    case "estoque":
      return "bg-chip-vermelho-fundo text-perigo";
    case "avaliacao":
      return "bg-chip-amarelo-fundo text-alerta";
    case "token":
      return "bg-chip-azul-fundo text-primaria";
    case "sincronizacao":
      return "bg-chip-roxo-fundo text-chip-roxo-texto";
    default:
      return "bg-chip-cinza-fundo text-texto";
  }
}

export default async function AlertasPage() {
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo);

  let query = supabase
    .from("alertas")
    .select("id, titulo, descricao, tipo, status, criado_em, lojas(apelido)")
    .order("criado_em", { ascending: false })
    .limit(50);
  if (lojas) query = query.in("loja_id", lojas);
  const { data: alertasRaw } = await query;
  const alertas = (alertasRaw || []) as unknown as Array<{
    id: string;
    titulo: string | null;
    descricao: string | null;
    tipo: string | null;
    status: string | null;
    criado_em: string | null;
    lojas: { apelido: string } | null;
  }>;

  const totalAlertas = alertas?.length || 0;
  const totalEstoque =
    alertas?.filter((alerta) => alerta.tipo === "estoque").length || 0;
  const totalAvaliacoes =
    alertas?.filter((alerta) => alerta.tipo === "avaliacao").length || 0;
  const totalTokens =
    alertas?.filter((alerta) => alerta.tipo === "token").length || 0;
  const totalSincronizacoes =
    alertas?.filter((alerta) => alerta.tipo === "sincronizacao").length || 0;

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-texto">Alertas</h1>

          <p className="mt-0.5 text-[13px] text-texto-2">
            Monitore problemas de estoque, avaliações, tokens e sincronizações.
          </p>
        </div>

        <GerarAlertasButton />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
          <p className="text-sm text-texto-2">Total de Alertas</p>
          <p className="mt-2 text-4xl font-bold">{totalAlertas}</p>
        </div>

        <div className="rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
          <p className="text-sm text-texto-2">Estoque</p>
          <p className="mt-2 text-4xl font-bold text-perigo">
            {totalEstoque}
          </p>
        </div>

        <div className="rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
          <p className="text-sm text-texto-2">Avaliações</p>
          <p className="mt-2 text-4xl font-bold text-alerta">
            {totalAvaliacoes}
          </p>
        </div>

        <div className="rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
          <p className="text-sm text-texto-2">Tokens</p>
          <p className="mt-2 text-4xl font-bold text-primaria">
            {totalTokens}
          </p>
        </div>

        <div className="rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
          <p className="text-sm text-texto-2">Sincronizações</p>
          <p className="mt-2 text-4xl font-bold text-chip-roxo-texto">
            {totalSincronizacoes}
          </p>
        </div>
      </div>

      <section className="mt-6 rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
        <h2 className="text-[15px] font-semibold text-texto">Alertas Recentes</h2>

        <div className="mt-6 space-y-4">
          {alertas && alertas.length > 0 ? (
            alertas.map((alerta) => (
              <div key={alerta.id} className="rounded-[10px] border border-linha bg-superficie-2 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-bold">{alerta.titulo}</p>

                    <p className="mt-1 text-sm text-alerta">
                      {alerta.lojas?.apelido || "Sem loja vinculada"}
                    </p>
                  </div>

                  <span
                    className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${getCorTipo(
                      alerta.tipo
                    )}`}
                  >
                    {alerta.tipo || "geral"}
                  </span>
                </div>

                <p className="mt-3 text-texto">{alerta.descricao}</p>

                <div className="mt-4 flex flex-wrap gap-3 text-xs text-texto-2">
                  <span>Status: {alerta.status || "novo"}</span>

                  <span>
                    Criado em:{" "}
                    {alerta.criado_em
                      ? new Date(alerta.criado_em).toLocaleString("pt-BR")
                      : "-"}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-texto-2">
              Nenhum alerta encontrado. Clique em “Gerar Alertas” para analisar
              os dados atuais.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}