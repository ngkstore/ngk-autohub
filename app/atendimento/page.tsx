import { supabase } from "@/lib/supabase";

type AtendimentoPageProps = {
  searchParams: {
    loja?: string;
    periodo?: string;
  };
};

function getPeriodoFiltro(periodo?: string) {
  const hoje = new Date();
  const inicio = new Date();

  switch (periodo) {
    case "hoje":
      inicio.setHours(0, 0, 0, 0);
      return inicio.toISOString();

    case "ontem":
      inicio.setDate(hoje.getDate() - 1);
      inicio.setHours(0, 0, 0, 0);
      return inicio.toISOString();

    case "7dias":
      inicio.setDate(hoje.getDate() - 7);
      return inicio.toISOString();

    case "30dias":
      inicio.setDate(hoje.getDate() - 30);
      return inicio.toISOString();

    case "mes":
      inicio.setDate(1);
      inicio.setHours(0, 0, 0, 0);
      return inicio.toISOString();

    case "ano":
      inicio.setMonth(0, 1);
      inicio.setHours(0, 0, 0, 0);
      return inicio.toISOString();

    default:
      return null;
  }
}

export default async function AtendimentoPage({
  searchParams,
}: AtendimentoPageProps) {
  const lojaFiltro = searchParams?.loja;
  const periodoFiltro = getPeriodoFiltro(searchParams?.periodo);

  let lojaId: string | null = null;

  if (lojaFiltro && lojaFiltro !== "todas") {
    const { data: loja } = await supabase
      .from("lojas")
      .select("id")
      .eq("apelido", lojaFiltro)
      .single();

    lojaId = loja?.id || null;
  }

  let totalChatsQuery = supabase
    .from("chats")
    .select("*", { count: "exact", head: true });

  let chatsPendentesQuery = supabase
    .from("chats")
    .select("*", { count: "exact", head: true })
    .eq("status", "pendente");

  let ultimosChatsQuery = supabase
    .from("chats")
    .select("*, lojas(apelido)")
    .order("criado_em", { ascending: false })
    .limit(10);

  if (lojaId) {
    totalChatsQuery = totalChatsQuery.eq("loja_id", lojaId);
    chatsPendentesQuery = chatsPendentesQuery.eq("loja_id", lojaId);
    ultimosChatsQuery = ultimosChatsQuery.eq("loja_id", lojaId);
  }

  if (periodoFiltro) {
    totalChatsQuery = totalChatsQuery.gte("criado_em", periodoFiltro);
    chatsPendentesQuery = chatsPendentesQuery.gte(
      "criado_em",
      periodoFiltro
    );
    ultimosChatsQuery = ultimosChatsQuery.gte(
      "criado_em",
      periodoFiltro
    );
  }

  const { count: totalChats } = await totalChatsQuery;
  const { count: chatsPendentes } = await chatsPendentesQuery;
  const { data: ultimosChats } = await ultimosChatsQuery;

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">Atendimento</h1>

      <p className="mt-2 text-slate-400">
        Central de mensagens e respostas com IA para Shopee e TikTok Shop.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Chats Recebidos</p>
          <p className="mt-2 text-4xl font-bold">{totalChats ?? 0}</p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Chats Pendentes</p>
          <p className="mt-2 text-4xl font-bold">{chatsPendentes ?? 0}</p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Modo IA</p>
          <p className="mt-2 text-2xl font-bold text-green-300">Ativo</p>
        </div>
      </div>

      <section className="mt-10 rounded-2xl bg-slate-900 p-6">
        <h2 className="text-2xl font-bold">Últimas Mensagens</h2>

        <div className="mt-6 space-y-4">
          {ultimosChats && ultimosChats.length > 0 ? (
            ultimosChats.map((chat) => (
              <div key={chat.id} className="rounded-xl bg-slate-800 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold">{chat.cliente_nome}</p>

                    <p className="text-sm text-orange-300">
                      {chat.lojas?.apelido || "Sem loja vinculada"}
                    </p>
                  </div>

                  <span className="rounded-full bg-yellow-900 px-3 py-1 text-xs font-semibold text-yellow-300">
                    {chat.status}
                  </span>
                </div>

                <p className="mt-3 text-slate-300">
                  {chat.mensagem}
                </p>

                {chat.resposta_ia && (
                  <div className="mt-4 rounded-lg bg-green-900/40 p-4">
                    <p className="text-sm font-semibold text-green-300">
                      Resposta IA:
                    </p>

                    <p className="mt-2">
                      {chat.resposta_ia}
                    </p>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="text-slate-400">
              Nenhuma mensagem encontrada para o filtro selecionado.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}