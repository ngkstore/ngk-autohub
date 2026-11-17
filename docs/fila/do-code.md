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

## T-002 — PARCIAL
Data/hora: 16/11/2026, 12:00:32
O que foi feito: complemento ao bloco anterior. R-002 aplicada: migrations 0027 e 0028 aplicadas (tabelas do módulo + faixas de frete por peso e peso do produto); frete por faixa de peso do SKU (≤1 kg R$ 12, 1–5 kg R$ 25, 5–15 kg R$ 45, >15 kg R$ 80; sem peso R$ 25 com aviso nos motivos), peso vindo do package_weight do products/search; nota, sugestão e alerta calculados a cada rodada do coletor (30 min); diário só com produtos parados e recálculo. Perfil dos criadores com pedido pendente é coletado primeiro (40 por rodada). Coleta, diário e avaliação rodados manualmente uma vez.
O que foi publicado (commit, migration, cron): commits fba7d10, 2b8a4e5, 52bb24e; migrations 0027 e 0028 aplicadas. Crons NÃO adicionados (ferramenta bloqueia a edição do vercel.json; ver pendências).
Números pedidos na tarefa:
- Pedidos de amostra coletados: 1550 (OVERDUE_CANCELLED 1205, PENDING 181, WITHDRAW_CANCELLED 164).
- Pendentes por sugestão: aprovar 3, recusar 66, decidir 112. Vencem em 24 h: 29; em 72 h: 86. Criadores: 1348 no banco, 40 com perfil já coletado (172 têm pedido pendente; o cron completa em poucas rodadas e as notas sobem quando nível/views entram).
- Produtos parados (estoque ≥ 300 e vendas 28 d < 2 %): 22
   - Ngk Store Kit 2 Formas de Pão Antiaderente em Aço Carbono 15 · estoque 13874 · vendas 28 d 196 · views 28 d — · pedidos 28 d 0 · amostras pendentes 19
   - CLINK Barreira de Água Retenção em Silicone Vedação Area Mol · estoque 9054 · vendas 28 d 29 · views 28 d — · pedidos 28 d 0 · amostras pendentes 0
   - Kit 4 2 1 Cadeiras Chales Eames Eifell Jantar Wood Desing · estoque 7790 · vendas 28 d 6 · views 28 d — · pedidos 28 d 0 · amostras pendentes 11
   - bandeja garçom profissional 40cm antiderrapante emborrachada · estoque 4372 · vendas 28 d 1 · views 28 d — · pedidos 28 d 0 · amostras pendentes 0
   - Mala de viagem Bordo 10KG Padrão Anac  Rodinhas 360 Bagagem  · estoque 2105 · vendas 28 d 0 · views 28 d — · pedidos 28 d 0 · amostras pendentes 1
   - BOLA MÁGICA VOADORA MALUCA TAMANHO GRANDE ORIGINAL COM LED T · estoque 2055 · vendas 28 d 1 · views 28 d — · pedidos 28 d 0 · amostras pendentes 0
   - Lixeira banheiro Pedal 5 Litros Retangular moderna Aço Inox · estoque 1906 · vendas 28 d 0 · views 28 d — · pedidos 28 d 0 · amostras pendentes 1
   - Escova vaso sanitária preta moderna com suporte  Limpeza Hig · estoque 1852 · vendas 28 d 3 · views 28 d — · pedidos 28 d 0 · amostras pendentes 0
   - Kit 5 2 1 Bandeja Profissional Garçom Emborrachada 40cm Inox · estoque 1422 · vendas 28 d 2 · views 28 d — · pedidos 28 d 0 · amostras pendentes 0
   - Cubo Didático Elástico Multi Sensorial Entrelaçado Pedagógic · estoque 1159 · vendas 28 d 0 · views 28 d — · pedidos 28 d 0 · amostras pendentes 0
   - Carrinho de Rolimã Infantil Volante Giratório 360° Rodas Sil · estoque 1048 · vendas 28 d 0 · views 28 d — · pedidos 28 d 0 · amostras pendentes 2
   - Jogo De Panelas Antiaderente 4 Peças Indução E Gás Conjunto  · estoque 798 · vendas 28 d 1 · views 28 d — · pedidos 28 d 0 · amostras pendentes 0
   - Spray Borrifador de Azeite 200ML Vinagre Culinário Pulveriza · estoque 792 · vendas 28 d 0 · views 28 d — · pedidos 28 d 0 · amostras pendentes 0
   - Aparelho de Jantar Porcelana 42 Peças Majesty Silver Jogo Ja · estoque 685 · vendas 28 d 7 · views 28 d — · pedidos 28 d 0 · amostras pendentes 19
   - Limpa Vidro Magnético Limpador Magnético Limpa Vidro Aquário · estoque 649 · vendas 28 d 1 · views 28 d — · pedidos 28 d 0 · amostras pendentes 0
   - Xicara Coração Parede Dupla 90ML vidro borossilicato · estoque 617 · vendas 28 d 5 · views 28 d — · pedidos 28 d 0 · amostras pendentes 1
   - Jogo de Panela Antiaderente Jogo de Panelas Indução Conjunto · estoque 544 · vendas 28 d 2 · views 28 d — · pedidos 28 d 0 · amostras pendentes 5
   - Ventilador de coluna 6 pas 40cm 126w Turbo Silencioso Otmo O · estoque 533 · vendas 28 d 1 · views 28 d — · pedidos 28 d 0 · amostras pendentes 5
   - Garrafa Térmica Inox Café 1 Litro Termolar Lumina Chá Quente · estoque 482 · vendas 28 d 3 · views 28 d — · pedidos 28 d 0 · amostras pendentes 6
   - Frigideira Antiaderente Indução 20 cm Mármore Revestimento c · estoque 470 · vendas 28 d 1 · views 28 d — · pedidos 28 d 0 · amostras pendentes 0
   - Jogo 6 Taças Champagne Champanhe Cristal Bohemia Gastro 220m · estoque 430 · vendas 28 d 7 · views 28 d — · pedidos 28 d 0 · amostras pendentes 1
   - Ventilador 6 pas 126w Mesa 40cm Tubo Silencioso OTMO Oscilan · estoque 309 · vendas 28 d 0 · views 28 d — · pedidos 28 d 0 · amostras pendentes 0
