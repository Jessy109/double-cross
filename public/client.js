const $ = (id) => document.getElementById(id),
  socket = io({ reconnectionAttempts: 5 });
let state,
  myId,
  game,
  keys = {},
  touch = { x: 0, y: 0 },
  errorTimer;
const colors = [0x6bf9e4, 0xffc66b, 0xb38aff, 0xff7caa];
function error(s) {
  $("error").textContent = s;
  $("error").style.display = "block";
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => ($("error").style.display = "none"), 5000);
}
function emit(event, data = {}) {
  socket.emit(event, data, (r) => {
    if (r?.error) error(r.error);
  });
}
socket.on("connect", () => {
  $("connection").textContent = "● CONNECTED";
  if (myId && myId !== socket.id) {
    error("Connection lost. Refresh and create a new room to play again.");
    $("connection").textContent = "● SESSION ENDED";
  }
});
socket.on("disconnect", () => {
  $("connection").textContent = "● DISCONNECTED";
  error("Connection lost. Attempting to reconnect…");
});
socket.on("connect_error", () =>
  error("Cannot reach the game server. Check your connection and try again."),
);
function enter(create) {
  if (!socket.connected)
    return error("Server unavailable. Wait for CONNECTED.");
  socket.emit(
    "enter",
    { create, name: $("name").value, code: $("code").value },
    (r) => {
      if (r.error) return error(r.error);
      myId = r.id;
      $("welcome").hidden = true;
      $("room").hidden = false;
      $("roomCode").textContent = r.code;
    },
  );
}
$("create").onclick = () => enter(true);
$("join").onclick = () => enter(false);
$("start").onclick = $("rematch").onclick = () => emit("start");
$("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(state.code);
    $("copy").textContent = "COPIED";
  } catch {
    error("Room code: " + state.code);
  }
};
document
  .querySelectorAll("[data-action]")
  .forEach(
    (b) => (b.onclick = () => emit("action", { type: b.dataset.action })),
  );
