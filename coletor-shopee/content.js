/**
 * Coletor NGK AutoHub — content.js
 * Junta as capturas do injected.js e manda em lote pro AutoHub.
 * Mostra um selo no canto com o que já foi enviado.
 */
(function () {
  "use strict";

  // Config vem do config.js (que NÃO vai pro git). Veja config.exemplo.js.
  var cfg = typeof NGK_CONFIG !== "undefined" ? NGK_CONFIG : null;
  var AUTOHUB = (cfg && cfg.AUTOHUB) || "https://ngk-autohub.vercel.app";
  var SEGREDO = (cfg && cfg.SEGREDO) || "";
  var LOJA_ID = (cfg && cfg.LOJA_ID) || "";

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
    if (!SEGREDO || SEGREDO.indexOf("COLE_AQUI") === 0) {
      erro = "falta o config.js (copie de config.exemplo.js)";
      mostrarSelo();
      return;
    }
    var lote = fila.splice(0, 20);
    // Vai pelo service worker (bg.js): daqui a chamada seria bloqueada por CORS.
    chrome.runtime.sendMessage(
      {
        tipo: "NGK_ENVIAR",
        autohub: AUTOHUB,
        segredo: SEGREDO,
        lojaId: LOJA_ID,
        capturas: lote,
      },
      function (resp) {
        if (chrome.runtime.lastError) {
          erro = chrome.runtime.lastError.message || "erro na extensão";
          fila = lote.concat(fila);
          mostrarSelo();
          return;
        }
        var d = resp && resp.dados;
        if (resp && resp.ok && d && d.sucesso) {
          enviadas += d.guardadas || lote.length;
          erro = "";
        } else {
          erro =
            (d && d.erro) ||
            (resp && resp.erro) ||
            "falha ao enviar (HTTP " + (resp && resp.status) + ")";
          fila = lote.concat(fila); // devolve pra tentar de novo
        }
        mostrarSelo();
      }
    );
  }

  setInterval(enviar, 4000);
  mostrarSelo();
})();
