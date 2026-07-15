import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";

export default async function LojasPage() {
  const escopo = await escopoDoUsuario();

  let lojasQuery = supabase
    .from("lojas")
    .select("*")
    .order("criado_em", { ascending: false });
  if (!escopo.admin) {
    lojasQuery = lojasQuery.in(
      "conta_id",
      escopo.contaId ? [escopo.contaId] : []
    );
  }
  const { data: lojas } = await lojasQuery;

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">Lojas</h1>

      <p className="mt-2 text-slate-400">
        Gerencie as lojas conectadas ao NGK AutoHub.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {lojas?.map((loja) => (
          <div key={loja.id} className="rounded-2xl bg-slate-900 p-6">
            <p className="text-xl font-bold">{loja.apelido}</p>

            <p className="mt-2 text-slate-400">
              Nome: {loja.nome}
            </p>

            <p className="mt-1 text-slate-400">
              Marketplace: {loja.marketplace}
            </p>

            <span className="mt-4 inline-block rounded-full bg-green-900 px-3 py-1 text-xs font-semibold text-green-300">
              {loja.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}