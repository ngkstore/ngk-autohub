# TikTok Shop — mapa do que a API libera pro AutoHub

Levantamento feito em 29/09/2026 sobre a loja **NGKSTORE BR** (shop_id 7496227092790348702), lendo a documentação v2 completa do Partner Center (19 módulos, 362 endpoints) e **sondando ao vivo** cada módulo com o app "ngkautohub" já autorizado. Ferramentas: `GET /api/tiktok/sondar` (protegida por CRON_SECRET) e os scripts `tts-doc.mjs` / `tts-summ.mjs` no scratchpad da sessão.

## Incidente encontrado e corrigido

- O access_token do TikTok dura **7 dias** e não existia renovação. O token de 21/07 venceu em 28/07 e o sync de pedidos parou **sem alarme** por 2 meses.
- Corrigido em 29/09 (commit ce33976): `lib/tiktok/token.ts` renova na hora quando falta < 1h e o cron `/api/tiktok/token/refresh` (04:15 UTC) renova diariamente, avisando no Telegram se precisar reconectar. O refresh_token ainda era válido: renovado até 06/10 e daí em diante automático.
- Backfill: 1.500 pedidos recuperados na hora (R$ 120 mil); o buraco de 03/08–13/09 é tapado por fatias com `POST /api/tiktok/pedidos/sincronizar?desde=&ate=` (commit seguinte).

## Legenda

✅ responde com dados na conta atual · ⚠️ existe mas exige algo (parâmetro, região, aprovação) · ❌ negado por escopo (105005) · — não sondado

## 1. Vendas e operação

| Capacidade | Endpoint | Status | Observação |
| --- | --- | --- | --- |
| Lista de pedidos | `POST /order/202309/orders/search` | ✅ | já em produção (cron 10 min); ordena DESC por create_time; `create_time_ge/lt` no body |
| Detalhe do pedido | `GET /order/202507/orders?ids=` | ✅ | CPF/nome, itens, pacote, transportadora, prazos SLA |
| Composição do preço | `GET /order/202407/orders/{id}/price_detail` | ✅ | preço de lista, desconto do vendedor vs plataforma, frete (quem pagou), cupom |
| Cancelamentos | `POST /return_refund/202602/cancellations/search` | ✅ | motivo, quem pediu, status, item |
| Devoluções/reembolsos | `POST /return_refund/202602/returns/search` | ✅ | valor reembolsado, item, motivo; aprovar/rejeitar via API (`approve`/`reject`) |
| Elegibilidade pós-venda | `GET /return_refund/202602/orders/{id}/aftersale_eligibility` | — | diz se dá pra cancelar/reembolsar |
| Etiqueta / envio | módulo Fulfillment (31 endpoints) | — | ship package, documento de envio, tracking, split/combine |
| Webhooks | `GET/PUT/DELETE /event/202309/webhooks` | ✅ | **nenhum configurado**; dá pra assinar: pedido, cancelamento, devolução, produto, promoção, mensagem de criador |

## 2. Produtos e catálogo

| Capacidade | Endpoint | Status | Observação |
| --- | --- | --- | --- |
| Busca de produtos | `POST /product/202502/products/search` | ✅ | SKUs, estoque por armazém, preço, status de auditoria |
| Detalhe do produto | `GET /product/202309/products/{id}` | — | descrição, imagens, atributos |
| Diagnóstico da listagem | `GET /product/202405/products/diagnoses` | ✅ | veio vazio no produto testado (sem problemas apontados) |
| Palavras SEO sugeridas | `GET /product/202405/products/seo_words` | ✅ | vazio na BR pro produto testado |
| Título/descrição sugeridos | `GET /product/202405/products/suggestions` | — | IA do TikTok |
| Preço / estoque | `products/{id}/prices/update`, `inventory/update` | — | escrita; útil pra sincronizar estoque com a Shopee |
| Criar/editar produto | `POST /product/202309/products`, `PUT .../202509` | — | escrita completa |

## 3. Analytics (o funil que a Shopee não dá)

