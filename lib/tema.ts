// Preferência de tema (NOVO-VISUAL, A1): cookie `tema` = "claro" | "escuro".
// O layout lê no servidor e põe a classe `dark` no <html>, sem piscar.
// Enquanto as telas antigas (escuras fixas) não forem migradas na A4, o padrão
// sem cookie é "escuro" para nada ficar ilegível; na A4 passa a "claro".
export type Tema = "claro" | "escuro";

export const COOKIE_TEMA = "tema";
export const TEMA_PADRAO: Tema = "escuro";

export function temaDoCookie(valor: string | undefined): Tema {
  return valor === "claro" || valor === "escuro" ? valor : TEMA_PADRAO;
}
