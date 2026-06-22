import { supabase } from "@/lib/supabase";
import SyncTipoButton from "../components/SyncTipoButton";
import SincronizarPedidosButton from "../components/SincronizarPedidosButton";
import EnriquecerPedidosButton from "../components/EnriquecerPedidosButton";
import EnriquecerFinanceiroButton from "../components/EnriquecerFinanceiroButton";

function normalizarTexto(valor?: string) {
  return valor
    ?.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export default async function SincronizacaoPage() {
  const { data: lojas } = await supabase
    .from("lojas")
    .select("*")
    .order("criado_em", { ascending: false });

  const lojaSelecionada =
    lojas?.find(
      (loja) =>
        normalizarTexto(loja.apelido)?.includes("ngk") &&
        normalizarTexto(loja.marketplace)?.includes("shopee")
    ) || null;

  const { data: sincronizacoes } = await supabase
    .from("sincronizacoes")
    .select("*, lojas(apelido)")
    .order("iniciado_em", { ascending: false })
    .limit(20);

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">Centro de Sincronização</h1>

      <p className="mt-2 text-slate-400">
        Execute importações por módulo e acompanhe o histórico de sincronizações.
      </p>

      <p className="mt-4 text-sm text-slate-400">
        Loja usada na sincronização:
        <span className="ml-2 font-semibold text-white">
          {lojaSelecionada?.apelido || "Nenhuma loja encontrada"}
        </span>
      </p>

      <section className="mt-8 rounded-2xl bg-slate-900 p-6">
        <h2 className="text-2xl font-bold">Ações de Sincronização</h2>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SyncTipoButton
            tipo="produtos"
            label="Sincronizar Produtos"
            lojaId={lojaSelecionada?.id || ""}
          />

          <SyncTipoButton
            tipo="pedidos"
            label="Sincronizar Pedidos"
            lojaId={lojaSelecionada?.id || ""}
          />

          <SyncTipoButton
            tipo="avaliacoes"
            label="Sincronizar Avaliações"
            lojaId={lojaSelecionada?.id || ""}
          />

          <SyncTipoButton
            tipo="financeiro"
            label="Sincronizar Financeiro"
            lojaId={lojaSelecionada?.id || ""}
          />

          <SyncTipoButton
            tipo="geral"
            label="Sincronizar Tudo"
            lojaId={lojaSelecionada?.id || ""}
          />
        </div>
      </section>

      <section className="mt-8">
        <SincronizarPedidosButton lojaId={lojaSelecionada?.id || ""} />
      </section>

      <section className="mt-8">
        <EnriquecerPedidosButton />
      </section>

      <section className="mt-8">
        <EnriquecerFinanceiroButton />
      </section>

      <section className="mt-8 rounded-2xl bg-slate-900 p-6">
        <h2 className="text-2xl font-bold">Histórico Recente</h2>

        <div className="mt-6 space-y-4">
          {sincronizacoes && sincronizacoes.length > 0 ? (
            sincronizacoes.map((sync) => (
              <div key={sync.id} className="rounded-xl bg-slate-800 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold">
                      {sync.marketplace} / {sync.tipo}
                    </p>

                    <p className="mt-1 text-sm text-orange-300">
                      {sync.lojas?.apelido || "Sem loja"}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      sync.status === "sucesso"
                        ? "bg-green-900 text-green-300"
                        : "bg-red-900 text-red-300"
                    }`}
                  >
                    {sync.status}
                  </span>
                </div>

                <p className="mt-3 text-sm text-slate-400">
                  Registros importados:
                  <span className="ml-2 text-white">
                    {sync.registros_importados ?? 0}
                  </span>
                </p>

                <p className="mt-1 text-sm text-slate-400">
                  Iniciado em:
                  <span className="ml-2 text-white">
                    {sync.iniciado_em
                      ? new Date(sync.iniciado_em).toLocaleString("pt-BR")
                      : "-"}
                  </span>
                </p>

                {sync.mensagem && (
                  <p className="mt-3 text-sm text-slate-300">
                    {sync.mensagem}
                  </p>
                )}
              </div>
            ))
          ) : (
            <p className="text-slate-400">
              Nenhuma sincronização realizada ainda.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}