(function (root) {
  'use strict';

  var version = '0.6.0';
  var script = document.currentScript;
  var local = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/.test(location.hostname);
  var supported = 'serviceWorker' in navigator &&
    (location.protocol === 'https:' || (location.protocol === 'http:' && local));

  function activated(registration) {
    if (registration.active) return Promise.resolve(registration);
    var worker = registration.installing || registration.waiting;
    if (!worker) return Promise.resolve(null);
    return new Promise(function (resolve) {
      function changed() {
        if (worker.state !== 'activated' && worker.state !== 'redundant') return;
        worker.removeEventListener('statechange', changed);
        resolve(worker.state === 'activated' ? registration : null);
      }
      worker.addEventListener('statechange', changed);
      changed();
    });
  }

  var ready = supported ? new Promise(function (resolve) {
    function register() {
      var base = script && script.src ? new URL('../', script.src) : new URL('./', location.href);
      var worker = new URL('sw.js', base);
      navigator.serviceWorker.register(worker.href, { scope: base.pathname, updateViaCache: 'none' })
        .then(activated)
        .then(resolve)
        .catch(function () { resolve(null); });
    }
    if (document.readyState === 'complete') register();
    else root.addEventListener('load', register, { once: true });
  }) : Promise.resolve(null);

  root.NumberForestCache = Object.freeze({ version: version, supported: supported, ready: ready });
})(window);
