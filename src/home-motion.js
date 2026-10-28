(function (root) {
  'use strict';

  var dispose = null;

  function stop() {
    if (dispose) dispose();
    dispose = null;
  }

  function mount(image) {
    stop();
    if (!image || image.tagName !== 'IMG') return function () {};

    var source = (image.getAttribute('src') || '').split('#')[0];
    if (!source) return function () {};

    var preference = root.matchMedia('(prefers-reduced-motion: reduce)');
    var bounds = image.getBoundingClientRect();
    var onscreen = bounds.bottom > 0 && bounds.top < root.innerHeight &&
      bounds.right > 0 && bounds.left < root.innerWidth;
    var pageActive = true;
    var disposed = false;

    function update() {
      if (disposed) return;
      var moving = pageActive && !document.hidden && onscreen && !preference.matches;
      var next = source + (moving ? '' : '#still');
      if (image.getAttribute('src') !== next) image.setAttribute('src', next);
      image.dataset.motion = moving ? 'playing' : 'still';
    }

    function onPageHide() { pageActive = false; update(); }
    function onPageShow() { pageActive = true; update(); }

    var observer = 'IntersectionObserver' in root ? new IntersectionObserver(function (entries) {
      if (!entries.length) return;
      onscreen = entries[0].isIntersecting;
      update();
    }, { threshold: 0 }) : null;

    document.addEventListener('visibilitychange', update);
    root.addEventListener('pagehide', onPageHide);
    root.addEventListener('pageshow', onPageShow);
    if (preference.addEventListener) preference.addEventListener('change', update);
    else preference.addListener(update);
    if (observer) observer.observe(image);
    update();

    dispose = function () {
      if (disposed) return;
      disposed = true;
      if (observer) observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      root.removeEventListener('pagehide', onPageHide);
      root.removeEventListener('pageshow', onPageShow);
      if (preference.removeEventListener) preference.removeEventListener('change', update);
      else preference.removeListener(update);
      image.setAttribute('src', source + '#still');
      image.dataset.motion = 'still';
    };
    return dispose;
  }

  root.NumberForestHomeMotion = Object.freeze({ mount: mount, stop: stop });
})(window);
