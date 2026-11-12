-- Backfill da UF dos pedidos TikTok (aprovado pelo Gabriel em 12/11/2026): lê
-- recipient_address.district_info[address_level = 'L1'].iso_code do próprio pedido.
-- Idempotente (só onde uf é nulo); rodar por faixa de meses para caber no tempo da API.
create or replace function public.tiktok_uf_backfill(p_de timestamptz, p_ate timestamptz)
returns integer
language plpgsql
security definer
as $function$
declare v_n integer;
begin
  update pedidos p set uf = x.uf
  from (
    select p2.id,
      (select upper(regexp_replace(coalesce(d->>'iso_code', d->>'address_name', ''), '^BR-', ''))
         from jsonb_array_elements(case jsonb_typeof(p2.dados_pedido->'recipient_address'->'district_info')
                                     when 'array' then p2.dados_pedido->'recipient_address'->'district_info' else '[]'::jsonb end) d
        where d->>'address_level' = 'L1' limit 1) as uf
    from pedidos p2
    where p2.marketplace = 'tiktok_shop' and p2.uf is null
      and p2.data_pedido >= p_de and p2.data_pedido < p_ate
  ) x
  where p.id = x.id and x.uf ~ '^[A-Z]{2}$';
  get diagnostics v_n = row_count;
  return v_n;
end $function$;
