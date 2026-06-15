import { supabase } from "@/lib/supabase";
import GerarAlertasButton from "../components/GerarAlertasButton";

function getCorTipo(tipo?: string) {
  switch (tipo) {
    case "estoque":
      return "bg-red-900 text-red-300";
    case "avaliacao":
      return "bg-yellow-900 text-yellow-300";
    case "token":
      return "bg-blue-900 text-blue-300";
    case "sincronizacao":
      return "bg-purple-900 text-purple-300";
    default:
      return "bg-slate-700 text-slate-300";
  }
}

export default async function AlertasPage() {
  const { data: alertas } = await supabase
    .from("alertas")
    .select("*, lojas(apelido)")
    .order("criado_em", { ascending: false })
    .limit(50);

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
    <div className="p-8 text-white">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl font-bold">Alertas</h1>

          <p className="mt-2 text-slate-400">
            Monitore problemas de estoque, avaliações, tokens e sincronizações.
          </p>
        </div>

        <GerarAlertasButton />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Total de Alertas</p>
          <p className="mt-2 text-4xl font-bold">{totalAlertas}</p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Estoque</p>
          <p className="mt-2 text-4xl font-bold text-red-300">
            {totalEstoque}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Avaliações</p>
          <p className="mt-2 text-4xl font-bold text-yellow-300">
            {totalAvaliacoes}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Tokens</p>
          <p className="mt-2 text-4xl font-bold text-blue-300">
            {totalTokens}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Sincronizações</p>
          <p className="mt-2 text-4xl font-bold text-purple-300">
            {totalSincronizacoes}
          </p>
        </div>
      </div>

      <section className="mt-10 rounded-2xl bg-slate-900 p-6">
        <h2 className="text-2xl font-bold">Alertas Recentes</h2>

        <div className="mt-6 space-y-4">
          {alertas && alertas.length > 0 ? (
            alertas.map((alerta) => (
              <div key={alerta.id} className="rounded-xl bg-slate-800 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-bold">{alerta.titulo}</p>

                    <p className="mt-1 text-sm text-orange-300">
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

                <p className="mt-3 text-slate-300">{alerta.descricao}</p>

                <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
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
            <p className="text-slate-400">
              Nenhum alerta encontrado. Clique em “Gerar Alertas” para analisar
              os dados atuais.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}