-- Robustez do robô de chat (Shopee + TikTok) — 02/10/2026.
-- Idempotente: pode rodar mais de uma vez.

-- Id da última mensagem que o ROBÔ enviou na conversa. Serve pra distinguir
-- "a loja falou por último porque o robô respondeu" de "um humano respondeu
-- pelo Seller Center" (aí a escalada é encerrada sozinha).
alter table chat_conversas add column if not exists robo_msg_id text;

-- Quando a conversa foi escalada / quando você foi avisado pela última vez
-- (limita re-avisos no Telegram quando o cliente cobra de novo).
alter table chat_conversas add column if not exists escalada_em timestamptz;

-- Id da última mensagem do CLIENTE que ainda espera resposta. No TikTok a
-- última mensagem da conversa quase sempre é do robô do próprio TikTok
-- (confirmação de endereço, rastreio…), então latest_message_id não serve
-- pra saber se o robô já tratou a dúvida do cliente.
alter table chat_conversas add column if not exists cliente_msg_id text;

create index if not exists chat_conversas_pendentes_idx
  on chat_conversas (marketplace, loja_id, ultima_mensagem_ts desc)
  where precisa_resposta;

create index if not exists chat_conversas_escaladas_idx
  on chat_conversas (ultima_mensagem_ts desc)
  where escalada;
