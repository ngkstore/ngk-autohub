import Link from "next/link";
import { escopoDoUsuario } from "@/lib/conta";

type Item = { name: string; href: string };
type Grupo = { titulo: string | null; itens: Item[] };

// Navegação agrupada. Removidos: /financeiro (legado, duplicava /financas),
// /analytics (placeholder) e /lojas (o Integrações já lista as lojas).
const grupos: Grupo[] = [
  { titulo: null, itens: [{ name: "Dashboard", href: "/" }] },
  {
    titulo: "Operação",
    itens: [
      { name: "Pedidos", href: "/pedidos" },
      { name: "Produtos", href: "/produtos" },
      { name: "Avaliações", href: "/avaliacoes" },
      { name: "Atendimento", href: "/atendimento" },
    ],
  },
  {
    titulo: "Financeiro",
    itens: [
      { name: "💰 Finanças", href: "/financas" },
      { name: "Auditoria de taxas", href: "/auditoria" },
    ],
  },
  {
    titulo: "Marketing",
    itens: [
      { name: "🔬 Raio-X do Anúncio", href: "/raio-x" },
      { name: "Insights (planilhas)", href: "/insights" },
    ],
  },
  {
    titulo: "Sistema",
    itens: [
      { name: "Integrações & Lojas", href: "/integracoes" },
      { name: "Sincronização", href: "/sincronizacao" },
      { name: "Alertas", href: "/alertas" },
      { name: "Configurações", href: "/configuracoes" },
    ],
  },
];

// Só admin vê a cobrança por conta.
const grupoAdmin: Grupo = {
  titulo: "Admin",
  itens: [{ name: "💸 Consumo (cobrança)", href: "/uso" }],
};

export default async function Sidebar() {
  const escopo = await escopoDoUsuario();
  const secoes = escopo.admin ? [...grupos, grupoAdmin] : grupos;

  return (
    <aside className="fixed left-0 top-0 flex h-screen w-64 flex-col border-r border-slate-800 bg-slate-900 text-white">
      <div className="p-6 pb-3">
        <h1 className="text-2xl font-bold">NGK AutoHub</h1>
        <p className="mt-1 text-xs text-slate-500">ERP Multi Marketplace</p>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        {secoes.map((g, i) => (
          <div key={g.titulo ?? `g${i}`}>
            {g.titulo && (
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                {g.titulo}
              </p>
            )}
            <div className="space-y-1">
              {g.itens.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-lg px-3 py-2 text-sm text-slate-300 transition-all hover:bg-slate-800 hover:text-white"
                >
                  {item.name}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="m-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
        <p className="text-xs text-slate-500">NGK AutoHub</p>
        <p className="mt-1 text-sm font-semibold text-green-400">Sistema Online</p>
      </div>
    </aside>
  );
}
