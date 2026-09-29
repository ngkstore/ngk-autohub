// WhatsApp Cloud API (Meta) — mesma interface do lib/telegram.ts para os avisos do
// sistema. Variáveis: WHATSAPP_TOKEN (token do usuário do sistema), WHATSAPP_PHONE_ID
// (Phone Number ID do número remetente), WHATSAPP_DESTINO (número de quem recebe,
// só dígitos com DDI: 5541999999999).
//
// Regra da Meta: mensagem iniciada pela loja fora da janela de 24h só sai como
// TEMPLATE aprovado. Texto livre só funciona nas 24h seguintes a uma mensagem do
// destinatário. Por isso `enviarWhatsApp` tenta texto livre e, se a API recusar por
// janela fechada, cai no template `aviso_sistema` (1 variável = o texto inteiro).

const GRAPH = "https://graph.facebook.com/v25.0";

function cfg() {
  return {
    token: process.env.WHATSAPP_TOKEN || "",
    phoneId: process.env.WHATSAPP_PHONE_ID || "",
    destino: process.env.WHATSAPP_DESTINO || "",
  };
}

export function whatsappConfigurado() {
  const c = cfg();
  return !!(c.token && c.phoneId && c.destino);
}

type Resposta = { ok: boolean; erro?: string; codigo?: number; id?: string };

async function chamar(corpo: Record<string, unknown>): Promise<Resposta> {
  const c = cfg();
  if (!c.token || !c.phoneId) return { ok: false, erro: "WhatsApp não configurado" };
  try {
    const r = await fetch(`${GRAPH}/${c.phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...corpo }),
    });
    const j = (await r.json()) as { messages?: { id: string }[]; error?: { message: string; code: number } };
    if (!r.ok || j.error) return { ok: false, erro: j.error?.message || `HTTP ${r.status}`, codigo: j.error?.code };
    return { ok: true, id: j.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

// Template aprovado na Meta (Gestor do WhatsApp > Modelos). `variaveis` na ordem do {{1}}, {{2}}…
export async function enviarTemplateWhatsApp(
  nome: string,
  variaveis: string[] = [],
  idioma = "pt_BR",
  destino?: string
): Promise<Resposta> {
  const c = cfg();
  return chamar({
    to: destino || c.destino,
    type: "template",
    template: {
      name: nome,
      language: { code: idioma },
      ...(variaveis.length
        ? { components: [{ type: "body", parameters: variaveis.map((v) => ({ type: "text", text: v })) }] }
        : {}),
    },
  });
}

// Aviso de texto livre. Se a janela de 24h estiver fechada (erro 131047), reenvia
// como template `aviso_sistema` com o texto inteiro na variável {{1}}.
export async function enviarWhatsApp(texto: string, destino?: string): Promise<boolean> {
  const c = cfg();
  const to = destino || c.destino;
  if (!c.token || !c.phoneId || !to) return false;
  const livre = await chamar({ to, type: "text", text: { body: texto.slice(0, 4096), preview_url: false } });
  if (livre.ok) return true;
  if (livre.codigo === 131047 || /24|window|template/i.test(livre.erro || "")) {
    // Template não aceita quebra de linha nem 4+ espaços na variável: compacta.
    const compacto = texto.replace(/\s*\n+\s*/g, " · ").replace(/\s{2,}/g, " ").slice(0, 1024);
    const t = await enviarTemplateWhatsApp("aviso_sistema", [compacto]);
    return t.ok;
  }
  return false;
}
