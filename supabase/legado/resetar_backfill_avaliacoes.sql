-- Reinicia o backfill de avaliações para varrer PRODUTO A PRODUTO (necessário
-- para alcançar todo o histórico — a consulta da loja inteira tinha teto).
-- Rode UMA vez no Supabase -> SQL Editor -> Run, depois do deploy.

delete from configuracoes
where chave in (
  'avaliacoes_backfill_done',
  'avaliacoes_item_idx',
  'avaliacoes_item_cursor',
  'avaliacoes_cursor'
);
