/* Puts the $100 giving button on the page. The giving link's slug comes from the server (it differs between the
   sandbox and live), so the pages never hold it. Each <span data-scorecard-giving> becomes the button. */
(function () {
  var spots = document.querySelectorAll("[data-scorecard-giving]");
  if (!spots.length) return;
  fetch("/api/scorecard/config", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (cfg) {
      if (!cfg || !cfg.givingLinkSlug) return;
      spots.forEach(function (spot) {
        var s = document.createElement("script");
        s.src = "/embed/wgc-giving.js";
        s.setAttribute("data-wgc-slug", cfg.givingLinkSlug);
        s.setAttribute("data-wgc-mode", "button");
        s.setAttribute("data-wgc-button-text", "Get your pointers here ($100)");
        s.setAttribute("data-wgc-button-size", "medium");
        s.setAttribute("data-wgc-button-color", "navy");
        s.setAttribute("data-wgc-button-radius", "rounded");
        spot.parentNode.insertBefore(s, spot.nextSibling);
      });
    })
    .catch(function () {});
})();
