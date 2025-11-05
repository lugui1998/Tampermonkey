// ==UserScript==
// @name         YouTube Auto Original Audio Selector
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Automatically selects the "Original" audio track on YouTube.
// @author       Lugui
// @match        https://www.youtube.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // -------- Utils
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const isVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style && style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
  };

  async function waitFor(selectorOrFn, { timeout = 8000, interval = 100 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const res = typeof selectorOrFn === 'function' ? selectorOrFn() : document.querySelector(selectorOrFn);
      if (res) return res;
      await sleep(interval);
    }
    return null;
  }

  function getVisibleSettingsMenu() {
    const menus = Array.from(document.querySelectorAll('.ytp-popup.ytp-settings-menu'));
    return menus.find(isVisible) || null;
  }

  function getPlayerRoot() {
    return document.querySelector('.html5-video-player');
  }

  function closeSettingsMenu() {
    const player = getPlayerRoot();
    if (!player) return;
    // Prefer Escape
    const esc = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true });
    player.dispatchEvent(esc);
    if (getVisibleSettingsMenu()) {
      player.click();
    }
  }

  async function openSettingsMenu() {
    const btn = await waitFor('.ytp-settings-button', { timeout: 6000 });
    if (!btn) return false;

    if (getVisibleSettingsMenu()) return true;

    btn.click();
    for (let i = 0; i < 10; i++) {
      if (getVisibleSettingsMenu()) return true;
      await sleep(100);
    }
    return false;
  }

  function getMenuItemsScoped() {
    const menu = getVisibleSettingsMenu();
    if (!menu) return [];
    return Array.from(menu.querySelectorAll('.ytp-menuitem'));
  }

  function getAudioMenuItem() {
    const menu = getVisibleSettingsMenu();
    if (!menu) return null;

    // 1) Tenta pelo seletor dedicado do YouTube
    let item = menu.querySelector('.ytp-menuitem.ytp-audio-menu-item');
    if (item) return item;

    // 2) Fallback por texto (i18n simplificado)
    const labels = [
      'Faixa de áudio', 'Audio track', 'Áudio', 'Audio', 'Faixa de audio', 'Faixa de Áudio',
    ];
    const items = getMenuItemsScoped();
    const lower = (t) => (t || '').trim().toLowerCase();
    return items.find((el) => {
      const label = el.querySelector('.ytp-menuitem-label');
      const text = lower(label?.textContent || el.textContent || '');
      return labels.some((l) => text.includes(l.toLowerCase()));
    }) || null;
  }

  function currentAudioLabel(audioItemEl) {
    const content = audioItemEl?.querySelector('.ytp-menuitem-content');
    return (content?.textContent || '').trim();
  }

  function looksLikeOriginal(text) {
    const t = (text || '').toLowerCase();
    return (
      t.includes('original') ||
      t.includes('áudio original') ||
      t.includes('audio original') ||
      t.includes('original audio')
    );
  }

  async function selectOriginalAudio() {
    const opened = await openSettingsMenu();
    if (!opened) return false;

    const audioItem = getAudioMenuItem();
    if (!audioItem) {
      closeSettingsMenu();
      return false;
    }

    const current = currentAudioLabel(audioItem);
    if (looksLikeOriginal(current)) {
      closeSettingsMenu();
      return true;
    }

    audioItem.click();

    await sleep(150);
    let tries = 0;
    while (tries < 15) {
      const options = getMenuItemsScoped();
      const candidates = options.filter((el) => {
        const hasToggle = !!el.querySelector('.ytp-menuitem-toggle-checkbox');
        return !hasToggle;
      });

      const originalOption =
        candidates.find(el => looksLikeOriginal(el.textContent)) ||
        options.find(el => looksLikeOriginal(el.textContent));

      if (originalOption) {
        originalOption.click();
        await sleep(120);
        closeSettingsMenu();
        return true;
      }

      await sleep(150);
      tries++;
    }

    closeSettingsMenu();
    return false;
  }

  async function applyWhenReady() {
    const player = await waitFor(getPlayerRoot, { timeout: 10000 });
    if (!player) return;

    const settingsBtn = await waitFor('.ytp-settings-button', { timeout: 8000 });
    if (!settingsBtn) return;

    await selectOriginalAudio();
  }

  let lastUrl = location.href;

  window.addEventListener('yt-navigate-finish', () => {
    lastUrl = location.href;
    applyWhenReady();
  });

  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      applyWhenReady();
    }
  }).observe(document, { childList: true, subtree: true });

  applyWhenReady();

  document.addEventListener('readystatechange', () => {
    if (document.readyState === 'complete') {
      applyWhenReady();
    }
  });
})();
