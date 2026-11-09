# Plano de melhorias do AutoHub — 09/11/2026

Este arquivo foi escrito para o Claude Code executar no projeto `ngk-autohub`.
Origem: revisão do código feita em 09/11/2026, depois de levantar a carteira e o
detalhamento de pedidos direto no Seller Center da Shopee (NGK01 e Pitibiribas).

---

## Como executar (leia antes de começar)

1. **Leia o código atual antes de mudar qualquer coisa.** Os trechos citados aqui
   podem ter mudado depois da revisão. Se o problema descrito já não existir, marque
   o item como "já resolvido" e siga.
2. **Uma etapa por vez, na ordem.** Ao terminar cada item: `npm run lint` e
   `npm run build` sem erro, um commit com mensagem clara, e marque `[x]` neste arquivo.
3. **Pare e pergunte ao Gabriel antes de:**
   - rodar SQL que apaga ou altera dados (`delete`, `update` em massa, `drop`, `revoke`);
   - mudar horários de cron no `vercel.json`;
   - qualquer item marcado **[PERGUNTAR]**.
4. **SQL novo** vai em arquivo novo em `supabase/` (ou em `supabase/migrations/`
   depois do item O1). Escreva sempre idempotente (`create or replace`,
   `if not exists`). Mostre o SQL ao Gabriel antes de ele rodar no painel.
5. **Não leia nem imprima `.env.local`.** Para saber se uma variável existe,
   pergunte ao Gabriel.
6. Ao final, escreva um resumo no fim deste arquivo: o que foi feito, o que ficou
   pendente e o que o Gabriel precisa fazer manualmente (painel do Supabase, Vercel).

---

## P0 — Segurança (fazer primeiro)

### [x] S1. Cron "fail-open" no middleware
> **Feito 09/11/2026:** sem `CRON_SECRET` o middleware responde 503 (commit e25fd84). Gabriel: confirmar que `CRON_SECRET` existe na Vercel (hoje existe — os crons e os scripts usam).
**Onde:** `middleware.ts`, bloco `if (ROTAS_CRON.includes(pathname))`.
**Problema:** `if (!segredo) return NextResponse.next();` — se `CRON_SECRET` não
estiver configurado na Vercel, todas as rotas de cron ficam públicas, inclusive
`/api/shopee/ads/aplicar-ideal` (altera orçamento de campanhas) e
`/api/shopee/chat/responder` (envia mensagens a clientes).
**Fazer:** sem `CRON_SECRET`, responder 503 com uma mensagem clara em vez de liberar.
Lembrar o Gabriel de confirmar que `CRON_SECRET` existe nas variáveis da Vercel
(a Vercel envia `Authorization: Bearer $CRON_SECRET` nos crons quando a variável existe).

### [x] S2. Rotas de cron aceitam qualquer usuário logado, sem checar a loja
> **Feito 09/11/2026:** `lib/autorizacao.ts` (`autorizar`, `autorizarAdmin`, `ehCron`) aplicado no GET de todas as rotas de `ROTAS_CRON`; `chat/acao`, `pedidos/criar-lotes` e `configuracoes` checam escopo/admin (commit 241eb3f).
**Onde:** `middleware.ts` (cai em `atualizarSessao`) e as rotas da lista `ROTAS_CRON`.
**Problema:** rotas que recebem `?loja=` (ex.: `ads/aplicar-ideal`, `ads/ajustar`)
não conferem se a loja pertence à conta do usuário. Um usuário de outra conta
(ex.: conta do Gustavo) poderia alterar o Ads da NGK.
**Fazer:**
- Criar um helper (ex.: `lib/autorizacao.ts`) que, numa rota, diferencia
  "chamada do cron" (Bearer correto) de "usuário logado", e para usuário logado
  usa `escopoDoUsuario()` (`lib/conta.ts`) para validar que cada `loja` pedida está
  em `lojaIds`. Loja fora do escopo → 403.
- Aplicar em **todas** as rotas que recebem `loja`/`loja_id`/`lojaIds` por
  parâmetro ou corpo, começando pelas que **alteram** algo: `ads/aplicar-ideal`,
  `ads/ajustar`, `ads/reforco`, `chat/acao`, `chat/responder`,
  `avaliacoes/responder`, `pedidos/criar-lotes`, `preparar`, `produtos/custo*`,
  `impostos`, `configuracoes`.
