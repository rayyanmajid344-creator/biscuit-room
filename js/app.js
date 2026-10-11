/* Biscuit Room: room interactions, focus timer, to-do list and music player. */
(function () {
  "use strict";

  var A = window.BiscuitAudio;
  var room = document.getElementById("room");
  var mobile = window.matchMedia("(max-width: 760px)");

  // ---------- storage (always optional) ----------
  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem("biscuit-room:" + k); return v === null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem("biscuit-room:" + k, JSON.stringify(v)); } catch (e) { /* private mode */ }
    }
  };

  // ---------- panels ----------
  var lastOpener = {};
  var zTop = 6;

  function panelEl(name) { return document.getElementById("panel-" + name); }

  function syncPanelButtons(name, open) {
    document.querySelectorAll('[data-panel="' + name + '"]').forEach(function (b) {
      b.setAttribute("aria-expanded", String(open));
    });
  }

  function openPanel(name, opener) {
    var p = panelEl(name);
    if (!p) return;
    if (mobile.matches || room.getBoundingClientRect().width < 1000) {
      // one panel at a time on phones and when the room is drawn small
      document.querySelectorAll(".panel:not([hidden])").forEach(function (o) { if (o !== p) closePanel(o.dataset.name, true); });
    }
    if (opener) lastOpener[name] = opener;
    p.hidden = false;
    p.style.zIndex = ++zTop;
    syncPanelButtons(name, true);
    var first = p.querySelector("input, .mode[aria-pressed='true'], .play, button:not(.close)") || p.querySelector(".close");
    if (first) first.focus({ preventScroll: true });
  }

  function closePanel(name, silent) {
    var p = panelEl(name);
    if (!p || p.hidden) return;
    p.hidden = true;
    syncPanelButtons(name, false);
    if (!silent && lastOpener[name] && document.body.contains(lastOpener[name])) lastOpener[name].focus({ preventScroll: true });
  }

  function togglePanel(name, opener) {
    var p = panelEl(name);
    if (p.hidden) openPanel(name, opener); else closePanel(name);
  }

  document.querySelectorAll("[data-panel]").forEach(function (b) {
    b.addEventListener("click", function () { A.unlock(); togglePanel(b.dataset.panel, b); });
  });
  document.querySelectorAll(".panel .close").forEach(function (b) {
    b.addEventListener("click", function () { closePanel(b.closest(".panel").dataset.name); });
  });
  document.querySelectorAll(".panel").forEach(function (p) {
    p.addEventListener("pointerdown", function () { p.style.zIndex = ++zTop; });
  });
  // ---------- full-screen apps (Pins and Arcade) ----------
  var currentApp = null;
  var appOpener = null;

  function openApp(name, opener) {
    var el = document.getElementById("app-" + name);
    if (!el) return;
    if (currentApp) closeApp(true);
    currentApp = name;
    appOpener = opener || null;
    el.hidden = false;
    document.body.classList.add("app-open");
    document.dispatchEvent(new CustomEvent("app:open", { detail: name }));
    var back = el.querySelector("[data-close-app]");
    if (back) back.focus({ preventScroll: true });
  }

  function closeApp(silent) {
    if (!currentApp) return;
    var name = currentApp;
    document.getElementById("app-" + name).hidden = true;
    document.body.classList.remove("app-open");
    currentApp = null;
    document.dispatchEvent(new CustomEvent("app:close", { detail: name }));
    if (!silent && appOpener && document.body.contains(appOpener)) appOpener.focus({ preventScroll: true });
  }

  window.BiscuitApps = { open: openApp, close: closeApp, current: function () { return currentApp; } };

  document.querySelectorAll("[data-app]").forEach(function (b) {
    b.addEventListener("click", function () { A.unlock(); openApp(b.dataset.app, b); });
  });
  document.querySelectorAll("[data-close-app]").forEach(function (b) {
    b.addEventListener("click", function () { closeApp(); });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || currentApp) return; // apps handle their own Escape
    var open = Array.prototype.slice.call(document.querySelectorAll(".panel:not([hidden])"));
    if (!open.length) return;
    open.sort(function (a, b) { return (+b.style.zIndex || 0) - (+a.style.zIndex || 0); });
    closePanel(open[0].dataset.name);
  });

  // ---------- wall clock ----------
  var hourHand = document.getElementById("hourHand");
  var minuteHand = document.getElementById("minuteHand");
  function drawClock() {
    var d = new Date();
    var m = d.getMinutes() + d.getSeconds() / 60;
    var h = (d.getHours() % 12) + m / 60;
    hourHand.setAttribute("transform", "rotate(" + (h * 30) + " 975 190)");
    minuteHand.setAttribute("transform", "rotate(" + (m * 6) + " 975 190)");
  }
  drawClock();
  setInterval(drawClock, 20000);

  // ---------- rain ----------
  var raining = false;
  function setRain(on) {
    raining = on;
    room.classList.toggle("is-raining", on);
    document.querySelectorAll('[data-action="rain"]').forEach(function (b) { b.setAttribute("aria-pressed", String(on)); });
    document.querySelectorAll(".rain-state").forEach(function (s) { s.textContent = on ? "on" : "off"; });
    if (on) A.startRain(); else A.stopRain();
  }
  document.querySelectorAll('[data-action="rain"]').forEach(function (b) {
    b.addEventListener("click", function () { setRain(!raining); });
  });

  // ---------- focus timer ----------
  var MODES = { focus: { min: 25, label: "Focus" }, short: { min: 5, label: "Break" }, long: { min: 15, label: "Long break" } };
  var timeDisplay = document.getElementById("timeDisplay");
  var timeBar = document.getElementById("timeBar");
  var sessionText = document.getElementById("sessionText");
  var startBtn = document.getElementById("timerStart");
  var resetBtn = document.getElementById("timerReset");
  var timerStatus = document.getElementById("timerStatus");
  var clockTimer = document.getElementById("clockTimer");
  var modeBtns = document.querySelectorAll(".mode");
  var baseTitle = document.title;

  var today = new Date().toDateString();
  var saved = store.get("sessions", { day: today, done: 0 });
  var T = {
    mode: "focus",
    total: MODES.focus.min * 60,
    left: MODES.focus.min * 60,
    running: false,
    endAt: 0,
    tick: null,
    done: saved.day === today ? saved.done : 0
  };

  function fmt(s) {
    s = Math.max(0, Math.ceil(s));
    return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
  }

  function renderTimer() {
    var txt = fmt(T.left);
    timeDisplay.textContent = txt;
    timeBar.style.width = ((1 - T.left / T.total) * 100).toFixed(2) + "%";
    startBtn.textContent = T.running ? "Pause" : (T.left < T.total ? "Resume" : "Start");
    modeBtns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === T.mode)); });
    sessionText.textContent = T.mode === "focus"
      ? "Session " + ((T.done % 4) + 1) + " of 4 · " + T.done + " done today"
      : MODES[T.mode].label + " · " + T.done + (T.done === 1 ? " session" : " sessions") + " done today";
    var active = T.running || T.left < T.total;
    clockTimer.textContent = active ? txt : "";
    document.title = T.running ? txt + " · " + MODES[T.mode].label + " · Biscuit Room" : baseTitle;
  }

  function setMode(mode) {
    stopTimer();
    T.mode = mode;
    T.total = T.left = MODES[mode].min * 60;
    renderTimer();
  }

  function stopTimer() {
    T.running = false;
    clearInterval(T.tick);
    T.tick = null;
  }

  function finish() {
    stopTimer();
    A.chime();
    if (T.mode === "focus") {
      T.done++;
      store.set("sessions", { day: today, done: T.done });
      var next = T.done % 4 === 0 ? "long" : "short";
      timerStatus.textContent = "Focus session done. Time for a " + MODES[next].label.toLowerCase() + ".";
      setMode(next);
    } else {
      timerStatus.textContent = "Break's over. Ready for the next focus session.";
      setMode("focus");
    }
  }

  startBtn.addEventListener("click", function () {
    A.unlock();
    if (T.running) {
      T.left = (T.endAt - Date.now()) / 1000;
      stopTimer();
    } else {
      T.running = true;
      T.endAt = Date.now() + T.left * 1000;
      T.tick = setInterval(function () {
        T.left = (T.endAt - Date.now()) / 1000;
        if (T.left <= 0) { T.left = 0; finish(); return; }
        renderTimer();
      }, 250);
    }
    renderTimer();
  });
  resetBtn.addEventListener("click", function () { setMode(T.mode); });
  modeBtns.forEach(function (b) { b.addEventListener("click", function () { setMode(b.dataset.mode); }); });
  renderTimer();

  // ---------- to-do ----------
  var todoList = document.getElementById("todoList");
  var todoForm = document.getElementById("todoForm");
  var todoInput = document.getElementById("todoInput");
  var todoError = document.getElementById("todoError");
  var todoCount = document.getElementById("todoCount");
  var todoClear = document.getElementById("todoClear");

  var todos = store.get("todos", null);
  if (!Array.isArray(todos)) {
    todos = [
      { id: 1, text: "Press play on the record player", done: false },
      { id: 2, text: "Start a 25-minute focus session", done: false },
      { id: 3, text: "Add your own tasks below", done: false }
    ];
  }
  function saveTodos() { store.set("todos", todos); }

  function renderTodos() {
    todoList.textContent = "";
    if (!todos.length) {
      var empty = document.createElement("li");
      empty.className = "todo-empty";
      empty.textContent = "Nothing to do yet. Add your first task.";
      todoList.appendChild(empty);
    }
    todos.forEach(function (t) {
      var li = document.createElement("li");
      if (t.done) li.className = "done";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = "todo-" + t.id;
      cb.checked = t.done;
      cb.addEventListener("change", function () { t.done = cb.checked; saveTodos(); renderTodos(); });
      var label = document.createElement("label");
      label.htmlFor = cb.id;
      label.textContent = t.text;
      var del = document.createElement("button");
      del.type = "button";
      del.className = "del";
      del.setAttribute("aria-label", "Delete " + t.text);
      del.textContent = "×";
      del.addEventListener("click", function () {
        todos = todos.filter(function (x) { return x.id !== t.id; });
        saveTodos(); renderTodos(); todoInput.focus();
      });
      li.appendChild(cb); li.appendChild(label); li.appendChild(del);
      todoList.appendChild(li);
    });
    var done = todos.filter(function (t) { return t.done; }).length;
    todoCount.textContent = done + " of " + todos.length + " done";
    todoClear.hidden = done === 0;
  }

  todoForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = todoInput.value.trim();
    if (!text) { todoError.textContent = "Type a task first."; todoInput.focus(); return; }
    var id = todos.reduce(function (m, t) { return Math.max(m, t.id); }, 0) + 1;
    todos.push({ id: id, text: text, done: false });
    todoInput.value = "";
    saveTodos(); renderTodos();
    todoList.scrollTop = todoList.scrollHeight;
  });
  todoInput.addEventListener("input", function () { todoError.textContent = ""; });
  todoClear.addEventListener("click", function () {
    todos = todos.filter(function (t) { return !t.done; });
    saveTodos(); renderTodos(); todoInput.focus();
  });
  renderTodos();

  // ---------- music ----------
  var playlist = (window.BISCUIT_PLAYLIST || []).slice();
  var playBtn = document.getElementById("playBtn");
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");
  var trackTitle = document.getElementById("trackTitle");
  var trackSub = document.getElementById("trackSub");
  var trackBar = document.getElementById("trackBar");
  var tNow = document.getElementById("tNow");
  var tTotal = document.getElementById("tTotal");
  var cover = document.getElementById("cover");
  var musicVol = document.getElementById("musicVol");
  var rainVol = document.getElementById("rainVol");

  var M = { index: store.get("track", 0) % Math.max(1, playlist.length), track: null, playing: false, raf: null };

  function loadTrack(i) {
    if (M.track) { M.track.stop(); M.track.onended = null; }
    M.index = (i + playlist.length) % playlist.length;
    store.set("track", M.index);
    var def = playlist[M.index];
    M.track = A.supported ? A.createTrack(def) : null;
    if (M.track) M.track.onended = function () { loadTrack(M.index + 1); play(); };
    trackTitle.textContent = def.title;
    trackSub.textContent = (def.artist ? def.artist + " · " : "") + "Track " + (M.index + 1) + " of " + playlist.length;
    cover.style.background = def.cover || "var(--lilac)";
    renderProgress();
  }

  function renderProgress() {
    var now = M.track ? M.track.currentTime() : 0;
    var dur = M.track ? M.track.duration : 0;
    tNow.textContent = fmt(now);
    tTotal.textContent = dur ? fmt(dur) : "–:––";
    trackBar.style.width = dur ? Math.min(100, now / dur * 100).toFixed(2) + "%" : "0%";
  }

  function loop() {
    renderProgress();
    if (M.playing) M.raf = setTimeout(loop, 500);
  }

  function setPlaying(on) {
    M.playing = on;
    playBtn.classList.toggle("is-on", on);
    playBtn.setAttribute("aria-label", on ? "Pause" : "Play");
    room.classList.toggle("is-playing", on);
  }

  function play() {
    if (!M.track) { trackSub.textContent = "Your browser can't play sound here."; return; }
    A.unlock();
    A.setMusicVolume(musicVol.value / 100, M.track);
    M.track.play();
    setPlaying(true);
    clearTimeout(M.raf);
    loop();
  }

  function pause() {
    if (M.track) M.track.pause();
    setPlaying(false);
    clearTimeout(M.raf);
    renderProgress();
  }

  playBtn.addEventListener("click", function () { if (M.playing) pause(); else play(); });
  nextBtn.addEventListener("click", function () { var was = M.playing; loadTrack(M.index + 1); setPlaying(false); if (was) play(); });
  prevBtn.addEventListener("click", function () {
    var was = M.playing;
    if (M.track && M.track.currentTime() > 3) { M.track.stop(); renderProgress(); }
    else loadTrack(M.index - 1);
    setPlaying(false);
    if (was) play();
  });

  musicVol.value = store.get("musicVol", 70);
  rainVol.value = store.get("rainVol", 50);
  musicVol.addEventListener("input", function () {
    store.set("musicVol", +musicVol.value);
    if (window.BiscuitAudio) A.setMusicVolume(musicVol.value / 100, M.track);
  });
  rainVol.addEventListener("input", function () {
    store.set("rainVol", +rainVol.value);
    A.setRainVolume(rainVol.value / 100);
  });
  A.setRainVolume(rainVol.value / 100);

  if (playlist.length) loadTrack(M.index);
  else { trackTitle.textContent = "No tracks yet"; trackSub.textContent = "Add some in js/playlist.js"; }
})();
