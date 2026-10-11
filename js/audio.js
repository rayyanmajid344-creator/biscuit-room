/*
 * Biscuit Room audio engine.
 * - LofiTrack: composes a lo-fi loop live with the Web Audio API.
 * - FileTrack: plays an audio file from the playlist.
 * - Rain: generated rain ambience.
 * - chime(): soft bell for the focus timer.
 * Browsers only allow sound after a click, so the AudioContext is created
 * the first time the visitor presses a button.
 */
(function () {
  "use strict";

  var ctx = null;
  var master, musicOut, musicBus, rainBus, crackleBus;

  function getCtx() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = 0.9;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);

    // musicOut is the music volume. Most instruments go through a gentle
    // low-pass filter first for the warm "tape" sound; hi-hats and crackle skip it.
    musicOut = ctx.createGain();
    musicOut.gain.value = musicVolume;
    musicOut.connect(master);
    var tape = ctx.createBiquadFilter();
    tape.type = "lowpass";
    tape.frequency.value = 3200;
    tape.Q.value = 0.3;
    musicBus = ctx.createGain();
    musicBus.gain.value = 1;
    musicBus.connect(tape).connect(musicOut);

    crackleBus = ctx.createGain();
    crackleBus.gain.value = 0;
    crackleBus.connect(musicOut);

    rainBus = ctx.createGain();
    rainBus.gain.value = 0;
    rainBus.connect(master);
    return ctx;
  }

  // ---------- helpers ----------
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function seeded(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  var noiseCache = {};
  function noiseBuffer(kind) {
    if (noiseCache[kind]) return noiseCache[kind];
    var len = ctx.sampleRate * 2;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      if (kind === "brown") {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else {
        d[i] = w;
      }
    }
    noiseCache[kind] = buf;
    return buf;
  }

  function envGain(t, peak, attack, decay) {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  // ---------- instruments ----------
  function keys(t, midi, vel, dur, dest) {
    var f = mtof(midi);
    var g = envGain(t, 0.06 * vel, 0.012, dur);
    var o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = f;
    var o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = f * 2;
    o2.detune.value = 6;
    var g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o1.connect(g);
    o2.connect(g2).connect(g);
    g.connect(dest);
    o1.start(t); o2.start(t);
    o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }

  // Soft held chord underneath everything, so the music never goes quiet.
  function pad(t, midis, dur, dest) {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.016, t + 0.4);
    g.gain.setValueAtTime(0.016, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.2);
    var lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    g.connect(lp).connect(dest);
    midis.forEach(function (m, i) {
      var o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = mtof(m);
      o.detune.value = i % 2 ? 7 : -7;
      o.connect(g);
      o.start(t); o.stop(t + dur + 0.3);
    });
  }

  function bass(t, midi, dur, dest) {
    var g = envGain(t, 0.22, 0.02, dur);
    var o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = mtof(midi);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.1);
  }

  function lead(t, midi, dur, dest) {
    var g = envGain(t, 0.035, 0.04, dur);
    var o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = mtof(midi);
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 5;
    var lg = ctx.createGain();
    lg.gain.value = 3;
    lfo.connect(lg).connect(o.detune);
    o.connect(g).connect(dest);
    o.start(t); lfo.start(t);
    o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
  }

  function kick(t, dest) {
    var o = ctx.createOscillator();
    var g = envGain(t, 0.55, 0.004, 0.32);
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + 0.4);
  }

  function snare(t, dest) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer("white");
    var bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1700;
    bp.Q.value = 0.8;
    var g = envGain(t, 0.16, 0.003, 0.18);
    src.connect(bp).connect(g).connect(dest);
    src.start(t, Math.random()); src.stop(t + 0.25);
  }

  function hat(t, vel, dest) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer("white");
    var hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    var g = envGain(t, 0.035 * vel, 0.002, 0.05);
    src.connect(hp).connect(g).connect(dest);
    src.start(t, Math.random()); src.stop(t + 0.08);
  }

  function crackle(t) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer("white");
    var hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2500;
    var g = envGain(t, 0.05 + Math.random() * 0.05, 0.001, 0.012);
    src.connect(hp).connect(g).connect(crackleBus);
    src.start(t, Math.random()); src.stop(t + 0.03);
  }

  // ---------- generated lo-fi track ----------
  var BARS = 32;

  function LofiTrack(def) {
    this.def = def;
    this.stepDur = 60 / def.bpm / 4;   // one 16th note
    this.totalSteps = BARS * 16;
    this.duration = this.totalSteps * this.stepDur;
    this.step = 0;
    this.playing = false;
    this.timer = null;
    this.onended = null;
    this.rng = seeded(def.seed || 1);
    this.melody = this.writeMelody();
  }

  LofiTrack.prototype.writeMelody = function () {
    // A repeating 4-bar phrase using the chord tones, so it always fits.
    var r = this.rng, notes = [];
    for (var bar = 0; bar < 4; bar++) {
      var chord = this.def.progression[bar % this.def.progression.length];
      for (var s = 0; s < 16; s += 2) {
        if (r() < 0.32) {
          var pick = chord[Math.floor(r() * chord.length)];
          notes.push({ step: bar * 16 + s, midi: this.def.root + 12 + pick, len: r() < 0.5 ? 2 : 4 });
        }
      }
    }
    return notes;
  };

  LofiTrack.prototype.schedule = function (step, t) {
    var dest = musicBus;
    var bar = Math.floor(step / 16);
    var inBar = step % 16;
    var chord = this.def.progression[bar % this.def.progression.length];
    var root = this.def.root;
    var beat = 60 / this.def.bpm;
    var swing = (inBar % 2 === 1) ? this.stepDur * 0.28 : 0;
    var tt = t + swing;
    var section = Math.floor(bar / 8); // 0 intro, 1-2 full, 3 outro

    // Keys: soft strum on beat 1, a lighter hit on the "and" of 3.
    if (inBar === 0) {
      chord.forEach(function (n, i) { keys(tt + i * 0.018, root + n, 1, beat * 3.2, dest); });
      pad(t, chord.slice(0, 4).map(function (n) { return root + n; }), beat * 4, dest);
    } else if (inBar === 10) {
      chord.slice(1).forEach(function (n, i) { keys(tt + i * 0.014, root + n, 0.6, beat * 1.4, dest); });
    }

    // Drums come in after the intro and drop out for the last 2 bars.
    var drums = bar >= 2 && bar < BARS - 2;
    if (drums) {
      if (inBar === 0 || inBar === 10) kick(tt, dest);
      if (inBar === 7 && bar % 4 === 3) kick(tt, dest);
      if (inBar === 4 || inBar === 12) snare(tt, dest);
      if (inBar % 2 === 0) hat(tt, inBar % 4 === 0 ? 1 : 0.6, musicOut);
    }

    // Bass on 1 and 3 once the drums are in.
    if (drums && (inBar === 0 || inBar === 8)) bass(tt, root - 12 + chord[0], beat * 1.6, dest);

    // Melody in the middle sections.
    if (section === 1 || section === 2) {
      var phraseStep = step % 64;
      for (var i = 0; i < this.melody.length; i++) {
        var m = this.melody[i];
        if (m.step === phraseStep) lead(tt, m.midi, m.len * this.stepDur * 1.6, dest);
      }
    }

    // Vinyl crackle.
    if (Math.random() < 0.35) crackle(t + Math.random() * this.stepDur);
  };

  LofiTrack.prototype.play = function () {
    var c = getCtx();
    if (!c || this.playing) return;
    this.playing = true;
    crackleBus.gain.setTargetAtTime(0.5, c.currentTime, 0.2);
    var self = this;
    var next = c.currentTime + 0.06;
    var tick = function () {
      while (next < c.currentTime + 0.15) {
        if (self.step >= self.totalSteps) {
          self.pause();
          self.step = 0;
          if (self.onended) self.onended();
          return;
        }
        self.schedule(self.step, next);
        next += self.stepDur;
        self.step++;
      }
    };
    tick();
    this.timer = setInterval(tick, 25);
  };

  LofiTrack.prototype.pause = function () {
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
    if (ctx) crackleBus.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
  };

  LofiTrack.prototype.stop = function () { this.pause(); this.step = 0; };
  LofiTrack.prototype.currentTime = function () { return this.step * this.stepDur; };

  // ---------- audio file track ----------
  function FileTrack(def) {
    this.def = def;
    this.el = new Audio(def.src);
    this.el.preload = "metadata";
    this.duration = 0;
    this.playing = false;
    this.onended = null;
    var self = this;
    this.el.addEventListener("loadedmetadata", function () { self.duration = self.el.duration || 0; });
    this.el.addEventListener("ended", function () { self.playing = false; if (self.onended) self.onended(); });
  }
  FileTrack.prototype.play = function () { this.playing = true; this.el.volume = musicVolume; this.el.play().catch(function () {}); };
  FileTrack.prototype.pause = function () { this.playing = false; this.el.pause(); };
  FileTrack.prototype.stop = function () { this.pause(); this.el.currentTime = 0; };
  FileTrack.prototype.currentTime = function () { return this.el.currentTime || 0; };

  var musicVolume = 0.7;

  // ---------- rain ----------
  var rainNodes = null;
  var dropTimer = null;
  var rainLevel = 0.5;
  var rainOn = false;

  function startRain() {
    var c = getCtx();
    if (!c) return;
    if (!rainNodes) {
      var body = c.createBufferSource();
      body.buffer = noiseBuffer("brown");
      body.loop = true;
      var lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1400;
      var bodyGain = c.createGain();
      bodyGain.gain.value = 0.9;
      body.connect(lp).connect(bodyGain).connect(rainBus);

      var hiss = c.createBufferSource();
      hiss.buffer = noiseBuffer("white");
      hiss.loop = true;
      var hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 5000;
      var hissGain = c.createGain();
      hissGain.gain.value = 0.05;
      hiss.connect(hp).connect(hissGain).connect(rainBus);

      body.start(); hiss.start();
      rainNodes = { body: body, hiss: hiss };
    }
    rainOn = true;
    rainBus.gain.cancelScheduledValues(c.currentTime);
    rainBus.gain.setTargetAtTime(rainLevel * 0.6, c.currentTime, 0.6);

    clearInterval(dropTimer);
    dropTimer = setInterval(function () {
      // occasional heavier drops on the window
      if (Math.random() < 0.5) {
        var t = c.currentTime + Math.random() * 0.2;
        var src = c.createBufferSource();
        src.buffer = noiseBuffer("white");
        var bp = c.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 2500 + Math.random() * 2500;
        bp.Q.value = 4;
        var g = envGain(t, 0.08 * rainLevel, 0.001, 0.04);
        src.connect(bp).connect(g).connect(rainBus);
        src.start(t, Math.random()); src.stop(t + 0.06);
      }
    }, 120);
  }

  function stopRain() {
    rainOn = false;
    if (!ctx) return;
    clearInterval(dropTimer);
    rainBus.gain.cancelScheduledValues(ctx.currentTime);
    rainBus.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
  }

  // ---------- timer chime ----------
  function chime() {
    var c = getCtx();
    if (!c) return;
    [0, 0.28, 0.56].forEach(function (d, i) {
      var t = c.currentTime + d;
      var g = envGain(t, 0.18, 0.005, 1.4);
      var o = c.createOscillator();
      o.type = "sine";
      o.frequency.value = [880, 1108.7, 1318.5][i];
      o.connect(g).connect(master);
      o.start(t); o.stop(t + 1.6);
    });
  }

  // ---------- arcade blips ----------
  function blip(freq, dur, type) {
    var c = getCtx();
    if (!c) return;
    var t = c.currentTime;
    var g = envGain(t, 0.05, 0.004, dur || 0.08);
    var o = c.createOscillator();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, t);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + (dur || 0.08) + 0.05);
  }

  window.BiscuitAudio = {
    unlock: getCtx,
    blip: blip,
    createTrack: function (def) { return def.src ? new FileTrack(def) : new LofiTrack(def); },
    setMusicVolume: function (v, track) {
      musicVolume = v;
      if (musicOut) musicOut.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
      if (track && track.el) track.el.volume = v;
    },
    setRainVolume: function (v) {
      rainLevel = v;
      if (rainBus && rainOn) rainBus.gain.setTargetAtTime(v * 0.6, ctx.currentTime, 0.1);
    },
    startRain: startRain,
    stopRain: stopRain,
    chime: chime,
    supported: !!(window.AudioContext || window.webkitAudioContext)
  };
})();
