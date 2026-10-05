/**
 * WGC Payments — Event registration website embed.
 *
 * Two ways to put an event on a website:
 *
 *   1. Button — a "Register" button that opens the secure registration page
 *      in a small window. Works on every site builder; payments (card, bank,
 *      Apple Pay, Google Pay) always run in that top-level window, which is
 *      where Finix's card form is allowed to run.
 *        <script src="https://www.wgcpayments.com/embed/wgc-event.js"
 *                data-wgc-slug="spring-gala-1a2b3c" data-wgc-mode="button"
 *                data-wgc-button-text="Register"></script>
 *
 *   2. Inline — the event's details shown right on the page in an
 *      auto-resizing frame. Free events can be registered for in place;
 *      anything with a payment shows a "Register & pay" button that opens
 *      the same secure window as the button.
 *        <div data-wgc-event data-wgc-slug="spring-gala-1a2b3c"></div>
 *        <script async src="https://www.wgcpayments.com/embed/wgc-event.js"></script>
 *
 * When someone finishes registering, a "wgc:event-registered" CustomEvent
 * fires on the host window ({ detail: { slug, pending } }) so a site can
 * thank them or track a conversion. Only that — never names, emails,
 * confirmation codes or payment data — is ever sent to the host page.
 */
(function () {
  "use strict";

  function resolveOrigin() {
    var cs = document.currentScript;
    if (cs && cs.src) {
      try { return new URL(cs.src).origin; } catch (e) { /* fall through */ }
    }
    var scripts = document.querySelectorAll('script[src*="wgc-event.js"]');
    for (var i = 0; i < scripts.length; i++) {
      try { return new URL(scripts[i].src).origin; } catch (e) { /* next */ }
    }
    return null;
  }

  var ORIGIN = resolveOrigin();
  if (!ORIGIN) return;

  var SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,80}$/i;
  var SIZES = {
    small: { padding: "8px 16px", fontSize: "13px" },
    medium: { padding: "12px 22px", fontSize: "15px" },
    large: { padding: "16px 28px", fontSize: "17px" },
  };
  // Fixed palette only — never an arbitrary value from a data attribute.
  var COLORS = {
    gold: { bg: "#EAB308", fg: "#0B1220" },
    navy: { bg: "#0B1220", fg: "#FFFFFF" },
    black: { bg: "#111111", fg: "#FFFFFF" },
    white: { bg: "#FFFFFF", fg: "#111111", border: "#D1D5DB" },
  };
  var RADIUS = { rounded: "10px", square: "2px" };

  var core = window.__wgcEventCore;
  if (!core) {
    core = window.__wgcEventCore = { origin: ORIGIN, frames: [] };
    window.addEventListener("message", function (event) {
      if (event.origin !== core.origin) return;
      var data = event.data;
      if (!data || data.source !== "wgc-event") return;
      if (data.type === "WGC_EVENT_HEIGHT") {
        for (var i = 0; i < core.frames.length; i++) {
          var f = core.frames[i];
          if (f.contentWindow === event.source && typeof data.height === "number" && data.height > 0) {
            f.style.height = Math.min(Math.ceil(data.height), 6000) + "px";
          }
        }
      } else if (data.type === "WGC_EVENT_REGISTERED" && typeof data.slug === "string") {
        try {
          window.dispatchEvent(new CustomEvent("wgc:event-registered", { detail: { slug: data.slug, pending: Boolean(data.pending) } }));
        } catch (e) { /* old browser: no custom events */ }
      }
    });
  }

  function validSlug(slug) {
    return typeof slug === "string" && SLUG_PATTERN.test(slug);
  }

  function openRegistration(slug) {
    var url = ORIGIN + "/event/" + encodeURIComponent(slug) + "?embed=1";
    var w = window.open(url, "wgc-event-" + slug, "width=560,height=860,scrollbars=yes,resizable=yes");
    // Pop-up blocked (or a phone browser): fall back to a normal new tab.
    if (!w) window.open(url, "_blank", "noopener");
  }

  function styleButton(btn, opts) {
    var size = SIZES[opts.size] || SIZES.medium;
    var color = COLORS[opts.color] || COLORS.gold;
    btn.type = "button";
    btn.textContent = (opts.text || "Register").slice(0, 40);
    btn.style.cssText =
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-weight:700;cursor:pointer;line-height:1.2;" +
      "padding:" + size.padding + ";font-size:" + size.fontSize + ";background:" + color.bg + ";color:" + color.fg + ";" +
      "border:" + (color.border ? "1px solid " + color.border : "none") + ";border-radius:" + (RADIUS[opts.radius] || RADIUS.rounded) + ";";
  }

  function mountButton(scriptEl) {
    var slug = scriptEl.getAttribute("data-wgc-slug");
    if (!validSlug(slug)) { console.error("WGC Event: missing or invalid data-wgc-slug."); return; }
    var btn = document.createElement("button");
    styleButton(btn, {
      text: scriptEl.getAttribute("data-wgc-button-text"),
      size: scriptEl.getAttribute("data-wgc-button-size"),
      color: scriptEl.getAttribute("data-wgc-button-color"),
      radius: scriptEl.getAttribute("data-wgc-button-radius"),
    });
    btn.addEventListener("click", function () { openRegistration(slug); });
    scriptEl.parentNode.insertBefore(btn, scriptEl);
  }

  function mountInline(container) {
    if (container.getAttribute("data-wgc-mounted")) return;
    var slug = container.getAttribute("data-wgc-slug");
    if (!validSlug(slug)) { console.error("WGC Event: missing or invalid data-wgc-slug."); return; }
    container.setAttribute("data-wgc-mounted", "1");
    var frame = document.createElement("iframe");
    frame.src = ORIGIN + "/embed/event/" + encodeURIComponent(slug);
    frame.title = "Event registration";
    frame.loading = "lazy";
    frame.setAttribute("allow", "payment");
    frame.style.cssText = "width:100%;max-width:640px;height:640px;border:0;display:block;margin:0 auto;background:transparent;";
    container.appendChild(frame);
    core.frames.push(frame);
  }

  var current = document.currentScript;
  if (current && current.getAttribute("data-wgc-mode") === "button") mountButton(current);

  function scan() {
    var nodes = document.querySelectorAll("[data-wgc-event]");
    for (var i = 0; i < nodes.length; i++) mountInline(nodes[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  else scan();
})();