| Capacidade | Endpoint | Status | O que traz |
| --- | --- | --- | --- |
| Performance da loja | `GET /analytics/202609/shop/performance` | ✅ | GMV por **canal** (criador LIVE/VÍDEO, vendedor LIVE/VÍDEO, product card, busca, aba loja), pedidos, ticket, cancelamentos, visitantes, granularidade diária |
| Performance por hora | `GET /analytics/202510/shop/performance/{date}/performance_per_hour` | ✅ | últimos 30 dias, inclusive hoje: GMV, pedidos, impressões, cliques, visitantes por hora |
| Performance por produto | `GET /analytics/202605/shop_products/performance` | ✅ | por produto: impressões, cliques, CTR, carrinho, conversão, GMV, reembolsos, separado em **afiliado (live/vídeo)** e **vendedor** |
| Detalhe do produto | `GET /analytics/202509/shop_products/{id}/performance` | — | série diária |
| Por SKU | `GET /analytics/202509/shop_skus/performance` | ✅ | GMV, pedidos, unidades por variação |
| Vídeos da loja | `GET /analytics/202605/shop_videos/performance` + overview 202609 | ✅ | por vídeo: criador, views, GMV, GPM, CTR, produtos; overview semanal |
| LIVEs | `GET /analytics/202609/shop_lives/performance` + overview | ✅ | por sessão e agregado |
| Mais vendidos do mercado | `GET /analytics/202511/products|creators|videos/bestselling` | ⚠️ | top 100 do TikTok Shop BR por categoria; `time_slot` = 1D/7D/30D |
| Score da loja (SPS) | `GET /analytics/202606/shop_performances/*` | ❌ região | "not supported in region BR" |

Números reais da semana 21–27/09: GMV atribuído a vídeo de criador R$ 41 mil, LIVE de criador R$ 5,9 mil, vídeo do vendedor R$ 476, busca R$ 7 mil, aba loja R$ 2,6 mil. O TikTok da NGK é **90% afiliados**.

## 4. Finanças

| Capacidade | Endpoint | Status | O que traz |
| --- | --- | --- | --- |
| Extratos (statements) | `GET /finance/202309/statements` | ✅ | por dia: receita, taxas, frete, ajustes, valor liquidado, status do pagamento |
| Transações por extrato | `GET /finance/202501/statements/{id}/statement_transactions` | — | detalhe do que compôs cada pagamento |
| Transações por pedido | `GET /finance/202501/orders/{id}/statement_transactions` | ✅ | SKU a SKU: receita, comissão, frete, impostos, reembolso (só depois de liquidado) |
| A liquidar | `GET /finance/202507/orders/unsettled` | ✅ | 1.066 transações pendentes, R$ 67,7 mil estimados; **breakdown completo de taxas** (comissão da plataforma, comissão de afiliado, Shop Ads, frete, etc.) |
| Pagamentos ao banco | `GET /finance/202605/payments` | ✅ | id, valor, conta bancária mascarada, data |
| Saques | `GET /finance/202309/withdrawals` | ✅ | 353 saques históricos |

Isso permite no TikTok o mesmo Hub Finanças da Shopee: conciliação pedido × liquidação, DRE por canal, margem real por SKU, aging de recebíveis.

**Feito em 29/09/2026 (v1):** `supabase/tiktok_financeiro.sql` + `lib/tiktok/financeiro.ts` + cron `/api/tiktok/financeiro/sincronizar` (de hora em hora). Extratos e transações preenchem as colunas financeiras do pedido (líquido, comissão + taxa fixa, Frete Grátis, afiliado, frete, recebido) e o `/financas` passa a incluir o TikTok no DRE, recebido/a receber, conciliação de recebimento, aging e previsão. Falta: CMV/margem (precisa sincronizar produtos do TikTok e casar `seller_sku` com os custos), linha de frete no DRE, Ads do TikTok.

## 5. Afiliados (o módulo mais rico)

| Capacidade | Endpoint | Status | O que traz |
| --- | --- | --- | --- |
| Configuração da colaboração aberta | `GET/POST /affiliate_seller/2024xx/open_collaboration_settings` | ✅ | hoje: auto-add ligado, **7% de comissão** padrão |
| Colaborações abertas | `POST /affiliate_seller/202412/open_collaborations/search` + create/remove | ✅ | por produto: comissão vigente, nº de criadores com o produto na vitrine e nº que já postou |
| Criadores de cada produto | `GET /affiliate_seller/202508/open_collaborations/creator_content_details` | ✅ | quem adicionou, quantos vídeos/lives fez |
| Pedidos de afiliados | `POST /affiliate_seller/202410/orders/search` | ✅ | pedido → criador (username), conteúdo (vídeo/live), comissão estimada/paga, status de liquidação |
| Amostras | `POST .../sample_applications/search` + review | ✅ | pedidos de amostra com **GMV, seguidores e taxa de entrega do criador**; aprovar/rejeitar via API |
| Buscar criadores no marketplace | `POST /affiliate_seller/202608/marketplace_creators/search` (page_size 12 ou 20) | ✅ | GMV 30d, GMV live/vídeo, seguidores, demografia, categoria; filtros avançados |
| Perfil/performance do criador | `GET /affiliate_seller/202608/marketplace_creators/{id}` | ✅ | comissão média, GMV por categoria e por tipo de conteúdo, engajamento |
| Chat com criadores | `GET/POST /affiliate_seller/202412/conversations*` + webhook "New message" | ✅ | ler e **responder** criadores; enviar imagem |
| Convites-alvo (target collaboration) | `POST /affiliate_seller/202508/target_collaborations*` | ⚠️ | criar/atualizar OK na doc; a busca pediu um `CollaborationStatus` que a doc não mostra — resolver quando implementar |
| Cota semanal de outreach | `GET /affiliate_seller/202607/creator_outreach/quota` | ✅ | ilimitada na conta |
| Exportação "Compass" | `POST /affiliate_seller/202603/compass/offline_task` | — | relatórios offline do painel de afiliados |
| Marketplace de produtos de terceiros | `POST .../open_collaborations/products/search` | ❌ região | "unauthorized region" |