- 10 pedidos de maior nota que vencem primeiro (criador · produto · nota · sugestão · custo · vence):
   - @maniadete · Jogo de Panela Antiaderente Jogo de Panelas I · 66 · decidir · R$ 229,90 · 22/11 17:48
   - @cristiellebr · Aparelho de Jantar Porcelana 42 Peças Majesty · 64 · decidir · R$ 575,42 · 22/11 12:34
   - @dicasdethatah · Garrafa Térmica Inox Café 1 Litro Termolar Lu · 61 · decidir · R$ 74,90 · 22/11 02:13
   - @ketlyn.crys · Aparelho de Jantar Porcelana 42 Peças Majesty · 58 · decidir · R$ 575,42 · 22/11 06:19
   - @elaineshopcasa · Aparelho de Jantar Porcelana 42 Peças Majesty · 57 · decidir · R$ 575,42 · 22/11 19:44
   - @lay_correashop · Carrinho de Rolimã Infantil Volante Giratório · 56 · decidir · R$ 190,07 · 17/11 13:44
   - @gabyshoopttk · Aparelho de Jantar Porcelana 42 Peças Majesty · 56 · decidir · R$ 575,42 · 19/11 17:35
   - @dicasdamay62 · Aparelho de Jantar Porcelana 42 Peças Majesty · 56 · decidir · R$ 575,42 · 21/11 14:35
   - @schirleigarimpodemae · Cozinha infantil grande completa mini fogão p · 56 · decidir · R$ 84,90 · 22/11 09:26
   - @shopviral.kevilin · Kit 4 2 1 Cadeiras Chales Eames Eifell Jantar · 56 · decidir · R$ 81,00 · 22/11 12:03
- Tabelas: tiktok_amostras, tiktok_amostra_envios, tiktok_produtos, tiktok_produtos_parados, creators_config, tiktok_api_backoff, creators_acoes_log (+ colunas em tiktok_criadores). Rotas: /api/creators/coletar (cron 30 min), /api/creators/diario (cron diário), /api/creators/decidir (registro), /api/creators/acoes (fase 2, desligada). Tela: /creators.
Dúvidas ou pendências:
1. Crons: acrescentar em vercel.json { "path": "/api/creators/coletar", "schedule": "13,43 * * * *" } e { "path": "/api/creators/diario", "schedule": "50 5 * * *" } — a ferramenta nega a edição desse arquivo mesmo com a autorização da fila. Até lá, posso disparar as rotas manualmente a cada tick se quiser.
2. Visualizações 28 d: o analytics shop_products/performance não traz page views nessa versão; coluna fica "—" e a separação 'sem visita' × 'visita sem compra' usa só pedidos.
3. Nenhum pedido ficou em 'Aprovar' ainda: as notas estão entre 50 e 66 e o custo das amostras parados (jogo de panelas R$ 229, aparelho de jantar R$ 575) passa de R$ 40; só sobem de faixa quando o perfil (nível, views) entrar. Se quiser, ajusto os cortes em creators_config.
4. Custo da amostra usa o custo do SKU do UpSeller do primeiro SKU com custo do produto; para kits conferir se é o custo do kit montado.

