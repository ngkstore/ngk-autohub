import { supabase } from "@/lib/supabase";
import { escopoDoUsuario } from "@/lib/conta";

export const dynamic = "force-dynamic";

export default async function LojasPage() {
  const escopo = await escopoDoUsuario();

  let lojasQuery = supabase
    .from("lojas")
    .select("*")
    .order("criado_em", { ascending: false });
  if (!escopo.preSetup) {
    lojasQuery = lojasQuery.in(
      "conta_id",
      escopo.contaId ? [escopo.contaId] : []
    );
  }
  const { data: lojas } = await lojasQuery;

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-texto">Lojas</h1>

      <p className="mt-0.5 text-[13px] text-texto-2">
        Gerencie as lojas conectadas ao NGK AutoHub.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {lojas?.map((loja) => (
          <div key={loja.id} className="rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
            <p className="text-xl font-bold">{loja.apelido}</p>

            <p className="mt-0.5 text-[13px] text-texto-2">
              Nome: {loja.nome}
            </p>

            <p className="mt-0.5 text-[13px] text-texto-2">
              Marketplace: {loja.marketplace}
            </p>

            <span className="mt-4 inline-block rounded-full bg-chip-verde-fundo px-3 py-1 text-xs font-semibold text-sucesso">
              {loja.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}