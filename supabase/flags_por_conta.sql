-- Os flags de robô agora são POR CONTA (chave "<base>:<contaId>").
-- Copia os flags GLOBAIS atuais para a conta do Gabriel, para os robôs
-- continuarem no mesmo estado após o deploy. Rode UMA vez (depois de contas.sql).

insert into configuracoes (chave, valor, atualizado_em)
select
  c.chave || ':a0000000-0000-4000-8000-000000000001',
  c.valor,
  now()
from configuracoes c
where c.chave in (
  'responder_chat_ativo',
  'responder_chat_autonomo',
  'responder_avaliacoes_ativo'
)
and not exists (
  select 1 from configuracoes x
  where x.chave = c.chave || ':a0000000-0000-4000-8000-000000000001'
);