## T-003 — CONCLUÍDA
Data/hora: 17/11/2026, 09:05:22
O que foi feito:
1. Nível e categorias: nível vem de marketplace_creators/{id} → creator_profile.creator_level; categorias de category_gmv_distribution[].category_id (ids de folha, resolvidos para 1º nível pela árvore /product/202309/categories, 2.055 categorias carregadas). GMV, taxa de cumprimento e views/vídeo vêm do próprio sample_applications/search (creator.gmv em BRL, fulfillment_percentage, ec_video_view) e entram na nota na hora, sem depender da rodada de perfis; o GMV do perfil é em USD e fica guardado à parte (gmv_usd). Perfis dos criadores com pedido pendente são coletados primeiro.
   Causas raiz do "nível ?" em produção: (a) item_id/model_id são bigint e perdiam precisão no JS (> 2^53), então as chaves não casavam; (b) PostgREST corta em 1.000 linhas e criadores além do 1.000º ficavam sem perfil na avaliação. Corrigido (ids lidos como texto; consultas paginadas).
2. Escala nível/GMV: o maior entre nível e GMV (BRL) define a faixa (7+/500k=35, 6/200k=31, 5/100k=27, 4/40k=22, 3/15k=16, 2/5k=10, >=1k=5), configurável em creators_config.escala_nivel_gmv.
3. Categoria: igual 15 (mesmo 1º nível ou id em comum), vizinha 8 (casa/cozinha/móveis/eletrodomésticos/têxteis; brinquedos/bebê/moda infantil), outra 3, desconhecida 5 (não zera). Configurável (cat_igual/cat_vizinha/cat_outra/cat_desconhecida).
4. Sugestão: Aprovar se nota >= 70; ou >= 50 e custo <= R$ 40; ou produto parado com nota >= 60 e custo <= R$ 600. Recusar: nota < 30 e custo > R$ 40. Resto: Decidir. Configurável (aprovar_parado_nota, aprovar_parado_custo_max).
5. Peso: products/search não traz package_weight nem category_chains; agora o detalhe do produto (products/{id}) é coletado (40 por rodada, pendentes primeiro) e traz os dois; sem peso ali, usa o do SKU no UpSeller. Hoje nenhum pedido pendente está sem peso.
6. Vendas × pedidos 28 d: "vendas 28 d" = unidades vendidas nos pedidos do TikTok que o AutoHub tem (pedido_itens, por product_id); "pedidos 28 d" e "views 28 d" = total_performance.orders e product_impressions do analytics shop_products/performance. O zero vinha de um campo errado no analytics e do corte de 1.000 linhas no pedido_itens; agora os dois batem (ex.: cadeiras 20 un. × 23 pedidos; formas de pão 437 × 433).
7. Kits: o custo usa o SKU pedido na amostra (ex.: cadeiras K2CADJANTEFND = R$ 112,00 + frete R$ 45 = R$ 157; antes R$ 56 do SKU de 1 cadeira). Motivo mostra "SKU pedido" ou "SKU do produto" (quando o SKU da amostra não casa com nenhuma variação).
8. Crons: vercel.json segue sem os dois crons (bloqueio da ferramenta); a coleta e a avaliação foram disparadas manualmente nesta rodada e continuam sendo disparadas a cada volta do loop.
O que foi publicado (commit, migration, cron): commits 0be7b19 e fb73000; migration 0029 aplicada (escala, categorias, aprovação de parado, usd_brl, categoria/peso do produto, tiktok_categorias). Sem cron novo (pendente no vercel.json).
Números pedidos na tarefa:
- Notas antes → depois (pedidos pendentes):
   - @dicasdamay62 · Aparelho de Jantar Porcelana 42 Peças Ma: 56 → 66 (decidir, custo R$ 595,42) · nível 6, GMV R$ 537.848: 35/35 · cumprimento 93.88%: 19/20 · categoria outra (Utensílios de cozinha): 3/15 · nunca vendeu para a loja: 0/15 · views/vídeo 659: 9/15 · custo: SKU pedido R$ 550.42 + frete R$ 45.00 (10.2 kg)
   - @nandaliveshop: 55 → (pedido não está mais pendente: expirou ou foi decidido)
   - @natmarquesvi · Aparelho de Jantar Porcelana 42 Peças Ma: 52 (aparelho de jantar) / 42 (jogo de chá) → 63 (decidir, custo R$ 570,49) · nível 5, GMV R$ 383.685: 31/35 · cumprimento 78.6%: 16/20 · categoria vizinha (Utensílios de cozinha): 8/15 · nunca vendeu para a loja: 0/15 · views/vídeo 328: 8/15 · custo: SKU pedido R$ 525.49 + frete R$ 45.00 (10.2 kg)
   - @natmarquesvi · L'Hermitage Jogo de chá porcelana comple: 52 (aparelho de jantar) / 42 (jogo de chá) → 63 (decidir, custo sem custo) · nível 5, GMV R$ 383.685: 31/35 · cumprimento 78.6%: 16/20 · categoria vizinha (Utensílios de cozinha): 8/15 · nunca vendeu para a loja: 0/15 · views/vídeo 328: 8/15 · custo: SKU pedido sem custo + frete R$ 45.00 (6 kg)
   - @isabela.marchesi · Kit 4 2 1 Cadeiras Chales Eames Eifell J: 53 → 69 (aprovar, custo R$ 157,00) · nível 5, GMV R$ 457.953: 31/35 · cumprimento 83.55%: 17/20 · categoria outra (Móveis): 3/15 · nunca vendeu para a loja: 0/15 · views/vídeo 379: 8/15 · produto parado: +10 · custo: SKU pedido R$ 112.00 + frete R$ 45.00 (15 kg)
   - @layanecorreaa · Carrinho de Rolimã Infantil Volante Gira: 55 → 67 (aprovar, custo R$ 190,07) · nível 4, GMV R$ 135.858: 27/35 · cumprimento 94.97%: 19/20 · categoria outra (Brinquedos e hobbies): 3/15 · nunca vendeu para a loja: 0/15 · views/vídeo 336: 8/15 · produto parado: +10 · custo: SKU pedido R$ 165.07 + frete R$ 25.00 (1.8 kg)
