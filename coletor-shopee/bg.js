/**
 * Coletor NGK AutoHub — bg.js (service worker)
 *
 * O content.js não pode chamar o AutoHub direto: rodando no contexto da página
 * da Shopee, a chamada é cross-origin e o Chrome bloqueia (CORS). O service
 * worker tem host_permissions e faz a chamada sem esse problema.
 */
chrome.runtime.onMessage.addListener(function (msg, sender, responder) {
  if (!msg || msg.tipo !== "NGK_ENVIAR") return;

  fetch(msg.autohub + "/api/insights/coletor", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + msg.segredo,
    },
    body: JSON.stringify({ capturas: msg.capturas, loja_id: msg.lojaId }),
  })
    .then(function (r) {
      return r.json().then(function (d) {
        responder({ ok: r.ok, status: r.status, dados: d });
      });
    })
    .catch(function (e) {
      responder({ ok: false, erro: String(e && e.message ? e.message : e) });
    });

  return true; // resposta assíncrona
});
