// Deep imports (not the "@babylonjs/core" barrel) so Rollup only bundles the
// engine pieces we actually use — smaller output and a faster build.
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { FollowCamera } from "@babylonjs/core/Cameras/followCamera";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import "./style.css";
import { DrivingInput } from "./input/DrivingInput";
import { createEnvironment } from "./scene/createEnvironment";
import { setupTouchControls } from "./ui/TouchControls";
import { TrainingVehicle } from "./vehicle/TrainingVehicle";
import {
  type SignalDirection,
  type SignalState,
  initialSignalState,
  setSignal,
  updateSignal,
} from "./vehicle/signals";
import { isOverLimit, speedLimitAt } from "./rules/speedZones";
import { stopSignAhead } from "./rules/stopControls";

const canvas = document.querySelector<HTMLCanvasElement>("#renderCanvas");
if (!canvas) throw new Error("Render canvas was not found.");

const engine = new Engine(canvas, true, { adaptToDeviceRatio: true, stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.55, 0.75, 0.92, 1);

new HemisphericLight("ambientLight", new Vector3(0, 1, 0), scene).intensity = 0.85;
new DirectionalLight("sunLight", new Vector3(-0.4, -1, 0.3), scene).intensity = 0.8;

createEnvironment(scene);
const vehicle = new TrainingVehicle(scene);

// --- Cameras: chase (follow) and overview, both tracking the vehicle root ---
const followCamera = new FollowCamera("followCamera", new Vector3(0, 5, -10), scene);
followCamera.lockedTarget = vehicle.root;
followCamera.radius = 12;
followCamera.heightOffset = 4.5;
followCamera.rotationOffset = 180;
followCamera.cameraAcceleration = 0.09;
followCamera.maxCameraSpeed = 24;

const overviewCamera = new ArcRotateCamera(
  "overviewCamera",
  -Math.PI / 2,
  Math.PI / 3,
  34,
  vehicle.position,
  scene,
);
overviewCamera.lockedTarget = vehicle.root;

scene.activeCamera = followCamera;

function toggleCamera(): void {
  scene.activeCamera = scene.activeCamera === followCamera ? overviewCamera : followCamera;
}

const input = new DrivingInput();
input.attach(window);

let signal: SignalState = initialSignalState();
function toggleSignal(direction: SignalDirection): void {
  signal = setSignal(signal, direction);
}

function resetVehicle(): void {
  vehicle.reset();
  input.clear(); // reset must also drop any active input state
  signal = initialSignalState();
}

// Edge-triggered keyboard shortcuts (held movement keys live in DrivingInput).
window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.code === "KeyC") toggleCamera();
  if (event.code === "KeyR") resetVehicle();
  if (event.code === "KeyZ" || event.code === "Comma") toggleSignal("left");
  if (event.code === "KeyX" || event.code === "Period") toggleSignal("right");
});

setupTouchControls(input, {
  onToggleCamera: toggleCamera,
  onReset: resetVehicle,
  onSignalLeft: () => toggleSignal("left"),
  onSignalRight: () => toggleSignal("right"),
});

// HUD element handles.
const speedElement = document.querySelector<HTMLElement>("#speed");
const gearElement = document.querySelector<HTMLElement>("#gear");
const limitElement = document.querySelector<HTMLElement>("#speedLimit");
const zoneElement = document.querySelector<HTMLElement>("#zoneLabel");
const stopCueElement = document.querySelector<HTMLElement>("#stopCue");
const indLeft = document.querySelector<HTMLElement>("#indLeft");
const indRight = document.querySelector<HTMLElement>("#indRight");
const signalLeftButton = document.querySelector<HTMLElement>("#signalLeft");
const signalRightButton = document.querySelector<HTMLElement>("#signalRight");

let blinkOn = false;
let blinkTimer = 0;

engine.runRenderLoop(() => {
  // Clamp dt so a backgrounded tab regaining focus can't teleport the car.
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
  const drive = input.read();

  const headingBefore = vehicle.pose.heading;
  vehicle.update(drive, dt);
  const pose = vehicle.pose;

  // Turn signals: advance the state machine, then run the blink timer.
  signal = updateSignal(signal, pose.heading - headingBefore, drive.steer);
  blinkTimer += dt;
  if (blinkTimer >= 0.45) {
    blinkOn = !blinkOn;
    blinkTimer = 0;
  }
  const lit = signal.active !== null && blinkOn;
  vehicle.setBlinkers(signal.active, lit);

  // HUD.
  const limit = speedLimitAt(pose.x, pose.z);
  const speedMph = Math.round(pose.speedMph);
  if (speedElement) {
    speedElement.textContent = `${speedMph} mph`;
    speedElement.classList.toggle("over-limit", isOverLimit(pose.speedMph, limit.limitMph));
  }
  if (gearElement) {
    gearElement.textContent = pose.speed > 0.1 ? "D" : pose.speed < -0.1 ? "R" : "N";
  }
  if (limitElement) limitElement.textContent = String(limit.limitMph);
  if (zoneElement) zoneElement.textContent = limit.zone ?? "";

  const stop = stopSignAhead(pose.x, pose.z, pose.heading);
  if (stopCueElement) {
    if (stop) {
      stopCueElement.textContent = `◈ STOP AHEAD · ${Math.round(stop.distance)} m`;
      stopCueElement.hidden = false;
    } else {
      stopCueElement.hidden = true;
    }
  }

  // HUD chevrons + buttons blink via CSS; drive them by the signal state only.
  indLeft?.classList.toggle("on", signal.active === "left");
  indRight?.classList.toggle("on", signal.active === "right");
  signalLeftButton?.classList.toggle("on", signal.active === "left");
  signalRightButton?.classList.toggle("on", signal.active === "right");

  scene.render();
});

window.addEventListener("resize", () => engine.resize());
