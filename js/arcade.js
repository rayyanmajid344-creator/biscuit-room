/* Biscuit Arcade: a pastel pocket console with Snake, Memory cards and 2048. */
(function () {
  "use strict";

  var cv = document.getElementById("arcadeScreen");
  var g = cv.getContext("2d");
  var live = document.getElementById("arcadeLive");
  var W = 640, H = 480;
  var FONT = '"VT323", ui-monospace, Consolas, monospace';
  var C = {
    screen: "#e8f4ea", ink: "#5a2a3a", rose: "#ff6f91", soft: "#9a6b7a", paper: "#fffafb",
    pink: "#ffc9d6", lilac: "#f5d3e6", mint: "#d6efdc", butter: "#fff0c9", sky: "#dfe6ff", peach: "#ffd9cc", grid: "#d3e8d6"
  };

  function load(k, d) { try { var v = localStorage.getItem("biscuit-room:arcade:" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem("biscuit-room:arcade:" + k, JSON.stringify(v)); } catch (e) {} }

  var best = load("best", { snake: 0, memory: 0, g2048: 0 });
  var sound = load("sound", true);

  function sfx(f, d, t) { if (sound && window.BiscuitAudio) window.BiscuitAudio.blip(f, d, t); }
  function say(t) { live.textContent = t; }

  // ---------- drawing helpers ----------
  function clear(color) { g.fillStyle = color || C.screen; g.fillRect(0, 0, W, H); }
  function text(s, x, y, size, color, align) {
    g.font = (size || 32) + "px " + FONT;
    g.fillStyle = color || C.ink;
    g.textAlign = align || "left";
    g.textBaseline = "middle";
    g.fillText(s, x, y);
  }
  function rrect(x, y, w, h, r, fill, stroke, lw) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 3; g.stroke(); }
  }
  function heartPath(cx, cy, s) {
    g.beginPath();
    g.moveTo(cx, cy + s * 0.9);
    g.bezierCurveTo(cx - s * 1.4, cy, cx - s * 0.9, cy - s * 1.1, cx, cy - s * 0.35);
    g.bezierCurveTo(cx + s * 0.9, cy - s * 1.1, cx + s * 1.4, cy, cx, cy + s * 0.9);
    g.closePath();
  }
  function overlay(lines, sub) {
    g.fillStyle = "rgba(232,244,234,.88)";
    g.fillRect(0, 0, W, H);
    rrect(90, 150, 460, 180, 18, C.paper, C.ink, 4);
    lines.forEach(function (l, i) { text(l, W / 2, 205 + i * 44, i === 0 ? 52 : 34, i === 0 ? C.rose : C.ink, "center"); });
    if (sub) text(sub, W / 2, 300, 26, C.soft, "center");
  }

  // ---------- scenes ----------
  var scene = null;
  function go(s) { scene = s; if (s.enter) s.enter(); }

  // Menu
  var Menu = {
    items: function () { return ["SNAKE", "MEMORY CARDS", "2048", "HIGH SCORES", "SOUND: " + (sound ? "ON" : "OFF")]; },
    i: 0,
    enter: function () { say("Menu. " + this.items()[this.i]); },
    input: function (k) {
      var n = this.items().length;
      if (k === "up") { this.i = (this.i + n - 1) % n; sfx(660, 0.05); say(this.items()[this.i]); }
      else if (k === "down") { this.i = (this.i + 1) % n; sfx(660, 0.05); say(this.items()[this.i]); }
      else if (k === "a") {
        sfx(880, 0.08);
        if (this.i === 0) go(Snake);
        else if (this.i === 1) go(Memory);
        else if (this.i === 2) go(G2048);
        else if (this.i === 3) go(Scores);
        else { sound = !sound; save("sound", sound); say("Sound " + (sound ? "on" : "off")); }
      } else if (k === "b") { if (window.BiscuitApps) window.BiscuitApps.close(); }
    },
    draw: function () {
      clear();
      text("BISCUIT ARCADE", 40, 52, 44, C.ink);
      [0, 1, 2].forEach(function (j) { heartPath(520 + j * 34, 50, 12); g.fillStyle = j < 2 ? C.rose : C.lilac; g.fill(); });
      var items = this.items(), self = this;
      items.forEach(function (it, j) {
        var y = 130 + j * 64;
        if (j === self.i) { rrect(32, y - 26, 576, 52, 10, C.ink); text("▸ " + it, 56, y, 40, C.screen); }
        else text("  " + it, 56, y, 40, C.ink);
      });
      text("♥ select   B back to room", W / 2, 456, 26, C.soft, "center");
    }
  };

  // Snake
  var COLS = 20, ROWS = 14, CELL = 32, TOP = 32;
  var Snake = {
    enter: function () {
      this.body = [{ x: 6, y: 7 }, { x: 5, y: 7 }, { x: 4, y: 7 }];
      this.dir = "right"; this.queue = [];
      this.score = 0; this.speed = 150; this.acc = 0;
      this.state = "ready";
      this.place();
      say("Snake. Press A to start.");
    },
    place: function () {
      var f;
      do { f = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }; }
      while (this.body.some(function (b) { return b.x === f.x && b.y === f.y; }));
      this.food = f;
    },
    input: function (k) {
      if (k === "b") { go(Menu); return; }
      if (this.state === "ready" && k === "a") { this.state = "play"; sfx(880, 0.08); return; }
      if (this.state === "over" && k === "a") { this.enter(); this.state = "play"; return; }
      if (this.state !== "play") return;
      var opp = { up: "down", down: "up", left: "right", right: "left" };
      var lastDir = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
      if (["up", "down", "left", "right"].indexOf(k) > -1 && k !== opp[lastDir] && k !== lastDir && this.queue.length < 2) this.queue.push(k);
    },
    update: function (dt) {
      if (this.state !== "play") return;
      this.acc += dt;
      while (this.acc >= this.speed && this.state === "play") {
        this.acc -= this.speed;
        if (this.queue.length) this.dir = this.queue.shift();
        var h = { x: this.body[0].x, y: this.body[0].y };
        if (this.dir === "up") h.y--; if (this.dir === "down") h.y++;
        if (this.dir === "left") h.x--; if (this.dir === "right") h.x++;
        var hit = h.x < 0 || h.y < 0 || h.x >= COLS || h.y >= ROWS ||
          this.body.some(function (b, i) { return i < this.body.length - 1 && b.x === h.x && b.y === h.y; }, this);
        if (hit) {
          this.state = "over";
          sfx(180, 0.3, "triangle");
          var rec = this.score > best.snake;
          if (rec) { best.snake = this.score; save("best", best); }
          say("Game over. Score " + this.score + (rec ? ". New best!" : "."));
          return;
        }
        this.body.unshift(h);
        if (h.x === this.food.x && h.y === this.food.y) {
          this.score++; sfx(990, 0.06);
          this.speed = Math.max(70, this.speed - 5);
          this.place();
        } else this.body.pop();
      }
    },
    draw: function () {
      clear();
      text("SCORE " + this.score, 16, 16, 30);
      text("BEST " + Math.max(best.snake, this.score), W - 16, 16, 30, C.ink, "right");
      g.fillStyle = C.grid;
      for (var x = 0; x <= COLS; x++) g.fillRect(x * CELL, TOP, 1, ROWS * CELL);
      for (var y = 0; y <= ROWS; y++) g.fillRect(0, TOP + y * CELL, W, 1);
      heartPath(this.food.x * CELL + 16, TOP + this.food.y * CELL + 17, 11); g.fillStyle = C.rose; g.fill();
      this.body.forEach(function (b, i) {
        rrect(b.x * CELL + 3, TOP + b.y * CELL + 3, CELL - 6, CELL - 6, 8, i === 0 ? C.ink : "#8a4d60");
      });
      if (this.state === "ready") overlay(["SNAKE", "Press ♥ to start"], "Eat the hearts, don't hit the walls");
      if (this.state === "over") overlay(["GAME OVER", "Score " + this.score], "♥ play again   B menu");
    }
  };

  // Memory cards
  var SHAPES = ["heart", "star", "circle", "square", "triangle", "diamond", "moon", "flower"];
  var SHAPE_COLORS = [C.rose, "#ffcf5c", "#8fc7ff", "#9ad6a6", "#c9a0ff", "#ff9f80", "#fff0c9", "#ffb3c8"];
  function drawShape(name, cx, cy, s, color) {
    g.fillStyle = color; g.strokeStyle = C.ink; g.lineWidth = 3;
    g.beginPath();
    if (name === "heart") { heartPath(cx, cy, s * 0.8); }
    else if (name === "circle") { g.arc(cx, cy, s * 0.75, 0, Math.PI * 2); }
    else if (name === "square") { g.rect(cx - s * 0.7, cy - s * 0.7, s * 1.4, s * 1.4); }
    else if (name === "triangle") { g.moveTo(cx, cy - s * 0.85); g.lineTo(cx + s * 0.9, cy + s * 0.7); g.lineTo(cx - s * 0.9, cy + s * 0.7); g.closePath(); }
    else if (name === "diamond") { g.moveTo(cx, cy - s); g.lineTo(cx + s * 0.7, cy); g.lineTo(cx, cy + s); g.lineTo(cx - s * 0.7, cy); g.closePath(); }
    else if (name === "star") {
      for (var i = 0; i < 10; i++) {
        var r = i % 2 ? s * 0.42 : s, a = -Math.PI / 2 + i * Math.PI / 5;
        g[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      g.closePath();
    } else if (name === "moon") {
      g.arc(cx, cy, s * 0.8, Math.PI * 0.3, Math.PI * 1.7, false);
      g.arc(cx + s * 0.35, cy - s * 0.05, s * 0.6, Math.PI * 1.55, Math.PI * 0.45, true);
      g.closePath();
    } else if (name === "flower") {
      for (var p = 0; p < 5; p++) { var a2 = p * Math.PI * 2 / 5; g.moveTo(cx + Math.cos(a2) * s * 0.5 + s * 0.38, cy + Math.sin(a2) * s * 0.5); g.arc(cx + Math.cos(a2) * s * 0.5, cy + Math.sin(a2) * s * 0.5, s * 0.38, 0, Math.PI * 2); }
    }
    g.fill(); g.stroke();
    if (name === "flower") { g.beginPath(); g.arc(cx, cy, s * 0.28, 0, Math.PI * 2); g.fillStyle = "#ffcf5c"; g.fill(); g.stroke(); }
  }

  var MW = 120, MH = 92, MG = 14, MX = (W - (4 * MW + 3 * MG)) / 2, MY = 44;
  var Memory = {
    enter: function () {
      var deck = [];
      for (var i = 0; i < 8; i++) deck.push(i, i);
      for (var j = deck.length - 1; j > 0; j--) { var k = Math.floor(Math.random() * (j + 1)); var t = deck[j]; deck[j] = deck[k]; deck[k] = t; }
      this.cards = deck.map(function (v) { return { v: v, up: false, done: false }; });
      this.cur = 0; this.open = []; this.moves = 0; this.lock = 0; this.won = false;
      say("Memory cards. Find the matching pairs.");
    },
    input: function (k) {
      if (k === "b") { go(Menu); return; }
      if (this.won) { if (k === "a") this.enter(); return; }
      var c = this.cur;
      if (k === "left") c = c % 4 === 0 ? c + 3 : c - 1;
      if (k === "right") c = c % 4 === 3 ? c - 3 : c + 1;
      if (k === "up") c = (c + 12) % 16;
      if (k === "down") c = (c + 4) % 16;
      if (c !== this.cur) { this.cur = c; sfx(620, 0.03); return; }
      if (k === "a" && this.lock <= 0) {
        var card = this.cards[c];
        if (card.up || card.done) return;
        card.up = true; this.open.push(c); sfx(760, 0.05);
        say(SHAPES[card.v]);
        if (this.open.length === 2) {
          this.moves++;
          var a = this.cards[this.open[0]], b = this.cards[this.open[1]];
          if (a.v === b.v) {
            a.done = b.done = true; this.open = []; sfx(1040, 0.12);
            if (this.cards.every(function (x) { return x.done; })) {
              this.won = true;
              var rec = !best.memory || this.moves < best.memory;
              if (rec) { best.memory = this.moves; save("best", best); }
              say("All pairs found in " + this.moves + " moves" + (rec ? ". New best!" : "."));
            }
          } else this.lock = 700;
        }
      }
    },
    update: function (dt) {
      if (this.lock > 0) {
        this.lock -= dt;
        if (this.lock <= 0) { var self = this; this.open.forEach(function (i) { self.cards[i].up = false; }); this.open = []; }
      }
    },
    tap: function (x, y) {
      var col = Math.floor((x - MX) / (MW + MG)), row = Math.floor((y - MY) / (MH + MG));
      if (col < 0 || col > 3 || row < 0 || row > 3) return false;
      this.cur = row * 4 + col; this.input("a"); return true;
    },
    draw: function () {
      clear();
      text("MOVES " + this.moves, 16, 20, 30);
      text("BEST " + (best.memory || "–"), W - 16, 20, 30, C.ink, "right");
      var self = this;
      this.cards.forEach(function (card, i) {
        var x = MX + (i % 4) * (MW + MG), y = MY + Math.floor(i / 4) * (MH + MG);
        if (card.up || card.done) {
          rrect(x, y, MW, MH, 12, card.done ? C.mint : C.paper, C.ink, 3);
          drawShape(SHAPES[card.v], x + MW / 2, y + MH / 2, 26, SHAPE_COLORS[card.v]);
        } else {
          rrect(x, y, MW, MH, 12, C.pink, C.ink, 3);
          heartPath(x + MW / 2, y + MH / 2 + 2, 12); g.fillStyle = C.paper; g.fill();
        }
        if (i === self.cur && !self.won) rrect(x - 6, y - 6, MW + 12, MH + 12, 16, null, C.rose, 5);
      });
      if (this.won) overlay(["CLEARED!", this.moves + " moves"], "♥ play again   B menu");
    }
  };

  // 2048
  var TS = 96, TG = 12, TX = (W - (4 * TS + 5 * TG)) / 2, TY = 34;
  var TILE = { 2: C.paper, 4: "#ffe3ea", 8: C.pink, 16: C.peach, 32: C.butter, 64: C.mint, 128: C.sky, 256: C.lilac, 512: "#ff9fb6", 1024: C.rose, 2048: C.ink };
  var G2048 = {
    enter: function () {
      this.b = []; for (var i = 0; i < 16; i++) this.b.push(0);
      this.score = 0; this.over = false; this.won = false; this.kept = false;
      this.add(); this.add();
      say("2048. Slide the tiles with the arrow keys.");
    },
    add: function () {
      var empty = [];
      this.b.forEach(function (v, i) { if (!v) empty.push(i); });
      if (!empty.length) return;
      this.b[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < 0.9 ? 2 : 4;
    },
    line: function (idx) {
      var vals = idx.map(function (i) { return this.b[i]; }, this).filter(Boolean);
      var out = [], gained = 0;
      for (var i = 0; i < vals.length; i++) {
        if (vals[i] === vals[i + 1]) { out.push(vals[i] * 2); gained += vals[i] * 2; i++; }
        else out.push(vals[i]);
      }
      while (out.length < 4) out.push(0);
      return { out: out, gained: gained };
    },
    move: function (dir) {
      var moved = false, self = this;
      for (var r = 0; r < 4; r++) {
        var idx = [];
        for (var c = 0; c < 4; c++) {
          if (dir === "left") idx.push(r * 4 + c);
          if (dir === "right") idx.push(r * 4 + (3 - c));
          if (dir === "up") idx.push(c * 4 + r);
          if (dir === "down") idx.push((3 - c) * 4 + r);
        }
        var res = this.line(idx);
        idx.forEach(function (i, j) { if (self.b[i] !== res.out[j]) moved = true; self.b[i] = res.out[j]; });
        this.score += res.gained;
      }
      return moved;
    },
    canMove: function () {
      for (var i = 0; i < 16; i++) {
        if (!this.b[i]) return true;
        if (i % 4 < 3 && this.b[i] === this.b[i + 1]) return true;
        if (i < 12 && this.b[i] === this.b[i + 4]) return true;
      }
      return false;
    },
    input: function (k) {
      if (k === "b") { go(Menu); return; }
      if (this.over) { if (k === "a") this.enter(); return; }
      if (this.won && !this.kept) { if (k === "a") this.kept = true; return; }
      if (["up", "down", "left", "right"].indexOf(k) < 0) return;
      if (this.move(k)) {
        this.add(); sfx(520, 0.04);
        if (this.score > best.g2048) { best.g2048 = this.score; save("best", best); }
        if (!this.won && this.b.indexOf(2048) > -1) { this.won = true; sfx(1200, 0.2); say("You made 2048!"); }
        if (!this.canMove()) { this.over = true; sfx(180, 0.3, "triangle"); say("No moves left. Score " + this.score); }
      }
    },
    draw: function () {
      clear();
      text("SCORE " + this.score, 16, 16, 30);
      text("BEST " + best.g2048, W - 16, 16, 30, C.ink, "right");
      rrect(TX, TY, 4 * TS + 5 * TG, 4 * TS + 5 * TG, 14, C.grid);
      for (var i = 0; i < 16; i++) {
        var x = TX + TG + (i % 4) * (TS + TG), y = TY + TG + Math.floor(i / 4) * (TS + TG), v = this.b[i];
        if (!v) { rrect(x, y, TS, TS, 10, "#dcecdf"); continue; }
        rrect(x, y, TS, TS, 10, TILE[v] || C.ink, C.ink, 3);
        text(String(v), x + TS / 2, y + TS / 2 + 2, v >= 1024 ? 40 : 52, v >= 2048 || v > 2048 ? C.paper : C.ink, "center");
      }
      if (this.won && !this.kept) overlay(["2048!", "You did it"], "♥ keep going   B menu");
      if (this.over) overlay(["NO MOVES", "Score " + this.score], "♥ play again   B menu");
    }
  };

  // High scores
  var Scores = {
    enter: function () { say("High scores. Snake " + best.snake + ". Memory " + (best.memory || "none") + ". 2048 " + best.g2048 + "."); },
    input: function (k) { if (k === "b" || k === "a") go(Menu); },
    draw: function () {
      clear();
      text("HIGH SCORES", W / 2, 60, 52, C.ink, "center");
      var rows = [["SNAKE", best.snake + " hearts"], ["MEMORY", best.memory ? best.memory + " moves" : "not played"], ["2048", best.g2048 + " points"]];
      rows.forEach(function (r, i) {
        var y = 160 + i * 80;
        rrect(80, y - 30, 480, 60, 12, [C.pink, C.sky, C.butter][i], C.ink, 3);
        text(r[0], 104, y, 38, C.ink);
        text(r[1], 536, y, 38, C.ink, "right");
      });
      text("B back", W / 2, 456, 26, C.soft, "center");
    }
  };

  // ---------- input ----------
  function press(k) { if (scene) scene.input(k); }

  var KEYS = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right",
    Enter: "a", " ": "a", z: "a", Z: "a",
    Escape: "b", Backspace: "b", x: "b", X: "b"
  };
  document.addEventListener("keydown", function (e) {
    if (!window.BiscuitApps || window.BiscuitApps.current() !== "arcade") return;
    var tag = (e.target && e.target.tagName) || "";
    var onButton = tag === "BUTTON";
    var k = KEYS[e.key];
    if (!k) return;
    if (onButton && (e.key === "Enter" || e.key === " ")) return; // let focused buttons work normally
    e.preventDefault();
    press(k);
  });

  document.querySelectorAll("#app-arcade [data-key]").forEach(function (b) {
    b.addEventListener("click", function () { press(b.dataset.key); });
  });

  // Swipe or tap on the screen
  var start = null;
  cv.addEventListener("pointerdown", function (e) { start = { x: e.clientX, y: e.clientY }; cv.focus({ preventScroll: true }); });
  cv.addEventListener("pointerup", function (e) {
    if (!start) return;
    var dx = e.clientX - start.x, dy = e.clientY - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) {
      press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
      return;
    }
    var r = cv.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    if (scene === Memory && Memory.tap(x, y)) return;
    if (scene === Menu) {
      var i = Math.round((y - 130) / 64);
      if (i >= 0 && i < Menu.items().length) { Menu.i = i; press("a"); return; }
    }
    press("a");
  });

  // ---------- loop ----------
  var raf = null, last = 0;
  function frame(t) {
    var dt = last ? Math.min(100, t - last) : 16;
    last = t;
    if (scene.update) scene.update(dt);
    scene.draw();
    raf = requestAnimationFrame(frame);
  }

  document.addEventListener("app:open", function (e) {
    if (e.detail !== "arcade") return;
    if (!scene) go(Menu);
    last = 0;
    if (document.fonts && document.fonts.load) document.fonts.load("32px VT323").catch(function () {});
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
    setTimeout(function () { cv.focus({ preventScroll: true }); }, 0);
  });
  document.addEventListener("app:close", function (e) {
    if (e.detail !== "arcade") return;
    cancelAnimationFrame(raf);
    raf = null;
    if (scene === Snake && Snake.state === "play") Snake.state = "ready"; // pause instead of losing
  });
})();
