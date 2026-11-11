"use client";

export default function ConfiguracoesForm() {
  return (
    <section className="mt-8 rounded-2xl bg-superficie p-6">
      <h2 className="text-2xl font-bold">Credenciais das Integrações</h2>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl bg-superficie-2 p-5">
          <h3 className="text-xl font-bold">Shopee Open Platform</h3>

          <p className="mt-4 text-sm text-texto-2">
            As credenciais da Shopee estão protegidas nas variáveis de ambiente
            da Vercel.
          </p>

          <div className="mt-4 rounded-lg bg-fundo p-4 text-sm text-texto">
            <p>SHOPEE_PARTNER_ID: Configurado via Vercel</p>
            <p>SHOPEE_PARTNER_KEY: Protegido via Vercel</p>
            <p>NEXT_PUBLIC_SHOPEE_REDIRECT_URL: Configurado via Vercel</p>
          </div>

          <span className="mt-4 inline-block rounded-full bg-chip-verde-fundo px-3 py-1 text-xs font-semibold text-sucesso">
            Seguro
          </span>
        </div>

        <div className="rounded-xl bg-superficie-2 p-5">
          <h3 className="text-xl font-bold">TikTok Shop API</h3>

          <p className="mt-4 text-sm text-texto-2">
            Quando a integração TikTok for ativada, as credenciais também devem
            ficar apenas nas variáveis de ambiente da Vercel.
          </p>

          <div className="mt-4 rounded-lg bg-fundo p-4 text-sm text-texto">
            <p>TIKTOK_APP_KEY: Configurar via Vercel</p>
            <p>TIKTOK_APP_SECRET: Proteger via Vercel</p>
          </div>

          <span className="mt-4 inline-block rounded-full bg-chip-amarelo-fundo px-3 py-1 text-xs font-semibold text-alerta">
            Pendente
          </span>
        </div>
      </div>
    </section>
  );
}