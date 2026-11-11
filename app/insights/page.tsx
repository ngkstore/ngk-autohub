import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";
import ImportarInsights from "./ImportarInsights";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const escopo = await escopoDoUsuario();

  let query = supabase
    .from("insights_importacoes")
    .select("id, arquivo, colunas, total_linhas, loja_id, periodo_inicio, periodo_fim, importado_em, lojas(apelido)")
    .order("importado_em", { ascending: false })
    .limit(30);
  if (!escopo.preSetup) {
    query = query.in("conta_id", escopo.contaId ? [escopo.contaId] : []);
  }
  const { data: importacoes } = await query;

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-texto">Insights (planilhas)</h1>
      <p className="mt-0.5 text-[13px] text-texto-2">
        Traga os dados que a API da Shopee não expõe (add-ao-carrinho, conversão,
        impressões orgânicas) exportando o Business Insights e subindo aqui.
      </p>

      <div className="mt-6">
        <ImportarInsights />
      </div>

      <section className="mt-6 rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
        <h2 className="text-[15px] font-semibold text-texto">Importações recentes</h2>
        <div className="mt-6 overflow-x-auto rounded-xl border border-borda">
          <table className="w-full text-left text-sm">
            <thead className="bg-superficie-2 text-texto">
              <tr>
                <th className="p-3">Arquivo</th>
                <th className="p-3">Loja</th>
                <th className="p-3">Período</th>
                <th className="p-3">Linhas</th>
                <th className="p-3">Colunas detectadas</th>
                <th className="p-3">Importado</th>
              </tr>
            </thead>
            <tbody>
              {importacoes && importacoes.length > 0 ? (
                importacoes.map(
                  (imp: {
                    id: string;
                    arquivo: string | null;
                    total_linhas: number | null;
                    colunas: string[] | null;
                    periodo_inicio: string | null;
                    periodo_fim: string | null;
                    importado_em: string | null;
                    lojas?: { apelido?: string }[] | { apelido?: string } | null;
                  }) => {
                    const apelido = Array.isArray(imp.lojas)
                      ? imp.lojas[0]?.apelido
                      : imp.lojas?.apelido;
                    const periodo =
                      imp.periodo_inicio || imp.periodo_fim
                        ? `${imp.periodo_inicio || "?"} a ${imp.periodo_fim || "?"}`
                        : "-";
                    return (
                    <tr key={imp.id} className="border-t border-borda align-top">
                      <td className="p-3 font-semibold">{imp.arquivo || "-"}</td>
                      <td className="p-3 text-alerta">{apelido || "-"}</td>
                      <td className="p-3 text-texto-2">{periodo}</td>
                      <td className="p-3">{imp.total_linhas ?? 0}</td>
                      <td className="p-3 text-texto-2">
                        {(imp.colunas || []).join(" • ") || "-"}
                      </td>
                      <td className="p-3 text-texto-2">
                        {imp.importado_em
                          ? new Date(imp.importado_em).toLocaleString("pt-BR")
                          : "-"}
                      </td>
                    </tr>
                    );
                  }
                )
              ) : (
                <tr>
                  <td className="p-3 text-texto-2" colSpan={6}>
                    Nenhuma planilha importada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
