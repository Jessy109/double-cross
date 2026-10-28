const crypto = require("node:crypto");
const W = 960,
  H = 640,
  SPEED = 185,
  DURATION = 180000;
const walls = [
  { x: 230, y: 150, w: 65, h: 140 },
  { x: 665, y: 150, w: 65, h: 140 },
  { x: 230, y: 390, w: 65, h: 100 },
  { x: 665, y: 390, w: 65, h: 100 },
  { x: 410, y: 260, w: 140, h: 35 },
];
const zones = [
  { x: 75, y: 320 },
  { x: 885, y: 320 },
];
const contracts = [
  {
    name: "Heavy Lifter",
    text: "Extract 4 cores. Bonus: 300",
    kind: "cores",
    goal: 4,
  },
  {
    name: "Repeat Customer",
    text: "Complete 2 extractions. Bonus: 300",
    kind: "runs",
    goal: 2,
  },
  {
    name: "Turncoat",
    text: "Extract during Double Cross. Bonus: 300",
    kind: "betray",
    goal: 1,
  },
];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
class Room {
  constructor(code, now = Date.now()) {
    this.code = code;
    this.phase = "lobby";
    this.players = [];
    this.cores = [];
    this.created = now;
    this.last = now;
    this.events = [];
  }
  add(id, name) {
    if (this.phase !== "lobby")
      throw Error("Match already started. Join the next round.");
    if (this.players.length >= 4) throw Error("Room is full (4 players).");
    const p = {
      id,
      name: String(name || "Runner")
        .replace(/[<>]/g, "")
        .slice(0, 18),
      connected: true,
    };
    this.players.push(p);
    return p;
  }
  start(id, now = Date.now()) {
    if (id !== this.players.find((p) => p.connected)?.id)
      throw Error("Only the host can start.");
    if (this.phase === "playing") throw Error("Match is already running.");
    if (this.players.filter((p) => p.connected).length < 2)
      throw Error("Two connected players are required.");
    this.players = this.players.filter((p) => p.connected);
    this.phase = "playing";
    this.winners = [];
    this.end = now + DURATION;
    this.last = now;
    this.cores = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: 355 + (i % 5) * 62,
      y: 110 + Math.floor(i / 5) * 125,
      held: null,
    }));
    this.players.forEach((p, i) =>
      Object.assign(p, {
        x: i % 2 ? 850 : 110,
        y: 240 + Math.floor(i / 2) * 150,
        bag: [],
        score: 0,
        cores: 0,
        runs: 0,
        betray: 0,
        used: false,
        escaped: false,
        cross: 0,
        extraction: 0,
        stun: 0,
        cooldown: 0,
        input: { x: 0, y: 0 },
        contract: { ...contracts[crypto.randomInt(contracts.length)] },
        bonus: false,
      }),
    );
    this.events = [];
  }
  say(s) {
    this.events.unshift(s);
    this.events = this.events.slice(0, 4);
  }
  action(p, type, now = Date.now()) {
    if (
      this.phase !== "playing" ||
      now >= this.end ||
      !p.connected ||
      p.escaped ||
      now < p.stun
    )
      return;
    if (type === "cross") {
      if (p.used) throw Error("Double Cross has already been used.");
      p.used = true;
      p.extraction = 0;
      p.cross = now + 15000;
      this.say(p.name + " activated DOUBLE CROSS!");
      return;
    }
    if (now < p.cooldown) return;
    if (type === "drop") {
      const c = this.cores.find((c) => c.id === p.bag.pop());
      if (c) {
        Object.assign(c, { held: null, x: p.x, y: p.y });
        p.extraction = 0;
      }
      return;
    }
    if (type === "extract") {
      if (!p.bag.length) throw Error("Collect a core first.");
      if (!zones.some((z) => dist(z, p) < 62))
        throw Error("Stand inside an extraction zone.");
      p.extraction = now + (p.cross > now ? 4500 : 3000);
      return;
    }
    if (type === "grab") {
      if (p.bag.length >= 4) throw Error("Bag full. Extract or drop a core.");
      const c = this.cores.find((c) => c.held === null && dist(c, p) < 48);
      if (c) {
        c.held = p.id;
        p.bag.push(c.id);
        p.cooldown = now + 250;
        return;
      }
      const victim = this.players.find(
        (v) => v !== p && v.connected && v.bag.length && dist(v, p) < 48,
      );
      if (victim) {
        const n = victim.bag.pop();
        this.cores.find((c) => c.id === n).held = p.id;
        p.bag.push(n);
        victim.extraction = 0;
        p.cooldown = now + 1300;
        this.say(p.name + " stole a core from " + victim.name);
      } else throw Error("No core or loaded rival within reach.");
    }
  }
  tick(now = Date.now()) {
    if (this.phase !== "playing") return;
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.drones = [
      {
        x: 480 + Math.cos(now / 3000) * 270,
        y: 320 + Math.sin(now / 3000) * 190,
      },
      {
        x: 480 + Math.cos(now / 3900 + Math.PI) * 290,
        y: 320 + Math.sin(now / 3900 + Math.PI) * 190,
      },
    ];
    for (const p of this.players) {
      if (!p.connected || p.escaped) continue;
      const i = p.input || { x: 0, y: 0 },
        len = Math.hypot(i.x, i.y) || 1;
      const dx =
          (i.x / Math.max(1, len)) * SPEED * dt * (p.bag.length ? 0.82 : 1),
        dy = (i.y / Math.max(1, len)) * SPEED * dt * (p.bag.length ? 0.82 : 1);
      if (now >= p.stun && !p.extraction) {
        if (this.valid(p.x + dx, p.y)) p.x += dx;
        if (this.valid(p.x, p.y + dy)) p.y += dy;
      }
      if (now >= p.stun && this.drones.some((d) => dist(d, p) < 28)) {
        p.stun = now + 1800;
        p.extraction = 0;
        for (const n of p.bag) {
          const c = this.cores.find((c) => c.id === n);
          Object.assign(c, {
            held: null,
            x: p.x + Math.random() * 28 - 14,
            y: p.y + Math.random() * 28 - 14,
          });
        }
        p.bag = [];
        this.say(p.name + " was hit by security.");
      }
      if (p.extraction && p.extraction <= this.end && now >= p.extraction) {
        const count = p.bag.length,
          dc = p.cross > now;
        p.score += count * (dc ? 200 : 100);
        p.cores += count;
        p.runs++;
        if (dc) {
          p.betray++;
          p.escaped = true;
          p.input = { x: 0, y: 0 };
        }
        this.cores = this.cores.filter((c) => !p.bag.includes(c.id));
        p.bag = [];
        p.extraction = 0;
        if (!p.bonus && p[p.contract.kind] >= p.contract.goal) {
          p.bonus = true;
          p.score += 300;
        }
        this.say(p.name + " banked " + count + " cores" + (dc ? " ×2!" : "."));
      }
    }
    if (now >= this.end) {
      this.phase = "ended";
      const best = Math.max(...this.players.map((p) => p.score));
      this.winners = this.players
        .filter((p) => p.score === best)
        .map((p) => p.id);
      this.say("Vault sealed. Unbanked cores are lost.");
    }
  }
  valid(x, y) {
    return (
      x >= 18 &&
      y >= 18 &&
      x <= W - 18 &&
      y <= H - 18 &&
      !walls.some(
        (w) =>
          x > w.x - 15 &&
          x < w.x + w.w + 15 &&
          y > w.y - 15 &&
          y < w.y + w.h + 15,
      )
    );
  }
  disconnect(p) {
    p.connected = false;
    p.input = { x: 0, y: 0 };
    p.extraction = 0;
    for (const n of p.bag || []) {
      const c = this.cores.find((c) => c.id === n);
      if (c) Object.assign(c, { held: null, x: p.x, y: p.y });
    }
    p.bag = [];
    if (this.phase === "lobby")
      this.players = this.players.filter((v) => v !== p);
  }
  view(id, now = Date.now()) {
    return {
      code: this.code,
      phase: this.phase,
      winners: this.winners || [],
      host: this.players.find((p) => p.connected)?.id,
      remaining: Math.max(0, (this.end || now) - now),
      walls,
      zones,
      drones: this.drones || [],
      cores: this.cores.filter((c) => c.held === null),
      events: this.events,
      players: this.players.map(({ contract, input, ...p }) => p),
      contract: this.players.find((p) => p.id === id)?.contract,
      serverTime: now,
    };
  }
}
module.exports = { Room };
