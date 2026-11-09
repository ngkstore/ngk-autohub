-- S4 (plano de melhorias 09/11/2026): liga o RLS em TODAS as tabelas do schema public,
-- sem policies — anon e authenticated deixam de ler/escrever qualquer dado pela API REST.
-- O servidor (lib/supabase.ts) passa a usar a SERVICE ROLE, que ignora o RLS.
-- Também tira de anon/authenticated o execute das funções (RPCs), pelo mesmo motivo.
--
-- RODAR SÓ DEPOIS de: (1) SUPABASE_SERVICE_ROLE_KEY criada na Vercel, (2) deploy do
-- lib/supabase.ts que usa a service role, (3) sistema testado logado.
-- Login continua funcionando: o @supabase/ssr só usa auth (schema auth), não tabelas.
set statement_timeout = '5min';

do $$
declare r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', r.relname);
  end loop;
end $$;

-- Funções: ninguém de fora chama RPC; o servidor usa a service role.
do $$
declare r record;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f','p')
  loop
    execute format('revoke execute on function public.%I(%s) from anon, authenticated', r.proname, r.args);
  end loop;
end $$;

-- Conferência: deve voltar 0 tabelas sem RLS.
select count(*) as tabelas_sem_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity;
