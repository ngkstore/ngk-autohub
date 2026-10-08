-- Empréstimo para Vendedores (Shopee): as parcelas vêm na carteira como
-- SPM_DEDUCT_DIRECT "Pagamento do Empréstimo para Vendedores" e estavam
-- classificadas como 'ads' -> inflavam a linha de Ads do DRE (conta Gustavo:
-- R$87k jul-out/2026). Categoria própria 'emprestimo', fora do resultado.
-- Idempotente.

update carteira_transacoes
   set categoria = 'emprestimo'
 where categoria <> 'emprestimo'
   and (descricao ilike '%empr_stimo%' or descricao ilike '%loan%');

-- Parcelas de empréstimo pagas no período (informativo, não entra no DRE).
create or replace function carteira_emprestimo(p_loja_ids uuid[] default null, p_inicio timestamptz default null, p_fim timestamptz default null)
returns table(total numeric, parcelas int, primeira date, ultima date)
language sql stable as $$
  select coalesce(-sum(valor), 0) as total,
         count(*)::int as parcelas,
         min(criado_em)::date as primeira,
         max(criado_em)::date as ultima
    from carteira_transacoes
   where categoria = 'emprestimo' and valor < 0
     and (p_loja_ids is null or loja_id = any(p_loja_ids))
     and (p_inicio is null or criado_em >= p_inicio)
     and (p_fim is null or criado_em < p_fim);
$$;
grant execute on function carteira_emprestimo(uuid[], timestamptz, timestamptz) to anon, authenticated;

-- Recalcula o resumo diário do DRE (a linha de Ads muda).
select rebuild_financas_dre();
