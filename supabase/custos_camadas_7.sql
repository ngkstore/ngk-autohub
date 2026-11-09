-- 09/11/2026: o backfill em paralelo com o cron deu "duplicate key" em custos_pedido
-- (dois processos regerando o mesmo pedido ao mesmo tempo, e sub-itens de serviço
-- repetidos com o mesmo rule_id). Linhas de serviço ganham sufixo quando repetem e o
-- insert passa a ser upsert.
set statement_timeout = '15min';

create or replace function rebuild_custos_pedido(p_loja uuid, p_order_sns text[])
returns int language plpgsql security definer as $$
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
end $$;
grant execute on function rebuild_custos_pedido(uuid, text[]) to anon, authenticated;
