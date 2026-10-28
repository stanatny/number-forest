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

  // Chapter finale uses its own local night-sky renderer. The ordinary answer
  // burst above intentionally keeps its original palette, particles and timing.
  function celebrateFinale(anchor, rect) {
    var width = anchor.clientWidth || rect.width;
    var height = anchor.clientHeight || rect.height;
    if (width < 1 || height < 1 || typeof anchor.appendChild !== 'function') return false;
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    if (!context) return false;
    var pixelRatio = clamp(root.devicePixelRatio || 1, 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.className = 'number-forest-effects';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('data-effect', 'finale');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:1;contain:strict;';
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    var cx = width / 2;
    var cy = height / 2;
    var coin = typeof anchor.querySelector === 'function' ? anchor.querySelector('.badge-coin') : null;
    var coinRadius = coin && coin.offsetWidth ? coin.offsetWidth / 2 : Math.min(width, height) * 0.40;
    var gold = '#ffe49b';
    var cyan = '#8df4f0';
    var stars = [];
    var collectors = [];
    for (var i = 0; i < 18; i += 1) {
      collectors.push({ angle: i * Math.PI / 9 + between(-0.08, 0.08), radius: between(0.65, 1.05), color: i % 3 ? gold : cyan });
    }
    // 72 stars leave the medal rim at the impact; two 12-star fountains sweep
    // inward from the stage sides just afterwards. The coin sits above canvas.
    for (var j = 0; j < 96; j += 1) {
      var mainBurst = j < 72;
      var side = j < 84 ? -1 : 1;
      var angle = j / 72 * Math.PI * 2 + between(-0.12, 0.12);
      var speed = between(55, 155) * clamp(width / 650, 0.65, 1.1);
      stars.push({
        x: mainBurst ? cx + Math.cos(angle) * (coinRadius + 5) : cx + side * width * 0.41,
        y: mainBurst ? cy + Math.sin(angle) * Math.min(coinRadius * 0.82, height * 0.40) : height * 0.82,
        vx: mainBurst ? Math.cos(angle) * speed : -side * between(32, 100),
        vy: mainBurst ? Math.sin(angle) * speed * 0.70 - 12 : between(-165, -90),
        gravity: mainBurst ? between(16, 34) : between(55, 95),
        delay: mainBurst ? 1.8 + between(0, 0.09) : 1.98 + between(0, 0.15),
        life: mainBurst ? between(1.95, 2.65) : between(1.8, 2.35),
        size: j % 13 === 0 ? between(7, 9) : between(2.3, 5.7),
        phase: between(0, Math.PI * 2), spin: between(-1.1, 1.1),
        color: j % 3 ? gold : cyan, glow: j % 4 === 0, fivePoint: j % 3 === 0
      });
    }
    var effect = { canvas: canvas, startedAt: root.performance.now(), duration: 4.6 };
    active = effect;
    anchor.appendChild(canvas);

    function glow(x, y, radius, color, alpha) {
      context.save();
      context.globalAlpha = alpha;
      var gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      context.restore();
    }

    function drawCharge(elapsed) {
      if (elapsed > 0.55) return;
      var progress = clamp(elapsed / 0.35, 0, 1);
      var fade = clamp(elapsed / 0.06, 0, 1) * clamp((0.55 - elapsed) / 0.20, 0, 1);
      collectors.forEach(function (particle) {
        var radius = (1 - progress) * (1 - progress) * particle.radius;
        var rx = width * 0.55 * radius + 8;
        var ry = height * 0.62 * radius + 8;
        var x = cx + Math.cos(particle.angle) * rx;
        var y = cy + Math.sin(particle.angle) * ry;
        context.save();
        context.globalAlpha = fade * 0.75;
        context.strokeStyle = particle.color;
        context.lineWidth = 2.4;
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(x + Math.cos(particle.angle) * (22 + radius * 34), y + Math.sin(particle.angle) * (16 + radius * 22));
        context.lineTo(x, y);
        context.stroke();
        context.fillStyle = particle.color;
        context.beginPath();
        context.arc(x, y, 2.2, 0, Math.PI * 2);
        context.fill();
        context.restore();
      });
      glow(cx, cy, 32 + progress * 44, 'rgba(255,216,116,0.7)', fade * 0.55);
    }

    function drawOrbits(elapsed) {
      var fade = clamp((elapsed - 0.23) / 0.55, 0, 1) * clamp((4.6 - elapsed) / 1.05, 0, 1);
      if (fade <= 0) return;
      var rx = Math.max(coinRadius + 24, width * 0.36);
      var ry = Math.min(height * 0.41, coinRadius * 0.90);
      for (var orbit = 0; orbit < 6; orbit += 1) {
        var tilt = orbit % 2 ? -0.20 : 0.20;
        var direction = orbit % 2 ? -1 : 1;
        var angle = orbit * Math.PI / 3 + elapsed * (orbit % 2 ? -0.92 : 0.78);
        var color = orbit % 2 ? cyan : gold;
        var orbitRx = rx * (orbit < 3 ? 1 : 0.88);
        var orbitRy = ry * (orbit < 3 ? 0.88 : 1.08);
        context.save();
        context.translate(cx, cy);
        context.rotate(tilt);
        context.strokeStyle = color;
        context.lineCap = 'round';
        // Segmented alpha forms a long tapered comet, not a flashing circle.
        for (var segment = 0; segment < 10; segment += 1) {
          var tail = angle - direction * (10 - segment) * 0.075;
          context.globalAlpha = fade * (segment + 1) / 10 * 0.66;
          context.lineWidth = 1 + segment * 0.23;
          context.beginPath();
          context.ellipse(0, 0, orbitRx, orbitRy, 0, tail, tail + direction * 0.081, direction < 0);
          context.stroke();
        }
        var x = Math.cos(angle) * orbitRx;
        var y = Math.sin(angle) * orbitRy;
        glow(x, y, 17, orbit % 2 ? 'rgba(113,242,244,0.8)' : 'rgba(255,211,104,0.8)', fade * 0.66);
        context.globalAlpha = fade;
        context.fillStyle = color;
        context.beginPath();
        context.arc(x, y, 2.6, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }

    function drawImpact(elapsed) {
      for (var ring = 0; ring < 3; ring += 1) {
        var age = elapsed - 1.8 - ring * 0.12;
        if (age < 0 || age > 1.25) continue;
        var fade = clamp(age / 0.08, 0, 1) * Math.pow(1 - age / 1.25, 1.6);
        var rx = coinRadius + 12 + age * width * 0.33;
        var ry = Math.min(coinRadius * 0.82, height * 0.43) + age * height * 0.22;
        context.save();
        context.globalAlpha = fade * (ring === 0 ? 0.85 : 0.48);
        context.strokeStyle = ring === 1 ? cyan : gold;
        context.lineWidth = ring === 0 ? 4.5 : 1.8;
        context.shadowColor = ring === 1 ? '#6ce5e4' : '#ffc94f';
        context.shadowBlur = 12;
        context.beginPath();
        context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        context.stroke();
        context.restore();
      }
    }

    function starPosition(particle, age) {
      return {
        x: particle.x + particle.vx * age * Math.exp(-0.12 * age) + Math.sin(age * 2 + particle.phase) * age * 4,
        y: particle.y + particle.vy * age + particle.gravity * age * age / 2
      };
    }

    function drawFinaleStar(particle, elapsed) {
      var age = elapsed - particle.delay;
      if (age < 0 || age >= particle.life) return;
      var point = starPosition(particle, age);
      if (point.x < -25 || point.x > width + 25 || point.y < -25 || point.y > height + 25) return;
      var fade = clamp(age / 0.07, 0, 1) * clamp((particle.life - age) / 0.85, 0, 1);
      var previous = starPosition(particle, Math.max(0, age - 0.065));
      context.save();
      context.globalAlpha = fade * 0.40;
      context.strokeStyle = particle.color;
      context.lineWidth = 1.6;
      context.beginPath();
      context.moveTo(previous.x, previous.y);
      context.lineTo(point.x, point.y);
      context.stroke();
      context.translate(point.x, point.y);
      context.rotate(particle.phase + particle.spin * age);
      context.globalAlpha = fade * 0.94;
      context.fillStyle = particle.color;
      if (particle.glow) { context.shadowBlur = 10; context.shadowColor = particle.color; }
      if (particle.fivePoint) starPath(context, particle.size);
      else {
        context.beginPath();
        context.moveTo(0, -particle.size * 1.4);
        context.lineTo(particle.size * 0.30, -particle.size * 0.30);
        context.lineTo(particle.size, 0);
        context.lineTo(particle.size * 0.30, particle.size * 0.30);
        context.lineTo(0, particle.size * 1.4);
        context.lineTo(-particle.size * 0.30, particle.size * 0.30);
        context.lineTo(-particle.size, 0);
        context.lineTo(-particle.size * 0.30, -particle.size * 0.30);
        context.closePath();
      }
      context.fill();
      context.restore();
    }

    function frame(timestamp) {
      frameId = null;
      if (active !== effect) return;
      var elapsed = Math.max(0, (timestamp - effect.startedAt) / 1000);
      if (hidden() || (motion && motion.matches) || anchor.isConnected === false || elapsed >= effect.duration) { clear(); return; }
      context.clearRect(0, 0, width, height);
      context.save();
      context.globalCompositeOperation = 'lighter';
      drawCharge(elapsed);
      drawOrbits(elapsed);
      drawImpact(elapsed);
      stars.forEach(function (particle) { drawFinaleStar(particle, elapsed); });
      context.restore();
      frameId = root.requestAnimationFrame(frame);
    }
    frameId = root.requestAnimationFrame(frame);
    return true;
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
    if (finale) return celebrateFinale(anchor, rect);
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    if (!context) return false;
    var pixelRatio = clamp(root.devicePixelRatio || 1, 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.className = 'number-forest-effects';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('data-effect', 'answer');
    canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block;pointer-events:none;z-index:2147483000;contain:strict;';
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    var bursts = [makeBurst(x, y, 0, 72, width, false)];
    var effect = {
      canvas: canvas, context: context, width: width, height: height,
      bursts: bursts, protect: protectAnswer(anchor, rect),
      startedAt: root.performance.now(), duration: 2.24
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
