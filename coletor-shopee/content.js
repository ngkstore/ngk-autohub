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
  // endpoint -> última URL vista (molde pro replay). Fica salvo no navegador:
  // aprendendo UMA vez, replica pra sempre, sem você visitar a tela de novo.
  var modelos = {};
  var spcCds = null;

  chrome.storage.local.get(["ngk_modelos"], function (r) {
    if (r && r.ngk_modelos) modelos = Object.assign({}, r.ngk_modelos, modelos);
  });

  function salvarModelos() {
    try {
      chrome.storage.local.set({ ngk_modelos: modelos });
    } catch (e) {
      /* noop */
    }
  }

  window.addEventListener("NGK_CAPTURA", function (ev) {
    var c;
    try {
      c = JSON.parse(ev.detail);
    } catch (e) {
      return;
    }
    if (c.erro) return;
    fila.push(c);

    if (c.url) {
      // O token da sessão muda; sempre usa o mais novo.
      var m = String(c.url).match(/[?&]SPC_CDS=([^&]+)/);
      if (m) spcCds = m[1];
      // Guarda o molde (só das chamadas do PAINEL, não das nossas).
      if (!c.replay) {
        var base = String(c.url).split("?")[0];
        if (modelos[base] !== c.url) {
          modelos[base] = c.url;
          salvarModelos();
        }
      }
    }
    mostrarSelo();
  });

  /* ---- REPLAY: pede sozinho as janelas que faltam ----
     Reaproveita a URL que o painel acabou de usar e troca só as datas e o
     tamanho da página — assim não preciso adivinhar os parâmetros. */
  function trocarParam(url, chave, valor) {
    var re = new RegExp("([?&]" + chave + "=)[^&]*");
    return re.test(url)
      ? url.replace(re, "$1" + valor)
      : url + (url.indexOf("?") >= 0 ? "&" : "?") + chave + "=" + valor;
  }

  function pedir(url) {
    window.dispatchEvent(
      new CustomEvent("NGK_PEDIR", { detail: JSON.stringify({ url: url }) })
    );
  }

  // paginas: a loja tem ~123 produtos, então 100 por página x 2-3 páginas.
  var ALVOS = [
    { base: "/api/mydata/v3/dashboard/product-rankings/", paginas: 3 },
    { base: "/api/mydata/v1/dashboard/traffic-sources/product-contribution/", paginas: 3 },
    { base: "/api/pas/v1/report/get_time_graph/", paginas: 1 },
    // por item DENTRO da campanha (traz a posição) — aprendido ao entrar numa campanha
    { base: "/api/pas/v1/report/list_report/", paginas: 3 },
    { base: "/api/pas/v1/product/list_product_report/", paginas: 3 },
  ];
  var JANELAS = [7, 15, 30]; // dias
  var jaReplicou = {};

  function replicar() {
    var agora = Math.floor(Date.now() / 1000);
    var atraso = 0;

    ALVOS.forEach(function (alvo) {
      var molde = modelos[alvo.base];
      if (!molde) return; // ainda não vi essa chamada

      JANELAS.forEach(function (dias) {
        for (var p = 1; p <= alvo.paginas; p++) {
          var chave = alvo.base + ":" + dias + ":" + p;
          if (jaReplicou[chave]) continue;
          jaReplicou[chave] = true;

          var url = molde;
          // molde salvo de outra sessão: atualiza o token pro atual
          if (spcCds) url = trocarParam(url, "SPC_CDS", spcCds);
          url = trocarParam(url, "start_time", agora - dias * 86400);
          url = trocarParam(url, "end_time", agora);
          // todos os produtos, não só os da tela
          if (/page_size=/.test(url)) url = trocarParam(url, "page_size", 100);
          if (/page_num=/.test(url)) url = trocarParam(url, "page_num", p);
          if (/offset=/.test(url)) url = trocarParam(url, "offset", (p - 1) * 100);
          if (/limit=/.test(url)) url = trocarParam(url, "limit", 100);

          // espaça: nada de rajada
          atraso += 1500 + Math.floor(Math.random() * 700);
          (function (u, d) {
            setTimeout(function () {
              pedir(u);
            }, d);
          })(url, atraso);
        }
      });
    });
  }

  // Dá tempo do painel carregar (e nos dar os moldes), depois replica.
  setTimeout(replicar, 6000);
  setInterval(replicar, 30000);

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
