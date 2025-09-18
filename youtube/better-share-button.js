// ==UserScript==
// @name         YouTube Better share button.
// @namespace    http://tampermonkey.net/
// @version      1.5
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
    const getIncludeTime = () => (localStorage.getItem(STORAGE_KEY) ?? 'true') === 'true';
    const setIncludeTime = (v) => localStorage.setItem(STORAGE_KEY, String(!!v));

    function getVideoIdFromLocation() {
        const u = new URL(location.href);
        if (u.hostname.endsWith('youtube.com')) {
            if (u.pathname === '/watch') return u.searchParams.get('v') || '';
            if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/shorts/')[1]?.split(/[/?#]/)[0] || '';
            if (u.pathname.startsWith('/live/')) return u.pathname.split('/live/')[1]?.split(/[/?#]/)[0] || '';
        }
        return '';
    }

    function buildCleanUrl(includeTime) {
        const vid = getVideoIdFromLocation();
        const base = vid ? `https://youtu.be/${vid}` : location.origin + location.pathname;
        let t = '';
        if (includeTime) {
            const video = document.querySelector('video');
            if (video && !isNaN(video.currentTime)) t = Math.floor(video.currentTime).toString();
        }
        return t ? `${base}?t=${encodeURIComponent(t)}` : base;
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch { }
            ta.remove();
            return ok;
        }
    }

    function showToast(msg) {
        const t = document.createElement('div');
        t.textContent = msg;
        Object.assign(t.style, {
            position: 'fixed',
            zIndex: 2147483647,
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 12px',
            background: 'rgba(0,0,0,0.85)',
            color: '#fff',
            borderRadius: '8px',
            fontSize: '12px',
            pointerEvents: 'none',
            transition: 'opacity 0.2s',
            opacity: '0',
        });
        document.body.appendChild(t);
        requestAnimationFrame(() => (t.style.opacity = '1'));
        setTimeout(() => {
            t.style.opacity = '0';
            setTimeout(() => t.remove(), 250);
        }, 1400);
    }

    function isShareButton(el) {
        if (!el) return false;
        const s = ((el.getAttribute('aria-label') || '') + ' ' + (el.title || '') + ' ' + (el.textContent || '')).toLowerCase();
        return /share|compartil|compartir|teilen|partager|condivid|подел|分享|공유|共有/.test(s);
    }

    function makeTimeToggle() {
        const label = document.createElement('label');
        label.setAttribute('data-yt-share-time', '1');
        Object.assign(label.style, {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            pointerEvents: 'auto',
            position: 'relative',
            zIndex: '1',
        });

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = getIncludeTime();
        cb.style.margin = '0';
        cb.style.verticalAlign = 'middle';

        const txt = document.createElement('span');
        txt.textContent = 'Share time';

        const stop = (ev) => { ev.stopImmediatePropagation(); ev.stopPropagation(); };
        for (const ev of ['pointerdown', 'pointerup', 'click', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'keydown', 'keyup']) {
            cb.addEventListener(ev, stop, true);
            label.addEventListener(ev, stop, true);
        }

        cb.addEventListener('change', () => setIncludeTime(cb.checked), true);

        label.appendChild(cb);
        label.appendChild(txt);
        return label;
    }

    function insertCheckboxInsideTextContainer(btn) {
        if (btn.dataset.ytShareCheckboxAdded === '1') return;

        const textContainer = btn.querySelector('.yt-spec-button-shape-next__button-text-content');
        const target = textContainer || btn;

        if (textContainer) {
            textContainer.textContent = '';

            textContainer.style.pointerEvents = 'auto';
            textContainer.style.position = 'relative';
            textContainer.style.zIndex = '1';
        } else {
            for (const old of btn.querySelectorAll('label[data-yt-share-time]')) old.remove();
        }

        const toggle = makeTimeToggle();
        target.appendChild(toggle);

        btn.dataset.ytShareCheckboxAdded = '1';
    }

    function attachToButton(host) {
        if (!host || host.dataset.ytShareHook === '1') return;

        const btn = host.matches('button') ? host : host.querySelector('button') || host;
        if (!btn) return;
        if (!isShareButton(btn) && !isShareButton(host)) return;

        insertCheckboxInsideTextContainer(btn);

        const swallowIfFromToggle = (e) => {
            if (e.target && e.target.closest('[data-yt-share-time]')) {
                e.stopImmediatePropagation();
                e.stopPropagation();
            }
        };
        for (const ev of ['pointerdown', 'pointerup', 'click', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'keydown', 'keyup']) {
            btn.addEventListener(ev, swallowIfFromToggle, true);
        }

        const handleShare = (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();

            const includeTime = getIncludeTime();
            const url = buildCleanUrl(includeTime);
            copyToClipboard(url).then((ok) => {
                showToast(ok ? `Copied ${includeTime ? 'URL with time' : 'URL'}` : 'Failed to copy');
            });
        };
        btn.addEventListener('click', handleShare, true);
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') handleShare(e);
        }, true);

        host.dataset.ytShareHook = '1';
    }

    function scanAndAttach(root = document) {
        const candidates = root.querySelectorAll([
            'yt-button-view-model',
            'button-view-model',
            'ytd-button-renderer',
            'ytd-menu-renderer ytd-button-renderer',
            'button.yt-spec-button-shape-next',
            'tp-yt-paper-button',
            'button',
            'a'
        ].join(','));
        for (const el of candidates) {
            if (isShareButton(el) || isShareButton(el.parentElement) || el.matches('yt-button-view-model, button-view-model')) {
                attachToButton(el);
            }
        }
    }

    const pageObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type === 'childList') {
                for (const n of m.addedNodes) {
                    if (n instanceof HTMLElement) scanAndAttach(n);
                }
            }
            if (m.type === 'attributes' && m.target instanceof HTMLElement) {
                if (m.attributeName === 'aria-label' || m.attributeName === 'title') {
                    if (isShareButton(m.target)) attachToButton(m.target);
                }
            }
        }
    });

    function start() {
        scanAndAttach(document);
        pageObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['aria-label', 'title']
        });
    }

    if (document.body) start();
    else {
        new MutationObserver((_m, obs) => {
            if (document.body) { obs.disconnect(); start(); }
        }).observe(document.documentElement, { childList: true, subtree: true });
    }
})();