document.querySelectorAll("[data-move]").forEach((b) => {
  b.onpointerdown = (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    const [x, y] = b.dataset.move.split(",").map(Number);
    touch = { x, y };
  };
  b.onpointerup = b.onpointercancel = () => (touch = { x: 0, y: 0 });
});
window.onkeydown = (e) => {
  if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
  keys[e.key.toLowerCase()] = true;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key))
    e.preventDefault();
  if (!e.repeat && state?.phase === "playing") {
    const type = { e: "grab", g: "drop", f: "extract", q: "cross" }[
      e.key.toLowerCase()
    ];
    if (type) emit("action", { type });
  }
};
window.onkeyup = (e) => (keys[e.key.toLowerCase()] = false);
window.onblur = () => {
  keys = {};
  touch = { x: 0, y: 0 };
};
document.addEventListener("visibilitychange", () => {
  keys = {};
  touch = { x: 0, y: 0 };
});
setInterval(() => {
  if (state?.phase === "playing" && socket.connected)
    socket.emit("input", {
      x:
        touch.x +
        (!!keys.d || !!keys.arrowright) -
        (!!keys.a || !!keys.arrowleft),
      y:
        touch.y + (!!keys.s || !!keys.arrowdown) - (!!keys.w || !!keys.arrowup),
    });
}, 50);
function rows(node, players) {
  node.replaceChildren(
    ...players.map((p) => {
      const row = document.createElement("div");
      row.className = "score-row";
      const name = document.createElement("span");
      name.textContent =
        p.name +
        (p.id === myId ? " (you)" : "") +
        (!p.connected ? " · offline" : "");
      const score = document.createElement("b");
      score.textContent = p.score || 0;
      row.append(name, score);
      return row;
    }),
  );
}
socket.on("state", (s) => {
  state = s;
  if (!myId) return;
  $("roomCode").textContent = s.code;
  const seconds = s.phase === "lobby" ? 180 : Math.ceil(s.remaining / 1000);
  $("timer").textContent =
    Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0") +
    ":" +
    (seconds % 60).toString().padStart(2, "0");
  $("lobby").hidden = s.phase !== "lobby";
  $("play").hidden = s.phase !== "playing";
  $("results").hidden = s.phase !== "ended";
  $("start").disabled = s.host !== myId || s.players.length < 2;
  $("start").textContent =
    s.host === myId ? "START THE HEIST ↗" : "WAITING FOR HOST";
  $("rematch").disabled = s.host !== myId;
  $("rematch").textContent =
    s.host === myId ? "REMATCH ↻" : "WAITING FOR HOST TO REMATCH";
  if (s.phase === "lobby") {
    $("crew").replaceChildren(
      ...s.players.map((p, i) => {
        const d = document.createElement("div");
        d.className = "crew-member";
        d.textContent = p.name + (i === 0 ? " · HOST" : " · READY");
        return d;
      }),
    );
    return;
  }
  const me = s.players.find((p) => p.id === myId);
  if (!me) return;
  $("contractTitle").textContent = s.contract.name;
  $("contract").textContent = s.contract.text;
  $("contractProgress").textContent = me.bonus
    ? "CONTRACT COMPLETE · +300"
    : Math.min(me[s.contract.kind], s.contract.goal) + " / " + s.contract.goal;
  $("take").textContent = me.score.toLocaleString();
  $("bag").textContent =
    "BAG " +
    me.bag.length +
    " / 4 · " +
    me.bag.length * (me.cross > s.serverTime ? 200 : 100) +
    " AT RISK";
  $("extraction").textContent = me.extraction
    ? "EXTRACTING · " +
      Math.max(0, (me.extraction - s.serverTime) / 1000).toFixed(1) +
      "s"
    : me.escaped
      ? "ESCAPED · SCORE LOCKED"
      : me.stun > s.serverTime
        ? "STUNNED"
        : me.cross > s.serverTime
          ? "DOUBLE CROSS · " +
            Math.ceil((me.cross - s.serverTime) / 1000) +
            "s"
          : "";
  $("cross").disabled = me.used;
  $("feed").replaceChildren(
    ...s.events.map((t) => {
      const d = document.createElement("div");
      d.textContent = "› " + t;
      return d;
    }),
  );
  const ranked = [...s.players].sort((a, b) => b.score - a.score);
  rows($("scores"), ranked);
  if (s.phase === "ended") {
    const top = ranked.filter((p) => s.winners.includes(p.id));
    $("winner").textContent =
      top.map((p) => p.name).join(" + ") +
      (top.length > 1 ? " TIE." : " WINS.");
    rows($("finalScores"), ranked);
  }
  if (!game && s.phase === "playing") boot();
});
function boot() {
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "arena",
    width: 960,
    height: 640,
    backgroundColor: "#0d121d",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: {
      create() {
        this.g = this.add.graphics();
        this.labels = [];
      },
      update(time) {
        if (!state || state.phase !== "playing") return;
        const g = this.g;
        g.clear();
        g.lineStyle(1, 0x1c2535);
        for (let x = 0; x < 960; x += 40) g.lineBetween(x, 0, x, 640);
        for (let y = 0; y < 640; y += 40) g.lineBetween(0, y, 960, y);
        g.lineStyle(3, 0x34435a);
        g.strokeRect(8, 8, 944, 624);
        g.fillStyle(0x493068, 0.15);
        g.fillRect(325, 75, 310, 490);
        g.lineStyle(1, 0x7654a0, 0.5);
        g.strokeRect(325, 75, 310, 490);
        for (const z of state.zones) {
          g.fillStyle(0x31e7cd, 0.08);
          g.fillCircle(z.x, z.y, 62);
          g.lineStyle(2, 0x6bf9e4, 0.8);
          g.strokeCircle(z.x, z.y, 56);
          g.lineStyle(1, 0x6bf9e4, 0.3);
          g.strokeCircle(z.x, z.y, 44 + Math.sin(time / 300) * 5);
        }
        for (const w of state.walls) {
          g.fillStyle(0x263447);
          g.fillRoundedRect(w.x, w.y, w.w, w.h, 7);
          g.lineStyle(2, 0x52617b);
          g.strokeRoundedRect(w.x, w.y, w.w, w.h, 7);
          g.fillStyle(0x8a63d2);
          g.fillRect(w.x + 8, w.y + 8, w.w - 16, 3);
        }
        for (const c of state.cores) {
          const pulse = 2 + Math.sin(time / 270 + c.id) * 2;
          g.fillStyle(0x64fbea, 0.1);
          g.fillCircle(c.x, c.y, 18 + pulse);
          g.fillStyle(0x6bf9e4);
          g.fillTriangle(
            c.x,
            c.y - 10 - pulse,
            c.x + 8,
            c.y,
            c.x,
            c.y + 10 + pulse,
          );
          g.fillStyle(0x9272f7);
          g.fillTriangle(
            c.x,
            c.y - 10 - pulse,
            c.x - 8,
            c.y,
            c.x,
            c.y + 10 + pulse,
          );
        }
        for (const d of state.drones) {
          g.fillStyle(0xff4c72, 0.09);
          g.fillCircle(d.x, d.y, 33);
          g.lineStyle(2, 0xff4c72);
          g.strokeCircle(d.x, d.y, 16);
          g.fillStyle(0xff4c72);
          g.fillRect(d.x - 7, d.y - 4, 14, 8);
          g.lineBetween(d.x - 23, d.y, d.x + 23, d.y);
        }
        this.labels.forEach((l) => l.destroy());
        this.labels = [];
        for (const [i, p] of state.players.entries()) {
          if (!p.connected || p.escaped) continue;
          const col = p.cross > state.serverTime ? 0xb378ff : colors[i];
          g.fillStyle(col, 0.12);
          g.fillCircle(p.x, p.y, 24);
          g.fillStyle(col);
          g.fillCircle(p.x, p.y, 13);
          g.fillStyle(0x111627);
          g.fillRoundedRect(p.x - 8, p.y - 5, 16, 7, 3);
          if (p.id === myId) {
            g.lineStyle(2, 0xffffff, 0.8);
            g.strokeCircle(p.x, p.y, 18);
          }
          if (p.extraction) {
            g.lineStyle(4, 0x6bf9e4);
            g.beginPath();
            g.arc(
              p.x,
              p.y,
              27,
              -Math.PI / 2,
              -Math.PI / 2 +
                Math.PI *
                  2 *
                  (1 -
                    Math.max(0, p.extraction - state.serverTime) /
                      (p.cross > state.serverTime ? 4500 : 3000)),
            );
            g.strokePath();
          }
          for (let j = 0; j < p.bag.length; j++) {
            g.fillStyle(0x6bf9e4);
            g.fillRect(p.x - 13 + j * 8, p.y + 22, 5, 5);
          }
          this.labels.push(
            this.add
              .text(p.x, p.y - 33, p.name, {
                fontFamily: "Arial",
                fontSize: "13px",
                color: "#e8e8ff",
                backgroundColor: "#10131ecc",
                padding: { x: 4, y: 2 },
              })
              .setOrigin(0.5),
          );
        }
        this.labels.push(
          this.add
            .text(480, 53, "VAULT 07", {
              fontSize: "13px",
              color: "#8c75b3",
              letterSpacing: 5,
            })
            .setOrigin(0.5),
        );
      },
    },
  });
}
