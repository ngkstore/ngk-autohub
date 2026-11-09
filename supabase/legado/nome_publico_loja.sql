-- Nome PÚBLICO da loja: o nome que o robô usa ao falar com o cliente
-- (respostas de avaliação e chat). Antes estava fixo como "NGK Store" no código,
-- então o robô falava "NGK Store" até nas lojas dos amigos. Agora cada loja fala
-- o SEU nome. Rode no Supabase -> SQL Editor -> Run (seguro rodar de novo).

alter table lojas add column if not exists nome_publico text;

-- Backfill do que já sabemos (não sobrescreve o que já estiver preenchido):
update lojas set nome_publico = 'NGK Store'
  where nome_publico is null and apelido ilike '%ngk%';
update lojas set nome_publico = 'Pitibiribas'
  where nome_publico is null and apelido ilike '%pitibiri%';

-- Defina o nome das demais lojas (Gustavo etc.). Pegue o id em:
--   select id, apelido, nome_publico from lojas where marketplace = 'shopee';
-- e rode, por loja:
--   update lojas set nome_publico = 'Tudo aki express' where id = '<ID>';
--   update lojas set nome_publico = 'Facilita house'   where id = '<ID>';

-- Fallback no código: se nome_publico ficar nulo, o robô usa o apelido da loja.
