// ==UserScript==
// @name         MercadoLivre URL Tracker Cleaner
// @version      1.6.0
// @description  Cleans trackers from the navigation.
// @author       Lugui
// @icon         https://www.google.com/s2/favicons?sz=64&domain=mercadolivre.com.br
// @match        https://www.mercadolivre.com.br/*
// @match        https://mercadolivre.com.br/*
// @match        https://produto.mercadolivre.com.br/*
// @match        https://lista.mercadolivre.com.br/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // Review photos load in a frame. Never run in embedded documents, even if
  // the script manager ignores @noframes or MercadoLivre changes their routes.
  if (window.self !== window.top) {
    return;
  }

  // Unknown parameters, including sid, wid, origin, and ua, may carry flow state.
  const TRACKING_PARAM_NAMES = new Set([
    "_ga",
    "_gl",
    "be_origin",
    "fbclid",
    "gclid",
    "mc_eid",
    "msclkid",
    "oly_anon_id",
    "oly_enc_id",
    "polycard_client",
    "tracking_id",
    "yclid",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content"
  ]);

  const TRACKING_PARAM_PREFIXES = ["_ga_", "matt_", "utm_"];

  const MERCADOLIVRE_HOSTS = new Set([
    "www.mercadolivre.com.br",
    "mercadolivre.com.br",
    "produto.mercadolivre.com.br",
    "lista.mercadolivre.com.br"
  ]);

  // Match complete path segments, including the route root without a final slash.
  // These flows can depend on their full URL and must also be left alone in frames.
  const EXCLUDED_PATH_SEGMENTS = new Set([
    "api",
    "auth",
    "authentication",
    "cart",
    "checkout",
    "description",
    "gz",
    "jms",
    "login",
    "noindex",
    "questions",
    "registration",
    "review",
    "reviews",
    "reviews-photos",
    "syi"
  ]);

  function isExcludedUrl(url) {
    let pathname = url.pathname;

    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      // Use the original path if it contains invalid percent encoding.
    }

    return pathname.toLowerCase().split("/").some((segment) => {
      return EXCLUDED_PATH_SEGMENTS.has(segment);
    });
  }

  function isTrackingParamName(paramName) {
    const normalizedParamName = paramName.toLowerCase();

    return TRACKING_PARAM_NAMES.has(normalizedParamName) ||
      TRACKING_PARAM_PREFIXES.some((prefix) => normalizedParamName.startsWith(prefix));
  }

  function cleanUrl(inputUrl, baseUrl) {
    let url;

    try {
      url = new URL(inputUrl, baseUrl);
    } catch {
      return { href: inputUrl, changed: false };
    }

    if (
      !["http:", "https:"].includes(url.protocol) ||
      !MERCADOLIVRE_HOSTS.has(url.hostname) ||
      isExcludedUrl(url)
    ) {
      return { href: inputUrl, changed: false };
    }

    const queryStart = inputUrl.indexOf("?");
    const hashStart = inputUrl.indexOf("#");

    // A fragment can contain a URL or modal state. Never parse or rewrite it.
    if (queryStart === -1 || (hashStart !== -1 && queryStart > hashStart)) {
      return { href: inputUrl, changed: false };
    }

    const queryEnd = hashStart === -1 ? inputUrl.length : hashStart;
    const query = inputUrl.slice(queryStart + 1, queryEnd);
    const params = query.split("&");
    const keptParams = params.filter((param) => {
      const paramName = new URLSearchParams("&" + param).keys().next().value;
      return !paramName || !isTrackingParamName(paramName);
    });

    if (keptParams.length === params.length) {
      return { href: inputUrl, changed: false };
    }

    // Keep the original URL form, value encoding, and fragment byte for byte.
    // In particular, //produto... must keep its host and relative links their base.
    const cleanedQuery = keptParams.join("&");
    const prefix = inputUrl.slice(0, queryStart);
    // A query-only reference needs '?' to clear the base URL's existing query.
    const search = cleanedQuery || !prefix.trim() ? `?${cleanedQuery}` : "";
    return {
      href: prefix + search + inputUrl.slice(queryEnd),
      changed: true
    };
  }

  function cleanCurrentPageUrl() {
    // Read the current URL here, after loading; initialization may have changed it.
    const result = cleanUrl(window.location.href, window.location.href);

    if (result.changed) {
      try {
        window.history.replaceState(window.history.state, document.title, result.href);
      } catch {
        // Cleaning is optional if the browser disallows an in-place URL update.
      }
    }
  }

  function cleanAnchor(anchor) {
    const href = anchor.getAttribute("href");
    const popup = anchor.getAttribute("aria-haspopup");

    // Some anchors are UI controls, not ordinary navigation. Preserve their
    // literal href, including fragments that the site's own handlers interpret.
    if (
      !href || href.trimStart().startsWith("#") ||
      anchor.hasAttribute("download") ||
      anchor.getAttribute("role") === "button" ||
      (popup && popup !== "false")
    ) {
      return;
    }

    const result = cleanUrl(href, anchor.baseURI);
    if (result.changed) {
      anchor.setAttribute("href", result.href);
    }
  }

  function collectAnchors(root, anchors) {
    if (root.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    if (root.matches("a[href]")) {
      anchors.add(root);
    }
    for (const anchor of root.querySelectorAll("a[href]")) {
      anchors.add(anchor);
    }
  }

  function startLinkCleaning() {
    // Leave internal flows alone even when opened as top-level documents.
    if (isExcludedUrl(new URL(window.location.href))) {
      return;
    }

    const observer = new MutationObserver((records) => {
      if (isExcludedUrl(new URL(window.location.href))) {
        return;
      }

      const anchors = new Set();
      for (const record of records) {
        if (record.type === "attributes") {
          if (record.target.matches("a[href]")) {
            anchors.add(record.target);
          }
        } else {
          for (const node of record.addedNodes) {
            collectAnchors(node, anchors);
          }
        }
      }
      for (const anchor of anchors) {
        if (anchor.isConnected) {
          cleanAnchor(anchor);
        }
      }
    });

    // Observe only link destinations and inserted content. Our own href writes
    // are seen once more, but cleanUrl makes no further write to a clean URL.
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href"]
    });
    for (const anchor of document.querySelectorAll("a[href]")) {
      cleanAnchor(anchor);
    }
  }

  function start() {
    cleanCurrentPageUrl();
    startLinkCleaning();
  }

  // Let initial page hydration finish. Updating href preserves native clicks,
  // modifier keys, opening new tabs and copying links; never wrap history or
  // cancel the site's events. This does not block tracking network requests.
  if (document.readyState === "complete") {
    start();
  } else {
    window.addEventListener("load", start, { once: true });
  }
})();
