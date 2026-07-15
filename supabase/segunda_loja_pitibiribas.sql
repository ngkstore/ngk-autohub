-- Segunda loja Shopee: Pitibiribas
-- Rode no SQL Editor do Supabase (uma vez).

-- 1) Coluna que amarra cada loja ao seu shop_id da Shopee.
--    É preenchida automaticamente quando você conclui o OAuth de cada loja.
alter table public.lojas add column if not exists shop_id text;

-- 2) Cria a loja "Pitibiribas Shopee" (se ainda não existir).
--    Os pedidos/avaliações/chat dela ficam separados por loja_id.
insert into public.lojas (apelido, marketplace)
select 'Pitibiribas Shopee', 'shopee'
where not exists (
  select 1 from public.lojas where apelido = 'Pitibiribas Shopee'
);

-- Confirmação: deve listar NGK Shopee e Pitibiribas Shopee.
select id, apelido, marketplace, shop_id from public.lojas order by apelido;
