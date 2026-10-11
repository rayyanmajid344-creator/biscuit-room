/* Biscuit Pins: a Pinterest-style mood board inside the room. Photos come from Unsplash. */
(function () {
  "use strict";

  var CFG = window.BISCUIT_CONFIG || {};
  var UTM = "utm_source=" + encodeURIComponent(CFG.APP_NAME || "biscuit_room") + "&utm_medium=referral";
  var API = "https://api.unsplash.com/search/photos";
  var CHIPS = [
    ["cozy room", "#ffc9d6"], ["coffee", "#ffd9cc"], ["rainy window", "#f5d3e6"], ["books", "#dfe6ff"],
    ["house plants", "#d6efdc"], ["sunset", "#fff0c9"], ["bakery", "#ffc9d6"], ["autumn", "#ffd9cc"],
    ["candles", "#f5d3e6"], ["beach", "#dfe6ff"], ["flowers", "#d6efdc"], ["cafe", "#fff0c9"]
  ];
  var CORK_SLOTS = [
    [415, 112, 86, 106, -4], [520, 110, 80, 92, 3], [620, 114, 84, 112, -2], [720, 112, 80, 96, 4],
    [420, 246, 84, 94, 3], [524, 226, 82, 110, -3], [624, 244, 78, 96, 2], [718, 230, 84, 108, -4]
  ];

  // ---------- storage ----------
  function get(k, d) { try { var v = localStorage.getItem("biscuit-room:pins:" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem("biscuit-room:pins:" + k, JSON.stringify(v)); } catch (e) {} }

  var boards = get("boards", null);
  if (!Array.isArray(boards) || !boards.length) {
    boards = [
      { id: "dream-room", name: "Dream room", pins: [] },
      { id: "study-desk", name: "Study desk", pins: [] }
    ];
  }
  var saveTo = get("saveTo", boards[0].id);
  function saveBoards() { set("boards", boards); renderCork(); updateBoardCount(); }
  function boardById(id) { for (var i = 0; i < boards.length; i++) if (boards[i].id === id) return boards[i]; return null; }
  if (!boardById(saveTo)) saveTo = boards[0].id;

  function apiKey() { return (CFG.UNSPLASH_ACCESS_KEY || "").trim() || get("key", ""); }

  // ---------- elements ----------
  var $ = function (id) { return document.getElementById(id); };
  var app = $("app-pins");
  var views = app.querySelectorAll(".view");
  var tabs = app.querySelectorAll(".pins-tabs .tab");
  var grid = $("discoverGrid"), statusEl = $("pinsStatus"), moreBtn = $("pinsMore");
  var query = $("pinsQuery"), saveToSel = $("saveTo");
  var keyBox = $("keyBox"), keyInput = $("keyInput"), keyErr = $("keyErr");
  var boardsGrid = $("boardsGrid"), boardGrid = $("boardGrid"), boardEmpty = $("boardEmpty");
  var modal = $("pinModal"), pmBoard = $("pmBoard"), pmMsg = $("pmMsg");

  var S = { view: "discover", board: null, q: "cozy room", page: 1, total: 0, results: [], loading: false, started: false };

  // ---------- helpers ----------
  function withUtm(url) { return url + (url.indexOf("?") > -1 ? "&" : "?") + UTM; }
  function cap(s) { s = s || "Untitled photo"; return s.charAt(0).toUpperCase() + s.slice(1); }

  function normalize(p) {
    return {
      id: p.id,
      title: cap(p.alt_description || p.description || "Untitled photo"),
      creator: (p.user && p.user.name) || "Unknown",
      creatorUrl: p.user && p.user.links ? withUtm(p.user.links.html) : "https://unsplash.com/?" + UTM,
      page: p.links ? withUtm(p.links.html) : "",
      thumb: p.urls.small,
      big: p.urls.regular,
      w: p.width, h: p.height,
      color: p.color || "#f7e6ec"
    };
  }

  function creditNode(pin) {
    var span = document.createElement("span");
    span.appendChild(document.createTextNode("Photo by "));
    var a = document.createElement("a");
    a.href = pin.creatorUrl; a.target = "_blank"; a.rel = "noopener"; a.textContent = pin.creator;
    span.appendChild(a);
    span.appendChild(document.createTextNode(" on "));
    var u = document.createElement("a");
    u.href = "https://unsplash.com/?" + UTM; u.target = "_blank"; u.rel = "noopener"; u.textContent = "Unsplash";
    span.appendChild(u);
    span.querySelectorAll("a").forEach(function (l) { l.addEventListener("click", function (e) { e.stopPropagation(); }); });
    return span;
  }

  function inBoard(board, pinId) { return board && board.pins.some(function (p) { return p.id === pinId; }); }

  // ---------- pin cards ----------
  function card(pin, mode) {
    var el = document.createElement("article");
    el.className = "pin";
    var box = document.createElement("div");
    box.className = "pin-img";
    box.style.background = pin.color;
    if (pin.w && pin.h) box.style.aspectRatio = pin.w + " / " + pin.h;
    var img = document.createElement("img");
    img.src = pin.thumb; img.alt = pin.title; img.loading = "lazy";
    box.appendChild(img);

    var open = document.createElement("button");
    open.type = "button";
    open.className = "pin-open";
    open.setAttribute("aria-label", "Open photo: " + pin.title);
    open.addEventListener("click", function () { openModal(pin); });
    box.appendChild(open);

    var ov = document.createElement("div");
    ov.className = "pin-ov";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pin-btn";
    if (mode === "board") {
      btn.textContent = "Remove";
      btn.setAttribute("aria-label", "Remove " + pin.title + " from this board");
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var b = boardById(S.board);
        b.pins = b.pins.filter(function (p) { return p.id !== pin.id; });
        saveBoards(); renderBoard();
      });
    } else {
      var paint = function () {
        var b = boardById(saveTo), on = inBoard(b, pin.id);
        btn.textContent = on ? "Saved" : "Save";
        btn.classList.toggle("is-saved", on);
        btn.setAttribute("aria-label", (on ? "Saved to " : "Save to ") + (b ? b.name : "board") + ": " + pin.title);
      };
      paint();
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var b = boardById(saveTo);
        if (!b) return;
        if (inBoard(b, pin.id)) b.pins = b.pins.filter(function (p) { return p.id !== pin.id; });
        else b.pins.unshift(pin);
        saveBoards(); paint();
      });
      el._paint = paint;
    }
    var by = document.createElement("p");
    by.className = "pin-by";
    by.appendChild(creditNode(pin));
    ov.appendChild(btn); ov.appendChild(by);
    box.appendChild(ov);
    el.appendChild(box);
    return el;
  }

  // ---------- views ----------
  function show(view, boardId) {
    S.view = view;
    if (boardId) S.board = boardId;
    views.forEach(function (v) { v.hidden = v.dataset.view !== view; });
    tabs.forEach(function (t) { t.setAttribute("aria-pressed", String(t.dataset.view === view || (view === "board" && t.dataset.view === "boards"))); });
    if (view === "boards") renderBoards();
    if (view === "board") renderBoard();
    if (view === "discover") grid.querySelectorAll(".pin").forEach(function (c) { if (c._paint) c._paint(); });
    $("pinsBody").scrollTop = 0;
  }
  tabs.forEach(function (t) { t.addEventListener("click", function () { show(t.dataset.view); }); });
  app.querySelectorAll("[data-view-go]").forEach(function (b) { b.addEventListener("click", function () { show(b.dataset.viewGo); }); });

  // ---------- discover ----------
  CHIPS.forEach(function (c) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "chip-btn"; b.textContent = c[0]; b.style.background = c[1];
    b.addEventListener("click", function () { query.value = c[0]; search(c[0]); });
    $("pinsChips").appendChild(b);
  });

  function fillBoardSelect(sel, selected) {
    sel.textContent = "";
    boards.forEach(function (b) {
      var o = document.createElement("option");
      o.value = b.id; o.textContent = b.name;
      if (b.id === selected) o.selected = true;
      sel.appendChild(o);
    });
  }
  saveToSel.addEventListener("change", function () {
    saveTo = saveToSel.value; set("saveTo", saveTo);
    grid.querySelectorAll(".pin").forEach(function (c) { if (c._paint) c._paint(); });
  });

  function showStatus(t) { statusEl.hidden = !t; statusEl.textContent = t || ""; }

  function showKeyBox(msg) {
    keyBox.hidden = false;
    grid.textContent = ""; moreBtn.hidden = true; showStatus("");
    keyErr.textContent = msg || "";
    keyInput.value = "";
  }

  function search(q) {
    S.q = q || "cozy room"; S.page = 1; S.results = []; S.total = 0;
    if (S.view !== "discover") show("discover");
    grid.textContent = "";
    if (!apiKey()) { showKeyBox(); return; }
    load();
  }

  function load() {
    if (S.loading) return;
    S.loading = true;
    keyBox.hidden = true; moreBtn.hidden = true;
    showStatus("Loading photos…");
    var url = API + "?query=" + encodeURIComponent(S.q) + "&page=" + S.page + "&per_page=24&content_filter=high";
    fetch(url, { headers: { "Authorization": "Client-ID " + apiKey(), "Accept-Version": "v1" } })
      .then(function (res) {
        if (res.status === 401) throw { code: 401 };
        if (res.status === 403 || res.status === 429) throw { code: 403 };
        if (!res.ok) throw { code: res.status };
        return res.json();
      })
      .then(function (data) {
        S.total = data.total_pages || 0;
        (data.results || []).forEach(function (p) {
          var pin = normalize(p);
          S.results.push(pin);
          grid.appendChild(card(pin, "discover"));
        });
        if (!S.results.length) showStatus("No photos found for \"" + S.q + "\". Try another search.");
        else { showStatus(""); moreBtn.hidden = !(S.page < S.total); }
      })
      .catch(function (err) {
        var code = err && err.code;
        if (code === 401) {
          if (CFG.UNSPLASH_ACCESS_KEY) showStatus("The Unsplash key in js/config.js didn't work. Check that it's the Access Key.");
          else { set("key", ""); showKeyBox("That key didn't work. Check that you copied the Access Key, not the Secret Key."); }
        } else if (code === 403) {
          showStatus("This hour's free Unsplash searches are used up. Try again in a little while.");
        } else {
          showStatus("Couldn't load photos. Check your internet connection and try again.");
        }
      })
      .then(function () { S.loading = false; });
  }

  $("pinsSearch").addEventListener("submit", function (e) {
    e.preventDefault();
    var q = query.value.trim();
    if (q) search(q);
  });
  moreBtn.addEventListener("click", function () { S.page++; load(); });

  keyBox.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = keyInput.value.trim();
    if (!v) { keyErr.textContent = "Paste your Access Key first."; keyInput.focus(); return; }
    if (/\s/.test(v) || v.length < 20) { keyErr.textContent = "That doesn't look like an Access Key. It's a long code with no spaces."; keyInput.focus(); return; }
    set("key", v);
    search(S.q);
  });
  keyInput.addEventListener("input", function () { keyErr.textContent = ""; });
  $("changeKey").addEventListener("click", function () {
    if (CFG.UNSPLASH_ACCESS_KEY) { show("discover"); showStatus("This site uses the key set in js/config.js."); return; }
    show("discover"); showKeyBox(); keyInput.focus();
  });

  // ---------- boards ----------
  function updateBoardCount() {
    $("boardCount").textContent = boards.length;
    fillBoardSelect(saveToSel, saveTo);
  }

  function renderBoards() {
    boardsGrid.textContent = "";
    boards.forEach(function (b) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "board-card";
      var cov = document.createElement("span");
      cov.className = "board-cover";
      for (var i = 0; i < 4; i++) {
        var cell = document.createElement("span");
        var p = b.pins[i];
        if (p) { cell.style.backgroundImage = "url('" + p.thumb + "')"; cell.style.backgroundColor = p.color; }
        cov.appendChild(cell);
      }
      var name = document.createElement("span");
      name.className = "board-name";
      name.textContent = b.name;
      var count = document.createElement("span");
      count.className = "board-count";
      count.textContent = b.pins.length + (b.pins.length === 1 ? " pin" : " pins");
      btn.appendChild(cov); btn.appendChild(name); btn.appendChild(count);
      btn.addEventListener("click", function () { show("board", b.id); });
      boardsGrid.appendChild(btn);
    });
  }

  $("newBoardForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = $("newBoardName"), err = $("newBoardErr");
    var name = input.value.trim();
    if (!name) { err.textContent = "Give your board a name."; input.focus(); return; }
    if (boards.some(function (b) { return b.name.toLowerCase() === name.toLowerCase(); })) { err.textContent = "You already have a board called " + name + "."; input.focus(); return; }
    var id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36);
    boards.push({ id: id, name: name, pins: [] });
    input.value = ""; err.textContent = "";
    saveBoards(); renderBoards();
  });
  $("newBoardName").addEventListener("input", function () { $("newBoardErr").textContent = ""; });

  function renderBoard() {
    var b = boardById(S.board);
    if (!b) { show("boards"); return; }
    $("boardName").textContent = b.name;
    $("boardMeta").textContent = b.pins.length + (b.pins.length === 1 ? " pin" : " pins");
    $("renameForm").hidden = true; $("deleteConfirm").hidden = true;
    boardGrid.textContent = "";
    b.pins.forEach(function (p) { boardGrid.appendChild(card(p, "board")); });
    boardEmpty.hidden = b.pins.length > 0;
  }

  $("renameBoard").addEventListener("click", function () {
    var b = boardById(S.board);
    $("deleteConfirm").hidden = true;
    $("renameForm").hidden = false;
    $("renameInput").value = b.name;
    $("renameInput").focus(); $("renameInput").select();
  });
  $("renameCancel").addEventListener("click", function () { $("renameForm").hidden = true; });
  $("renameForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = $("renameInput").value.trim();
    if (!v) { $("renameInput").focus(); return; }
    boardById(S.board).name = v;
    saveBoards(); renderBoard();
  });
  $("deleteBoard").addEventListener("click", function () {
    $("renameForm").hidden = true;
    var c = $("deleteConfirm");
    if (boards.length === 1) {
      c.hidden = false;
      c.querySelector("span").textContent = "You need at least one board, so this one can't be deleted.";
      $("deleteYes").hidden = true; $("deleteNo").textContent = "OK";
      return;
    }
    c.querySelector("span").textContent = "Delete this board and its pins?";
    $("deleteYes").hidden = false; $("deleteNo").textContent = "Keep it";
    c.hidden = false; $("deleteNo").focus();
  });
  $("deleteNo").addEventListener("click", function () { $("deleteConfirm").hidden = true; });
  $("deleteYes").addEventListener("click", function () {
    boards = boards.filter(function (b) { return b.id !== S.board; });
    if (!boardById(saveTo)) { saveTo = boards[0].id; set("saveTo", saveTo); }
    saveBoards(); show("boards");
  });

  // ---------- photo view ----------
  var current = null, modalOpener = null;
  function openModal(pin) {
    current = pin;
    modalOpener = document.activeElement;
    $("pmImg").src = pin.big || pin.thumb;
    $("pmImg").alt = pin.title;
    $("pmImg").parentNode.style.background = pin.color;
    $("pmTitle").textContent = pin.title;
    var cr = $("pmCredit"); cr.textContent = ""; cr.appendChild(creditNode(pin));
    if (pin.page) {
      cr.appendChild(document.createTextNode(" · "));
      var v = document.createElement("a");
      v.href = pin.page; v.target = "_blank"; v.rel = "noopener"; v.textContent = "View on Unsplash";
      cr.appendChild(v);
    }
    fillBoardSelect(pmBoard, saveTo);
    pmMsg.textContent = "";
    modal.hidden = false;
    $("pmClose").focus();
  }
  function closeModal() {
    modal.hidden = true; current = null;
    if (modalOpener && document.body.contains(modalOpener)) modalOpener.focus({ preventScroll: true });
  }
  $("pmClose").addEventListener("click", closeModal);
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
  $("pmSave").addEventListener("click", function () {
    if (!current) return;
    var b = boardById(pmBoard.value);
    if (inBoard(b, current.id)) { pmMsg.textContent = "Already in " + b.name + "."; return; }
    b.pins.unshift(current);
    saveBoards();
    pmMsg.textContent = "Saved to " + b.name + ".";
    if (S.view === "discover") grid.querySelectorAll(".pin").forEach(function (c) { if (c._paint) c._paint(); });
    if (S.view === "board") renderBoard();
  });

  // ---------- corkboard in the room ----------
  function renderCork() {
    var host = $("corkPins");
    if (!host) return;
    host.textContent = "";
    var all = [];
    boards.forEach(function (b) { b.pins.forEach(function (p) { if (all.length < 8 && !all.some(function (x) { return x.id === p.id; })) all.push(p); }); });
    all.forEach(function (p, i) {
      var s = CORK_SLOTS[i];
      var d = document.createElement("span");
      d.className = "cork-photo";
      d.style.left = (s[0] / 1280 * 100) + "%";
      d.style.top = (s[1] / 800 * 100) + "%";
      d.style.width = (s[2] / 1280 * 100) + "%";
      d.style.height = (s[3] / 800 * 100) + "%";
      d.style.transform = "rotate(" + s[4] + "deg)";
      d.style.backgroundColor = p.color;
      d.style.backgroundImage = "url('" + p.thumb + "')";
      host.appendChild(d);
    });
  }

  // ---------- open / close ----------
  document.addEventListener("app:open", function (e) {
    if (e.detail !== "pins") return;
    updateBoardCount();
    if (!S.started) { S.started = true; query.value = S.q; search(S.q); }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !window.BiscuitApps || window.BiscuitApps.current() !== "pins") return;
    if (!modal.hidden) { closeModal(); return; }
    if (!$("renameForm").hidden) { $("renameForm").hidden = true; return; }
    if (!$("deleteConfirm").hidden) { $("deleteConfirm").hidden = true; return; }
    window.BiscuitApps.close();
  });

  updateBoardCount();
  renderCork();
})();
