-- F3 (plano de melhorias 09/11/2026): SPM_DEDUCT_DIRECT não pode cair em "ads" por padrão.
-- No Seller Center o tipo 801 é parcela de empréstimo; a regra antiga mandava para ads
-- qualquer texto sem "empréstimo". Agora:
--   texto com "empr…stimo"/"loan"            -> emprestimo
--   texto com "ads"/"anúncio"/"recarga"       -> ads
--   qualquer outro                             -> desconhecido (alerta na conferência 8)
set statement_timeout = '15min';

create or replace function classificar_carteira(p_tipo text, p_descricao text)
returns text language sql stable as $$
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
$$;
grant execute on function classificar_carteira(text, text) to anon, authenticated;

select reclassificar_carteira(null);
