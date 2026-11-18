/**
 * WGC Payments — Auction website embed.
 *
 * Shows an auction right on your own website so people can register to bid, see the items and place bids without
 * leaving your page. Put this where the auction should appear:
 *
 *   <div data-wgc-auction data-wgc-slug="spring-gala-auction-1a2b3c"></div>
 *   <script async src="https://www.wgcpayments.com/embed/wgc-auction.js"></script>
 *
 * The frame sizes itself to the auction, so there is no scrollbar. Nothing about the people who register or bid is
 * ever sent to your page; you see who registered in your WGC dashboard.
 */
(function () {
  "use strict";

  function resolveOrigin() {
    var cs = document.currentScript;
    if (cs && cs.src) {
      try { return new URL(cs.src).origin; } catch (e) { /* fall through */ }
    }
    var scripts = document.querySelectorAll('script[src*="wgc-auction.js"]');
    for (var i = 0; i < scripts.length; i++) {
      try { return new URL(scripts[i].src).origin; } catch (e) { /* next */ }
    }
    return null;
  }

  var ORIGIN = resolveOrigin();
  if (!ORIGIN) return;
  var SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,80}$/i;

  var core = window.__wgcAuctionCore;
  if (!core) {
    core = window.__wgcAuctionCore = { origin: ORIGIN, frames: [] };
    window.addEventListener("message", function (event) {
      if (event.origin !== core.origin) return;
      var data = event.data;
      if (!data || data.source !== "wgc-auction" || data.type !== "WGC_AUCTION_HEIGHT") return;
      for (var i = 0; i < core.frames.length; i++) {
        var f = core.frames[i];
        if (f.contentWindow === event.source && typeof data.height === "number" && data.height > 0) {
          f.style.height = Math.min(Math.ceil(data.height), 8000) + "px";
        }
      }
    });
  }

  function mount(container) {
    if (container.getAttribute("data-wgc-mounted")) return;
    var slug = container.getAttribute("data-wgc-slug");
    if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) { console.error("WGC Auction: missing or invalid data-wgc-slug."); return; }
    container.setAttribute("data-wgc-mounted", "1");
    var frame = document.createElement("iframe");
    frame.src = ORIGIN + "/embed/auction/" + encodeURIComponent(slug);
    frame.title = "Auction";
    frame.loading = "lazy";
    frame.style.cssText = "width:100%;height:720px;border:0;display:block;background:transparent;";
    container.appendChild(frame);
    core.frames.push(frame);
  }

  function scan() {
    var nodes = document.querySelectorAll("[data-wgc-auction]");
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  else scan();
})();