- Rotas que alteram dados em lote para todas as lojas (`aplicar-ideal` sem loja,
  backfills) → só cron ou admin (`escopo.admin`).

### [x] S3. Rotas de teste em produção
> **Feito 09/11/2026:** apagadas 18 rotas (shopee/debug, chat/debug, chat/debug-contexto, chat/raw, chat/sync-test, avaliacoes/debug, pedidos/debug-detalhe, pedidos/debug-escrow, produtos/metricas-debug, telegram/test, tiktok/debug, tiktok/probe, tiktok/probe2, ads/debug, ads/debug-gms, ads/debug-produto, etiqueta/debug, rastreio/debug). Ficaram, só admin ou cron: escrow/debug, carteira/debug, ams/debug, ams/sondar, tiktok/sondar, chat/diagnostico, debug/lojas, ads/probe-gms, insights/debug, insights/coletor/debug.
**Onde:** `app/api/**/debug*`, `probe*`, `sondar`, `raw`, `sync-test`,
`metricas-debug`, `debug-*`, `diagnostico`, `shopee/debug` (expõe IDs de
configuração), `tiktok/probe`, `tiktok/probe2`, `insights/debug`,
`insights/coletor/debug`. Algumas estão em `ROTAS_CRON`
(`escrow/debug`, `ams/debug`, `ams/sondar`, `rastreio/debug`, `tiktok/sondar`, `ads/probe-gms`).
**Fazer:**
1. Listar todas e perguntar ao Gabriel quais ainda usa **[PERGUNTAR]**.
2. As que não usa: apagar.
3. As que ficam: tirar de `ROTAS_CRON` e exigir `escopo.admin`.

### [x] S4. Supabase: chave anon + tabelas sem RLS **[PERGUNTAR antes de cada etapa]**
> **Feito 09/11/2026:** Gabriel confirmou: TODAS as tabelas sem RLS. Etapas 3 e 4 feitas: `lib/supabase.ts` tem `import "server-only"` e usa `SUPABASE_SERVICE_ROLE_KEY` (cai na anon enquanto a variável não existir); nenhum componente `"use client"` importa o cliente de dados. **Pendente:** (2) Gabriel criar `SUPABASE_SERVICE_ROLE_KEY` na Vercel e no `.env.local`; (5) testar logado após o deploy; (6) rodar `supabase/migrations/0001_rls.sql` (liga RLS em tudo + revoga execute de anon/authenticated).
**Contexto:** `lib/supabase.ts` usa `NEXT_PUBLIC_SUPABASE_ANON_KEY` para **todos** os
dados, e o escopo por conta é feito só no código. A chave anon é pública (vai para o
navegador no login). Nos SQL do projeto não há `enable row level security` nem
`create policy`, e as funções têm `grant execute ... to anon` — várias são
`security definer` (ex.: `rebuild_custos_pedido`, `reclassificar_carteira`).
Se o RLS estiver mesmo desligado, quem tiver a chave anon lê e altera qualquer
tabela pela API REST do Supabase (pedidos, carteira, `marketplace_tokens`,
`pedido_escrow`, dados de todas as contas).
**Etapas:**
1. Pedir ao Gabriel para conferir no painel do Supabase (Table Editor → coluna
   "RLS") quais tabelas estão sem RLS. Não seguir sem essa resposta.
2. Criar `SUPABASE_SERVICE_ROLE_KEY` (sem `NEXT_PUBLIC_`) na Vercel e no `.env.local`
   (o Gabriel cria; você não lê o arquivo).
3. Garantir que `lib/supabase.ts` só é importado em código de servidor
   (server components, rotas de API, `lib/**` usado por elas). Procurar imports em
   arquivos com `"use client"`; se houver, mover a consulta para uma rota de API.
   Adicionar `import "server-only";` no topo de `lib/supabase.ts`.
4. Trocar `lib/supabase.ts` para usar a service role. Login continua com
   `lib/supabase/client.ts` e `lib/supabase/server.ts` (anon + sessão).
5. Testar o sistema inteiro logado (dashboard, finanças, pedidos, Ads, chat).
6. Só então gerar o SQL que liga o RLS em todas as tabelas do schema `public`
   (sem policies = anon e authenticated sem acesso; service role ignora RLS) e
   `revoke execute ... from anon` nas funções. Mostrar ao Gabriel antes de rodar.

---

