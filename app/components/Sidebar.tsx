import { escopoDoUsuario } from "@/lib/conta";
import SidebarLinks, { type GrupoMenu } from "./SidebarLinks";
import { contadorDevolucoes } from "@/lib/devolucoes/pendencias";

// Menu lateral (NOVO-VISUAL, A2). Todas as rotas que existem continuam aqui,
// reorganizadas por grupo. Rotas futuras (Painel do dia, Devoluções…) entram
// quando a tela existir. `contador` = devoluções que vencem em 24 h (Parte B).
function grupos(admin: boolean, contador?: number): GrupoMenu[] {
  const g: GrupoMenu[] = [
    {
      titulo: "Visão",
      itens: [
        { nome: "Visão geral", href: "/", icone: "visao" },
        { nome: "Painel do dia", href: "/painel", icone: "painel" },
      ],
    },
    {
      titulo: "Operação",
      itens: [
        { nome: "Pedidos", href: "/pedidos", icone: "pedidos" },
        { nome: "Devoluções", href: "/devolucoes", icone: "devolucoes", contador },
        { nome: "Atendimento", href: "/atendimento", icone: "atendimento" },
        { nome: "Avaliações", href: "/avaliacoes", icone: "avaliacoes" },
      ],
    },
    {
      titulo: "Vendas",
      itens: [
        { nome: "Lives e afiliados", href: "/lives", icone: "lives" },
        { nome: "Campanhas", href: "/campanhas", icone: "campanhas" },
        { nome: "Ads", href: "/ads", icone: "ads" },
        { nome: "Controle GMV Max", href: "/ads-controle", icone: "alvo" },
        { nome: "Raio-X do Anúncio", href: "/raio-x", icone: "raiox" },
        { nome: "Insights", href: "/insights", icone: "insights" },
      ],
    },
    { titulo: "Produtos", itens: [{ nome: "Produtos", href: "/produtos", icone: "produtos" }, { nome: "Estoque e ruptura", href: "/estoque", icone: "estoque" }] },
    {
      titulo: "Financeiro",
      itens: [
        { nome: "Finanças", href: "/financas", icone: "financas" },
        { nome: "Auditoria de taxas", href: "/auditoria", icone: "auditoria" },
      ],
    },
    {
      titulo: "Conta",
      itens: [
        { nome: "Saúde da conta", href: "/saude", icone: "saude" },
        { nome: "Integrações & Lojas", href: "/integracoes", icone: "integracoes" },
        { nome: "Sincronização", href: "/sincronizacao", icone: "sincronizacao" },
        { nome: "Alertas", href: "/alertas", icone: "alertas" },
        { nome: "Configurações", href: "/configuracoes", icone: "configuracoes" },
      ],
    },
  ];
  if (admin) g.push({ titulo: "Admin", itens: [{ nome: "Consumo", href: "/uso", icone: "consumo" }] });
  return g;
}

export default async function Sidebar() {
  const escopo = await escopoDoUsuario();
  // Contador vermelho: devoluções que vencem em 24 h nas lojas do usuário (B8).
  let contador = 0;
  try {
    contador = escopo.lojaIds.length ? await contadorDevolucoes(escopo.lojaIds) : 0;
  } catch {
    contador = 0;
  }

  return (
    <aside className="fixed left-0 top-0 flex h-screen w-[232px] flex-col border-r border-borda bg-superficie">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primaria text-[11px] font-bold tracking-wide text-white">NGK</div>
        <span className="text-[15px] font-semibold text-texto">AutoHub</span>
      </div>

      <SidebarLinks grupos={grupos(escopo.admin, contador)} />
    </aside>
  );
}
