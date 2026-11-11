import { supabase } from "@/lib/supabase";
import ConfiguracoesForm from "../components/ConfiguracoesForm";

export default async function ConfiguracoesPage() {
  const { data: lojas } = await supabase
    .from("lojas")
    .select("*")
    .order("criado_em", { ascending: false });

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <h1 className="text-[22px] font-bold tracking-[-0.01em] text-texto">Configurações</h1>

      <p className="mt-0.5 text-[13px] text-texto-2">
        Ajustes gerais do NGK AutoHub, integrações e segurança.
      </p>

      <ConfiguracoesForm />

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
          <h2 className="text-[15px] font-semibold text-texto">Status das Integrações</h2>

          <div className="mt-6 space-y-4">
            <div className="rounded-[10px] border border-linha bg-superficie-2 p-5">
              <p className="font-bold">Shopee Open Platform</p>

              <p className="mt-2 text-sm text-texto-2">
                Credenciais protegidas nas variáveis de ambiente da Vercel.
              </p>

              <span className="mt-4 inline-block rounded-full bg-chip-verde-fundo px-3 py-1 text-xs font-semibold text-sucesso">
                Configurado via Vercel
              </span>
            </div>

            <div className="rounded-[10px] border border-linha bg-superficie-2 p-5">
              <p className="font-bold">TikTok Shop API</p>

              <p className="mt-2 text-sm text-texto-2">
                Credenciais devem ser configuradas futuramente nas variáveis de
                ambiente da Vercel.
              </p>

              <span className="mt-4 inline-block rounded-full bg-chip-amarelo-fundo px-3 py-1 text-xs font-semibold text-alerta">
                Pendente
              </span>
            </div>

            <div className="rounded-[10px] border border-linha bg-superficie-2 p-5">
              <p className="font-bold">Claude Code / Skills</p>

              <p className="mt-2 text-sm text-texto-2">
                Integração ativa utilizando Claude Max.
              </p>

              <span className="mt-4 inline-block rounded-full bg-chip-verde-fundo px-3 py-1 text-xs font-semibold text-sucesso">
                Ativo
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
          <h2 className="text-[15px] font-semibold text-texto">Lojas Cadastradas</h2>

          <div className="mt-6 space-y-4">
            {lojas && lojas.length > 0 ? (
              lojas.map((loja) => (
                <div
                  key={loja.id}
                  className="rounded-[10px] border border-linha bg-superficie-2 p-5"
                >
                  <p className="font-bold">{loja.apelido}</p>

                  <p className="mt-1 text-sm text-texto-2">
                    Nome: {loja.nome}
                  </p>

                  <p className="mt-1 text-sm text-texto-2">
                    Marketplace: {loja.marketplace}
                  </p>

                  <span className="mt-4 inline-block rounded-full bg-chip-verde-fundo px-3 py-1 text-xs font-semibold text-sucesso">
                    {loja.status}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-texto-2">Nenhuma loja cadastrada.</p>
            )}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-[14px] border border-borda bg-superficie p-6 shadow-cartao">
        <h2 className="text-[15px] font-semibold text-texto">Regras de IA</h2>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-[10px] border border-linha bg-superficie-2 p-5">
            <p className="font-bold">Avaliações</p>
            <p className="mt-2 text-sm text-texto-2">
              Respostas naturais e amigáveis para clientes.
            </p>
          </div>

          <div className="rounded-[10px] border border-linha bg-superficie-2 p-5">
            <p className="font-bold">Atendimento</p>
            <p className="mt-2 text-sm text-texto-2">
              Classificação automática e resposta por IA.
            </p>
          </div>

          <div className="rounded-[10px] border border-linha bg-superficie-2 p-5">
            <p className="font-bold">Financeiro</p>
            <p className="mt-2 text-sm text-texto-2">
              Explicação automática de taxas, comissões e divergências.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}