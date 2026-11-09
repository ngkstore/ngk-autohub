-- ============================================================================
-- BASELINE do schema public — gerado dos catálogos em 2026-11-09
-- (tabelas, constraints, índices, views, funções, grants, triggers; pg_cron como comentário).
-- A partir daqui toda mudança é um arquivo novo em supabase/migrations/NNNN_descricao.sql.
-- ============================================================================

-- ── Tabelas ──
create table if not exists ads_ajustes (
  id bigint not null default nextval('ads_ajustes_id_seq'::regclass),
  loja_id uuid not null,
  campaign_id bigint not null,
  item_id bigint,
  campo text not null,
  valor_antigo numeric,
  valor_novo numeric,
  reference_id text,
  simulado boolean default false,
  sucesso boolean,
  resposta jsonb,
  usuario text,
  criado_em timestamp with time zone default now(),
  constraint ads_ajustes_pkey PRIMARY KEY (id)
);

create table if not exists ads_alteracoes (
  id bigint not null default nextval('ads_alteracoes_id_seq'::regclass),
  loja_id uuid not null,
  item_id bigint,
  campaign_id bigint not null,
  data_deteccao date not null,
  campo text not null,
  valor_antigo text,
  valor_novo text,
  criado_em timestamp with time zone default now(),
  constraint ads_alteracoes_loja_id_campaign_id_data_deteccao_campo_key UNIQUE (loja_id, campaign_id, data_deteccao, campo),
  constraint ads_alteracoes_pkey PRIMARY KEY (id)
);

create table if not exists ads_campaign_config_daily (
  loja_id uuid not null,
  dia date not null,
  campaign_id bigint not null,
  item_id bigint,
  ad_type text,
  meta_roas numeric(8,2),
  orcamento numeric(12,2),
  data_inicio date,
  status text,
  bruto jsonb,
  atualizado_em timestamp with time zone default now(),
  constraint ads_campaign_config_daily_pkey PRIMARY KEY (loja_id, dia, campaign_id)
);

create table if not exists ads_diario (
  id uuid not null default gen_random_uuid(),
  loja_id uuid,
  dia date not null,
  impressoes bigint,
  cliques bigint,
  ctr numeric,
  gasto numeric(14,2),
  pedidos_direto bigint,
  pedidos_broad bigint,
  gmv_direto numeric(14,2),
  gmv_broad numeric(14,2),
  roas_direto numeric,
  roas_broad numeric,
  bruto jsonb,
  atualizado_em timestamp with time zone default now(),
  constraint ads_diario_loja_id_dia_key UNIQUE (loja_id, dia),
  constraint ads_diario_pkey PRIMARY KEY (id),
  constraint ads_diario_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES lojas(id)
);

create table if not exists ads_dias_campanha_shopee (
  dia date not null,
  nome text,
  constraint ads_dias_campanha_shopee_pkey PRIMARY KEY (dia)
);

create table if not exists ads_fator_historico (
  loja_id uuid not null,
  competencia text not null,
  fator_estimado numeric(6,4),
  fator_consolidado numeric(6,4),
  divergencia_pct numeric(6,2),
  pedidos_estimado integer,
  pedidos_consolidado integer,
  criado_em timestamp with time zone default now(),
  constraint ads_fator_historico_pkey PRIMARY KEY (loja_id, competencia)
);

create table if not exists ads_item_performance_daily (
  id bigint not null default nextval('ads_item_performance_daily_id_seq'::regclass),
  loja_id uuid not null,
  dia date not null,
  campaign_id bigint not null,
  item_id bigint not null,
  impressoes integer,
  cliques integer,
  ctr numeric(8,4),
  conversoes integer,
  cr numeric(8,4),
  pedidos integer,
  gmv numeric(12,2),
  gasto numeric(12,2),
  roas numeric(8,2),
  cpc numeric(8,2),
  escopo text,
  bruto jsonb,
  atualizado_em timestamp with time zone default now(),
  constraint ads_item_perf_uni UNIQUE (loja_id, dia, campaign_id, escopo),
  constraint ads_item_performance_daily_pkey PRIMARY KEY (id),
  constraint ads_item_performance_daily_escopo_check CHECK ((escopo = ANY (ARRAY['direto'::text, 'amplo'::text])))
);

create table if not exists ads_recomendacoes (
  id bigint not null default nextval('ads_recomendacoes_id_seq'::regclass),
  loja_id uuid not null,
  dia date not null,
  item_id bigint not null,
  campaign_id bigint,
  produto text,
  gasto_7d numeric(12,2),
  roas_shopee numeric(8,2),
  fator numeric(6,4),
  roas_real numeric(8,2),
  roas_minimo numeric(8,2),
  meta_roas numeric(8,2),
  meta_calculada numeric(8,2),
  dias_campanha integer,
  classificacao text,
  acao text,
  detalhe text,
  status text default 'pendente'::text,
  criado_em timestamp with time zone default now(),
  promo boolean default false,
  alerta_roas boolean default false,
  ctr_7d numeric(8,4),
  ctr_28d numeric(8,4),
  cr_7d numeric(8,4),
  cr_28d numeric(8,4),
  roas_28d numeric(8,2),
  gasto_medio_normal_28d numeric(12,2),
  dias_normais_28d integer,
  dias_esgotados_7d integer,
  censurado_teto boolean default false,
  orcamento_configurado numeric(12,2),
  orcamento_ideal numeric(12,2),
  estado_janela text,
  dias_restantes_janela integer,
  motivo_supressao text,
  gasto_medio_normal_7d numeric(12,2),
  degrau_avaliacao jsonb,
  meta_sugerida numeric(8,2),
  constraint ads_recomendacoes_loja_id_dia_item_id_key UNIQUE (loja_id, dia, item_id),
  constraint ads_recomendacoes_pkey PRIMARY KEY (id)
);

create table if not exists ads_reforco_avisos (
  loja_id uuid not null,
  dia date not null,
  tipo text not null,
  criado_em timestamp with time zone default now(),
  constraint ads_reforco_avisos_pkey PRIMARY KEY (loja_id, dia, tipo)
);

create table if not exists ads_reforcos (
  id bigint not null default nextval('ads_reforcos_id_seq'::regclass),
  loja_id uuid not null,
  campaign_id bigint not null,
  item_id bigint,
  dia date not null,
  orcamento_base numeric(12,2) not null,
  orcamento_atual numeric(12,2) not null,
  reforcos integer default 0,
  historico jsonb default '[]'::jsonb,
  ultimo_em timestamp with time zone default now(),
  revertido_em timestamp with time zone,
  reversao_erro text,
  constraint ads_reforcos_loja_id_campaign_id_dia_key UNIQUE (loja_id, campaign_id, dia),
  constraint ads_reforcos_pkey PRIMARY KEY (id)
);

create table if not exists ads_saldo_diario (
  loja_id uuid not null,
  dia date not null,
  saldo numeric(12,2),
  atualizado_em timestamp with time zone default now(),
  constraint ads_saldo_diario_pkey PRIMARY KEY (loja_id, dia)
);

create table if not exists afiliado_fatura (
  loja_id uuid not null,
  mes_validade text not null,
  despesa numeric(14,2) not null,
  abatido_credito numeric(14,2) not null default 0,
  fonte text,
  constraint afiliado_fatura_pkey PRIMARY KEY (loja_id, mes_validade)
);

create table if not exists afiliados_afiliado_dia (
  loja_id uuid not null,
  data date not null,
  affiliate_id bigint not null,
  affiliate_name text,
  affiliate_username text,
  vendas numeric not null default 0,
  pedidos integer not null default 0,
  itens integer not null default 0,
  cliques integer not null default 0,
  comissao numeric not null default 0,
  roi numeric,
  compradores integer not null default 0,
  novos_compradores integer not null default 0,
  coletado_em timestamp with time zone not null default now(),
  constraint afiliados_afiliado_dia_pkey PRIMARY KEY (loja_id, data, affiliate_id),
  constraint afiliados_afiliado_dia_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES lojas(id) ON DELETE CASCADE
);

create table if not exists afiliados_conteudo (
  loja_id uuid not null,
  content_id text not null,
  titulo text,
  publicado_em timestamp with time zone,
  affiliate_name text,
  affiliate_username text,
  canal text,
  produtos integer,
  views bigint not null default 0,
  likes integer not null default 0,
  comentarios integer not null default 0,
  vendas numeric not null default 0,
  pedidos integer not null default 0,
  itens integer not null default 0,
  janela_ini date,
  janela_fim date,
  coletado_em timestamp with time zone not null default now(),
  constraint afiliados_conteudo_pkey PRIMARY KEY (loja_id, content_id),
  constraint afiliados_conteudo_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES lojas(id) ON DELETE CASCADE
);

create table if not exists afiliados_item_taxa (
  loja_id uuid not null,
  item_id bigint not null,
  item_name text,
  campaign_id bigint,
  campaign_status text,
  taxa numeric,
  taxa_max_dia numeric,
  periodo_ini timestamp with time zone,
  periodo_fim timestamp with time zone,
  coletado_em timestamp with time zone not null default now(),
  constraint afiliados_item_taxa_pkey PRIMARY KEY (loja_id, item_id),
  constraint afiliados_item_taxa_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES lojas(id) ON DELETE CASCADE
);

create table if not exists afiliados_item_taxa_hist (
  loja_id uuid not null,
  item_id bigint not null,
  data date not null,
  taxa numeric,
  constraint afiliados_item_taxa_hist_pkey PRIMARY KEY (loja_id, item_id, data),
  constraint afiliados_item_taxa_hist_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES lojas(id) ON DELETE CASCADE
);

create table if not exists afiliados_loja_dia (
  loja_id uuid not null,
  data date not null,
  vendas numeric not null default 0,
  pedidos integer not null default 0,
  itens integer not null default 0,
  cliques integer not null default 0,
  comissao numeric not null default 0,
  roi numeric,
  compradores integer not null default 0,
  novos_compradores integer not null default 0,
  coletado_em timestamp with time zone not null default now(),
  constraint afiliados_loja_dia_pkey PRIMARY KEY (loja_id, data),
  constraint afiliados_loja_dia_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES lojas(id) ON DELETE CASCADE
);

create table if not exists afiliados_produto_dia (
  loja_id uuid not null,
  data date not null,
  item_id bigint not null,
  item_name text,
  vendas numeric not null default 0,
  pedidos integer not null default 0,
  itens integer not null default 0,
  cliques integer not null default 0,
  comissao numeric not null default 0,
  roi numeric,
  compradores integer not null default 0,
  novos_compradores integer not null default 0,
  coletado_em timestamp with time zone not null default now(),
  constraint afiliados_produto_dia_pkey PRIMARY KEY (loja_id, data, item_id),
  constraint afiliados_produto_dia_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES lojas(id) ON DELETE CASCADE
);

create table if not exists ai_responses (
  id uuid not null default gen_random_uuid(),
  review_id uuid,
  response_text text not null,
  status text default 'draft'::text,
  created_at timestamp with time zone default now(),
  constraint ai_responses_pkey PRIMARY KEY (id),
  constraint ai_responses_review_id_fkey FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
);

create table if not exists alertas (
  id uuid not null default gen_random_uuid(),
  loja_id uuid,
  tipo text,
  titulo text,
  descricao text,
  status text default 'novo'::text,
  criado_em timestamp with time zone default now(),
  constraint alertas_pkey PRIMARY KEY (id),
  constraint alertas_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES lojas(id)
);

create table if not exists avaliacoes (
  id uuid not null default gen_random_uuid(),
  marketplace text default 'shopee'::text,
  nome_cliente text,
  avaliacao integer not null,
  comentario text,
  nome_produto text,
  status text default 'pending'::text,
  criado_em timestamp with time zone default now(),
  loja_id uuid,
  comment_id bigint,
  item_id bigint,
  order_sn text,
  data_avaliacao timestamp with time zone,
  ja_respondida boolean default false,
  resposta_shopee text,
  respondida_em timestamp with time zone,
  constraint avaliacoes_comment_id_unique UNIQUE (comment_id),
  constraint avaliacoes_pkey PRIMARY KEY (id),
  constraint avaliacoes_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES lojas(id)
);

create table if not exists carteira_categorias (
  tipo text not null,
  codigo integer,
  categoria text not null,
  grupo text not null,
  rotulo text not null,
  entra_resultado boolean not null default false,
  observacao text,
  constraint carteira_categorias_pkey PRIMARY KEY (tipo)
);

create table if not exists carteira_referencia (
  loja_id uuid not null,
  mes text not null,
  chave text not null,
  valor numeric(14,2) not null,
  periodo_ini date,
  periodo_fim date,
  fonte text,
  constraint carteira_referencia_pkey PRIMARY KEY (loja_id, mes, chave)
);

create table if not exists carteira_transacoes (
  id uuid not null default gen_random_uuid(),
  loja_id uuid,
  transaction_id text not null,
  tipo text,
  categoria text,
  order_sn text,
  valor numeric(14,2),
  saldo numeric(14,2),
  money_flow text,
  descricao text,
  criado_em timestamp with time zone,
  importado_em timestamp with time zone default now(),
  constraint carteira_transacoes_loja_id_transaction_id_key UNIQUE (loja_id, transaction_id),
  constraint carteira_transacoes_pkey PRIMARY KEY (id),
  constraint carteira_transacoes_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES lojas(id)
);

create table if not exists chat_conversas (
  conversation_id text not null,
  to_id text,
  to_name text,
  item_id bigint,
  ultimo_remetente text,
  precisa_resposta boolean default false,
  unread_count integer default 0,
  ultima_mensagem text,
  ultima_mensagem_ts bigint,
  atualizado_em timestamp with time zone default now(),
  latest_message_id text,
  ultimo_tratado_msg_id text,
  categoria text,
  confianca text,
  resposta_ia text,
  respondida_em timestamp with time zone,
  escalada boolean default false,
  motivo_escala text,
  loja_id uuid,
  marketplace text not null default 'shopee'::text,
  robo_msg_id text,
  escalada_em timestamp with time zone,
  cliente_msg_id text,
  constraint chat_conversas_pkey PRIMARY KEY (marketplace, conversation_id)
);

create table if not exists chat_mensagens (
  message_id text not null,
  conversation_id text,
  de_loja boolean default false,
  texto text,
  item_id bigint,
  created_timestamp bigint,
  criado_em timestamp with time zone default now(),
  loja_id uuid,
  constraint chat_mensagens_pkey PRIMARY KEY (message_id)
);

create table if not exists chats (
  id uuid not null default gen_random_uuid(),
  loja_id uuid,
  marketplace text not null,
  cliente_nome text,
  mensagem text not null,
  resposta_ia text,
  status text default 'pendente'::text,
  criado_em timestamp with time zone default now(),
  constraint chats_pkey PRIMARY KEY (id),
  constraint chats_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES lojas(id)
);

create table if not exists coletor_capturas (
  id uuid not null default gen_random_uuid(),
  conta_id uuid,
  loja_id uuid,
  shop_id text,
  url text,
  metodo text,
  payload jsonb,
  capturado_em timestamp with time zone default now(),
  constraint coletor_capturas_pkey PRIMARY KEY (id)
);

create table if not exists configuracoes (
  id uuid not null default gen_random_uuid(),
  chave text not null,
  valor text,
  descricao text,
  criado_em timestamp with time zone default now(),
  atualizado_em timestamp with time zone default now(),
  constraint configuracoes_chave_key UNIQUE (chave),
  constraint configuracoes_pkey PRIMARY KEY (id)
);

create table if not exists conta_membros (
  email text not null,
  conta_id uuid,
  nome text,
  admin boolean default false,
  criado_em timestamp with time zone default now(),
  constraint conta_membros_pkey PRIMARY KEY (email),
  constraint conta_membros_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES contas(id)
);

create table if not exists contas (
  id uuid not null default gen_random_uuid(),
  nome text not null,
  criado_em timestamp with time zone default now(),
  constraint contas_pkey PRIMARY KEY (id)
);

create table if not exists custos_pedido (
  loja_id uuid not null,
  order_sn text not null,
  campo text not null,
  rotulo text,
  grupo text,
  categoria text,
  valor numeric(14,2) not null default 0,
  soma boolean not null default true,
  data_pedido timestamp with time zone,
  constraint custos_pedido_pkey PRIMARY KEY (loja_id, order_sn, campo)
);

create table if not exists custos_variacao (
  loja_id uuid,
  model_sku text not null,
  custo numeric(14,2),
  atualizado_em timestamp with time zone default now(),
  constraint custos_variacao_loja_id_model_sku_key UNIQUE (loja_id, model_sku),
  constraint custos_variacao_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES lojas(id)
);

create table if not exists escrow_regras_servico (
  rule_id bigint not null,
  categoria text not null,
  rotulo text not null,
  constraint escrow_regras_servico_pkey PRIMARY KEY (rule_id)
);

create table if not exists financas_cmv_diario (
  loja_id uuid not null,
  dia date not null,
  uf text not null default '—'::text,
  cmv numeric(14,2) not null default 0,
  unidades numeric(14,2) not null default 0,
  itens_total integer not null default 0,
  itens_com_custo integer not null default 0,
  constraint financas_cmv_diario_pkey PRIMARY KEY (loja_id, dia, uf)
);

create table if not exists financas_recebido_diario (
  loja_id uuid,
  dia date,
  recebido numeric(14,2),
  qtd_recebido integer
);

create table if not exists financas_resumo_diario (
  loja_id uuid,
  dia date,
  uf text,
  total_pedidos integer,
  receita_bruta numeric(14,2),
  taxas numeric(14,2),
  cupom_proprio numeric(14,2),
  qtd_cupom integer,
  afiliado numeric(14,2),
  qtd_afiliado integer,
  receita_liquida numeric(14,2),
  cmv numeric(14,2),
  unidades numeric,
  itens_total integer,
  itens_com_custo integer,
  a_receber numeric(14,2),
  qtd_a_receber integer,
  taxa_servico_afiliado numeric(14,2),
  frete_custo numeric(14,2) not null default 0
);

create table if not exists financeiro (
  id uuid not null default gen_random_uuid(),
  loja_id uuid,
  marketplace text not null,
  pedido_id uuid,
  tipo text,
  descricao text,
  valor numeric(10,2),
  data_movimento timestamp with time zone,
  criado_em timestamp with time zone default now(),
  constraint financeiro_pkey PRIMARY KEY (id),
  constraint financeiro_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES lojas(id),
  constraint financeiro_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
);

create table if not exists impostos (
  id uuid not null default gen_random_uuid(),
  conta_id uuid,
  competencia text not null,
  valor numeric(14,2) not null default 0,
  criado_em timestamp with time zone default now(),
  constraint impostos_conta_id_competencia_key UNIQUE (conta_id, competencia),
  constraint impostos_pkey PRIMARY KEY (id),
  constraint impostos_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES contas(id)
);

create table if not exists insights_importacoes (
  id uuid not null default gen_random_uuid(),
  conta_id uuid,
  loja_id uuid,
  arquivo text,
  colunas text[],
  total_linhas integer,
  linhas jsonb,
  importado_em timestamp with time zone default now(),
  periodo_inicio date,
  periodo_fim date,
  constraint insights_importacoes_pkey PRIMARY KEY (id)
);

create table if not exists lojas (
  id uuid not null default gen_random_uuid(),
  nome text not null,
  marketplace text not null,
  apelido text,
  status text default 'ativa'::text,
  criado_em timestamp with time zone default now(),
  shop_id text,
  conta_id uuid,
  nome_publico text,
  ads_reforco_auto boolean default false,
  ads_reforco_saldo_min numeric(12,2) default 300,
  ads_reforco_teto_dia numeric(12,2) default 2000,
  constraint lojas_pkey PRIMARY KEY (id),
  constraint lojas_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES contas(id)
);

create table if not exists marketplace_tokens (
  id uuid not null default gen_random_uuid(),
  loja_id uuid,
  marketplace text,
  access_token text,
  refresh_token text,
  expira_em timestamp with time zone,
  criado_em timestamp with time zone default now(),
  atualizado_em timestamp with time zone default now(),
  merchant_id_list jsonb,
  shop_id_list jsonb,
  supplier_id_list jsonb,
  user_id_list jsonb,
  expire_in integer,
  main_account_id text,
  shop_id text,
  status text default 'ativo'::text,
  shop_cipher text,
  constraint marketplace_tokens_pkey PRIMARY KEY (id),
  constraint marketplace_tokens_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES lojas(id)
);

create table if not exists pedido_escrow (
  loja_id uuid not null,
  order_sn text not null,
  income jsonb not null,
  buyer jsonb,
  atualizado_em timestamp with time zone not null default now(),
  constraint pedido_escrow_pkey PRIMARY KEY (loja_id, order_sn)
);

create table if not exists pedido_itens (
  pedido_id uuid not null,
  loja_id uuid not null,
  dia date not null,
  uf text not null default '—'::text,
  item_id text,
  model_sku text,
  variacao text,
  qtd numeric(14,2) not null default 0,
  preco numeric(14,2)
);

create table if not exists pedido_itens_sync (
  id integer not null default 1,
  ultimo_atualizado timestamp with time zone not null default '1970-01-01 00:00:00+00'::timestamp with time zone,
  constraint pedido_itens_sync_pkey PRIMARY KEY (id),
  constraint pedido_itens_sync_id_check CHECK ((id = 1))
);

create table if not exists pedidos (
  id uuid not null default gen_random_uuid(),
  loja_id uuid,
  marketplace text not null,
  pedido_externo_id text,
  cliente_nome text,
  valor_total numeric(10,2),
  status text,
  data_pedido timestamp with time zone,
  criado_em timestamp with time zone default now(),
  pedido_efetivado boolean default false,
  entra_faturamento boolean default false,
  atualizado_em timestamp with time zone,
  dados_pedido jsonb default '{}'::jsonb,
  valor_pago numeric,
  valor_liquido numeric,
  taxa_comissao numeric,
  taxa_servico numeric,
  cupom_shopee numeric,
  cupom_loja numeric,
  frete numeric,
  desconto_vendedor numeric,
  escrow_atualizado_em timestamp with time zone,
  data_pagamento timestamp with time zone,
  recebido_em timestamp with time zone,
  valor_recebido numeric(14,2),
  uf text,
  hub_regiao text,
  enviado_em timestamp with time zone,
  entregue_em timestamp with time zone,
  regiao_atualizada_em timestamp with time zone,
  comissao_afiliado numeric(14,2),
  taxa_servico_afiliado numeric(14,2),
  frete_real numeric(14,2),
  shopee_rebate_frete numeric(14,2),
  origem text,
  frete_custo numeric(14,2),
  escrow_final boolean not null default false,
  constraint pedidos_pkey PRIMARY KEY (id),
  constraint pedidos_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES lojas(id)
);

create table if not exists pedidos_resumo_diario (
  loja_id uuid,
  dia date,
  status text,
  efetivado boolean,
  faturado boolean,
  qtd integer,
  valor numeric(14,2)
);

create table if not exists previsao_lag (
  loja_id uuid,
  uf text,
  media_dias numeric,
  amostra integer
);

create table if not exists produto_variacoes (
  loja_id uuid not null,
  item_id text not null,
  model_id bigint not null,
  model_sku text,
  nome text,
  preco numeric(12,2),
  estoque integer,
  status text,
  atualizado_em timestamp with time zone default now(),
  constraint produto_variacoes_pkey PRIMARY KEY (loja_id, item_id, model_id)
);

create table if not exists produtos (
  id uuid not null default gen_random_uuid(),
  loja_id uuid,
  marketplace text not null,
  sku text,
  nome text not null,
  preco numeric(10,2),
  custo numeric(10,2),
  estoque integer default 0,
  status text default 'ativo'::text,
  criado_em timestamp with time zone default now(),
  item_id text,
  shop_id text,
  imagem_url text,
  categoria text,
  atualizado_em timestamp with time zone default now(),
  descricao text,
  descricao_em timestamp with time zone,
  variacoes_em timestamp with time zone,
  constraint produtos_pkey PRIMARY KEY (id),
  constraint produtos_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES lojas(id)
);

