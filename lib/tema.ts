// Preferência de tema (NOVO-VISUAL, A1): cookie `tema` = "claro" | "escuro".
// O layout lê no servidor e põe a classe `dark` no <html>, sem piscar.
// Sem cookie o padrão é "claro" (A4 concluída: todas as telas usam os tokens).
export type Tema = "claro" | "escuro";

export const COOKIE_TEMA = "tema";
export const TEMA_PADRAO: Tema = "claro";

export function temaDoCookie(valor: string | undefined): Tema {
  return valor === "claro" || valor === "escuro" ? valor : TEMA_PADRAO;
}