## 6. Promoções e clientes

| Capacidade | Endpoint | Status | Observação |
| --- | --- | --- | --- |
| Atividades (desconto/flash) | `POST /promotion/202309/activities/search` (page_size no body, int) + create/update/deactivate/republish | ✅ | 2 descontos em andamento, flash sales expiradas |
| Cupons | `POST /promotion/202406/coupons/search` | ✅ | só leitura; criar cupom é no Seller Center |
| Chat com compradores | módulo Customer service (15 endpoints) | ❌ 105005 | escopo "Customer Service" ainda não concedido ao app (em análise desde julho) |
| Mensagens de engajamento (remarketing) | módulo Customer engagement (7) | ❌ 105005 | idem, precisa de escopo |
| Avaliações | não existe na API | ❌ | só pelo painel (Claude in Chrome) |

## 7. O que dá pra construir (prioridade sugerida)

1. **Finanças TikTok** (espelho do /financas): statements + unsettled + payments → conciliação, DRE por canal, margem por SKU descontando comissão de afiliado. Dados prontos, só ingestão.
2. **Painel de Afiliados**: ranking de criadores por GMV/pedidos/comissão paga, produtos com e sem criadores ativos, fila de amostras com score do criador (GMV, entrega), aprovação em lote por regra, alerta de criador novo que vendeu. É onde está 90% do GMV.
3. **Analytics/funil por produto**: impressões → cliques → carrinho → pedido por produto e por canal (afiliado × orgânico), série diária, hora a hora. Base pro "Raio-X do Anúncio" que a Shopee não dá.
4. **Webhooks** de pedido/cancelamento/devolução/mensagem de criador → sincronização em tempo real em vez de cron.
5. **Devoluções**: fila com aprovar/rejeitar pela API (hoje só no painel).
6. **Sincronização de estoque/preço** Shopee ↔ TikTok (escrita de inventory/price).
7. **Chat e remarketing**: depende do escopo; pedir no Partner Center (Manage API) os escopos Customer Service e Customer Engagement.

## Linha do tempo das taxas (medida nos extratos, por data do pedido)

| Período | Comissão da plataforma | Taxa fixa por item | Frete Grátis (sfp) |
| --- | --- | --- | --- |
| lançamento → 23/09/2025 | 0% | R$ 0 | 6% |
| 24/09/2025 → 04/02/2026 | 6% | R$ 2 (abaixo de R$ 50; acima variou R$ 0/2/4) | 6% |
| 05/02/2026 → 14/07/2026 | 6% | R$ 4 | 6% |
| 15/07/2026 → hoje | 10% abaixo de R$ 50 · 6% a partir de R$ 50 | R$ 4 abaixo de R$ 50 · R$ 6 a partir de R$ 50 | 6% |

Base de cálculo: preço do item após o desconto do vendedor. Afiliado (7–8% típico) e Shop Ads de afiliado vêm por pedido no extrato. Função SQL: `tiktok_taxa_esperada_item(preco, dia)` em `supabase/tiktok_taxas.sql`. Exemplo real de 23/09/2026: item de R$ 18,90 paga R$ 1,89 + R$ 4 + R$ 1,13 = R$ 7,02 (37%) antes do afiliado.

## Regras e limites

- Autenticação: HMAC do app_secret; `shop_cipher` na query só nos endpoints de loja (os de seller/authorization recusam).
- `page_size` às vezes vai na query (orders, affiliate) e às vezes no body como int (promotion). Marketplace de criadores aceita só 12 ou 20.
- Rate limit dinâmico por app × loja; já tomamos 36009002 numa rajada de 8 chamadas. Espaçar e usar backoff.
- Analytics: dados até **ontem** (`latest_available_date`), exceto o por-hora, que inclui hoje.
- Valores monetários vêm como string; datas em unix segundos; comissão como inteiro em centésimos (700 = 7%).
