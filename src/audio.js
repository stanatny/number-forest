(function (root) {
  'use strict';

  // Original, procedurally synthesized D-major pentatonic miniature for this
  // game. All sound comes from Web Audio oscillators: no recordings, borrowed
  // tunes, downloads or external services. Loading this file stays silent.
  var melody = [
    62, null, 66, 69, null, 66, 64, null,
    62, 64, null, 66, 69, null, 66, null,
    71, null, 69, 66, null, 64, 62, null,
    64, null, 66, 64, 62, null, null, null
  ];
  var bass = [50, 57, 59, 50];
  var beatLength = 0.84;
  var context = null;
  var master = null;
  var toneFilter = null;
  var enabled = false;
  var paused = false;
  var revision = 0;
  var scheduler = null;
  var suspendTimer = null;
  var nextBeatTime = 0;
  var beat = 0;
  var voices = new Set();

  function updateEnabled(value) {
    if (enabled === value) return;
    enabled = value;
    // Public notification for UI switches, including automatic resume errors:
    // window.addEventListener('numberforest:music', event => event.detail.enabled)
    if (typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') {
      root.dispatchEvent(new root.CustomEvent('numberforest:music', { detail: { enabled: enabled } }));
    }
  }

  function isHidden() {
    return !!(root.document && root.document.visibilityState === 'hidden');
  }

  function cancelSuspend() {
    if (suspendTimer !== null) root.clearTimeout(suspendTimer);
    suspendTimer = null;
  }

  function fadeMaster(value, duration) {
    if (!context || !master) return;
    var now = context.currentTime;
    var gain = master.gain;
    if (typeof gain.cancelAndHoldAtTime === 'function') {
      gain.cancelAndHoldAtTime(now);
    } else {
      var currentValue = gain.value;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(currentValue, now);
    }
    gain.linearRampToValueAtTime(value, now + duration);
  }

  function releaseVoices(delay) {
    if (!context) return;
    voices.forEach(function (voice) {
      // The quiet master fade masks the end of an already playing note.
      try { voice.oscillator.stop(context.currentTime + delay); } catch (_) { /* Already stopped. */ }
    });
    voices.clear();
  }

  function stopScheduling() {
    if (scheduler !== null) root.clearInterval(scheduler);
    scheduler = null;
  }

  function suspendSafely() {
    if (context && context.state === 'running') {
      context.suspend().catch(function () { /* A closed page needs no recovery. */ });
    }
  }

  function quiet(immediate) {
    stopScheduling();
    cancelSuspend();
    if (!context) return;
    fadeMaster(0, immediate ? 0 : 0.07);
    releaseVoices(immediate ? 0 : 0.08);
    if (immediate) {
      suspendSafely();
    } else {
      suspendTimer = root.setTimeout(function () {
        suspendTimer = null;
        if (!enabled || paused || isHidden()) suspendSafely();
      }, 100);
    }
  }

  function initialize() {
    if (context && context.state !== 'closed') return true;
    var AudioContextClass = root.AudioContext || root.webkitAudioContext;
    if (!AudioContextClass) return false;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = 0;
    toneFilter = context.createBiquadFilter();
    toneFilter.type = 'lowpass';
    toneFilter.frequency.value = 1800;
    toneFilter.Q.value = 0.3;
    toneFilter.connect(master);
    master.connect(context.destination);
    return true;
  }

  function playNote(midi, time, duration, strength, waveform) {
    var oscillator = context.createOscillator();
    var envelope = context.createGain();
    oscillator.type = waveform;
    oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(strength, time + 0.035);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
    envelope.gain.linearRampToValueAtTime(0, time + duration + 0.04);
    oscillator.connect(envelope);
    envelope.connect(toneFilter);
    var voice = { oscillator: oscillator, envelope: envelope };
    voices.add(voice);
    oscillator.onended = function () {
      voices.delete(voice);
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start(time);
    oscillator.stop(time + duration + 0.06);
  }

  function schedule() {
    if (!enabled || paused || isHidden() || context.state !== 'running') return;
    var now = context.currentTime;
    // If the browser was busy, continue gently rather than playing missed
    // beats together. The timer only queues a short window ahead of time.
    if (nextBeatTime < now) nextBeatTime = now + 0.06;
    while (nextBeatTime < now + 0.2) {
      var position = beat % melody.length;
      var note = melody[position];
      if (note !== null) playNote(note, nextBeatTime, 1.35, 0.46, 'triangle');
      if (position % 8 === 0) {
        var low = bass[Math.floor(position / 8)];
        playNote(low, nextBeatTime, 3.8, 0.20, 'sine');
        playNote(low + 7, nextBeatTime + 0.045, 3.4, 0.10, 'sine');
      }
      nextBeatTime += beatLength;
      beat += 1;
    }
  }

  function beginScheduling() {
    stopScheduling();
    nextBeatTime = context.currentTime + 0.08;
    fadeMaster(0.04, 0.25);
    schedule();
    scheduler = root.setInterval(schedule, 100);
  }

  async function startWhenVisible(ticket) {
    if (!enabled || paused || isHidden()) return enabled;
    // resume() is invoked synchronously from the user's enable action before
    // the first await, satisfying browsers that require user activation.
    try {
      // Even if state still reads "running", a visibility suspension may be
      // queued. Queueing resume afterwards handles rapid hide/show changes.
      await context.resume();
      if (ticket !== revision || !enabled || paused || isHidden()) return enabled;
      if (context.state !== 'running') {
        updateEnabled(false);
        quiet(true);
        return false;
      }
      beginScheduling();
      return true;
    } catch (_) {
      if (ticket === revision) {
        updateEnabled(false);
        quiet(true);
      }
      return enabled;
    }
  }

  async function setEnabled(value) {
    var ticket = ++revision;
    updateEnabled(value === true);
    if (!enabled) {
      quiet(false);
      return false;
    }
    cancelSuspend();
    try {
      if (!initialize()) {
        updateEnabled(false);
        return false;
      }
    } catch (_) {
      updateEnabled(false);
      return false;
    }
    paused = isHidden();
    return startWhenVisible(ticket);
  }

  function pauseForHidden() {
    paused = true;
    revision += 1;
    quiet(true);
  }

  async function resumeOnVisible() {
    if (isHidden()) return enabled;
    paused = false;
    if (!enabled || !context) return false;
    cancelSuspend();
    return startWhenVisible(++revision);
  }

  if (root.document && typeof root.document.addEventListener === 'function') {
    root.document.addEventListener('visibilitychange', function () {
      if (isHidden()) pauseForHidden();
      else resumeOnVisible();
    });
  }
  if (typeof root.addEventListener === 'function') {
    root.addEventListener('pagehide', pauseForHidden);
    root.addEventListener('pageshow', function () {
      if (enabled && !isHidden()) resumeOnVisible();
    });
  }

  root.NumberForestAudio = Object.freeze({
    setEnabled: setEnabled,
    // This reflects the user's switch. It stays true while a hidden page is
    // silently paused, so returning to the game can resume the same choice.
    isEnabled: function () { return enabled; },
    pauseForHidden: pauseForHidden,
    resumeOnVisible: resumeOnVisible
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
