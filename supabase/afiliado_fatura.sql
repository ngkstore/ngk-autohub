-- F5 (plano de melhorias 09/11/2026): fatura mensal de afiliados = EXTRATO, nunca custo.
-- O desconto real já vem pedido a pedido (order_ams_commission_fee + "Taxa de Serviço
-- Afiliados do Vendedor"). A tabela guarda a fatura só para conferência; a função
-- compara com custos_pedido em três janelas e em duas somas (só comissão / comissão +
-- taxa de serviço) e diz qual bate (tolerância 1%).
set statement_timeout = '5min';

create table if not exists afiliado_fatura (
  loja_id uuid not null,
  mes_validade text not null,            -- 'YYYY-MM'
  despesa numeric(14,2) not null,
  abatido_credito numeric(14,2) not null default 0,
  fonte text,
  primary key (loja_id, mes_validade)
);

insert into afiliado_fatura (loja_id, mes_validade, despesa, abatido_credito, fonte) values
 ('329df5fb-0d8f-4eb5-af36-ff216152cedf', '2025-12', 13110.26, 0,      'Seller Center · Afiliados do Vendedor › Transações e Pagamentos (09/11/2026)'),
 ('329df5fb-0d8f-4eb5-af36-ff216152cedf', '2026-01', 23028.56, 0,      'Seller Center 09/11/2026'),
 ('329df5fb-0d8f-4eb5-af36-ff216152cedf', '2026-02', 18830.63, 0,      'Seller Center 09/11/2026'),
 ('329df5fb-0d8f-4eb5-af36-ff216152cedf', '2026-03', 17229.91, 0,      'Seller Center 09/11/2026'),
 ('329df5fb-0d8f-4eb5-af36-ff216152cedf', '2026-04', 26112.09, 999.45, 'Seller Center 09/11/2026'),
 ('329df5fb-0d8f-4eb5-af36-ff216152cedf', '2026-05', 22015.24, 0.02,   'Seller Center 09/11/2026'),
 ('329df5fb-0d8f-4eb5-af36-ff216152cedf', '2026-06', 31192.65, 0,      'Seller Center 09/11/2026'),
 ('329df5fb-0d8f-4eb5-af36-ff216152cedf', '2026-07', 21042.20, 699.98, 'Seller Center 09/11/2026'),
 ('329df5fb-0d8f-4eb5-af36-ff216152cedf', '2026-08', 15651.99, 899.99, 'Seller Center 09/11/2026'),
 ('329df5fb-0d8f-4eb5-af36-ff216152cedf', '2026-09', 14496.79, 999.97, 'Seller Center 09/11/2026'),
 ('329df5fb-0d8f-4eb5-af36-ff216152cedf', '2026-10', 14878.93, 0,      'Seller Center 09/11/2026')
on conflict (loja_id, mes_validade) do update set despesa = excluded.despesa, abatido_credito = excluded.abatido_credito, fonte = excluded.fonte;

-- Conferência 4. Para cada mês de validade:
--   janela A = data do pedido no mesmo mês; B = data do pedido no mês anterior; C = data do repasse (recebido_em) no mês.
--   soma 1 = só comissão (categoria afiliado); soma 2 = comissão + taxa de serviço do afiliado.
create or replace function conferencia_afiliado_fatura(p_loja uuid)
returns table(mes_validade text, despesa numeric, cobertura numeric,
              a_comissao numeric, a_total numeric, b_comissao numeric, b_total numeric, c_comissao numeric, c_total numeric,
              bate text)
language sql stable as $$
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
$$;
grant execute on function conferencia_afiliado_fatura(uuid) to anon, authenticated;
