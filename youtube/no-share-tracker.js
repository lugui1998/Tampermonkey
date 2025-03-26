// ==UserScript==
// @name         Remove YouTube share tracker
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Removes YouTube share "si" parameter from the share URL
// @author       lugui
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  function removeUrlParam(url, param) {
    const urlParts = url.split("?");
    if (urlParts.length < 2) return url;

    const prefix = encodeURIComponent(param) + "=";
    const newQuery = urlParts[1]
      .split(/[&;]/g)
      .filter((p) => !p.startsWith(prefix))
      .join("&");

    return urlParts[0] + (newQuery ? "?" + newQuery : "");
  }

  function cleanSi(str) {
    if (!str || typeof str !== "string") return str;
    return str.includes("si=") ? removeUrlParam(str, "si") : str;
  }

  function cleanShareInputValue(inputEl) {
    if (inputEl && inputEl.value && inputEl.value.includes("si=")) {
      const cleaned = cleanSi(inputEl.value);
      if (cleaned !== inputEl.value) {
        inputEl.value = cleaned;
      }
    }
  }

  let patched = false;
  function patchShareUrlElement(shareEl) {
    if (!shareEl || patched) return;
    patched = true;

    cleanShareInputValue(shareEl);

    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(shareEl), "value");
    if (!desc || !desc.configurable) {
      return;
    }

    Object.defineProperty(shareEl, "value", {
      configurable: true,
      enumerable: desc.enumerable,
      get() {
        return desc.get.call(this);
      },
      set(newVal) {
        desc.set.call(this, newVal);
        if (newVal && newVal.includes("si=")) {
          const cleaned = cleanSi(newVal);
          if (cleaned !== newVal) {
            desc.set.call(this, cleaned);
          }
        }
      },
    });
  }

  const bodyObserver = new MutationObserver((mutations) => {
    for (const mut of mutations) {
      if (mut.type === "childList") {
        for (const added of mut.addedNodes) {
          if (added instanceof HTMLElement) {
            if (added.id === "share-url") {
              patchShareUrlElement(added);
            } else {
              // Check if share-url is nested inside
              const nestedShare = added.querySelector?.("#share-url");
              if (nestedShare) {
                patchShareUrlElement(nestedShare);
              }
            }
          }
        }
      }
    }
  });
  bodyObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  const initial = document.getElementById("share-url");
  if (initial) {
    patchShareUrlElement(initial);
  }

  document.addEventListener("click", (evt) => {
    const target = evt.target;
    if (target && target.closest && target.closest("#start-at")) {
      queueMicrotask(() => {
        const shareUrlEl = document.getElementById("share-url");
        cleanShareInputValue(shareUrlEl);
      });
    }
  });

  window.addEventListener("DOMContentLoaded", () => {
    const shareUrlEl = document.getElementById("share-url");
    if (shareUrlEl) {
      cleanShareInputValue(shareUrlEl);
    }
  });
})();
