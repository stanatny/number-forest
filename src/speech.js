(function (root) {
  'use strict';
  var player = null;
  var generation = 0;
  var prefetches = new Map();
  var loadingTimer = null;
  var active = false;
  function key(text) { return String(text).replace(/\s+/g, '').replace(/[！!？?]/g, '。'); }
  function source(text) { return (root.NumberForestVoiceClips || {})[key(text)] || null; }
  function status(value) {
    document.documentElement.dataset.voice = value;
    root.dispatchEvent(new CustomEvent('numberforest:speech', { detail: { status: value } }));
  }
  function duck(value) {
    if (active === value) return;
    active = value;
    root.dispatchEvent(new CustomEvent('numberforest:voice', { detail: { active: value } }));
  }
  function stop() {
    generation++;
    clearTimeout(loadingTimer);
    if (player) { player.pause(); player.removeAttribute('src'); player.load(); }
    duck(false); status('idle');
  }
  function prepare(text) {
    var url = source(text);
    // file:// reads the MP3 directly. Online, cache only sentences actually needed.
    if (!url || location.protocol === 'file:' || prefetches.has(url) || !root.fetch) return;
    var request = fetch(url).then(function (response) {
      if (!response.ok) throw new Error('Voice unavailable');
      return response.arrayBuffer();
    }).catch(function () { prefetches.delete(url); });
    prefetches.set(url, request);
    if (prefetches.size > 24) prefetches.delete(prefetches.keys().next().value);
  }
  function speak(text) {
    stop();
    var url = source(text);
    if (!url || document.hidden) { status('unavailable'); return Promise.resolve(false); }
    if (!player) { player = new Audio(); player.preload = 'auto'; }
    var token = generation;
    status('loading');
    function current() { return token === generation; }
    function fail() {
      if (!current()) return;
      stop(); status('unavailable');
    }
    player.onplaying = function () { if (current()) { clearTimeout(loadingTimer); duck(true); status('playing'); } };
    player.onended = function () { if (current()) { duck(false); status('idle'); } };
    player.onerror = fail;
    // Call play directly in the gesture, before awaiting network/decode (Safari).
    player.src = url;
    loadingTimer = setTimeout(fail, 12000);
    var attempt;
    try { attempt = player.play(); } catch (_) { fail(); return Promise.resolve(false); }
    return Promise.resolve(attempt).then(function () { return current(); }, function () { fail(); return false; });
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
  root.addEventListener('pagehide', stop);
  root.NumberForestSpeech = Object.freeze({ speak: speak, stop: stop, prepare: prepare, has: function (text) { return !!source(text); }, normalize: key });
})(window);