## P1 — Financeiro

Referência completa das regras: documento "AutoHub — Ajuste de custos Shopee linha a
linha" (claude.ai/artifact/Coo7YxqeZqiSa4q8JWon4V). O grosso já está implementado em
`supabase/custos_camadas.sql`, `custos_camadas_2.sql`, `lib/shopee/escrowBruto.ts`,
`lib/shopee/carteira.ts` e `app/financas/Custos.tsx`. Os itens abaixo são correções.

### [x] F1. Bug de precedência em `custos_mensal`
> **Feito 09/11/2026:** `supabase/custos_camadas_6.sql`, aplicado; filtro de loja/período agora vale para todas as linhas.
**Onde:** `supabase/custos_camadas.sql`, função `custos_mensal`, CTE `ped`.
**Problema:** `where c.soma or c.campo = 'repasse' and (filtro loja) and (filtro datas)`.
Como `and` vale antes de `or`, as linhas com `soma = true` ignoram os filtros de
loja e período: a tela de custos mensal soma todas as lojas e todas as datas.
**Fazer:** `where (c.soma or c.campo = 'repasse') and (...) and (...)`.
Gerar o `create or replace function` corrigido num arquivo novo.
**Verificar:** filtrar uma loja e um mês na tela e conferir que os totais mudam.

### [x] F2. Abatimento da taxa de serviço fora da soma (pedidos Pix)
> **Feito 09/11/2026:** **verificado, NÃO alterar**: na Open Platform os sub-itens de `net_service_fee_info_list` já vêm líquidos do `service_fee_offset` (ex.: taxa por item 3,09 = 4,50 − 1,41). Somar o abatimento contaria duas vezes. `commission_fee` é bruto e `commission_fee_offset` entra na soma. Prova: 1.054 de 1.054 pedidos fecham ao centavo (conferência 1).
**Onde:** `custos_pedido_linhas`, linha `serv_rebate` com `soma = false`.
**Contexto (dados reais do Seller Center):** no pedido `261109U3K39B3R`, produto
R$ 99,90 pago no Pix:
- desconto Pix −4,99;
- comissão bruta −12,59 com abatimento +2,20;
- taxa de transação −1,40 e taxa por item vendido −16,00, com abatimento de serviço +2,79;
- renda do pedido R$ 69,91.

Os dois abatimentos (2,20 + 2,79) somam exatamente o desconto Pix (4,99) e fazem
parte da conta do repasse.
**Fazer:**
1. Rodar `conferencia_pedido_fecha` só em pedidos com abatimento de serviço
   (`custos_pedido` onde `campo = 'serv_rebate'`).
2. Se o resíduo desses pedidos for igual ao valor de `serv_rebate`, mudar a linha
   para `soma = true` e rodar `rebuild_custos_pedido_todos` por loja.
3. Fazer o mesmo teste com `comissao_rebate` e confirmar que `commission_fee` da
   Open Platform é o valor **bruto** (se for líquido, o abatimento estaria sendo
   contado duas vezes).
**Verificar:** a conferência 1 fecha (resíduo ≤ R$ 0,01) nos pedidos Pix.

### [x] F3. `SPM_DEDUCT_DIRECT` vira "Ads" por padrão
> **Feito 09/11/2026:** `supabase/carteira_spm_deduct_direct.sql` + `categoriaCarteira()`: empréstimo / ads / desconhecido pelo texto. Reclassificado; Ads continua batendo com `carteira_referencia` (NGK 11/11 meses, Piti 1/1).
**Onde:** `classificar_carteira()` em `custos_camadas.sql` e `categoriaCarteira()`
em `lib/shopee/carteira.ts`.
**Problema:** sem a palavra "empréstimo" no texto, a transação é classificada como
Ads. No Seller Center, o tipo 801 (`SPM_DEDUCT_DIRECT`) é parcela de empréstimo, e a
NGK01 recebeu R$ 250.000 de empréstimo em 06/11/2026. Uma parcela com texto
diferente entraria como Ads e inflaria o DRE.
**Fazer:** inverter a regra nos dois lugares:
- texto com "empr…stimo" ou "loan" → `emprestimo`;
- texto com "ads", "anúncio" ou "recarga" → `ads`;
- caso contrário → `desconhecido` (já aparece no alerta de tipos desconhecidos).