create table if not exists produtos_snapshot (
  id uuid not null default gen_random_uuid(),
  loja_id uuid,
  marketplace text not null,
  sku text,
  nome text not null,
  preco numeric(10,2),
  custo numeric(10,2),
  estoque integer default 0,
  status text default 'ativo'::text,
  criado_em timestamp with time zone default now(),
  item_id text,
  shop_id text,
  imagem_url text,
  categoria text,
  atualizado_em timestamp with time zone default now(),
  descricao text,
  descricao_em timestamp with time zone,
  variacoes_em timestamp with time zone,
  snapshot_dia date
);

create table if not exists ranking_produtos (
  id uuid not null default gen_random_uuid(),
  loja_id uuid,
  produto_id uuid,
  pedidos integer default 0,
  faturamento numeric default 0,
  lucro numeric default 0,
  atualizado_em timestamp with time zone default now(),
  constraint ranking_produtos_pkey PRIMARY KEY (id),
  constraint ranking_produtos_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES lojas(id),
  constraint ranking_produtos_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES produtos(id)
);

create table if not exists respostas_ia (
  id uuid not null default gen_random_uuid(),
  avaliacao_id uuid not null,
  resposta text not null,
  status text default 'gerada'::text,
  criado_em timestamp with time zone default now(),
  constraint respostas_ia_pkey PRIMARY KEY (id)
);

create table if not exists reviews (
  id uuid not null default gen_random_uuid(),
  marketplace text default 'shopee'::text,
  customer_name text,
  rating integer not null,
  comment text,
  product_name text,
  status text default 'pending'::text,
  created_at timestamp with time zone default now(),
  constraint reviews_pkey PRIMARY KEY (id)
);

create table if not exists saude_alertas (
  id bigint not null default nextval('saude_alertas_id_seq'::regclass),
  loja_id uuid not null,
  chave text not null,
  dia date not null,
  texto text,
  enviado_em timestamp with time zone default now(),
  constraint saude_alertas_loja_id_chave_dia_key UNIQUE (loja_id, chave, dia),
  constraint saude_alertas_pkey PRIMARY KEY (id)
);

create table if not exists saude_anuncios_problema (
  id bigint not null default nextval('saude_anuncios_problema_id_seq'::regclass),
  loja_id uuid not null,
  dia date not null,
  item_id bigint not null,
  reason integer,
  constraint saude_anuncios_problema_loja_id_dia_item_id_key UNIQUE (loja_id, dia, item_id),
  constraint saude_anuncios_problema_pkey PRIMARY KEY (id)
);

create table if not exists saude_conta_snapshot (
  id bigint not null default nextval('saude_conta_snapshot_id_seq'::regclass),
  loja_id uuid not null,
  dia date not null,
  rating integer,
  falhas_envio integer,
  falhas_anuncio integer,
  falhas_atendimento integer,
  metricas_fora integer,
  pedidos_atrasados integer,
  anuncios_problema integer,
  pontos_penalidade integer,
  punicoes_ativas integer,
  bruto jsonb,
  coletado_em timestamp with time zone default now(),
  constraint saude_conta_snapshot_loja_id_dia_key UNIQUE (loja_id, dia),
  constraint saude_conta_snapshot_pkey PRIMARY KEY (id)
);

create table if not exists saude_metricas (
  id bigint not null default nextval('saude_metricas_id_seq'::regclass),
  loja_id uuid not null,
  dia date not null,
  metric_id integer not null,
  metric_type integer,
  parent_metric_id integer,
  nome text,
  atual numeric,
  anterior numeric,
  unidade integer,
  alvo numeric,
  comparador text,
  isencao_ate text,
  fora_da_meta boolean,
  constraint saude_metricas_loja_id_dia_metric_id_key UNIQUE (loja_id, dia, metric_id),
  constraint saude_metricas_pkey PRIMARY KEY (id)
);

create table if not exists saude_pedidos_atrasados (
  id bigint not null default nextval('saude_pedidos_atrasados_id_seq'::regclass),
  loja_id uuid not null,
  dia date not null,
  order_sn text not null,
  shipping_deadline timestamp with time zone,
  late_by_days integer,
  constraint saude_pedidos_atrasados_loja_id_dia_order_sn_key UNIQUE (loja_id, dia, order_sn),
  constraint saude_pedidos_atrasados_pkey PRIMARY KEY (id)
);

create table if not exists saude_penalidades (
  id bigint not null default nextval('saude_penalidades_id_seq'::regclass),
  loja_id uuid not null,
  reference_id bigint not null default 0,
  issue_time timestamp with time zone not null,
  violation_type integer not null default 0,
  pontos_original integer,
  pontos_atual integer,
  visto_em timestamp with time zone default now(),
  constraint saude_penalidades_loja_id_reference_id_issue_time_violation_key UNIQUE (loja_id, reference_id, issue_time, violation_type),
  constraint saude_penalidades_pkey PRIMARY KEY (id)
);

create table if not exists saude_punicoes (
  id bigint not null default nextval('saude_punicoes_id_seq'::regclass),
  loja_id uuid not null,
  reference_id bigint not null default 0,
  punishment_type integer not null default 0,
  start_time timestamp with time zone not null,
  issue_time timestamp with time zone,
  end_time timestamp with time zone,
  reason integer,
  listing_limit integer[],
  order_limit text,
  status integer,
  visto_em timestamp with time zone default now(),
  constraint saude_punicoes_loja_id_reference_id_punishment_type_start_t_key UNIQUE (loja_id, reference_id, punishment_type, start_time),
  constraint saude_punicoes_pkey PRIMARY KEY (id)
);

create table if not exists shopee_ams_tokens (
  loja_id uuid not null,
  shop_id text not null,
  access_token text not null,
  refresh_token text not null,
  expira_em timestamp with time zone not null,
  status text not null default 'ativo'::text,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  constraint shopee_ams_tokens_pkey PRIMARY KEY (loja_id),
  constraint shopee_ams_tokens_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES lojas(id) ON DELETE CASCADE
);

create table if not exists sincronizacoes (
  id uuid not null default gen_random_uuid(),
  marketplace text not null,
  loja_id uuid,
  tipo text not null,
  status text default 'sucesso'::text,
  registros_importados integer default 0,
  iniciado_em timestamp with time zone default now(),
  finalizado_em timestamp with time zone default now(),
  mensagem text,
  constraint sincronizacoes_pkey PRIMARY KEY (id),
  constraint sincronizacoes_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES lojas(id)
);

create table if not exists sync_jobs (
  id uuid not null default gen_random_uuid(),
  marketplace text not null,
  tipo text not null,
  status text not null default 'pendente'::text,
  data_inicio timestamp without time zone,
  data_fim timestamp without time zone,
  progresso integer default 0,
  total_registros integer default 0,
  criado_em timestamp with time zone default now(),
  atualizado_em timestamp with time zone default now(),
  loja_id uuid,
  constraint sync_jobs_pkey PRIMARY KEY (id)
);

create table if not exists taxa_item_cache (
  loja_id uuid not null,
  item_id text not null,
  taxa numeric not null,
  vt numeric not null,
  constraint taxa_item_cache_pkey PRIMARY KEY (loja_id, item_id)
);

create table if not exists tiktok_extratos (
  id text not null,
  loja_id uuid not null,
  statement_time timestamp with time zone not null,
  currency text,
  revenue numeric(14,2),
  fee numeric(14,2),
  shipping_cost numeric(14,2),
  adjustment numeric(14,2),
  settlement numeric(14,2),
  net_sales numeric(14,2),
  payment_id text,
  payment_status text,
  payment_time timestamp with time zone,
  transacoes integer default 0,
  processado_em timestamp with time zone,
  atualizado_em timestamp with time zone default now(),
  constraint tiktok_extratos_pkey PRIMARY KEY (id)
);

create table if not exists tiktok_transacoes (
  id text not null,
  loja_id uuid not null,
  statement_id text not null,
  order_id text,
  tipo text,
  order_create_time timestamp with time zone,
  revenue numeric(14,2) default 0,
  fee_tax numeric(14,2) default 0,
  shipping_cost numeric(14,2) default 0,
  adjustment numeric(14,2) default 0,
  settlement numeric(14,2) default 0,
  comissao_plataforma numeric(14,2) default 0,
  frete_gratis_taxa numeric(14,2) default 0,
  afiliado numeric(14,2) default 0,
  afiliado_ads numeric(14,2) default 0,
  outras_taxas numeric(14,2) default 0,
  desconto_vendedor numeric(14,2) default 0,
  frete_pago_cliente numeric(14,2) default 0,
  frete_real numeric(14,2) default 0,
  breakdown jsonb,
  criado_em timestamp with time zone default now(),
  constraint tiktok_transacoes_pkey PRIMARY KEY (id)
);

create table if not exists uso_ia (
  id uuid not null default gen_random_uuid(),
  criado_em timestamp with time zone default now(),
  loja_id uuid,
  marketplace text,
  tipo text,
  modelo text,
  tokens_entrada integer default 0,
  tokens_saida integer default 0,
  tokens_cache_leitura integer default 0,
  tokens_cache_escrita integer default 0,
  custo_usd numeric(12,6) default 0,
  constraint uso_ia_pkey PRIMARY KEY (id),
  constraint uso_ia_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES lojas(id)
);

create table if not exists variacoes_resumo (
  loja_id uuid,
  item_id text,
  model_sku text,
  variacao text,
  un numeric,
  receita numeric(14,2)
);

-- ── Índices ──
create index if not exists ads_ajustes_camp_idx ON public.ads_ajustes USING btree (loja_id, campaign_id, criado_em DESC);
create index if not exists ads_alteracoes_camp_idx ON public.ads_alteracoes USING btree (loja_id, campaign_id, campo, data_deteccao DESC);
create index if not exists ads_campaign_config_camp_dia_idx ON public.ads_campaign_config_daily USING btree (loja_id, campaign_id, dia);
create index if not exists ads_diario_loja_dia_idx ON public.ads_diario USING btree (loja_id, dia);
create index if not exists ads_item_perf_loja_dia_idx ON public.ads_item_performance_daily USING btree (loja_id, dia);
create index if not exists ads_recomendacoes_loja_dia_idx ON public.ads_recomendacoes USING btree (loja_id, dia);
create index if not exists ads_reforcos_dia_idx ON public.ads_reforcos USING btree (dia, revertido_em);
create index if not exists afiliados_afiliado_dia_af_idx ON public.afiliados_afiliado_dia USING btree (loja_id, affiliate_id, data DESC);
create index if not exists afiliados_produto_dia_item_idx ON public.afiliados_produto_dia USING btree (loja_id, item_id, data DESC);
create index if not exists avaliacoes_resumo_cov ON public.avaliacoes USING btree (loja_id) INCLUDE (avaliacao, criado_em);
create index if not exists idx_avaliacoes_pendentes ON public.avaliacoes USING btree (marketplace, ja_respondida, avaliacao);
create index if not exists idx_avaliacoes_respondida_em ON public.avaliacoes USING btree (respondida_em);
create index if not exists carteira_cat_idx ON public.carteira_transacoes USING btree (categoria, criado_em);
create index if not exists carteira_criado_idx ON public.carteira_transacoes USING btree (criado_em);
create index if not exists carteira_loja_idx ON public.carteira_transacoes USING btree (loja_id);
create index if not exists carteira_order_idx ON public.carteira_transacoes USING btree (order_sn);
create index if not exists chat_conversas_escaladas_idx ON public.chat_conversas USING btree (ultima_mensagem_ts DESC) WHERE escalada;
create index if not exists chat_conversas_pendentes_idx ON public.chat_conversas USING btree (marketplace, loja_id, ultima_mensagem_ts DESC) WHERE precisa_resposta;
create index if not exists idx_chat_conversas_loja ON public.chat_conversas USING btree (loja_id, precisa_resposta);
create index if not exists idx_chat_conversas_pendentes ON public.chat_conversas USING btree (precisa_resposta, ultima_mensagem_ts);
create index if not exists idx_chat_mensagens_conversa ON public.chat_mensagens USING btree (conversation_id);
create index if not exists idx_chat_mensagens_item ON public.chat_mensagens USING btree (item_id, de_loja);
create index if not exists idx_chat_mensagens_loja ON public.chat_mensagens USING btree (loja_id, item_id);
create index if not exists idx_coletor_conta ON public.coletor_capturas USING btree (conta_id, capturado_em DESC);
create index if not exists idx_coletor_url ON public.coletor_capturas USING btree (url, capturado_em DESC);
create UNIQUE index if not exists configuracoes_chave_idx ON public.configuracoes USING btree (chave);
create index if not exists custos_pedido_cat_idx ON public.custos_pedido USING btree (loja_id, categoria, data_pedido);
create index if not exists custos_pedido_data_idx ON public.custos_pedido USING btree (loja_id, data_pedido);
create index if not exists custos_variacao_idx ON public.custos_variacao USING btree (loja_id, model_sku);
create index if not exists frcd_loja_dia_idx ON public.financas_recebido_diario USING btree (loja_id, dia);
create index if not exists frd_loja_dia_idx ON public.financas_resumo_diario USING btree (loja_id, dia);
create index if not exists idx_insights_import_conta ON public.insights_importacoes USING btree (conta_id, importado_em DESC);
create index if not exists pedido_escrow_atual_idx ON public.pedido_escrow USING btree (atualizado_em);
create index if not exists pedido_itens_dia_idx ON public.pedido_itens USING btree (dia);
create index if not exists pedido_itens_loja_dia_idx ON public.pedido_itens USING btree (loja_id, dia);
create index if not exists pedido_itens_loja_idx ON public.pedido_itens USING btree (loja_id);
create index if not exists pedido_itens_loja_item_dia_idx ON public.pedido_itens USING btree (loja_id, item_id, dia);
create index if not exists pedido_itens_pedido_idx ON public.pedido_itens USING btree (pedido_id);
create index if not exists pedido_itens_sku_idx ON public.pedido_itens USING btree (loja_id, model_sku);
create index if not exists idx_pedidos_data ON public.pedidos USING btree (data_pedido);
create index if not exists idx_pedidos_data_pagamento ON public.pedidos USING btree (data_pagamento);
create index if not exists idx_pedidos_escrow_pendente ON public.pedidos USING btree (marketplace, escrow_atualizado_em);
create index if not exists idx_pedidos_externo ON public.pedidos USING btree (pedido_externo_id);
create index if not exists idx_pedidos_loja ON public.pedidos USING btree (loja_id);
create index if not exists idx_pedidos_status ON public.pedidos USING btree (status);
create index if not exists pedidos_atualizado_idx ON public.pedidos USING btree (atualizado_em) WHERE (marketplace = 'shopee'::text);
create index if not exists pedidos_atualizado_tiktok_idx ON public.pedidos USING btree (atualizado_em) WHERE (marketplace = 'tiktok_shop'::text);
create index if not exists pedidos_data_pedido_idx ON public.pedidos USING btree (data_pedido);
create index if not exists pedidos_escrow_final_pend_idx ON public.pedidos USING btree (escrow_atualizado_em) WHERE ((marketplace = 'shopee'::text) AND pedido_efetivado AND (NOT escrow_final));
create index if not exists pedidos_escrow_pend_idx ON public.pedidos USING btree (data_pedido DESC) WHERE ((escrow_atualizado_em IS NULL) AND (marketplace = 'shopee'::text) AND pedido_efetivado);
create index if not exists pedidos_loja_cliente_idx ON public.pedidos USING btree (loja_id, cliente_nome, data_pedido DESC);
create index if not exists pedidos_loja_idx ON public.pedidos USING btree (loja_id);
create index if not exists pedidos_mkt_efet_idx ON public.pedidos USING btree (marketplace, pedido_efetivado);
create index if not exists pedidos_pend_detalhe_idx ON public.pedidos USING btree (origem) WHERE (data_pedido IS NULL);
create index if not exists pedidos_recebido_em_idx ON public.pedidos USING btree (recebido_em);
create index if not exists pedidos_regiao_pend_idx ON public.pedidos USING btree (regiao_atualizada_em);
create index if not exists pedidos_resumo_cov ON public.pedidos USING btree (loja_id) INCLUDE (valor_total, pedido_efetivado, entra_faturamento, status, marketplace, data_pagamento, data_pedido);
create index if not exists pedidos_resumo_dt ON public.pedidos USING btree (loja_id, COALESCE(data_pagamento, data_pedido)) INCLUDE (valor_total, pedido_efetivado, entra_faturamento, status, marketplace);
create index if not exists prd_loja_dia_idx ON public.pedidos_resumo_diario USING btree (loja_id, dia);
create index if not exists pl_loja_idx ON public.previsao_lag USING btree (loja_id);
create index if not exists produto_variacoes_item_idx ON public.produto_variacoes USING btree (loja_id, item_id);
create index if not exists saude_metricas_loja_dia_idx ON public.saude_metricas USING btree (loja_id, dia DESC);
create index if not exists saude_penalidades_loja_idx ON public.saude_penalidades USING btree (loja_id, issue_time DESC);
create index if not exists taxa_item_cache_item_idx ON public.taxa_item_cache USING btree (item_id);
create index if not exists tiktok_extratos_loja_time_idx ON public.tiktok_extratos USING btree (loja_id, statement_time DESC);
create index if not exists tiktok_extratos_pend_idx ON public.tiktok_extratos USING btree (statement_time) WHERE (processado_em IS NULL);
create index if not exists tiktok_transacoes_order_idx ON public.tiktok_transacoes USING btree (loja_id, order_id);
create index if not exists tiktok_transacoes_stmt_idx ON public.tiktok_transacoes USING btree (statement_id);
create index if not exists uso_ia_criado_idx ON public.uso_ia USING btree (criado_em);
create index if not exists uso_ia_loja_idx ON public.uso_ia USING btree (loja_id);
create index if not exists vr_loja_idx ON public.variacoes_resumo USING btree (loja_id);

-- ── Views ──
create or replace view pedidos_auditoria as
 SELECT p.id,
    p.loja_id,
    p.marketplace,
    p.pedido_externo_id,
    p.cliente_nome,
    p.valor_total,
    p.taxa_comissao,
    p.taxa_servico,
    p.valor_liquido,
    p.data_pagamento,
    p.data_pedido,
    COALESCE(esp.taxa_esperada, 0::numeric) AS taxa_esperada,
    round(COALESCE(p.taxa_comissao, 0::numeric) + COALESCE(p.taxa_servico, 0::numeric) - COALESCE(p.taxa_servico_afiliado, 0::numeric), 2) AS taxa_real,
    round(COALESCE(p.taxa_comissao, 0::numeric) + COALESCE(p.taxa_servico, 0::numeric) - COALESCE(p.taxa_servico_afiliado, 0::numeric) - COALESCE(esp.taxa_esperada, 0::numeric), 2) AS taxa_diferenca
   FROM pedidos p
     LEFT JOIN LATERAL ( SELECT round(sum(itens.q * shopee_taxa_esperada_item(itens.preco, (p.data_pedido AT TIME ZONE 'America/Sao_Paulo'::text)::date)), 2) AS taxa_esperada
           FROM ( SELECT COALESCE(NULLIF(it.value ->> 'model_quantity_purchased'::text, ''::text)::numeric, 1::numeric) AS q,
                        CASE
                            WHEN COALESCE(NULLIF(it.value ->> 'model_discounted_price'::text, ''::text)::numeric, 0::numeric) > 0::numeric THEN NULLIF(it.value ->> 'model_discounted_price'::text, ''::text)::numeric
                            ELSE COALESCE(NULLIF(it.value ->> 'model_original_price'::text, ''::text)::numeric, 0::numeric)
                        END AS preco
                   FROM jsonb_array_elements(p.dados_pedido -> 'item_list'::text) it(value)) itens
          WHERE itens.preco > 0::numeric) esp ON true
  WHERE p.marketplace = 'shopee'::text AND p.escrow_atualizado_em IS NOT NULL AND COALESCE(p.valor_total, 0::numeric) > 0::numeric AND jsonb_typeof(p.dados_pedido -> 'item_list'::text) = 'array'::text;

-- ── Funções ──
CREATE OR REPLACE FUNCTION public._explain(q text)
 RETURNS SETOF text
 LANGUAGE plpgsql
AS $function$ declare l text; begin for l in execute q loop return next l; end loop; end $function$
;

CREATE OR REPLACE FUNCTION public.ads_detectar_alteracoes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare v_n int;
begin
  with s as (
    select loja_id, campaign_id, item_id, dia,
      meta_roas::text as meta, orcamento::text as orc, status,
      lag(meta_roas::text) over w as p_meta, lag(orcamento::text) over w as p_orc,
      lag(status) over w as p_status, lag(dia) over w as p_dia
    from ads_campaign_config_daily
    window w as (partition by loja_id, campaign_id order by dia)
  ),
  d as (
    select loja_id, campaign_id, item_id, dia, 'meta_roas' as campo, p_meta as va, meta as vn
      from s where p_dia is not null and p_meta is distinct from meta
    union all
    select loja_id, campaign_id, item_id, dia, 'orcamento', p_orc, orc
      from s where p_dia is not null and p_orc is distinct from orc
    union all
    select loja_id, campaign_id, item_id, dia, 'status', p_status, status
      from s where p_dia is not null and p_status is distinct from status
  )
  insert into ads_alteracoes (loja_id, item_id, campaign_id, data_deteccao, campo, valor_antigo, valor_novo)
  select loja_id, item_id, campaign_id, dia, campo, va, vn from d
  on conflict (loja_id, campaign_id, data_deteccao, campo) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $function$
;

