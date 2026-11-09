-- O robô de chat busca os pedidos do cliente (loja + cliente_nome) pra responder
-- "cadê meu pedido" com o status real. Sem índice essa busca varria os ~560 mil
-- pedidos a cada conversa. Rodar SOZINHO (CONCURRENTLY não roda em transação).
create index concurrently if not exists pedidos_loja_cliente_idx
  on pedidos (loja_id, cliente_nome, data_pedido desc);
