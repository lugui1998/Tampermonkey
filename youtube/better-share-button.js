// ==UserScript==
// @name         YouTube Better share button.
// @namespace    http://tampermonkey.net/
// @version      2.0.1
// @description  Share button copies a clean link.
// @author       lugui
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'ytShareIncludeTime';
    const HIDDEN = 'data-better-share-hidden';
    const GROUP = 'data-better-share-group';
    const labels = new Set(['Share', 'Compartilhar', 'Compartir', 'Teilen', 'Partager', 'Condividi', 'Поделиться', '分享', '공유', '共有']);
    const attached = new Map();
    let scheduled = false;

    let memoryIncludeTime = true;
    try { memoryIncludeTime = (localStorage.getItem(STORAGE_KEY) ?? 'true') === 'true'; } catch { /* use memory */ }
    const includeTime = () => memoryIncludeTime;
    function setIncludeTime(value) {
        memoryIncludeTime = value;
        try { localStorage.setItem(STORAGE_KEY, String(value)); } catch { /* use memory */ }
        updateToggles();
    }
    function updateToggles() {
        for (const group of attached.values()) {
            group.querySelector('.better-share-time')?.setAttribute('aria-pressed', String(includeTime()));
        }
    }
    window.addEventListener('storage', (event) => {
        if (event.key !== STORAGE_KEY && event.key !== null) return;
        memoryIncludeTime = event.newValue === null || event.newValue === 'true';
        updateToggles();
    });
    function videoId() {
        const url = new URL(location.href);
        if (url.pathname === '/watch') return url.searchParams.get('v') || '';
        const live = url.pathname.match(/^\/live\/([^/]+)\/?$/);
        return live ? live[1] : '';
    }

    function cleanUrl(id) {
        const url = new URL(`https://youtu.be/${encodeURIComponent(id)}`);
        const player = document.querySelector('#movie_player');
        if (includeTime() && player && !player.classList.contains('ad-showing')) {
            // During SPA navigation the old player can remain briefly. Only use time
            // when the player confirms it belongs to the URL's current video.
            let playerId = '';
            try { playerId = player.getVideoData?.()?.video_id || ''; } catch { /* not ready */ }
            const video = player.querySelector('video');
            if (playerId === id && video && Number.isFinite(video.currentTime) && video.currentTime >= 0) {
                url.searchParams.set('t', String(Math.floor(video.currentTime)));
            }
        }
        return url.href;
    }

    async function copy(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            const previousFocus = document.activeElement;
            const textarea = document.createElement('textarea');
            textarea.value = text;
            Object.assign(textarea.style, { position: 'fixed', left: '-9999px' });
            document.body.appendChild(textarea);
            textarea.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch { /* report failure */ }
            textarea.remove();
            if (previousFocus?.isConnected) previousFocus.focus();
            return ok;
        }
    }

    function toast(message) {
        const element = document.createElement('div');
        element.setAttribute('role', 'status');
        element.textContent = message;
        Object.assign(element.style, {
            position: 'fixed', zIndex: '2147483647', bottom: '20px', left: '50%',
            transform: 'translateX(-50%)', padding: '8px 12px', background: 'rgba(0,0,0,.85)',
            color: '#fff', borderRadius: '8px', fontSize: '12px', pointerEvents: 'none'
        });
        document.body.appendChild(element);
        setTimeout(() => element.remove(), 1800);
    }

    function makeGroup(label) {
        const group = document.createElement('span');
        group.setAttribute(GROUP, '');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', 'Share video');
        group.lang = 'en';
        group.dataset.betterShareOriginalLabel = label;
        const share = document.createElement('button');
        share.type = 'button';
        share.className = 'better-share-copy';
        share.setAttribute('aria-label', 'Share');
        const arrow = document.createElement('span');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M15 5v4C8 10 5 14 4 19c2.5-3.5 6-5 11-5v4l7-6.5z"/></svg>';
        share.append(arrow, document.createTextNode('Share'));
        share.addEventListener('click', async () => {
            const id = videoId();
            if (!id) { toast('Failed to copy'); return; }
            const url = cleanUrl(id);
            toast(await copy(url) ? 'Copied URL' : 'Failed to copy');
        });

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'better-share-time';
        toggle.title = 'Toggle timestamp on share url';
        toggle.setAttribute('aria-label', toggle.title);
        toggle.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm-1 2v6.5l5 3 .9-1.5-4.1-2.4V6z"/></svg>';
        const update = () => toggle.setAttribute('aria-pressed', String(includeTime()));
        update();
        toggle.addEventListener('click', () => {
            setIncludeTime(!includeTime());
            update();
        });
        group.append(share, toggle);
        return group;
    }

    const style = document.createElement('style');
    style.textContent = `
        [${HIDDEN}] { display: none !important; }
        [${GROUP}] { display: inline-flex; flex: 0 0 auto; align-items: center; min-height: 36px; border-radius: 18px; overflow: hidden; background: var(--yt-spec-badge-chip-background, rgba(128,128,128,.2)); color: var(--yt-spec-text-primary, inherit); vertical-align: middle; margin-inline: 8px; }
        [${GROUP}] button { border: 0; color: inherit; background: transparent; cursor: pointer; height: 36px; font: 500 14px Roboto, Arial, sans-serif; display: inline-flex; align-items: center; justify-content: center; }
        [${GROUP}] button:hover { background: rgba(128,128,128,.2); }
        [${GROUP}] button:focus-visible { outline: 2px solid currentColor; outline-offset: -3px; }
        [${GROUP}] .better-share-copy { gap: 6px; padding: 0 12px; }
        [${GROUP}] .better-share-copy span { display: inline-flex; }
        [${GROUP}] .better-share-time { padding: 0 11px; border-left: 1px solid rgba(128,128,128,.45); }
        [${GROUP}] .better-share-time[aria-pressed="true"] { background: rgba(128,128,128,.28); box-shadow: inset 0 -3px currentColor; }
    `;
    document.head.appendChild(style);

    function reconcile() {
        scheduled = false;
        const id = videoId();
        for (const [host, group] of attached) {
            const button = host.querySelector('button');
            const label = button?.getAttribute('aria-label');
            if (!id || !host.isConnected || !group.isConnected || group.parentElement !== host.parentElement || !host.parentElement?.getClientRects().length || !labels.has(label) || group.dataset.betterShareOriginalLabel !== label) {
                host.removeAttribute(HIDDEN);
                group.remove();
                attached.delete(host);
            }
        }
        if (!id) return;
        const bars = document.querySelectorAll('ytd-watch-metadata #top-level-buttons-computed, ytd-video-primary-info-renderer #top-level-buttons-computed');
        for (const bar of bars) {
            if (!bar.getClientRects().length) continue;
            for (const host of bar.children) {
                if (host.hasAttribute(GROUP) || attached.has(host)) continue;
                const button = host.querySelector('button');
                const label = button?.getAttribute('aria-label');
                if (!labels.has(label) || !button.getClientRects().length) continue;
                const group = makeGroup(label);
                host.setAttribute(HIDDEN, '');
                host.after(group);
                attached.set(host, group);
            }
        }
    }
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(reconcile);
    }
    new MutationObserver(schedule).observe(document.documentElement, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label']
    });
    window.addEventListener('yt-navigate-finish', schedule);
    window.addEventListener('popstate', schedule);
    window.addEventListener('resize', schedule);
    schedule();
})();