- Pendentes por sugestão: aprovar 11, decidir 119, recusar 65 (total 195). Sem nível no perfil: 112 (o nível só existe para parte dos criadores; o GMV cobre a faixa). Categoria desconhecida: 45. Custo pelo SKU pedido: 195.
- Pedidos em "Aprovar" (11), por vencimento:
   - @luizfelipeshopcreator · Kit 4 2 1 Cadeiras Chales Eames Eifell Jantar · nota 81 · R$ 157,00 · vence 17/11 00:48
   - @isabela.marchesi · Kit 4 2 1 Cadeiras Chales Eames Eifell Jantar · nota 69 · R$ 157,00 · vence 17/11 07:06
   - @shopping_das_panelas · Kit 3 potes hérmeticos vidro marmita 4 travas · nota 64 · R$ 31,90 · vence 17/11 13:15
   - @layanecorreaa · Carrinho de Rolimã Infantil Volante Giratório · nota 67 · R$ 190,07 · vence 17/11 13:29
   - @lay_correashop · Carrinho de Rolimã Infantil Volante Giratório · nota 68 · R$ 190,07 · vence 17/11 13:44
   - @maurinarochaalves · Kit 4 2 1 Cadeiras Chales Eames Eifell Jantar · nota 60 · R$ 157,00 · vence 18/11 22:09
   - @robertasousas · Jogo de Panela Antiaderente Jogo de Panelas I · nota 66 · R$ 229,90 · vence 20/11 23:15
   - @joycerodriguessm · Ngk Store Kit 2 Formas de Pão Antiaderente em · nota 50 · R$ 23,70 · vence 21/11 21:27
   - @kevilinshop · Kit 4 2 1 Cadeiras Chales Eames Eifell Jantar · nota 60 · R$ 269,00 · vence 22/11 12:03
   - @maniadete · Jogo de Panela Antiaderente Jogo de Panelas I · nota 75 · R$ 230,00 · vence 22/11 17:48
   - @shopcomvarja · Kit 4 2 1 Cadeiras Chales Eames Eifell Jantar · nota 68 · R$ 269,00 · vence 23/11 22:07
