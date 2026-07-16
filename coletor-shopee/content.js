/**
 * Coletor NGK AutoHub — content.js
 * Junta as capturas do injected.js e manda em lote pro AutoHub.
 * Mostra um selo no canto com o que já foi enviado.
 */
(function () {
  "use strict";

  // ======= CONFIGURE AQUI (1x) =======
  var AUTOHUB = "https://ngk-autohub.vercel.app";
  var SEGREDO = "COLE_AQUI_O_SEU_COLETOR_SECRET";
  // ===================================

  var fila = [];
  var enviadas = 0;
  var erro = "";

  /* ---- selo visual ---- */
  var selo = document.createElement("div");
  selo.style.cssText =
    "position:fixed;bottom:16px;left:16px;z-index:999999;background:#0f172a;color:#e2e8f0;" +
    "border:1px solid #334155;border-radius:10px;padding:8px 12px;font:12px system-ui;" +
    "box-shadow:0 4px 12px rgba(0,0,0,.4);pointer-events:none;opacity:.92";
  function pintarSelo() {
    selo.textContent = erro
      ? "AutoHub: " + erro
      : "AutoHub · " + enviadas + " captura(s) enviada(s)" +
        (fila.length ? " · " + fila.length + " na fila" : "");
    selo.style.borderColor = erro ? "#7f1d1d" : "#334155";
  }
  function mostrarSelo() {
    if (!document.body) return;
    if (!selo.isConnected) document.body.appendChild(selo);
    pintarSelo();
  }

  /* ---- recebe do injected ---- */
  window.addEventListener("NGK_CAPTURA", function (ev) {
    try {
      fila.push(JSON.parse(ev.detail));
      mostrarSelo();
    } catch (e) {
      /* noop */
    }
  });

  /* ---- envia em lote ---- */
  function enviar() {
    if (fila.length === 0) return;
    if (SEGREDO.indexOf("COLE_AQUI") === 0) {
      erro = "configure o SEGREDO no content.js";
      mostrarSelo();
      return;
    }
    var lote = fila.splice(0, 20);
    fetch(AUTOHUB + "/api/insights/coletor", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + SEGREDO,
      },
      body: JSON.stringify({ capturas: lote }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (d && d.sucesso) {
          enviadas += d.guardadas || lote.length;
          erro = "";
        } else {
          erro = (d && d.erro) || "falha ao enviar";
          fila = lote.concat(fila); // devolve pra tentar de novo
        }
        mostrarSelo();
      })
      .catch(function (e) {
        erro = String(e && e.message ? e.message : e);
        fila = lote.concat(fila);
        mostrarSelo();
      });
  }

  setInterval(enviar, 4000);
  mostrarSelo();
})();
