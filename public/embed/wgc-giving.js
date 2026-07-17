/**
 * WGC Payments — Website Giving Embed loader.
 *
 * IMPORTANT: Finix's payment tokenization SDK (js.finix.com) explicitly
 * refuses to mount inside any iframe ("Finix.PaymentForm() - Cannot be
 * run in an iframe" — a hard restriction in Finix's own hosted script,
 * not something WGC controls; confirmed by direct testing, and consistent
 * with why the WGC dashboard's own giving-link preview renders the form
 * as a same-page component rather than an iframe). Because of that, both
 * embed modes below open the real giving page as a top-level popup
 * window for the actual payment step — a nested iframe can safely render
 * everything up to that point, but never the card/bank entry itself.
 *
 * Include via:
 *   <script src="https://.../embed/wgc-giving.js" data-wgc-slug="..." data-wgc-mode="button" ...></script>
 * or:
 *   <div data-wgc-giving data-wgc-slug="..." data-wgc-mode="inline"></div>
 *   <script async src="https://.../embed/wgc-giving.js"></script>
 *
 * No dependencies, no build step. Never handles card/bank data itself and
 * never receives WGC credentials — only a public giving-page slug (a data
 * attribute) and a closed vocabulary of postMessage events from the popup.
 */
(function () {
  "use strict";

  function resolveWgcOrigin() {
    if (document.currentScript && document.currentScript.src) {
      try {
        return new URL(document.currentScript.src).origin;
      } catch (e) {
        /* fall through */
      }
    }
    var scripts = document.querySelectorAll('script[src*="wgc-giving.js"]');
    for (var i = 0; i < scripts.length; i++) {
      try {
        return new URL(scripts[i].src).origin;
      } catch (e) {
        /* try next */
      }
    }
    return null;
  }

  var WGC_ORIGIN = resolveWgcOrigin();
  if (!WGC_ORIGIN) return;

  var BUTTON_SIZES = {
    small: { padding: "8px 16px", fontSize: "13px" },
    medium: { padding: "12px 22px", fontSize: "15px" },
    large: { padding: "16px 28px", fontSize: "17px" },
  };

  // Fixed, permitted palette only — never accept an arbitrary hex value
  // from a data attribute (that would be uncontrolled CSS injection).
  var BUTTON_COLORS = {
    gold: { bg: "#EAB308", fg: "#0B1220" },
    navy: { bg: "#0B1220", fg: "#FFFFFF" },
    black: { bg: "#111111", fg: "#FFFFFF" },
    white: { bg: "#FFFFFF", fg: "#111111", border: "#D1D5DB" },
  };

  var BUTTON_RADIUS = { rounded: "10px", square: "2px" };

  if (!window.__wgcGivingCore) {
    window.__wgcGivingCore = { origin: WGC_ORIGIN };
    injectBaseStyles();
    window.addEventListener("message", handleIncomingMessage);
  }
  var core = window.__wgcGivingCore;

  function injectBaseStyles() {
    var style = document.createElement("style");
    style.setAttribute("data-wgc-giving-styles", "");
    style.textContent =
      ".wgc-embed-root{all:initial;display:inline-block;box-sizing:border-box;}" +
      ".wgc-embed-root *{box-sizing:border-box;}" +
      ".wgc-embed-button{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;transition:opacity 0.15s ease;}" +
      ".wgc-embed-button:hover{opacity:0.9;}" +
      ".wgc-embed-button:focus-visible{outline:2px solid #EAB308;outline-offset:2px;}" +
      ".wgc-embed-button:disabled{opacity:0.6;cursor:default;}";
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------
  // postMessage from the popup window back to this page. Only ever trusts
  // messages whose origin strictly matches WGC's own origin (never
  // wildcarded) and whose payload matches the known
  // { source: "wgc-giving", type } shape. Popups postMessage to
  // window.opener, so the listener here checks event.source against the
  // popup window reference we kept when we opened it.
  // ---------------------------------------------------------------------
  var openPopups = [];

  function handleIncomingMessage(event) {
    if (event.origin !== core.origin) return;
    var data = event.data;
    if (!data || typeof data !== "object" || data.source !== "wgc-giving") return;
    for (var i = 0; i < openPopups.length; i++) {
      if (openPopups[i].win === event.source) {
        if (data.type === "WGC_PAYMENT_COMPLETED" && openPopups[i].onPaymentCompleted) {
          openPopups[i].onPaymentCompleted(data);
        }
        return;
      }
    }
  }

  function buildEmbedUrl(slug) {
    return WGC_ORIGIN + "/embed/" + encodeURIComponent(slug);
  }

  function applyButtonStyle(el, opts) {
    var size = BUTTON_SIZES[opts.size] || BUTTON_SIZES.medium;
    var color = BUTTON_COLORS[opts.color] || BUTTON_COLORS.gold;
    var radius = BUTTON_RADIUS[opts.radius] || BUTTON_RADIUS.rounded;
    el.className = "wgc-embed-button";
    el.style.padding = size.padding;
    el.style.fontSize = size.fontSize;
    el.style.backgroundColor = color.bg;
    el.style.color = color.fg;
    el.style.borderRadius = radius;
    el.style.border = color.border ? "1px solid " + color.border : "none";
  }

  function openGivingPopup(slug) {
    var url = buildEmbedUrl(slug);
    var width = 480,
      height = 720;
    var left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    var top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
    var win = window.open(url, "wgc_giving_" + slug, "width=" + width + ",height=" + height + ",left=" + left + ",top=" + top + ",resizable=yes,scrollbars=yes");
    if (!win) {
      // Popup blocked — fall back to a normal same-tab navigation rather
      // than silently doing nothing.
      window.location.href = url;
      return;
    }
    openPopups.push({
      win: win,
      onPaymentCompleted: function () {
        /* Reserved for future host-page notification hooks; the popup
           itself already shows the confirmation to the donor. */
      },
    });
    win.focus();
  }

  function createGivingButton(opts) {
    var button = document.createElement("button");
    button.type = "button";
    applyButtonStyle(button, opts);
    button.textContent = opts.text || "Give Now";
    button.setAttribute("aria-label", opts.text || "Give Now");
    button.addEventListener("click", function () {
      openGivingPopup(opts.slug);
    });
    return button;
  }

  // ---------------------------------------------------------------------
  // Button mode — processed for THIS script tag's own inclusion (each
  // <script data-wgc-mode="button"> tag on a page renders its own button,
  // even though the shared core above only initializes once).
  // ---------------------------------------------------------------------
  var thisScript = document.currentScript;
  if (thisScript && thisScript.getAttribute("data-wgc-mode") === "button") {
    var slug = thisScript.getAttribute("data-wgc-slug");
    if (slug) {
      var button = createGivingButton({
        slug: slug,
        text: thisScript.getAttribute("data-wgc-button-text"),
        size: thisScript.getAttribute("data-wgc-button-size") || "medium",
        color: thisScript.getAttribute("data-wgc-button-color") || "gold",
        radius: thisScript.getAttribute("data-wgc-button-radius") || "rounded",
      });
      var wrapper = document.createElement("span");
      wrapper.className = "wgc-embed-root";
      wrapper.appendChild(button);
      thisScript.parentNode && thisScript.parentNode.insertBefore(wrapper, thisScript.nextSibling);
    }
  }

  // ---------------------------------------------------------------------
  // Inline mode — since Finix cannot mount inside an iframe, the inline
  // embed renders a branded, always-visible "Give Now" prompt directly on
  // the host page (no iframe at all), and the actual secure payment step
  // opens in the same top-level popup window used by button mode.
  // ---------------------------------------------------------------------
  function initInline(container) {
    if (container.getAttribute("data-wgc-initialized") === "true") return;
    container.setAttribute("data-wgc-initialized", "true");

    var slug = container.getAttribute("data-wgc-slug");
    if (!slug) return;

    container.className = (container.className ? container.className + " " : "") + "wgc-embed-root";
    var button = createGivingButton({
      slug: slug,
      text: container.getAttribute("data-wgc-button-text"),
      size: container.getAttribute("data-wgc-button-size") || "large",
      color: container.getAttribute("data-wgc-button-color") || "gold",
      radius: container.getAttribute("data-wgc-button-radius") || "rounded",
    });
    container.appendChild(button);
  }

  function scanForInlineEmbeds() {
    var nodes = document.querySelectorAll('[data-wgc-giving][data-wgc-mode="inline"]:not([data-wgc-initialized="true"])');
    for (var i = 0; i < nodes.length; i++) initInline(nodes[i]);
  }

  scanForInlineEmbeds();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scanForInlineEmbeds);
  }
})();
