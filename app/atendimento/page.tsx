import { supabase } from "@/lib/supabase";
import EscaladoAcoes from "../components/EscaladoAcoes";
import { escopoDoUsuario, filtroLojas } from "@/lib/conta";

export const dynamic = "force-dynamic";

type Conversa = {
  conversation_id: string;
  marketplace: string;
  loja_id: string | null;
  to_name: string | null;
  item_id: number | null;
  ultima_mensagem: string | null;
  categoria: string | null;
  motivo_escala: string | null;
  resposta_ia: string | null;
};

// "aguardando_humano": o robô já disse ao cliente que alguém da equipe vai
// responder — a sugestão guardada é esse aviso, então não é pré-carregada.
const aguardaHumano = (c: Conversa) =>
  (c.motivo_escala || "").startsWith("aguardando_humano");

type AtendimentoProps = {
  searchParams: Promise<{ loja?: string }>;
};

export default async function AtendimentoPage({
  searchParams,
}: AtendimentoProps) {
  const { loja: lojaParam } = await searchParams;
  const escopo = await escopoDoUsuario();
  const lojas = filtroLojas(escopo, lojaParam);

  // Chats escalados que precisam de você (filtrados pela loja selecionada).
  let escaladosQuery = supabase
    .from("chat_conversas")
    .select(
      "conversation_id, marketplace, loja_id, to_name, item_id, ultima_mensagem, categoria, motivo_escala, resposta_ia"
    )
    .eq("escalada", true)
    .order("ultima_mensagem_ts", { ascending: false })
    .limit(200);

  if (lojas) escaladosQuery = escaladosQuery.in("loja_id", lojas);

  const { data: escaladosRaw } = await escaladosQuery;

  const escalados = (escaladosRaw || []) as Conversa[];

  // Nome das lojas (são várias: sem isso não dá pra saber onde responder)
  const lojaIds = [...new Set(escalados.map((c) => c.loja_id).filter(Boolean))];
  const mapaLojas = new Map<string, string>();
  if (lojaIds.length > 0) {
    const { data: lojasRows } = await supabase
      .from("lojas")
      .select("id, apelido, nome")
      .in("id", lojaIds as string[]);
    (lojasRows || []).forEach((l) => {
      mapaLojas.set(String(l.id), (l.apelido || l.nome || "Loja") as string);
    });
  }

  // Nome dos produtos
  const itemIds = [...new Set(escalados.map((c) => c.item_id).filter(Boolean))];
  const mapaProdutos = new Map<string, string>();
  if (itemIds.length > 0) {
    let prodQuery = supabase
      .from("produtos")
      .select("item_id, nome")
      .in("item_id", itemIds as number[]);
    if (lojas) prodQuery = prodQuery.in("loja_id", lojas);
    const { data: prods } = await prodQuery;
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
    <div className="mx-auto max-w-[1400px] p-6">
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-texto">Atendimento Pendente</h1>
      <p className="mt-0.5 text-[13px] text-texto-2">
        Chats que o robô escalou e precisam de você. Edite a sugestão se quiser e
        envie, ou marque como resolvido.
      </p>

      <div className="mt-4 inline-block rounded-full bg-chip-amarelo-fundo px-4 py-1 text-sm font-semibold text-alerta">
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
                key={`${c.marketplace}:${c.conversation_id}`}
                className="rounded-xl bg-superficie p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{c.to_name || "Cliente"}</span>
                  <span className="rounded-full bg-chip-ceu-fundo px-2 py-0.5 text-xs text-chip-ceu-texto">
                    {c.marketplace === "tiktok_shop" ? "TikTok" : "Shopee"}
                    {c.loja_id && mapaLojas.get(c.loja_id)
                      ? ` · ${mapaLojas.get(c.loja_id)}`
                      : ""}
                  </span>
                  {c.categoria && (
                    <span className="rounded-full bg-chip-cinza-fundo px-2 py-0.5 text-xs text-texto">
                      {c.categoria}
                    </span>
                  )}
                  {c.marketplace !== "tiktok_shop" && (
                    <span className="text-xs text-alerta">{produto}</span>
                  )}
                </div>

                <p className="mt-3 text-texto">
                  <strong className="text-texto-2">Cliente:</strong>{" "}
                  {pergunta}
                </p>

                {aguardaHumano(c) ? (
                  <p className="mt-1 text-xs text-alerta">
                    O robô já avisou o cliente que alguém da equipe vai
                    responder
                    {c.resposta_ia ? `: “${c.resposta_ia}”` : "."} Ele está
                    esperando a sua resposta.
                  </p>
                ) : (
                  c.resposta_ia && (
                    <p className="mt-1 text-xs text-texto-2">
                      Sugestão da IA pré-carregada abaixo (edite se quiser).
                    </p>
                  )
                )}

                <EscaladoAcoes
                  conversationId={c.conversation_id}
                  marketplace={c.marketplace}
                  sugestao={aguardaHumano(c) ? "" : c.resposta_ia || ""}
                />
              </div>
            );
          })
        ) : (
          <div className="rounded-xl bg-superficie p-6 text-texto-2">
            Nenhum atendimento pendente. 🎉 O robô está dando conta!
          </div>
        )}
      </div>
    </div>
  );
}
