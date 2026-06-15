import { supabase } from "@/lib/supabase";
import ConfiguracoesForm from "../components/ConfiguracoesForm";

export default async function ConfiguracoesPage() {
  const { data: lojas } = await supabase
    .from("lojas")
    .select("*")
    .order("criado_em", { ascending: false });

  const { data: configuracoes } = await supabase
    .from("configuracoes")
    .select("*");

  const configs: Record<string, string> = {};

  configuracoes?.forEach((item) => {
    configs[item.chave] = item.valor;
  });

  return (
    <div className="p-8 text-white">
      <h1 className="text-4xl font-bold">Configurações</h1>

      <p className="mt-2 text-slate-400">
        Ajustes gerais do NGK AutoHub, integrações e regras de IA.
      </p>

      <ConfiguracoesForm configs={configs} />

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-2xl bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">Status das Integrações</h2>

          <div className="mt-6 space-y-4">
            <div className="rounded-xl bg-slate-800 p-5">
              <p className="font-bold">Shopee Open Platform</p>

              <p className="mt-2 text-sm text-slate-400">
                Partner ID:
                <span className="ml-2 text-white">
                  {configs.shopee_partner_id || "Não informado"}
                </span>
              </p>

              <p className="mt-2 text-sm text-slate-400">
                Partner Key:
                <span className="ml-2 text-white">
                  {configs.shopee_partner_key
                    ? "Configurado"
                    : "Não informado"}
                </span>
              </p>

              <span
                className={`mt-4 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                  configs.shopee_partner_id &&
                  configs.shopee_partner_key
                    ? "bg-green-900 text-green-300"
                    : "bg-yellow-900 text-yellow-300"
                }`}
              >
                {configs.shopee_partner_id &&
                configs.shopee_partner_key
                  ? "Configurado"
                  : "Pendente"}
              </span>
            </div>

            <div className="rounded-xl bg-slate-800 p-5">
              <p className="font-bold">TikTok Shop API</p>

              <p className="mt-2 text-sm text-slate-400">
                App Key:
                <span className="ml-2 text-white">
                  {configs.tiktok_app_key || "Não informado"}
                </span>
              </p>

              <p className="mt-2 text-sm text-slate-400">
                Secret:
                <span className="ml-2 text-white">
                  {configs.tiktok_secret
                    ? "Configurado"
                    : "Não informado"}
                </span>
              </p>

              <span
                className={`mt-4 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                  configs.tiktok_app_key &&
                  configs.tiktok_secret
                    ? "bg-green-900 text-green-300"
                    : "bg-slate-700 text-slate-300"
                }`}
              >
                {configs.tiktok_app_key &&
                configs.tiktok_secret
                  ? "Configurado"
                  : "Pendente"}
              </span>
            </div>

            <div className="rounded-xl bg-slate-800 p-5">
              <p className="font-bold">Claude Code / Skills</p>

              <p className="mt-2 text-sm text-slate-400">
                Integração ativa utilizando Claude Max.
              </p>

              <span className="mt-4 inline-block rounded-full bg-green-900 px-3 py-1 text-xs font-semibold text-green-300">
                Ativo
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">Lojas Cadastradas</h2>

          <div className="mt-6 space-y-4">
            {lojas?.map((loja) => (
              <div
                key={loja.id}
                className="rounded-xl bg-slate-800 p-5"
              >
                <p className="font-bold">{loja.apelido}</p>

                <p className="mt-1 text-sm text-slate-400">
                  Nome: {loja.nome}
                </p>

                <p className="mt-1 text-sm text-slate-400">
                  Marketplace: {loja.marketplace}
                </p>

                <span className="mt-4 inline-block rounded-full bg-green-900 px-3 py-1 text-xs font-semibold text-green-300">
                  {loja.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-8 rounded-2xl bg-slate-900 p-6">
        <h2 className="text-2xl font-bold">Regras de IA</h2>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-slate-800 p-5">
            <p className="font-bold">Avaliações</p>
            <p className="mt-2 text-sm text-slate-400">
              Respostas naturais e amigáveis para clientes.
            </p>
          </div>

          <div className="rounded-xl bg-slate-800 p-5">
            <p className="font-bold">Atendimento</p>
            <p className="mt-2 text-sm text-slate-400">
              Classificação automática e resposta por IA.
            </p>
          </div>

          <div className="rounded-xl bg-slate-800 p-5">
            <p className="font-bold">Financeiro</p>
            <p className="mt-2 text-sm text-slate-400">
              Explicação automática de taxas, comissões e divergências.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}