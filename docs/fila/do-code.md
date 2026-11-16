# Relatórios do Claude Code

Acrescente cada relatório no fim deste arquivo, no formato descrito em `docs/fila/README.md`.

## T-001 — CONCLUÍDA
Data/hora: 16/11/2026, 11:41:42
O que foi feito: carga única de 45 dias das falhas de entrega da NGK (API de pedidos: CANCELLED "Failed Delivery" + rastreio), em duas fatias (0–20 d e 20–45 d) porque a janela inteira estourava os 300 s da função. Regra ajustada: caso em Validar só sai por inspeção no AutoHub ou encerramento pela Shopee (pacote descartado), nunca por tempo — antes havia encerramento automático 7 dias após a meta.
O que foi publicado (commit, migration, cron): commits 6f9d9c1 (sem encerramento por tempo), 4f7d492 (fatia ?dias=45&ate=20); sem migration nem cron novo; o cron de devoluções (15 min) segue com janela de 20 dias.
Números pedidos na tarefa:
1. NGK, falhas de entrega por situação: Validar 39 · Em trânsito 6 · Encerrados 5 (total 50).
2. Casos em Validar (pedido · pacote devolvido ao vendedor em), do mais antigo para o mais novo:
   - 261006VWDVAQEP · 06/10/2026 (41 d)
   - 261001GC74B0XY · 09/10/2026 (38 d)
   - 261001F5B15YSH · 13/10/2026 (34 d)
   - 260929BBJXC8BW · 13/10/2026 (34 d)
   - 2609299TQ9XYRW · 14/10/2026 (33 d)
   - 261003KSCSN53V · 16/10/2026 (31 d)
   - 260921MD36RG73 · 16/10/2026 (31 d)
   - 261001EDFGYP4N · 16/10/2026 (31 d)
   - 261001E91866TX · 17/10/2026 (30 d)
   - 261005RS9VFJWD · 17/10/2026 (30 d)
   - 26100838XQ6M85 · 20/10/2026 (27 d)
   - 2610072CMTCTG8 · 21/10/2026 (26 d)
   - 26100834JK3E0A · 23/10/2026 (24 d)
   - 26100956H1H99W · 23/10/2026 (24 d)
   - 261002HM680EDX · 24/10/2026 (23 d)
   - 2610070U8EX8F4 · 27/10/2026 (20 d)
   - 261013FPJGYFPT · 28/10/2026 (19 d)
   - 261005RW23KVW6 · 28/10/2026 (19 d)
   - 261015N91AUG5X · 29/10/2026 (18 d)
   - 261014JDNA40RM · 30/10/2026 (17 d)
   - 261013FE9GTRT8 · 30/10/2026 (17 d)
   - 2610204NMBX10E · 03/11/2026 (13 d)
   - 261013FJ9EXTAG · 03/11/2026 (13 d)
   - 261002GXHMM6A3 · 03/11/2026 (13 d)
   - 261023DJUGE1T1 · 03/11/2026 (13 d)
   - 26102176T2XTXG · 03/11/2026 (13 d)
   - 261011ARS7Q3P8 · 03/11/2026 (13 d)
   - 261011CEMYAV9S · 03/11/2026 (13 d)
   - 2610191YWS3WV9 · 04/11/2026 (12 d)
   - 261024EGWWCDEH · 04/11/2026 (12 d)
   - 261011AMD895Q4 · 05/11/2026 (11 d)
   - 26101936V2SQD8 · 05/11/2026 (11 d)
   - 261027P7PSA35M · 05/11/2026 (11 d)
   - 261028RUJGM8VQ · 06/11/2026 (10 d)
   - 261026KA466CEN · 07/11/2026 (9 d)
   - 261029VR72PJ7C · 09/11/2026 (7 d)
   - 261026K93GWW4K · 13/11/2026 (3 d)
   - 261027P3HUUNNQ · 13/11/2026 (3 d)
   - 261026KFYQNSEY · 13/11/2026 (3 d)
3. Casos em Validar com mais de 20 dias: 15 de 39.
Dúvidas ou pendências: o Seller Center mostra 25 em "Devolvido ao Vendedor"; aqui são 39 em Validar. Diferença provável: casos que o Seller Center já tirou da lista (validados lá) — conferir contra a lista do SC; se algum já estiver validado, registrar no AutoHub com "Validado, voltou ao estoque".

## T-002 — AGUARDA GABRIEL
Data/hora: 16/11/2026, 11:47:48
O que foi feito: módulo Creators fase 1 escrito, testado (133 testes passam) e publicado no código (commit fba7d10):
- Coleta só-leitura (lib/tiktok/creators.ts): sample_applications/search (todas as páginas), marketplace_creators/{id} (1x por dia por criador), orders/search (30 d na primeira carga, depois incremental), fulfillments/search para amostras aprovadas até constar conteúdo. Backoff próprio para 36009002: espera 2/6/15 s e, se insistir, grava tiktok_api_backoff por 5 min e a rodada para (o cron de 30 min retoma).
- Cálculo puro (lib/creators/calculo.ts): produto parado (estoque UpSeller ≥ 300 e vendas 28 d < 2 %), nota 0–100 (pesos 35/20/15/15/15, bônus +10 parado), sugestão (aprovar ≥ 70 ou ≥ 50 com custo ≤ R$ 40; recusar < 30 com custo > R$ 40; o resto decidir), custo = custo do SKU no UpSeller + frete estimado (R$ 12). Tudo em creators_config por conta.
- Diário (lib/creators/diario.ts): produtos parados (com views e pedidos de 28 d do analytics), nota/sugestão de cada pedido aberto, alerta (criarAlerta + Telegram) de "Aprovar" vencendo em < 12 h.
- Tela /creators (item "Creators" no grupo Vendas): KPIs, fila por prazo com nota, motivos, custo, sugestão e link para o Affiliate Center; aba Produtos parados com os 20 criadores sugeridos; aba Resultado por produto e por criador. Decisão humana só registrada (/api/creators/decidir).
- Fase 2 preparada e DESLIGADA: /api/creators/acoes exige a flag creators_acoes_api (false), confirmação na tela e grava quem aprovou em creators_acoes_log; nenhum endpoint de escrita é chamado (nem com a flag ligada ainda: devolve 501 "não implementada").
- Categoria do produto: o coletor de estoque do TikTok passa a gravar tiktok_produtos (nome, categoria folha de category_chains).
O que foi publicado (commit, migration, cron): commit fba7d10. Migration 0027 NÃO aplicada e crons NÃO adicionados — ver pendências.
Números pedidos na tarefa: ainda não há (a coleta depende da migration).
Dúvidas ou pendências:
1. A ferramenta bloqueou a aplicação da migration 0027 (só cria tabelas e colunas novas) e a edição do vercel.json. Precisa do Gabriel:
   a) aplicar supabase/migrations/0027_creators.sql no painel do Supabase (idempotente);
   b) acrescentar em vercel.json os crons de leitura:
      { "path": "/api/creators/coletar", "schedule": "13,43 * * * *" } e
      { "path": "/api/creators/diario", "schedule": "50 5 * * *" }
   Depois disso, rodar uma vez /api/creators/coletar e /api/creators/diario (ou avisar aqui) para eu registrar os números pedidos (amostras coletadas por sugestão, produtos parados, 10 maiores notas que vencem primeiro).
2. O link para o pedido no Affiliate Center é genérico (página de pedidos de amostra) + id do pedido; não achei URL direta por pedido na documentação.
3. "Visualizações 28 d" vêm do analytics shop_products/performance; se o campo de page views não existir na resposta, a coluna fica "—" e o produto é separado só por pedidos.
