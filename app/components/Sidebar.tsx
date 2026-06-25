import Link from "next/link";

const menuItems = [
  { name: "Dashboard", href: "/" },
  { name: "Avaliações", href: "/avaliacoes" },
  { name: "Atendimento", href: "/atendimento" },
  { name: "Produtos", href: "/produtos" },
  { name: "Pedidos", href: "/pedidos" },
  { name: "Financeiro", href: "/financeiro" },
  { name: "Auditoria", href: "/auditoria" },
  { name: "Analytics", href: "/analytics" },

  { name: "Integrações", href: "/integracoes" },
  { name: "Sincronização", href: "/sincronizacao" },
  { name: "Alertas", href: "/alertas" },

  { name: "Lojas", href: "/lojas" },
  { name: "Configurações", href: "/configuracoes" },
];

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 border-r border-slate-800 bg-slate-900 p-6 text-white">
      <h1 className="text-2xl font-bold">NGK AutoHub</h1>

      <p className="mt-1 text-xs text-slate-500">
        ERP Multi Marketplace
      </p>

      <nav className="mt-8 space-y-2">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-lg px-4 py-3 text-slate-300 transition-all hover:bg-slate-800 hover:text-white"
          >
            {item.name}
          </Link>
        ))}
      </nav>

      <div className="absolute bottom-6 left-6 right-6 rounded-xl border border-slate-800 bg-slate-950 p-4">
        <p className="text-xs text-slate-500">NGK AutoHub</p>

        <p className="mt-1 text-sm font-semibold text-green-400">
          Sistema Online
        </p>
      </div>
    </aside>
  );
}