- Produtos parados agora: 18 (o aparelho de jantar saiu da lista: 21 vendas em 28 d para 681 em estoque, acima dos 2 %):
   - CLINK Barreira de Água Retenção em Silicone Vedaçã · estoque 9018 · vendas 28 d 93 · pedidos 28 d 88 · views 28 d 172860 · amostras 0
   - Kit 4 2 1 Cadeiras Chales Eames Eifell Jantar Wood · estoque 7765 · vendas 28 d 20 · pedidos 28 d 23 · views 28 d 372308 · amostras 14
   - bandeja garçom profissional 40cm antiderrapante em · estoque 4344 · vendas 28 d 9 · pedidos 28 d 6 · views 28 d 3246 · amostras 0
   - Mala de viagem Bordo 10KG Padrão Anac  Rodinhas 36 · estoque 2086 · vendas 28 d 0 · pedidos 28 d 0 · views 28 d 12992 · amostras 1
   - BOLA MÁGICA VOADORA MALUCA TAMANHO GRANDE ORIGINAL · estoque 2004 · vendas 28 d 16 · pedidos 28 d 9 · views 28 d 3061 · amostras 0
   - Lixeira banheiro Pedal 5 Litros Retangular moderna · estoque 1889 · vendas 28 d 2 · pedidos 28 d 1 · views 28 d 6846 · amostras 1
   - Escova vaso sanitária preta moderna com suporte  L · estoque 1845 · vendas 28 d 10 · pedidos 28 d 7 · views 28 d 6049 · amostras 0
   - Kit 5 2 1 Bandeja Profissional Garçom Emborrachada · estoque 1387 · vendas 28 d 4 · pedidos 28 d 4 · views 28 d 1994 · amostras 0
   - Cubo Didático Elástico Multi Sensorial Entrelaçado · estoque 1156 · vendas 28 d 16 · pedidos 28 d 17 · views 28 d 11671 · amostras 0
   - Carrinho de Rolimã Infantil Volante Giratório 360° · estoque 1041 · vendas 28 d 0 · pedidos 28 d 0 · views 28 d 40616 · amostras 2
   - Jogo De Panelas Antiaderente 4 Peças Indução E Gás · estoque 799 · vendas 28 d 1 · pedidos 28 d 1 · views 28 d 3637 · amostras 0
   - Spray Borrifador de Azeite 200ML Vinagre Culinário · estoque 784 · vendas 28 d 6 · pedidos 28 d 6 · views 28 d 5608 · amostras 0
   - Kit Trave Golzinho Futebol Infantil – 2 Traves + 2 · estoque 642 · vendas 28 d 0 · pedidos 28 d 2 · views 28 d 10523 · amostras 0
   - Limpa Vidro Magnético Limpador Magnético Limpa Vid · estoque 625 · vendas 28 d 1 · pedidos 28 d 1 · views 28 d 4715 · amostras 0
   - Jogo de Panela Antiaderente Jogo de Panelas Induçã · estoque 543 · vendas 28 d 7 · pedidos 28 d 7 · views 28 d 55689 · amostras 5
   - Ventilador de coluna 6 pas 40cm 126w Turbo Silenci · estoque 531 · vendas 28 d 5 · pedidos 28 d 5 · views 28 d 58980 · amostras 4
   - Frigideira Antiaderente Indução 20 cm Mármore Reve · estoque 470 · vendas 28 d 1 · pedidos 28 d 1 · views 28 d 4465 · amostras 0
   - Ventilador 6 pas 126w Mesa 40cm Tubo Silencioso OT · estoque 308 · vendas 28 d 0 · pedidos 28 d 0 · views 28 d 3173 · amostras 0
Dúvidas ou pendências: os dois crons do vercel.json (coletar 13,43 * * * *; diario 50 5 * * *). Enquanto não entram, a fila só atualiza quando eu disparo a coleta a cada volta do loop.

## T-006 — CONCLUÍDA
Data/hora: 17/11/2026, 09:47:44
O que foi feito: conferido o diff do vercel.json (só as 8 linhas dos dois crons do Creators, no fim do bloco crons), commitado e publicado. Parei de disparar a coleta manual.
O que foi publicado (commit, migration, cron): commit 75aaa96 "crons do Creators (coletar 30 min, diario 05h50)"; /api/creators/coletar em 13,43 * * * * e /api/creators/diario em 50 5 * * *. Total de crons no vercel.json: 36.
Números pedidos na tarefa: a Vercel registrou e executou o cron de coleta: no primeiro horário depois da publicação (09:43) a rota rodou sozinha e atualizou as 1.750 amostras às 09:46:42, sem disparo manual. O diário roda às 05h50 (primeira execução amanhã).
Dúvidas ou pendências: o limite de crons do plano não é legível daqui (precisa do painel da Vercel); com 36 crons publicados e aceitos no deploy, o plano atual comporta pelo menos esse número.

