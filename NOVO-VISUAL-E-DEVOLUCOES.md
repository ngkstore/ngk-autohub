# Novo visual + Devoluções + Painel do dia + Estoque + Lives + Campanhas — 11/11/2026

Partes: A visual · B devoluções · C painel do dia · D catálogo e estoque · E lives e
afiliados · F calendário de campanhas.

Este arquivo foi escrito para o Claude Code executar no projeto `ngk-autohub`.
Origem: estudo das APIs da Shopee e do TikTok Shop e desenho das telas feitos com o
Gabriel em 11/11/2026.

**Referências (leia antes de começar):**

- `docs/design/` — as telas de referência em HTML puro, com dados de exemplo.
  Comece pelo `index.html` e use o navegador. Os nomes das classes e as cores dessas
  páginas são a fonte do visual. O `Guia.html` é o guia visual.
- Especificação completa com endpoints e regras (documento do Gabriel):
  https://claude.ai/artifact/XSTopWSFkXRbsGt4tGz2nN
- Canvas com todas as telas: https://claude.ai/artifact/3ADxT5kjk7BmNAX787Dtnb

---

## Como executar (leia antes de começar)

1. **Leia o código atual antes de mudar.** Siga o `AGENTS.md`: este Next.js (16) tem
   mudanças de API, então consulte `node_modules/next/dist/docs/` antes de usar
   `cookies()`, rotas, `next/font` etc.
2. **Uma etapa por vez, na ordem.** Ao terminar cada item: `npm run lint`,
   `npm test` e `npm run build` sem erro, um commit com mensagem clara, e marque `[x]`
   neste arquivo com uma linha "Feito" igual ao `MELHORIAS-AUTOHUB.md`.
3. **Pare e pergunte ao Gabriel antes de:**
   - instalar qualquer dependência nova;
   - rodar SQL que apaga ou altera dados, ou aplicar migração;
   - mexer no `vercel.json` (crons);
   - trocar o modelo de IA (`lib/ia.ts`);
   - ligar qualquer ação que **escreve** na Shopee ou no TikTok (aprovar, recusar,
     disputar, oferecer). Essas ações ficam atrás de flag desligada até ele liberar;
   - qualquer item marcado **[PERGUNTAR]**.
4. **SQL novo** em `supabase/migrations/NNNN_descricao.sql` (a próxima é `0011`),
   idempotente, com RLS ligado em toda tabela nova (igual ao `0001_rls.sql`).
5. **Não leia nem imprima `.env.local`.** Para saber se uma variável existe, pergunte.
6. **Dados do comprador:** guardar só o id e o nome de usuário da plataforma. Nada de
   endereço, telefone ou CPF nas tabelas de devolução.
7. Ao final, escreva um resumo no fim deste arquivo: o que foi feito, o que ficou
   pendente e o que o Gabriel precisa fazer à mão.

---

## PARTE A — Novo visual (todas as telas)

O visual aprovado é claro por padrão, no estilo UpSeller/Metrify, com **modo escuro
opcional**. Hoje o layout é escuro fixo (`bg-slate-950`, Sidebar `bg-slate-900`) e o
`globals.css` ainda é o padrão do create-next-app.

### [x] A1. Tokens de cor e tema claro/escuro
> **Feito 11/11/2026:** `app/globals.css` com os tokens do `Guia.html` em `:root`/`.dark` (fundo, superfície, borda, linha, texto, primária, sucesso/alerta/perigo, pares de chip, sombra) expostos no Tailwind v4 via `@theme inline` (`bg-fundo`, `text-texto-2`, `bg-chip-verde-fundo`…) e `@custom-variant dark` por classe. Inter via `next/font/google` (`--font-inter`). `lib/tema.ts` + layout lendo o cookie `tema` no servidor e pondo `dark` no `<html>`; `TemaBotao` (sol/lua, na Topbar) grava o cookie e troca a classe na hora. Layout sem `slate-9xx`. **Decisão:** sem cookie o padrão é *escuro* até a A4 migrar as telas (hoje elas têm texto branco fixo e ficariam ilegíveis no claro); na A4 o padrão vira *claro*. Conferido com `next start`: `<html class="… dark">` sem cookie e sem `dark` com `tema=claro`.

**Onde:** `app/globals.css`, `app/layout.tsx`.

**Fazer:**
- Definir os tokens como variáveis CSS e expor no Tailwind v4 com `@theme`. O modo
  escuro é por classe (`.dark` no `<html>`), não por `prefers-color-scheme`
  (use `@custom-variant dark (&:where(.dark, .dark *));`).

  | Token | Claro | Escuro |
  | --- | --- | --- |
  | fundo | `#f4f6fb` | `#020617` |
  | superfície (cartão, menu, barra) | `#ffffff` | `#0f172a` |
  | borda | `#e5e8ef` | `#1e293b` |
  | linha de tabela | `#eef0f5` | `#1e293b` |
  | texto | `#0f172a` | `#f1f5f9` |
  | texto secundário | `#5b6478` | `#94a3b8` |
  | primária | `#4f46e5` (hover `#4338ca`) | `#6366f1` |
  | primária suave | `#eef2ff` | `#1e1b4b` |
  | sucesso / alerta / perigo | `#16a34a` / `#ea580c` / `#dc2626` | as mesmas, em fundo translúcido |

  As etiquetas (chips) têm fundo claro e texto escuro da mesma cor no modo claro, e
  fundo translúcido (`rgba(...,.16)`) com texto claro no escuro. Copie os pares exatos
  do bloco `.dark` em `docs/design/Guia.html`.
- Fonte **Inter** via `next/font/google`, no lugar de Arial/Geist.
- **Preferência do tema:** guardar em cookie `tema` (`claro` | `escuro`) e aplicar a
  classe no `<html>` já no servidor (layout lê o cookie), para não piscar. Sem cookie,
  usar claro.
- **Critério:** nenhuma cor fixa `slate-9xx` sobra no layout. O contraste do texto
  é de pelo menos 4,5:1 nos dois temas.

### [x] A2. Menu lateral e barra superior
> **Feito 11/11/2026:** `Sidebar.tsx` (servidor: escopo/admin) + `SidebarLinks.tsx` (cliente: `usePathname`, item ativo em primária suave, contador vermelho opcional) com 232 px, logo NGK em quadrado índigo e grupos Visão / Operação / Vendas / Produtos / Financeiro / Conta / Admin; Painel do dia e Devoluções ficaram comentados até existirem. `Icone.tsx` com os desenhos do Guia (SVG inline, sem biblioteca). `Topbar.tsx`: seletor de loja, período segmentado (Hoje, 7 dias, 30 dias, Mês + "Mais" com Ontem, Ano, Todos) mantendo os `searchParams`, busca (leva a `/pedidos?q=`; o filtro `q` entra na migração de Pedidos na A4), "Sincronizado hh:mm" (último `sync_jobs` concluído das lojas do usuário) com bolinha verde, botão sol/lua, sino com ponto vermelho quando há `alertas` novos, avatar com iniciais e menu Sair (`AuthStatus.tsx`). `/api/minhas-lojas` passou a devolver `sincronizado_em` e `alertas_novos`. Layout com `ml-[232px]`.

