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
