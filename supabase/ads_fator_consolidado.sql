-- FASE 3 refino: recálculo CONSOLIDADO D+30 do fator de efetivação (spec §5).
-- estimado   = últimos 90d (inclui pedidos recentes, ainda imaturos)
-- consolidado= pedidos com 30 a 120 dias (cancelamentos/devoluções já assentaram)
-- Divergência > 10% = o fator estimado está enganando -> recalibrar (alerta).
-- Roda 1x/mês (pg_cron) e guarda o histórico por competência.

create table if not exists ads_fator_historico (
  loja_id           uuid not null,
  competencia       text not null,          -- YYYY-MM
  fator_estimado    numeric(6,4),
  fator_consolidado numeric(6,4),
  divergencia_pct   numeric(6,2),
  pedidos_estimado  int,
  pedidos_consolidado int,
  criado_em         timestamptz default now(),
  primary key (loja_id, competencia)
);

create or replace function ads_fator_consolidar()
returns int language plpgsql security definer as $$
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
end $$;
grant execute on function ads_fator_consolidar() to anon, authenticated;
grant select on ads_fator_historico to anon, authenticated;
