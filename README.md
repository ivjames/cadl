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
- `S` / `Arrow Down`: brake to a stop
- `A` / `Arrow Left`: steer left
- `D` / `Arrow Right`: steer right
- `Z` / `,`: signal left · `X` / `.`: signal right (auto-cancels after the turn)
- `C`: switch camera (follow ↔ overview)
- `R`: reset / restart the current lesson
- `L`: next lesson

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
  rules/roadGrid.ts           pure city-grid layout (roads, intersections, approaches)
  rules/speedZones.ts         pure speed-limit zones + lookup
  rules/stopControls.ts       stop-control detection, generated from the road grid
  lessons/scoring.ts          pure driving coach: grades violations + achievements
  lessons/lessons.ts          data-driven California lesson definitions
  lessons/LessonRunner.ts     runs a lesson over the coach; tracks objectives + pass/fail
  scene/createEnvironment.ts  roads, markings, curbs, sidewalks, scenery, traffic signs
  ui/TouchControls.ts         pointer-event wiring for the on-screen controls
  style.css                   mobile-first control layout + HUD
```

Everything under `rules/`, `lessons/`, and `vehicle/driving.ts`/`signals.ts` is
Babylon/DOM-free, so the traffic-rule, scoring, and lesson logic is unit-tested
without a renderer. `main.ts` feeds a per-frame `DrivingSample` into the active
`LessonRunner`, which grades it and drives the HUD.

## Lessons

Cycle lessons with the **Lesson ▸** button (or `L`). Each shows its objectives,
a live score, and a pass/fail result:

- **Free Drive** — open scorecard (stops, speed, signalling).
- **Stop & Go** — make a full stop at the limit line.
- **Signal Your Turn** — signal, then complete a turn.
- **Full Intersection** — stop, then signal and turn, without speeding.

Rule/behaviour logic (`vehicle/driving.ts`) is deliberately free of Babylon.js
so it can be unit tested without a renderer:

```bash
npm test
```

The next milestones — scenario JSON, stop-sign/stop-line detection, turn
signals, speed zones, violation scoring, and eventually WebXR — build on this
separation of rendering from rule logic.
