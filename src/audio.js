(function (root) {
  'use strict';

  // Original D-major woodland walk, composed for Number Forest: 112 BPM,
  // eight short call/answer bars, with a second-pass variation (about 34 s).
  // Soft mallets, plucked chords and a small bass/percussion pulse are all
  // synthesized locally. No recordings, borrowed tunes or external services.
  // Loading the module stays silent; only the explicit music switch starts it.
  var phrases = [
    [74, null, 78, 81, 78, null, 76, null],
    [74, 78, 76, null, 74, null, 69, null],
    [71, null, 74, 78, 76, 74, 71, null],
    [74, null, 76, 78, 81, null, 78, null],
    [78, 81, 83, null, 81, 78, 76, null],
    [76, 78, 81, 78, 76, null, 73, null],
    [74, null, 78, 76, 74, 71, 69, null],
    [76, 78, 76, null, 74, null, null, null]
  ];
  var replies = {
    3: [74, 76, 78, null, 81, 78, 76, null],
    7: [78, null, 76, 73, 74, null, null, null]
  };
  var bass = [50, 50, 43, 43, 47, 45, 50, 50];
  var chords = [
    [62, 66, 69], [62, 66, 69], [59, 62, 67], [59, 62, 67],
    [59, 62, 66], [61, 64, 69], [62, 66, 69], [62, 66, 69]
  ];
  var tempo = 112;
  var stepLength = 60 / tempo / 2;
  var context = null;
  var master = null;
  var toneFilter = null;
  var shakerBuffer = null;
  var enabled = false;
  var paused = false;
  var voiceActive = false;
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
    toneFilter.frequency.value = 3000;
    toneFilter.Q.value = 0.3;
    toneFilter.connect(master);
    master.connect(context.destination);
    // A fixed short noise grain gives a soft brush sound, not a sharp hi-hat.
    shakerBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.065), context.sampleRate);
    var samples = shakerBuffer.getChannelData(0);
    var seed = 73421;
    var previous = 0;
    for (var i = 0; i < samples.length; i += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      var white = seed / 2147483648 - 1;
      samples[i] = (white - previous) * 0.5;
      previous = white;
    }
    return true;
  }

  function trackVoice(source, envelope) {
    var voice = { oscillator: source, envelope: envelope };
    voices.add(voice);
    source.onended = function () {
      voices.delete(voice);
      source.disconnect();
      envelope.disconnect();
    };
  }

  function playTone(frequency, time, duration, strength, waveform, slideTo) {
    var oscillator = context.createOscillator();
    var envelope = context.createGain();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, time);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, time + duration * 0.65);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(strength, time + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    envelope.gain.linearRampToValueAtTime(0, time + duration + 0.025);
    oscillator.connect(envelope);
    envelope.connect(toneFilter);
    trackVoice(oscillator, envelope);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.04);
  }

  function playNote(midi, time, duration, strength, waveform) {
    playTone(440 * Math.pow(2, (midi - 69) / 12), time, duration, strength, waveform);
  }

  function playMallet(midi, time, accented) {
    // A rounded fundamental and quickly fading octave make a wooden/plucked
    // attack. Short tails leave space for the next note and spoken questions.
    playNote(midi, time, accented ? 0.39 : 0.29, accented ? 0.50 : 0.39, 'sine');
    playNote(midi + 12, time, 0.12, accented ? 0.085 : 0.06, 'sine');
    playNote(midi, time, 0.19, 0.055, 'triangle');
  }

  function playBrush(time, strength) {
    var source = context.createBufferSource();
    var envelope = context.createGain();
    source.buffer = shakerBuffer;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(strength, time + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    envelope.gain.linearRampToValueAtTime(0, time + 0.06);
    source.connect(envelope);
    envelope.connect(toneFilter);
    trackVoice(source, envelope);
    source.start(time);
    source.stop(time + 0.065);
  }

  function schedule() {
    if (!enabled || paused || isHidden() || context.state !== 'running') return;
    var now = context.currentTime;
    // If the browser was busy, continue gently rather than playing missed
    // beats together. The timer only queues a short window ahead of time.
    if (nextBeatTime < now) nextBeatTime = now + 0.06;
    while (nextBeatTime < now + 0.2) {
      var position = beat % 8;
      var bar = Math.floor(beat / 8) % phrases.length;
      var secondPass = Math.floor(beat / 64) % 2 === 1;
      var phrase = secondPass && replies[bar] ? replies[bar] : phrases[bar];
      var note = phrase[position];
      var time = nextBeatTime + (position % 2 ? 0.018 : 0);
      if (note !== null) playMallet(note, time, position === 0 || position === 4);
      if (position === 0 || position === 4) {
        playNote(bass[bar] + (position === 4 && bar % 2 ? 7 : 0), time, 0.36, 0.24, 'sine');
        playTone(125, time, 0.09, 0.07, 'sine', 62);
      }
      if ((position === 2 || position === 6) && !(bar === 7 && position === 6)) {
        chords[bar].forEach(function (midi, index) {
          playNote(midi, time + index * 0.008, 0.20, 0.065, 'triangle');
        });
        playTone(780, time, 0.055, 0.025, 'sine', 420);
      }
      if (position % 2 && bar !== 7) playBrush(time, position === 3 || position === 7 ? 0.045 : 0.028);
      nextBeatTime += stepLength;
      beat += 1;
    }
  }

  function beginScheduling() {
    stopScheduling();
    nextBeatTime = context.currentTime + 0.08;
    fadeMaster(voiceActive ? 0.08 * 0.28 : 0.08, 0.18);
    schedule();
    scheduler = root.setInterval(schedule, 50);
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
    // Speech keeps its own switch. Duck only the background mix while the
    // voice module plays; an event never enables or resumes music by itself.
    root.addEventListener('numberforest:voice', function (event) {
      if (!event.detail || typeof event.detail.active !== 'boolean') return;
      voiceActive = event.detail.active;
      if (enabled && !paused && !isHidden() && context && context.state === 'running') {
        fadeMaster(voiceActive ? 0.08 * 0.28 : 0.08, voiceActive ? 0.12 : 0.28);
      }
    });
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