**Onde:** `app/components/Sidebar.tsx`, `app/components/Topbar.tsx`.

**Menu lateral** (fundo superfície, borda à direita, 232 px):
- Logo "NGK" num quadrado índigo, seguido de "AutoHub".
- Grupos com título em caixa alta pequena. **Todas as rotas que existem hoje
  continuam no menu**, só reorganizadas:
  - **Visão:** Dashboard → "Visão geral" (`/`), Painel do dia (futuro, deixe comentado).
  - **Operação:** Pedidos, Devoluções (`/devolucoes`, novo), Atendimento, Avaliações.
  - **Vendas:** Ads, Controle GMV Max, Raio-X do Anúncio, Insights.
  - **Produtos:** Produtos.
  - **Financeiro:** Finanças, Auditoria de taxas.
  - **Conta:** Saúde da conta, Integrações & Lojas, Sincronização, Alertas,
    Configurações; Admin com Consumo.
- **Ícones em SVG inline** (um componente `Icone` com os desenhos do `Guia.html`), no
  lugar dos emojis. Não instale biblioteca de ícones sem perguntar.
- Item ativo com fundo primária suave e texto `#3730a3`. Para saber a rota ativa é
  preciso `usePathname`: extraia os links para um componente cliente pequeno e
  mantenha a busca do escopo (`escopoDoUsuario`) no servidor.
- **Contador vermelho** ao lado de Devoluções: casos que vencem em 24 h (vem da
  Parte B; por enquanto, a prop opcional `contador`).

**Barra superior** (fundo superfície, fixa): seletor de loja (o que já existe), período
como botões segmentados (Hoje, 7 dias, 30 dias, Mês, mais um "Mais" com Ontem, Ano e
Todos), busca, "Sincronizado hh:mm" com bolinha verde, **botão sol/lua do tema**
(grava o cookie e troca a classe na hora), sino de alertas e avatar. Mantenha a lógica
atual de filtros por `searchParams`.

### [x] A3. Kit de componentes
> **Feito 11/11/2026:** `app/components/ui/` (import `@/app/components/ui`): `Card`/`CardHeader`; `Kpi` (ícone 34 px em 7 cores, rótulo, valor, etiqueta de variação verde/vermelha/neutra com `variacaoInvertida` para custos, `MiniGrafico` SVG); `Chip` + `ChipCanal` (Shopee laranja / TikTok preto), `ChipPrazo` (vermelho ≤ 4 h ou vencido, laranja hoje, amarelo amanhã, cinza depois), `ChipStatus` (verde/azul/cinza); `Tabs` com contador (link por `href` ou `onChange`); `Tabela`/`Th`/`Tr`/`Td` (cabeçalho cinza, selecionada índigo suave, `numerica` à direita), `Produto` (miniatura + nome + SKU), `Barra`; `Botao`/`BotaoLink` (principal, secundário, destrutivo, pequeno), `Segmentado`, `Switch`; `Dica`, `Aviso`, `Erro`, `Vazio`, `PainelDetalhe` + `SecaoDetalhe` + `LinhaDetalhe`. `lib/formato.ts`: `brl`, `pct`, `numero`, `compacto`, `data`, `prazoRelativo` ("em 1h 20", "vencida 2h") e `urgenciaDoPrazo`, com `tests/formato.test.ts` (9 testes). `DashboardCharts.tsx`: grade, eixos, tooltip e cartões pelos tokens (`var(--linha)`, `var(--texto-2)`, `bg-superficie`); cores das séries continuam fixas (valem nos dois temas).

**Onde:** `app/components/ui/` (novo) e `lib/formato.ts` (novo).

Criar, seguindo o `Guia.html`:
- `Card`, `CardHeader`;
- `Kpi`: ícone colorido em quadrado de 34 px, rótulo, valor grande, etiqueta de
  variação (verde/vermelha/neutra) e mini-gráfico opcional em SVG;
- `Chip`, com variantes:
  - canal: Shopee laranja, TikTok preto;
  - prazo: vermelho até 4 h ou vencido, laranja hoje, amarelo amanhã, cinza depois;
  - status: verde, azul, cinza;
- `Tabs` com contador;
- `Tabela`: cabeçalho cinza, linha selecionada índigo suave, números à direita, e a
  primeira coluna com miniatura + nome + SKU;
- `Botao` (principal, secundário, destrutivo, pequeno), `Segmentado`, `Switch`;
- `Dica` (índigo) e `Aviso` (laranja), `PainelDetalhe` (coluna lateral), `Vazio`.

Em `lib/formato.ts`: `brl()`, `pct()`, `numero()` e `prazoRelativo()` (ex.: "em 1h 20",
"vencida 2 h"). Os gráficos do Recharts (`DashboardCharts.tsx`) passam a ler as
cores dos tokens, para funcionar nos dois temas.

### [x] A4. Migrar as telas existentes
> **Feito 11/11/2026:** uma tela por commit: Visão geral (reescrita com `Kpi`, `Card`, `Tabela`, chips), Finanças (abas, KPIs e chips pelo kit + 306 trocas de cor), Pedidos (+ filtro `?q=` da busca do topo), Saúde, Ads e as demais 16 (ads-controle, raio-x, insights, produtos, auditoria, alertas, uso, configuracoes, integracoes, sincronizacao, atendimento, avaliacoes, analytics, financeiro, lojas, login) mais os componentes compartilhados. Método: script de mapeamento classe antiga → token (`bg-slate-900` → `bg-superficie`, `text-slate-400` → `text-texto-2`, `text-emerald-300` → `text-sucesso`…) e normalização do cabeçalho (wrapper 1400 px, h1 22 px sem emoji, subtítulo 13 px, cartões com borda e raio 14). Nenhuma consulta mudou. Nenhuma classe de cor fixa sobrou em `app/`. Tema padrão sem cookie passou a **claro**. Conferido com `npm run build`; a conferência visual em 1280 px e nos dois temas fica com o Gabriel (eu não tenho navegador aqui): o que destoar, ajusto tela a tela.

Uma tela por commit, nesta ordem: Visão geral (`/`, use `Visao.html`), Finanças (use
`Financas.html` como direção: o bloco "Do preço ao lucro" é o DRE que já existe, com
outro desenho), Pedidos, Saúde, Ads, e as demais.
- Não mudar dados nem consultas nesta etapa, só a apresentação.
- Todas as telas seguem a mesma ordem: título e ações → cartões de indicador → abas →
  filtros → tabela ou gráfico → painel de detalhe.
- **Critério:** cada tela funciona nos dois temas e em 1280 px de largura sem rolagem
  horizontal fora das tabelas.

---

## PARTE B — Módulo de Devoluções (Shopee + TikTok)

**Objetivo:** ninguém na NGK cuida só de devoluções. O módulo puxa tudo, sugere a
resposta, executa com aprovação e acompanha até o dinheiro voltar para a conta.
Estas são as telas de referência:

