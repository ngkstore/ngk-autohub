"use client";

import { useState } from "react";

type Props = {
  configs: Record<string, string>;
};

export default function ConfiguracoesForm({ configs }: Props) {
  const [form, setForm] = useState({
    shopee_partner_id: configs.shopee_partner_id || "",
    shopee_partner_key: configs.shopee_partner_key || "",
    shopee_redirect_url:
      configs.shopee_redirect_url ||
      "http://localhost:3000/api/shopee/callback",
    tiktok_app_key: configs.tiktok_app_key || "",
    tiktok_secret: configs.tiktok_secret || "",
  });

  const [salvando, setSalvando] = useState(false);

  function alterar(campo: string, valor: string) {
    setForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  }

  async function salvar() {
    setSalvando(true);

    const response = await fetch("/api/configuracoes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    const resultado = await response.json();

    setSalvando(false);

    if (resultado.sucesso) {
      alert("Configurações salvas com sucesso.");
      location.reload();
    } else {
      alert(resultado.erro || "Erro ao salvar configurações.");
    }
  }

  return (
    <section className="mt-8 rounded-2xl bg-slate-900 p-6">
      <h2 className="text-2xl font-bold">Credenciais das Integrações</h2>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl bg-slate-800 p-5">
          <h3 className="text-xl font-bold">Shopee Open Platform</h3>

          <label className="mt-4 block text-sm text-slate-400">
            Partner ID
          </label>
          <input
            value={form.shopee_partner_id}
            onChange={(e) => alterar("shopee_partner_id", e.target.value)}
            className="mt-2 w-full rounded-lg bg-slate-950 p-3 text-white outline-none"
          />

          <label className="mt-4 block text-sm text-slate-400">
            Partner Key
          </label>
          <input
            value={form.shopee_partner_key}
            onChange={(e) => alterar("shopee_partner_key", e.target.value)}
            className="mt-2 w-full rounded-lg bg-slate-950 p-3 text-white outline-none"
          />

          <label className="mt-4 block text-sm text-slate-400">
            Redirect URL
          </label>
          <input
            value={form.shopee_redirect_url}
            onChange={(e) => alterar("shopee_redirect_url", e.target.value)}
            className="mt-2 w-full rounded-lg bg-slate-950 p-3 text-white outline-none"
          />
        </div>

        <div className="rounded-xl bg-slate-800 p-5">
          <h3 className="text-xl font-bold">TikTok Shop API</h3>

          <label className="mt-4 block text-sm text-slate-400">
            App Key
          </label>
          <input
            value={form.tiktok_app_key}
            onChange={(e) => alterar("tiktok_app_key", e.target.value)}
            className="mt-2 w-full rounded-lg bg-slate-950 p-3 text-white outline-none"
          />

          <label className="mt-4 block text-sm text-slate-400">
            Secret
          </label>
          <input
            value={form.tiktok_secret}
            onChange={(e) => alterar("tiktok_secret", e.target.value)}
            className="mt-2 w-full rounded-lg bg-slate-950 p-3 text-white outline-none"
          />
        </div>
      </div>

      <button
        onClick={salvar}
        disabled={salvando}
        className="mt-6 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {salvando ? "Salvando..." : "Salvar Configurações"}
      </button>
    </section>
  );
}