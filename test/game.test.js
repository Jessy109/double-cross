const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { Room } = require("../game");
function setup() {
  const r = new Room("ABC123", 1000),
    a = r.add("a", "Alpha"),
    b = r.add("b", "Beta");
  r.start("a", 1000);
  r.drones = [];
  return { r, a, b };
}
test("host gate, minimum, four-player limit and locked active rooms", () => {
  const r = new Room("ROOM");
  r.add("a", "a");
  assert.throws(() => r.start("a"));
  r.add("b", "b");
  assert.throws(() => r.start("b"));
  r.add("c", "c");
  r.add("d", "d");
  assert.throws(() => r.add("e", "e"));
  r.start("a");
  assert.throws(() => r.add("e", "e"));
});
test("private contracts never enter public player records", () => {
  const { r, a, b } = setup();
  a.contract = { name: "SECRET ALPHA", kind: "cores", goal: 4 };
  b.contract = { name: "SECRET BETA", kind: "cores", goal: 4 };
  const va = r.view("a"),
    vb = r.view("b");
  assert.equal(va.contract.name, "SECRET ALPHA");
  assert(!JSON.stringify(va).includes("SECRET BETA"));
  assert(!JSON.stringify(vb).includes("SECRET ALPHA"));
  assert(va.players.every((p) => !("contract" in p)));
});
test("single ownership, carry limit, drops and steal interrupt extraction", () => {
  const { r, a, b } = setup();
  a.x = b.x = 355;
  a.y = b.y = 110;
  r.action(a, "grab", 1100);
  r.action(b, "grab", 1100);
  assert.equal(a.bag.length, 0);
  assert.equal(b.bag.length, 1);
  assert.equal(r.cores[0].held, "b");
  b.extraction = 9000;
  r.action(a, "grab", 2500);
  assert.equal(b.extraction, 0);
  r.action(a, "drop", 4000);
  assert.equal(r.cores[0].held, null);
  assert.equal(a.bag.length, 0);
  a.bag = [1, 2, 3, 4];
  assert.throws(() => r.action(a, "grab", 5000));
});
test("movement clamps time step and obeys obstacles and bounds", () => {
  const { r, a } = setup();
  a.x = 200;
  a.y = 200;
  a.input = { x: 1, y: 0 };
  for (let t = 1050; t < 3050; t += 50) r.tick(t);
  assert(a.x <= 215);
  a.x = 19;
  a.input = { x: -1, y: 0 };
  r.tick(999999);
  assert(a.x >= 18);
});
test("extract scores once; Double Cross resets countdown and locks escape", () => {
  const { r, a } = setup();
  a.x = 75;
  a.y = 320;
  r.cores[0].held = "a";
  a.bag = [0];
  a.contract = { kind: "betray", goal: 1 };
  r.action(a, "extract", 1100);
  r.action(a, "cross", 2000);
  assert.equal(a.extraction, 0);
  r.action(a, "extract", 2100);
  assert.equal(a.extraction, 6600);
  r.tick(6500);
  assert.equal(a.score, 0);
  r.tick(6601);
  assert.equal(a.score, 500);
  assert(a.escaped);
  assert(a.bonus);
  r.tick(6700);
  assert.equal(a.score, 500);
  assert.throws(() => {
    a.escaped = false;
    r.action(a, "cross", 6800);
  });
});
test("normal extraction, contract payout, timer victory and rematch reset", () => {
  const { r, a } = setup();
  a.x = 75;
  a.y = 320;
  a.bag = [0];
  r.cores[0].held = "a";
  a.contract = { kind: "cores", goal: 1 };
  r.action(a, "extract", 1100);
  r.tick(4101);
  assert.equal(a.score, 400);
  assert.equal(a.bag.length, 0);
  r.tick(181001);
  assert.equal(r.phase, "ended");
  assert.deepEqual(r.winners, ["a"]);
  r.action(a, "cross", 181002);
  assert.equal(a.used, false);
  r.start("a", 190000);
  assert.equal(a.score, 0);
  assert.equal(r.cores.length, 20);
  assert.equal(r.phase, "playing");
});
test("drone collision drops inventory; disconnect preserves room and transfers host", () => {
  const { r, a, b } = setup();
  const now = 5000;
  const x = 480 + Math.cos(now / 3000) * 270,
    y = 320 + Math.sin(now / 3000) * 190;
  a.x = x;
  a.y = y;
  a.bag = [0];
  r.cores[0].held = "a";
  r.tick(now);
  assert.equal(a.bag.length, 0);
  assert(a.stun > now);
  assert.equal(r.cores[0].held, null);
  r.disconnect(a);
  assert.equal(r.view("b").host, "b");
  r.phase = "ended";
  assert.throws(() => r.start("b"));
  assert(b.connected);
});

test("extraction cannot award credits past the match deadline", () => {
  const { r, a } = setup();
  a.x = 75;
  a.y = 320;
  a.bag = [0];
  r.cores[0].held = "a";
  r.action(a, "extract", r.end - 2000);
  r.tick(r.end + 2000);
  assert.equal(a.score, 0);
  assert.equal(r.phase, "ended");
});
