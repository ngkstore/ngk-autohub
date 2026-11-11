// Formatadores de tela (NOVO-VISUAL, A3). Sempre pt-BR.
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

/** R$ 1.234,56 (casas opcionais; padrão 2). */
export function brl(v: unknown, casas = 2): string {
  return num(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** 12,3% a partir de 12.3 (já em pontos percentuais). */
export function pct(v: unknown, casas = 1): string {
  return `${num(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

/** 1.234 ou 1.234,5. */
export function numero(v: unknown, casas = 0): string {
  return num(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** 1,2 mil / 3,4 mi para espaços curtos. */
export function compacto(v: unknown): string {
  const n = Math.abs(num(v));
  if (n >= 1_000_000) return `${numero(num(v) / 1_000_000, 1)} mi`;
  if (n >= 10_000) return `${numero(num(v) / 1_000, 1)} mil`;
  return numero(v);
}

/** Prazo relativo ao agora: "em 1h 20", "em 2 d", "vencida 2 h", "agora". */
export function prazoRelativo(prazo: Date | string | null | undefined, agora: Date = new Date()): string {
  if (!prazo) return "";
  const d = typeof prazo === "string" ? new Date(prazo) : prazo;
  if (Number.isNaN(d.getTime())) return "";
  const min = Math.round((d.getTime() - agora.getTime()) / 60000);
  const abs = Math.abs(min);
  const texto = abs < 1 ? "agora" : abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.floor(abs / 60)}h${abs % 60 ? ` ${String(abs % 60).padStart(2, "0")}` : ""}` : `${Math.round(abs / 1440)} d`;
  if (abs < 1) return texto;
  return min > 0 ? `em ${texto}` : `vencida ${texto}`;
}

/** Urgência para a etiqueta de prazo: vermelho até 4 h ou vencido, laranja hoje, amarelo amanhã, cinza depois. */
export type Urgencia = "agora" | "hoje" | "amanha" | "depois";
export function urgenciaDoPrazo(prazo: Date | string | null | undefined, agora: Date = new Date()): Urgencia {
  if (!prazo) return "depois";
  const d = typeof prazo === "string" ? new Date(prazo) : prazo;
  if (Number.isNaN(d.getTime())) return "depois";
  if (d.getTime() - agora.getTime() <= 4 * 3600 * 1000) return "agora";
  const fimHoje = new Date(agora);
  fimHoje.setHours(23, 59, 59, 999);
  if (d <= fimHoje) return "hoje";
  const fimAmanha = new Date(fimHoje);
  fimAmanha.setDate(fimAmanha.getDate() + 1);
  return d <= fimAmanha ? "amanha" : "depois";
}

/** 11/11/2026 ou 11/11 14:30. */
export function data(v: Date | string | null | undefined, comHora = false): string {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    ...(comHora ? { hour: "2-digit", minute: "2-digit" } : { year: "numeric" }),
  });
}