| Tela | Rota | Referência |
| --- | --- | --- |
| Fila | `/devolucoes` | `Devolucoes.html` |
| Caso completo | `/devolucoes/[id]` | `Devolucao-caso.html` |
| Recebimento e inspeção | `/devolucoes/recebimento` | `Devolucao-inspecao.html` |
| Regras e assistente | `/devolucoes/regras` | `Devolucao-regras.html` |
| Disputas e recuperação | `/devolucoes/disputas` | `Devolucao-disputas.html` |
| Análise | `/devolucoes/analise` | `Devolucao-analise.html` |

Etapas de um caso, que é a coluna `etapa`: `solicitado → resposta → voltando →
recebido → inspecao → decisao → encerrado`.

### [x] B0. Verificações antes de codar **[PERGUNTAR]**
> **Feito 11/11/2026 (Gabriel autorizou seguir o plano inteiro):** Shopee `returns` **liberado** na NGK (`/api/shopee/devolucoes/sondar?loja=…&dias=15`, só leitura: `get_return_list` + `get_return_detail` + `get_available_solutions`; janela máxima de 15 dias por consulta). TikTok: `returns/search`, `cancellations/search` e `returns/{id}/records` respondem `code 0`; `aftersales/search` exige `filters` no corpo. Bucket privado `devolucoes` criado pela migration 0011 (limite 250 MB por arquivo). Crons: 29 de 40 do plano Pro, cabe o novo. E-mail da disputa: Gabriel não usa e-mail no processo; a API exige um, então vai o e-mail de login da loja, editável em Configurações (B3). Fixtures reais não foram copiadas para o repo (trazem nome de usuário e e-mail mascarado do comprador); os testes usam exemplos anonimizados.

- **Shopee:** confirmar que o app tem permissão do módulo `returns`. Crie uma rota de
  teste só para admin que chama `v2.returns.get_return_list` (page_size 10) na NGK01.
  Se vier `error_permission`, o Gabriel libera no console da Shopee Open Platform.
- **TikTok:** o Gabriel disse que todas as permissões estão liberadas. Confirme com
  uma chamada a `POST /return_refund/202602/returns/search`.
- **Supabase Storage:** é preciso um bucket **privado** `devolucoes` para fotos,
  vídeos e quadros. Mostre o SQL ou o passo no painel.
- **Crons:** hoje são 29. Este módulo precisa de **um** cron novo (B2). Confirme o
  limite do plano da Vercel antes.
- **E-mail da disputa Shopee:** o `v2.returns.dispute` exige um e-mail. Pergunte qual
  usar e guarde em Configurações.

### [x] B1. Banco — `0011_devolucoes.sql`
> **Feito 11/11/2026:** `devolucoes`, `devolucao_eventos` (com `chave` única para idempotência), `devolucao_midias`, `devolucao_inspecoes`, `regras_devolucao`, `devolucao_aprovacoes` (com `idempotency_key`), `compradores_risco`; índices pedidos; RLS ligado em todas; bucket `devolucoes`; trigger de `atualizado_em`. Aplicada no banco.

Tabelas, todas com RLS ligado, acesso só pelo servidor com a service role.

- **`devolucoes`**:
  - Chave e vínculo: `id uuid`, `loja_id`, `canal` (`shopee`/`tiktok`),
    `plataforma_id` (Shopee `return_sn`, TikTok `return_id`), `pedido_id` (order_sn /
    order_id), `tipo` (`devolucao_reembolso`, `so_reembolso`, `troca`, `cancelamento`).
  - Situação e motivo: `status_plataforma` (texto cru), `etapa`, `motivo_codigo`,
    `motivo_texto`, `texto_comprador`.
  - Valores: `valor_pedido`, `valor_reembolso_pedido`, `valor_reembolsado`.
  - Prazos: `prazo_resposta`, `prazo_prova`, `prazo_contestar`, `prazo_oferta`.
  - Volta do produto: `rastreio_reverso`, `transportadora_reversa`, `chegou_em`.
  - Comprador: `comprador_id`, `comprador_usuario`.
  - Assistente: `sugestao jsonb` (decisao, confianca, motivos[], mensagem),
    `regra_id`.
  - Disputa e crédito: `disputa_status`, `compensacao_status`, `valor_recuperado`,
    `credito_esperado_ate`, `credito_status` (`aguardando`, `creditado`,
    `nao_creditado`, `nao_se_aplica`), `credito_transacao_ref`, `creditado_em`.
  - Fechamento: `resultado` (`aprovada`, `recusada`, `parcial`, `ganha`, `perdida`,
    `cancelada_comprador`, `vencida`).
  - Controle: `bruto jsonb`, `criado_em`, `atualizado_em`.
  - `unique (canal, plataforma_id)`; índices em `(etapa, prazo_resposta)`, `pedido_id`
    e `rastreio_reverso`.
- **`devolucao_eventos`**: histórico unificado. Colunas `devolucao_id`, `quando`,
  `origem` (`plataforma`, `comprador`, `vendedor`, `assistente`, `sistema`, `equipe`),
  `tipo`, `descricao`, `dados jsonb`, `usuario_id`. Na Shopee vem do detalhe e da
  negociação; no TikTok, de `GET /return_refund/202309/returns/{id}/records` (campos
  `event`, `role`, `description`, `note`, `images`, `videos`).
- **`devolucao_midias`**: `devolucao_id`, `origem` (`comprador`/`nos`), `tipo`
  (`foto`/`video`/`quadro`), `storage_path`, `url_plataforma`, `quadro_do_video` (fk
  para a própria tabela), `segundo_no_video`, `legenda`, `enviado_em`,
  `ref_plataforma` (URL do convert_image ou image_id do TikTok), `criado_por`.
- **`devolucao_inspecoes`**: `devolucao_id`, `peso_envio_kg`, `peso_chegada_kg`,
  `itens jsonb` (o que devia vir × o que veio), `estado` (`novo`, `usado`, `defeito`,
  `diferente_ou_faltando`), `destino` (`estoque`, `saldo`, `avaria`, `contestacao`),
  `observacao`, `inspecionado_por`, `inspecionado_em`, `nfe_numero`, `nfe_data`,
  `ajuste_upseller_feito boolean`.
- **`regras_devolucao`**: `conta_id`, `ordem`, `ativa`, `nome`, `condicao jsonb`,
  `acao jsonb`, `modo` (`sugerir`, `aprovar`, `automatico`), `usos`.
- **`devolucao_aprovacoes`**: `devolucao_id`, `acao jsonb` (o que será enviado à
  plataforma), `pedida_em`, `via` (`telegram`/`tela`), `telegram_message_id`,
  `decisao` (`aprovada`, `editada`, `recusada`), `decidido_por`, `decidido_em`,
  `executada_em`, `resposta_api jsonb`, `erro`.
- **`compradores_risco`**: `canal`, `comprador_id`, `devolucoes_90d`, `suspeito`,
  `motivo`, `atualizado_em`.

