// Leitura das planilhas da Shopee. Os exports vêm em formatos DIFERENTES:
//  - Ads CSV .............. US: "5.10%", "13689.09" (sem separador de milhar)
//  - Business Insights .... BR: "13,86%", "1.065.342", "36.974,00"
// Esta função entende os dois.
export function numeroPlanilha(v: unknown): number {
  if (typeof v === "number") return v;
  let s = String(v ?? "").trim();
  if (!s || s === "-") return 0;
  s = s.replace(/[R$\s%]/g, "");
  if (!s) return 0;

  const temPonto = s.includes(".");
  const temVirgula = s.includes(",");

  if (temPonto && temVirgula) {
    // o separador que vem por último é o decimal
    s =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".") // BR: 1.234,56
        : s.replace(/,/g, ""); // US: 1,234.56
  } else if (temVirgula) {
    s = s.replace(",", "."); // 13,86 -> 13.86
  } else if (temPonto) {
    const partes = s.split(".");
    // 2+ pontos = milhar (1.065.342). 1 ponto com 3 dígitos depois = milhar
    // (343.495). Senão é decimal (5.10).
    if (partes.length > 2) s = partes.join("");
    else if (partes[1]?.length === 3) s = partes.join("");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export type TipoPlanilha = "ads" | "produto" | "trafego" | "desconhecida";

// Descobre que planilha é, pelas colunas.
export function tipoDaPlanilha(colunas: string[] | null): TipoPlanilha {
  const c = (colunas || []).map((x) => x.toLowerCase());
  const tem = (t: string) => c.some((x) => x.includes(t));

  if (tem("id do produto") && tem("despesas")) return "ads"; // relatório de Ads
  if (tem("id do item") && (tem("impressões de produto") || tem("impressão do produto")))
    return "produto"; // Business Insights por produto
  if (tem("data") && tem("adicionar ao carrinho") && !tem("id do item"))
    return "trafego"; // Tráfego do Produto (por dia, loja)
  return "desconhecida";
}

// Acha o valor de uma linha por nome aproximado de coluna.
export function campo(linha: Record<string, unknown>, ...nomes: string[]): unknown {
  const chaves = Object.keys(linha);
  for (const nome of nomes) {
    const achou = chaves.find(
      (k) => k.toLowerCase().trim() === nome.toLowerCase().trim()
    );
    if (achou) return linha[achou];
  }
  // tentativa por "contém"
  for (const nome of nomes) {
    const achou = chaves.find((k) => k.toLowerCase().includes(nome.toLowerCase()));
    if (achou) return linha[achou];
  }
  return undefined;
}

export type AnuncioAds = {
  itemId: string;
  nome: string;
  status: string;
  impressoes: number;
  cliques: number;
  ctr: number; // %
  addCarrinho: number;
  taxaCarrinho: number; // %
  conversoes: number;
  taxaConversao: number; // %
  itensVendidos: number;
  gmv: number;
  despesas: number;
  roas: number;
  ticket: number; // gmv / itens vendidos
};

// Normaliza o relatório de Ads (Dados Gerais de Anúncios).
export function lerAds(linhas: Record<string, unknown>[]): AnuncioAds[] {
  return linhas
    .map((l) => {
      const itemId = String(campo(l, "ID do produto") ?? "").trim();
      const gmv = numeroPlanilha(campo(l, "GMV"));
      const itens = numeroPlanilha(campo(l, "Itens Vendidos"));
      return {
        itemId,
        nome: String(campo(l, "Nome do Anúncio") ?? "").trim(),
        status: String(campo(l, "Status") ?? "").trim(),
        impressoes: numeroPlanilha(campo(l, "Impressões")),
        cliques: numeroPlanilha(campo(l, "Cliques")),
        ctr: numeroPlanilha(campo(l, "CTR")),
        addCarrinho: numeroPlanilha(campo(l, "Add to Cart")),
        taxaCarrinho: numeroPlanilha(campo(l, "Add to Cart Rate")),
        conversoes: numeroPlanilha(campo(l, "Conversões")),
        taxaConversao: numeroPlanilha(campo(l, "Taxa de Conversão")),
        itensVendidos: itens,
        gmv,
        despesas: numeroPlanilha(campo(l, "Despesas")),
        roas: numeroPlanilha(campo(l, "ROAS")),
        ticket: itens > 0 ? gmv / itens : 0,
      };
    })
    .filter((a) => a.itemId && /^\d+$/.test(a.itemId));
}

// Faixa de ticket — comparar Balança (R$17) com Panela (R$304) é injusto.
export function faixaTicket(ticket: number): string {
  if (ticket < 30) return "até R$30";
  if (ticket < 80) return "R$30–80";
  if (ticket < 200) return "R$80–200";
  return "R$200+";
}

export function mediana(valores: number[]): number {
  const v = valores.filter((n) => n > 0).sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

export type Veredito = {
  acao: "PAUSAR" | "CORRIGIR VITRINE" | "CORRIGIR PÁGINA" | "ESCALAR" | "MANTER";
  motivo: string;
  cor: string;
};

// Diagnóstico: onde o funil vaza, comparando com os PARES do mesmo ticket.
export function diagnosticar(
  a: AnuncioAds,
  medianaCtr: number,
  medianaCarrinho: number
): Veredito {
  if (a.despesas > 0 && a.conversoes === 0) {
    return {
      acao: "PAUSAR",
      motivo: `Gastou R$${a.despesas.toFixed(2)} e não vendeu nada.`,
      cor: "bg-red-900 text-red-300",
    };
  }
  // CTR fraco = problema de vitrine (capa/título/preço na busca)
  if (medianaCtr > 0 && a.ctr < medianaCtr * 0.7 && a.impressoes > 1000) {
    return {
      acao: "CORRIGIR VITRINE",
      motivo: `CTR ${a.ctr.toFixed(2)}% vs ${medianaCtr.toFixed(2)}% dos pares — tem impressão, falta clique. Capa/título/preço.`,
      cor: "bg-amber-900 text-amber-300",
    };
  }
  // Clica mas não adiciona = problema de página
  if (medianaCarrinho > 0 && a.taxaCarrinho < medianaCarrinho * 0.6 && a.cliques > 100) {
    return {
      acao: "CORRIGIR PÁGINA",
      motivo: `Carrinho ${a.taxaCarrinho.toFixed(2)}% vs ${medianaCarrinho.toFixed(2)}% dos pares — clica e não adiciona. Fotos/descrição/avaliações.`,
      cor: "bg-orange-900 text-orange-300",
    };
  }
  if (a.roas > 0 && a.taxaCarrinho >= medianaCarrinho && a.conversoes > 0) {
    return {
      acao: "ESCALAR",
      motivo: `Funil saudável e ROAS ${a.roas.toFixed(1)}.`,
      cor: "bg-green-900 text-green-300",
    };
  }
  return { acao: "MANTER", motivo: "Sem gargalo evidente.", cor: "bg-slate-700 text-slate-300" };
}
