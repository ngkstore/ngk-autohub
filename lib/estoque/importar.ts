import { supabase } from "@/lib/supabase";

// D2 — importação das planilhas do UpSeller (CSV, separador , ou ;), quando a API não trouxer:
//  - produtos do armazém: colunas com SKU, nome, tipo/kit, componentes, peso, custo, fornecedor
//  - mapeamento de SKU do anúncio: loja/canal, item_id, model_id, sku do anúncio, sku do armazém
// As colunas são reconhecidas pelo nome (acentos/caixa ignorados); o que não bater fica de fora
// e aparece no resumo. Nada é apagado: só upsert.
export type ResultadoImport = { linhas: number; gravadas: number; kits: number; ignoradas: number; colunas: string[]; avisos: string[] };

export function lerCsv(texto: string): { cabecalho: string[]; linhas: string[][] } {
  const sep = (texto.split("\n")[0].match(/;/g) || []).length > (texto.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  const linhas: string[][] = [];
  let atual: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) {
      atual.push(campo);
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texto[i + 1] === "\n") i++;
      atual.push(campo);
      if (atual.some((c) => c.trim() !== "")) linhas.push(atual);
      atual = [];
      campo = "";
    } else campo += ch;
  }
  if (campo !== "" || atual.length) {
    atual.push(campo);
    if (atual.some((c) => c.trim() !== "")) linhas.push(atual);
  }
  const cabecalho = (linhas.shift() || []).map((c) => c.replace(/^﻿/, "").trim());
  return { cabecalho, linhas };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function indice(cabecalho: string[], ...nomes: string[]): number {
  const h = cabecalho.map(norm);
  for (const nome of nomes) {
    const i = h.findIndex((c) => c === norm(nome));
    if (i >= 0) return i;
  }
  for (const nome of nomes) {
    const i = h.findIndex((c) => c.includes(norm(nome)));
    if (i >= 0) return i;
  }
  return -1;
}

