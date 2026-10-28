const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { io } = require("socket.io-client");
const { server, io: serverIO } = require("../server");
let url;
const { before, after } = require("node:test");
before(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  url = "http://127.0.0.1:" + server.address().port;
});
after(() => new Promise((r) => serverIO.close(r)));

const ack = (s, e, d = {}) =>
  new Promise((res, rej) =>
    s.timeout(3000).emit(e, d, (err, r) => (err ? rej(err) : res(r))),
  );
const travel = (s, id, x, y) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      s.off("state", step);
      reject(Error("Travel timeout"));
    }, 10000);
    function step(v) {
      const p = v.players.find((p) => p.id === id),
        dx = x - p.x,
        dy = y - p.y;
      if (Math.hypot(dx, dy) < 9) {
        s.emit("input", { x: 0, y: 0 });
        s.off("state", step);
        clearTimeout(timer);
        resolve(v);
      } else
        s.emit("input", {
          x: Math.abs(dx) > 6 ? Math.sign(dx) : 0,
          y: Math.abs(dy) > 6 ? Math.sign(dy) : 0,
        });
    }
    s.on("state", step);
  });
const wait = (s, pred) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      s.off("state", cb);
      reject(Error("State timeout"));
    }, 5000);
    function cb(v) {
      if (pred(v)) {
        clearTimeout(timer);
        s.off("state", cb);
        resolve(v);
      }
    }
    s.on("state", cb);
  });
test("two independent real Socket.IO clients synchronize and reject cheating", async () => {
  const a = io(url, { forceNew: true, transports: ["websocket"] }),
    b = io(url, { forceNew: true, transports: ["websocket"] });
  try {
    await Promise.all([
      new Promise((r, j) => {
        a.on("connect", r);
        a.on("connect_error", j);
      }),
      new Promise((r, j) => {
        b.on("connect", r);
        b.on("connect_error", j);
      }),
    ]);
    const created = await ack(a, "enter", { create: true, name: "Network A" });
    assert(created.code);
    const joined = await ack(b, "enter", {
      code: created.code,
      name: "Network B",
    });
    assert.equal(joined.code, created.code);
    assert((await ack(b, "start")).error);
    const states = Promise.all([
      wait(a, (s) => s.phase === "playing"),
      wait(b, (s) => s.phase === "playing"),
    ]);
    assert((await ack(a, "start")).ok);
    const [sa, sb] = await states;
    assert.equal(sa.players.length, 2);
    assert.equal(sa.remaining, sb.remaining);
    assert(sa.contract);
    assert(sa.players.every((p) => !p.contract));
    assert(sb.players.every((p) => !p.contract));
    const before = sa.players.find((p) => p.id === a.id).x;
    const moving = wait(
      b,
      (s) => s.players.find((p) => p.id === a.id).x > before + 15,
    );
    a.emit("input", { x: 10000, y: 0, score: 99999 });
    await moving;
    a.emit("input", { x: 0, y: 0 });
    const stopped = await wait(
      a,
      (s) => s.players.find((p) => p.id === a.id).x > before + 15,
    );
    assert.equal(stopped.players.find((p) => p.id === a.id).score, 0);
    assert((await ack(a, "action", { type: "extract", score: 999999 })).error);
    await travel(a, a.id, 110, 110);
    await travel(a, a.id, 355, 110);
    assert((await ack(a, "action", { type: "grab" })).ok);
    const loaded = await wait(
      b,
      (s) => s.players.find((p) => p.id === a.id).bag.length === 1,
    );
    assert.equal(loaded.cores.length, 19);
    await travel(a, a.id, 110, 110);
    await travel(a, a.id, 75, 320);
    assert((await ack(a, "action", { type: "cross" })).ok);
    assert((await ack(a, "action", { type: "cross" })).error);
    const cross = await wait(
      b,
      (s) => s.players.find((p) => p.id === a.id).used,
    );
    assert(cross.events.some((e) => e.includes("DOUBLE CROSS")));
    assert((await ack(a, "action", { type: "extract" })).ok);
    const banking = await wait(
      b,
      (s) => s.players.find((p) => p.id === a.id).extraction > 0,
    );
    assert(
      banking.players.find((p) => p.id === a.id).extraction >
        banking.serverTime,
    );
    const banked = await wait(
      b,
      (s) => s.players.find((p) => p.id === a.id).escaped,
    );
    const paid = banked.players.find((p) => p.id === a.id);
    assert([200, 500].includes(paid.score));
    assert.equal(paid.bag.length, 0);
    const departing = a.id;
    const gone = wait(
      b,
      (s) => !s.players.find((p) => p.id === departing).connected,
    );
    a.disconnect();
    await gone;
    console.log(
      "Verified room " +
        created.code +
        ": two WebSockets, identical clock, movement replication, private payloads, pickup replication, extraction countdown, 2× payout and escape, score rejection, one-shot betrayal, disconnect survival.",
    );
  } finally {
    a.disconnect();
    b.disconnect();
  }
});
