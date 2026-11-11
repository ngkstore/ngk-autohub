import type { ReactNode } from "react";

// As abas ficam em cada página (precisam da aba ativa); aqui só o contêiner.
export default function DevolucoesLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-[1400px] p-6">{children}</div>;
}