const num = (v: string | undefined) => {
  if (!v) return null;
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export async function importarProdutosArmazem(texto: string): Promise<ResultadoImport> {
  const { cabecalho, linhas } = lerCsv(texto);
  const iSku = indice(cabecalho, "sku", "sku do armazem", "codigo sku", "sku armazem", "codigo");
  const iNome = indice(cabecalho, "nome do produto", "nome", "produto", "titulo", "descricao");
  const iTipo = indice(cabecalho, "tipo", "tipo de produto", "e kit", "kit");
  const iComp = indice(cabecalho, "componentes", "composicao", "skus do kit", "itens do kit", "componente");
  const iPeso = indice(cabecalho, "peso kg", "peso", "peso liquido");
  const iCusto = indice(cabecalho, "custo", "custo medio", "preco de custo", "custo unitario");
  const iForn = indice(cabecalho, "fornecedor");
  const iCaixa = indice(cabecalho, "unidades por caixa", "caixa", "qtd por caixa");
  const avisos: string[] = [];
  if (iSku < 0) return { linhas: linhas.length, gravadas: 0, kits: 0, ignoradas: linhas.length, colunas: cabecalho, avisos: ["Não achei a coluna de SKU."] };
  if (iNome < 0) avisos.push("Sem coluna de nome: fica só o SKU.");
  const fornecedores = new Map<string, string>();
  const { data: forn } = await supabase.from("fornecedores").select("id, nome");
  for (const f of forn || []) fornecedores.set(norm(f.nome), f.id);
  let gravadas = 0;
  let kits = 0;
  let ignoradas = 0;
  const lote: Record<string, unknown>[] = [];
  const kitLinhas: { sku_kit: string; sku_componente: string; quantidade: number }[] = [];
  for (const l of linhas) {
    const sku = (l[iSku] || "").trim();
    if (!sku) {
      ignoradas++;
      continue;
    }
    const tipoTxt = iTipo >= 0 ? norm(l[iTipo] || "") : "";
    const comp = iComp >= 0 ? (l[iComp] || "").trim() : "";
    const ehKit = /kit|combo|conjunto/.test(tipoTxt) || (comp !== "" && /[,;+]/.test(comp));
    const fornNome = iForn >= 0 ? norm(l[iForn] || "") : "";
    let fornecedorId: string | null = fornNome ? fornecedores.get(fornNome) ?? null : null;
    if (fornNome && !fornecedorId) {
      const { data } = await supabase.from("fornecedores").insert({ nome: (l[iForn] || "").trim() }).select("id").single();
      fornecedorId = data?.id ?? null;
      if (fornecedorId) fornecedores.set(fornNome, fornecedorId);
    }
    lote.push({ sku, nome: iNome >= 0 ? (l[iNome] || "").trim() || null : null, tipo: ehKit ? "kit" : /variac/.test(tipoTxt) ? "variacao" : "unico", peso_kg: iPeso >= 0 ? num(l[iPeso]) : null, custo: iCusto >= 0 ? num(l[iCusto]) : null, fornecedor_id: fornecedorId, caixa: iCaixa >= 0 ? (num(l[iCaixa]) ?? null) : null, atualizado_em: new Date().toISOString() });
    if (ehKit && comp) {
      // "SKUA x4; SKUB*2; SKUC" → componentes com quantidade
      for (const parte of comp.split(/[;,+|]/)) {
        const m = parte.trim().match(/^([^\s*x×]+)\s*(?:[x×*]\s*(\d+(?:[.,]\d+)?))?$/i) || parte.trim().match(/^(\d+)\s*[x×*]\s*(.+)$/i);
        if (!m) continue;
        const skuC = /^\d+$/.test(m[1]) ? m[2] : m[1];
        const qtd = /^\d+$/.test(m[1]) ? Number(m[1]) : num(m[2]) ?? 1;
        if (skuC) {
          kitLinhas.push({ sku_kit: sku, sku_componente: skuC.trim(), quantidade: qtd || 1 });
          kits++;
        }
      }
    }
  }
  for (let i = 0; i < lote.length; i += 500) {
    const bloco = lote.slice(i, i + 500);
    // não sobrescreve custo/nome com vazio
    const { error } = await supabase.from("catalogo_sku").upsert(bloco.map((b) => Object.fromEntries(Object.entries(b).filter(([, v]) => v !== null))), { onConflict: "sku" });
    if (error) avisos.push(error.message);
    else gravadas += bloco.length;
  }
  for (let i = 0; i < kitLinhas.length; i += 500) await supabase.from("kit_componentes").upsert(kitLinhas.slice(i, i + 500), { onConflict: "sku_kit,sku_componente" });
  return { linhas: linhas.length, gravadas, kits, ignoradas, colunas: cabecalho, avisos };
}

export async function importarMapeamento(texto: string, lojaPadrao: string | null, lojasPorNome: Map<string, { id: string; canal: "shopee" | "tiktok" }>): Promise<ResultadoImport> {
  const { cabecalho, linhas } = lerCsv(texto);
  const iLoja = indice(cabecalho, "loja", "conta", "store", "nome da loja");
  const iCanal = indice(cabecalho, "canal", "plataforma", "marketplace");
  const iItem = indice(cabecalho, "item id", "item_id", "id do anuncio", "product id", "produto id");
  const iModel = indice(cabecalho, "model id", "model_id", "id da variacao", "sku id", "variation id");
  const iSkuAn = indice(cabecalho, "sku do anuncio", "sku anuncio", "sku da variacao", "sku da plataforma", "sku do canal", "sku online");
  const iSkuAr = indice(cabecalho, "sku do armazem", "sku armazem", "sku do estoque", "sku do sistema", "sku local");
  const avisos: string[] = [];
  if (iSkuAn < 0 || iSkuAr < 0) return { linhas: linhas.length, gravadas: 0, kits: 0, ignoradas: linhas.length, colunas: cabecalho, avisos: ["Preciso das colunas 'SKU do anúncio' e 'SKU do armazém'."] };
  let gravadas = 0;
  let ignoradas = 0;
  const lote: Record<string, unknown>[] = [];
  for (const l of linhas) {
    const skuAn = (l[iSkuAn] || "").trim();
    const skuAr = (l[iSkuAr] || "").trim();
    if (!skuAn || !skuAr) {
      ignoradas++;
      continue;
    }
    const nomeLoja = iLoja >= 0 ? norm(l[iLoja] || "") : "";
    const loja = [...lojasPorNome.entries()].find(([n]) => nomeLoja && (n.includes(nomeLoja) || nomeLoja.includes(n)))?.[1];
    const canalTxt = iCanal >= 0 ? norm(l[iCanal] || "") : "";
    const canal = loja?.canal ?? (/tik/.test(canalTxt) ? "tiktok" : "shopee");
    const lojaId = loja?.id ?? lojaPadrao;
    if (!lojaId) {
      ignoradas++;
      continue;
    }
    lote.push({ canal, loja_id: lojaId, item_id: iItem >= 0 ? (l[iItem] || "").trim() || null : null, model_id: iModel >= 0 ? (l[iModel] || "").trim() || null : null, sku_anuncio: skuAn, sku_armazem: skuAr, anormal: skuAn !== skuAr && !/^[A-Z0-9ÇÃÕÉÍÓÚÂÊÔ_-]+$/i.test(skuAr), atualizado_em: new Date().toISOString() });
  }
  for (let i = 0; i < lote.length; i += 500) {
    const { error } = await supabase.from("catalogo_mapeamento").upsert(lote.slice(i, i + 500), { onConflict: "canal,loja_id,sku_anuncio" });
    if (error) avisos.push(error.message);
    else gravadas += Math.min(500, lote.length - i);
  }
  return { linhas: linhas.length, gravadas, kits: 0, ignoradas, colunas: cabecalho, avisos };
}
