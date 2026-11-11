import Link from "next/link";
import { supabase } from "@/lib/supabase";
import SyncButton from "../components/SyncButton";
import SyncAllButton from "../components/SyncAllButton";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";

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
  const escopo = await escopoDoUsuario();

  // Só as lojas da conta do usuário (todas, se admin).
  let lojasQuery = supabase
    .from("lojas")
    .select("*")
    .order("criado_em", { ascending: false });
  if (!escopo.preSetup) {
    lojasQuery = lojasQuery.in(
      "conta_id",
      escopo.contaId ? [escopo.contaId] : []
    );
  }
  const { data: lojas } = await lojasQuery;

  const lojaIds = (lojas || []).map((l) => l.id);

  let sincQuery = supabase
    .from("sincronizacoes")
    .select("*, lojas(apelido)")
    .order("iniciado_em", { ascending: false })
    .limit(20);
  if (!escopo.preSetup) sincQuery = sincQuery.in("loja_id", lojaIds);

  let tokensQuery = supabase.from("marketplace_tokens").select("*");
  if (!escopo.preSetup) tokensQuery = tokensQuery.in("loja_id", lojaIds);

  // Token do 2º app da Shopee (só Afiliados), por loja.
  let amsQuery = supabase.from("shopee_ams_tokens").select("loja_id, status");
  if (!escopo.preSetup) amsQuery = amsQuery.in("loja_id", lojaIds);

  const [{ data: sincronizacoes }, { data: tokens }, { data: amsTokens }] =
    await Promise.all([sincQuery, tokensQuery, amsQuery]);
  const afiliadosPorLoja = new Map(
    (amsTokens || []).map((t) => [t.loja_id as string, t.status as string])
  );

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-texto">Integrações</h1>

      <p className="mt-0.5 text-[13px] text-texto-2">
        Conexões com marketplaces, tokens e histórico de sincronizações.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <SyncAllButton lojas={lojas || []} />

        <Link
          href="/api/shopee/auth"
          className="rounded-lg bg-alerta px-5 py-3 text-sm font-semibold text-texto hover:bg-primaria-hover"
        >
          + Conectar nova loja Shopee
        </Link>
      </div>

      <p className="mt-3 text-sm text-texto-2">
        Para adicionar uma loja Shopee, esteja logado na conta Shopee dela e
        clique em <span className="font-semibold text-alerta">+ Conectar
        nova loja</span>. Para reconectar uma já existente, use o botão{" "}
        <span className="font-semibold text-alerta">Reconectar</span> no card.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
          <h2 className="text-[15px] font-semibold text-texto">Marketplaces</h2>

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
                const afiliados = afiliadosPorLoja.get(loja.id);

                return (
                  <div
                    key={loja.id}
                    className="rounded-[10px] border border-linha bg-superficie-2 p-5"
                  >
                    <p className="font-bold">
                      {loja.apelido}
                    </p>

                    <p className="mt-1 text-sm text-texto-2">
                      Marketplace: {loja.marketplace}
                    </p>

                    <p className="mt-1 text-sm text-texto-2">
                      Token:
                      <span className="ml-2 text-texto">
                        {conectado
                          ? "Configurado"
                          : "Não conectado"}
                      </span>
                    </p>

                    <span
                      className={`mt-4 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                        conectado
                          ? "bg-chip-verde-fundo text-sucesso"
                          : "bg-chip-amarelo-fundo text-alerta"
                      }`}
                    >
                      {conectado
                        ? "Conectado"
                        : "Aguardando conexão"}
                    </span>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <SyncButton
                        lojaId={loja.id}
                        marketplace={
                          marketplaceNormalizado
                        }
                      />

                      {marketplaceNormalizado ===
                        "shopee" && (
                        <Link
                          href={`/api/shopee/auth?loja=${loja.id}`}
                          className="rounded-lg bg-alerta px-4 py-2 text-sm font-semibold text-texto hover:bg-primaria-hover"
                        >
                          {conectado
                            ? "Reconectar"
                            : "Conectar"}
                        </Link>
                      )}

                      {marketplaceNormalizado === "shopee" && (
                        <Link
                          href={`/api/shopee/auth?app=afiliados&loja=${loja.id}`}
                          title="Autoriza o 2º app da Shopee (módulo Programa de Afiliados)"
                          className={`rounded-lg px-4 py-2 text-sm font-semibold ring-1 ${
                            afiliados === "ativo"
                              ? "bg-superficie text-sucesso ring-green-800 hover:bg-superficie-2"
                              : afiliados
                                ? "bg-superficie text-perigo ring-red-800 hover:bg-superficie-2"
                                : "bg-superficie text-texto ring-slate-600 hover:bg-superficie-2"
                          }`}
                        >
                          {afiliados === "ativo"
                            ? "Afiliados: conectado"
                            : afiliados
                              ? "Afiliados: reconectar"
                              : "Conectar Afiliados"}
                        </Link>
                      )}

                      {marketplaceNormalizado ===
                        "tiktok" && (
                        <Link
                          href={`/api/tiktok/auth?loja=${loja.id}`}
                          className="rounded-lg bg-superficie px-4 py-2 text-sm font-semibold text-texto ring-1 ring-slate-600 hover:bg-superficie-2"
                        >
                          {conectado
                            ? "Reconectar TikTok"
                            : "Conectar TikTok"}
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-texto-2">
                Nenhuma loja cadastrada.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
          <h2 className="text-[15px] font-semibold text-texto">Últimas Sincronizações
          </h2>

          <div className="mt-6 space-y-4">
            {sincronizacoes &&
            sincronizacoes.length > 0 ? (
              sincronizacoes.map((sync) => (
                <div
                  key={sync.id}
                  className="rounded-[10px] border border-linha bg-superficie-2 p-5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold">
                        {sync.marketplace} / {sync.tipo}
                      </p>

                      <p className="mt-1 text-sm text-alerta">
                        {sync.lojas?.apelido ||
                          "Sem loja"}
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
                      {sync.registros_importados ??
                        0}
                    </span>
                  </p>

                  <p className="mt-1 text-sm text-texto-2">
                    Data:
                    <span className="ml-2 text-texto">
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
                    <p className="mt-3 text-sm text-texto">
                      {sync.mensagem}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <p className="text-texto-2">
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