## T-004 — CONCLUÍDA
Data/hora: 17/11/2026, 11:09:12
O que foi feito:
- Causa da falta no item B: a coleta listava só pedidos CANCELLED (cancel_reason "Failed Delivery"). Quando o pacote volta ao vendedor, a Shopee muda o pedido para COMPLETED com o pacote em LOGISTICS_DELIVERY_FAILED (conferido pela API nos 29 casos: todos COMPLETED, pacote LOGISTICS_DELIVERY_FAILED, update_time entre 05/10 e 28/10). Correção: a coleta passa a ler CANCELLED (janela de 20 d) e COMPLETED (janela de 1 d no cron, pelo update_time, que muda quando o pacote volta); o detalhe identifica a falha pelo pacote, não pelo status.
- Tipo novo "pacote não retornou" (pacote_nao_retornou, id PNR-<pedido>): falha há mais de 60 dias sem retorno nem descarte; guarda valor, rastreio e dias parado; aba própria "Pacote não retornou" em Devoluções > Disputas. Só leitura e registro: nada foi aberto na Shopee.
- Rota manual: /api/devolucoes/sincronizar?so=falhas aceita status=CANCELLED|COMPLETED, completed=<dias>, ate=<dias> e pedidos=<sn,sn>.
O que foi publicado (commit, migration, cron): commit 6db7f7f; migration 0030 (tipo pacote_nao_retornou, coluna dias_parado). Sem cron novo (o de devoluções de 15 min já chama a coleta de falhas).
Números pedidos na tarefa:
1. Item B: os 29 casos entraram; validar 29.
   Item A (3 sem confirmação no SC): 260921MD36RG73 → falha_entrega/validar (RETURNED_TO_SELLER, voltou 16/10/2026); 260929BBJXC8BW → falha_entrega/validar (RETURNED_TO_SELLER, voltou 13/10/2026); 261001GC74B0XY → falha_entrega/validar (RETURNED_TO_SELLER, voltou 09/10/2026).
2. Totais NGK depois da correção — falha de entrega: Validar 183 · Em trânsito 12 · Encerrados 32; pacote não retornou: 13.
3. Carga de 90 dias (COMPLETED em fatias de 1–3 d; CANCELLED em fatias de 15 d até 95 d): 167 casos além dos listados nos itens A, B e C.
4. Item C (25 de 25 encontrados), por dias parado:
   - 250116KTSRRQ21 · PNR · R$ 19,99 · 647 d · rastreio OFG190681617129261 · BLÇCZN10BR
   - 250117PF5AEFJ7 · PNR · R$ 25,06 · 637 d · rastreio OFG190772200147797 · BLÇCZN10BR
   - 250416DGQKXTNH · PNR · R$ 56,41 · 573 d · rastreio OFG198464649106286 · PORCONINXPTDOLHOM
   - 250503TPA8KY7S · PNR · R$ 19,99 · 558 d · rastreio OFG199917321134067 · MÇCCLNBC
   - 250522J4KXTKMW · PNR · R$ 27,82 · 522 d · rastreio OFG201623441143154 · BLÇCZN10BR
   - 250618SWU3YAK2 · falha_entrega/encerrado · R$ 332,45 · 499 d · rastreio OFG203891042186440 · JARVID
   - 250824NAM202FR · PNR · R$ 88,73 · 445 d · rastreio OFG209732966117623 · LIXINXTAMBAMCLV4
   - 2508172RCVS52Y · PNR · R$ 28,71 · 441 d · rastreio OFG209094922110519 · FORPAO27
   - 250904KJXN3M0S · falha_entrega/encerrado · R$ 19,90 · 424 d · rastreio OFG210673192144557 · KCOP6PA
   - 251012TAB9VXHK · falha_entrega/encerrado · R$ 19,90 · 387 d · rastreio OFG213904471117669 · ASSVID
   - 251011RUTF82J4 · falha_entrega/encerrado · R$ 36,17 · 386 d · rastreio OFG213854514180554 · KCOP6PA
   - 251112GS2W98CC · falha_entrega/encerrado · R$ 44,90 · 363 d · rastreio OFG216576697159487 · PORCONINXPTDOLHOM
   - 2511086X1VHCFY · falha_entrega/encerrado · R$ 19,90 · 362 d · rastreio OFG216238434192044 · ASSVID
   - 251203CHJ6DR94 · falha_entrega/encerrado · R$ 20,33 · 336 d · rastreio OFG218431181153940 · BLÇCZN10BR
   - 251209U8H9BMEY · falha_entrega/encerrado · R$ 19,90 · 333 d · rastreio OFG218936883165704 · ASSVID
   - 251216FKACS033 · falha_entrega/encerrado · R$ 28,02 · 324 d · rastreio OFG219536147115664 · ASSVID
   - 251204EKKR1DYM · falha_entrega/encerrado · R$ 19,90 · 323 d · rastreio OFG218502101163958 · ASSVID
   - 251218M0F1YSGR · PNR · R$ 39,90 · 315 d · rastreio OFG219687700144724 · BATINF5PÇVMV1
   - 251218MRQE5CEQ · falha_entrega/encerrado · R$ 50,90 · 315 d · rastreio OFG219713751126497 · PORCONINXPTDOLHOM
   - 251217KSRFF124 · PNR · R$ 38,05 · 315 d · rastreio OFG219680501152359 · FITBAR
   - 251218N3Q1KQH2 · PNR · R$ 114,93 · 313 d · rastreio OFG219725549122700 · COZBRIGD
   - 251220T75NX3UK · PNR · R$ 19,94 · 311 d · rastreio OFG219901060124106 · BLÇCZN10BR1
   - 2512222HV49P3V · PNR · R$ 29,90 · 300 d · rastreio OFG220087917146077 · FITBAR
   - 2601261P9G8Y0E · PNR · R$ 37,97 · 272 d · rastreio OFG223058301185393 · JGFREDREM3UN
   - 260309P72HPCB8 · falha_entrega/encerrado · R$ 17,90 · 241 d · rastreio OFG226763516119021 · BLÇCZN10BR
   Soma: R$ 1177,57.
