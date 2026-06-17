import Link from "next/link";
import { supabase } from "@/lib/supabase";
import SyncButton from "../components/SyncButton";
import SyncAllButton from "../components/SyncAllButton";

function normalizarMarketplace(marketplace?: string) {
  const valor = marketplace?.toLowerCase() || "";

  if (valor.includes("shopee")) {
    return "shopee";
  }

  if (valor.includes("tiktok")) {
    return "tiktok";
  }

  return valor;
}

export default async function IntegracoesPage() {
  const { data: lojas } = await supabase
    .from("lojas")
    .select("*")
    .order("criado_em", { ascending: false });

  const { data: sincronizacoes } = await supabase
    .from("sincronizacoes")
    .select("*, lojas(apelido)")
    .order("iniciado_em", { ascending: false })
    .limit(20);

  const { data: tokens } = await supabase
    .from("marketplace_tokens")
    .select("*");

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">Integrações</h1>

      <p className="mt-2 text-slate-400">
        Conexões com marketplaces, tokens e histórico de sincronizações.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <SyncAllButton lojas={lojas || []} />

        <Link
          href="/api/shopee/auth"
          className="rounded-lg bg-orange-600 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-500"
        >
          Conectar Shopee
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-2xl bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">Marketplaces</h2>

          <div className="mt-6 space-y-4">
            {lojas && lojas.length > 0 ? (
              lojas.map((loja) => {
                const marketplaceNormalizado =
                  normalizarMarketplace(loja.marketplace);

                const token = tokens?.find((item) => {
                  const marketplaceToken =
                    normalizarMarketplace(
                      item.marketplace || ""
                    );

                  return (
                    marketplaceToken ===
                      marketplaceNormalizado &&
                    item.loja_id === loja.id
                  );
                });

                const conectado =
                  !!token?.access_token;

                return (
                  <div
                    key={loja.id}
                    className="rounded-xl bg-slate-800 p-5"
                  >
                    <p className="font-bold">
                      {loja.apelido}
                    </p>

                    <p className="mt-1 text-sm text-slate-400">
                      Marketplace: {loja.marketplace}
                    </p>

                    <p className="mt-1 text-sm text-slate-400">
                      Token:
                      <span className="ml-2 text-white">
                        {conectado
                          ? "Configurado"
                          : "Não conectado"}
                      </span>
                    </p>

                    <span
                      className={`mt-4 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                        conectado
                          ? "bg-green-900 text-green-300"
                          : "bg-yellow-900 text-yellow-300"
                      }`}
                    >
                      {conectado
                        ? "Conectado"
                        : "Aguardando conexão"}
                    </span>

                    <div className="mt-4">
                      <SyncButton
                        lojaId={loja.id}
                        marketplace={
                          marketplaceNormalizado
                        }
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-slate-400">
                Nenhuma loja cadastrada.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">
            Últimas Sincronizações
          </h2>

          <div className="mt-6 space-y-4">
            {sincronizacoes &&
            sincronizacoes.length > 0 ? (
              sincronizacoes.map((sync) => (
                <div
                  key={sync.id}
                  className="rounded-xl bg-slate-800 p-5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold">
                        {sync.marketplace} / {sync.tipo}
                      </p>

                      <p className="mt-1 text-sm text-orange-300">
                        {sync.lojas?.apelido ||
                          "Sem loja"}
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
                      {sync.registros_importados ??
                        0}
                    </span>
                  </p>

                  <p className="mt-1 text-sm text-slate-400">
                    Data:
                    <span className="ml-2 text-white">
                      {sync.iniciado_em
                        ? new Date(
                            sync.iniciado_em
                          ).toLocaleString(
                            "pt-BR"
                          )
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
                Nenhuma sincronização realizada
                ainda.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}