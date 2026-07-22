/**
 * WGC Payments — Website Giving Embed loader.
 *
 * Architecture:
 *
 *   Merchant website
 *     -> WGC embed script (this file, runs directly on the host page)
 *       -> WGC giving form, rendered as real DOM nodes on the host page
 *         -> Finix.PaymentForm(), mounted into a local <div> inside that
 *            same host-page DOM. Finix's own script wraps ONLY the
 *            card/bank fields in a small internal iframe for PCI scope —
 *            WGC never nests its own giving page inside an iframe here.
 *
 * Finix's restriction is narrower than earlier versions of this file
 * claimed: it refuses to let the *WGC giving page itself* be nested inside
 * another iframe (a page-in-an-iframe-in-an-iframe situation). It does not
 * prevent Finix.PaymentForm() from mounting directly into a div on any
 * host page — that is in fact its documented, supported usage, and is
 * exactly what this file does for data-wgc-mode="inline" below.
 *
 * Include via:
 *   <script src="https://www.wgcpayments.com/embed/wgc-giving.js" data-wgc-slug="..." data-wgc-mode="button" ...></script>
 * or:
 *   <div data-wgc-giving data-wgc-slug="..." data-wgc-mode="inline"></div>
 *   <script async src="https://www.wgcpayments.com/embed/wgc-giving.js"></script>
 *
 * No build step, no framework dependency. finix.js is always loaded live
 * from https://js.finix.com/v/2/finix.js — never self-hosted or bundled.
 * The host page never receives raw card/bank numbers, CVV, a payment
 * token, or any WGC/Finix credential — tokenization happens inside
 * Finix's own iframe, and the resulting token is sent directly from this
 * script to the WGC donation API, never surfaced to the host page's own
 * JS via a public event.
 *
 * Supports any number of button and/or inline embeds on one page,
 * including different giving-page slugs side by side — every inline
 * instance gets its own generated id and fully separate state (config,
 * form fields, Finix form instance, fraud session, validation, submission
 * status). document.currentScript is only used for the single <script
 * data-wgc-mode="button"> tag executing it right now; inline containers
 * are discovered independently via querySelectorAll and never share state.
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

  var FINIX_JS_URL = "https://js.finix.com/v/2/finix.js";

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
    window.__wgcGivingCore = { origin: WGC_ORIGIN, instanceCounter: 0, finixLoadPromise: null };
    injectBaseStyles();
    window.addEventListener("message", handleIncomingMessage);
  }
  var core = window.__wgcGivingCore;

  function nextInstanceId() {
    core.instanceCounter += 1;
    return "wgc-embed-" + Date.now().toString(36) + "-" + core.instanceCounter;
  }

  function injectBaseStyles() {
    var style = document.createElement("style");
    style.setAttribute("data-wgc-giving-styles", "");
    style.textContent =
      ".wgc-embed-root{all:initial;display:inline-block;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}" +
      ".wgc-embed-root *{box-sizing:border-box;font-family:inherit;}" +
      ".wgc-embed-button{font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;transition:opacity 0.15s ease;}" +
      ".wgc-embed-button:hover{opacity:0.9;}" +
      ".wgc-embed-button:focus-visible{outline:2px solid #EAB308;outline-offset:2px;}" +
      ".wgc-embed-button:disabled{opacity:0.6;cursor:default;}" +
      ".wgc-inline-root{display:block;width:100%;max-width:420px;}" +
      ".wgc-inline-card{border:1px solid #e2e8f0;border-radius:16px;padding:20px;background:#fff;}" +
      ".wgc-inline-card.wgc-compact{padding:14px;max-width:340px;}" +
      ".wgc-inline-logo{max-width:140px;max-height:72px;object-fit:contain;display:block;margin:0 auto 14px;}" +
      ".wgc-inline-title{font-size:17px;font-weight:700;text-align:center;margin:0 0 4px;}" +
      ".wgc-inline-desc{font-size:13px;text-align:center;margin:0 0 14px;color:#475569;}" +
      ".wgc-inline-field{margin-bottom:12px;}" +
      ".wgc-inline-field label{display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:#334155;}" +
      ".wgc-inline-select,.wgc-inline-input{width:100%;padding:10px 12px;font-size:14px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;}" +
      ".wgc-inline-select:focus,.wgc-inline-input:focus{outline:2px solid #EAB308;outline-offset:1px;}" +
      ".wgc-inline-amounts{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;}" +
      ".wgc-inline-amount-btn{flex:1 1 30%;padding:10px 6px;font-size:14px;font-weight:600;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer;color:#0f172a;}" +
      ".wgc-inline-amount-btn.wgc-selected{border-color:#EAB308;background:#FEF9C3;}" +
      ".wgc-inline-row2{display:flex;gap:8px;}" +
      ".wgc-inline-row2 .wgc-inline-field{flex:1;}" +
      ".wgc-inline-toggle{display:flex;gap:8px;margin-bottom:12px;}" +
      ".wgc-inline-toggle-btn{flex:1;padding:9px 8px;font-size:13px;font-weight:600;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer;color:#334155;}" +
      ".wgc-inline-toggle-btn.wgc-selected{border-color:#0f172a;background:#0f172a;color:#fff;}" +
      ".wgc-inline-checkbox-row{display:flex;align-items:center;gap:8px;font-size:13px;color:#334155;margin-bottom:12px;}" +
      ".wgc-inline-finix-mount{min-height:44px;margin-bottom:12px;}" +
      ".wgc-inline-wallet-fallback{width:100%;padding:10px;margin-bottom:10px;font-size:13px;font-weight:600;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;cursor:pointer;color:#0f172a;}" +
      ".wgc-inline-submit{width:100%;padding:13px;font-size:15px;font-weight:700;border:none;border-radius:10px;cursor:pointer;background:#EAB308;color:#0B1220;}" +
      ".wgc-inline-submit:disabled{opacity:0.6;cursor:default;}" +
      ".wgc-inline-terms{font-size:11px;color:#64748b;text-align:center;margin:10px 0 0;}" +
      ".wgc-inline-terms a{color:inherit;}" +
      ".wgc-inline-powered{font-size:11px;color:#94a3b8;text-align:center;margin:8px 0 0;}" +
      ".wgc-inline-error{background:#FEF2F2;border:1px solid #FCA5A5;color:#991B1B;font-size:13px;padding:10px 12px;border-radius:8px;margin-bottom:12px;}" +
      ".wgc-inline-validation{background:#FEF2F2;border:1px solid #FCA5A5;color:#991B1B;font-size:13px;padding:8px 10px;border-radius:8px;margin-bottom:10px;}" +
      ".wgc-inline-skeleton{padding:24px;text-align:center;font-size:13px;color:#64748b;}" +
      ".wgc-inline-success{text-align:center;padding:12px 4px;}" +
      ".wgc-inline-success h3{font-size:17px;margin:0 0 6px;}" +
      ".wgc-inline-success p{font-size:13px;color:#475569;margin:0;}";
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function generateId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function formatCents(cents) {
    return "$" + (Math.round(cents) / 100).toFixed(2).replace(/\.00$/, "");
  }

  // ---------------------------------------------------------------------
  // postMessage from a popup window back to this page (button mode / the
  // inline form's wallet fallback, both of which open the hosted giving
  // page in a real top-level popup). Only ever trusts messages whose
  // origin strictly matches WGC's own origin.
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

  function openWgcPopup(url, name) {
    var width = 480,
      height = 720;
    var left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    var top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
    var win = window.open(url, name, "width=" + width + ",height=" + height + ",left=" + left + ",top=" + top + ",resizable=yes,scrollbars=yes");
    if (!win) {
      // Popup blocked — fall back to a normal same-tab navigation rather
      // than silently doing nothing.
      window.location.href = url;
      return null;
    }
    win.focus();
    return win;
  }

  function openGivingPopup(slug) {
    var win = openWgcPopup(buildEmbedUrl(slug), "wgc_giving_" + slug);
    if (win) {
      openPopups.push({
        win: win,
        onPaymentCompleted: function () {
          /* Reserved for future host-page notification hooks; the popup
             itself already shows the confirmation to the donor. */
        },
      });
    }
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
    var buttonSlug = thisScript.getAttribute("data-wgc-slug");
    if (buttonSlug) {
      var button = createGivingButton({
        slug: buttonSlug,
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
  // Finix.js loading — shared script tag across every inline instance on
  // the page (Finix.js only needs to be present once), but every instance
  // gets its own uniquely-IDed mount element and its own
  // Finix.PaymentForm()/Finix.Auth() call, so multiple simultaneous inline
  // forms never collide.
  // ---------------------------------------------------------------------
  function loadFinixScript() {
    if (window.Finix) return Promise.resolve();
    if (core.finixLoadPromise) return core.finixLoadPromise;
    core.finixLoadPromise = new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + FINIX_JS_URL + '"]');
      if (existing) {
        existing.addEventListener("load", function () {
          resolve();
        });
        existing.addEventListener("error", function () {
          reject(new Error("Failed to load Finix.js"));
        });
        return;
      }
      var script = document.createElement("script");
      script.src = FINIX_JS_URL;
      script.async = true;
      script.onload = function () {
        resolve();
      };
      script.onerror = function () {
        reject(new Error("Failed to load Finix.js"));
      };
      document.head.appendChild(script);
    });
    return core.finixLoadPromise;
  }

  // ---------------------------------------------------------------------
  // Inline mode — renders the complete giving form directly into the host
  // page's DOM (no iframe), loads the public giving-page configuration
  // from the WGC API, and mounts Finix.PaymentForm() into a uniquely-IDed
  // div inside that same DOM for the card/bank fields. Submission reuses
  // the exact same POST /api/g/[slug]/donate endpoint the hosted giving
  // page uses, so all donor resolution, fund validation, fee calculation,
  // recurring logic, receipts, idempotency, fraud session and merchant
  // routing stay in one place, server-side, never duplicated here.
  // ---------------------------------------------------------------------
  function initInline(container) {
    if (container.getAttribute("data-wgc-initialized") === "true") return;
    container.setAttribute("data-wgc-initialized", "true");

    var slug = container.getAttribute("data-wgc-slug");
    var id = nextInstanceId();
    var state = {
      id: id,
      slug: slug,
      container: container,
      config: null,
      finixForm: null,
      fraudSessionId: null,
      selectedAmountCents: 0,
      customAmountCents: null,
      selectedFundId: null,
      isRecurring: false,
      interval: "MONTHLY",
      selectedMethod: "card",
      submitting: false,
      clientAttemptId: generateId(),
    };

    container.className = (container.className ? container.className + " " : "") + "wgc-embed-root wgc-inline-root";

    if (!slug) {
      renderError(state, "This giving form is missing a required configuration (data-wgc-slug).");
      return;
    }

    container.innerHTML = '<div class="wgc-inline-skeleton">Loading giving form…</div>';

    fetch(WGC_ORIGIN + "/api/embed/giving-pages/" + encodeURIComponent(slug), { method: "GET" })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok || !body || body.ok === false) {
            throw new Error((body && body.error) || "This giving form could not be loaded.");
          }
          return body;
        });
      })
      .then(function (config) {
        state.config = config;
        state.selectedFundId = (config.funds.options.filter(function (f) { return f.isDefault; })[0] || config.funds.options[0] || {}).id || null;
        state.selectedMethod = config.paymentMethods.indexOf("CARD") !== -1 ? "card" : "bank";
        renderForm(state);
      })
      .catch(function (err) {
        renderError(state, (err && err.message) || "This giving form could not be loaded. Please try again.");
      });
  }

  function renderError(state, message) {
    state.container.innerHTML =
      '<div class="wgc-inline-card"><div class="wgc-inline-error">' + escapeHtml(message) + "</div></div>";
  }

  function renderForm(state) {
    var cfg = state.config;
    var compact = state.container.getAttribute("data-wgc-layout") === "compact";
    var html = '<div class="wgc-inline-card' + (compact ? " wgc-compact" : "") + '">';
    html += '<div class="wgc-inline-error" data-role="load-error" hidden></div>';

    if (cfg.organization.logoUrl) {
      html += '<img class="wgc-inline-logo" src="' + escapeHtml(cfg.organization.logoUrl) + '" alt="' + escapeHtml(cfg.organization.name) + ' Logo" />';
    }
    html += '<div class="wgc-inline-title">' + escapeHtml(cfg.givingPage.title) + "</div>";
    if (cfg.givingPage.description) {
      html += '<div class="wgc-inline-desc">' + escapeHtml(cfg.givingPage.description) + "</div>";
    }

    html += '<form data-role="form">';

    if (cfg.funds.selectionEnabled && cfg.funds.options.length > 0) {
      html += '<div class="wgc-inline-field"><label>Fund / Designation</label><select class="wgc-inline-select" data-role="fund">';
      for (var i = 0; i < cfg.funds.options.length; i++) {
        var f = cfg.funds.options[i];
        html += '<option value="' + escapeHtml(f.id) + '"' + (f.id === state.selectedFundId ? " selected" : "") + ">" + escapeHtml(f.name) + "</option>";
      }
      html += "</select></div>";
    }

    html += '<div class="wgc-inline-field"><label>Amount</label><div class="wgc-inline-amounts" data-role="amounts">';
    var suggested = cfg.amount.type === "FIXED" && cfg.amount.fixedAmountCents ? [cfg.amount.fixedAmountCents] : cfg.amount.suggestedAmountsCents || [];
    for (var a = 0; a < suggested.length; a++) {
      html += '<button type="button" class="wgc-inline-amount-btn" data-amount="' + suggested[a] + '">' + formatCents(suggested[a]) + "</button>";
    }
    html += "</div>";
    if (cfg.amount.type !== "FIXED" && cfg.amount.allowCustomAmount) {
      html += '<input class="wgc-inline-input" data-role="custom-amount" type="text" inputmode="decimal" placeholder="Other amount" style="margin-top:8px;" />';
    }
    html += "</div>";

    if (cfg.recurring.enabled) {
      html += '<div class="wgc-inline-toggle" data-role="frequency-toggle">';
      html += '<button type="button" class="wgc-inline-toggle-btn wgc-selected" data-value="onetime">One-time</button>';
      html += '<button type="button" class="wgc-inline-toggle-btn" data-value="recurring">Recurring</button>';
      html += "</div>";
      if (cfg.recurring.allowedFrequencies.length > 1) {
        html += '<div class="wgc-inline-field" data-role="interval-field" hidden><label>Frequency</label><select class="wgc-inline-select" data-role="interval">';
        for (var fq = 0; fq < cfg.recurring.allowedFrequencies.length; fq++) {
          html += '<option value="' + cfg.recurring.allowedFrequencies[fq] + '">' + cfg.recurring.allowedFrequencies[fq].charAt(0) + cfg.recurring.allowedFrequencies[fq].slice(1).toLowerCase() + "</option>";
        }
        html += "</select></div>";
      }
    }

    var df = cfg.donorFields;
    html += '<div class="wgc-inline-row2">';
    html += donorFieldHtml(df.firstName, "first-name", "text", "First name");
    html += donorFieldHtml(df.lastName, "last-name", "text", "Last name");
    html += "</div>";
    html += donorFieldHtml(df.email, "email", "email", "Email");
    html += donorFieldHtml(df.phone, "phone", "tel", "Phone");

    if (cfg.feeCover.enabled) {
      html +=
        '<label class="wgc-inline-checkbox-row"><input type="checkbox" data-role="cover-fees"' +
        (cfg.feeCover.defaultOn ? " checked" : "") +
        " /> I'll cover the processing fee so " + escapeHtml(cfg.organization.name) + " keeps 100% of my gift</label>";
    }

    var hasCard = cfg.paymentMethods.indexOf("CARD") !== -1;
    var hasBank = cfg.paymentMethods.indexOf("BANK") !== -1;
    if (hasCard && hasBank) {
      html += '<div class="wgc-inline-toggle" data-role="method-toggle">';
      html += '<button type="button" class="wgc-inline-toggle-btn wgc-selected" data-value="card">Card</button>';
      html += '<button type="button" class="wgc-inline-toggle-btn" data-value="bank">Bank (ACH)</button>';
      html += "</div>";
    }

    if (cfg.wallets.applePayEnabled) {
      html += '<button type="button" class="wgc-inline-wallet-fallback" data-role="wallet-fallback" data-wallet="apple">Continue securely to use Apple Pay</button>';
    }
    if (cfg.wallets.googlePayEnabled) {
      html += '<button type="button" class="wgc-inline-wallet-fallback" data-role="wallet-fallback" data-wallet="google">Continue securely to use Google Pay</button>';
    }

    html += '<div class="wgc-inline-finix-mount" id="wgc-finix-form-' + state.id + '" data-role="finix-mount"></div>';
    html += '<div class="wgc-inline-validation" data-role="validation" hidden></div>';
    html += '<button type="submit" class="wgc-inline-submit" data-role="submit">Give Now</button>';
    html +=
      '<p class="wgc-inline-terms">By giving you agree to WGC Payments’ <a href="' +
      WGC_ORIGIN +
      '/terms" target="_blank" rel="noopener">Terms</a> and <a href="' +
      WGC_ORIGIN +
      '/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</p>';
    if (cfg.branding.showPoweredByWgc) {
      html += '<p class="wgc-inline-powered">Powered by WGC Payments</p>';
    }
    html += "</form>";
    html += '<div class="wgc-inline-success" data-role="success" hidden><h3>Thank you!</h3><p data-role="success-message"></p></div>';
    html += "</div>";

    state.container.innerHTML = html;
    wireForm(state);
    mountFinixForCurrentMethod(state);
  }

  function donorFieldHtml(visibility, role, type, label) {
    if (visibility === "HIDDEN") return "";
    var required = visibility === "REQUIRED";
    return (
      '<div class="wgc-inline-field"><label>' +
      escapeHtml(label) +
      (required ? " *" : "") +
      '</label><input class="wgc-inline-input" data-role="' +
      role +
      '" type="' +
      type +
      '"' +
      (required ? " required" : "") +
      " /></div>"
    );
  }

  function q(state, selector) {
    return state.container.querySelector(selector);
  }
  function qa(state, selector) {
    return state.container.querySelectorAll(selector);
  }

  function wireForm(state) {
    var amountButtons = qa(state, '[data-role="amounts"] .wgc-inline-amount-btn');
    for (var i = 0; i < amountButtons.length; i++) {
      amountButtons[i].addEventListener("click", function (e) {
        for (var j = 0; j < amountButtons.length; j++) amountButtons[j].classList.remove("wgc-selected");
        e.currentTarget.classList.add("wgc-selected");
        state.selectedAmountCents = parseInt(e.currentTarget.getAttribute("data-amount"), 10) || 0;
        state.customAmountCents = null;
        var customInput = q(state, '[data-role="custom-amount"]');
        if (customInput) customInput.value = "";
      });
    }
    if (state.config.amount.type === "FIXED" && amountButtons.length === 1) {
      amountButtons[0].click();
    }

    var customInput = q(state, '[data-role="custom-amount"]');
    if (customInput) {
      customInput.addEventListener("input", function () {
        for (var j = 0; j < amountButtons.length; j++) amountButtons[j].classList.remove("wgc-selected");
        var dollars = parseFloat(customInput.value.replace(/[^0-9.]/g, ""));
        state.customAmountCents = isNaN(dollars) ? null : Math.round(dollars * 100);
      });
    }

    var fundSelect = q(state, '[data-role="fund"]');
    if (fundSelect) {
      fundSelect.addEventListener("change", function () {
        state.selectedFundId = fundSelect.value;
      });
    }

    var freqToggle = q(state, '[data-role="frequency-toggle"]');
    if (freqToggle) {
      var freqButtons = freqToggle.querySelectorAll(".wgc-inline-toggle-btn");
      for (var f = 0; f < freqButtons.length; f++) {
        freqButtons[f].addEventListener("click", function (e) {
          for (var k = 0; k < freqButtons.length; k++) freqButtons[k].classList.remove("wgc-selected");
          e.currentTarget.classList.add("wgc-selected");
          state.isRecurring = e.currentTarget.getAttribute("data-value") === "recurring";
          var intervalField = q(state, '[data-role="interval-field"]');
          if (intervalField) intervalField.hidden = !state.isRecurring;
        });
      }
    }
    var intervalSelect = q(state, '[data-role="interval"]');
    if (intervalSelect) {
      state.interval = intervalSelect.value;
      intervalSelect.addEventListener("change", function () {
        state.interval = intervalSelect.value;
      });
    } else if (state.config.recurring.allowedFrequencies.length) {
      state.interval = state.config.recurring.allowedFrequencies[0];
    }

    var methodToggle = q(state, '[data-role="method-toggle"]');
    if (methodToggle) {
      var methodButtons = methodToggle.querySelectorAll(".wgc-inline-toggle-btn");
      for (var m = 0; m < methodButtons.length; m++) {
        methodButtons[m].addEventListener("click", function (e) {
          var next = e.currentTarget.getAttribute("data-value");
          if (next === state.selectedMethod) return;
          for (var n = 0; n < methodButtons.length; n++) methodButtons[n].classList.remove("wgc-selected");
          e.currentTarget.classList.add("wgc-selected");
          state.selectedMethod = next;
          mountFinixForCurrentMethod(state);
        });
      }
    }

    var walletButtons = qa(state, '[data-role="wallet-fallback"]');
    for (var w = 0; w < walletButtons.length; w++) {
      walletButtons[w].addEventListener("click", function (e) {
        e.preventDefault();
        openWgcPopup(state.config.hostedGivingUrl, "wgc_giving_" + state.slug);
      });
    }

    var form = q(state, '[data-role="form"]');
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      submitDonation(state);
    });
  }

  function mountFinixForCurrentMethod(state) {
    var mountEl = q(state, '[data-role="finix-mount"]');
    if (!mountEl) return;
    if (!state.config.finix.applicationId) {
      showValidation(state, "This giving form is not fully configured yet. Please contact the organization directly.");
      return;
    }
    mountEl.innerHTML = "";
    state.finixForm = null;

    loadFinixScript()
      .then(function () {
        if (!window.Finix) throw new Error("Finix.js failed to initialize");
        state.finixForm = window.Finix.PaymentForm(mountEl.id, state.config.finix.environment, state.config.finix.applicationId, {
          paymentMethods: [state.selectedMethod],
          showAddress: false,
        });
        if (state.config.finix.merchantId && !state.fraudSessionId) {
          try {
            window.Finix.Auth(state.config.finix.environment, state.config.finix.merchantId, function (sessionKey) {
              state.fraudSessionId = sessionKey;
            });
          } catch (e) {
            /* fraud session is best-effort at mount time; re-attempted at submit if still missing */
          }
        }
      })
      .catch(function () {
        showValidation(state, "The secure payment form failed to load. Please refresh the page and try again.");
      });
  }

  function showValidation(state, message) {
    var el = q(state, '[data-role="validation"]');
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = message;
  }

  function currentAmountCents(state) {
    return state.customAmountCents != null ? state.customAmountCents : state.selectedAmountCents;
  }

  function submitDonation(state) {
    if (state.submitting) return;
    showValidation(state, "");

    var cfg = state.config;
    var amountCents = currentAmountCents(state);
    if (!amountCents || amountCents < 100) {
      showValidation(state, "Please choose or enter a donation amount of at least $1.00.");
      return;
    }

    var df = cfg.donorFields;
    var firstName = fieldValue(state, "first-name");
    var lastName = fieldValue(state, "last-name");
    var email = fieldValue(state, "email");
    var phone = fieldValue(state, "phone");

    if ((df.firstName === "REQUIRED" && !firstName) || (df.lastName === "REQUIRED" && !lastName)) {
      showValidation(state, "Please enter your first and last name.");
      return;
    }
    if (df.email === "REQUIRED" && !email) {
      showValidation(state, "Please enter your email address.");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showValidation(state, "Please enter a valid email address.");
      return;
    }
    if (df.phone === "REQUIRED" && !phone) {
      showValidation(state, "Please enter your phone number.");
      return;
    }
    if (!state.finixForm) {
      showValidation(state, "The secure payment form is not ready yet. Please wait a moment and try again.");
      return;
    }

    setSubmitting(state, true);

    state.finixForm.submit(function (err, response) {
      if (err || !response || !response.data || !response.data.id) {
        setSubmitting(state, false);
        showValidation(state, "We could not process your card/bank details. Please check them and try again.");
        return;
      }
      finishSubmit(state, response.data.id, { amountCents: amountCents, firstName: firstName, lastName: lastName, email: email, phone: phone });
    });
  }

  function fieldValue(state, role) {
    var el = q(state, '[data-role="' + role + '"]');
    return el ? el.value.trim() : "";
  }

  function setSubmitting(state, submitting) {
    state.submitting = submitting;
    var btn = q(state, '[data-role="submit"]');
    if (btn) {
      btn.disabled = submitting;
      btn.textContent = submitting ? "Processing…" : "Give Now";
    }
  }

  function finishSubmit(state, token, donor) {
    var cfg = state.config;
    var coverFeesEl = q(state, '[data-role="cover-fees"]');

    var body = {
      token: token,
      donationAmountCents: donor.amountCents,
      coverFees: coverFeesEl ? coverFeesEl.checked : false,
      isRecurring: state.isRecurring,
      billingInterval: state.interval,
      paymentMethod: state.selectedMethod,
      fraudSessionId: state.fraudSessionId || "",
      donor: { firstName: donor.firstName, lastName: donor.lastName, email: donor.email, phone: donor.phone },
      clientAttemptId: state.clientAttemptId,
      fundId: state.selectedFundId,
    };

    fetch(WGC_ORIGIN + "/api/g/" + encodeURIComponent(state.slug) + "/donate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        setSubmitting(state, false);
        if (!result.ok || result.data.success === false) {
          showValidation(state, (result.data && (result.data.message || result.data.error)) || "We couldn't complete your donation. Please try again.");
          return;
        }
        renderSuccess(state);
      })
      .catch(function () {
        setSubmitting(state, false);
        showValidation(state, "A network error occurred while submitting your donation. Please check your connection and try again.");
      });
  }

  function renderSuccess(state) {
    var form = q(state, '[data-role="form"]');
    var success = q(state, '[data-role="success"]');
    if (form) form.hidden = true;
    if (success) {
      var msg = q(state, '[data-role="success-message"]');
      if (msg) msg.textContent = state.config.branding.thankYouMessage || "Your gift has been received. A confirmation email is on its way.";
      success.hidden = false;
    }
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
