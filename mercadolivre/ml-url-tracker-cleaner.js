// ==UserScript==
// @name         MercadoLivre URL Tracker Cleaner
// @version      1.3.0
// @description  Removes MercadoLivre tracking URL parameters without breaking login, reviews, modals, checkout, or internal flows.
// @author       Lugui
// @icon         https://www.google.com/s2/favicons?sz=64&domain=mercadolivre.com.br
// @match        https://www.mercadolivre.com.br/*
// @match        https://mercadolivre.com.br/*
// @match        https://produto.mercadolivre.com.br/*
// @match        https://lista.mercadolivre.com.br/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  /**
   * Product-detail parameters that can affect the selected catalog offer,
   * item, or variation. These are kept on product pages while other query
   * parameters are removed.
   *
   * Remove entries from this set if you want product URLs to be even cleaner.
   */
  const ALLOWED_PRODUCT_DETAIL_PARAM_NAMES = new Set([
    "pdp_filters",
    "item_id",
    "variation",
    "variation_id"
  ]);

  const ALLOWED_PRODUCT_DETAIL_PARAM_PREFIXES = [];

  /**
   * Known tracking parameters removed on non-product URLs.
   * Product-detail URLs are cleaned more aggressively, except for the allowed
   * product-detail parameters above.
   */
  const TRACKING_PARAM_NAMES = new Set([
    "be_origin",
    "fbclid",
    "gclid",
    "mc_eid",
    "msclkid",
    "oly_anon_id",
    "oly_enc_id",
    "polycard_client",
    "sid",
    "tracking_id",
    "ua",
    "utm_id",
    "wid",
    "yclid"
  ]);

  const TRACKING_PARAM_PREFIXES = [
    "_ga",
    "_gl",
    "matt_",
    "utm_"
  ];

  /**
   * Hash params are sometimes tracking, but sometimes functional.
   * Example of functional hash on MercadoLivre:
   * #redirect=landing_international&origin=vip
   *
   * So, outside product-detail URLs, only known tracking hash params are removed.
   */
  const HASH_TRACKING_PARAM_NAMES = new Set([
    "be_origin",
    "origin",
    "polycard_client",
    "sid",
    "tracking_id",
    "wid"
  ]);

  const HASH_TRACKING_PARAM_PREFIXES = [
    "utm_"
  ];

  /**
   * Paths that must never be cleaned.
   *
   * These URLs often need query parameters for modals, reviews, checkout,
   * login state, redirect targets, API flow state, or hydration data.
   */
  const EXCLUDED_PATH_PREFIXES = [
    "/auth/",
    "/authentication/",
    "/cart/",
    "/checkout/",
    "/description",
    "/gz/",
    "/jms/",
    "/login/",
    "/noindex/",
    "/p/api/",
    "/questions",
    "/registration/",
    "/syi/"
  ];

  const CLEAN_HASH_QUERY_PARAMS = true;
  const CLEAN_ALL_HASH_QUERY_PARAMS_ON_PRODUCT_DETAIL_URLS = true;
  const REDIRECT_CURRENT_PAGE = true;
  const CLEAN_PAGE_LINKS = true;
  const CLEAN_HISTORY_NAVIGATION = true;

  const MERCADOLIVRE_HOSTS = new Set([
    "www.mercadolivre.com.br",
    "mercadolivre.com.br",
    "produto.mercadolivre.com.br",
    "lista.mercadolivre.com.br"
  ]);

  let isInternallyUpdatingHref = false;

  function isMercadoLivreUrl(url) {
    return MERCADOLIVRE_HOSTS.has(url.hostname);
  }

  function isExcludedUrl(url) {
    return EXCLUDED_PATH_PREFIXES.some((pathPrefix) => {
      return url.pathname === pathPrefix || url.pathname.startsWith(pathPrefix);
    });
  }

  function isProductDetailUrl(url) {
    if (url.hostname === "produto.mercadolivre.com.br") {
      return /^\/MLB-\d+/i.test(url.pathname);
    }

    if (
      url.hostname === "www.mercadolivre.com.br" ||
      url.hostname === "mercadolivre.com.br"
    ) {
      return /\/p\/MLB\d+/i.test(url.pathname) || /^\/MLB-\d+/i.test(url.pathname);
    }

    return false;
  }

  function shouldCleanProductDetailUrlAggressively(url) {
    return isProductDetailUrl(url) && !isExcludedUrl(url);
  }

  function normalizeParamName(paramName) {
    return String(paramName).toLowerCase();
  }

  function isAllowedProductDetailParamName(paramName) {
    const normalizedParamName = normalizeParamName(paramName);

    if (ALLOWED_PRODUCT_DETAIL_PARAM_NAMES.has(normalizedParamName)) {
      return true;
    }

    return ALLOWED_PRODUCT_DETAIL_PARAM_PREFIXES.some((prefix) => {
      return normalizedParamName.startsWith(prefix.toLowerCase());
    });
  }

  function isTrackingParamName(paramName) {
    const normalizedParamName = normalizeParamName(paramName);

    if (TRACKING_PARAM_NAMES.has(normalizedParamName)) {
      return true;
    }

    return TRACKING_PARAM_PREFIXES.some((prefix) => {
      return normalizedParamName.startsWith(prefix.toLowerCase());
    });
  }

  function isHashTrackingParamName(paramName) {
    const normalizedParamName = normalizeParamName(paramName);

    if (HASH_TRACKING_PARAM_NAMES.has(normalizedParamName)) {
      return true;
    }

    return HASH_TRACKING_PARAM_PREFIXES.some((prefix) => {
      return normalizedParamName.startsWith(prefix.toLowerCase());
    });
  }

  function deleteParamsMatching(searchParams, shouldDeleteParamName) {
    const paramsToDelete = new Set();

    for (const [paramName] of searchParams.entries()) {
      if (shouldDeleteParamName(paramName)) {
        paramsToDelete.add(paramName);
      }
    }

    for (const paramName of paramsToDelete) {
      searchParams.delete(paramName);
    }

    return paramsToDelete.size > 0;
  }

  function removeDisallowedProductDetailParams(searchParams) {
    return deleteParamsMatching(searchParams, (paramName) => {
      return !isAllowedProductDetailParamName(paramName);
    });
  }

  function removeKnownTrackingParams(searchParams) {
    return deleteParamsMatching(searchParams, isTrackingParamName);
  }

  function removeKnownHashTrackingParams(searchParams) {
    return deleteParamsMatching(searchParams, isHashTrackingParamName);
  }

  function isHashRouteLike(rawHash) {
    return (
      rawHash.startsWith("/") ||
      rawHash.startsWith("!/") ||
      rawHash.startsWith("!")
    );
  }

  function cleanHash(hash, url) {
    if (!CLEAN_HASH_QUERY_PARAMS || !hash || hash.length <= 1) {
      return {
        hash,
        changed: false
      };
    }

    const rawHash = hash.slice(1);

    /**
     * Do not touch normal section hashes like:
     * #reviews
     * #description
     * #topkeyword
     */
    if (!rawHash.includes("=")) {
      return {
        hash,
        changed: false
      };
    }

    /**
     * Do not touch hash-based app routes.
     */
    if (isHashRouteLike(rawHash)) {
      return {
        hash,
        changed: false
      };
    }

    const hashParams = new URLSearchParams(rawHash);
    const shouldCleanAllHashParams =
      CLEAN_ALL_HASH_QUERY_PARAMS_ON_PRODUCT_DETAIL_URLS &&
      shouldCleanProductDetailUrlAggressively(url);

    const changed = shouldCleanAllHashParams
      ? deleteParamsMatching(hashParams, () => true)
      : removeKnownHashTrackingParams(hashParams);

    if (!changed) {
      return {
        hash,
        changed: false
      };
    }

    const cleanedHashString = hashParams.toString();

    return {
      hash: cleanedHashString ? `#${cleanedHashString}` : "",
      changed: true
    };
  }

  function isRelativeUrl(value) {
    return (
      value.startsWith("/") ||
      value.startsWith("./") ||
      value.startsWith("../") ||
      value.startsWith("?") ||
      value.startsWith("#")
    );
  }

  function buildPreservedRelativeHref(originalHref, cleanedUrl) {
    if (originalHref.startsWith("#")) {
      return cleanedUrl.hash || "#";
    }

    if (originalHref.startsWith("?")) {
      return `${cleanedUrl.search}${cleanedUrl.hash}` || cleanedUrl.pathname;
    }

    return `${cleanedUrl.pathname}${cleanedUrl.search}${cleanedUrl.hash}`;
  }

  function cleanUrl(inputUrl, baseUrl = window.location.href, preserveRelative = false) {
    let url;

    try {
      url = new URL(inputUrl, baseUrl);
    } catch {
      return {
        href: inputUrl,
        changed: false
      };
    }

    if (!isMercadoLivreUrl(url)) {
      return {
        href: inputUrl,
        changed: false
      };
    }

    if (isExcludedUrl(url)) {
      return {
        href: inputUrl,
        changed: false
      };
    }

    let changed = false;

    if (shouldCleanProductDetailUrlAggressively(url)) {
      if (removeDisallowedProductDetailParams(url.searchParams)) {
        changed = true;
      }
    } else if (removeKnownTrackingParams(url.searchParams)) {
      changed = true;
    }

    const cleanedHash = cleanHash(url.hash, url);

    if (cleanedHash.changed) {
      url.hash = cleanedHash.hash;
      changed = true;
    }

    if (!changed) {
      return {
        href: inputUrl,
        changed: false
      };
    }

    if (preserveRelative && isRelativeUrl(inputUrl)) {
      return {
        href: buildPreservedRelativeHref(inputUrl, url),
        changed: true
      };
    }

    return {
      href: url.toString(),
      changed: true
    };
  }

  function cleanCurrentPageUrl() {
    const result = cleanUrl(window.location.href);

    if (!result.changed) {
      return;
    }

    if (REDIRECT_CURRENT_PAGE) {
      window.location.replace(result.href);
    } else {
      window.history.replaceState(null, document.title, result.href);
    }
  }

  function setAnchorHref(anchor, href) {
    isInternallyUpdatingHref = true;

    try {
      anchor.setAttribute("href", href);
    } finally {
      isInternallyUpdatingHref = false;
    }
  }

  function shouldSkipAnchorHref(originalHref) {
    const normalizedHref = originalHref.trim().toLowerCase();

    return (
      !normalizedHref ||
      normalizedHref.startsWith("javascript:") ||
      normalizedHref.startsWith("mailto:") ||
      normalizedHref.startsWith("tel:") ||
      normalizedHref.startsWith("data:") ||
      normalizedHref.startsWith("blob:")
    );
  }

  function cleanAnchor(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) {
      return;
    }

    if (anchor.hasAttribute("download")) {
      return;
    }

    const originalHref = anchor.getAttribute("href");

    if (!originalHref || shouldSkipAnchorHref(originalHref)) {
      return;
    }

    const result = cleanUrl(originalHref, window.location.href, true);

    if (result.changed && result.href !== originalHref) {
      setAnchorHref(anchor, result.href);
    }
  }

  function cleanAllAnchors(root = document) {
    if (!root.querySelectorAll) {
      return;
    }

    const anchors = root.querySelectorAll("a[href]");

    for (const anchor of anchors) {
      cleanAnchor(anchor);
    }
  }

  function observeLinks() {
    if (!document.documentElement) {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      if (isInternallyUpdatingHref) {
        return;
      }

      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) {
              continue;
            }

            if (node instanceof HTMLAnchorElement) {
              cleanAnchor(node);
            } else {
              cleanAllAnchors(node);
            }
          }
        }

        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "href" &&
          mutation.target instanceof HTMLAnchorElement
        ) {
          cleanAnchor(mutation.target);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href"]
    });
  }

  function getClosestAnchorFromEvent(event) {
    if (!(event.target instanceof Element)) {
      return null;
    }

    return event.target.closest("a[href]");
  }

  function isNormalLeftClickNavigation(event, anchor) {
    return (
      event.button === 0 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.altKey &&
      anchor.target !== "_blank"
    );
  }

  function interceptClicks() {
    document.addEventListener(
      "click",
      function (event) {
        const anchor = getClosestAnchorFromEvent(event);

        if (!anchor) {
          return;
        }

        const originalHref = anchor.getAttribute("href");

        if (!originalHref || shouldSkipAnchorHref(originalHref)) {
          return;
        }

        const result = cleanUrl(anchor.href);

        if (!result.changed) {
          return;
        }

        setAnchorHref(anchor, result.href);

        if (isNormalLeftClickNavigation(event, anchor)) {
          event.preventDefault();
          window.location.href = result.href;
        }
      },
      true
    );
  }

  function cleanLinkBeforeUserUsesIt(event) {
    const anchor = getClosestAnchorFromEvent(event);

    if (anchor) {
      cleanAnchor(anchor);
    }
  }

  function cleanLinksOnUserIntent() {
    document.addEventListener("mouseover", cleanLinkBeforeUserUsesIt, true);
    document.addEventListener("focusin", cleanLinkBeforeUserUsesIt, true);
    document.addEventListener("touchstart", cleanLinkBeforeUserUsesIt, true);
    document.addEventListener("contextmenu", cleanLinkBeforeUserUsesIt, true);
  }

  function patchHistoryMethod(methodName) {
    const originalMethod = window.history[methodName];

    window.history[methodName] = function () {
      const args = Array.from(arguments);
      const url = args[2];

      if (typeof url === "string") {
        const result = cleanUrl(url, window.location.href, true);

        if (result.changed) {
          args[2] = result.href;
        }
      }

      return originalMethod.apply(this, args);
    };
  }

  function cleanHistoryNavigation() {
    if (!CLEAN_HISTORY_NAVIGATION) {
      return;
    }

    patchHistoryMethod("pushState");
    patchHistoryMethod("replaceState");

    window.addEventListener("popstate", () => {
      cleanCurrentPageUrl();
      cleanAllAnchors();
    });
  }

  function startLinkCleaning() {
    interceptClicks();
    cleanLinksOnUserIntent();

    if (document.documentElement) {
      observeLinks();
    } else {
      document.addEventListener("DOMContentLoaded", observeLinks, { once: true });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        cleanAllAnchors();
      });
    } else {
      cleanAllAnchors();
    }
  }

  cleanCurrentPageUrl();
  cleanHistoryNavigation();

  if (CLEAN_PAGE_LINKS) {
    startLinkCleaning();
  }
})();