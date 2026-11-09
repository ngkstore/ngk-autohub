# NGK AutoHub

Painel e automações das lojas da NGK Store (e lojas parceiras) na Shopee e no TikTok Shop.
Next.js 16 (App Router) + Supabase (Postgres) + Vercel (deploy e crons) + Claude (IA do atendimento).

## Módulos

| Área | O que faz | Onde |
|---|---|---|
| Pedidos | Importa pedidos da Shopee em lotes, enriquece detalhes e o escrow (taxas, afiliado, frete), acompanha status e região | `lib/shopee/sincronizarPedidos.ts`, `enriquecerEscrow.ts`, `/api/shopee/pedidos/*` |
| Finanças | Balanço (DRE), conciliação carteira × pedidos, aging, previsão de caixa, produtos e margem, impostos, **custos linha a linha** (3 camadas) | `app/financas/`, `lib/shopee/carteira.ts`, `escrowBruto.ts`, `supabase/custos_camadas*.sql` |
| Auditoria de taxas | Compara a comissão cobrada com a tabela vigente por data | `app/auditoria/`, `supabase/auditoria_taxa_out_2026.sql` |
| Ads (GMV Max) | Coleta diária, recomendações de orçamento, reforço automático, edição real na Shopee | `lib/shopee/ads*.ts`, `/api/shopee/ads/*` |
| Afiliados (AMS) | Segundo app Shopee só com o módulo de afiliados; coleta diária de desempenho | `lib/shopee/ams.ts`, `afiliadosColetor.ts` |
| Atendimento | Robô de chat (Shopee e TikTok) e de avaliações, com aprovação humana pelo Telegram | `lib/chat/`, `lib/shopee/responderChats.ts`, `lib/tiktok/`, `app/atendimento/` |
| Saúde da conta | Coletor diário das métricas de Account Health + alerta no Telegram | `lib/shopee/saudeConta.ts` |
| TikTok Shop | Pedidos, extratos financeiros, chat | `lib/tiktok/`, `/api/tiktok/*` |
| Contas | Multi-cliente: cada dono vê só as lojas da própria conta | `lib/conta.ts`, `middleware.ts` |

## Variáveis de ambiente (só os nomes)

Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
Shopee: `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, `SHOPEE_API_BASE_URL`, `NEXT_PUBLIC_SHOPEE_REDIRECT_URL`,
`SHOPEE_AMS_PARTNER_ID`, `SHOPEE_AMS_PARTNER_KEY` (app de afiliados).
TikTok: `TIKTOK_APP_KEY`, `TIKTOK_APP_SECRET`, `TIKTOK_SERVICE_ID`, `TIKTOK_API_BASE_URL`.
IA: `ANTHROPIC_API_KEY`, `MODELO_IA` (opcional; padrão em `lib/ia.ts`).
Avisos: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_DESTINO`.
Acesso: `CRON_SECRET` (obrigatório: sem ele as rotas de cron respondem 503), `ALLOWED_EMAILS`, `COLETOR_SECRET`.

Nunca commitar `.env.local`.

## Como rodar

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint
npm run build
```

Os crons estão em `vercel.json` e chamam rotas em `/api/**` com `Authorization: Bearer $CRON_SECRET`.
Toda rota de cron passa por `lib/autorizacao.ts`: cron, ou usuário logado com acesso à loja; lote só admin.

## Banco de dados

O schema e as funções ficam em arquivos `.sql` em `supabase/`, idempotentes, aplicados no painel do
Supabase (ou pela Management API). Regras de negócio que o código assume estão em `CLAUDE.md`.
