const express = require("express"),
  http = require("http"),
  { Server } = require("socket.io"),
  { Room } = require("./game"),
  crypto = require("node:crypto");
const app = express(),
  server = http.createServer(app),
  io = new Server(server, { maxHttpBufferSize: 4096 });
const rooms = new Map();
app.use(express.static("public"));
app.get("/vendor/phaser.js", (_, res) =>
  res.sendFile(
    require("node:path").join(
      __dirname,
      "node_modules/phaser/dist/phaser.min.js",
    ),
  ),
);
app.get("/health", (_, r) => r.json({ ok: true }));
io.on("connection", (s) => {
  let room,
    p,
    last = 0,
    budget = 0;
  const safe =
    (fn) =>
    (data = {}, ack = () => {}) => {
      try {
        const now = Date.now();
        if (now - last > 1000) {
          last = now;
          budget = 0;
        }
        if (++budget > 90) throw Error("Too many requests.");
        fn(data, ack);
      } catch (e) {
        if (typeof ack === "function") ack({ error: e.message });
      }
    };
  s.on(
    "enter",
    safe((d, ack) => {
      if (room) throw Error("Already in a room. Refresh to leave.");
      let r;
      if (d.create) {
        if (rooms.size >= 1000)
          throw Error("Server is busy. Try again shortly.");
        let code;
        do {
          code = crypto.randomBytes(3).toString("hex").toUpperCase();
        } while (rooms.has(code));
        r = new Room(code);
        rooms.set(code, r);
      } else {
        r = rooms.get(
          String(d.code || "")
            .trim()
            .toUpperCase(),
        );
        if (!r) throw Error("Room not found. Check the six-character code.");
      }
      const player = r.add(s.id, d.name);
      room = r;
      p = player;
      s.join(room.code);
      ack({ id: s.id, code: room.code });
    }),
  );
  s.on(
    "start",
    safe((_, ack) => {
      if (!room) throw Error("Join a room first.");
      room.start(s.id);
      ack({ ok: true });
    }),
  );
  s.on(
    "input",
    safe((d) => {
      if (!p) return;
      const x = Number(d.x),
        y = Number(d.y);
      if (Number.isFinite(x) && Number.isFinite(y))
        p.input = {
          x: Math.max(-1, Math.min(1, x)),
          y: Math.max(-1, Math.min(1, y)),
        };
    }),
  );
  s.on(
    "action",
    safe((d, ack) => {
      if (!room) throw Error("Join a room first.");
      room.action(p, d.type);
      ack({ ok: true });
    }),
  );
  s.on("disconnect", () => {
    if (room) room.disconnect(p);
  });
});
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    r.tick(now);
    for (const p of r.players)
      if (p.connected) io.to(p.id).emit("state", r.view(p.id, now));
    if (!r.players.some((p) => p.connected)) rooms.delete(code);
  }
}, 50).unref();
const port =
  Number(
    process.env.PORT || process.argv[process.argv.indexOf("--port") + 1],
  ) || 3000;
if (require.main === module)
  server.listen(port, "0.0.0.0", () => console.log("DOUBLE CROSS on " + port));
module.exports = { server, io };
