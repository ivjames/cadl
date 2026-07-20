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
- `C`: switch camera (follow ↔ overview)
- `R`: reset to spawn

Touch (iPad Safari, landscape-first): on-screen steering (bottom-left), gas +
brake (bottom-right), and camera/reset (top-right). Steering and a pedal can be
held together; controls release cleanly when a finger lifts or slides off.

## Architecture

```text
src/
  main.ts                     app bootstrap (engine, cameras, render loop)
  input/DrivingInput.ts       keyboard + touch -> unified DriveInput
  vehicle/driving.ts          pure, testable arcade driving model (no Babylon)
  vehicle/TrainingVehicle.ts  procedural car meshes driven by that model
  scene/createEnvironment.ts  roads, markings, curbs, sidewalks, blockout scenery
  ui/TouchControls.ts         pointer-event wiring for the on-screen controls
  style.css                   mobile-first control layout
```

Rule/behaviour logic (`vehicle/driving.ts`) is deliberately free of Babylon.js
so it can be unit tested without a renderer:

```bash
npm test
```

The next milestones — scenario JSON, stop-sign/stop-line detection, turn
signals, speed zones, violation scoring, and eventually WebXR — build on this
separation of rendering from rule logic.