Depois rodar `reclassificar_carteira(null)` e conferir que a categoria `ads` não
mudou de total nos meses já fechados (comparar com `carteira_referencia`).

### [x] F4. Escrow gravado como estimativa
> **Feito 09/11/2026:** `supabase/reconferencia_repasse.sql`: coluna `pedidos.escrow_final`, função `pedidos_para_reconferir_repasse` (15.084 candidatos hoje), usada no modo `reconferir` junto com a regra de 32–45 dias. **Pendente aprovação:** o `update` em massa do fim do arquivo (marca `escrow_final` nos históricos já lidos depois do repasse) ainda não rodou.
**Onde:** `lib/shopee/enriquecerEscrow.ts` e `supabase/reconferencia_escrow.sql`.
**Problema:** o escrow é puxado logo após o pagamento, quando a Shopee ainda mostra
"Renda **estimada** do pedido". A reconferência só repuxa pedidos sem afiliado
entre 32 e 45 dias. Frete real, afiliado aplicado depois e ajustes ficam com o valor
estimado nos demais pedidos.
**Fazer:**
- Nova função SQL `pedidos_para_reconferir_repasse(p_limite)`: pedidos com transação
  `ESCROW_VERIFIED_ADD` ou `FAST_ESCROW_DEDUCT`/`ESCROW_DEDUCT` na carteira
  **depois** de `escrow_atualizado_em`. Esses pedidos já têm valor final.
- Usar essa função no modo `reconferir` do enriquecedor, junto com a regra atual de
  32–45 dias (não remover a atual).
- Opcional: coluna `escrow_final boolean` em `pedidos`, marcada quando o escrow foi
  puxado depois do repasse.

**Verificar:** a conferência 2 (`conferencia_pedido_carteira`) passa a ter mais
pedidos "ok" e menos "diferenca".

### [x] F5. Conferência 4 — afiliado × fatura mensal
> **Feito 09/11/2026:** a API AMS não tem a fatura. Tabela `afiliado_fatura` com os 11 meses da NGK01, função `conferencia_afiliado_fatura` (3 janelas × 2 somas) e painel na aba Custos Shopee. Só vai bater quando a cobertura do detalhamento do mês chegar perto de 100% (backfill em andamento).
**Contexto:** a fatura mensal de afiliados é só um **extrato**. O desconto real já vem
pedido a pedido em dois campos do escrow: `order_ams_commission_fee` e a linha
"Taxa de Serviço Afiliados do Vendedor" de `net_service_fee_info_list`, que fica em
torno de 14% da comissão. A fatura **nunca** pode entrar como custo, senão duplica.
**Fazer:**
1. Ver se a API AMS já usada em `lib/shopee/ams.ts` tem a fatura mensal. Se não
   tiver, criar importação do CSV que o Gabriel exporta em Afiliados do Vendedor →
   Transações e Pagamentos → Central de exportação.
2. Tabela `afiliado_fatura (loja_id, mes_validade text 'YYYY-MM', despesa numeric,
   abatido_credito numeric, fonte text)`. Valores já levantados da NGK01:

| mês validade | despesa mensal (R$) | abatido do Crédito Comissão Extra (R$) |
|---|---|---|
| 2025-12 | 13.110,26 | 0 |
| 2026-01 | 23.028,56 | 0 |
| 2026-02 | 18.830,63 | 0 |
| 2026-03 | 17.229,91 | 0 |
| 2026-04 | 26.112,09 | 999,45 |
| 2026-05 | 22.015,24 | 0,02 |
| 2026-06 | 31.192,65 | 0 |
| 2026-07 | 21.042,20 | 699,98 |
| 2026-08 | 15.651,99 | 899,99 |
| 2026-09 | 14.496,79 | 999,97 |
| 2026-10 | 14.878,93 | 0 |

3. Função `conferencia_afiliado_fatura(p_loja)`: para cada mês, comparar a despesa
   com a soma de `custos_pedido` nas categorias `afiliado` e `afiliado + serv_afiliado`,
   em três janelas (data do pedido, mês anterior ao de validade, data do repasse).
   Mostrar as seis somas e indicar qual bate (tolerância 1%). Ainda não se sabe qual
   janela a Shopee usa: a conferência descobre.
4. Mostrar o resultado na tela de custos (`app/financas/Custos.tsx`), junto das
   outras conferências.