### [x] B2. Coleta — Shopee e TikTok
> **Feito 11/11/2026:** `lib/shopee/devolucoes.ts` + `lib/devolucoes/mapaShopee.ts` (lista por janelas de 15 dias, detalhe, eventos com chave idempotente, mídias), `lib/tiktok/devolucoes.ts` + `mapaTikTok.ts` (returns, cancellations, records; sequencial com nova tentativa no limite de taxa), `lib/devolucoes/sincronizar.ts` (upsert, marca d'água por loja, pula casos sem mudança, `forcar=1`), mídias do comprador copiadas para o bucket (`midias.ts`), rota `/api/devolucoes/sincronizar` no cron a cada 15 min (7,22,37,52) com orçamento de 200 s + assistente no tempo restante, webhook `/api/tiktok/webhook` (HMAC app_key+corpo; eventos 11/12/64/67 ressincronizam só o caso). Carga inicial de 90 dias rodada loja a loja. Testes: 10 (mapeadores, anonimizados). Pendente do Gabriel: cadastrar a URL do webhook no Partner Center do TikTok.

**Onde:** `lib/shopee/devolucoes.ts`, `lib/tiktok/devolucoes.ts`,
`app/api/devolucoes/sincronizar/route.ts` (na lista `ROTAS_CRON`, com `autorizar()`).

- **Shopee:** `v2.returns.get_return_list` (paginado, por `update_time`, respeitando
  a janela máxima da doc), depois `v2.returns.get_return_detail` de cada um.
  Campos úteis do detalhe:
  - motivo e texto: `reason`, `text_reason`;
  - mídias do comprador: `image`, `buyer_videos`;
  - valores e tipo: `refund_amount`, `return_refund_type`;
  - prazos: `due_date`, `return_seller_due_date`, `seller_evidence_deadline`,
    `offer_due_date`, `seller_compensation_due_date`;
  - `negotiation`, status e rastreio reverso.

  Para saber se chegou ao armazém: `v2.returns.get_reverse_tracking_info`
  (`is_arrived_at_warehouse`).
- **TikTok:** `POST /return_refund/202602/returns/search` e
  `POST /return_refund/202603/aftersales/search`. Use os campos
  `seller_next_action_response` (ação e prazo), `return_reason`, `return_type`,
  `refund_amount`, `return_tracking_number` e `arbitration_status`. O histórico com
  fotos e vídeos vem de `GET /202309/returns/{id}/records`. Cancelamentos:
  `POST /202602/cancellations/search`.
- **Mídias do comprador:** os links das plataformas podem expirar. Copie as fotos e os
  vídeos para o Storage na primeira coleta (`devolucao_midias`, origem `comprador`).
- **Um cron** de 15 em 15 min para as duas plataformas **[PERGUNTAR antes de mexer no
  `vercel.json`]**. Na carga inicial, puxe o histórico até onde a API deixar.
- **Webhook do TikTok:** rota `app/api/tiktok/webhook/route.ts` que verifica a
  assinatura conforme a doc de webhooks do TikTok e recusa sem assinatura válida.
  Eventos usados:
  - 12: mudança de status da devolução;
  - 64: pós-venda;
  - 67: reembolso concluído;
  - 11: cancelamento.

  Cada evento só dispara a ressincronização daquele caso. O Gabriel cadastra a URL no
  Partner Center.
- **Shopee:** não confirmamos um aviso (push) de devolução. Se existir na lista de
  Push do console, use; senão, fica o cron.
- Ligar cada caso aos dados que já existem:
  - pedido: `pedidos`;
  - custos: `custos_pedido`;
  - débito na carteira: tipo 411 "devolução após repasse" e 102 renda negativa,
    classificados por `classificar_carteira()`;
  - afiliado: o estorno da comissão.
- **Testes:** fixtures com os exemplos de resposta da documentação, mapeador de cada
  canal → linha de `devolucoes`.

### [x] B3. Ações na plataforma (atrás de flag)
> **Feito 11/11/2026:** `lib/devolucoes/acoes.ts` (`acoesPermitidas` + `executar`): Shopee confirm/dispute/offer/accept_offer/convert_image+upload_proof/cancel_dispute/upload_shipping_proof; TikTok approve/reject (recusa e oferta parcial)/upload de imagem/return_shipping, com `idempotency_key` guardado na aprovação. Flag `devolucoes_acoes_api` por conta (desligada), e-mail da disputa e limites em Configurações → Devoluções. Toda ação grava em `devolucao_aprovacoes` e `devolucao_eventos` e ressincroniza o caso. Regras fixas em `validar.ts` (9 testes). Os caminhos dos endpoints seguem a doc; a primeira execução real deve ser acompanhada (flag desligada até lá).

**Onde:** `lib/devolucoes/acoes.ts`. A interface é única: `executar(devolucao, acao)`.
Flag por conta `devolucoes_acoes_api` (use `lib/flags.ts`), **desligada** até o
Gabriel liberar.

| Ação | Shopee | TikTok |
| --- | --- | --- |
| Ver o que é permitido agora | `v2.returns.get_available_solutions` | Get Decision Eligibility; `GET /return_refund/202606/review_decision` |
| Aprovar | `v2.returns.confirm` | `POST /202309/returns/{id}/approve` ou `POST /202609/aftersales/review` |
| Recusar / disputar | `v2.returns.dispute` (email, `dispute_reason_id` de `get_return_dispute_reason`, `image_list` por `module_index`) | `POST /202606/returns/{id}/reject` (`decision`, `reject_reason`, `comment`, `images[]`) |
| Reembolso parcial | `v2.returns.offer` (`proposed_solution`, `proposed_adjusted_refund_amount`) | `reject` com `decision=OFFER_PARTIAL_REFUND_AFTER_RECEIVING_PKG` + `partial_refund_amount` (só depois de receber o pacote) |
| Aceitar contraproposta | `v2.returns.accept_offer` | — |
| Enviar provas | `v2.returns.convert_image` → `v2.returns.upload_proof` (fotos + texto); `query_proof` para conferir | Upload Product Image → `image_id` (máx. 6 imagens) |
| Desistir da disputa | `v2.returns.cancel_dispute` | — |
| Rastreio da volta | `get_shipping_carrier`, `upload_shipping_proof` | Upload Return Shipping Information |

Regras de toda ação:
- **Antes de enviar**, consultar o que é permitido agora (linha 1 da tabela). Os
  motivos de recusa vêm sempre da lista oficial, nunca digitados.
- No TikTok, mandar `idempotency_key` (UUID guardado na aprovação, reaproveitado em
  nova tentativa).
- **Vídeo:** no TikTok o vendedor não envia vídeo (só o comprador). Na Shopee, a
  chamada confirmada recebe imagens. Então pela API vão **os quadros** tirados do
  vídeo (B5). O vídeo inteiro fica no caso, com um botão "baixar para enviar no
  Seller Center".
- Toda ação grava em `devolucao_aprovacoes` e em `devolucao_eventos`: quem aprovou, o
  que foi enviado, a resposta e o erro.

### [x] B4. Assistente e regras
> **Feito 11/11/2026:** `assistente.ts` (Claude `MODELO_IA`, esforço baixo, JSON validado; entrada: caso, histórico, fotos/quadros por URL assinada, inspeção, risco do comprador, custos por caminho de `custos.ts`), `regras.ts` (motor puro; 9 regras iniciais desligadas na migration 0013; 10 testes), `processar.ts` (regras → assistente → executar/aprovar/sugerir dentro dos limites; alerta de prazo; tarefa de inspeção; risco; crédito), `aprovacao.ts` + `telegramCallback.ts` (`dev:aprovar|editar|recusar|abrir:<id>`, só remetente autorizado por TELEGRAM_CHAT_ID/TELEGRAM_APROVADORES). Modo do assistente por conta (só sugerir / pedir aprovação). Uso medido em `uso_ia` (tipo `devolucao`).

**Onde:** `lib/devolucoes/assistente.ts`, `lib/devolucoes/regras.ts`.

- **Entrada:**
  - o caso e o histórico;
  - as fotos e os vídeos do comprador; de vídeo, envie alguns quadros;
  - as nossas provas: quadros da abertura, peso no envio e na volta, rastreio;
  - o histórico do comprador (`compradores_risco`);
  - o custo de cada caminho (abaixo).
- **Saída** em JSON validado: `decisao` (`aprovar`, `recusar`, `oferecer_parcial`,
  `aceitar_contraproposta`, `disputar`, `aguardar`), `confianca` (`alta`, `media`,
  `baixa`), `motivos[]`, `motivo_plataforma` (da lista oficial), `valor_parcial`,
  `mensagem_comprador`.
- **Modelo:** `MODELO_IA` de `lib/ia.ts`. Se a leitura das fotos ficar fraca,
  **pergunte ao Gabriel** antes de trocar o modelo.
- **Custo de cada caminho**, para a tela do caso: repasse em risco (de `custos_pedido`
  na Shopee e do financeiro no TikTok), comissão de afiliado estornada, frete e custo
  do produto que volta se a inspeção der OK.
- **Regras** em ordem (vale a primeira que bater), com o modo de cada uma. Regras
  iniciais (criar desligadas, o Gabriel liga):
  1. Arrependimento, até R$ 60, produto lacrado → aprovar · automático.
  2. Na volta chegou outro item ou o peso ficou 20% abaixo do envio → disputar com os
     quadros da abertura e o peso · pede aprovação.
  3. "Não recebido" com entrega confirmada e foto do entregador → disputar com o
     comprovante · pede aprovação.
  4. Defeito em produto até R$ 40 → oferecer 40% sem devolução · pede aprovação.
  5. Prazo com menos de 4 h → alerta no Telegram · automático.
  6. Pacote chegou ao armazém → tarefa de inspeção em até 24 h · automático.
  7. Comprador com 3 ou mais devoluções em 90 dias → marcar suspeito · automático.
  8. Disputa ganha sem crédito em 3 dias → alerta e texto de cobrança · automático.
- **Limites fixos no código** (não dá para mudar por regra; só os valores ficam em
  Configurações):
  - aprovação automática até R$ 100 por caso e R$ 500 por dia;
  - **recusa, disputa e oferta sempre pedem aprovação**;
  - comprador suspeito nunca é aprovado sozinho.

  Teste unitário para cada limite.
- **Aprovação no Telegram:** use `enviarTelegram` e estenda o
  `app/api/telegram/webhook`. A mensagem leva o resumo do caso, a sugestão, o valor e
  os botões `Aprovar`, `Editar` (link para `/devolucoes/[id]`) e `Recusar`. Os
  callbacks seguem o padrão `dev:aprovar:<aprovacao_id>`. Só o Gabriel (e quem ele
  autorizar) aprova. Confira o remetente do callback.

### [x] B5. Recebimento e inspeção
> **Feito 11/11/2026:** `/devolucoes/recebimento`: bipe (leitor = Enter) por rastreio/pedido/id, lista de pacotes, peso envio × chegada (≥ 20% abaixo em vermelho), checklist, estado → destino, fotos obrigatórias e vídeo da abertura com upload direto ao Storage (URL assinada) e quadros no navegador (`<video>` + `<canvas>`, manual e 4 automáticos). Rotas: buscar, upload-url, midia, inspecao. Tarefas UpSeller (estoque/NF-e) e garantia viram eventos no caso.

**Onde:** `/devolucoes/recebimento`.

- **Campo de bipe:** o leitor de código funciona como teclado + Enter. Busca por
  rastreio reverso, número do pedido ou id da devolução.
- **Peso:** campo do peso na chegada, comparado com o peso de envio (do pedido ou da
  etiqueta; sem isso, peso do produto no cadastro × quantidade). Diferença acima de
  20% = destaque vermelho e sugestão de disputa.
- **Vídeo da abertura:** a NGK não grava a embalagem no envio, então esta é a prova
  principal. Orientação na própria tela: plano contínuo, sem cortes, começando com a
  caixa fechada e a etiqueta legível, balança em cena.
  - Envio direto do navegador para o Storage com **URL de upload assinada** (rota no
    servidor com a service role). Limite de 3 min, mp4 ou mov.
  - **Quadros no navegador:** `<video>` + `<canvas>`, com o botão "capturar quadro"
    durante a reprodução e quatro sugestões automáticas (início, 25%, 50%, fim). Cada
    quadro vira JPEG em `devolucao_midias` (tipo `quadro`, `quadro_do_video`,
    `segundo_no_video`). Nada de ffmpeg no servidor.
  - Fotos obrigatórias para liberar "Abrir contestação": caixa fechada com etiqueta,
    pacote na balança, vídeo da abertura e o que veio dentro.
- **Checklist** do que devia voltar: use a composição do produto se houver; senão,
  lista livre.
- **Estado → destino:**
  - novo → estoque disponível;
  - usado sem defeito → saldo;
  - com defeito → avaria, mais tarefa de garantia com o fornecedor;
  - diferente ou faltando → contestação.
- **Estoque e NF-e:** o módulo de Estoque ainda não existe e a API do UpSeller só lê
  estoque. Então registre o destino na inspeção e crie as tarefas "ajustar estoque no
  UpSeller" e "emitir NF-e de devolução no UpSeller", com campos para número e data.

### [x] B6. Disputas e crédito na conta
> **Feito 11/11/2026:** `credito.ts`: ganhou → `credito_esperado_ate` (+N dias), procura crédito na carteira (Shopee, mesmo order_sn, valor positivo) ou em `tiktok_transacoes`; sem crédito no prazo → `nao_creditado` + alerta + texto de cobrança; `taxaVitoria` por motivo e por prova. Tela `/devolucoes/disputas` com abas, painel lateral, "Cobrar" e "Marcar como creditado" (rota credito registra o tipo encontrado como candidato para `carteira_categorias`).

**Onde:** `lib/devolucoes/credito.ts`, `/devolucoes/disputas`.

- Quando `compensacao_status` indicar aprovação (Shopee) ou o TikTok decidir a favor
  do vendedor, preencha `credito_esperado_ate` (decisão + 3 dias) e procure o
  crédito:
  - **Shopee:** `carteira_transacoes` com o mesmo `order_sn`, valor positivo, depois
    da decisão.
  - **TikTok:** extrato e transações do financeiro com o mesmo pedido.
- **Ponto aberto:** ainda não vimos qual `transaction_type` da carteira da Shopee
  traz o crédito de disputa. Enquanto não souber, aceite qualquer crédito positivo
  ligado ao pedido e registre o tipo encontrado como candidato. A tela tem "Marcar
  como creditado" (escolhendo a transação); a primeira marcação mostra ao Gabriel o
  tipo, para entrar em `carteira_categorias`.
- Sem crédito até o prazo: `credito_status = nao_creditado`, alerta no Telegram e
  texto pronto para cobrar a plataforma (com número do pedido, data da decisão e
  valor).
- **"Dá para recorrer":** casos perdidos enquanto a plataforma aceitar nova prova.
- **Taxa de vitória** por tipo de prova e por motivo. O assistente usa isso para não
  sugerir disputa onde quase nunca se ganha.

### [x] B7. Telas
> **Feito 11/11/2026:** Fila (`/devolucoes`: KPIs, abas por etapa, filtros de motivo e sugestão, seleção em lote → aprovação no Telegram, "Hoje o assistente fez", "Chegando ao armazém"), Caso (`/devolucoes/[id]`: etapas, comprador, provas, histórico, recomendação, custo de cada caminho, crédito, formulário com decisão/motivo oficial/mensagem/provas, "Revisar e enviar" e "Mandar para aprovação no Telegram"), Recebimento, Regras (editor com liga/desliga, modo, JSON de condição/ação; regras padrão viram cópia da conta ao editar), Disputas, Análise (30 dias: motivo, canal/loja, produtos para agir).

Siga as referências em `docs/design/` com os componentes da Parte A.
- **Fila:**
  - indicadores e abas por etapa: Responder, Enviar prova, Em trânsito, Inspecionar,
    Em disputa, Aguardando plataforma, Encerradas;
  - filtros: loja, motivo, sugestão;
  - tabela: prazo, canal, produto, motivo, valor, sugestão do assistente;
  - seleção em lote ("aplicar sugestões selecionadas" passa pela aprovação);
  - "Hoje o assistente fez".
- **Caso:**
  - etapas do caso, o que o comprador diz (texto, fotos, vídeos);
  - leitura do assistente e as nossas provas;
  - histórico unificado, recomendação e quanto custa cada caminho;
  - formulário de resposta: decisão, motivo oficial, mensagem editável, "Revisar e
    enviar" e "Mandar para aprovação no Telegram".
- **Recebimento, Regras, Disputas e Análise:** como nas referências.
- Na Análise:
  - por motivo e por canal (taxa, tempo de resposta, disputas ganhas);
  - produtos para agir com a sugestão (ex.: "revisar medidas no anúncio");
  - custo líquido = reembolsado − recuperado − produto que voltou ao estoque.

### [x] B8. Integração com o resto
> **Feito 11/11/2026:** `pendencias.ts`: `pendenciasDevolucoes(lojaIds)` e `contadorDevolucoes` (menu: casos que vencem em 24 h); `lib/alertas.ts` cria alertas de 24 h / 4 h. Item Devoluções ativo no menu.

- Contador do menu (A2) e `lib/alertas.ts`: casos que vencem em 24 h e em 4 h.
- Exportar uma função `pendenciasDevolucoes(lojaIds)` para o futuro Painel do dia.

### Ordem de liberação (combinar com o Gabriel)

1. **Semana 1:** B1, B2 e telas só de leitura, mais o Recebimento (B5). As ações
   continuam pelo Seller Center.
2. **Semana 2:** assistente sugerindo (B4) e aprovação no Telegram, sem executar.
3. **Semana 3:** ações pela API com aprovação (B3, flag ligada pelo Gabriel).
4. **Depois:** regras automáticas dentro dos limites, uma por vez.

---

## PARTE C — Painel do dia (pode andar junto com a Parte B)

Referência: `docs/design/Main.html`. Quase tudo já está no banco.

### [ ] C1. Função que junta as pendências

**Onde:** `lib/painel/pendencias.ts`, com uma rota de leitura para a tela.

Cada pendência vira `{ prazo, urgencia, canal, loja_id, titulo, detalhe, link, acao }`.
A urgência vale:
- `agora`: vencida ou vence em até 4 h;
- `hoje`: até 23:59 de hoje;
- `amanha`;
- `depois`.

| Pendência | Fonte |
| --- | --- |
| Pedidos a postar (Shopee) | `pedidos.dados_pedido`: `ship_by_date`, `days_to_ship` e status a enviar. A busca já pede `ship_by_date` em `responderChats.ts`; garanta que a coleta de pedidos grava |
| Postar e coleta (TikTok) | `pedidos.dados_pedido`: `rts_sla_time`, `shipping_due_time`, `collection_due_time`, `collection_time`, `rts_time` |
| Atrasados | `saude_pedidos_atrasados` |
| Chats sem resposta | `chat_conversas` com `precisa_resposta = true`; idade = agora − `ultima_mensagem_ts`; destacar acima de 3 h |
| Avaliações 1–2 estrelas sem resposta | `avaliacoes` |
| Saúde Shopee | `saude_conta_snapshot`, `saude_metricas` (fora da meta), `saude_penalidades` (pontos do trimestre), `saude_punicoes` ativas |
| Anúncios com problema | `saude_anuncios_problema` |
| Token vencendo | `marketplace_tokens.expira_em` em até 3 dias |
| Conferências financeiras | resultado das conferências 1 a 4 de Finanças |
| Devoluções | `pendenciasDevolucoes()` (B8) |
| Estoque crítico | `pendenciasEstoque()` (D4), quando existir |
| Prazos de campanha | `pendenciasCampanhas()` (F3), quando existir |

**TikTok:** a API de desempenho de atendimento exige aprovação especial e o SPS não
tem API no Brasil. Por isso o tempo de resposta do chat é calculado a partir de
`chat_conversas`, e o SPS vem da captura (E4) ou de lançamento manual.

### [ ] C2. Tela `/painel`

Siga o `Main.html`:
- quatro cartões: Agora, Hoje, Amanhã e Resolvidos hoje;
- lista agrupada com o botão "Resolver" levando à tela certa;
- coluna com saúde das contas, conferências e integrações.

Depois, coloque "Painel do dia" no menu (grupo Visão).

### [ ] C3. Resumo no Telegram **[PERGUNTAR antes de mexer no `vercel.json`]**

Às 8 h e às 14 h (America/Sao_Paulo), mande pelo `enviarTelegram`:
- os números de Agora e Hoje;
- as 5 pendências mais urgentes;
- o link do painel.

Prefira reaproveitar um cron que já roda de hora em hora e só enviar nesses dois
horários, em vez de criar crons novos. Guarde o envio em `saude_alertas` ou numa
tabela própria, para não mandar duas vezes.

---

## PARTE D — Catálogo unificado e Estoque

Referência: `docs/design/Estoque.html`. Fatos verificados na conta do UpSeller em
11/11/2026:
- **O UpSeller é o dono do estoque.** A sincronização "UpSeller → marketplace"
  está ligada para todas as lojas, e o pedido reserva estoque desde "Não pago /
  Pendente". **O AutoHub só lê estoque. Nunca chame `update_stock` (Shopee) nem
  `inventory/update` (TikTok).**
- Há 2 armazéns (GALPÃO 01 PRINCIPAL e GALPÃO 02 ESCRITÓRIO), cerca de 600 SKUs
  com estoque, cerca de 104 mil unidades e R$ 4,0 mi a custo.
- São 659 produtos: 167 únicos, 116 com variações e **59 kits** (ex.: "Kit 4
  cadeiras" consome 4 cadeiras). Há 12 mapeamentos anormais de SKU.
- Não há fornecedores nem pedidos de compra cadastrados. Mínimo e máximo não estão
  preenchidos.

### [ ] D1. API do UpSeller **[PERGUNTAR]**

- O Gabriel gera o token em UpSeller > Plataforma Aberta > API/MCP (só a conta
  principal; plano Empresarial, 200 chamadas por minuto). Guarde as variáveis
  `UPSELLER_CLIENT_ID` e `UPSELLER_API_TOKEN` na Vercel (o Gabriel cria; não leia o
  `.env.local`).
- As chamadas são POST com corpo JSON e três cabeçalhos: ID do cliente, token e
  idioma (`pt`). A documentação de campos está num link em chinês (Feishu) dentro do
  artigo https://www.upseller.com/es/help-doc-article-3414.
  1. Comece com uma rota de teste só para admin que chama `getWarehouseList/v1` e
     `pageWarehouseSku/v1` (até 100 por página, até 300 SKUs por consulta).
  2. Guarde uma resposta real como fixture.
  3. Só depois escreva o mapeador. Anote no fim deste arquivo os campos que vieram
     (disponível, ocupado, em trânsito, custo, kit?).
- Coleta: `lib/upseller/estoque.ts` → tabela `estoque_armazem` (armazém, sku,
  disponível, ocupado, em trânsito, atual, custo médio, coletado_em). Guarde também
  uma foto diária em `estoque_historico`, para ver a evolução e o capital parado.

### [ ] D2. Catálogo unificado e kits

- Tabela `catalogo_sku` (SKU do armazém, nome, tipo `unico` / `variacao` / `kit`,
  peso, medidas, custo, fornecedor_id) e tabela `catalogo_mapeamento`
  (canal, loja_id, item_id, model_id ou sku_id, sku_anuncio → sku_armazem).
- **Fonte:** a API do UpSeller, se trouxer. Senão, a exportação de "Produtos do
  Armazém" e de "Mapeamento de SKU do anúncio" do UpSeller (Importar & Exportar).
  O Gabriel baixa as planilhas e a tela de importação do AutoHub lê.
- **Kits:** tabela `kit_componentes` (sku_kit, sku_componente, quantidade). A venda
  de um kit vira venda dos componentes: quantidade do kit × quantidade do componente.
- Reaproveite a revisão SKU/NCM já feita entre UpSeller, NGK01 e Pitibiribas.
  Mostre os anúncios sem mapeamento e os 12 anormais numa aba "Mapeamento".

### [ ] D3. Cálculo

**Onde:** `lib/estoque/calculo.ts`, com testes.

- **Venda por SKU do armazém:** `pedido_itens` (já tem Shopee e TikTok por
  `model_sku` e dia) → `catalogo_mapeamento` → explode os kits.
- **Venda média por dia:** 50% da média de 7 dias + 30% da média de 28 dias + 20% do
  mesmo período do ano anterior. **Antes, confira a data do pedido mais antigo.** Se
  não houver o ano anterior, use 60% (7 d) + 40% (28 d) e um **fator sazonal manual**
  por mês e por campanha (tabela `estoque_fator_sazonal`, editável na tela).
- **Cobertura (dias)** = disponível ÷ venda média.
- **Ponto de pedido** = venda média × (prazo de reposição + segurança).
- **Comprar** = venda média × (prazo + dias desejados) − disponível − em trânsito,
  arredondado para a caixa do fornecedor.
- **Status:**
  - Ruptura: disponível 0;
  - Crítico: cobertura menor que o prazo de reposição;
  - Atenção: abaixo do ponto de pedido;
  - OK;
  - Excesso: mais de 90 dias;
  - Parado: sem venda em 30 dias.
- **Kit:** disponível do kit = menor(disponível do componente ÷ quantidade). A
  ruptura é sinalizada no componente, mostrando os kits afetados.
- **Venda perdida estimada** = venda média × dias sem estoque até a reposição ×
  preço médio.
- **Estoque das plataformas:** Shopee em `produto_variacoes.estoque`, que já existe;
  TikTok por `POST /product/202309/inventory/search`. Serve só para apontar
  diferença com o UpSeller e estoque preso em promoção
  (`v2.product.get_item_promotion`).

### [ ] D4. Fornecedores, prazos e pedido de compra

- Tabela `fornecedores` (nome, prazo de reposição em dias, dias de segurança, caixa
  padrão) e exceção por SKU. **Pergunte ao Gabriel** os fornecedores e os prazos.
  A UP Importação é o principal.
- Recomende ao Gabriel lançar as compras no módulo Compras do UpSeller, para o "em
  trânsito" vir de lá. Até isso acontecer, permita lançar "a caminho" no AutoHub.
- "Gerar pedido de compra" monta a lista sugerida por fornecedor e exporta em
  planilha para lançar no UpSeller. Nada é enviado automaticamente.
- `pendenciasEstoque()` para o Painel e alertas: ruptura e crítico, no Telegram uma
  vez por dia.

### [ ] D5. Tela `/estoque`

Siga o `Estoque.html`:
- indicadores: em ruptura, críticos, atenção, capital em excesso, a caminho;
- abas por status, filtros e tabela;
- painel com a projeção, a compra sugerida e o aviso de campanha próxima.

Full da Shopee só em 2027: deixe o armazém como dimensão, para entrar depois.

---

## PARTE E — Lives e afiliados

Referência: `docs/design/Lives.html`. **Antes de cada coleta do TikTok, teste a
chamada pela rota que já existe, `/api/tiktok/sondar`.** A disponibilidade depende da
categoria do app.

### [ ] E1. TikTok: lives, vídeos e produtos

- **Lives:**
  - lista: `GET /analytics/202609/shop_lives/performance`, que só traz as contas
    oficiais da loja;
  - visão geral: `/analytics/202609/shop_lives/overview_performance`;
  - minuto a minuto, depois que a live termina:
    `/analytics/202510/shop_lives/{live_id}/performance_per_minutes`;
  - produtos da live: `/analytics/202512/shop/{live_id}/products_performance`.
- **Vídeos:** `/analytics/202605/shop_videos/performance`,
  `/202609/shop_videos/overview_performance` e
  `/202509/shop_videos/{video_id}/products/performance`.
  **Não use** `/analytics/202403/videos/performances`: é só para criadores dos EUA.
- **Produtos por canal:** `/analytics/202605/shop_products/performance` separa
  vendedor, afiliado e vitrine.
- **Loja por hora:** `/analytics/202510/shop/performance/{date}/performance_per_hour`
  (últimos 30 dias), útil para comparar o horário das lives.
- **Tabelas:** `lives` (canal, loja, live_id, início, fim, duração, receita,
  pedidos, espectadores, pico, tempo médio, CTR, receita por hora, bruto),
  `live_produtos` e `videos_desempenho`.
- **Cron:** diário de madrugada para o dia anterior, mais um disparo manual depois da
  live **[PERGUNTAR antes do `vercel.json`]**.

### [ ] E2. TikTok: afiliados

- **Pedidos:** `POST /affiliate_seller/202410/orders/search` (pedido, SKU, status
  de liquidação, comissão estimada e real) → tabela `tiktok_afiliado_pedidos`.
  Ligue ao pedido e ao extrato do TikTok, para conferir a comissão cobrada.
- **Criador:** `GET /affiliate_seller/202608/marketplace_creators/{id}` (seguidores,
  GMV, GMV de vídeo e de live), com cache semanal.
- **Campanhas de parceiros:** `Search Seller Partner Campaigns` e
  `Get Seller Partner Campaign Detail` alimentam o Calendário (Parte F).

### [ ] E3. Shopee: lives e afiliados

- **A API de lives da Shopee (`v2.livestream`) não vale no Brasil.** Ela é só para
  TW, ID, TH, PH, MY, SG e VN, e não lista sessões. Não implemente.
- Lives da Shopee entram por:
  1. a extensão `coletor-shopee`: descubra quais chamadas a tela de dados da live do
     Seller Center faz e capture com o mesmo mecanismo de `coletor_capturas`;
  2. enquanto isso, um formulário "lançar live" (data, duração, receita, pedidos,
     espectadores e pico), preenchido ao fim da live.
- **Afiliados da Shopee já são coletados** (tabelas `afiliados_*`). Acrescente
  `v2.ams.get_conversion_report` para a comissão por pedido e por item, com reembolso
  e canal. A janela máxima de consulta está na doc.

### [ ] E4. SPS do TikTok

Sem API no Brasil. Proposta: estender a extensão Coletor para o Seller Center do
TikTok (nova `host_permissions`) e capturar o SPS e as notas uma vez por dia. Até
lá, um campo de lançamento manual semanal. **[PERGUNTAR]** qual dos dois o Gabriel
prefere.

### [ ] E5. Tela `/lives`

Siga o `Lives.html`:
- filtro Todos / TikTok / Shopee;
- indicadores, receita por live, tabela de lives com canal;
- saúde para afiliados (SPS) e afiliados que mais venderam.

---

## PARTE F — Calendário de campanhas

Referência: `docs/design/Campanhas.html`.

### [ ] F1. Campanhas das plataformas

Não há API nas duas plataformas. Crie a tabela `campanhas` (canal, nome, tipo
`plataforma` / `propria` / `afiliado` / `live`, início, fim, prazo de inscrição,
exigências como desconto mínimo e estoque mínimo, link, observação) com cadastro
manual na tela. Opcional, mais tarde: captura da tela de campanhas do Seller Center
pela extensão.

### [ ] F2. Promoções próprias, só leitura

- **Shopee:**
  - desconto: `v2.discount.get_discount_list` (por status) e `get_discount`;
  - oferta relâmpago: `v2.shop_flash_sale.get_shop_flash_sale_list` e
    `get_shop_flash_sale_items` (motivo de recusa por item);
  - cupom: `v2.voucher.get_voucher_list`;
  - combo: `v2.bundle_deal.get_bundle_deal_list`;
  - compre junto: `v2.add_on_deal.get_add_on_deal_list`.
- **TikTok:** `POST /promotion/202309/activities/search` e
  `GET /promotion/202309/activities/{id}`. Os produtos de atividades encerradas há
  mais de 180 dias não voltam. **A API de cupons do TikTok não vale no Brasil**
  (só ID, MY, PH, TH, SG, VN): cupom do TikTok é cadastro manual.
- **Campanhas de afiliados do TikTok:** de E2.
- Tudo vira linha em `campanhas` (tipo `propria` ou `afiliado`) com os itens em
  `campanha_itens` (sku, preço normal, preço da promoção, estoque da promoção).
  Criar ou editar promoção pela API fica para depois, com aprovação.

### [ ] F3. Margem no preço da campanha

**Onde:** `lib/campanhas/margem.ts`, com testes. Não é a precificação completa (que
ficou para depois); é só para não entrar em campanha com prejuízo.

```
margem = preço_campanha
       − comissão (Shopee: shopee_taxa_esperada_item(preço, dia);
                   TikTok: 10% + R$ 4 abaixo de R$ 50, 6% + R$ 6 a partir de R$ 50)
       − taxa de serviço média do item (custos_pedido dos últimos 60 dias)
       − afiliado (taxa da campanha AMS / do TikTok, se houver)
       − frete médio pago pelo vendedor
       − imposto (tabela impostos)
       − custo (custo médio do UpSeller; senão custos_variacao)
```

Mostre a margem em R$ e em %, em vermelho quando for negativa. Avise também quando
o estoque não cobre a campanha, usando a Parte D com o fator da campanha.
`pendenciasCampanhas()` para o Painel: prazos de inscrição em 3 dias, campanha
começando amanhã e itens com margem negativa.

### [ ] F4. Tela `/campanhas`

Siga o `Campanhas.html`:
- mês com as barras por tipo e a lista de próximos prazos;
- painel da campanha com itens inscritos, margem e aviso;
- botões "Simular margem" e "Abrir no Seller Center".

---

## O que o Gabriel faz à mão

- Liberar a permissão `returns` no app da Shopee, se B0 pedir.
- Criar o bucket `devolucoes` (ou aprovar o SQL) e dizer o e-mail da disputa Shopee.
- Aprovar o cron novo e cadastrar a URL do webhook no Partner Center do TikTok.
- Combinar com a expedição a gravação da abertura: plano contínuo, etiqueta visível,
  balança em cena.
- Ligar a flag `devolucoes_acoes_api` e as regras quando quiser.
- Gerar o token da API do UpSeller e criar `UPSELLER_CLIENT_ID` e `UPSELLER_API_TOKEN` na Vercel (D1).
- Baixar do UpSeller as planilhas de produtos do armazém (com kits) e de mapeamento de SKU, se a API não trouxer (D2).
- Informar fornecedores e prazos de reposição (D4) e, de preferência, lançar as compras no módulo Compras do UpSeller.
- Escolher como entram o SPS do TikTok e as lives da Shopee: extensão ou lançamento manual (E3, E4).

## Ordem geral

1. Parte A (visual).
2. Partes B (devoluções) e C (painel) em paralelo.
3. Parte D (catálogo e estoque).
4. Parte E (lives e afiliados).
5. Parte F (campanhas).

Cada parte só começa com a anterior validada pelo Gabriel.

---

## Resumo final

(preencher ao terminar)
