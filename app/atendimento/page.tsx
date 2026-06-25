import { supabase } from "@/lib/supabase";
import EscaladoAcoes from "../components/EscaladoAcoes";

export const dynamic = "force-dynamic";

type Conversa = {
  conversation_id: string;
  to_name: string | null;
  item_id: number | null;
  ultima_mensagem: string | null;
  categoria: string | null;
  motivo_escala: string | null;
  resposta_ia: string | null;
};

export default async function AtendimentoPage() {
  // Chats escalados que precisam de você.
  const { data: escaladosRaw } = await supabase
    .from("chat_conversas")
    .select(
      "conversation_id, to_name, item_id, ultima_mensagem, categoria, motivo_escala, resposta_ia"
    )
    .eq("escalada", true)
    .order("ultima_mensagem_ts", { ascending: false })
    .limit(50);

  const escalados = (escaladosRaw || []) as Conversa[];

  // Nome dos produtos
  const itemIds = [...new Set(escalados.map((c) => c.item_id).filter(Boolean))];
  const mapaProdutos = new Map<string, string>();
  if (itemIds.length > 0) {
    const { data: prods } = await supabase
      .from("produtos")
      .select("item_id, nome")
      .in("item_id", itemIds as number[]);
    (prods || []).forEach((p) => {
      if (p.item_id) mapaProdutos.set(String(p.item_id), p.nome as string);
    });
  }

  // Última mensagem com texto do cliente, por conversa
  const convIds = escalados.map((c) => c.conversation_id);
  const mapaPergunta = new Map<string, string>();
  if (convIds.length > 0) {
    const { data: msgs } = await supabase
      .from("chat_mensagens")
      .select("conversation_id, texto, de_loja, created_timestamp")
      .in("conversation_id", convIds)
      .eq("de_loja", false)
      .not("texto", "is", null)
      .neq("texto", "")
      .order("created_timestamp", { ascending: false });
    (msgs || []).forEach((m) => {
      if (!mapaPergunta.has(m.conversation_id)) {
        mapaPergunta.set(m.conversation_id, m.texto as string);
      }
    });
  }

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">Atendimento Pendente</h1>
      <p className="mt-2 text-slate-400">
        Chats que o robô escalou e precisam de você. Edite a sugestão se quiser e
        envie, ou marque como resolvido.
      </p>

      <div className="mt-4 inline-block rounded-full bg-yellow-900 px-4 py-1 text-sm font-semibold text-yellow-300">
        {escalados.length} pendente(s)
      </div>

      <div className="mt-6 space-y-4">
        {escalados.length > 0 ? (
          escalados.map((c) => {
            const pergunta =
              mapaPergunta.get(c.conversation_id) ||
              c.ultima_mensagem ||
              "(cliente enviou um anexo/imagem)";
            const produto = c.item_id
              ? mapaProdutos.get(String(c.item_id)) || `Item ${c.item_id}`
              : "Produto não identificado";

            return (
              <div
                key={c.conversation_id}
                className="rounded-xl bg-slate-900 p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{c.to_name || "Cliente"}</span>
                  {c.categoria && (
                    <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-200">
                      {c.categoria}
                    </span>
                  )}
                  <span className="text-xs text-orange-300">{produto}</span>
                </div>

                <p className="mt-3 text-slate-300">
                  <strong className="text-slate-400">Cliente:</strong>{" "}
                  {pergunta}
                </p>

                {c.resposta_ia && (
                  <p className="mt-1 text-xs text-slate-500">
                    Sugestão da IA pré-carregada abaixo (edite se quiser).
                  </p>
                )}

                <EscaladoAcoes
                  conversationId={c.conversation_id}
                  sugestao={c.resposta_ia || ""}
                />
              </div>
            );
          })
        ) : (
          <div className="rounded-xl bg-slate-900 p-6 text-slate-400">
            Nenhum atendimento pendente. 🎉 O robô está dando conta!
          </div>
        )}
      </div>
    </div>
  );
}
