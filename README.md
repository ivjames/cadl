# CADL

California Driver Learning is a browser-based 3D driver-training simulator.

## Live simulator

https://cadl.lab980.com

Served from the shared lab980 droplet (nginx + pm2 + certbot) off the compiled
Vite `dist/` build — see [`DEPLOY.md`](./DEPLOY.md). (It previously lived on
GitHub Pages at `/cadl/`; that is retired.)

## Stack

- TypeScript
- Vite
- Babylon.js
- Vitest

## Local development

```bash
npm install
npm run dev
```

## Controls

Desktop keyboard:

- `W` / `Arrow Up`: accelerate
- `S` / `Arrow Down`: brake, then reverse once stopped
- `A` / `Arrow Left`: steer left
- `D` / `Arrow Right`: steer right
- `Z` / `,`: signal left · `X` / `.`: signal right (auto-cancels after the turn)
- `C`: switch camera (follow ↔ overview)
- `R`: reset to spawn

Touch (iPad Safari, landscape-first): on-screen steering (bottom-left), gas +
brake (bottom-right), turn signals (bottom-centre), and camera/reset (top-right).
Steering and a pedal can be held together; controls release cleanly when a
finger lifts or slides off.

The HUD shows speed, gear (D/N/R), the posted speed limit (turns red over the
limit), the current zone (e.g. School Zone), a blinking turn-signal indicator,
and a "STOP AHEAD" cue when approaching a stop sign.

## Architecture

```text
src/
  main.ts                     app bootstrap (engine, cameras, render loop, HUD)
  input/DrivingInput.ts       keyboard + touch -> unified DriveInput
  vehicle/driving.ts          pure, testable arcade driving model (no Babylon)
  vehicle/signals.ts          pure turn-signal state machine w/ auto-cancel
  vehicle/TrainingVehicle.ts  procedural car meshes (incl. blinkers) driven by the model
  rules/speedZones.ts         pure speed-limit zones + lookup
  rules/stopControls.ts       pure stop-sign/limit-line geometry + "stop ahead" detection
  scene/createEnvironment.ts  roads, markings, curbs, sidewalks, scenery, traffic signs
  ui/TouchControls.ts         pointer-event wiring for the on-screen controls
  style.css                   mobile-first control layout + HUD
```

The `rules/` and `vehicle/driving.ts`/`signals.ts` modules are Babylon-free so
the traffic-rule and vehicle logic is unit-tested without a renderer — the
foundation the upcoming scenario/lesson/scoring layer will build on.

Rule/behaviour logic (`vehicle/driving.ts`) is deliberately free of Babylon.js
so it can be unit tested without a renderer:

```bash
npm test
```

The next milestones — scenario JSON, stop-sign/stop-line detection, turn
signals, speed zones, violation scoring, and eventually WebXR — build on this
separation of rendering from rule logic.
