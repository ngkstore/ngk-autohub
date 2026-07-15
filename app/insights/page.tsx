import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";
import ImportarInsights from "./ImportarInsights";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const escopo = await escopoDoUsuario();

  let query = supabase
    .from("insights_importacoes")
    .select("id, arquivo, colunas, total_linhas, loja_id, importado_em, lojas(apelido)")
    .order("importado_em", { ascending: false })
    .limit(30);
  if (!escopo.admin) {
    query = query.in("conta_id", escopo.contaId ? [escopo.contaId] : []);
  }
  const { data: importacoes } = await query;

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">Insights (planilhas)</h1>
      <p className="mt-2 text-slate-400">
        Traga os dados que a API da Shopee não expõe (add-ao-carrinho, conversão,
        impressões orgânicas) exportando o Business Insights e subindo aqui.
      </p>

      <div className="mt-6">
        <ImportarInsights />
      </div>

      <section className="mt-10 rounded-2xl bg-slate-900 p-6">
        <h2 className="text-2xl font-bold">Importações recentes</h2>
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="p-3">Arquivo</th>
                <th className="p-3">Loja</th>
                <th className="p-3">Linhas</th>
                <th className="p-3">Colunas detectadas</th>
                <th className="p-3">Data</th>
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
                    importado_em: string | null;
                    lojas?: { apelido?: string }[] | { apelido?: string } | null;
                  }) => {
                    const apelido = Array.isArray(imp.lojas)
                      ? imp.lojas[0]?.apelido
                      : imp.lojas?.apelido;
                    return (
                    <tr key={imp.id} className="border-t border-slate-800 align-top">
                      <td className="p-3 font-semibold">{imp.arquivo || "-"}</td>
                      <td className="p-3 text-orange-300">{apelido || "-"}</td>
                      <td className="p-3">{imp.total_linhas ?? 0}</td>
                      <td className="p-3 text-slate-400">
                        {(imp.colunas || []).join(" • ") || "-"}
                      </td>
                      <td className="p-3 text-slate-400">
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
                  <td className="p-3 text-slate-400" colSpan={5}>
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
