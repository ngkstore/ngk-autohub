import { escopoDoUsuario, filtroLojas } from "@/lib/conta";
import { brl, numero, data as fmtData, agoraMs } from "@/lib/formato";
import { criadoresParaProduto, listarAmostrasPendentes, listarProdutosParados, resultadoCreators } from "@/lib/creators/consultas";
import { creatorsConfig } from "@/lib/creators/config";
import { Card, CardHeader, Kpi, Chip, Tabs, Tabela, Th, Tr, Td, Vazio, Dica } from "../components/ui";
import DecidirAmostra from "./DecidirAmostra";

export const dynamic = "force-dynamic";

// Creators (TikTok) — fase 1: leitura + fila de decisão. Nada grava no TikTok (flag creators_acoes_api desligada).
const AFFILIATE_CENTER = "https://affiliate.tiktok.com/connection/sample-request?shop_region=BR";
const corSug = (s: string | null) => (s === "aprovar" ? "verde" : s === "recusar" ? "vermelho" : "amarelo") as "verde" | "vermelho" | "amarelo";
const nomeSug = (s: string | null) => (s === "aprovar" ? "Aprovar" : s === "recusar" ? "Recusar" : "Decidir");

export default async function CreatorsPage({ searchParams }: { searchParams: Promise<{ loja?: string; aba?: string; produto?: string }> }) {
  const params = await searchParams;
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, params.loja);
  const aba = params.aba || "fila";
  const cfg = await creatorsConfig(escopo.contaId);
  const [amostras, parados, resultado] = await Promise.all([listarAmostrasPendentes(lojas), listarProdutosParados(lojas), aba === "resultado" ? resultadoCreators(lojas) : Promise.resolve({ porProduto: [], porCriador: [] })]);
  const agora = agoraMs();
  const em24 = amostras.filter((a) => a.expira_em && new Date(a.expira_em).getTime() - agora < 24 * 3600000 && new Date(a.expira_em).getTime() > agora).length;
  const sugAprovar = amostras.filter((a) => a.sugestao === "aprovar").length;
  const enviadasSemVideo = resultado.porCriador.reduce((s, l) => s + Math.max(0, l.amostras_enviadas - l.videos), 0);
  const produtoSel = aba === "parados" ? parados.find((p) => p.produto_id === params.produto) ?? parados[0] : null;
  const sugeridos = produtoSel ? await criadoresParaProduto(produtoSel.loja_id, produtoSel.categoria_id) : [];
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ aba, loja: params.loja, produto: params.produto, ...patch })) if (v) p.set(k, v);
    return `/creators?${p}`;
  };

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-texto">Creators</h1>
          <p className="mt-0.5 text-[13px] text-texto-2">TikTok Shop · pedidos de amostra, produtos parados e resultado dos criadores · fase 1: só leitura, a decisão é registrada aqui e executada no Affiliate Center</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <Kpi icone="lives" cor="indigo" rotulo="Pedidos aguardando" valor={amostras.length} detalhe="amostras com status PENDING" />
        <Kpi icone="alertas" cor={em24 ? "vermelho" : "laranja"} rotulo="Vencem em 24 h" valor={em24} />
        <Kpi icone="insights" cor="verde" rotulo="Sugeridos para aprovar" valor={sugAprovar} detalhe={`nota ≥ ${cfg.aprovar_nota}, ou ≥ ${cfg.aprovar_nota_custo} com custo ≤ ${brl(cfg.aprovar_custo_max, 0)}`} />
        <Kpi icone="estoque" cor="ceu" rotulo="Enviadas sem vídeo" valor={aba === "resultado" ? enviadasSemVideo : "—"} detalhe={aba === "resultado" ? "amostras aprovadas sem conteúdo publicado" : "ver na aba Resultado"} />
      </div>
      <Tabs className="my-5" ativa={aba} abas={[{ id: "fila", nome: "Fila de pedidos", href: link({ aba: "fila" }), contador: amostras.length }, { id: "parados", nome: "Produtos parados", href: link({ aba: "parados" }), contador: parados.length }, { id: "resultado", nome: "Resultado", href: link({ aba: "resultado" }) }]} />

      {aba === "fila" && (
        <Card semPadding>
          <CardHeader className="px-[18px] pt-4" titulo="Pedidos de amostra" descricao="ordenados pelo prazo de expiração · nota de 0 a 100 com os pesos de Configurações · custo = custo do SKU no UpSeller + frete estimado" />
          {amostras.length === 0 ? (
            <div className="p-4"><Vazio titulo="Nenhum pedido de amostra aguardando" texto="A coleta roda a cada 30 minutos." /></div>
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Vence</Th>
                  <Th>Criador</Th>
                  <Th>Produto</Th>
                  <Th numerica>Nota</Th>
                  <Th>Motivo da nota</Th>
                  <Th numerica>Custo</Th>
                  <Th>Sugestão</Th>
                  <Th>Decisão (registro)</Th>
                </tr>
              </thead>
              <tbody>
                {amostras.slice(0, 300).map((a) => {
                  const horas = a.expira_em ? (new Date(a.expira_em).getTime() - agora) / 3600000 : null;
                  return (
                    <Tr key={`${a.loja_id}|${a.amostra_id}`}>
                      <Td>
                        <Chip cor={horas != null && horas < 24 ? "vermelho" : horas != null && horas < 72 ? "amarelo" : "cinza"}>{a.expira_em ? (horas != null && horas < 48 ? `${Math.max(0, Math.round(horas))} h` : fmtData(a.expira_em)) : "—"}</Chip>
                      </Td>
                      <Td>
                        <p className="font-medium text-texto">@{a.criador_usuario ?? a.criador_id?.slice(0, 8)}</p>
                        <a className="text-xs text-primaria hover:underline" href={AFFILIATE_CENTER} target="_blank" rel="noreferrer">abrir no Affiliate Center · {a.amostra_id}</a>
                      </Td>
                      <Td className="max-w-[260px]">
                        <p className="line-clamp-2 leading-tight text-texto">{a.produto_nome ?? a.produto_id}</p>
                        {a.sku_nome && <p className="text-xs text-texto-2">{a.sku_nome}</p>}
                      </Td>
                      <Td numerica className="font-semibold">{a.nota ?? "—"}</Td>
                      <Td className="max-w-[300px] text-xs text-texto-2">{(a.nota_motivos?.detalhe || []).join(" · ") || "calculado no cron diário"}</Td>
                      <Td numerica>{a.custo_amostra != null ? brl(a.custo_amostra) : "sem custo"}</Td>
                      <Td><Chip cor={corSug(a.sugestao)}>{nomeSug(a.sugestao)}</Chip></Td>
                      <Td><DecidirAmostra lojaId={a.loja_id} amostraId={a.amostra_id} decisao={a.decisao} /></Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Tabela>
          )}
          <div className="px-[18px] pb-4"><Dica>Ações pela API estão desligadas (flag creators_acoes_api). Aprove ou recuse no Affiliate Center; o registro aqui serve para acompanhar e medir o resultado.</Dica></div>
        </Card>
      )}

      {aba === "parados" && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card semPadding>
            <CardHeader className="px-[18px] pt-4" titulo="Produtos parados" descricao={`estoque UpSeller ≥ ${cfg.parado_estoque_min} un. e vendas TikTok em 28 d < ${cfg.parado_pct} % do estoque`} />
            {parados.length === 0 ? (
              <div className="p-4"><Vazio titulo="Nenhum produto parado" texto="Calculado no cron diário." /></div>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Produto</Th>
                    <Th numerica>Estoque</Th>
                    <Th numerica>Vendas 28 d</Th>
                    <Th numerica>Views 28 d</Th>
                    <Th numerica>Pedidos 28 d</Th>
                    <Th numerica>Amostras</Th>
                  </tr>
                </thead>
                <tbody>
                  {parados.map((p) => (
                    <Tr key={p.produto_id}>
                      <Td className="max-w-[280px]">
                        <a href={link({ produto: p.produto_id })} className={`line-clamp-2 leading-tight hover:underline ${produtoSel?.produto_id === p.produto_id ? "font-semibold text-primaria" : "text-texto"}`}>{p.nome ?? p.produto_id}</a>
                        <p className="text-xs text-texto-2">{p.sku_armazem ?? "sem SKU do armazém"}{p.views_28d != null && p.views_28d > 0 && p.pedidos_28d === 0 ? " · visita sem compra" : p.views_28d === 0 ? " · sem visita" : ""}</p>
                      </Td>
                      <Td numerica>{numero(p.estoque)}</Td>
                      <Td numerica>{numero(p.vendas_28d)}</Td>
                      <Td numerica>{p.views_28d == null ? "—" : numero(p.views_28d)}</Td>
                      <Td numerica>{p.pedidos_28d == null ? "—" : numero(p.pedidos_28d)}</Td>
                      <Td numerica>{p.amostras_pendentes}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            )}
          </Card>
          <Card semPadding>
            <CardHeader className="px-[18px] pt-4" titulo={produtoSel ? `Criadores sugeridos · ${produtoSel.nome ?? produtoSel.produto_id}` : "Criadores sugeridos"} descricao="quem já vendeu para a loja (90 d) primeiro, depois criadores do marketplace na categoria do produto" />
            {sugeridos.length === 0 ? (
              <div className="p-4"><Vazio titulo="Sem criadores sugeridos" texto={produtoSel?.categoria_id ? "Nenhum criador coletado com essa categoria ainda." : "Produto sem categoria; a coleta de produtos do TikTok preenche no próximo ciclo."} /></div>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Criador</Th>
                    <Th numerica>Nível</Th>
                    <Th numerica>Seguidores</Th>
                    <Th numerica>GMV</Th>
                    <Th numerica>Views/vídeo</Th>
                    <Th numerica>Vendeu aqui</Th>
                  </tr>
                </thead>
                <tbody>
                  {sugeridos.map((c) => (
                    <Tr key={c.criador_id}>
                      <Td><p className="font-medium text-texto">@{c.usuario ?? c.criador_id.slice(0, 8)}</p><p className="text-xs text-texto-2">{c.fonte === "vendas" ? "já vendeu para a loja" : "marketplace · categoria compatível"}</p></Td>
                      <Td numerica>{c.nivel ?? "—"}</Td>
                      <Td numerica>{c.seguidores == null ? "—" : numero(c.seguidores)}</Td>
                      <Td numerica>{c.gmv == null ? "—" : brl(c.gmv, 0)}</Td>
                      <Td numerica>{c.media_views_video == null ? "—" : numero(c.media_views_video)}</Td>
                      <Td numerica>{c.vendeu_aqui ? brl(c.vendeu_aqui, 0) : "—"}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            )}
          </Card>
        </div>
      )}

      {aba === "resultado" && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {[{ titulo: "Por produto", linhas: resultado.porProduto }, { titulo: "Por criador", linhas: resultado.porCriador }].map((bloco) => (
            <Card key={bloco.titulo} semPadding>
              <CardHeader className="px-[18px] pt-4" titulo={bloco.titulo} descricao="amostras aprovadas/enviadas, vídeos publicados, pedidos e GMV de afiliado (90 d), comissão e custo das amostras" />
              {bloco.linhas.length === 0 ? (
                <div className="p-4"><Vazio titulo="Sem resultado ainda" texto="Aparece quando houver amostras aprovadas e pedidos de afiliado." /></div>
              ) : (
                <Tabela>
                  <thead>
                    <tr>
                      <Th>{bloco.titulo === "Por produto" ? "Produto" : "Criador"}</Th>
                      <Th numerica>Amostras</Th>
                      <Th numerica>Vídeos</Th>
                      <Th numerica>Pedidos</Th>
                      <Th numerica>GMV</Th>
                      <Th numerica>Comissão</Th>
                      <Th numerica>Custo amostras</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {bloco.linhas.slice(0, 100).map((l) => (
                      <Tr key={l.chave}>
                        <Td className="max-w-[260px]"><span className="line-clamp-2 leading-tight">{l.nome}</span></Td>
                        <Td numerica>{l.amostras_enviadas}</Td>
                        <Td numerica>{l.videos}</Td>
                        <Td numerica>{l.pedidos}</Td>
                        <Td numerica>{brl(l.gmv, 0)}</Td>
                        <Td numerica>{brl(l.comissao, 0)}</Td>
                        <Td numerica>{brl(l.custo_amostras, 0)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Tabela>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
