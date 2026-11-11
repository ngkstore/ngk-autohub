@AGENTS.md

## Regras do negócio (NGK Store)

### Financeiro Shopee
- Custo por pedido vem do escrow (get_escrow_detail), guardado bruto em `pedido_escrow` e
  aberto uma linha por campo em `custos_pedido` (função `custos_pedido_linhas`). A soma das
  linhas com `soma = true` tem de dar `escrow_amount` (conferência 1, resíduo <= R$ 0,01).
- Receita do pedido = `buyer_payment_info.merchant_subtotal` (não `order_selling_price`).
  Cupom da Shopee, moedas, promoções de pagamento e seguro do comprador ficam FORA do repasse.
- `order_selling_price = 0` NÃO significa devolução total quando `escrow_amount > 0` e não há
  `seller_return_refund` (jul–nov/2026 a API manda 0 em pedidos normais): usar merchant_subtotal.
  Devolução total = selling 0 E repasse 0 (sem ressarcimento do desconto da plataforma).
- `rule_id` da taxa de serviço muda a cada período; a tabela `escrow_regras_servico` mapeia
  (transação ≈ 2 % da venda, por item ≈ 11–15 %). Regra nova aparece em "campos desconhecidos"
  da conferência 1: identificar pela proporção e inserir na tabela, depois regerar custos_pedido.
- A carteira NÃO mostra comissão nem afiliado: os dois já vêm dentro da renda do pedido.
- Afiliado aparece em dois campos: `order_ams_commission_fee` e a linha
  "Taxa de Serviço Afiliados do Vendedor" dentro de `net_service_fee_info_list`
  (~14% da comissão). Nunca tratar o total da taxa de serviço como "taxa Shopee".
- Os sub-itens de `net_service_fee_info_list` já vêm líquidos do abatimento
  (`service_fee_offset`); não somar o abatimento de novo.
- A fatura mensal de afiliados é extrato (deduzida do recebível do pedido).
  Nunca somar como custo; usar só para conferência (`afiliado_fatura`).
- Carteira: classificar por `transaction_type` (tabela `carteira_categorias` +
  `classificar_carteira()`), nunca pelo texto. Texto só subclassifica
  `ADJUSTMENT_CENTER_DEDUCT` (DIFAL, volumoso, peso cubado, crédito a maior) e decide
  `SPM_DEDUCT_DIRECT` (empréstimo × ads × desconhecido).
- Empréstimo para Vendedores: entrada e parcelas fora do resultado; só juros são custo.
- Saques e Pix enviados são movimentação, não custo.
- Comissão CNPJ: até 28/02/2026 20%+R$4 com teto R$104; 01/03 a 30/09/2026
  20%+R$4 (<R$80), 14%+R$16/20/26; desde 01/10/2026 a 1ª faixa é 20%+R$4,50.
  Fonte única: função SQL `shopee_taxa_esperada_item(preco, dia)`.
- Valores de referência mês a mês da Shopee: tabela `carteira_referencia`
  (conferência 3, tolerância R$ 0,05).
- `get_wallet_transaction_list` limita a janela a 14 dias; uma janela pode passar de
  20 mil transações (NGK, jan/2026) — o importador lê até 500 páginas.

### Segurança
- Toda rota da lista `ROTAS_CRON` do `middleware.ts` chama `autorizar()` (`lib/autorizacao.ts`):
  Bearer `CRON_SECRET` OU usuário com acesso a cada loja pedida; operação em lote só cron/admin.
- Sem `CRON_SECRET` no ambiente o middleware responde 503 (nunca libera).
- Nada de rota debug/probe sem exigir admin.
- Nunca ler nem imprimir `.env.local`; para saber se uma variável existe, perguntar.

### Banco
- Baseline do schema em `supabase/migrations/0000_baseline.sql` (gerado dos catálogos em 09/11/2026);
  os SQL antigos ficaram em `supabase/legado/` só para consulta.
- Mudança de schema = arquivo novo `supabase/migrations/NNNN_descricao.sql`, idempotente
  (`create or replace`, `if not exists`), aplicado no painel ou pela Management API.
  `delete`/`update` em massa só com aprovação do Gabriel; em lotes quando passar de ~100 s.
- RLS ligado em todas as tabelas sem policies (`0001_rls.sql`): o servidor usa a service role
  (`lib/supabase.ts`, só servidor); anon/authenticated não leem nada nem chamam RPC.
- Tabelas derivadas (`custos_pedido`, `financas_resumo_diario`) podem ser regeradas;
  tabelas de origem (`pedidos`, `carteira_transacoes`, `pedido_escrow`) não se apagam.

### Robôs de atendimento
- Nunca passar contato fora da Shopee (WhatsApp, telefone, e-mail, links).
- Defeito/arrependimento: orientar Devolução/Reembolso pelo app.
- Baixa confiança ou precisa_humano → Telegram para aprovação.
- Nunca encerrar sessão de chat do TikTok (flag `tiktok_encerrar_sessao` fica desligada).
- Modelo de IA em `lib/ia.ts` (`MODELO_IA`); troca de modelo só com aprovação.