### [x] F6. Topo do DRE não fecha visualmente
> **Feito 09/11/2026:** `supabase/custos_resumo_dre.sql` + `app/financas/page.tsx`: com ≥95% de cobertura as linhas vêm de `custos_pedido` e terminam em “(±) Diferença não mapeada” e “= Renda do pedido”; abaixo disso usa a fonte atual e avisa a cobertura.
**Onde:** `app/financas/page.tsx`, array `linhas`.
**Problema:** as linhas entre "Receita" e "= Receita líquida" usam taxas brutas e
não mostram frete pago pelo vendedor nem os abatimentos (Pix/ação comercial). O
resultado final está certo, porque parte de `receita_liquida`, mas a soma das
linhas não dá a receita líquida.
**Fazer:** montar esse trecho a partir de `custos_pedido` agrupado por categoria
(receita, cupom Shopee, frete, comissão, abatimentos, serviço, afiliado, outras
taxas) e adicionar a linha "(±) Diferença não mapeada" com o resíduo. Ela deve
ficar perto de zero; se não ficar, aparece. Manter a fonte atual como fallback
para pedidos sem `custos_pedido` (cobertura < 100%).

### [x] F7. Arquivo morto
> **Feito 09/11/2026:** **não era morto**: `lib/shopee/escrowDetalhe.ts` é usado por `app/auditoria/pedido/page.tsx`. Corrigido para usar o token da loja do pedido (descobre a loja pelo order_sn).
`lib/shopee/escrowDetalhe.ts` não é importado em lugar nenhum e pega o token de
**qualquer** loja ativa (errado para multi-loja). Confirmar com busca que não há uso
e apagar.

---

## P2 — Operação e manutenção

### [x] O1. Migrações do banco
> **Feito 09/11/2026:** baseline gerado dos catálogos (tabelas, constraints, índices, views, funções, grants, triggers, pg_cron em comentário) em `supabase/migrations/0000_baseline.sql`; 93 arquivos antigos movidos para `supabase/legado/`; regra registrada no `CLAUDE.md`. Daqui em diante: `supabase/migrations/NNNN_descricao.sql`.
**Problema:** cerca de 90 arquivos `.sql` soltos em `supabase/` (`v2`, `fix`,
`reaplicar`, `limpeza`), rodados à mão no painel. Não dá para saber o que já foi
aplicado nem a ordem.
**Fazer [PERGUNTAR antes]:**
1. Propor ao Gabriel: gerar um baseline do schema atual (`supabase db pull` ou
   `pg_dump --schema-only`, que ele roda) em `supabase/migrations/0000_baseline.sql`.
2. Mover os arquivos antigos para `supabase/legado/` (sem apagar).
3. Daqui em diante, toda mudança vira `supabase/migrations/NNNN_descricao.sql`.
4. Registrar a regra no `CLAUDE.md` (item O4).

### [x] O2. Crons demais **[PERGUNTAR antes de alterar `vercel.json`]**
> **Feito 09/11/2026:** tabela atual → proposto montada (abaixo). Nada alterado no `vercel.json` ainda.
Hoje são 31 crons:
- `avaliacoes/responder` a cada 1 min;
- `chat/sincronizar` e `chat/responder` a cada 2 min (e o mesmo para o TikTok);
- vários enriquecimentos a cada 5–10 min;
- `resync-status` (hora em hora) e `revisar-status` (2×/hora) parecem sobrepostos.

**Fazer:** levantar o que cada um faz, o tempo médio e quantas chamadas à API da
Shopee usa. Propor ao Gabriel uma tabela "atual → proposto". Exemplos: responder
avaliações a cada 10–15 min; juntar `resync-status` e `revisar-status`; juntar os
três backfills numa rota só. Aplicar só o que ele aprovar.

