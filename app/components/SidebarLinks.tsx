"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icone, { type NomeIcone } from "./Icone";

export type ItemMenu = { nome: string; href: string; icone: NomeIcone; contador?: number };
export type GrupoMenu = { titulo: string; itens: ItemMenu[] };

// Parte cliente do menu: só precisa de usePathname para marcar o item ativo.
// O escopo do usuário (quais grupos aparecem) é resolvido no servidor (Sidebar.tsx).
export default function SidebarLinks({ grupos }: { grupos: GrupoMenu[] }) {
  const pathname = usePathname();
  const ativo = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <nav aria-label="Menu principal" className="flex-1 overflow-y-auto px-3 pb-4">
      {grupos.map((g) => (
        <div key={g.titulo} className="mb-2">
          <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-texto-2">{g.titulo}</p>
          {g.itens.map((item) => {
            const on = ativo(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={
                  "my-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
                  (on ? "bg-primaria-suave text-primaria-texto" : "text-texto-2 hover:bg-superficie-2 hover:text-texto")
                }
              >
                <Icone nome={item.icone} className={on ? "text-primaria" : "text-texto-2"} />
                <span className="flex-1 truncate">{item.nome}</span>
                {item.contador ? (
                  <span className="min-w-5 rounded-full bg-perigo px-1.5 text-center text-[11px] font-semibold leading-5 text-white">
                    {item.contador}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