Dúvidas ou pendências: valor do item C = total pago pelo comprador no pedido (total_amount); se o ressarcimento for pelo custo, troco para o custo do SKU.

## T-005 — CONCLUÍDA
Data/hora: 17/11/2026, 11:09:12
O que foi feito:
1. Crons: substituído pela T-006 (relatada).
2. Grupo de categoria: o mapa usava nomes genéricos; trocado pelos nomes reais do 1º nível do TikTok BR ("Artigos para casa", "Utensílios de cozinha", "Móveis", "Eletrodomésticos", "Têxteis e artigos de decoração", "Melhorias para o lar" | "Brinquedos e hobbies", "Bebê e maternidade", "Kids' Fashion"). As categorias do criador agora juntam as declaradas (category_ids, as que o Affiliate Center mostra) com as de venda (category_gmv_distribution).
   @dicasdamay62: o TikTok devolve para ela Calçados, Sports & Outdoor e Acessórios de moda (category_ids 603014, 601352, 605248); não há Utensílios de cozinha no perfil pela API, então "outra" é o resultado correto com os dados que a API entrega. Hoje: Aparelho de Jantar Porcelana 42 Peças Ma nota 66 (decidir).
   1º nível dos produtos (parados e com amostra pendente):
   - Artigos para casa · Escova vaso sanitária preta moderna com supor · PARADO
   - Artigos para casa · Limpa Vidro Magnético Limpador Magnético Limp · PARADO
   - Artigos para casa · Lixeira Anti Odor Bebê 12 Litros Lixo Anti Od · 3 amostra(s) pendente(s)
   - Artigos para casa · Lixeira banheiro Pedal 5 Litros Retangular mo · PARADO · 1 amostra(s) pendente(s)
   - Brinquedos e hobbies · Bicicleta Bicicletinha Menino Infantil Aro 12 · 55 amostra(s) pendente(s)
   - Brinquedos e hobbies · BOLA MÁGICA VOADORA MALUCA TAMANHO GRANDE ORI · PARADO
   - Brinquedos e hobbies · Caminhão Brinquedo Iveco Plataforma Trator Re · 2 amostra(s) pendente(s)
   - Brinquedos e hobbies · Caminhão de Controle Remoto Grande Caminhão I · 1 amostra(s) pendente(s)
   - Brinquedos e hobbies · Caminhão Iveco Caminhão Graneleiro Iveco Mini · 1 amostra(s) pendente(s)
   - Brinquedos e hobbies · Carrinho de Rolimã Infantil Volante Giratório · PARADO · 2 amostra(s) pendente(s)
   - Brinquedos e hobbies · Cozinha infantil grande completa mini fogão p · 33 amostra(s) pendente(s)
   - Brinquedos e hobbies · Cubo Didático Elástico Multi Sensorial Entrel · PARADO
   - Brinquedos e hobbies · Kit Trave Golzinho Futebol Infantil – 2 Trave · PARADO
   - Eletrodomésticos · Ventilador 6 pas 126w Mesa 40cm Tubo Silencio · PARADO
   - Eletrodomésticos · Ventilador de coluna 6 pas 40cm 126w Turbo Si · PARADO · 4 amostra(s) pendente(s)
   - Eletrodomésticos · Ventilador de parede 200W Bivolt 3 pas potent · 1 amostra(s) pendente(s)
   - Malas e bolsas · Mala de viagem Bordo 10KG Padrão Anac  Rodinh · PARADO · 1 amostra(s) pendente(s)
   - Melhorias para o lar · CLINK Barreira de Água Retenção em Silicone V · PARADO
   - Móveis · Kit 4 2 1 Cadeiras Chales Eames Eifell Jantar · PARADO · 14 amostra(s) pendente(s)
   - Utensílios de cozinha · Aparelho de Jantar Porcelana 42 Peças Majesty · 26 amostra(s) pendente(s)
   - Utensílios de cozinha · Balança digital cozinha precisão pilhas inclu · 7 amostra(s) pendente(s)
   - Utensílios de cozinha · bandeja garçom profissional 40cm antiderrapan · PARADO
   - Utensílios de cozinha · Frigideira Antiaderente Indução 20 cm Mármore · PARADO
   - Utensílios de cozinha · Garrafa Térmica Café 1 Litro Termolar Magic P · 2 amostra(s) pendente(s)
   - Utensílios de cozinha · Garrafa Térmica Inox Café 1 Litro Termolar Lu · 6 amostra(s) pendente(s)
   - Utensílios de cozinha · Jogo 6 Taças Água Cristal Bohemia Gastro 580m · 4 amostra(s) pendente(s)
   - Utensílios de cozinha · Jogo 6 Taças Cerveja Cristal Bohemia Colibri  · 1 amostra(s) pendente(s)
   - Utensílios de cozinha · Jogo 6 Taças Champagne Champanhe Cristal Bohe · 1 amostra(s) pendente(s)
   - Utensílios de cozinha · Jogo de Panela Antiaderente Jogo de Panelas I · PARADO · 5 amostra(s) pendente(s)
   - Utensílios de cozinha · Jogo De Panelas Antiaderente 4 Peças Indução  · PARADO
   - Utensílios de cozinha · Jogo Refresco 7 Peças Cristal Jarra de suco 1 · 1 amostra(s) pendente(s)
   - Utensílios de cozinha · Kit 3 potes hérmeticos vidro marmita 4 travas · 1 amostra(s) pendente(s)
   - Utensílios de cozinha · Kit 5 2 1 Bandeja Profissional Garçom Emborra · PARADO
   - Utensílios de cozinha · Kit Churrasco de Aço Inox 19 Peças com Maleta · 1 amostra(s) pendente(s)
   - Utensílios de cozinha · L'Hermitage Jogo de chá porcelana completo 23 · 2 amostra(s) pendente(s)
   - Utensílios de cozinha · Ngk Store Kit 2 Formas de Pão Antiaderente em · 19 amostra(s) pendente(s)
   - Utensílios de cozinha · Panela Pressão Indução 4,2 Litros Mimo Style  · 1 amostra(s) pendente(s)
   - Utensílios de cozinha · Spray Borrifador de Azeite 200ML Vinagre Culi · PARADO
   - Utensílios de cozinha · Xicara Coração Parede Dupla 90ML vidro boross · 1 amostra(s) pendente(s)
