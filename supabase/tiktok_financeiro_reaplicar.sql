-- Reaplica TODAS as transações já importadas nos pedidos de uma loja TikTok, em
-- lotes de 1000 pedidos. Usar depois de um backfill de pedidos (as transações
-- lidas antes dos pedidos existirem não tinham onde ser aplicadas).
create or replace function tiktok_reaplicar_pedidos(p_loja uuid)
returns int language plpgsql security definer as $$
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
end $$;
grant execute on function tiktok_reaplicar_pedidos(uuid) to anon, authenticated;
