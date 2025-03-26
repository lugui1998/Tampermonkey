// ==UserScript==
// @name         Youtube redirect shorts
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Stop wasting time watching more shorts than you should!
// @author       lugui
// @match        https://www.youtube.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  let oldHref = document.location.href;

  function redirectShort() {
    if (!document.location.pathname.startsWith("/shorts/")) {
      return;
    }

    const video = document.location.pathname.replace("/shorts/", "");
    document.location = "https://www.youtube.com/watch?v=" + video;
  }

  redirectShort();

  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (oldHref != document.location.href) {
        oldHref = document.location.href;
        redirectShort();
      }
    });
  });

  observer.observe(document.querySelector("body"), {
    childList: true,
    subtree: true,
  });
})();
