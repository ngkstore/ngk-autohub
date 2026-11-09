-- ============================================================================
-- refresh_cmv POR LOJA + sync de itens em job próprio (01/10/2026)
-- O rebuild_financas_cmv completo passou a estourar o statement_timeout (2 min)
-- do pg_cron depois do cruzamento de custos entre lojas (tiktok_cmv.sql). Como
-- sync_pedido_itens rodava na MESMA transação (refresh_cmv), o rollback travou a
-- marca-d'água de pedido_itens em 29/09 17:40 UTC e o CMV parou de atualizar.
-- Agora: (1) sync_pedido_itens tem job próprio a cada 10 min, independente do CMV;
--        (2) refresh_cmv recalcula loja a loja (rebuild_financas_cmv_loja) com
--            timeout de 15 min no job.
-- Idempotente.
-- ============================================================================

create or replace function refresh_cmv()
returns void language plpgsql security definer as $$
declare l record;
begin
  perform sync_pedido_itens(false);
  for l in select id from lojas loop
    perform rebuild_financas_cmv_loja(l.id);
  end loop;
end $$;
grant execute on function refresh_cmv() to anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('rebuild-financas-cmv', 'sync-pedido-itens');
  perform cron.schedule('sync-pedido-itens', '*/10 * * * *', 'select sync_pedido_itens(false);');
  perform cron.schedule('rebuild-financas-cmv', '12 * * * *', $c$set statement_timeout = '15min'; select refresh_cmv();$c$);
end $$;
