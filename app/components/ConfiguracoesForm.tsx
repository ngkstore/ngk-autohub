"use client";

export default function ConfiguracoesForm() {
  return (
    <section className="mt-8 rounded-2xl bg-slate-900 p-6">
      <h2 className="text-2xl font-bold">Credenciais das Integrações</h2>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl bg-slate-800 p-5">
          <h3 className="text-xl font-bold">Shopee Open Platform</h3>

          <p className="mt-4 text-sm text-slate-400">
            As credenciais da Shopee estão protegidas nas variáveis de ambiente
            da Vercel.
          </p>

          <div className="mt-4 rounded-lg bg-slate-950 p-4 text-sm text-slate-300">
            <p>SHOPEE_PARTNER_ID: Configurado via Vercel</p>
            <p>SHOPEE_PARTNER_KEY: Protegido via Vercel</p>
            <p>NEXT_PUBLIC_SHOPEE_REDIRECT_URL: Configurado via Vercel</p>
          </div>

          <span className="mt-4 inline-block rounded-full bg-green-900 px-3 py-1 text-xs font-semibold text-green-300">
            Seguro
          </span>
        </div>

        <div className="rounded-xl bg-slate-800 p-5">
          <h3 className="text-xl font-bold">TikTok Shop API</h3>

          <p className="mt-4 text-sm text-slate-400">
            Quando a integração TikTok for ativada, as credenciais também devem
            ficar apenas nas variáveis de ambiente da Vercel.
          </p>

          <div className="mt-4 rounded-lg bg-slate-950 p-4 text-sm text-slate-300">
            <p>TIKTOK_APP_KEY: Configurar via Vercel</p>
            <p>TIKTOK_APP_SECRET: Proteger via Vercel</p>
          </div>

          <span className="mt-4 inline-block rounded-full bg-yellow-900 px-3 py-1 text-xs font-semibold text-yellow-300">
            Pendente
          </span>
        </div>
      </div>
    </section>
  );
}