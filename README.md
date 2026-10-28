# DOUBLE CROSS

A playable 2–4 player private-room heist game. Phaser renders the arena; one authoritative Node.js/Socket.IO process owns each room. The browser sends input directions and action requests, never positions, inventory, Contracts, scores, or winner declarations.

## Run locally

Requires Node.js 22 or newer (Node 24 tested).

```sh
npm ci
npm start
```

Open http://localhost:3000 in two separate browser tabs or devices. For another device on your home network, use the server computer's LAN IP and port 3000, and allow inbound traffic on that port in its firewall. Both devices must reach the same server. Create a room, share the six-character code, join, and have the host start.

```sh
npm test
```

Tests start an isolated server on an ephemeral localhost port and connect two genuine independent Socket.IO clients. No running development server is required. `PORT` overrides the default 3000; platform `--port` is supported for previews. No secrets or database are required.

## How to play

- A match lasts three minutes. Highest banked credits win; tied leaders share victory.
- WASD or arrows move. On touch devices, use the directional pad and action buttons.
- E: pick up a core within 48 units, or steal one from a nearby loaded rival if no loose core is available. Bags hold four. Carrying slows movement by 18%.
- G: drop one core. Stealing interrupts the victim's extraction.
- F: inside a cyan extraction pad, begin a three-second countdown. Movement locks during extraction. Normal cores bank 100 each; the runner can collect more afterward.
- Q: once per match, activate Double Cross for 15 seconds. An extraction started in this window takes 4.5 seconds. If it completes before the window expires, each core banks 200 and the runner escapes permanently for that match. Starting Double Cross cancels any existing countdown. If the window expires first, extraction pays the normal rate and the runner remains in the arena.
- Red security drones stun runners for 1.8 seconds, spill their entire bag, and interrupt extraction. Rivals can steal during the countdown.
- Each player receives one randomly selected private Contract: extract four total cores, complete two extractions, or escape through Double Cross. Completing it awards 300 once.
- At zero, unbanked cores are lost. An extraction finishing after the deadline cannot score.
- The host can rematch. If the host disconnects, the first connected runner becomes host. Rematches require two connected runners.

## Deploy the frontend and server together

The frontend, Phaser bundle, Socket.IO client, and multiplayer server are served from the same origin. There is no separate frontend build and no CORS setup. Do not upload only `public/` to a static host: multiplayer needs the Node service.

A `render.yaml` blueprint and `Dockerfile` are included. No deployment has been performed, and no public game URL has been verified.

### Render dashboard

1. Extract this project and commit it to a Git repository in your own account, including `package-lock.json`.
2. In Render, create a **Web Service** and connect that repository, or create a Blueprint using `render.yaml`.
3. Select Node, build command `npm ci`, start command `npm start`, and health endpoint `/health`. Set `NODE_ENV=production`. Render supplies `PORT`; the app listens on `0.0.0.0`.
4. Keep exactly **one service instance**. The included blueprint chooses the free plan. Review the provider's current plan terms before deployment. Free services can sleep, and startup may take time.
5. Wait for deployment success. Open the actual HTTPS URL returned by Render, then `/health`; it must return `{"ok":true}`.
6. On two separate devices, open that exact URL. Create and join the same room. Confirm both show CONNECTED, both see movement, a pickup disappears for both, and an extraction changes both scoreboards.
7. Complete the desktop and mobile acceptance checks below before submitting the URL to a contest.

Official deployment references (checked October 27, 2026):
- https://render.com/docs/deploy-node-express-app
- https://render.com/docs/web-services
- https://render.com/docs/websocket
- https://render.com/docs/your-first-deploy

### Docker or another Node host

```sh
docker build -t double-cross .
docker run --rm -p 3000:3000 -e PORT=3000 double-cross
```

Use a host with persistent Node processes and WebSocket upgrades on the same HTTP port. Terminate HTTPS at the hosting proxy and forward `/socket.io/` including WebSocket Upgrade headers. Keep one instance. Docker packaging is provided but was not built in this environment.

## Verification evidence

- Nine automated tests passed in this environment.
- The real network test used two independent WebSockets in the same room, identical match clocks, movement replication, input clamping, Contract payload privacy, pickup replication, extraction countdown, Double Cross payout and escape, rejected forged scoring fields, once-only activation, and disconnect survival.
- Server rule tests cover room limits and host permissions, private Contracts, inventory ownership, stealing, drops, carry capacity, collision limits, drone spills, normal and Double Cross payouts, Contract bonuses, deadline scoring, server-selected winners, and rematch reset.
- Two Chrome tabs also created/joined the same room, started a synchronized match, and rendered the Phaser arena. Keyboard movement and the Double Cross control were exercised. Both browser clients reached the same tied result after the full three-minute timer, and the host rematch control was exercised. A missing Phaser bundle route found during testing was fixed and the arena was visually rechecked.
- Physical mobile browser testing and public deployment testing have not been performed. The available browser control does not expose mobile device emulation.

## Remaining acceptance checks

On desktop Chrome and a physical phone (Safari or Chrome), repeat:

1. Create a room on desktop; enter its code on the phone. Verify the room and player roster agree.
2. Start a match. Move from each device; the other must see it. On the phone, hold and release each directional button and confirm release stops movement. Check portrait and landscape for overlap and scrolling.
3. Race for the same core. Only one runner may own it. Use E/GRAB beside a loaded rival to steal; verify the victim's bag decreases.
4. Bank a core normally: visible three-second countdown, then +100 on both scoreboards. Repeat to complete a Contract where applicable.
5. Activate Double Cross once; see its announcement and violet signal on the other device. A second activation must fail. Bank within its window: visible 4.5-second countdown, +200 per core, and escaped runner removed from the arena.
6. Walk into a drone while carrying loot; verify stun and dropped cores. Steal from a runner extracting to interrupt them.
7. Wait for 0:00. Verify both show identical server-selected winner(s), unbanked loot adds nothing, and only the host can start a rematch.
8. Close one client during play. The other should continue, show the runner offline, and inherit host status. Invalid room codes, full rooms, and late joins should show useful errors.

## Architecture and limits

- `game.js`: authoritative rules, collision checks, 180-second match clock, randomized Contracts, atomic inventory changes, cooldowns, scoring, and winner IDs.
- `server.js`: Express assets/health route, Socket.IO handlers, 20 Hz server ticks, per-socket request limits, room cleanup, private per-player snapshots.
- `public/client.js`: Phaser rendering, DOM HUD, keyboard/touch intent, connection feedback.
- `public/style.css`: responsive neon interface; touch directional controls appear for coarse pointers.
- `test/`: deterministic rules tests and a real two-client network acceptance test.

Room state is in memory. Restarting, sleeping, or redeploying the server loses rooms. Disconnecting drops carried loot, cancels extraction, and leaves the runner's banked score on the scoreboard. There is no identity/session recovery; refresh and join a new lobby after a lost connection. Ended rematches remove disconnected runners. Empty rooms are cleaned up. There is no database, account system, matchmaking, chat, audio, or cross-instance synchronization. Room codes provide casual private access rather than strong authentication. Large public-scale deployment would need room allocation, global abuse limits, and persistent sessions. This version targets small groups of friends.
