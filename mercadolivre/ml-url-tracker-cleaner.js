// ==UserScript==
// @name         MercadoLivre URL Tracker Cleaner
// @version      1.2.1
// @description  Removes all MercadoLivre URL trackers.
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
   * Remove every query parameter and every hash query parameter,
   * except parameters that are explicitly allowed.
   *
   * MercadoLivre uses at least one useful product-detail parameter
   * starting with "pdp_". That one is preserved because it can identify
   * a specific seller/listing when multiple sellers share the same product page.
   */
  const ALLOWED_PARAM_PREFIXES = [
    "pdp_"
  ];

  /**
   * Paths that must never be cleaned.
   *
   * Login URLs may need redirect params, flow state, auth data, or other
   * functional parameters. Touching them can break sign-in.
   */
  const EXCLUDED_PATH_PREFIXES = [
    "/login/"
  ];

  const CLEAN_HASH_QUERY_PARAMS = true;
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
      return url.pathname.startsWith(pathPrefix);
    });
  }

  function isAllowedParamName(paramName) {
    return ALLOWED_PARAM_PREFIXES.some((prefix) => {
      return paramName.startsWith(prefix);
    });
  }

  function removeDisallowedParamsFromSearchParams(searchParams) {
    let changed = false;
    const paramsToDelete = [];

    for (const [paramName] of searchParams.entries()) {
      if (!isAllowedParamName(paramName)) {
        paramsToDelete.push(paramName);
      }
    }

    for (const paramName of paramsToDelete) {
      searchParams.delete(paramName);
      changed = true;
    }

    return changed;
  }

  function cleanHash(hash) {
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
     */
    if (!rawHash.includes("=")) {
      return {
        hash,
        changed: false
      };
    }

    const hashParams = new URLSearchParams(rawHash);
    const changed = removeDisallowedParamsFromSearchParams(hashParams);

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

    if (removeDisallowedParamsFromSearchParams(url.searchParams)) {
      changed = true;
    }

    const cleanedHash = cleanHash(url.hash);

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
        href: `${url.pathname}${url.search}${url.hash}`,
        changed: true
      };
    }

    return {
      href: url.toString(),
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
    anchor.setAttribute("href", href);
    isInternallyUpdatingHref = false;
  }

  function cleanAnchor(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) {
      return;
    }

    const originalHref = anchor.getAttribute("href");

    if (!originalHref) {
      return;
    }

    if (
      originalHref.startsWith("javascript:") ||
      originalHref.startsWith("mailto:") ||
      originalHref.startsWith("tel:")
    ) {
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

  function interceptClicks() {
    document.addEventListener(
      "click",
      function (event) {
        const anchor = event.target.closest?.("a[href]");

        if (!anchor) {
          return;
        }

        const result = cleanUrl(anchor.href);

        if (!result.changed) {
          return;
        }

        anchor.href = result.href;

        if (
          event.button === 0 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          !event.altKey &&
          anchor.target !== "_blank"
        ) {
          event.preventDefault();
          window.location.href = result.href;
        }
      },
      true
    );
  }

  function cleanLinkBeforeUserUsesIt(event) {
    const anchor = event.target.closest?.("a[href]");

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

    window.history[methodName] = function (state, title, url) {
      if (typeof url === "string") {
        const result = cleanUrl(url, window.location.href, true);

        if (result.changed) {
          url = result.href;
        }
      }

      return originalMethod.call(this, state, title, url);
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

  cleanCurrentPageUrl();
  cleanHistoryNavigation();

  if (CLEAN_PAGE_LINKS) {
    interceptClicks();
    cleanLinksOnUserIntent();

    if (document.documentElement) {
      observeLinks();
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        cleanAllAnchors();
      });
    } else {
      cleanAllAnchors();
    }
  }
})();