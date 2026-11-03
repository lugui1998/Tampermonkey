// ==UserScript==
// @name         YouTube Auto Original Audio Selector
// @namespace    http://tampermonkey.net/
// @version      3.0.1
// @description  Selects YouTube's original audio track directly, without opening menus.
// @author       Lugui
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const READY_MS = 30000;
  const VERIFY_MS = 4000;
  const POLL_MS = 250;
  const MAX_REARMS = 2;
  let task = null;
  let navigating = false;

  function videoIdFromUrl() {
    const url = new URL(location.href);
    if (url.pathname === '/watch') return url.searchParams.get('v') || null;
    return url.pathname.match(/^\/(?:shorts|live)\/([^/]+)\/?$/)?.[1] || null;
  }

  // YouTube's xtags are a base64url protobuf: repeated key/value messages.
  // Decode only this observed structure, with strict size and length bounds.
  function audioContent(encoded) {
    if (typeof encoded !== 'string' || !encoded.length || encoded.length > 2048 ||
        !/^[A-Za-z0-9_-]+={0,2}$/.test(encoded)) return { valid: false };
    try {
      const raw = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
      const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
      function fields(buffer) {
        let offset = 0;
        const result = [];
        function varint() {
          let value = 0;
          for (let shift = 0; shift < 35 && offset < buffer.length; shift += 7) {
            const byte = buffer[offset++];
            value += (byte & 127) * 2 ** shift;
            if (!(byte & 128)) return value;
          }
          throw new Error('Invalid varint');
        }
        while (offset < buffer.length) {
          const tag = varint();
          const length = varint();
          if (tag % 8 !== 2 || tag < 10 || length > buffer.length - offset || result.length >= 32) {
            throw new Error('Invalid field');
          }
          result.push([Math.floor(tag / 8), buffer.subarray(offset, offset + length)]);
          offset += length;
        }
        return result;
      }
      const text = (buffer) => String.fromCharCode(...buffer);
      let content = null;
      for (const [field, entry] of fields(bytes)) {
        if (field !== 1) return { valid: false };
        const pair = fields(entry);
        if (pair.length !== 2 || pair[0][0] !== 1 || pair[1][0] !== 2) return { valid: false };
        if (text(pair[0][1]) === 'acont') {
          if (content !== null) return { valid: false };
          content = text(pair[1][1]);
        }
      }
      return { valid: true, content };
    } catch {
      return { valid: false };
    }
  }

  function isOriginal(track) {
    if (!track || typeof track !== 'object') return false;
    // Metadata property names are obfuscated and change between player versions.
    const metadata = [track, ...Object.values(track).filter((value) =>
      value && typeof value === 'object' && !Array.isArray(value))];
    const tags = metadata.map((value) => value.xtags).filter((value) => typeof value === 'string' && value.length > 0);
    if (typeof track.id === 'string' && track.id.includes(';')) tags.push(track.id.slice(track.id.lastIndexOf(';') + 1));
    const decoded = tags.map(audioContent);
    if (decoded.some((value) => !value.valid)) return false;
    const markers = decoded.map((value) => value.content).filter((value) => value !== null);
    if (metadata.some((value) => value.isAutoDubbed === true || value.isOriginal === false)) return false;
    if (markers.length) return markers.every((value) => value === 'original');
    return metadata.some((value) => value.isOriginal === true);
  }

  function sameTrack(first, second) {
    return !!first && !!second && (first === second ||
      (typeof first.id === 'string' && first.id.length > 0 && first.id === second.id));
  }

  function clearTimer(current) {
    if (current?.timer != null) clearTimeout(current.timer);
    if (current) current.timer = null;
  }

  function finish(current) {
    clearTimer(current);
    current.phase = 'done';
  }

  function schedule(current, delay = POLL_MS) {
    clearTimer(current);
    if (current !== task || navigating || !['waiting', 'verifying'].includes(current.phase)) return;
    current.timer = setTimeout(() => step(current), delay);
  }

  function currentPlayer(id) {
    const player = document.getElementById('movie_player');
    if (!player || player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')) return null;
    if (!['getVideoData', 'getAvailableAudioTracks', 'getAudioTrack', 'setAudioTrack']
      .every((name) => typeof player[name] === 'function')) return null;
    return player.getVideoData()?.video_id === id ? player : null;
  }

  async function select(current, player, original) {
    // One setter attempt per video visit; confirmation retries never set again.
    current.attempted = true;
    current.original = original;
    current.phase = 'verifying';
    current.deadline = Date.now() + VERIFY_MS;
    schedule(current);
    try {
      await player.setAudioTrack(original);
    } catch {
      finish(current);
    }
  }

  function step(current) {
    current.timer = null;
    if (current !== task || navigating) return;
    if (videoIdFromUrl() !== current.id) {
      reconcile();
      return;
    }
    if (Date.now() >= current.deadline) {
      current.phase = current.attempted ? 'done' : 'expired';
      return;
    }
    try {
      const player = currentPlayer(current.id);
      if (player) {
        const selected = player.getAudioTrack();
        if (current.phase === 'verifying') {
          if (sameTrack(selected, current.original)) {
            finish(current);
            return;
          }
        } else {
          const tracks = player.getAvailableAudioTracks();
          // Both getters must describe a ready, consistent audio-track list.
          if (Array.isArray(tracks) && tracks.some((track) => sameTrack(track, selected))) {
            const originals = tracks.filter(isOriginal);
            if (originals.length === 1) {
              if (sameTrack(selected, originals[0])) finish(current);
              else void select(current, player, originals[0]);
              return;
            }
          }
        }
      }
    } catch {
      // Private player APIs may throw while YouTube replaces its player.
    }
    schedule(current);
  }

  function reconcile(event) {
    const id = videoIdFromUrl();
    if (task?.id !== id) {
      clearTimer(task);
      task = id ? {
        id, phase: 'waiting', attempted: false, rearms: 0,
        deadline: Date.now() + READY_MS, timer: null,
      } : null;
    }
    if (!task || navigating || task.phase === 'done') return;
    // Long prerolls can outlast readiness. Only real media events may open up
    // to two extra windows, and never after a setter attempt or during an ad.
    if (task.phase === 'expired' && !task.attempted && task.rearms < MAX_REARMS &&
        (event?.type === 'loadedmetadata' || event?.type === 'playing')) {
      try {
        const player = currentPlayer(id);
        if (player && event.target?.tagName === 'VIDEO' && player.contains(event.target) && event.target.readyState >= 1) {
          task.rearms++;
          task.phase = 'waiting';
          task.deadline = Date.now() + READY_MS;
        }
      } catch {
        // Leave the expired task idle until a later, valid media event.
      }
    }
    schedule(task, 0);
  }

  window.addEventListener('yt-navigate-start', () => {
    navigating = true;
    clearTimer(task);
  });
  window.addEventListener('yt-navigate-finish', (event) => {
    navigating = false;
    reconcile(event);
  });
  window.addEventListener('popstate', (event) => {
    navigating = false;
    reconcile(event);
  });
  window.addEventListener('yt-page-data-updated', reconcile);
  for (const event of ['loadedmetadata', 'playing', 'canplay']) {
    document.addEventListener(event, reconcile, true);
  }
  reconcile();
})();