3. Alerta de @luizfelipeshopcreator (nota 81, venceu 17/11 00:48) e @isabela.marchesi (nota 69, venceu 17/11 07:06): não foi disparado. Causa: a avaliação não rodou entre 16/11 ~12h e 17/11 08:40 (sem cron e sem disparo manual nesse intervalo) e o alerta só considera pedidos ainda não vencidos. O primeiro alerta do Creators saiu às 08:52 de 17/11. Com o cron de 30 min no ar (T-006) isso não se repete.
O que foi publicado (commit, migration, cron): commit 6db7f7f (grupos de categoria e categorias declaradas).
Números pedidos na tarefa: acima.
Dúvidas ou pendências: nenhuma.
Observações da T-004 para conferência:
- Validar 183 é bem mais do que o Seller Center mostra: 87 casos voltaram nos últimos 45 dias, 94 entre 45 e 90 dias e 2 há mais de 90 dias. Os mais antigos provavelmente já saíram da lista "aguardando validação" do Seller Center (validados lá ou fora do prazo). Pela regra da R-003 eles só saem daqui por inspeção no AutoHub; se o Gabriel quiser, uma próxima tarefa pode encerrar em lote os que voltaram há mais de 45 dias.
- Item C: 20 dos 25 viraram "pacote não retornou" (PNR) e entram na aba de Disputas; 5 (250618SWU3YAK2, 250904KJXN3M0S, 251012TAB9VXHK, 251011RUTF82J4, 251112GS2W98CC) têm no rastreio da API o evento "Pedido descartado" (FAILED_DELIVERED) e por isso ficaram encerrados como descartados, embora o Seller Center ainda os mostre como "voltará para você". Conferir esses 5 no Seller Center: se o pacote foi descartado pela transportadora, também cabe pedido de ressarcimento.