CREATE OR REPLACE FUNCTION public.ads_diagnostico_roas(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_dias integer DEFAULT 7)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date d),
  jan as (
    select d - 1 as fim_atual, d - p_dias as ini_atual,
           d - p_dias - 1 as fim_ant, d - 2 * p_dias as ini_ant
    from hoje
  ),
  perf as (
    select f.loja_id, f.item_id, f.dia,
      coalesce(f.gasto, 0) gasto, coalesce(f.gmv, 0) gmv,
      coalesce(f.impressoes, 0) imp, coalesce(f.cliques, 0) cli, coalesce(f.pedidos, 0) ped,
      (f.dia >= jan.ini_atual) as atual
    from ads_item_performance_daily f, jan
    where f.escopo = 'direto' and f.dia between jan.ini_ant and jan.fim_atual
      and (p_loja_ids is null or f.loja_id = any(p_loja_ids))
  ),
  por_item as (
    select loja_id, item_id,
      coalesce(sum(gasto) filter (where atual), 0) gasto_a, coalesce(sum(gmv) filter (where atual), 0) gmv_a,
      coalesce(sum(imp) filter (where atual), 0) imp_a, coalesce(sum(cli) filter (where atual), 0) cli_a,
      coalesce(sum(ped) filter (where atual), 0) ped_a,
      coalesce(sum(gasto) filter (where not atual), 0) gasto_p, coalesce(sum(gmv) filter (where not atual), 0) gmv_p,
      coalesce(sum(imp) filter (where not atual), 0) imp_p, coalesce(sum(cli) filter (where not atual), 0) cli_p,
      coalesce(sum(ped) filter (where not atual), 0) ped_p
    from perf
    group by 1, 2
  ),
  tot as (
    select coalesce(sum(gasto_a), 0) ga, coalesce(sum(gmv_a), 0) gma,
           coalesce(sum(gasto_p), 0) gp, coalesce(sum(gmv_p), 0) gmp
    from por_item
  ),
  rec as (
    select distinct on (r.loja_id, r.item_id)
      r.loja_id, r.item_id, r.produto, r.classificacao, r.acao, r.meta_roas, r.meta_sugerida,
      r.roas_minimo, r.fator, r.promo, r.orcamento_configurado, r.orcamento_ideal
    from ads_recomendacoes r
    where (p_loja_ids is null or r.loja_id = any(p_loja_ids))
    order by r.loja_id, r.item_id, r.dia desc
  ),
  alt as (
    select a.loja_id, a.item_id,
      json_agg(json_build_object('dia', a.data_deteccao, 'campo', a.campo, 'de', a.valor_antigo, 'para', a.valor_novo)
               order by a.data_deteccao) as alteracoes
    from ads_alteracoes a, jan
    where a.item_id is not null
      and a.data_deteccao between jan.ini_ant and jan.fim_atual + 1
      and (p_loja_ids is null or a.loja_id = any(p_loja_ids))
    group by 1, 2
  ),
  calc as (
    select p.*,
      p.gmv_a / nullif(p.gasto_a, 0) as roas_a,
      p.gmv_p / nullif(p.gasto_p, 0) as roas_p,
      (p.gmv_a - coalesce(t.gmp / nullif(t.gp, 0), 0) * p.gasto_a) / nullif(t.ga, 0) as contrib,
      case when p.gasto_p > 0 and p.gasto_a > 0
           then p.gasto_a * (p.gmv_a / p.gasto_a - p.gmv_p / p.gasto_p) / nullif(t.ga, 0)
           else 0 end as contrib_efic
    from por_item p, tot t
  ),
  itens as (
    select c.loja_id, c.item_id,
      coalesce(r.produto, pr.nome) as produto,
      round(c.gasto_a::numeric, 2) gasto_atual, round(c.gasto_p::numeric, 2) gasto_anterior,
      round(c.gmv_a::numeric, 2) gmv_atual, round(c.gmv_p::numeric, 2) gmv_anterior,
      round(c.roas_a::numeric, 2) roas_atual, round(c.roas_p::numeric, 2) roas_anterior,
      round((c.cli_a::numeric / nullif(c.imp_a, 0)), 4) ctr_atual, round((c.cli_p::numeric / nullif(c.imp_p, 0)), 4) ctr_anterior,
      round((c.ped_a::numeric / nullif(c.cli_a, 0)), 4) cr_atual, round((c.ped_p::numeric / nullif(c.cli_p, 0)), 4) cr_anterior,
      round((c.gasto_a / nullif(c.cli_a, 0))::numeric, 2) cpc_atual, round((c.gasto_p / nullif(c.cli_p, 0))::numeric, 2) cpc_anterior,
      c.ped_a pedidos_atual, c.ped_p pedidos_anterior,
      round(coalesce(c.contrib, 0)::numeric, 3) contrib,
      round(coalesce(c.contrib_efic, 0)::numeric, 3) contrib_efic,
      round((coalesce(c.contrib, 0) - coalesce(c.contrib_efic, 0))::numeric, 3) contrib_mix,
      r.classificacao, r.acao, r.meta_roas, r.meta_sugerida, r.roas_minimo, r.fator,
      coalesce(r.promo, false) promo, r.orcamento_configurado, r.orcamento_ideal,
      coalesce(a.alteracoes, '[]'::json) alteracoes
    from calc c
    left join rec r on r.loja_id = c.loja_id and r.item_id = c.item_id
    left join produtos pr on pr.loja_id = c.loja_id and pr.item_id::text = c.item_id::text
    left join alt a on a.loja_id = c.loja_id and a.item_id = c.item_id
    where c.gasto_a > 0 or c.gasto_p > 0
  )
  select json_build_object(
    'periodo', (select json_build_object('atual_ini', ini_atual, 'atual_fim', fim_atual,
                                         'ant_ini', ini_ant, 'ant_fim', fim_ant, 'dias', p_dias) from jan),
    'atual',    (select json_build_object('gasto', round(ga::numeric, 2), 'gmv', round(gma::numeric, 2),
                                          'roas', round((gma / nullif(ga, 0))::numeric, 2)) from tot),
    'anterior', (select json_build_object('gasto', round(gp::numeric, 2), 'gmv', round(gmp::numeric, 2),
                                          'roas', round((gmp / nullif(gp, 0))::numeric, 2)) from tot),
    'delta_roas', (select round((gma / nullif(ga, 0) - gmp / nullif(gp, 0))::numeric, 2) from tot),
    'itens', (select coalesce(json_agg(i), '[]'::json)
              from (select * from itens order by abs(contrib) desc limit 80) i)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.ads_fator_consolidar()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare v_comp text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM'); v_n int;
begin
  insert into ads_fator_historico
    (loja_id, competencia, fator_estimado, fator_consolidado, divergencia_pct, pedidos_estimado, pedidos_consolidado)
  select loja_id, v_comp,
    round(est_efet/nullif(est_bruto,0), 4),
    round(con_efet/nullif(con_bruto,0), 4),
    round(abs(est_efet/nullif(est_bruto,0) - con_efet/nullif(con_bruto,0)) / nullif(con_efet/nullif(con_bruto,0),0) * 100, 2),
    est_ped, con_ped
  from (
    select pi.loja_id,
      sum(pi.qtd*pi.preco) filter (where p.pedido_efetivado and p.data_pedido >= now()-interval '90 days') as est_efet,
      sum(pi.qtd*pi.preco) filter (where p.data_pedido >= now()-interval '90 days') as est_bruto,
      count(distinct p.id) filter (where p.data_pedido >= now()-interval '90 days') as est_ped,
      sum(pi.qtd*pi.preco) filter (where p.pedido_efetivado and p.data_pedido between now()-interval '120 days' and now()-interval '30 days') as con_efet,
      sum(pi.qtd*pi.preco) filter (where p.data_pedido between now()-interval '120 days' and now()-interval '30 days') as con_bruto,
      count(distinct p.id) filter (where p.data_pedido between now()-interval '120 days' and now()-interval '30 days') as con_ped
    from pedido_itens pi join pedidos p on p.id = pi.pedido_id
    where p.data_pedido >= now()-interval '120 days'
    group by pi.loja_id
  ) x
  where est_bruto > 0 and con_bruto > 0
  on conflict (loja_id, competencia) do update set
    fator_estimado=excluded.fator_estimado, fator_consolidado=excluded.fator_consolidado,
    divergencia_pct=excluded.divergencia_pct, pedidos_estimado=excluded.pedidos_estimado,
    pedidos_consolidado=excluded.pedidos_consolidado, criado_em=now();
  get diagnostics v_n = row_count;
  return v_n;
end $function$
;

CREATE OR REPLACE FUNCTION public.ads_item_gmv_real(p_loja uuid, p_item bigint, p_dias integer DEFAULT 28)
 RETURNS TABLE(dia date, gmv_real numeric, unidades numeric, pedidos integer)
 LANGUAGE sql
 STABLE
AS $function$
  select pi.dia, sum(pi.qtd*pi.preco), sum(pi.qtd), count(distinct pi.pedido_id)::int
  from pedido_itens pi join pedidos p on p.id = pi.pedido_id
  where pi.loja_id = p_loja and pi.item_id = p_item::text and p.pedido_efetivado
    and pi.dia >= (now() at time zone 'America/Sao_Paulo')::date - p_dias
  group by pi.dia order by pi.dia;
$function$
;

CREATE OR REPLACE FUNCTION public.ads_recomendacoes_calc(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_meta_global numeric DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_n int;
begin
  perform ads_detectar_alteracoes();  -- relógio sempre atualizado antes de classificar
  delete from ads_recomendacoes where dia = v_hoje and (p_loja_ids is null or loja_id = any(p_loja_ids));

  with perf as (
    select loja_id, item_id, max(campaign_id) as campaign_id,
      sum(gasto)      filter (where dia >= v_hoje-7) as gasto7,
      sum(gmv)        filter (where dia >= v_hoje-7) as gmv7,
      sum(pedidos)    filter (where dia >= v_hoje-7) as ped7,
      sum(cliques)    filter (where dia >= v_hoje-7) as cli7,
      sum(impressoes) filter (where dia >= v_hoje-7) as imp7,
      sum(gasto) as gasto28, sum(gmv) as gmv28,
      sum(pedidos) as ped28, sum(cliques) as cli28, sum(impressoes) as imp28
    from ads_item_performance_daily
    where escopo='direto' and dia >= v_hoje-28
      and (p_loja_ids is null or loja_id = any(p_loja_ids))
    group by 1,2
  ),
  -- Preço médio vendido POR DIA e baseline dos 28 dias anteriores -> flag promo por dia.
  preco_dia as (
    select loja_id, item_id, dia,
      sum(qtd*preco)/nullif(sum(qtd),0) as p_dia,
      sum(sum(qtd*preco)) over (partition by loja_id, item_id order by dia
        range between interval '28 days' preceding and interval '1 day' preceding)
      / nullif(sum(sum(qtd)) over (partition by loja_id, item_id order by dia
        range between interval '28 days' preceding and interval '1 day' preceding), 0) as p_base
    from pedido_itens
    where dia >= v_hoje-60 and (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (loja_id, item_id::bigint) in (select loja_id, item_id from perf)  -- só itens com Ads
    group by loja_id, item_id, dia
  ),
  promo_dia as (
    select loja_id, item_id::bigint as item_id, dia from preco_dia
    where p_base is not null and p_dia < 0.95*p_base
  ),
  -- Gasto médio "normal": últimos 28 dias com gasto, sem dias de promo e sem dias de
  -- campanha Shopee. Agrega por DIA antes (item com 2+ campanhas soma as duas);
  -- dias sem gasto ficam de fora: a média é do dia ativo típico.
  normal as (
    select loja_id, item_id, avg(gasto_dia) as gasto_medio, (count(*))::int as dias_normais,
      avg(gasto_dia) filter (where dia >= v_hoje-7) as gasto_medio_7d  -- item escalando: a média de 28d atrasa
    from (
      select d.loja_id, d.item_id, d.dia, sum(d.gasto) as gasto_dia
      from ads_item_performance_daily d
      left join promo_dia pd on pd.loja_id=d.loja_id and pd.item_id=d.item_id and pd.dia=d.dia
      left join ads_dias_campanha_shopee cs on cs.dia=d.dia
      where d.escopo='direto' and d.dia between v_hoje-28 and v_hoje-1
        and pd.dia is null and cs.dia is null
        and (p_loja_ids is null or d.loja_id = any(p_loja_ids))
      group by d.loja_id, d.item_id, d.dia
      having sum(d.gasto) > 0
    ) x
    group by 1,2
  ),
  -- Esgotamento: gasto do dia >= 95% do orçamento (snapshot do dia; senão o último conhecido).
  orc_dia as (
    select d.loja_id, d.campaign_id, d.dia, d.gasto,
      coalesce(c.orcamento,
        (select c2.orcamento from ads_campaign_config_daily c2
          where c2.loja_id=d.loja_id and c2.campaign_id=d.campaign_id and c2.dia<=d.dia order by c2.dia desc limit 1),
        (select c3.orcamento from ads_campaign_config_daily c3
          where c3.loja_id=d.loja_id and c3.campaign_id=d.campaign_id order by c3.dia desc limit 1)) as orcamento
    from ads_item_performance_daily d
    left join ads_campaign_config_daily c on c.loja_id=d.loja_id and c.campaign_id=d.campaign_id and c.dia=d.dia
    where d.escopo='direto' and d.dia between v_hoje-7 and v_hoje-1
      and (p_loja_ids is null or d.loja_id = any(p_loja_ids))
  ),
  esgot as (
    select loja_id, campaign_id,
      (count(*) filter (where orcamento>0 and gasto >= 0.95*orcamento))::int as dias_esgotados
    from orc_dia group by 1,2
  ),
  fator_item as (
    select pi.loja_id, pi.item_id::bigint as item_id,
      sum(pi.qtd*pi.preco) filter (where p.pedido_efetivado) as efet,
      sum(pi.qtd*pi.preco) as bruto, count(distinct p.id) as pedidos_base
    from pedido_itens pi join pedidos p on p.id = pi.pedido_id
    where p.data_pedido >= now() - interval '90 days'
      and (p_loja_ids is null or pi.loja_id = any(p_loja_ids))
      and (pi.loja_id, pi.item_id::bigint) in (select loja_id, item_id from perf)  -- só itens com Ads
    group by 1,2
  ),
  -- Fallback "fator médio da loja" (item com <20 pedidos): o fator estimado da loja
  -- inteira, já calculado por ads_fator_consolidar (mensal) — evita varrer todos os itens.
  fator_loja as (
    select distinct on (loja_id) loja_id, fator_estimado as f
    from ads_fator_historico order by loja_id, competencia desc
  ),
  custo_var as (  -- custo pelas variações vendidas (90d)
    select pi.loja_id, pi.item_id::bigint as item_id, avg(cv.custo) as custo
    from pedido_itens pi
    join custos_variacao cv on cv.loja_id=pi.loja_id and norm_sku(cv.model_sku)=norm_sku(pi.model_sku)
    where pi.dia >= v_hoje-90 and (p_loja_ids is null or pi.loja_id = any(p_loja_ids))
      and (pi.loja_id, pi.item_id::bigint) in (select loja_id, item_id from perf)  -- só itens com Ads
    group by 1,2
  ),
  -- v3.3: fallback do custo = custos_variacao pelo SKU do ITEM (produto sem variação) ->
  -- produtos.custo (linha "produto inteiro" do /financas). Também traz o preço do catálogo
  -- pra estimar o ticket de item sem venda recente.
  custo_item as (
    select p.loja_id, p.item_id,
      coalesce(cv.custo,
        (select max(c.custo) from custos_variacao c
          where c.loja_id=p.loja_id and coalesce(pr.sku,'')<>'' and norm_sku(c.model_sku)=norm_sku(pr.sku)),
        pr.custo) as custo,
      -- preço de referência: preço médio vendido em 90d (pedidos), senão o preço do catálogo
      coalesce(
        (select sum(pi.qtd*pi.preco)/nullif(sum(pi.qtd),0) from pedido_itens pi
          where pi.loja_id=p.loja_id and pi.item_id=p.item_id::text and pi.dia >= v_hoje-90),
        nullif(pr.preco, 0)) as preco_catalogo
    from perf p
    left join custo_var cv on cv.loja_id=p.loja_id and cv.item_id=p.item_id
    left join produtos pr on pr.loja_id=p.loja_id and pr.item_id=p.item_id::text
  ),
  preco_item as (  -- promo do ITEM (7d vs 28d anteriores) — regra campeão
    select loja_id, item_id::bigint as item_id,
      sum(qtd*preco) filter (where dia >= v_hoje-7) / nullif(sum(qtd) filter (where dia >= v_hoje-7),0) as p7,
      sum(qtd*preco) filter (where dia <  v_hoje-7) / nullif(sum(qtd) filter (where dia <  v_hoje-7),0) as p28
    from pedido_itens
    where dia >= v_hoje-35 and (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (loja_id, item_id::bigint) in (select loja_id, item_id from perf)  -- só itens com Ads
    group by 1,2
  ),
  cfg as (  -- snapshot mais recente POR ITEM (últimos 3 dias) — não depende do max(dia) global
    select distinct on (loja_id, item_id) loja_id, item_id, campaign_id, meta_roas, orcamento, data_inicio, status
    from ads_campaign_config_daily
    where dia between v_hoje-3 and v_hoje
      and item_id is not null and status in ('ongoing','paused')
      and (p_loja_ids is null or loja_id = any(p_loja_ids))
    order by loja_id, item_id, dia desc
  ),
  alt_meta as (  -- última alteração de META por campanha (relógio de estabilização)
    select loja_id, campaign_id, max(data_deteccao) as ultima
    from ads_alteracoes where campo='meta_roas' group by 1,2
  ),
  -- Avaliação pós-degrau (v3.1): última troca de META (≤21 dias, com ≥3 dias de dados
  -- depois). Compara por dia-calendário os 7 dias ANTES (D-8..D-2) com os dias DEPOIS
  -- (D..ontem); D-1 (dia em que a troca aconteceu) fica de fora.
  degrau_alt as (
    select distinct on (loja_id, campaign_id) loja_id, campaign_id, data_deteccao as data_troca,
      nullif(valor_antigo,'')::numeric as meta_antes, nullif(valor_novo,'')::numeric as meta_depois
    from ads_alteracoes
    where campo='meta_roas' and data_deteccao >= v_hoje-21
      and (p_loja_ids is null or loja_id = any(p_loja_ids))
    order by loja_id, campaign_id, data_deteccao desc
  ),
  degrau as (
    select da.loja_id, da.campaign_id, da.data_troca, da.meta_antes, da.meta_depois,
      (v_hoje - da.data_troca)::int as dias_depois,
      coalesce(sum(d.gmv)   filter (where d.dia < da.data_troca-1), 0) / 7.0 as gmv_dia_antes,
      coalesce(sum(d.gasto) filter (where d.dia < da.data_troca-1), 0) / 7.0 as gasto_dia_antes,
      coalesce(sum(d.gmv)   filter (where d.dia >= da.data_troca), 0) / (v_hoje - da.data_troca) as gmv_dia_depois,
      coalesce(sum(d.gasto) filter (where d.dia >= da.data_troca), 0) / (v_hoje - da.data_troca) as gasto_dia_depois
    from degrau_alt da
    left join ads_item_performance_daily d on d.loja_id=da.loja_id and d.campaign_id=da.campaign_id
      and d.escopo='direto' and d.dia between da.data_troca-8 and v_hoje-1 and d.dia <> da.data_troca-1
    where da.data_troca <= v_hoje-3
    group by 1,2,3,4,5
  ),
  base as (
    select p.loja_id, p.item_id, coalesce(p.campaign_id, cfg.campaign_id) as campaign_id,
      p.gasto7, p.gmv7, p.gasto28, p.gmv28,
      case when p.gasto7>0 then p.gmv7/p.gasto7 else 0 end as roas_shopee,
      case when p.gasto28>0 then p.gmv28/p.gasto28 else 0 end as roas_shopee28,
      coalesce(case when fi.pedidos_base >= 20 and fi.bruto>0 then fi.efet/fi.bruto end, fl.f, 1) as fator,
      coalesce((select round(100.0*ti.taxa/nullif(ti.vt,0),1) from taxa_item_cache ti
                where ti.loja_id=p.loja_id and ti.item_id=p.item_id::text and ti.vt>0), 14) as taxa_pct,
      ci.custo,
      -- ticket: 7d -> 28d -> preço do catálogo (item sem venda recente não vira 'sem_margem')
      case when p.ped7>0 then p.gmv7/p.ped7
           when p.ped28>0 then p.gmv28/p.ped28
           else ci.preco_catalogo end as ticket,
      case when p.imp7>0 then p.cli7::numeric/p.imp7 end as ctr7,
      case when p.imp28>0 then p.cli28::numeric/p.imp28 end as ctr28,
      case when p.cli7>0 then p.ped7::numeric/p.cli7 end as cr7,
      case when p.cli28>0 then p.ped28::numeric/p.cli28 end as cr28,
      (pr.p7 is not null and pr.p28 is not null and pr.p7 < 0.95*pr.p28) as promo,
      cfg.meta_roas, cfg.data_inicio, cfg.orcamento as orc_config,
      (v_hoje - coalesce(cfg.data_inicio, v_hoje))::int as dias_campanha,
      nm.gasto_medio as gasto_medio_normal, nm.dias_normais, nm.gasto_medio_7d as gasto_medio_normal_7d,
      coalesce(eg.dias_esgotados, 0) as dias_esgotados,
      (v_hoje - am.ultima)::int as dias_desde_meta,
      dg.data_troca, dg.meta_antes, dg.meta_depois, dg.dias_depois,
      dg.gmv_dia_antes, dg.gasto_dia_antes, dg.gmv_dia_depois, dg.gasto_dia_depois
    from perf p
    join cfg on cfg.loja_id=p.loja_id and cfg.item_id=p.item_id
    left join fator_item fi on fi.loja_id=p.loja_id and fi.item_id=p.item_id
    left join fator_loja fl on fl.loja_id=p.loja_id
    left join custo_item ci on ci.loja_id=p.loja_id and ci.item_id=p.item_id
    left join preco_item pr on pr.loja_id=p.loja_id and pr.item_id=p.item_id
    left join normal nm on nm.loja_id=p.loja_id and nm.item_id=p.item_id
    left join esgot eg on eg.loja_id=p.loja_id and eg.campaign_id=coalesce(p.campaign_id, cfg.campaign_id)
    left join alt_meta am on am.loja_id=p.loja_id and am.campaign_id=coalesce(p.campaign_id, cfg.campaign_id)
    left join degrau dg on dg.loja_id=p.loja_id and dg.campaign_id=coalesce(p.campaign_id, cfg.campaign_id)
    where p.gasto7 > 0
  ),
  calc as (
    select *,
      (1 - taxa_pct/100.0 - 0.06 - coalesce(custo,0)/nullif(ticket,0)) as margem,
      roas_shopee * fator as roas_real,
      (ctr7 is not null and ctr28 > 0 and abs(ctr7-ctr28)/ctr28 <= 0.10) as ctr_estavel,
      (cr7  is not null and cr28  > 0 and abs(cr7 -cr28 )/cr28  <= 0.10) as cr_estavel,
      (dias_esgotados >= 5) as esgotado,
      case when dias_campanha < 14 then 'aprendizado'
           when dias_desde_meta is not null and dias_desde_meta < 12 then 'estabilizacao'
           else 'livre' end as estado_janela,
      case when dias_campanha < 14 then 14 - dias_campanha
           when dias_desde_meta is not null and dias_desde_meta < 12 then 12 - dias_desde_meta
           else 0 end as dias_restantes,
      (dias_campanha >= 15 and (dias_desde_meta is null or dias_desde_meta >= 13)) as livre_1d
    from base
  ),
  calc2 as (
    select *,
      1/nullif(margem,0) as roas_min,
      greatest(p_meta_global, 1/nullif(margem,0)) / nullif(fator,0) as meta_calc,
      (select count(distinct d.dia) from ads_item_performance_daily d
        where d.loja_id=c.loja_id and d.item_id=c.item_id and d.escopo='direto'
          and d.dia between v_hoje-3 and v_hoje-1 and d.gasto>0
          and (d.gmv/d.gasto)*c.fator < 0.7 * (1/nullif(c.margem,0))) = 3 as alerta_roas,
      coalesce(esgotado and roas_shopee*fator >= 1/nullif(margem,0), false) as censurado
    from calc c
  ),
  calc3 as (
    select *,
      (meta_roas is not null and roas_shopee < 0.7*meta_roas) as f_meta_nao_entregue,
      (meta_roas is not null and meta_calc is not null and abs(meta_roas - meta_calc) > 0.15*meta_calc) as f_meta_desalinhada,
      (roas_real >= roas_min and roas_shopee >= 0.9*roas_shopee28) as perf_mantida,
      -- Pós-degrau: lucro/dia estimado = GMV × fator × margem − gasto. "Regrediu" quando:
      --   meta SUBIU  → GMV/dia caiu >30% e o lucro/dia ficou menor (público esfriou);
      --   meta DESCEU → lucro/dia caiu >20% (o ROAS caiu mais do que o volume subiu).
      gmv_dia_antes*fator*margem - gasto_dia_antes   as lucro_dia_antes,
      gmv_dia_depois*fator*margem - gasto_dia_depois as lucro_dia_depois,
      coalesce(gasto_dia_antes >= 10 and gmv_dia_antes > 0 and (
        (meta_depois > meta_antes and gmv_dia_depois < 0.7*gmv_dia_antes
          and (gmv_dia_depois*fator*margem - gasto_dia_depois) < (gmv_dia_antes*fator*margem - gasto_dia_antes))
        or
        (meta_depois < meta_antes
          and (gmv_dia_depois*fator*margem - gasto_dia_depois) < 0.8*(gmv_dia_antes*fator*margem - gasto_dia_antes))
      ), false) as f_degrau_regrediu
    from calc2
  ),
  classif as (
    select *,
      case
        when dias_campanha < 14 then 'aprendizado'
        when margem is null or margem <= 0 then 'sem_margem'
        when roas_real < roas_min then 'abaixo_do_minimo'
        when f_degrau_regrediu then 'retomar_meta'
        -- problema_* só quando o item NÃO está confortável (ROAS real < 1,3× mín): item
        -- escalando perde CTR/CR naturalmente; se segue lucrativo vira só observação.
        when ctr7 < 0.8*ctr28 and cr_estavel and roas_real < 1.3*roas_min then 'problema_anuncio'
        when cr7  < 0.8*cr28  and ctr_estavel and roas_real < 1.3*roas_min then 'problema_pagina'
        when f_meta_nao_entregue and estado_janela='estabilizacao' then 'estabilizacao'
        when f_meta_nao_entregue then 'meta_nao_entregue'
        when roas_real >= 1.3*roas_min and not promo then 'campeao'
        when esgotado and roas_real >= roas_min and not promo then 'orcamento_esgotando'
        when f_meta_desalinhada and estado_janela='estabilizacao' then 'estabilizacao'
        when f_meta_desalinhada and livre_1d and perf_mantida then 'pronto_proximo_degrau'
        when f_meta_desalinhada then 'meta_desalinhada'
        else 'saudavel'
      end as classificacao
    from calc3
  ),
  fin as (
    select *,
      case classificacao
        when 'campeao' then 2.5 when 'saudavel' then 2.5 when 'pronto_proximo_degrau' then 2.5
        when 'abaixo_do_minimo' then 0
        when 'sem_margem' then null
        else 1.25 end as mult,
      -- próximo degrau: 15% da meta atual na direção da meta calculada (nunca passa dela)
      case when meta_roas is not null and meta_calc is not null
        then round((meta_roas + sign(meta_calc-meta_roas)*least(abs(meta_calc-meta_roas), 0.15*meta_roas))::numeric, 1) end as proximo_degrau,
      -- degrau pra BAIXO (meta não entregue): −15% da meta, nunca abaixo do ROAS mínimo em
      -- termos de Shopee (mín ÷ fator = empate). A Shopee entrega o que consegue; meta alta
      -- demais só estrangula a entrega.
      case when meta_roas is not null and roas_min is not null
        then round(greatest(0.85*meta_roas, roas_min/nullif(fator,0))::numeric, 1) end as degrau_baixo
    from classif
  ),
  fin2 as (
    select *,
      case classificacao
        when 'pronto_proximo_degrau' then proximo_degrau
        when 'meta_desalinhada'      then proximo_degrau
        when 'meta_nao_entregue'     then case when degrau_baixo < meta_roas then degrau_baixo end
        when 'retomar_meta'          then meta_antes
      end as meta_sugerida
    from fin
  )
  insert into ads_recomendacoes
    (loja_id, dia, item_id, campaign_id, gasto_7d, roas_shopee, fator, roas_real, roas_minimo,
     meta_roas, meta_calculada, dias_campanha, classificacao, acao, detalhe,
     promo, alerta_roas, ctr_7d, ctr_28d, cr_7d, cr_28d,
     roas_28d, gasto_medio_normal_28d, dias_normais_28d, dias_esgotados_7d, censurado_teto,
     orcamento_configurado, orcamento_ideal, estado_janela, dias_restantes_janela, motivo_supressao,
     gasto_medio_normal_7d, degrau_avaliacao, meta_sugerida)
  select loja_id, v_hoje, item_id, campaign_id, round(gasto7,2), round(roas_shopee,2), round(fator,4),
    round(roas_real,2), round(roas_min,2), meta_roas, round(meta_calc,2), dias_campanha, classificacao,
    case classificacao
      when 'aprendizado'           then format('Aguardar (aprendizado, faltam %s dia(s)); não editar meta', dias_restantes)
      when 'sem_margem'            then case
                                          when custo is null then 'Cadastrar custo em Finanças → Produtos & Margem (filtro "só sem custo") — sem base pra ROAS mínimo'
                                          when ticket is null or ticket <= 0 then 'Sem preço de venda conhecido (sem venda e sem preço no catálogo) — checar o produto'
                                          else format('Margem ≤ 0: custo R$%s vs preço R$%s (taxa %s%%) — custo cadastrado errado ou preço abaixo do custo', round(custo,2), round(ticket,2), taxa_pct) end
      when 'abaixo_do_minimo'      then 'Pausar OU revisar página/preço antes de reinvestir'
      when 'retomar_meta'          then format('Voltar a meta para %s: desde a troca %s → %s (%s dias) o GMV/dia foi de R$%s para R$%s e o lucro/dia de R$%s para R$%s — %s',
                                          meta_antes, meta_antes, meta_depois, dias_depois, round(gmv_dia_antes), round(gmv_dia_depois), round(lucro_dia_antes), round(lucro_dia_depois),
                                          case when meta_depois > meta_antes then 'público esfriou' else 'o ROAS caiu mais do que o volume subiu' end)
      when 'problema_anuncio'      then 'Trocar capa / revisar título e preço exibido (CTR caiu, CR estável)'
      when 'problema_pagina'       then 'Auditar preço vs concorrência, avaliações, estoque de variações (CR caiu)'
      when 'estabilizacao'         then format('Aguardar %s dia(s) — janela de estabilização (meta alterada há %s dias)', dias_restantes, dias_desde_meta)
      when 'meta_nao_entregue'     then case when degrau_baixo < meta_roas
                                          then format('Meta não entregue (ROAS Shopee %s vs meta %s): baixar a meta em degrau %s → %s (piso %s = empate) e checar Impulsão Rápida/Aumento Automático',
                                                      round(roas_shopee,1), meta_roas, meta_roas, degrau_baixo, round(roas_min/nullif(fator,0),1))
                                          else format('Meta não entregue (ROAS Shopee %s vs meta %s), mas a meta já está no piso (%s = empate): checar Impulsão Rápida/Aumento Automático, página e preço',
                                                      round(roas_shopee,1), meta_roas, round(roas_min/nullif(fator,0),1)) end
      when 'campeao'               then 'Aumentar orçamento 20-30%; manter meta'
      when 'orcamento_esgotando'   then format('Orçamento esgotando com ROAS saudável (%s de 7 dias no teto): aumentar 20-30%%', dias_esgotados)
      when 'pronto_proximo_degrau' then format('Aplicar próximo degrau da meta: %s → %s (alvo %s)', meta_roas, proximo_degrau, round(meta_calc,1))
      when 'meta_desalinhada'      then 'Ajustar meta na Shopee (em degraus)'
      else 'Nenhuma ação'
    end,
    format('ROAS real %s vs mín %s · meta %s · fator %s%s%s%s%s%s',
      round(roas_real,1), round(roas_min,1), coalesce(meta_roas,0), round(fator,3),
      case when promo then ' · PROMO (não escalar)' else '' end,
      case when alerta_roas then ' · 🚨 3 dias abaixo de 0,7×mín' else '' end,
      case when censurado then format(' · teto: %s/7 dias esgotados', dias_esgotados) else '' end,
      -- observações (v3.1): queda de CTR/CR num item que segue lucrativo; escala recente
      case when classificacao not in ('problema_anuncio','problema_pagina','abaixo_do_minimo','sem_margem','aprendizado')
             and ctr7 < 0.8*ctr28 and cr_estavel then format(' · ⚠️ CTR 7d %s%% vs 28d (segue lucrativo)', round(100*(ctr7/ctr28-1)))
           when classificacao not in ('problema_anuncio','problema_pagina','abaixo_do_minimo','sem_margem','aprendizado')
             and cr7 < 0.8*cr28 and ctr_estavel then format(' · ⚠️ CR 7d %s%% vs 28d (segue lucrativo%s)', round(100*(cr7/cr28-1)),
               case when gasto_medio_normal_7d > 1.5*gasto_medio_normal then format('; gasto 7d %s× o normal de 28d', round(gasto_medio_normal_7d/gasto_medio_normal,1)) else '' end)
           else '' end,
      case when data_troca is not null and classificacao <> 'retomar_meta'
           then format(' · degrau %s→%s há %sd: GMV/dia R$%s→R$%s, lucro/dia R$%s→R$%s (%s)', meta_antes, meta_depois, dias_depois,
                       round(gmv_dia_antes), round(gmv_dia_depois), round(lucro_dia_antes), round(lucro_dia_depois),
                       case when gmv_dia_depois < 0.7*gmv_dia_antes then 'volume caiu, lucro ok' else 'ok' end)
           else '' end),
    promo, alerta_roas, round(ctr7,4), round(ctr28,4), round(cr7,4), round(cr28,4),
    round(roas_shopee28,2), round(gasto_medio_normal,2), dias_normais, dias_esgotados, censurado,
    orc_config,
    case
      when classificacao = 'sem_margem' then null
      when classificacao = 'abaixo_do_minimo' then 0
      -- piso R$10: é o mínimo que a Shopee aceita de orçamento diário (28/set/2026)
      when censurado and orc_config is not null then greatest(10, round(orc_config*1.25, 2))
      when mult is null or gasto_medio_normal is null then null
      -- item escalando: usa o maior entre o normal de 28d e o normal dos últimos 7d
      else greatest(10, round(mult*greatest(gasto_medio_normal, coalesce(gasto_medio_normal_7d, 0)), 2))
    end,
    estado_janela, dias_restantes,
    case
      when classificacao = 'aprendizado' then format('aprendizado: faltam %s dia(s)', dias_restantes)
      when classificacao = 'estabilizacao' then format('estabilização: faltam %s dia(s) (meta alterada há %s dias); suprimida: %s',
        dias_restantes, dias_desde_meta, case when f_meta_nao_entregue then 'meta_nao_entregue' else 'meta_desalinhada' end)
      else null
    end,
    round(gasto_medio_normal_7d, 2),
    case when data_troca is not null then jsonb_build_object(
      'data_troca', data_troca, 'meta_antes', meta_antes, 'meta_depois', meta_depois, 'dias_depois', dias_depois,
      'gmv_dia_antes', round(gmv_dia_antes,2), 'gmv_dia_depois', round(gmv_dia_depois,2),
      'gasto_dia_antes', round(gasto_dia_antes,2), 'gasto_dia_depois', round(gasto_dia_depois,2),
      'roas_antes', round(gmv_dia_antes/nullif(gasto_dia_antes,0),1), 'roas_depois', round(gmv_dia_depois/nullif(gasto_dia_depois,0),1),
      'lucro_dia_antes', round(lucro_dia_antes,2), 'lucro_dia_depois', round(lucro_dia_depois,2),
      'veredito', case when f_degrau_regrediu then 'regrediu'
                       when gmv_dia_depois < 0.7*gmv_dia_antes then 'volume_caiu_lucro_ok' else 'ok' end) end,
    meta_sugerida
  from fin2;

  get diagnostics v_n = row_count;
  return v_n;
end $function$
;

CREATE OR REPLACE FUNCTION public.ads_resumo_controle(p_loja_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date d),
  dia_rec as (
    select max(dia) d from ads_recomendacoes, hoje
    where dia <= hoje.d and (p_loja_ids is null or loja_id = any(p_loja_ids))
  ),
  perf as (
    select dia, gasto, gmv from ads_item_performance_daily, hoje
    where escopo='direto' and (p_loja_ids is null or loja_id = any(p_loja_ids))
      and dia >= hoje.d - 28
  ),
  roas as (
    select
      round((sum(gmv) filter (where dia >= (select d from hoje)-7) / nullif(sum(gasto) filter (where dia >= (select d from hoje)-7),0))::numeric,1) as semana,
      round((sum(gmv) filter (where dia >= (select d from hoje)-14 and dia < (select d from hoje)-7) / nullif(sum(gasto) filter (where dia >= (select d from hoje)-14 and dia < (select d from hoje)-7),0))::numeric,1) as anterior,
      round((sum(gmv) / nullif(sum(gasto),0))::numeric,1) as media4s,
      round(sum(gasto) filter (where dia >= (select d from hoje)-7)::numeric,2) as gasto_semana,
      round((sum(gasto)/28.0)::numeric,2) as gasto_medio_dia
    from perf
  ),
  rec as (
    select classificacao, count(*) qtd, round(sum(gasto_7d)::numeric,0) gasto
    from ads_recomendacoes, dia_rec
    where dia = dia_rec.d and (p_loja_ids is null or loja_id = any(p_loja_ids))
    group by 1
  ),
  saldo as (
    select round(sum(s.saldo)::numeric,2) as total from ads_saldo_diario s, hoje
    where s.dia = (select max(dia) from ads_saldo_diario) and (p_loja_ids is null or s.loja_id = any(p_loja_ids))
  )
  select json_build_object(
    'recs_dia', (select d from dia_rec),
    'roas_semana', (select semana from roas),
    'roas_anterior', (select anterior from roas),
    'roas_media4s', (select media4s from roas),
    'gasto_semana', (select gasto_semana from roas),
    'gasto_medio_dia', (select gasto_medio_dia from roas),
    'saldo', (select total from saldo),
    'saldo_dias', round(((select total from saldo) / nullif((select gasto_medio_dia from roas),0))::numeric,1),
    'por_classificacao', (select coalesce(json_agg(json_build_object('classificacao',classificacao,'qtd',qtd,'gasto',gasto) order by gasto desc),'[]'::json) from rec),
    'gasto_risco', coalesce((select gasto from rec where classificacao='abaixo_do_minimo'),0),
    'itens_aprendizado', coalesce((select qtd from rec where classificacao='aprendizado'),0)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.auditoria_resumo(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with base as (
    select *
    from pedidos_auditoria
    where (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or coalesce(data_pagamento, data_pedido) >= p_inicio)
      and (p_fim is null or coalesce(data_pagamento, data_pedido) < p_fim)
  )
  select json_build_object(
    'pedidos', (select count(*) from base),
    'divergentes', (select count(*) from base where abs(taxa_diferenca) > 0.50),
    'taxa_esperada_total', (select coalesce(sum(taxa_esperada), 0) from base),
    'taxa_real_total', (select coalesce(sum(taxa_real), 0) from base),
    'diferenca_total', (select coalesce(sum(taxa_diferenca), 0) from base),
    'cobrado_a_mais', (select coalesce(sum(taxa_diferenca) filter (where taxa_diferenca > 0), 0) from base),
    'cobrado_a_menos', (select coalesce(sum(taxa_diferenca) filter (where taxa_diferenca < 0), 0) from base)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.carteira_emprestimo(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(total numeric, parcelas integer, primeira date, ultima date)
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(-sum(valor), 0) as total,
         count(*)::int as parcelas,
         min(criado_em)::date as primeira,
         max(criado_em)::date as ultima
    from carteira_transacoes
   where categoria = 'emprestimo' and valor < 0
     and (p_loja_ids is null or loja_id = any(p_loja_ids))
     and (p_inicio is null or criado_em >= p_inicio)
     and (p_fim is null or criado_em < p_fim);
$function$
;

CREATE OR REPLACE FUNCTION public.carteira_entrada_heatmap(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_dias integer DEFAULT 60)
 RETURNS TABLE(dow integer, hora integer, total numeric, qtd integer)
 LANGUAGE sql
 STABLE
AS $function$
  select
    extract(dow  from criado_em at time zone 'America/Sao_Paulo')::int as dow,
    extract(hour from criado_em at time zone 'America/Sao_Paulo')::int as hora,
    coalesce(sum(valor),0) as total,
    count(*)::int as qtd
  from carteira_transacoes
  where categoria = 'renda' and valor > 0
    and criado_em >= now() - (p_dias || ' days')::interval
    and (p_loja_ids is null or loja_id = any(p_loja_ids))
  group by 1, 2;
$function$
;

CREATE OR REPLACE FUNCTION public.carteira_movimento_dia(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_dias integer DEFAULT 60)
 RETURNS TABLE(dow integer, entrou numeric, saiu numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with cal as (
    select extract(dow from d)::int as dow, count(*)::numeric as n
    from generate_series(
      ((now() - (p_dias || ' days')::interval) at time zone 'America/Sao_Paulo')::date,
      (now() at time zone 'America/Sao_Paulo')::date,
      interval '1 day'
    ) d
    group by 1
  ),
  agg as (
    select
      extract(dow from criado_em at time zone 'America/Sao_Paulo')::int as dow,
      coalesce(sum(valor) filter (where valor > 0), 0) as entrou,
      coalesce(sum(valor) filter (where valor < 0), 0) as saiu
    from carteira_transacoes
    where criado_em >= now() - (p_dias || ' days')::interval
      and (p_loja_ids is null or loja_id = any(p_loja_ids))
    group by 1
  )
  select c.dow,
    round(coalesce(a.entrou, 0) / greatest(c.n, 1), 2) as entrou,
    round(coalesce(a.saiu, 0)   / greatest(c.n, 1), 2) as saiu
  from cal c left join agg a on a.dow = c.dow;
$function$
;

CREATE OR REPLACE FUNCTION public.carteira_saldos(p_loja_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(loja_id uuid, nome text, saldo numeric, atualizado_em timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  select distinct on (t.loja_id) t.loja_id, l.nome, t.saldo, t.criado_em
  from carteira_transacoes t
  join lojas l on l.id = t.loja_id
  where (p_loja_ids is null or t.loja_id = any(p_loja_ids))
  order by t.loja_id, t.criado_em desc;
$function$
;

CREATE OR REPLACE FUNCTION public.carteira_saque_dia(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_dias integer DEFAULT 30)
 RETURNS TABLE(dow integer, saque_medio numeric, pct numeric, n_dias integer)
 LANGUAGE sql
 STABLE
AS $function$
  with cal as (
    select extract(dow from d)::int as dow, count(*)::numeric as n
    from generate_series(
      ((now() - (p_dias || ' days')::interval) at time zone 'America/Sao_Paulo')::date,
      (now() at time zone 'America/Sao_Paulo')::date, interval '1 day') d
    group by 1
  ),
  saques as (
    select extract(dow from criado_em at time zone 'America/Sao_Paulo')::int as dow,
           sum(abs(valor)) as total
    from carteira_transacoes
    where valor < 0
      and (categoria = 'saque' or descricao ilike 'PIX Transfer%')
      and criado_em >= now() - (p_dias || ' days')::interval
      and (p_loja_ids is null or loja_id = any(p_loja_ids))
    group by 1
  ),
  tot as (select coalesce(sum(total), 0) as t from saques)
  select c.dow,
    round(coalesce(s.total, 0) / greatest(c.n, 1), 2) as saque_medio,
    round(case when tot.t > 0 then 100 * coalesce(s.total, 0) / tot.t else 0 end, 1) as pct,
    c.n::int as n_dias
  from cal c cross join tot left join saques s on s.dow = c.dow;
$function$
;

CREATE OR REPLACE FUNCTION public.casar_carteira_pedidos(p_loja uuid)
 RETURNS void
 LANGUAGE sql
AS $function$
  update pedidos p
  set valor_recebido = agg.total,
      recebido_em = agg.quando
  from (
    select order_sn, sum(valor) as total, min(criado_em) as quando
    from carteira_transacoes
    where loja_id = p_loja and categoria = 'renda' and coalesce(order_sn, '') <> ''
    group by order_sn
  ) agg
  where p.loja_id = p_loja and p.pedido_externo_id = agg.order_sn;
$function$
;

CREATE OR REPLACE FUNCTION public.chave_referencia_carteira(p_tipo text, p_categoria text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_tipo = 'ESCROW_VERIFIED_ADD' then 'renda'
    when p_tipo in ('FAST_ESCROW_DISBURSE','FAST_ESCROW_DISBURSE_REMAINING') then 'acelera'
    when p_tipo in ('FAST_ESCROW_DEDUCT','ESCROW_DEDUCT') then 'acelera_taxa'
    when p_categoria = 'ads' then 'ads'
    when p_tipo = 'ADJUSTMENT_FOR_RR_AFTER_ESCROW_VERIFIED' then 'reembolso'
    when p_tipo = 'ESCROW_VERIFIED_MINUS' then 'estorno'
    when p_tipo = 'ADJUSTMENT_CENTER_DEDUCT' then 'ajuste407'
    when p_tipo = 'AMS_COMMISSION_FEE_DEDUCT' then 'afiliado463'
    when p_categoria = 'compensacao' then 'compensacoes'
    else null end
$function$
;

CREATE OR REPLACE FUNCTION public.classificar_carteira(p_tipo text, p_descricao text)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select case
    when p_tipo is null and p_descricao ilike '%reembolso por objeto perdido%' then 'compensacao'
    when p_tipo is null then 'desconhecido'
    when p_tipo = 'ADJUSTMENT_CENTER_DEDUCT' then case
        when p_descricao ilike '%DIFAL%' or p_descricao ilike '%diferencial de al%' then 'difal'
        when p_descricao ilike '%volumoso%' then 'logistica_volumoso'
        when p_descricao ilike '%peso cubado%' or p_descricao ilike '%cubad%' then 'logistica_peso'
        when p_descricao ilike '%creditado a maior%' then 'estorno_credito'
        else 'ajuste_debito' end
    when p_tipo = 'SPM_DEDUCT_DIRECT' then case
        when p_descricao ilike '%empr%stimo%' or p_descricao ilike '%loan%' then 'emprestimo'
        when p_descricao ilike '%ads%' or p_descricao ilike '%an_ncio%' or p_descricao ilike '%recarga%' then 'ads'
        else 'desconhecido' end
    else coalesce((select c.categoria from carteira_categorias c where c.tipo = p_tipo), 'desconhecido')
  end
$function$
;

CREATE OR REPLACE FUNCTION public.cobertura_escrow_bruto(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with ped as (
    select count(*) as total
    from pedidos p
    where p.marketplace = 'shopee' and p.pedido_efetivado and p.pedido_externo_id not like 'SH-%'
      and (p_loja_ids is null or p.loja_id = any(p_loja_ids))
      and (p_inicio is null or p.data_pedido >= p_inicio) and (p_fim is null or p.data_pedido < p_fim)
  ),
  com as (
    select count(distinct c.order_sn) as n
    from custos_pedido c
    where c.campo = 'repasse'
      and (p_loja_ids is null or c.loja_id = any(p_loja_ids))
      and (p_inicio is null or c.data_pedido >= p_inicio) and (p_fim is null or c.data_pedido < p_fim)
  )
  select json_build_object('pedidos', ped.total, 'com_detalhamento', com.n) from ped, com;
$function$
;

CREATE OR REPLACE FUNCTION public.conferencia_afiliado_fatura(p_loja uuid)
 RETURNS TABLE(mes_validade text, despesa numeric, cobertura numeric, a_comissao numeric, a_total numeric, b_comissao numeric, b_total numeric, c_comissao numeric, c_total numeric, bate text)
 LANGUAGE sql
 STABLE
AS $function$
  with f as (select * from afiliado_fatura where loja_id = p_loja),
  base as (
    select c.order_sn, c.categoria, -c.valor as valor, c.data_pedido, p.recebido_em
    from custos_pedido c
    left join pedidos p on p.loja_id = c.loja_id and p.pedido_externo_id = c.order_sn and p.marketplace = 'shopee'
    where c.loja_id = p_loja and c.categoria in ('afiliado','serv_afiliado') and c.soma
  ),
  cob as (
    -- % dos pedidos do mês com detalhamento guardado (se baixo, a soma é parcial)
    select to_char(p.data_pedido at time zone 'America/Sao_Paulo','YYYY-MM') as mes,
           count(*) as total,
           count(*) filter (where exists (select 1 from custos_pedido c where c.loja_id = p.loja_id and c.order_sn = p.pedido_externo_id and c.campo = 'repasse')) as com
    from pedidos p where p.loja_id = p_loja and p.marketplace = 'shopee' and p.pedido_efetivado
    group by 1
  ),
  s as (
    select f.mes_validade, f.despesa,
      round(100.0 * coalesce(cb.com,0) / nullif(cb.total,0), 1) as cobertura,
      round(coalesce(sum(b.valor) filter (where b.categoria = 'afiliado' and to_char(b.data_pedido at time zone 'America/Sao_Paulo','YYYY-MM') = f.mes_validade),0),2) as a_comissao,
      round(coalesce(sum(b.valor) filter (where to_char(b.data_pedido at time zone 'America/Sao_Paulo','YYYY-MM') = f.mes_validade),0),2) as a_total,
      round(coalesce(sum(b.valor) filter (where b.categoria = 'afiliado' and to_char(b.data_pedido at time zone 'America/Sao_Paulo','YYYY-MM') = to_char((f.mes_validade||'-01')::date - interval '1 month','YYYY-MM')),0),2) as b_comissao,
      round(coalesce(sum(b.valor) filter (where to_char(b.data_pedido at time zone 'America/Sao_Paulo','YYYY-MM') = to_char((f.mes_validade||'-01')::date - interval '1 month','YYYY-MM')),0),2) as b_total,
      round(coalesce(sum(b.valor) filter (where b.categoria = 'afiliado' and to_char(b.recebido_em at time zone 'America/Sao_Paulo','YYYY-MM') = f.mes_validade),0),2) as c_comissao,
      round(coalesce(sum(b.valor) filter (where to_char(b.recebido_em at time zone 'America/Sao_Paulo','YYYY-MM') = f.mes_validade),0),2) as c_total
    from f
    left join cob cb on cb.mes = f.mes_validade
    left join base b on true
    group by f.mes_validade, f.despesa, cb.com, cb.total
  )
  select mes_validade, despesa, cobertura, a_comissao, a_total, b_comissao, b_total, c_comissao, c_total,
    concat_ws(', ',
      case when abs(a_comissao - despesa) <= despesa * 0.01 then 'A: pedido no mês · só comissão' end,
      case when abs(a_total - despesa) <= despesa * 0.01 then 'A: pedido no mês · comissão + taxa' end,
      case when abs(b_comissao - despesa) <= despesa * 0.01 then 'B: pedido no mês anterior · só comissão' end,
      case when abs(b_total - despesa) <= despesa * 0.01 then 'B: pedido no mês anterior · comissão + taxa' end,
      case when abs(c_comissao - despesa) <= despesa * 0.01 then 'C: repasse no mês · só comissão' end,
      case when abs(c_total - despesa) <= despesa * 0.01 then 'C: repasse no mês · comissão + taxa' end
    ) as bate
  from s order by mes_validade;
$function$
;

CREATE OR REPLACE FUNCTION public.conferencia_afiliado_taxa(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limite integer DEFAULT 50)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with a as (
    select c.loja_id, c.order_sn, c.data_pedido,
      -coalesce(sum(c.valor) filter (where c.categoria = 'afiliado'), 0) as comissao,
      -coalesce(sum(c.valor) filter (where c.categoria = 'serv_afiliado'), 0) as taxa
    from custos_pedido c
    where c.categoria in ('afiliado','serv_afiliado')
      and (p_loja_ids is null or c.loja_id = any(p_loja_ids))
      and (p_inicio is null or c.data_pedido >= p_inicio) and (p_fim is null or c.data_pedido < p_fim)
    group by 1,2,3 having -coalesce(sum(c.valor) filter (where c.categoria = 'afiliado'), 0) > 0
  ),
  b as (select *, case when comissao > 0 then taxa / comissao else null end as razao from a)
  select json_build_object(
    'pedidos_com_afiliado', (select count(*) from b),
    'comissao_total', (select coalesce(round(sum(comissao),2),0) from b),
    'taxa_total', (select coalesce(round(sum(taxa),2),0) from b),
    'razao_media', (select round(avg(razao)*100, 2) from b where razao is not null),
    'fora_da_faixa', (select count(*) from b where razao is null or razao < 0.12 or razao > 0.15),
    'exemplos', (select coalesce(json_agg(json_build_object('order_sn', order_sn, 'comissao', comissao, 'taxa', taxa, 'razao', round(razao*100,2), 'data', data_pedido)), '[]'::json)
                 from (select * from b where razao is null or razao < 0.12 or razao > 0.15 order by comissao desc limit p_limite) x)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.conferencia_carteira_desconhecidos(p_loja_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(loja_id uuid, tipo text, descricao text, qtd bigint, total numeric, ultimo timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  select t.loja_id, t.tipo, left(min(t.descricao), 90), count(*), round(sum(t.valor), 2), max(t.criado_em)
  from carteira_transacoes t
  where t.categoria = 'desconhecido' and (p_loja_ids is null or t.loja_id = any(p_loja_ids))
  group by t.loja_id, t.tipo order by count(*) desc;
$function$
;

CREATE OR REPLACE FUNCTION public.conferencia_carteira_mes(p_loja uuid)
 RETURNS TABLE(mes text, chave text, referencia numeric, autohub numeric, diferenca numeric, ok boolean)
 LANGUAGE sql
 STABLE
AS $function$
  with ref as (select * from carteira_referencia where loja_id = p_loja),
  aut as (
    select r.mes, r.chave, coalesce(sum(t.valor), 0) as v
    from ref r
    left join carteira_transacoes t
      on t.loja_id = r.loja_id
     and chave_referencia_carteira(t.tipo, t.categoria) = r.chave
     and (t.criado_em at time zone 'America/Sao_Paulo')::date between r.periodo_ini and r.periodo_fim
    group by r.mes, r.chave
  )
  select r.mes, r.chave, r.valor, round(a.v, 2), round(a.v - r.valor, 2), abs(a.v - r.valor) <= 0.05
  from ref r join aut a on a.mes = r.mes and a.chave = r.chave
  order by r.mes, r.chave;
$function$
;

CREATE OR REPLACE FUNCTION public.conferencia_frete_vendedor(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limite integer DEFAULT 50)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with f as (
    select c.loja_id, c.order_sn, c.data_pedido, round(sum(c.valor),2) as frete
    from custos_pedido c
    where c.categoria = 'frete' and c.soma
      and (p_loja_ids is null or c.loja_id = any(p_loja_ids))
      and (p_inicio is null or c.data_pedido >= p_inicio) and (p_fim is null or c.data_pedido < p_fim)
    group by 1,2,3 having abs(sum(c.valor)) > 0.005
  )
  select json_build_object(
    'pedidos', (select count(*) from f),
    'custo_total', (select coalesce(round(-sum(frete) filter (where frete < 0),2),0) from f),
    'credito_total', (select coalesce(round(sum(frete) filter (where frete > 0),2),0) from f),
    'exemplos', (select coalesce(json_agg(json_build_object('order_sn', order_sn, 'frete', frete, 'data', data_pedido)), '[]'::json)
                 from (select * from f order by frete asc limit p_limite) x)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.conferencia_pedido_carteira(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limite integer DEFAULT 50)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with rep as (
    select c.loja_id, c.order_sn, c.valor as repasse, c.data_pedido
    from custos_pedido c
    where c.campo = 'repasse'
      and (p_loja_ids is null or c.loja_id = any(p_loja_ids))
      and (p_inicio is null or c.data_pedido >= p_inicio) and (p_fim is null or c.data_pedido < p_fim)
  ),
  cart as (
    select t.loja_id, t.order_sn,
      coalesce(sum(t.valor) filter (where t.tipo = 'ESCROW_VERIFIED_ADD'), 0) as renda,
      coalesce(sum(t.valor) filter (where t.tipo in ('ADJUSTMENT_FOR_RR_AFTER_ESCROW_VERIFIED','ESCROW_VERIFIED_MINUS')), 0) as ajustes,
      bool_or(t.tipo like 'FAST_ESCROW%') as acelera
    from carteira_transacoes t
    where t.order_sn is not null and (p_loja_ids is null or t.loja_id = any(p_loja_ids))
    group by t.loja_id, t.order_sn
  ),
  j as (
    select r.*, c.renda, c.ajustes, coalesce(c.acelera, false) as acelera,
           case when c.order_sn is null then 'sem_repasse' when abs(c.renda - r.repasse) <= 0.01 then 'ok'
                when abs(c.renda + c.ajustes - r.repasse) <= 0.01 then 'ok_com_ajuste' else 'diferenca' end as situacao
    from rep r left join cart c on c.loja_id = r.loja_id and c.order_sn = r.order_sn
  )
  select json_build_object(
    'total', (select count(*) from j),
    'ok', (select count(*) from j where situacao = 'ok'),
    'ok_com_ajuste', (select count(*) from j where situacao = 'ok_com_ajuste'),
    'sem_repasse', (select count(*) from j where situacao = 'sem_repasse'),
    'diferenca', (select count(*) from j where situacao = 'diferenca'),
    'exemplos', (select coalesce(json_agg(json_build_object('order_sn', order_sn, 'repasse', repasse, 'carteira', renda, 'ajustes', ajustes, 'acelera', acelera, 'data', data_pedido)), '[]'::json)
                 from (select * from j where situacao = 'diferenca' order by abs(renda - repasse) desc limit p_limite) x)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.conferencia_pedido_fecha(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limite integer DEFAULT 50)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with r as (
    select c.loja_id, c.order_sn, c.valor as residual, c.data_pedido
    from custos_pedido c
    where c.campo = 'residual'
      and (p_loja_ids is null or c.loja_id = any(p_loja_ids))
      and (p_inicio is null or c.data_pedido >= p_inicio) and (p_fim is null or c.data_pedido < p_fim)
  ),
  desconhecidos as (
    select c.rotulo, count(*) as qtd, round(sum(c.valor),2) as total
    from custos_pedido c
    where c.categoria = 'serv_outros'
      and (p_loja_ids is null or c.loja_id = any(p_loja_ids))
      and (p_inicio is null or c.data_pedido >= p_inicio) and (p_fim is null or c.data_pedido < p_fim)
    group by c.rotulo
  )
  select json_build_object(
    'total', (select count(*) from r),
    'ok', (select count(*) from r where abs(residual) <= 0.01),
    'diferenca', (select count(*) from r where abs(residual) > 0.01),
    'diferenca_valor', (select coalesce(round(sum(abs(residual)),2),0) from r where abs(residual) > 0.01),
    'exemplos', (select coalesce(json_agg(json_build_object('order_sn', order_sn, 'residual', residual, 'data', data_pedido) order by abs(residual) desc), '[]'::json)
                 from (select * from r where abs(residual) > 0.01 order by abs(residual) desc limit p_limite) x),
    'campos_desconhecidos', (select coalesce(json_agg(row_to_json(d)), '[]'::json) from desconhecidos d)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.custos_do_pedido(p_order_sn text)
 RETURNS TABLE(loja_id uuid, order_sn text, campo text, rotulo text, grupo text, categoria text, valor numeric, soma boolean)
 LANGUAGE sql
 STABLE
AS $function$
  select c.loja_id, c.order_sn, c.campo, c.rotulo, c.grupo, c.categoria, c.valor, c.soma
  from custos_pedido c where c.order_sn = p_order_sn
  order by case c.grupo when 'produtos' then 1 when 'frete' then 2 when 'taxas' then 3 when 'afiliado' then 4 when 'outros' then 5 when 'total' then 6 else 7 end, c.campo;
$function$
;

CREATE OR REPLACE FUNCTION public.custos_mensal(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with ped as (
    select to_char(c.data_pedido at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes, c.categoria, round(sum(c.valor),2) as valor,
           count(distinct c.order_sn) filter (where c.campo = 'repasse') as pedidos
    from custos_pedido c
    where (c.soma or c.campo = 'repasse')
      and (p_loja_ids is null or c.loja_id = any(p_loja_ids))
      and (p_inicio is null or c.data_pedido >= p_inicio) and (p_fim is null or c.data_pedido < p_fim)
    group by 1,2
  ),
  cart as (
    select to_char(t.criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes, t.categoria, round(sum(t.valor),2) as valor, count(*) as qtd
    from carteira_transacoes t
    where (p_loja_ids is null or t.loja_id = any(p_loja_ids))
      and (p_inicio is null or t.criado_em >= p_inicio) and (p_fim is null or t.criado_em < p_fim)
    group by 1,2
  )
  select json_build_object(
    'pedido', (select coalesce(json_agg(row_to_json(p) order by p.mes, p.categoria), '[]'::json) from ped p),
    'carteira', (select coalesce(json_agg(json_build_object('mes', c.mes, 'categoria', c.categoria, 'rotulo', rotulo_categoria_carteira(c.categoria), 'valor', c.valor, 'qtd', c.qtd) order by c.mes, c.categoria), '[]'::json) from cart c)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.custos_pedido_linhas(inc jsonb, buy jsonb)
 RETURNS TABLE(campo text, rotulo text, grupo text, categoria text, valor numeric, soma boolean)
 LANGUAGE sql
 IMMUTABLE
AS $function$
  with base as (
    select
      case when jnum(inc,'order_selling_price') > 0 and jnum(coalesce(buy,'{}'::jsonb),'merchant_subtotal') > 0
           then jnum(coalesce(buy,'{}'::jsonb),'merchant_subtotal') else jnum(inc,'order_selling_price') end as venda,
      jnum(inc,'order_selling_price') as selling_price,
      jnum(inc,'original_shopee_discount') as desc_plataforma,
      jnum(inc,'pix_discount') as desc_pix,
      jnum(inc,'voucher_from_seller') as cupom_vendedor,
      jnum(inc->'seller_product_rebate','amount') as acao_comercial,
      jnum(inc,'voucher_from_shopee') as cupom_shopee,
      jnum(inc,'coins') as moedas,
      jnum(inc,'payment_promotion') as promo_pgto,
      jnum(inc,'credit_card_promotion') as promo_cartao,
      jnum(inc,'buyer_paid_shipping_fee') as frete_comprador,
      jnum(inc,'actual_shipping_fee') as frete_real,
      jnum(inc,'shopee_shipping_rebate') as frete_rebate,
      jnum(inc,'shipping_fee_discount_from_3pl') as frete_desc_3pl,
      jnum(inc,'seller_shipping_discount') as frete_desc_vendedor,
      jnum(inc,'reverse_shipping_fee') as frete_reverso,
      jnum(inc,'final_return_to_seller_shipping_fee') as frete_retorno,
      jnum(inc,'commission_fee') as comissao_bruta,
      jnum(inc->'seller_product_rebate','commission_fee_offset') as comissao_rebate,
      jnum(inc->'seller_product_rebate','service_fee_offset') as serv_rebate,
      jnum(inc,'service_fee') as serv_bruta,
      jnum(inc,'order_ams_commission_fee') as afiliado,
      jnum(inc,'seller_transaction_fee') as tx_vendedor,
      jnum(inc,'campaign_fee') as campanha,
      jnum(inc,'fbs_fee') as fbs,
      jnum(inc,'sspl_fee') as sspl,
      jnum(inc,'return_handling_fee') as manuseio_dev,
      jnum(inc,'pay_per_sale') as pay_per_sale,
      jnum(inc,'ads_escrow_top_up_fee_or_technical_support_fee') as ads_top_up,
      jnum(inc,'seller_lost_compensation') as comp_perda,
      jnum(inc,'seller_coin_cash_back') as cashback,
      jnum(inc,'escrow_tax') as imposto_escrow,
      jnum(inc,'withholding_tax') as retencao,
      jnum(inc,'final_product_protection') as protecao,
      jnum(inc,'escrow_amount') as repasse
  ),
  servicos as (
    select coalesce(nullif(s->>'rule_id','')::bigint, 0) as rule_id,
           coalesce(s->>'rule_display_name','') as nome,
           coalesce(nullif(s->>'fee_amount','')::numeric, 0) as fee
    from jsonb_array_elements(case when jsonb_typeof(inc->'net_service_fee_info_list') = 'array' then inc->'net_service_fee_info_list' else '[]'::jsonb end) s
  ),
  linhas as (
    -- Produtos
    select 'venda'::text campo, 'Preço de venda (subtotal do vendedor)'::text rotulo, 'produtos'::text grupo, 'receita'::text categoria, venda valor, true soma from base
    union all select 'desc_pix', 'Desconto Pix ao comprador (compensado nos abatimentos)', 'produtos', 'desconto_pix', -desc_pix, true from base
    union all select 'cupom_vendedor', 'Cupom do vendedor', 'produtos', 'cupom_vendedor', -cupom_vendedor, true from base
    union all select 'desc_plataforma_ressarcido', 'Desconto da plataforma / Pix ressarcido pela Shopee', 'produtos', 'cupom_shopee', desc_plataforma, true from base
    union all select 'acao_comercial', 'Participação em ação comercial (cupom / Pix por conta do vendedor)', 'taxas', 'acao_comercial', -acao_comercial, true from base
    -- Frete (51 + 52 + 54 = 50)
    union all select 'frete_comprador', 'Frete pago pelo comprador', 'frete', 'frete', frete_comprador, true from base
    union all select 'frete_real', 'Frete cobrado pelo parceiro logístico', 'frete', 'frete', -frete_real, true from base
    union all select 'frete_rebate', 'Desconto de frete pago pela Shopee', 'frete', 'frete', frete_rebate, true from base
    union all select 'frete_desc_3pl', 'Desconto de frete da transportadora', 'frete', 'frete', frete_desc_3pl, true from base
    union all select 'frete_desc_vendedor', 'Desconto de frete do vendedor', 'frete', 'frete', -frete_desc_vendedor, true from base
    union all select 'frete_reverso', 'Frete de devolução (reverso)', 'frete', 'frete', -frete_reverso, true from base
    union all select 'frete_retorno', 'Frete de retorno ao vendedor', 'frete', 'frete', -frete_retorno, true from base
    -- Taxas Shopee
    union all select 'comissao_bruta', 'Taxa de comissão bruta', 'taxas', 'comissao', -comissao_bruta, true from base
    union all select 'comissao_rebate', 'Abatimento de comissão (ação comercial / Pix)', 'taxas', 'comissao_rebate', comissao_rebate, true from base
    union all select 'serv_' || s.rule_id, coalesce(r.rotulo, nullif(s.nome,''), 'Taxa de serviço (regra ' || s.rule_id || ')'), 'taxas',
                     case when s.nome ilike '%afili%' then 'serv_afiliado' else coalesce(r.categoria, 'serv_outros') end,
                     -s.fee, true
             from servicos s left join escrow_regras_servico r on r.rule_id = s.rule_id
    union all select 'serv_rebate', 'Abatimento da taxa de serviço (já dentro dos sub-itens)', 'taxas', 'serv_rebate', serv_rebate, false from base
    union all select 'serv_bruta', 'Taxa de serviço bruta (total)', 'taxas', 'memo', -serv_bruta, false from base
    union all select 'tx_vendedor', 'Taxa de transação do vendedor', 'taxas', 'taxa_outros', -tx_vendedor, true from base
    union all select 'campanha', 'Taxa de campanha', 'taxas', 'taxa_outros', -campanha, true from base
    union all select 'fbs', 'Taxa do Full (FBS)', 'taxas', 'taxa_outros', -fbs, true from base
    union all select 'sspl', 'Taxa SSPL', 'taxas', 'taxa_outros', -sspl, true from base
    union all select 'manuseio_devolucao', 'Taxa de manuseio de devolução', 'taxas', 'taxa_outros', -manuseio_dev, true from base
    union all select 'pay_per_sale', 'Pay per sale', 'taxas', 'taxa_outros', -pay_per_sale, true from base
    union all select 'ads_top_up', 'Ads (recarga pelo escrow) / suporte técnico', 'taxas', 'taxa_outros', -ads_top_up, true from base
    union all select 'cashback_moedas', 'Cashback em moedas (vendedor)', 'taxas', 'taxa_outros', -cashback, true from base
    union all select 'imposto_escrow', 'Imposto retido no escrow', 'taxas', 'taxa_outros', -imposto_escrow, true from base
    union all select 'retencao', 'Retenção na fonte', 'taxas', 'taxa_outros', -retencao, true from base
    -- Afiliado
    union all select 'afiliado_comissao', 'Taxa de comissão Afiliados do Vendedor', 'afiliado', 'afiliado', -afiliado, true from base
    -- Compensações dentro do pedido
    union all select 'compensacao_perda', 'Compensação por perda (vendedor)', 'outros', 'compensacao', comp_perda, true from base
    union all select 'protecao_produto', 'Seguro / proteção do produto pago pelo comprador (fora do repasse)', 'memo', 'memo', protecao, false from base
    -- Memo (não somam): lado do comprador / informativo
    union all select 'selling_price', 'Preço de venda informado pela API (order_selling_price)', 'memo', 'memo', selling_price, false from base
    union all select 'promo_pagamento', 'Promoção de pagamento ao comprador (fora do repasse)', 'memo', 'memo', promo_pgto, false from base
    union all select 'promo_cartao', 'Promoção de cartão ao comprador (fora do repasse)', 'memo', 'memo', promo_cartao, false from base
    union all select 'cupom_shopee', 'Cupom da Shopee ao comprador (fora do repasse)', 'memo', 'memo', cupom_shopee, false from base
    union all select 'moedas', 'Moedas Shopee usadas pelo comprador (fora do repasse)', 'memo', 'memo', moedas, false from base
    union all select 'preco_original', 'Preço original', 'memo', 'memo', jnum(inc,'order_original_price'), false from base
    union all select 'desconto_vendedor', 'Desconto do vendedor', 'memo', 'memo', -jnum(inc,'order_seller_discount'), false from base
    union all select 'devolucao_vendedor', 'Reembolso ao comprador (devolução)', 'memo', 'memo', jnum(inc,'seller_return_refund'), false from base
    union all select 'drc_ajustavel', 'Reembolso ajustável (DRC)', 'memo', 'memo', jnum(inc,'drc_adjustable_refund'), false from base
    union all select 'comprador_pagou', 'Total pago pelo comprador', 'memo', 'memo', jnum(inc,'buyer_total_amount'), false from base
    union all select 'ajuste_total', 'Ajustes posteriores (total)', 'memo', 'memo', jnum(inc,'total_adjustment_amount'), false from base
    union all select 'repasse_ajustado', 'Renda do pedido após ajustes', 'total', 'memo', jnum(inc,'escrow_amount_after_adjustment'), false from base
  ),
  tot as (select coalesce(sum(valor) filter (where soma), 0) as s from linhas)
  select l.campo, l.rotulo, l.grupo, l.categoria, round(l.valor, 2), l.soma from linhas l where l.valor <> 0 or l.campo = 'venda'
  union all select 'repasse', 'Renda do pedido', 'total', 'repasse', round(b.repasse, 2), false from base b
  union all select 'residual', 'Não mapeado (repasse − soma das linhas)', 'total', 'residual', round(b.repasse - t.s, 2), false from base b, tot t
$function$
;

CREATE OR REPLACE FUNCTION public.custos_resumo_dre(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with c as (
    select c.categoria, c.campo, c.valor, c.soma, c.order_sn
    from custos_pedido c
    where (p_loja_ids is null or c.loja_id = any(p_loja_ids))
      and (p_inicio is null or c.data_pedido >= p_inicio) and (p_fim is null or c.data_pedido < p_fim)
  ),
  ped as (
    select count(*) as total
    from pedidos p
    where p.marketplace = 'shopee' and p.pedido_efetivado and p.pedido_externo_id not like 'SH-%'
      and (p_loja_ids is null or p.loja_id = any(p_loja_ids))
      and (p_inicio is null or p.data_pedido >= p_inicio) and (p_fim is null or p.data_pedido < p_fim)
  )
  select json_build_object(
    'pedidos', (select total from ped),
    'com_detalhamento', (select count(distinct order_sn) from c where campo = 'repasse'),
    'receita', (select coalesce(sum(valor),0) from c where categoria = 'receita'),
    'desconto_pix', (select coalesce(sum(valor),0) from c where categoria = 'desconto_pix'),
    'cupom_vendedor', (select coalesce(sum(valor),0) from c where categoria = 'cupom_vendedor'),
    'cupom_shopee', (select coalesce(sum(valor),0) from c where categoria = 'cupom_shopee'),
    'acao_comercial', (select coalesce(sum(valor),0) from c where categoria = 'acao_comercial'),
    'frete', (select coalesce(sum(valor),0) from c where categoria = 'frete' and soma),
    'comissao', (select coalesce(sum(valor),0) from c where categoria = 'comissao'),
    'comissao_rebate', (select coalesce(sum(valor),0) from c where categoria = 'comissao_rebate'),
    'serv_transacao', (select coalesce(sum(valor),0) from c where categoria = 'serv_transacao'),
    'serv_item', (select coalesce(sum(valor),0) from c where categoria = 'serv_item'),
    'serv_outros', (select coalesce(sum(valor),0) from c where categoria = 'serv_outros'),
    'serv_afiliado', (select coalesce(sum(valor),0) from c where categoria = 'serv_afiliado'),
    'afiliado', (select coalesce(sum(valor),0) from c where categoria = 'afiliado'),
    'taxa_outros', (select coalesce(sum(valor),0) from c where categoria = 'taxa_outros'),
    'compensacao', (select coalesce(sum(valor),0) from c where categoria = 'compensacao' and soma),
    'repasse', (select coalesce(sum(valor),0) from c where campo = 'repasse'),
    'residual', (select coalesce(sum(valor),0) from c where campo = 'residual')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.divergencias_recebimento(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limite integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(pedido_externo_id text, cliente_nome text, uf text, esperado numeric, recebido numeric, dif numeric, data_pedido timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  select pedido_externo_id, cliente_nome, uf,
    round(coalesce(valor_liquido, valor_total)::numeric, 2) as esperado,
    round(coalesce(valor_recebido, 0)::numeric, 2) as recebido,
    round((coalesce(valor_recebido, 0) - coalesce(valor_liquido, valor_total))::numeric, 2) as dif,
    data_pedido
  from pedidos
  where marketplace in ('shopee','tiktok_shop') and pedido_efetivado and recebido_em is not null
    and abs(coalesce(valor_recebido, 0) - coalesce(valor_liquido, valor_total)) > 0.5
    and (p_loja_ids is null or loja_id = any(p_loja_ids))
    and (p_inicio is null or data_pedido >= p_inicio)
    and (p_fim is null or data_pedido < p_fim)
  order by abs(coalesce(valor_recebido, 0) - coalesce(valor_liquido, valor_total)) desc, pedido_externo_id
  offset p_offset
  limit p_limite;
$function$
;

CREATE OR REPLACE FUNCTION public.evolucao_entrega(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_uf text DEFAULT NULL::text, p_semanas integer DEFAULT 12)
 RETURNS TABLE(semana date, media_dias numeric, amostra integer)
 LANGUAGE sql
 STABLE
AS $function$
  select date_trunc('week', entregue_em at time zone 'America/Sao_Paulo')::date as semana,
    round(avg(extract(epoch from (entregue_em - data_pedido)) / 86400.0)::numeric, 1) as media_dias,
    count(*)::int as amostra
  from pedidos
  where marketplace = 'shopee' and pedido_efetivado
    and entregue_em is not null and data_pedido is not null
    and (p_uf is null or uf = p_uf)
    and entregue_em >= now() - ((p_semanas * 7) || ' days')::interval
    and extract(epoch from (entregue_em - data_pedido)) / 86400.0 between 0 and 90
    and (p_loja_ids is null or loja_id = any(p_loja_ids))
  group by 1 order by 1;
$function$
;

CREATE OR REPLACE FUNCTION public.evolucao_mensal(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_meses integer DEFAULT 6)
 RETURNS TABLE(mes text, receita numeric, custos numeric, cmv numeric, resultado numeric, margem_pct numeric, pedidos integer)
 LANGUAGE sql
 STABLE
AS $function$
  with corte as (
    select (date_trunc('month', now() at time zone 'America/Sao_Paulo') - ((p_meses - 1) || ' months')::interval)::date as ini
  ),
  fin as (
    select to_char(dia, 'YYYY-MM') as mes,
      sum(receita_bruta) as receita,
      sum(abs(taxas)) + sum(abs(afiliado)) + sum(abs(cupom_proprio)) as custos,
      sum(total_pedidos)::int as pedidos
    from financas_resumo_diario, corte
    where (p_loja_ids is null or loja_id = any(p_loja_ids)) and dia >= corte.ini
    group by 1
  ),
  cmv as (
    select to_char(dia, 'YYYY-MM') as mes, sum(cmv) as cmv
    from financas_cmv_diario, corte
    where (p_loja_ids is null or loja_id = any(p_loja_ids)) and dia >= corte.ini
    group by 1
  )
  select f.mes,
    round(f.receita, 0) as receita,
    round(f.custos, 0) as custos,
    round(coalesce(c.cmv, 0), 0) as cmv,
    round(f.receita - f.custos - coalesce(c.cmv, 0), 0) as resultado,
    round(case when f.receita > 0 then 100 * (f.receita - f.custos - coalesce(c.cmv, 0)) / f.receita else 0 end, 1) as margem_pct,
    f.pedidos
  from fin f left join cmv c on c.mes = f.mes
  order by f.mes;
$function$
;

CREATE OR REPLACE FUNCTION public.gerar_ranking_produtos()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  delete from ranking_produtos;
  insert into ranking_produtos (loja_id, produto_id, pedidos, faturamento, lucro, atualizado_em)
  select pr.loja_id, pr.id, agg.un::int,
    round(agg.receita,2),
    round(agg.receita - (agg.un * coalesce(cv_custo, pr.custo, 0)), 2),
    now()
  from (
    select p.loja_id, (it->>'item_id') as item_id,
      sum(coalesce(nullif(it->>'model_quantity_purchased','')::numeric,0)) as un,
      sum(coalesce(nullif(it->>'model_quantity_purchased','')::numeric,0) *
          case when coalesce(nullif(it->>'model_discounted_price','')::numeric,0)>0
               then nullif(it->>'model_discounted_price','')::numeric
               else nullif(it->>'model_original_price','')::numeric end) as receita,
      avg(cvx.custo) as cv_custo
    from pedidos p cross join lateral jsonb_array_elements(
      case jsonb_typeof(p.dados_pedido->'item_list') when 'array' then p.dados_pedido->'item_list' else '[]'::jsonb end) it
    left join custos_variacao cvx on cvx.loja_id=p.loja_id and cvx.model_sku=upper(trim(it->>'model_sku'))
    where p.marketplace='shopee' and p.pedido_efetivado
      and coalesce(p.data_pagamento,p.data_pedido) >= now() - interval '90 days'
    group by 1,2
  ) agg
  join produtos pr on pr.loja_id=agg.loja_id and pr.item_id=agg.item_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.jnum(j jsonb, k text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when j ? k and jsonb_typeof(j->k) = 'number' then (j->>k)::numeric else 0 end
$function$
;

CREATE OR REPLACE FUNCTION public.marcar_escrow_final(p_lote integer DEFAULT 20000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare v int;
begin
  with alvo as (
    select p.id from pedidos p
    where p.marketplace = 'shopee' and p.pedido_efetivado and not p.escrow_final
      and p.escrow_atualizado_em is not null
      and exists (
        select 1 from carteira_transacoes t
        where t.loja_id = p.loja_id and t.order_sn = p.pedido_externo_id
          and t.tipo in ('ESCROW_VERIFIED_ADD','FAST_ESCROW_DEDUCT','ESCROW_DEDUCT')
          and t.criado_em <= p.escrow_atualizado_em
      )
    limit p_lote
  )
  update pedidos p set escrow_final = true from alvo where p.id = alvo.id;
  get diagnostics v = row_count;
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.margem_catalogo(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_offset integer DEFAULT 0, p_limite integer DEFAULT 100, p_busca text DEFAULT NULL::text, p_sem_custo boolean DEFAULT false, p_incluir_sem_venda boolean DEFAULT true)
 RETURNS TABLE(loja_id uuid, item_id text, produto text, model_sku text, variacao text, unidades numeric, preco numeric, custo numeric, taxa_pct numeric, margem_valor numeric, margem_pct numeric, sem_custo boolean, total_linhas bigint, produto_id uuid, fonte text)
 LANGUAGE sql
 STABLE
AS $function$
  with taxa_item as (
    select loja_id, item_id, taxa, vt from taxa_item_cache
    where (p_loja_ids is null or loja_id = any(p_loja_ids))
  ),
  media as (select round(100.0 * sum(taxa) / nullif(sum(vt), 0), 1) as pct from taxa_item),
  -- (a) variações que venderam nos últimos 90 dias (como antes)
  vars as (
    select vr.loja_id, vr.item_id, pr.nome as produto,
      norm_sku(vr.model_sku) as model_sku, max(vr.variacao) as variacao,
      sum(vr.un) as unidades,
      sum(vr.receita) / nullif(sum(vr.un), 0) as preco,
      max(cv.custo) as custo,
      pr.id as produto_id, 'variacao'::text as fonte
    from variacoes_resumo vr
    left join produtos pr on pr.loja_id = vr.loja_id and pr.item_id = vr.item_id
    left join custos_variacao cv on cv.loja_id = vr.loja_id and norm_sku(cv.model_sku) = norm_sku(vr.model_sku)
    where (p_loja_ids is null or vr.loja_id = any(p_loja_ids))
    group by vr.loja_id, vr.item_id, pr.nome, pr.id, norm_sku(vr.model_sku)
  ),
  -- Quantas variações (com SKU) a API conhece de cada produto (produto_variacoes).
  -- 0 ou 1 = produto "de SKU único" (custo no item); 2+ = produto com variações.
  n_modelos as (
    select loja_id, item_id,
      count(*) filter (where status = 'MODEL_NORMAL' and coalesce(model_sku,'') <> '') as n
    from produto_variacoes
    where (p_loja_ids is null or loja_id = any(p_loja_ids))
    group by 1,2
  ),
  -- (c) variações conhecidas pela API que ainda NÃO venderam (90d): entram com preço
  -- atual e custo por variação (custos_variacao pelo model_sku), pra cadastrar antes
  -- da primeira venda.
  modelos as (
    select distinct on (pv.loja_id, pv.item_id, norm_sku(pv.model_sku))
      pv.loja_id, pv.item_id, pr.nome as produto,
      norm_sku(pv.model_sku) as model_sku, coalesce(nullif(pv.nome,''), '(variação)') as variacao,
      0::numeric as unidades, nullif(pv.preco, 0) as preco,
      (select max(cv.custo) from custos_variacao cv
        where cv.loja_id = pv.loja_id and norm_sku(cv.model_sku) = norm_sku(pv.model_sku)) as custo,
      pr.id as produto_id, 'modelo'::text as fonte
    from produto_variacoes pv
    join produtos pr on pr.loja_id = pv.loja_id and pr.item_id = pv.item_id
    join n_modelos nm on nm.loja_id = pv.loja_id and nm.item_id = pv.item_id and nm.n >= 2
    where p_incluir_sem_venda and pr.marketplace = 'shopee' and pr.status = 'NORMAL'
      and pv.status = 'MODEL_NORMAL' and coalesce(pv.model_sku,'') <> ''
      and (p_loja_ids is null or pv.loja_id = any(p_loja_ids))
      and not exists (select 1 from variacoes_resumo vr
                      where vr.loja_id = pv.loja_id and vr.item_id = pv.item_id and norm_sku(vr.model_sku) = norm_sku(pv.model_sku))
    order by pv.loja_id, pv.item_id, norm_sku(pv.model_sku), pv.model_id
  ),
  -- (b) produtos ativos sem nenhuma variação vendida E sem variações conhecidas (SKU
  -- único ou novo): linha do produto inteiro
  itens as (
    select pr.loja_id, pr.item_id, pr.nome as produto,
      norm_sku(pr.sku) as model_sku, '(produto inteiro)'::text as variacao,
      coalesce((select sum(pi.qtd) from pedido_itens pi join pedidos p on p.id = pi.pedido_id
                where pi.loja_id = pr.loja_id and pi.item_id = pr.item_id and p.pedido_efetivado
                  and pi.dia >= (now() at time zone 'America/Sao_Paulo')::date - 90), 0) as unidades,
      nullif(pr.preco, 0) as preco,
      coalesce((select max(cv.custo) from custos_variacao cv
                where cv.loja_id = pr.loja_id and coalesce(pr.sku,'') <> '' and norm_sku(cv.model_sku) = norm_sku(pr.sku)),
               pr.custo) as custo,
      pr.id as produto_id, 'item'::text as fonte
    from produtos pr
    where p_incluir_sem_venda and pr.marketplace = 'shopee' and pr.status = 'NORMAL'
      and (p_loja_ids is null or pr.loja_id = any(p_loja_ids))
      and not exists (select 1 from variacoes_resumo vr where vr.loja_id = pr.loja_id and vr.item_id = pr.item_id)
      and not exists (select 1 from n_modelos nm where nm.loja_id = pr.loja_id and nm.item_id = pr.item_id and nm.n >= 2)
  ),
  base0 as (select * from vars union all select * from modelos union all select * from itens),
  base as (
    select b.*,
      coalesce(
        (select round(100.0 * ti.taxa / nullif(ti.vt, 0), 1) from taxa_item ti
          where ti.loja_id = b.loja_id and ti.item_id = b.item_id and ti.vt > 0),
        (select pct from media)
      ) as taxa_pct
    from base0 b
    where (p_busca is null or p_busca = '' or b.produto ilike '%'||p_busca||'%' or b.model_sku ilike '%'||p_busca||'%' or b.item_id = p_busca)
      and (not p_sem_custo or b.custo is null)
  ),
  calc as (
    select *,
      (coalesce(preco,0) - coalesce(preco,0)*taxa_pct/100 - coalesce(preco,0)*0.06 - coalesce(custo,0)) as margem_valor
    from base
  )
  select loja_id, item_id, coalesce(produto,'(produto sem nome)') as produto, model_sku, variacao,
    unidades, round(preco::numeric,2) as preco, custo, taxa_pct,
    round(margem_valor::numeric,2) as margem_valor,
    round(case when preco>0 then 100*margem_valor/preco else 0 end::numeric,1) as margem_pct,
    (custo is null) as sem_custo,
    count(*) over() as total_linhas,
    produto_id, fonte
  from calc
  order by produto, item_id, model_sku
  offset p_offset limit p_limite;
$function$
;

CREATE OR REPLACE FUNCTION public.norm_sku(s text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$ select upper(regexp_replace(coalesce(s,''), '\s', '', 'g')) $function$
;

CREATE OR REPLACE FUNCTION public.pedidos_para_reconferir_repasse(p_limite integer DEFAULT 150)
 RETURNS TABLE(id uuid, loja_id uuid, pedido_externo_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select p.id, p.loja_id, p.pedido_externo_id
  from pedidos p
  where p.marketplace = 'shopee' and p.pedido_efetivado
    and p.pedido_externo_id not like 'SH-%'
    and not p.escrow_final
    and p.escrow_atualizado_em is not null
    and p.data_pedido >= now() - interval '120 days'
    and exists (
      select 1 from carteira_transacoes t
      where t.loja_id = p.loja_id and t.order_sn = p.pedido_externo_id
        and t.tipo in ('ESCROW_VERIFIED_ADD','FAST_ESCROW_DEDUCT','ESCROW_DEDUCT')
        and t.criado_em > p.escrow_atualizado_em
    )
  order by p.data_pedido desc
  limit p_limite;
$function$
;

CREATE OR REPLACE FUNCTION public.pedidos_sem_escrow_bruto(p_loja uuid DEFAULT NULL::uuid, p_desde date DEFAULT '2026-01-01'::date, p_ate date DEFAULT NULL::date, p_limite integer DEFAULT 400)
 RETURNS TABLE(loja_id uuid, pedido_externo_id text, data_pedido timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  select p.loja_id, p.pedido_externo_id, p.data_pedido
  from pedidos p
  where p.marketplace = 'shopee' and p.pedido_efetivado
    and p.pedido_externo_id not like 'SH-%'
    and p.escrow_atualizado_em is not null
    and (p_loja is null or p.loja_id = p_loja)
    and p.data_pedido >= p_desde::timestamptz
    and (p_ate is null or p.data_pedido < (p_ate + 1)::timestamptz)
    and not exists (select 1 from pedido_escrow e where e.loja_id = p.loja_id and e.order_sn = p.pedido_externo_id)
  order by p.data_pedido desc
  limit p_limite;
$function$
;

CREATE OR REPLACE FUNCTION public.previsao_fluxo_caixa(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_dias integer DEFAULT 30)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with lg as (
    select uf, avg(media_dias) as media_dias, sum(amostra)::int as amostra
    from previsao_lag where (p_loja_ids is null or loja_id = any(p_loja_ids)) group by uf
  ),
  geral as (select media_dias, amostra from lg where uf = 'GERAL'),
  p90 as (
    select percentile_cont(0.9) within group (order by lag) as p90d
    from (
      select extract(epoch from (recebido_em - data_pedido)) / 86400.0 as lag
      from pedidos
      where marketplace in ('shopee','tiktok_shop') and recebido_em is not null and data_pedido is not null
        and (p_loja_ids is null or loja_id = any(p_loja_ids))
    ) x
    where lag between 0 and 90
  ),
  hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  abertos as (
    select f.dia, f.uf, f.a_receber as valor, f.qtd_a_receber as qtd,
      coalesce((select round(l.media_dias) from lg l where l.uf = f.uf and l.amostra >= 5),
               (select round(media_dias) from geral), 7) as lag
    from financas_resumo_diario f
    where (p_loja_ids is null or f.loja_id = any(p_loja_ids)) and f.a_receber > 0
  ),
  previsto as (
    select (dia + lag::int) as data_prev,
           (dia + (select round(p90d)::int from p90)) as data_prev_p90,
           valor, qtd
    from abertos
  ),
  por_dia as (
    select data_prev as diap, sum(valor) as valor, sum(qtd)::int as pedidos
    from previsto, hoje
    where data_prev >= hoje.d and data_prev < hoje.d + p_dias group by 1
  ),
  atrasado as (
    select coalesce(sum(valor), 0) as valor, coalesce(sum(qtd), 0)::int as pedidos
    from previsto, hoje where data_prev_p90 < hoje.d
  )
  select json_build_object(
    'media_geral_dias', (select round(media_dias::numeric, 1) from geral),
    'p90_dias', (select round(p90d::numeric, 1) from p90),
    'base_amostra', (select amostra from geral),
    'total_a_receber', (select coalesce(sum(valor), 0) from abertos),
    'qtd_a_receber', (select coalesce(sum(qtd), 0)::int from abertos),
    'atrasado_valor', (select valor from atrasado),
    'atrasado_pedidos', (select pedidos from atrasado),
    'proximos_dias', (select coalesce(json_agg(json_build_object('dia', to_char(diap, 'YYYY-MM-DD'), 'valor', valor, 'pedidos', pedidos) order by diap), '[]'::json) from por_dia),
    'por_uf', (select coalesce(json_agg(json_build_object('uf', uf, 'dias', round(media_dias::numeric, 1), 'amostra', amostra) order by media_dias asc), '[]'::json) from lg where uf <> 'GERAL' and amostra >= 1)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.rebuild_custos_pedido(p_loja uuid, p_order_sns text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare v int;
begin
  delete from custos_pedido where loja_id = p_loja and order_sn = any(p_order_sns);
  insert into custos_pedido (loja_id, order_sn, campo, rotulo, grupo, categoria, valor, soma, data_pedido)
  select e.loja_id, e.order_sn,
         case when l.n > 1 then l.campo || '_' || l.n else l.campo end,
         l.rotulo, l.grupo, l.categoria, l.valor, l.soma, p.data_pedido
  from pedido_escrow e
  left join pedidos p on p.loja_id = e.loja_id and p.pedido_externo_id = e.order_sn and p.marketplace = 'shopee'
  cross join lateral (
    select x.*, row_number() over (partition by x.campo order by x.valor) as n
    from custos_pedido_linhas(e.income, e.buyer) x
  ) l
  where e.loja_id = p_loja and e.order_sn = any(p_order_sns)
  on conflict (loja_id, order_sn, campo) do update
    set rotulo = excluded.rotulo, grupo = excluded.grupo, categoria = excluded.categoria,
        valor = excluded.valor, soma = excluded.soma, data_pedido = excluded.data_pedido;
  get diagnostics v = row_count;
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.rebuild_custos_pedido_todos(p_loja uuid, p_bloco integer DEFAULT 2000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare lote text[]; total int := 0; n int;
begin
  loop
    select array_agg(order_sn) into lote from (
      select e.order_sn from pedido_escrow e
      where e.loja_id = p_loja
        and not exists (select 1 from custos_pedido c where c.loja_id = e.loja_id and c.order_sn = e.order_sn and c.campo = 'repasse')
      limit p_bloco) x;
    exit when lote is null;
    n := rebuild_custos_pedido(p_loja, lote);
    total := total + n;
  end loop;
  return total;
end $function$
;

CREATE OR REPLACE FUNCTION public.rebuild_financas_cmv()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  drop table if exists _itens_custo;
  create temp table _itens_custo as
    select pi.loja_id, pi.dia, pi.uf, pi.item_id, pi.model_sku, pi.variacao, pi.qtd, pi.preco,
           coalesce(cv.custo, pr.custo, cvc.custo, prc.custo) as custo
    from pedido_itens pi
    left join lojas l on l.id = pi.loja_id
    -- 1º: custo cadastrado na própria loja (por SKU da variação, depois por item)
    left join custos_variacao cv on cv.loja_id = pi.loja_id and cv.model_sku = pi.model_sku
    left join produtos pr        on pr.loja_id = pi.loja_id and pr.item_id  = pi.item_id
    -- 2º: mesmo SKU em OUTRA loja da mesma conta (TikTok usa os SKUs da Shopee)
    left join lateral (
      select c2.custo from custos_variacao c2
      join lojas l2 on l2.id = c2.loja_id
      where l2.conta_id = l.conta_id and c2.loja_id <> pi.loja_id
        and c2.model_sku = pi.model_sku and c2.custo is not null
      order by c2.atualizado_em desc nulls last limit 1
    ) cvc on coalesce(pi.model_sku,'') <> ''
    left join lateral (
      select p2.custo from produtos p2
      join lojas l2 on l2.id = p2.loja_id
      where l2.conta_id = l.conta_id and p2.loja_id <> pi.loja_id
        and upper(trim(p2.sku)) = pi.model_sku and p2.custo is not null
      order by p2.atualizado_em desc nulls last limit 1
    ) prc on coalesce(pi.model_sku,'') <> '';

  delete from financas_cmv_diario where true;
  insert into financas_cmv_diario (loja_id, dia, uf, cmv, unidades, itens_total, itens_com_custo)
  select loja_id, dia, uf,
    coalesce(sum(qtd*custo) filter (where custo is not null),0),
    coalesce(sum(qtd),0), count(*)::int,
    count(*) filter (where custo is not null)::int
  from _itens_custo group by 1,2,3;

  delete from variacoes_resumo where true;
  insert into variacoes_resumo
  select loja_id, item_id, model_sku, max(variacao), sum(qtd), sum(qtd*preco)
  from _itens_custo
  where dia >= ((now() at time zone 'America/Sao_Paulo')::date - 90) and coalesce(model_sku,'') <> ''
  group by 1,2,3;

  drop table if exists _itens_custo;
end $function$
;

CREATE OR REPLACE FUNCTION public.rebuild_financas_cmv_loja(p_loja uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  drop table if exists _itens_custo_loja;
  create temp table _itens_custo_loja as
    select pi.loja_id, pi.dia, pi.uf, pi.item_id, pi.model_sku, pi.variacao, pi.qtd, pi.preco,
           coalesce(cv.custo, pr.custo, cvc.custo, prc.custo) as custo
    from pedido_itens pi
    left join lojas l on l.id = pi.loja_id
    left join custos_variacao cv on cv.loja_id = pi.loja_id and cv.model_sku = pi.model_sku
    left join produtos pr        on pr.loja_id = pi.loja_id and pr.item_id  = pi.item_id
    left join lateral (
      select c2.custo from custos_variacao c2 join lojas l2 on l2.id = c2.loja_id
      where l2.conta_id = l.conta_id and c2.loja_id <> pi.loja_id and c2.model_sku = pi.model_sku and c2.custo is not null
      order by c2.atualizado_em desc nulls last limit 1
    ) cvc on coalesce(pi.model_sku,'') <> ''
    left join lateral (
      select p2.custo from produtos p2 join lojas l2 on l2.id = p2.loja_id
      where l2.conta_id = l.conta_id and p2.loja_id <> pi.loja_id and upper(trim(p2.sku)) = pi.model_sku and p2.custo is not null
      order by p2.atualizado_em desc nulls last limit 1
    ) prc on coalesce(pi.model_sku,'') <> ''
    where pi.loja_id = p_loja;

  delete from financas_cmv_diario where loja_id = p_loja;
  insert into financas_cmv_diario (loja_id, dia, uf, cmv, unidades, itens_total, itens_com_custo)
  select loja_id, dia, uf,
    coalesce(sum(qtd*custo) filter (where custo is not null),0),
    coalesce(sum(qtd),0), count(*)::int,
    count(*) filter (where custo is not null)::int
  from _itens_custo_loja group by 1,2,3;

  delete from variacoes_resumo where loja_id = p_loja;
  insert into variacoes_resumo
  select loja_id, item_id, model_sku, max(variacao), sum(qtd), sum(qtd*preco)
  from _itens_custo_loja
  where dia >= ((now() at time zone 'America/Sao_Paulo')::date - 90) and coalesce(model_sku,'') <> ''
  group by 1,2,3;

  drop table if exists _itens_custo_loja;
end $function$
;

CREATE OR REPLACE FUNCTION public.rebuild_financas_dre()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  delete from financas_resumo_diario where true;
  insert into financas_resumo_diario
    (loja_id, dia, uf, total_pedidos, receita_bruta, taxas, cupom_proprio, qtd_cupom,
     afiliado, qtd_afiliado, receita_liquida, taxa_servico_afiliado, cmv, unidades,
     itens_total, itens_com_custo, a_receber, qtd_a_receber, frete_custo)
  select p.loja_id,
    (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date,
    coalesce(p.uf, '—'),
    count(*)::int,
    coalesce(sum(p.valor_total),0),
    coalesce(sum(coalesce(p.taxa_comissao,0)+coalesce(p.taxa_servico,0)),0),
    coalesce(sum(p.cupom_loja),0),
    count(*) filter (where coalesce(p.cupom_loja,0) > 0)::int,
    coalesce(sum(p.comissao_afiliado),0),
    count(*) filter (where coalesce(p.comissao_afiliado,0) > 0)::int,
    coalesce(sum(p.valor_liquido) filter (where p.escrow_atualizado_em is not null),0),
    coalesce(sum(p.taxa_servico_afiliado),0),
    0,0,0,0,
    coalesce(sum(coalesce(p.valor_liquido, p.valor_total)) filter (where p.recebido_em is null and coalesce(p.data_pagamento,p.data_pedido) >= now() - interval '45 days'),0),
    count(*) filter (where p.recebido_em is null and coalesce(p.data_pagamento,p.data_pedido) >= now() - interval '45 days')::int,
    coalesce(sum(p.frete_custo),0)
  from pedidos p
  where p.marketplace in ('shopee','tiktok_shop') and p.pedido_efetivado and coalesce(p.data_pagamento,p.data_pedido) is not null
  group by 1,2,3;

  delete from financas_recebido_diario where true;
  insert into financas_recebido_diario
  select loja_id, (recebido_em at time zone 'America/Sao_Paulo')::date, coalesce(sum(valor_recebido),0), count(*)::int
  from pedidos where marketplace in ('shopee','tiktok_shop') and recebido_em is not null group by 1,2;

  delete from previsao_lag where true;
  insert into previsao_lag
  select loja_id, uf, avg(lag), count(*)::int from (
    select loja_id, coalesce(uf,'—') as uf, extract(epoch from (recebido_em - data_pedido))/86400.0 as lag
    from pedidos where marketplace in ('shopee','tiktok_shop') and recebido_em is not null and data_pedido is not null
  ) x where lag between 0 and 90 group by 1,2;
  insert into previsao_lag
  select loja_id, 'GERAL', avg(lag), count(*)::int from (
    select loja_id, extract(epoch from (recebido_em - data_pedido))/86400.0 as lag
    from pedidos where marketplace in ('shopee','tiktok_shop') and recebido_em is not null and data_pedido is not null
  ) x where lag between 0 and 90 group by 1;
end $function$
;

CREATE OR REPLACE FUNCTION public.rebuild_financas_resumo_diario()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ begin perform rebuild_financas_dre(); perform refresh_cmv(); end $function$
;

CREATE OR REPLACE FUNCTION public.rebuild_pedidos_resumo_diario()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  set local statement_timeout = '120s';
  delete from pedidos_resumo_diario where true;
  insert into pedidos_resumo_diario (loja_id, dia, status, efetivado, faturado, qtd, valor)
  select loja_id,
    (coalesce(data_pagamento, data_pedido) at time zone 'America/Sao_Paulo')::date as dia,
    coalesce(status,'UNKNOWN') as status,
    coalesce(pedido_efetivado,false) as efetivado,
    coalesce(entra_faturamento,false) as faturado,
    count(*)::int as qtd, coalesce(sum(valor_total),0) as valor
  from pedidos
  where marketplace='shopee' and coalesce(data_pagamento,data_pedido) is not null
  group by 1,2,3,4,5;
end $function$
;

CREATE OR REPLACE FUNCTION public.recebimento_aging(p_loja_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with cs as (
    select loja_id, min(criado_em) as ini from carteira_transacoes group by loja_id
    union all
    select loja_id, min(statement_time) as ini from tiktok_extratos group by loja_id
  ),
  base as (
    select coalesce(p.valor_liquido, p.valor_total) as esperado,
           extract(epoch from (now() - p.data_pedido)) / 86400.0 as dias
    from pedidos p
    join cs on cs.loja_id = p.loja_id
    where p.marketplace in ('shopee','tiktok_shop') and p.pedido_efetivado and p.origem is null
      and coalesce(p.valor_liquido, 0) > 0 and p.recebido_em is null
      and p.data_pedido is not null and p.data_pedido >= cs.ini
      and (p_loja_ids is null or p.loja_id = any(p_loja_ids))
  )
  select json_build_object(
    'b0_30_qtd',  count(*) filter (where dias < 30),
    'b0_30_val',  coalesce(sum(esperado) filter (where dias < 30), 0),
    'b30_60_qtd', count(*) filter (where dias >= 30 and dias < 60),
    'b30_60_val', coalesce(sum(esperado) filter (where dias >= 30 and dias < 60), 0),
    'b60_qtd',    count(*) filter (where dias >= 60),
    'b60_val',    coalesce(sum(esperado) filter (where dias >= 60), 0)
  ) from base;
$function$
;

CREATE OR REPLACE FUNCTION public.reclassificar_carteira(p_loja uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare v int;
begin
  update carteira_transacoes t
  set categoria = classificar_carteira(t.tipo, t.descricao)
  where (p_loja is null or t.loja_id = p_loja)
    and t.categoria is distinct from classificar_carteira(t.tipo, t.descricao);
  get diagnostics v = row_count;
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.reconferencia_escrow_ids(p_limite integer DEFAULT 150)
 RETURNS TABLE(id uuid, loja_id uuid, pedido_externo_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select p.id, p.loja_id, p.pedido_externo_id from pedidos p
  where p.marketplace='shopee' and p.pedido_efetivado
    and p.pedido_externo_id not like 'SH-%'
    and p.data_pedido >= now() - interval '45 days'
    and p.data_pedido <  now() - interval '32 days'
    and p.escrow_atualizado_em < p.data_pedido + interval '32 days'
    and coalesce(p.comissao_afiliado,0) = 0
  order by p.data_pedido asc
  limit p_limite;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_cmv()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare l record;
begin
  perform sync_pedido_itens(false);
  for l in select id from lojas loop
    perform rebuild_financas_cmv_loja(l.id);
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.refresh_taxa_item()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  delete from taxa_item_cache where true;
  insert into taxa_item_cache (loja_id, item_id, taxa, vt)
  select p.loja_id, s.item_id,
    sum(coalesce(p.taxa_comissao,0) + coalesce(p.taxa_servico,0)) as taxa,
    sum(p.valor_total) as vt
  from (
    select pedido_id, min(item_id) as item_id
    from pedido_itens group by pedido_id having count(*) = 1
  ) s
  join pedidos p on p.id = s.pedido_id
  where p.escrow_atualizado_em is not null and p.valor_total > 0
  group by p.loja_id, s.item_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.resumo_ads(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_dias integer DEFAULT 30)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with janela as (select ((now() at time zone 'America/Sao_Paulo')::date - p_dias) as ini),
  ads as (
    select a.loja_id,
      coalesce(sum(a.gasto),0) as gasto, coalesce(sum(a.gmv_direto),0) as gmv_direto,
      coalesce(sum(a.pedidos_direto),0) as ped_direto, coalesce(sum(a.cliques),0) as cliques,
      coalesce(sum(a.impressoes),0) as impressoes
    from ads_diario a, janela
    where a.dia >= janela.ini and (p_loja_ids is null or a.loja_id = any(p_loja_ids))
    group by a.loja_id
  ),
  rec as (
    select p.loja_id, coalesce(sum(p.valor_total),0) as receita
    from pedidos p, janela
    where p.marketplace='shopee' and p.pedido_efetivado
      and coalesce(p.data_pagamento,p.data_pedido) >= janela.ini
      and (p_loja_ids is null or p.loja_id = any(p_loja_ids))
    group by p.loja_id
  )
  select coalesce(json_agg(json_build_object(
    'loja', coalesce(l.nome_publico,l.apelido,l.nome),
    'gasto', ads.gasto, 'gmv_direto', ads.gmv_direto,
    'roas_direto', round((ads.gmv_direto/nullif(ads.gasto,0))::numeric,2),
    'receita', coalesce(rec.receita,0),
    'tacos', round((ads.gasto/nullif(rec.receita,0)*100)::numeric,2),
    'ped_direto', ads.ped_direto, 'cliques', ads.cliques, 'impressoes', ads.impressoes,
    'ctr', round((ads.cliques::numeric/nullif(ads.impressoes,0)*100),2)
  ) order by ads.gasto desc), '[]'::json)
  from ads left join rec on rec.loja_id=ads.loja_id left join lojas l on l.id=ads.loja_id;
$function$
;

CREATE OR REPLACE FUNCTION public.resumo_ads(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_ini date DEFAULT NULL::date, p_fim date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with ads as (
    select a.loja_id,
      coalesce(sum(a.gasto), 0) as gasto, coalesce(sum(a.gmv_direto), 0) as gmv_direto,
      coalesce(sum(a.pedidos_direto), 0) as ped_direto, coalesce(sum(a.cliques), 0) as cliques,
      coalesce(sum(a.impressoes), 0) as impressoes
    from ads_diario a
    where (p_ini is null or a.dia >= p_ini) and (p_fim is null or a.dia <= p_fim)
      and (p_loja_ids is null or a.loja_id = any(p_loja_ids))
    group by a.loja_id
  ),
  rec as (
    select p.loja_id, coalesce(sum(p.valor_total), 0) as receita
    from pedidos p
    where p.marketplace = 'shopee' and p.pedido_efetivado
      and (p_ini is null or (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date >= p_ini)
      and (p_fim is null or (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date <= p_fim)
      and (p_loja_ids is null or p.loja_id = any(p_loja_ids))
    group by p.loja_id
  )
  select coalesce(json_agg(json_build_object(
    'loja', coalesce(l.nome_publico, l.apelido, l.nome),
    'gasto', ads.gasto, 'gmv_direto', ads.gmv_direto,
    'roas_direto', round((ads.gmv_direto / nullif(ads.gasto, 0))::numeric, 2),
    'roas_efetivo', round((coalesce(rec.receita, 0) / nullif(ads.gasto, 0))::numeric, 2),
    'receita', coalesce(rec.receita, 0),
    'tacos', round((ads.gasto / nullif(rec.receita, 0) * 100)::numeric, 2),
    'ped_direto', ads.ped_direto, 'cliques', ads.cliques, 'impressoes', ads.impressoes,
    'ctr', round((ads.cliques::numeric / nullif(ads.impressoes, 0) * 100), 2)
  ) order by ads.gasto desc), '[]'::json)
  from ads left join rec on rec.loja_id = ads.loja_id left join lojas l on l.id = ads.loja_id;
$function$
;

CREATE OR REPLACE FUNCTION public.resumo_avaliacoes(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with base as (
    select avaliacao from avaliacoes
    where (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or criado_em >= p_inicio)
      and (p_fim is null or criado_em < p_fim)
  )
  select json_build_object(
    'total', count(*),
    'media', coalesce(round(avg(avaliacao)::numeric,1),0),
    'n1', count(*) filter (where avaliacao=1), 'n2', count(*) filter (where avaliacao=2),
    'n3', count(*) filter (where avaliacao=3), 'n4', count(*) filter (where avaliacao=4),
    'n5', count(*) filter (where avaliacao=5)
  ) from base;
$function$
;

CREATE OR REPLACE FUNCTION public.resumo_cmv(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with di as (select (p_inicio at time zone 'America/Sao_Paulo')::date as ini, (p_fim at time zone 'America/Sao_Paulo')::date as fim)
  select json_build_object(
    'cmv', coalesce(sum(cmv),0), 'unidades', coalesce(sum(unidades),0),
    'itens_total', coalesce(sum(itens_total),0), 'itens_com_custo', coalesce(sum(itens_com_custo),0),
    'itens_sem_custo', coalesce(sum(itens_total),0) - coalesce(sum(itens_com_custo),0)
  )
  from financas_cmv_diario f, di
  where (p_loja_ids is null or f.loja_id = any(p_loja_ids))
    and (p_inicio is null or f.dia >= di.ini) and (p_fim is null or f.dia < di.fim);
$function$
;

CREATE OR REPLACE FUNCTION public.resumo_conciliacao(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with base as (
    select coalesce(valor_liquido, valor_total) as esperado,
           coalesce(valor_recebido, 0) as recebido, recebido_em
    from pedidos
    where marketplace in ('shopee','tiktok_shop') and pedido_efetivado
      and (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or data_pedido >= p_inicio)
      and (p_fim is null or data_pedido < p_fim)
  )
  select json_build_object(
    'total', count(*),
    'recebidos', count(*) filter (where recebido_em is not null),
    'a_receber', count(*) filter (where recebido_em is null),
    'divergentes', count(*) filter (where recebido_em is not null and abs(recebido - esperado) > 0.5),
    'diverg_valor', coalesce(sum(abs(recebido - esperado)) filter (where recebido_em is not null and abs(recebido - esperado) > 0.5), 0)
  ) from base;
$function$
;

CREATE OR REPLACE FUNCTION public.resumo_financas(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone, p_conta uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with di as (select (p_inicio at time zone 'America/Sao_Paulo')::date as ini, (p_fim at time zone 'America/Sao_Paulo')::date as fim),
  comp as (
    select coalesce(sum(receita_bruta),0) as receita_bruta, coalesce(sum(taxas),0) as taxas,
      coalesce(sum(cupom_proprio),0) as cupom_proprio, coalesce(sum(qtd_cupom),0) as qtd_cupom,
      coalesce(sum(afiliado),0) as afiliado, coalesce(sum(qtd_afiliado),0) as qtd_afiliado,
      coalesce(sum(taxa_servico_afiliado),0) as taxa_servico_afiliado,
      coalesce(sum(receita_liquida),0) as receita_liquida, coalesce(sum(total_pedidos),0) as total_pedidos,
      coalesce(sum(a_receber),0) as a_receber, coalesce(sum(qtd_a_receber),0) as qtd_a_receber,
      coalesce(sum(frete_custo),0) as frete_custo
    from financas_resumo_diario f, di
    where (p_loja_ids is null or f.loja_id = any(p_loja_ids))
      and (p_inicio is null or f.dia >= di.ini) and (p_fim is null or f.dia < di.fim)
  ),
  cash as (
    select coalesce(sum(recebido),0) as recebido, coalesce(sum(qtd_recebido),0) as qtd_recebido
    from financas_recebido_diario r, di
    where (p_loja_ids is null or r.loja_id = any(p_loja_ids))
      and (p_inicio is null or r.dia >= di.ini) and (p_fim is null or r.dia < di.fim)
  ),
  cart as (
    select coalesce(-sum(valor) filter (where categoria='ads'),0) as ads,
           coalesce(-sum(valor) filter (where categoria='reembolso'),0) as reembolsos,
           coalesce(-sum(valor) filter (where categoria='acelera_taxa'),0) as acelera_taxa,
           coalesce(-sum(valor) filter (where categoria='estorno'),0) as estornos,
           coalesce(sum(valor) filter (where categoria='compensacao'),0) as compensacoes,
           coalesce(-sum(valor) filter (where categoria='difal'),0) as difal,
           coalesce(-sum(valor) filter (where categoria in ('logistica_volumoso','logistica_peso','logistica_full','estorno_credito','ajuste_debito')),0) as ajustes,
           coalesce(-sum(valor) filter (where categoria='afiliado_ajuste'),0) as afiliado_ajuste,
           count(*) filter (where categoria='desconhecido') as desconhecidos
    from carteira_transacoes
    where (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or criado_em >= p_inicio) and (p_fim is null or criado_em < p_fim)
  ),
  imp as (
    select coalesce(sum(valor),0) as imposto from impostos
    where p_conta is not null and conta_id = p_conta
      and (p_inicio is null or (competencia||'-01')::timestamptz >= date_trunc('month', p_inicio))
      and (p_fim is null or (competencia||'-01')::timestamptz < p_fim)
  ),
  tk as (
    select coalesce(sum(t.settlement),0) as reembolsos_tiktok
    from tiktok_transacoes t join tiktok_extratos e on e.id = t.statement_id
    where t.tipo <> 'ORDER'
      and (p_loja_ids is null or t.loja_id = any(p_loja_ids))
      and (p_inicio is null or e.statement_time >= p_inicio) and (p_fim is null or e.statement_time < p_fim)
  ),
  uf as (
    select coalesce(json_agg(json_build_object('uf', u, 'pedidos', q, 'valor', v) order by v desc), '[]'::json) as j
    from (select f.uf as u, sum(f.total_pedidos)::int as q, coalesce(sum(f.receita_bruta),0) as v
          from financas_resumo_diario f, di
          where (p_loja_ids is null or f.loja_id = any(p_loja_ids))
            and (p_inicio is null or f.dia >= di.ini) and (p_fim is null or f.dia < di.fim)
          group by f.uf) t
  )
  select json_build_object(
    'receita_bruta',comp.receita_bruta,'taxas',comp.taxas,'cupom_proprio',comp.cupom_proprio,'qtd_cupom',comp.qtd_cupom,
    'afiliado',comp.afiliado,'qtd_afiliado',comp.qtd_afiliado,'taxa_servico_afiliado',comp.taxa_servico_afiliado,
    'receita_liquida',comp.receita_liquida,'total_pedidos',comp.total_pedidos,
    'recebido',cash.recebido,'qtd_recebido',cash.qtd_recebido,'a_receber',comp.a_receber,'qtd_a_receber',comp.qtd_a_receber,
    'ads',cart.ads,'reembolsos',cart.reembolsos,'imposto',imp.imposto,'por_uf',uf.j,
    'frete_custo',comp.frete_custo,'reembolsos_tiktok',tk.reembolsos_tiktok,
    'acelera_taxa',cart.acelera_taxa,'estornos',cart.estornos,'compensacoes',cart.compensacoes,'difal',cart.difal,
    'ajustes',cart.ajustes,'afiliado_ajuste',cart.afiliado_ajuste,'carteira_desconhecidos',cart.desconhecidos
  ) from comp,cash,cart,imp,uf,tk;
$function$
;

CREATE OR REPLACE FUNCTION public.resumo_financeiro(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with base as (
    select *
    from pedidos
    where marketplace = 'shopee'
      and escrow_atualizado_em is not null
      and (p_loja_ids is null or loja_id = any(p_loja_ids))
      and (p_inicio is null or coalesce(data_pagamento, data_pedido) >= p_inicio)
      and (p_fim is null or coalesce(data_pagamento, data_pedido) < p_fim)
  )
  select json_build_object(
    'pedidos', (select count(*) from base),
    'vendas', (select coalesce(sum(valor_total), 0) from base),
    'valor_pago', (select coalesce(sum(valor_pago), 0) from base),
    'valor_liquido', (select coalesce(sum(valor_liquido), 0) from base),
    'taxa_comissao', (select coalesce(sum(taxa_comissao), 0) from base),
    'taxa_servico', (select coalesce(sum(taxa_servico), 0) from base),
    'cupom_loja', (select coalesce(sum(cupom_loja), 0) from base),
    'cupom_shopee', (select coalesce(sum(cupom_shopee), 0) from base),
    'frete', (select coalesce(sum(frete), 0) from base),
    'desconto_vendedor', (select coalesce(sum(desconto_vendedor), 0) from base),
    'pendentes_conciliacao', (
      select count(*) from pedidos
      where marketplace = 'shopee' and pedido_efetivado = true
        and escrow_atualizado_em is null
        and (p_loja_ids is null or loja_id = any(p_loja_ids))
        and (p_inicio is null or coalesce(data_pagamento, data_pedido) >= p_inicio)
        and (p_fim is null or coalesce(data_pagamento, data_pedido) < p_fim)
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.resumo_pedidos(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with base as (
    select d.loja_id, d.dia, d.status, d.efetivado, d.faturado, d.qtd, d.valor
    from pedidos_resumo_diario d
    where (p_loja_ids is null or d.loja_id = any(p_loja_ids))
      and (p_inicio is null or d.dia >= (p_inicio at time zone 'America/Sao_Paulo')::date)
      and (p_fim is null or d.dia < (p_fim at time zone 'America/Sao_Paulo')::date)
  ),
  tot as (select
    coalesce(sum(qtd),0) as total_pedidos,
    coalesce(sum(qtd) filter (where efetivado),0) as pedidos_efetivados,
    coalesce(sum(qtd) filter (where faturado),0) as pedidos_faturados,
    coalesce(sum(qtd) filter (where not efetivado and status<>'UNPAID'),0) as pedidos_cancelados,
    coalesce(sum(valor),0) as faturamento_geral,
    coalesce(sum(valor) filter (where efetivado),0) as faturamento_efetivado,
    coalesce(sum(valor) filter (where faturado),0) as faturamento_concluido
    from base),
  st as (select coalesce(json_agg(json_build_object('status',status,'quantidade',q) order by q desc),'[]'::json) j
    from (select status, sum(qtd)::int as q from base group by status) x),
  mk as (select coalesce(json_agg(json_build_object('marketplace',loja,'faturamento',fat) order by fat desc),'[]'::json) j
    from (select coalesce(l.apelido,'sem loja') as loja, coalesce(sum(b.valor) filter (where b.efetivado),0) as fat
          from base b left join lojas l on l.id=b.loja_id group by 1) x),
  vd as (select coalesce(json_agg(json_build_object('dia',to_char(dia,'YYYY-MM-DD'),'faturamento',fat) order by dia),'[]'::json) j
    from (select dia, coalesce(sum(valor) filter (where efetivado),0) as fat from base group by dia) x)
  select json_build_object(
    'total_pedidos',tot.total_pedidos,'pedidos_efetivados',tot.pedidos_efetivados,
    'pedidos_faturados',tot.pedidos_faturados,'pedidos_cancelados',tot.pedidos_cancelados,
    'faturamento_geral',tot.faturamento_geral,'faturamento_efetivado',tot.faturamento_efetivado,
    'faturamento_concluido',tot.faturamento_concluido,
    'por_status',st.j,'por_marketplace',mk.j,'vendas_por_dia',vd.j
  ) from tot,st,mk,vd;
$function$
;

CREATE OR REPLACE FUNCTION public.resumo_uso_ia(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with base as (
    select u.*, l.conta_id
    from uso_ia u
    left join lojas l on l.id = u.loja_id
    where (p_loja_ids is null or u.loja_id = any(p_loja_ids))
      and (p_inicio is null or u.criado_em >= p_inicio)
      and (p_fim is null or u.criado_em < p_fim)
  )
  select coalesce(json_agg(t order by t.custo_usd desc), '[]'::json)
  from (
    select coalesce(c.nome, 'Sem conta') as conta_nome,
           b.conta_id,
           count(*)::int as chamadas,
           count(*) filter (where b.tipo = 'chat')::int as chamadas_chat,
           count(*) filter (where b.tipo = 'avaliacao')::int as chamadas_avaliacao,
           coalesce(sum(b.tokens_entrada), 0)::bigint as tokens_entrada,
           coalesce(sum(b.tokens_saida), 0)::bigint as tokens_saida,
           coalesce(sum(b.custo_usd), 0) as custo_usd
    from base b
    left join contas c on c.id = b.conta_id
    group by b.conta_id, c.nome
  ) t;
$function$
;

CREATE OR REPLACE FUNCTION public.rotulo_categoria_carteira(p_categoria text)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select case p_categoria
    when 'difal' then 'Imposto — DIFAL'
    when 'logistica_volumoso' then 'Logística — item volumoso'
    when 'logistica_peso' then 'Logística — diferença de peso'
    when 'estorno_credito' then 'Estorno de crédito a maior'
    when 'ajuste_debito' then 'Ajuste da Shopee (débito)'
    when 'desconhecido' then 'Tipo desconhecido'
    else coalesce((select min(c.rotulo) from carteira_categorias c where c.categoria = p_categoria), p_categoria)
  end
$function$
;

CREATE OR REPLACE FUNCTION public.shopee_taxa_esperada_item(preco numeric, dia date)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when dia < date '2026-03-01' then least(preco * 0.20 + 4, 104)
    when dia < date '2026-10-01' then
      preco * (case when preco < 80 then 0.20 else 0.14 end)
      + (case when preco < 80 then 4 when preco < 100 then 16 when preco < 200 then 20 else 26 end)
    else
      preco * (case when preco < 80 then 0.20 else 0.14 end)
      + (case when preco < 80 then 4.5 when preco < 100 then 16 when preco < 200 then 20 else 26 end)
  end
$function$
;

CREATE OR REPLACE FUNCTION public.sync_pedido_itens(p_full boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_lo timestamptz;
  v_hi timestamptz;
begin
  if p_full then
    v_lo := '1970-01-01'::timestamptz;
  else
    select ultimo_atualizado into v_lo from pedido_itens_sync where id = 1;
  end if;
  select coalesce(max(atualizado_em), now()) into v_hi
    from pedidos where marketplace = 'shopee';

  delete from pedido_itens pi
  using pedidos p
  where pi.pedido_id = p.id
    and p.marketplace = 'shopee'
    and p.atualizado_em > v_lo;

  insert into pedido_itens (pedido_id, loja_id, dia, uf, item_id, model_sku, variacao, qtd, preco)
  select p.id, p.loja_id,
    (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date,
    coalesce(p.uf, '—'),
    (it->>'item_id'),
    upper(trim(it->>'model_sku')),
    (it->>'model_name'),
    greatest(coalesce(nullif(it->>'model_quantity_purchased','')::numeric, nullif(it->>'active_qty','')::numeric, 0)
      - coalesce(nullif(it->>'returned_qty','')::numeric,0) - coalesce(nullif(it->>'cancelled_qty','')::numeric,0), 0),
    case when coalesce(nullif(it->>'model_discounted_price','')::numeric,0) > 0
         then nullif(it->>'model_discounted_price','')::numeric
         else nullif(it->>'model_original_price','')::numeric end
  from pedidos p
  cross join lateral jsonb_array_elements(
    case jsonb_typeof(p.dados_pedido->'item_list') when 'array' then p.dados_pedido->'item_list' else '[]'::jsonb end) it
  where p.marketplace = 'shopee' and p.pedido_efetivado
    and coalesce(p.data_pagamento, p.data_pedido) is not null
    and p.atualizado_em > v_lo;

  -- TikTok usa a mesma marca-d'água (v_lo) e sobe a marca pra maior das duas
  perform sync_pedido_itens_tiktok(p_full);
  update pedido_itens_sync set ultimo_atualizado = greatest(ultimo_atualizado, v_hi) where id = 1;
end $function$
;

CREATE OR REPLACE FUNCTION public.sync_pedido_itens_tiktok(p_full boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_lo timestamptz;
  v_hi timestamptz;
begin
  if p_full then
    v_lo := '1970-01-01'::timestamptz;
  else
    select ultimo_atualizado into v_lo from pedido_itens_sync where id = 1;
  end if;
  select coalesce(max(atualizado_em), now()) into v_hi from pedidos where marketplace = 'tiktok_shop';

  delete from pedido_itens pi
  using pedidos p
  where pi.pedido_id = p.id and p.marketplace = 'tiktok_shop' and p.atualizado_em > v_lo;

  insert into pedido_itens (pedido_id, loja_id, dia, uf, item_id, model_sku, variacao, qtd, preco)
  select p.id, p.loja_id,
    (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date,
    coalesce(p.uf, '—'),
    max(li->>'product_id'),
    upper(trim(li->>'seller_sku')),
    max(li->>'sku_name'),
    count(*)::numeric,                                   -- 1 line_item = 1 unidade
    round(avg(nullif(li->>'sale_price','')::numeric), 2)  -- preço pago por unidade (após desconto do vendedor)
  from pedidos p
  cross join lateral jsonb_array_elements(
    case jsonb_typeof(p.dados_pedido->'line_items') when 'array' then p.dados_pedido->'line_items' else '[]'::jsonb end) li
  where p.marketplace = 'tiktok_shop' and p.pedido_efetivado
    and coalesce(p.data_pagamento, p.data_pedido) is not null
    and p.atualizado_em > v_lo
    and coalesce(li->>'display_status','') not in ('CANCELLED','UNPAID')
    and coalesce(li->>'seller_sku','') <> ''
  group by p.id, p.loja_id, 3, 4, upper(trim(li->>'seller_sku'));

  -- marca-d'água compartilhada com o sync da Shopee (a maior das duas)
  update pedido_itens_sync set ultimo_atualizado = greatest(ultimo_atualizado, v_hi) where id = 1;
end $function$
;

CREATE OR REPLACE FUNCTION public.sync_pedido_itens_tiktok_faixa(p_ini date, p_fim date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare v_n int;
begin
  delete from pedido_itens pi
  using pedidos p
  where pi.pedido_id = p.id and p.marketplace = 'tiktok_shop'
    and (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date >= p_ini
    and (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date <  p_fim;

  insert into pedido_itens (pedido_id, loja_id, dia, uf, item_id, model_sku, variacao, qtd, preco)
  select p.id, p.loja_id,
    (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date,
    coalesce(p.uf, '—'),
    max(li->>'product_id'),
    upper(trim(li->>'seller_sku')),
    max(li->>'sku_name'),
    count(*)::numeric,
    round(avg(nullif(li->>'sale_price','')::numeric), 2)
  from pedidos p
  cross join lateral jsonb_array_elements(
    case jsonb_typeof(p.dados_pedido->'line_items') when 'array' then p.dados_pedido->'line_items' else '[]'::jsonb end) li
  where p.marketplace = 'tiktok_shop' and p.pedido_efetivado
    and coalesce(p.data_pagamento, p.data_pedido) is not null
    and (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date >= p_ini
    and (coalesce(p.data_pagamento, p.data_pedido) at time zone 'America/Sao_Paulo')::date <  p_fim
    and coalesce(li->>'display_status','') not in ('CANCELLED','UNPAID')
    and coalesce(li->>'seller_sku','') <> ''
  group by p.id, p.loja_id, 3, 4, upper(trim(li->>'seller_sku'));
  get diagnostics v_n = row_count;
  return v_n;
end $function$
;

CREATE OR REPLACE FUNCTION public.tempo_por_estado(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_dias integer DEFAULT 60)
 RETURNS TABLE(uf text, media_dias numeric, amostra integer)
 LANGUAGE sql
 STABLE
AS $function$
  select uf,
    round(avg(extract(epoch from (entregue_em - data_pedido)) / 86400.0)::numeric, 1) as media_dias,
    count(*)::int as amostra
  from pedidos
  where marketplace = 'shopee' and pedido_efetivado
    and entregue_em is not null and data_pedido is not null and uf is not null
    and entregue_em >= now() - (p_dias || ' days')::interval
    and extract(epoch from (entregue_em - data_pedido)) / 86400.0 between 0 and 90
    and (p_loja_ids is null or loja_id = any(p_loja_ids))
  group by uf;
$function$
;

CREATE OR REPLACE FUNCTION public.tiktok_aplicar_pedidos(p_loja uuid, p_order_ids text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare v_n int;
begin
  with agg as (
    select t.order_id,
      sum(t.settlement)                              as liquido,
      sum(t.comissao_plataforma)                     as comissao,
      sum(t.frete_gratis_taxa + t.outras_taxas)      as servico,
      sum(t.afiliado + t.afiliado_ads)               as afiliado,
      sum(t.desconto_vendedor)                       as desc_vendedor,
      sum(t.frete_pago_cliente)                      as frete_cliente,
      sum(t.frete_real)                              as frete_real,
      sum(t.shipping_cost)                           as frete_custo,
      sum(t.settlement)  filter (where e.payment_status = 'PAID') as recebido,
      max(e.payment_time) filter (where e.payment_status = 'PAID') as recebido_em
    from tiktok_transacoes t
    join tiktok_extratos e on e.id = t.statement_id
    where t.loja_id = p_loja and t.tipo = 'ORDER' and t.order_id = any(p_order_ids)
    group by t.order_id
  )
  update pedidos p set
    valor_liquido         = a.liquido,
    taxa_comissao         = a.comissao,
    taxa_servico          = a.servico,
    taxa_servico_afiliado = 0,
    comissao_afiliado     = a.afiliado,
    desconto_vendedor     = a.desc_vendedor,
    frete                 = a.frete_cliente,
    frete_real            = a.frete_real,
    frete_custo           = a.frete_custo,
    valor_recebido        = case when a.recebido_em is not null then a.recebido else p.valor_recebido end,
    recebido_em           = coalesce(a.recebido_em, p.recebido_em),
    escrow_atualizado_em  = now(),
    atualizado_em         = now()
  from agg a
  where p.loja_id = p_loja and p.marketplace = 'tiktok_shop' and p.pedido_externo_id = a.order_id;
  get diagnostics v_n = row_count;
  return v_n;
end $function$
;

CREATE OR REPLACE FUNCTION public.tiktok_frete_lista(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limite integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(order_id text, cliente_nome text, data_pedido timestamp with time zone, status text, revenue numeric, frete_real numeric, subsidio numeric, pago_cliente numeric, devolucao numeric, estorno_cliente numeric, liquido numeric, motivo text)
 LANGUAGE sql
 STABLE
AS $function$
  select f.order_id, p.cliente_nome, p.data_pedido, p.status, f.revenue, f.frete_real, f.subsidio, f.pago_cliente,
         f.devolucao, f.estorno_cliente, f.liquido, f.motivo
  from tiktok_frete_por_pedido(p_loja_ids, p_inicio, p_fim) f
  left join pedidos p on p.loja_id = f.loja_id and p.marketplace = 'tiktok_shop' and p.pedido_externo_id = f.order_id
  where f.liquido > 0.005
  order by f.liquido desc, f.order_id
  offset p_offset limit p_limite;
$function$
;

CREATE OR REPLACE FUNCTION public.tiktok_frete_por_pedido(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(loja_id uuid, order_id text, revenue numeric, frete_real numeric, subsidio numeric, pago_cliente numeric, devolucao numeric, estorno_cliente numeric, liquido numeric, motivo text)
 LANGUAGE sql
 STABLE
AS $function$
  with o as (
    select t.loja_id, t.order_id,
      sum(t.revenue) as revenue,
      sum(t.shipping_cost) as liquido,
      sum(-coalesce(nullif(t.breakdown->'shipping_cost_breakdown'->>'actual_shipping_fee_amount','')::numeric,0)) as frete_real,
      sum( coalesce(nullif(t.breakdown->'shipping_cost_breakdown'->>'shipping_fee_discount_amount','')::numeric,0)) as subsidio,
      sum( coalesce(nullif(t.breakdown->'shipping_cost_breakdown'->>'customer_paid_shipping_fee_amount','')::numeric,0)) as pago_cliente,
      sum(-coalesce(nullif(t.breakdown->'shipping_cost_breakdown'->>'return_shipping_fee_amount','')::numeric,0)) as devolucao,
      sum(-coalesce(nullif(t.breakdown->'shipping_cost_breakdown'->'supplementary_component'->>'refunded_customer_shipping_fee_amount','')::numeric,0)) as estorno_cliente
    from tiktok_transacoes t
    where t.tipo = 'ORDER' and t.order_id is not null
      and (p_loja_ids is null or t.loja_id = any(p_loja_ids))
      and (p_inicio is null or t.order_create_time >= p_inicio)
      and (p_fim is null or t.order_create_time < p_fim)
    group by 1,2
  )
  select loja_id, order_id, round(revenue,2), round(frete_real,2), round(subsidio,2), round(pago_cliente,2),
         round(devolucao,2), round(estorno_cliente,2), round(liquido,2),
         case when devolucao > 0 then 'devolucao'
              when revenue <= 0 or estorno_cliente > 0 then 'reembolso'
              when liquido > 0.005 then 'acima_subsidio'
              when liquido < -0.005 then 'credito'
              else 'zerado' end
  from o;
$function$
;

CREATE OR REPLACE FUNCTION public.tiktok_frete_resumo(p_loja_ids uuid[] DEFAULT NULL::uuid[], p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  with f as (select * from tiktok_frete_por_pedido(p_loja_ids, p_inicio, p_fim))
  select json_build_object(
    'pedidos', count(*),
    'frete_real', coalesce(sum(frete_real),0),
    'subsidio', coalesce(sum(subsidio),0),
    'pago_cliente', coalesce(sum(pago_cliente),0),
    'liquido', coalesce(sum(liquido),0),
    'custo', coalesce(sum(liquido) filter (where liquido > 0),0),
    'credito', coalesce(-sum(liquido) filter (where liquido < 0),0),
    'por_motivo', (select coalesce(json_agg(json_build_object('motivo', motivo, 'pedidos', q, 'valor', v) order by v desc), '[]'::json)
                   from (select motivo, count(*) as q, sum(liquido) as v from f where motivo <> 'zerado' group by motivo) m)
  ) from f;
$function$
;

CREATE OR REPLACE FUNCTION public.tiktok_reaplicar_pedidos(p_loja uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare v_total int := 0; v_n int; v_ids text[]; v_off int := 0;
begin
  loop
    select array_agg(order_id) into v_ids from (
      select distinct order_id from tiktok_transacoes
      where loja_id = p_loja and tipo = 'ORDER' and order_id is not null
      order by order_id offset v_off limit 1000
    ) s;
    exit when v_ids is null;
    v_n := tiktok_aplicar_pedidos(p_loja, v_ids);
    v_total := v_total + coalesce(v_n, 0);
    v_off := v_off + 1000;
  end loop;
  return v_total;
end $function$
;

CREATE OR REPLACE FUNCTION public.tiktok_taxa_esperada_item(preco numeric, dia date)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select
    preco * 0.06  -- Programa de Frete Grátis
    + case
        when dia < date '2025-09-24' then 0
        when dia < date '2026-02-05' then preco * 0.06 + 2
        when dia < date '2026-07-15' then preco * 0.06 + 4
        else (case when preco < 50 then preco * 0.10 + 4 else preco * 0.06 + 6 end)
      end
$function$
;

CREATE OR REPLACE FUNCTION public.variacoes_custo(p_loja_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(json_agg(json_build_object(
    'loja_id', v.loja_id, 'loja', coalesce(l.apelido,l.nome),
    'item_sku', pr.sku, 'item_nome', pr.nome, 'model_sku', v.model_sku,
    'variacao', v.variacao, 'un', v.un::int,
    'preco_med', round((v.receita/nullif(v.un,0))::numeric,2),
    'custo', cv.custo, 'custo_item', pr.custo
  ) order by v.un desc), '[]'::json)
  from variacoes_resumo v
  join produtos pr on pr.loja_id=v.loja_id and pr.item_id=v.item_id
  join lojas l on l.id=v.loja_id
  left join custos_variacao cv on cv.loja_id=v.loja_id and cv.model_sku=v.model_sku
  where (p_loja_ids is null or v.loja_id = any(p_loja_ids));
$function$
;

-- ── Grants (anon/authenticated) ──
grant execute on function _explain(q text) to anon, authenticated;
grant execute on function ads_detectar_alteracoes() to anon, authenticated;
grant execute on function ads_diagnostico_roas(p_loja_ids uuid[], p_dias integer) to anon, authenticated;
grant execute on function ads_fator_consolidar() to anon, authenticated;
grant execute on function ads_item_gmv_real(p_loja uuid, p_item bigint, p_dias integer) to anon, authenticated;
grant execute on function ads_recomendacoes_calc(p_loja_ids uuid[], p_meta_global numeric) to anon, authenticated;
grant execute on function ads_resumo_controle(p_loja_ids uuid[]) to anon, authenticated;
grant execute on function auditoria_resumo(p_loja_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone) to anon, authenticated;
grant execute on function carteira_emprestimo(p_loja_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone) to anon, authenticated;
grant execute on function carteira_entrada_heatmap(p_loja_ids uuid[], p_dias integer) to anon, authenticated;
grant execute on function carteira_movimento_dia(p_loja_ids uuid[], p_dias integer) to anon, authenticated;
grant execute on function carteira_saldos(p_loja_ids uuid[]) to anon, authenticated;
grant execute on function carteira_saque_dia(p_loja_ids uuid[], p_dias integer) to anon, authenticated;
grant execute on function casar_carteira_pedidos(p_loja uuid) to anon, authenticated;
grant execute on function chave_referencia_carteira(p_tipo text, p_categoria text) to anon, authenticated;
grant execute on function classificar_carteira(p_tipo text, p_descricao text) to anon, authenticated;
grant execute on function cobertura_escrow_bruto(p_loja_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone) to anon, authenticated;
grant execute on function conferencia_afiliado_fatura(p_loja uuid) to anon, authenticated;
grant execute on function conferencia_afiliado_taxa(p_loja_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone, p_limite integer) to anon, authenticated;
grant execute on function conferencia_carteira_desconhecidos(p_loja_ids uuid[]) to anon, authenticated;
grant execute on function conferencia_carteira_mes(p_loja uuid) to anon, authenticated;
grant execute on function conferencia_frete_vendedor(p_loja_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone, p_limite integer) to anon, authenticated;
grant execute on function conferencia_pedido_carteira(p_loja_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone, p_limite integer) to anon, authenticated;
grant execute on function conferencia_pedido_fecha(p_loja_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone, p_limite integer) to anon, authenticated;
grant execute on function custos_do_pedido(p_order_sn text) to anon, authenticated;
grant execute on function custos_mensal(p_loja_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone) to anon, authenticated;
grant execute on function custos_pedido_linhas(inc jsonb, buy jsonb) to anon, authenticated;
grant execute on function custos_resumo_dre(p_loja_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone) to anon, authenticated;
grant execute on function divergencias_recebimento(p_loja_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone, p_limite integer, p_offset integer) to anon, authenticated;
grant execute on function evolucao_entrega(p_loja_ids uuid[], p_uf text, p_semanas integer) to anon, authenticated;
grant execute on function evolucao_mensal(p_loja_ids uuid[], p_meses integer) to anon, authenticated;
grant execute on function gerar_ranking_produtos() to anon, authenticated;
grant execute on function jnum(j jsonb, k text) to anon, authenticated;
grant execute on function marcar_escrow_final(p_lote integer) to anon, authenticated;
grant execute on function margem_catalogo(p_loja_ids uuid[], p_offset integer, p_limite integer, p_busca text, p_sem_custo boolean, p_incluir_sem_venda boolean) to anon, authenticated;
grant execute on function norm_sku(s text) to anon, authenticated;
grant execute on function pedidos_para_reconferir_repasse(p_limite integer) to anon, authenticated;
grant execute on function pedidos_sem_escrow_bruto(p_loja uuid, p_desde date, p_ate date, p_limite integer) to anon, authenticated;
grant execute on function previsao_fluxo_caixa(p_loja_ids uuid[], p_dias integer) to anon, authenticated;
grant execute on function rebuild_custos_pedido(p_loja uuid, p_order_sns text[]) to anon, authenticated;
grant execute on function rebuild_custos_pedido_todos(p_loja uuid, p_bloco integer) to anon, authenticated;
grant execute on function rebuild_financas_cmv() to anon, authenticated;
grant execute on function rebuild_financas_cmv_loja(p_loja uuid) to anon, authenticated;
grant execute on function rebuild_financas_dre() to anon, authenticated;
grant execute on function rebuild_financas_resumo_diario() to anon, authenticated;
grant execute on function rebuild_pedidos_resumo_diario() to anon, authenticated;
grant execute on function recebimento_aging(p_loja_ids uuid[]) to anon, authenticated;
grant execute on function reclassificar_carteira(p_loja uuid) to anon, authenticated;
grant execute on function reconferencia_escrow_ids(p_limite integer) to anon, authenticated;
grant execute on function refresh_cmv() to anon, authenticated;
grant execute on function refresh_taxa_item() to anon, authenticated;
grant execute on function resumo_ads(p_loja_ids uuid[], p_ini date, p_fim date) to anon, authenticated;
grant execute on function resumo_ads(p_loja_ids uuid[], p_dias integer) to anon, authenticated;
grant execute on function resumo_avaliacoes(p_loja_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone) to anon, authenticated;
grant execute on function resumo_cmv(p_loja_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone) to anon, authenticated;
grant execute on function resumo_conciliacao(p_loja_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone) to anon, authenticated;
grant execute on function resumo_financas(p_loja_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone, p_conta uuid) to anon, authenticated;
grant execute on function resumo_financeiro(p_loja_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone) to anon, authenticated;
grant execute on function resumo_pedidos(p_loja_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone) to anon, authenticated;
grant execute on function resumo_uso_ia(p_loja_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone) to anon, authenticated;
grant execute on function rotulo_categoria_carteira(p_categoria text) to anon, authenticated;
grant execute on function shopee_taxa_esperada_item(preco numeric, dia date) to anon, authenticated;
grant execute on function sync_pedido_itens(p_full boolean) to anon, authenticated;
grant execute on function sync_pedido_itens_tiktok(p_full boolean) to anon, authenticated;
grant execute on function sync_pedido_itens_tiktok_faixa(p_ini date, p_fim date) to anon, authenticated;
grant execute on function tempo_por_estado(p_loja_ids uuid[], p_dias integer) to anon, authenticated;
grant execute on function tiktok_aplicar_pedidos(p_loja uuid, p_order_ids text[]) to anon, authenticated;
grant execute on function tiktok_frete_lista(p_loja_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone, p_limite integer, p_offset integer) to anon, authenticated;
grant execute on function tiktok_frete_por_pedido(p_loja_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone) to anon, authenticated;
grant execute on function tiktok_frete_resumo(p_loja_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone) to anon, authenticated;
grant execute on function tiktok_reaplicar_pedidos(p_loja uuid) to anon, authenticated;
grant execute on function tiktok_taxa_esperada_item(preco numeric, dia date) to anon, authenticated;
grant execute on function variacoes_custo(p_loja_ids uuid[]) to anon, authenticated;

-- ── Triggers ──


-- ── pg_cron ──
-- pg_cron: ads-fator-consolidar | 0 11 1 * * | select ads_fator_consolidar();
-- pg_cron: ads-recomendacoes | 0 10 * * * | set statement_timeout = '15min'; select ads_recomendacoes_calc(null,30);
-- pg_cron: rebuild-financas-cmv | 12 * * * * | set statement_timeout = '15min'; select refresh_cmv();
-- pg_cron: rebuild-financas-dre | 11 * * * * | select rebuild_financas_dre();
-- pg_cron: rebuild-pedidos | 10 * * * * | select rebuild_pedidos_resumo_diario();
-- pg_cron: rebuild-taxa-item | 13 * * * * | set statement_timeout = '15min'; select refresh_taxa_item();
-- pg_cron: sync-pedido-itens | */10 * * * * | select sync_pedido_itens(false);