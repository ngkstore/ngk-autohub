import { supabase } from "@/lib/supabase";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import SyncTipoButton from "../components/SyncTipoButton";
import SincronizarPedidosButton from "../components/SincronizarPedidosButton";
import EnriquecerPedidosButton from "../components/EnriquecerPedidosButton";
import EnriquecerFinanceiroButton from "../components/EnriquecerFinanceiroButton";
import SincronizarAvaliacoesButton from "../components/SincronizarAvaliacoesButton";
import ResponderAvaliacoesControl from "../components/ResponderAvaliacoesControl";
import ResponderChatControl from "../components/ResponderChatControl";
import SincronizarChatButton from "../components/SincronizarChatButton";
import SincronizarTodosProdutosButton from "../components/SincronizarTodosProdutosButton";

export const dynamic = "force-dynamic";

function normalizarTexto(valor?: string) {
  return valor
    ?.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export default async function SincronizacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string }>;
}) {
  const params = await searchParams;
  const escopo = await escopoDoUsuario();

  // Lojas vis\u00edveis para o usu\u00e1rio logado (admin = todas; sen\u00e3o s\u00f3 as da conta).
  let lojasQuery = supabase
    .from("lojas")
    .select("*")
    .order("criado_em", { ascending: false });
  if (!escopo.preSetup) {
    lojasQuery = lojasQuery.in(
      "id",
      escopo.lojaIds.length
        ? escopo.lojaIds
        : ["00000000-0000-0000-0000-000000000000"]
    );
  }
  const { data: lojas } = await lojasQuery;

  // Loja escolhida: a do seletor (?loja) se for da conta; sen\u00e3o a NGK (s\u00f3 p/
  // admin, mantendo o padr\u00e3o antigo) ou a primeira loja da conta do usu\u00e1rio.
  const lojaParam =
    params.loja && escopo.lojaIds.includes(params.loja) ? params.loja : null;
  const lojaSelecionada =
    lojas?.find((l) => l.id === lojaParam) ||
    (escopo.admin
      ? lojas?.find(
          (loja) =>
            normalizarTexto(loja.apelido)?.includes("ngk") &&
            normalizarTexto(loja.marketplace)?.includes("shopee")
        )
      : undefined) ||
    lojas?.[0] ||
    null;

  // Hist\u00f3rico restrito \u00e0s lojas da conta.
  const filtro = filtroLojas(escopo, params.loja);
  let sincQuery = supabase
    .from("sincronizacoes")
    .select("*, lojas(apelido)")
    .order("iniciado_em", { ascending: false })
    .limit(20);
  if (filtro) sincQuery = sincQuery.in("loja_id", filtro);
  const { data: sincronizacoes } = await sincQuery;

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-texto">Centro de Sincronização</h1>

      <p className="mt-0.5 text-[13px] text-texto-2">
        Execute importações por módulo e acompanhe o histórico de sincronizações.
      </p>

      <p className="mt-4 text-sm text-texto-2">
        Loja usada na sincronização:
        <span className="ml-2 font-semibold text-texto">
          {lojaSelecionada?.apelido || "Nenhuma loja encontrada"}
        </span>
      </p>

      {(lojas?.length ?? 0) > 1 && (
        <p className="mt-1 text-xs text-texto-2">
          Você tem mais de uma loja — use o seletor de loja no topo para escolher
          qual sincronizar.
        </p>
      )}

      <section className="mt-6 rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
        <h2 className="text-[15px] font-semibold text-texto">Ações de Sincronização</h2>

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

      <section className="mt-8">
        <SincronizarTodosProdutosButton lojaId={lojaSelecionada?.id || ""} />
      </section>

      <section className="mt-8">
        <SincronizarAvaliacoesButton />
      </section>

      <section className="mt-8">
        <ResponderAvaliacoesControl />
      </section>

      <section className="mt-8">
        <SincronizarChatButton />
      </section>

      <section className="mt-8">
        <ResponderChatControl />
      </section>

      <section className="mt-6 rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
        <h2 className="text-[15px] font-semibold text-texto">Histórico Recente</h2>

        <div className="mt-6 space-y-4">
          {sincronizacoes && sincronizacoes.length > 0 ? (
            sincronizacoes.map((sync) => (
              <div key={sync.id} className="rounded-[10px] border border-linha bg-superficie-2 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold">
                      {sync.marketplace} / {sync.tipo}
                    </p>

                    <p className="mt-1 text-sm text-alerta">
                      {sync.lojas?.apelido || "Sem loja"}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      sync.status === "sucesso"
                        ? "bg-chip-verde-fundo text-sucesso"
                        : "bg-chip-vermelho-fundo text-perigo"
                    }`}
                  >
                    {sync.status}
                  </span>
                </div>

                <p className="mt-3 text-sm text-texto-2">
                  Registros importados:
                  <span className="ml-2 text-texto">
                    {sync.registros_importados ?? 0}
                  </span>
                </p>

                <p className="mt-1 text-sm text-texto-2">
                  Iniciado em:
                  <span className="ml-2 text-texto">
                    {sync.iniciado_em
                      ? new Date(sync.iniciado_em).toLocaleString("pt-BR")
                      : "-"}
                  </span>
                </p>

                {sync.mensagem && (
                  <p className="mt-3 text-sm text-texto">
                    {sync.mensagem}
                  </p>
                )}
              </div>
            ))
          ) : (
            <p className="text-texto-2">
              Nenhuma sincronização realizada ainda.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}