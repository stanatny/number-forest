(function (root) {
  'use strict';
  const views = new Map();
  // A chapter with a new interaction can register its view before app.js runs.
  // Existing kinds (bonds/add/subtract/groups/sharing/clock) can be reused directly.
  root.NumberForestViews = Object.freeze({
    register(kind, view) {
      if (!kind || typeof view?.render !== 'function') throw new TypeError('A view needs a kind and render(context).');
      if (views.has(kind)) throw new Error('View already registered: ' + kind);
      views.set(kind, view);
    },
    get(kind) { return views.get(kind); }
  });
})(globalThis);
