/**
 * Coletor NGK AutoHub — injected.js (roda no contexto da PÁGINA)
 *
 * Escuta o que o painel do Seller Center JÁ pede e copia a resposta.
 * NÃO faz requisição nova à Shopee — só lê o que passou pela sua tela.
 *   /api/pas/    = Shopee Ads
 *   /api/mydata/ = Informações Gerenciais (tráfego/vendas totais)
 */
(function () {
  "use strict";

  var RELEVANTE = /\/api\/(pas|mydata)\//;

  function emitir(payload) {
    try {
      window.dispatchEvent(
        new CustomEvent("NGK_CAPTURA", { detail: JSON.stringify(payload) })
      );
    } catch (e) {
      /* payload gigante ou circular: ignora */
    }
  }

  /* ---- fetch ---- */
  var fetchOriginal = window.fetch;
  window.fetch = function () {
    var args = arguments;
    var url = "";
    try {
      url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
    } catch (e) {
      /* noop */
    }
    var promessa = fetchOriginal.apply(this, args);
    if (RELEVANTE.test(url)) {
      promessa
        .then(function (res) {
          res
            .clone()
            .json()
            .then(function (data) {
              emitir({ url: url, metodo: "GET", data: data, ts: Date.now() });
            })
            .catch(function () {
              /* não é JSON */
            });
        })
        .catch(function () {
          /* noop */
        });
    }
    return promessa;
  };

  /* ---- XHR ---- */
  var abrirOriginal = XMLHttpRequest.prototype.open;
  var enviarOriginal = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (metodo, url) {
    this.__ngk_url = url || "";
    this.__ngk_metodo = metodo ? String(metodo).toUpperCase() : "GET";
    return abrirOriginal.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    var xhr = this;
    if (xhr.__ngk_url && RELEVANTE.test(xhr.__ngk_url)) {
      xhr.addEventListener("load", function () {
        try {
          emitir({
            url: xhr.__ngk_url,
            metodo: xhr.__ngk_metodo || "GET",
            data: JSON.parse(xhr.responseText),
            ts: Date.now(),
          });
        } catch (e) {
          /* não é JSON */
        }
      });
    }
    return enviarOriginal.apply(this, arguments);
  };
})();