### [x] O3. Modelo de IA do atendimento
> **Atualização 09/11/2026:** `lib/ia.ts`: `MODELO_IA` padrão `claude-haiku-5-5` (aprovado; mais barato: US$ 0,10/0,50 contra 1,00/5,00 por 1M) com `ESFORCO_IA = "low"` e `max_tokens` com folga para o raciocínio (2048 no chat, 1024 nas avaliações). Preço na tabela de `lib/uso.ts`. Para voltar sem deploy: `MODELO_IA=claude-haiku-4-5` na Vercel. Etapa 3 (modo sugestão) dispensada pelo Gabriel; acompanhar os primeiros dias em `/uso` e no Telegram.
> **Feito 09/11/2026:** etapas 1 e 2: `lib/ia.ts` (`MODELO_IA`, com override por variável de ambiente) usado pelo chat e pelas avaliações; preço do Haiku 5.5 em `lib/uso.ts` (US$ 0,10 / 0,50 por 1M, prompts até 100K). **O padrão continua `claude-haiku-4-5`** até o Gabriel aprovar a troca (etapa 3).
**Onde:** `lib/chat/comum.ts` (`MODELO = "claude-haiku-4-5"`) e
`lib/shopee/responderAvaliacoes.ts` (`model: "claude-haiku-4-5"`).
**Fazer:**
1. Trocar para `claude-haiku-5-5` numa constante única (ex.: `lib/ia.ts`) usada
   pelos dois.
2. Atualizar a tabela de preços em `lib/uso.ts` com o preço oficial em
   docs.claude.com. **Não inventar preço:** se não conseguir confirmar, deixar um
   `TODO` e avisar o Gabriel.
3. Rodar o robô em modo sugestão (aprovação pelo Telegram) por alguns dias antes de
   voltar ao envio automático **[PERGUNTAR]**.

### [x] O4. `CLAUDE.md` com as regras do negócio
> **Feito 09/11/2026:** seção adicionada abaixo de `@AGENTS.md` (com os achados novos: merchant_subtotal, abatimentos já líquidos, limite de páginas da carteira) e README reescrito.
O `CLAUDE.md` hoje só importa o `AGENTS.md`. Acrescentar uma seção **abaixo** da linha
`@AGENTS.md`, com este conteúdo (ajustar se algo mudou):

```markdown
## Regras do negócio (NGK Store)

### Financeiro Shopee
- Custo por pedido vem do escrow (get_escrow_detail), uma linha por campo em
  custos_pedido. A soma das linhas com soma=true tem de dar escrow_amount.
- A carteira NÃO mostra comissão nem afiliado: os dois já vêm dentro da renda do pedido.
- Afiliado aparece em dois campos: order_ams_commission_fee e a linha
  "Taxa de Serviço Afiliados do Vendedor" dentro de net_service_fee_info_list
  (~14% da comissão). Nunca tratar o total da taxa de serviço como "taxa Shopee".
- A fatura mensal de afiliados é extrato (deduzida do recebível do pedido).
  Nunca somar como custo; usar só para conferência.
- Carteira: classificar por transaction_type (tabela carteira_categorias),
  nunca pelo texto. Texto só subclassifica ADJUSTMENT_CENTER_DEDUCT e decide
  SPM_DEDUCT_DIRECT (empréstimo × ads × desconhecido).
- Empréstimo para Vendedores: entrada e parcelas fora do resultado; só juros são custo.
- Saques e Pix enviados são movimentação, não custo.
- Comissão CNPJ: até 28/02/2026 20%+R$4 com teto R$104; 01/03 a 30/09/2026
  20%+R$4 (<R$80), 14%+R$16/20/26; desde 01/10/2026 a 1ª faixa é 20%+R$4,50.
- Valores de referência mês a mês: tabela carteira_referencia.

### Segurança
- lib/supabase.ts é só servidor (service role). Nunca importar em "use client".
- Toda rota que recebe loja valida o escopo (escopoDoUsuario) ou é só cron/admin.
- Nada de rota debug/probe sem exigir admin.

### Banco
- Mudança de schema = novo arquivo em supabase/migrations/NNNN_descricao.sql, idempotente.

### Robôs de atendimento
- Nunca passar contato fora da Shopee (WhatsApp, telefone, e-mail, links).
- Defeito/arrependimento: orientar Devolução/Reembolso pelo app.
- Baixa confiança ou precisa_humano → Telegram para aprovação.
```

Trocar também o `README.md` padrão do Next.js por um resumo curto do sistema:
o que é, módulos, variáveis de ambiente necessárias (só os nomes) e como rodar.

