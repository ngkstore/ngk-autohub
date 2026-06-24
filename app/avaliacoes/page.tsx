import { supabase } from "@/lib/supabase";
import GerarRespostaButton from "../components/GerarRespostaButton";
import GerarTodasButton from "../components/GerarTodasButton";

const mapaLojas: Record<string, string> = {
  "ngk-shopee": "NGK Shopee",
  "pitibiribas-shopee": "Pitibiribas Shopee",
  "ngk-tiktok": "NGK TikTok",
  "pitibiribas-tiktok": "Pitibiribas TikTok",
};

function obterIntervaloPeriodo(periodo?: string) {
  const agora = new Date();
  const inicio = new Date();
  const fim = new Date();

  switch (periodo) {
    case "hoje":
      inicio.setHours(0, 0, 0, 0);
      fim.setHours(23, 59, 59, 999);
      return { inicio, fim };

    case "ontem":
      inicio.setDate(agora.getDate() - 1);
      inicio.setHours(0, 0, 0, 0);

      fim.setDate(agora.getDate() - 1);
      fim.setHours(23, 59, 59, 999);
      return { inicio, fim };

    case "7dias":
      inicio.setDate(agora.getDate() - 7);
      return { inicio, fim };

    case "30dias":
      inicio.setDate(agora.getDate() - 30);
      return { inicio, fim };

    case "mes":
      inicio.setDate(1);
      inicio.setHours(0, 0, 0, 0);
      return { inicio, fim };

    case "ano":
      inicio.setMonth(0, 1);
      inicio.setHours(0, 0, 0, 0);
      return { inicio, fim };

    case "todos":
    default:
      return null;
  }
}

export default async function AvaliacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; periodo?: string }>;
}) {
  const params = await searchParams;

  const lojaSlug = params.loja;
  const periodo = params.periodo || "mes";

  const apelidoLoja = lojaSlug ? mapaLojas[lojaSlug] : null;

  let lojaId: string | null = null;

  if (apelidoLoja) {
    const { data: loja } = await supabase
      .from("lojas")
      .select("id")
      .eq("apelido", apelidoLoja)
      .single();

    lojaId = loja?.id || null;
  }

  const intervalo = obterIntervaloPeriodo(periodo);

  let avaliacoesQuery = supabase
    .from("avaliacoes")
    .select(`
      *,
      lojas (
        id,
        nome,
        apelido,
        marketplace
      )
    `)
    .order("criado_em", { ascending: false });

  if (lojaId) {
    avaliacoesQuery = avaliacoesQuery.eq("loja_id", lojaId);
  }

  if (intervalo) {
    avaliacoesQuery = avaliacoesQuery
      .gte("criado_em", intervalo.inicio.toISOString())
      .lte("criado_em", intervalo.fim.toISOString());
  }

  const { data: avaliacoes } = await avaliacoesQuery;

  const { data: respostas } = await supabase
    .from("respostas_ia")
    .select("*");

  return (
    <div className="p-8 text-white">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold">Avaliações</h1>

          <p className="mt-2 text-slate-400">
            {apelidoLoja
              ? `Exibindo avaliações da ${apelidoLoja}`
              : "Exibindo avaliações de todas as lojas"}
          </p>
        </div>

        <GerarTodasButton />
      </div>

      <div className="space-y-4">
        {avaliacoes && avaliacoes.length > 0 ? (
          avaliacoes.map((avaliacao) => {
            const resposta = respostas?.find(
              (item) => item.avaliacao_id === avaliacao.id
            );

            return (
              <div
                key={avaliacao.id}
                className="rounded-xl bg-slate-900 p-5"
              >
                <p className="text-xl font-bold">
                  {avaliacao.nome_produto}
                </p>

                <p className="mt-1 text-sm text-orange-300">
                  Loja: {avaliacao.lojas?.apelido || "Sem loja vinculada"}
                </p>

                <p className="mt-2">Cliente: {avaliacao.nome_cliente}</p>

                <p className="mt-1">
                  Nota: {"⭐".repeat(avaliacao.avaliacao)}
                </p>

                <p className="mt-3 text-slate-300">
                  {avaliacao.comentario}
                </p>

                {avaliacao.resposta_shopee ? (
                  <div className="mt-4 rounded-lg bg-green-900/40 p-4">
                    <p className="text-sm font-semibold text-green-300">
                      Resposta publicada na Shopee:
                    </p>

                    <p className="mt-2">{avaliacao.resposta_shopee}</p>
                  </div>
                ) : resposta ? (
                  <div className="mt-4 rounded-lg bg-green-900/40 p-4">
                    <p className="text-sm font-semibold text-green-300">
                      Resposta IA:
                    </p>

                    <p className="mt-2">{resposta.resposta}</p>
                  </div>
                ) : (
                  <div className="mt-4 flex items-center gap-3">
                    <span className="rounded-full bg-yellow-900 px-3 py-1 text-xs font-semibold text-yellow-300">
                      Pendente
                    </span>
                    <GerarRespostaButton avaliacao={avaliacao} />
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="rounded-xl bg-slate-900 p-6 text-slate-400">
            Nenhuma avaliação encontrada para os filtros selecionados.
          </div>
        )}
      </div>
    </div>
  );
}