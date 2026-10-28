(function (root) {
  'use strict';

  // A short, original forest confetti effect. The module is silent and idle
  // until celebrate() is called; it never changes answers, focus or scrolling.
  // API: celebrate(anchorElement, { finale: false }) -> boolean; clear() -> void.
  var document = root.document;
  var motion = typeof root.matchMedia === 'function' ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var palette = ['#315d45', '#dc7955', '#e5b957', '#9fc9b1', '#c5dbad'];
  var active = null;
  var frameId = null;

  function clear() {
    if (frameId !== null) root.cancelAnimationFrame(frameId);
    frameId = null;
    if (active && active.canvas.parentNode) active.canvas.parentNode.removeChild(active.canvas);
    active = null;
  }

  function hidden() {
    return !document || document.hidden || document.visibilityState === 'hidden';
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function between(min, max) {
    return min + Math.random() * (max - min);
  }

  function protectAnswer(anchor, rect) {
    var answer = typeof anchor.querySelector === 'function' ? anchor.querySelector('[data-effect-protect], .answer-reveal') : null;
    if (answer) {
      var answerRect = answer.getBoundingClientRect();
      return { x: answerRect.left - 12, y: answerRect.top - 8, width: answerRect.width + 24, height: answerRect.height + 16 };
    }
    // Small artwork anchors need no empty rectangle: their center remains
    // visible as the particles fly outward. Larger generic anchors retain a
    // quiet central space for any number or text they contain.
    if (rect.width < 180 || rect.height < 80) return null;
    var width = Math.min(220, rect.width * 0.52);
    var height = Math.min(80, rect.height * 0.40);
    return { x: rect.left + (rect.width - width) / 2, y: rect.top + (rect.height - height) / 2, width: width, height: height };
  }

  function makeBurst(x, y, delay, count, width, finale) {
    var speedScale = clamp(width / 900, 0.67, 1.2);
    var particles = [];
    for (var i = 0; i < count; i += 1) {
      var angle = i / count * Math.PI * 2 + between(-0.11, 0.11);
      var speed = between(225, 465) * speedScale;
      var shape = i % 5 < 3 ? 'star' : 'leaf';
      particles.push({
        x: x, y: y, delay: delay, vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.72 - between(130, 230),
        gravity: between(230, 345), drift: between(-14, 14),
        rotation: between(0, Math.PI * 2), spin: between(-4.4, 4.4),
        phase: between(0, Math.PI * 2), size: i % 13 === 0 ? between(13, 17) : between(6, 11),
        life: finale ? between(1.85, 2.2) : between(1.75, 2.2),
        color: palette[i % palette.length], shape: shape, trail: i % 6 === 0
      });
    }
    return { x: x, y: y, delay: delay, particles: particles };
  }

  function position(particle, age) {
    // Horizontal drag lets the burst spread widely without racing off screen.
    return {
      x: particle.x + particle.vx * (1 - Math.exp(-0.52 * age)) / 0.52 + Math.sin(age * 3 + particle.phase) * particle.drift * age,
      y: particle.y + particle.vy * age + particle.gravity * age * age / 2
    };
  }

  function starPath(context, size) {
    context.beginPath();
    for (var i = 0; i < 10; i += 1) {
      var angle = -Math.PI / 2 + i * Math.PI / 5;
      var radius = i % 2 === 0 ? size : size * 0.43;
      var x = Math.cos(angle) * radius;
      var y = Math.sin(angle) * radius;
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
  }

  function drawParticle(context, particle, age) {
    if (age < 0 || age >= particle.life) return;
    var point = position(particle, age);
    var fade = clamp((particle.life - age) / 0.65, 0, 1) * clamp(age / 0.07, 0, 1);
    if (particle.trail && age > 0.06 && age < 0.95) {
      var previous = position(particle, Math.max(0, age - 0.07));
      context.save();
      context.globalAlpha = fade * 0.38 * (1 - age / 1.15);
      context.strokeStyle = particle.color;
      context.lineWidth = 3;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(previous.x, previous.y);
      context.lineTo(point.x, point.y);
      context.stroke();
      context.restore();
    }
    context.save();
    context.translate(point.x, point.y);
    context.rotate(particle.rotation + particle.spin * age);
    context.globalAlpha = fade * 0.94;
    context.fillStyle = particle.color;
    if (particle.shape === 'star') {
      context.scale(1, 0.72 + Math.abs(Math.cos(age * 3 + particle.phase)) * 0.28);
      starPath(context, particle.size);
      context.strokeStyle = '#fffefa';
      context.lineWidth = 1.6;
      context.stroke();
      context.fill();
    } else {
      context.scale(1, 0.38 + Math.abs(Math.cos(age * 4 + particle.phase)) * 0.62);
      context.beginPath();
      context.moveTo(-particle.size, 0);
      context.bezierCurveTo(-particle.size * 0.2, -particle.size, particle.size * 0.8, -particle.size * 0.7, particle.size, 0);
      context.bezierCurveTo(particle.size * 0.2, particle.size, -particle.size * 0.8, particle.size * 0.7, -particle.size, 0);
      context.fill();
      context.globalAlpha = fade * 0.36;
      context.strokeStyle = '#315d45';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(-particle.size * 0.7, 0);
      context.lineTo(particle.size * 0.7, 0);
      context.stroke();
    }
    context.restore();
  }

  function drawBurstHalo(context, burst, age) {
    if (age < 0 || age > 0.9) return;
    var fade = Math.sin(Math.min(1, age / 0.9) * Math.PI) * 0.43;
    context.save();
    context.globalAlpha = fade;
    context.lineWidth = 3 * (1 - age / 1.2);
    context.strokeStyle = '#e5b957';
    context.beginPath();
    context.arc(burst.x, burst.y, 30 + age * 210, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = '#9fc9b1';
    context.beginPath();
    context.arc(burst.x, burst.y, 22 + age * 155, 0, Math.PI * 2);
    context.stroke();
    context.lineCap = 'round';
    for (var i = 0; i < 12; i += 1) {
      var angle = i * Math.PI / 6;
      var inner = 44 + age * 170;
      var outer = inner + 12 + age * 15;
      context.strokeStyle = palette[i % palette.length];
      context.beginPath();
      context.moveTo(burst.x + Math.cos(angle) * inner, burst.y + Math.sin(angle) * inner);
      context.lineTo(burst.x + Math.cos(angle) * outer, burst.y + Math.sin(angle) * outer);
      context.stroke();
    }
    context.restore();
  }

  function celebrate(anchor, options) {
    clear();
    if (hidden() || (motion && motion.matches) || !document.body ||
        !anchor || typeof anchor.getBoundingClientRect !== 'function' || anchor.isConnected === false ||
        typeof root.requestAnimationFrame !== 'function') return false;
    var width = root.innerWidth || document.documentElement.clientWidth;
    var height = root.innerHeight || document.documentElement.clientHeight;
    if (width < 1 || height < 1) return false;
    var rect = anchor.getBoundingClientRect();
    var visible = rect.right > 0 && rect.bottom > 0 && rect.left < width && rect.top < height;
    if (!visible) return false;
    var x = clamp(rect.left + rect.width / 2, 24, Math.max(24, width - 24));
    var y = clamp(rect.top + rect.height * 0.42, 24, Math.max(24, height - 24));
    var finale = !!(options && options.finale);
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    if (!context) return false;
    var pixelRatio = clamp(root.devicePixelRatio || 1, 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.className = 'number-forest-effects';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('data-effect', finale ? 'finale' : 'answer');
    canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block;pointer-events:none;z-index:2147483000;contain:strict;';
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    var bursts = [makeBurst(x, y, 0, finale ? 48 : 72, width, finale)];
    if (finale) {
      var offset = Math.min(200, width * 0.27);
      bursts.push(makeBurst(clamp(x - offset, 30, width - 30), clamp(y + 35, 30, height - 30), 0.38, 36, width, true));
      bursts.push(makeBurst(clamp(x + offset, 30, width - 30), clamp(y + 15, 30, height - 30), 0.76, 36, width, true));
    }
    var effect = {
      canvas: canvas, context: context, width: width, height: height,
      bursts: bursts, protect: protectAnswer(anchor, rect),
      startedAt: root.performance.now(), duration: finale ? 3.02 : 2.24
    };
    active = effect;
    document.body.appendChild(canvas);
    function frame(timestamp) {
      frameId = null;
      if (active !== effect) return;
      var elapsed = Math.max(0, (timestamp - effect.startedAt) / 1000);
      if (hidden() || (motion && motion.matches) || elapsed >= effect.duration) { clear(); return; }
      context.clearRect(0, 0, width, height);
      bursts.forEach(function (burst) {
        var age = elapsed - burst.delay;
        drawBurstHalo(context, burst, age);
        burst.particles.forEach(function (particle) { drawParticle(context, particle, elapsed - particle.delay); });
      });
      if (effect.protect) {
        var area = effect.protect;
        context.clearRect(area.x, area.y, area.width, area.height);
      }
      frameId = root.requestAnimationFrame(frame);
    }
    frameId = root.requestAnimationFrame(frame);
    return true;
  }

  if (document && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', function () { if (hidden()) clear(); });
  }
  if (typeof root.addEventListener === 'function') {
    root.addEventListener('resize', clear);
    root.addEventListener('pagehide', clear);
  }
  if (motion) {
    if (typeof motion.addEventListener === 'function') motion.addEventListener('change', clear);
    else if (typeof motion.addListener === 'function') motion.addListener(clear);
  }
  root.NumberForestEffects = Object.freeze({ celebrate: celebrate, clear: clear });
})(typeof globalThis !== 'undefined' ? globalThis : this);