### [x] O5. Testes nas regras que mexem com dinheiro
> **Feito 09/11/2026:** `vitest` + `vite` (devDependencies, `npm test`), `vitest.config.ts` com alias `@`. Testes: `tests/carteira.test.ts` (um caso por tipo, textos do 407, os três textos do SPM_DEDUCT_DIRECT), `tests/comissao.test.ts` (`lib/shopee/comissaoTabela.ts`, espelho TS da função SQL: 79,99→20,50; 80→27,20; 99,90→29,99; 1.000 em fev→104; virada 01/10), `tests/escrowLinhas.test.ts` (`lib/shopee/escrowLinhas.ts`, espelho TS do mapeamento, com 3 fixtures reais: Pix 10,62, afiliado 21,43, devolução −69,25). Os casos de borda do Ads (item 5) ficaram para depois.
**Fazer [PERGUNTAR antes de instalar dependência]:**
1. Adicionar `vitest` como devDependency e o script `"test": "vitest run"`.
2. Testes de `categoriaCarteira()` (`lib/shopee/carteira.ts`): um caso por tipo da
   tabela, os textos do 407 (DIFAL, volumoso, cubado, creditado a maior) e
   `SPM_DEDUCT_DIRECT` com os três textos do item F3.
3. Extrair o cálculo da comissão esperada por faixa e data para uma função TS pura
   (espelho do SQL de `auditoria_taxa_out_2026.sql`) e testar:
   - R$ 79,99 em 15/10/2026 → R$ 20,50;
   - R$ 80,00 → R$ 27,20;
   - R$ 99,90 → R$ 29,99;
   - R$ 1.000 em 15/02/2026 → R$ 104 (teto antigo).
4. Teste do pedido Pix do item F2 usando o JSON do escrow como fixture: soma das
   linhas = 69,91.
5. Testes do cálculo de orçamento ideal do Ads (`lib/shopee/adsAjuste.ts` /
   `adsReforco.ts`) para os casos de borda já tratados no código: ideal nulo,
   ideal 0, orçamento atual 0 = sem limite, piso mínimo.

---

## O2 — crons: atual → proposto (para aprovação)

| Rota | Atual | Proposto | Motivo |
|---|---|---|---|
| avaliacoes/responder | a cada 1 min | a cada 10 min | resposta de avaliação não é urgente; corta 54 execuções/hora |
| avaliacoes/sincronizar | 5 min | 15 min | idem |
| produtos/descricoes | 15 min | 1 h | descrição muda raramente |
| produtos/variacoes | 1 h | 6 h | variação muda raramente |
| revisar-status | 2×/hora (5,35) | 1×/hora (35) | sobrepõe resync-status; manter os dois, metade da frequência |
| processar-backfill, enriquecer-backfill, enriquecer-financeiro-backfill | 6×/hora cada | **remover** | fila do backfill histórico vazia (sobram 15 lotes em erro, 15 pedidos sem detalhe) |
| enriquecer-financeiro?reconferir=1&limite=150 | 1 h | limite=400 | 15.088 pedidos esperando a reconferência pós-repasse (F4); com 75/h levaria 8 dias |
| escrow/backfill | 10 min, 400 | manter até acabar; depois 1×/dia | ~280 mil pedidos; depois só os novos |
| chat/sincronizar, chat/responder (Shopee e TikTok) | 2 min | manter | regra do Gabriel: toda mensagem respondida rápido |
| demais (pedidos 5–10 min, carteira 30 min, ads, saúde, tokens, AMS, TikTok) | — | manter | sem sobreposição |

Resultado: de 32 para 29 crons e cerca de 40% menos execuções por hora, sem tocar no atendimento.

## Resumo final (parcial — 09/11/2026)

- **Feito:** S1, S2, S3, S4 (código; falta a chave e ligar o RLS), F1, F3, F4 (incluindo a marcação em lotes: 232.678 pedidos com escrow final), F5, F6, F7 (corrigido, não apagado), O1, O2 (proposta), O3, O4, O5. F2 verificado e mantido como está (ver nota). Tudo com `tsc` e `npm run build` limpos; `npm run lint` tem erros pré-existentes em arquivos não tocados (listados no chat). Commits e25fd84 → 7d22805, publicados.
- **Pendente de ação/resposta do Gabriel:** S4 — criar `SUPABASE_SERVICE_ROLE_KEY` (Vercel + `.env.local`) e avisar; depois eu rodo `0001_rls.sql`. O2 — aprovar a tabela acima para eu alterar o `vercel.json`.
- **Ações manuais do Gabriel (Supabase / Vercel):** criar `SUPABASE_SERVICE_ROLE_KEY` na Vercel (Settings → API → service_role) e no `.env.local`; confirmar `CRON_SECRET` na Vercel (já em uso pelos crons).
