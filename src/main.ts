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
import { TrafficView } from "./scene/TrafficView";
import { createTraffic, leadGapFor, stepTraffic } from "./traffic/traffic";
import { PedestrianView } from "./scene/PedestrianView";
import { createPedestrians, pedestrianHazard, stepPedestrians } from "./pedestrians/pedestrians";
import { ParkingBayView } from "./scene/ParkingBayView";
import { isParked } from "./rules/parking";
import { setupTouchControls } from "./ui/TouchControls";
import { setupSteeringWheel } from "./ui/SteeringWheel";
import { TrainingVehicle } from "./vehicle/TrainingVehicle";
import {
  type SignalDirection,
  type SignalState,
  initialSignalState,
  setSignal,
  updateSignal,
} from "./vehicle/signals";
import { WORLD } from "./rules/roadGrid";
import { isOverLimit, speedLimitAt } from "./rules/speedZones";
import { stopSignAhead } from "./rules/stopControls";
import { crossTrafficInJunction, intersectionAt } from "./rules/intersections";
import { LESSONS, PARKING_BAY } from "./lessons/lessons";
import { LessonRunner, type LessonStatus } from "./lessons/LessonRunner";

const canvas = document.querySelector<HTMLCanvasElement>("#renderCanvas");
if (!canvas) throw new Error("Render canvas was not found.");

const engine = new Engine(canvas, true, { adaptToDeviceRatio: true, stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.55, 0.75, 0.92, 1);

new HemisphericLight("ambientLight", new Vector3(0, 1, 0), scene).intensity = 0.85;
new DirectionalLight("sunLight", new Vector3(-0.4, -1, 0.3), scene).intensity = 0.8;

createEnvironment(scene);
const vehicle = new TrainingVehicle(scene);

let traffic = createTraffic();
const trafficView = new TrafficView(scene, traffic.length);
trafficView.sync(traffic);

let pedestrians = createPedestrians();
const pedestrianView = new PedestrianView(scene, pedestrians.length);
pedestrianView.sync(pedestrians);

// The parking bay is drawn once and shown only while a bay-based lesson runs.
const parkingBayView = new ParkingBayView(scene, PARKING_BAY);
function syncBayVisibility(): void {
  parkingBayView.setVisible(LESSONS[lessonIndex]?.bay !== undefined);
}

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

let lessonIndex = 0;
let runner = new LessonRunner(LESSONS[lessonIndex]!);

function resetVehicle(): void {
  vehicle.reset();
  input.clear(); // reset must also drop any active input state
  signal = initialSignalState();
  runner.reset();
  traffic = createTraffic();
  trafficView.sync(traffic);
  pedestrians = createPedestrians();
  pedestrianView.sync(pedestrians);
}

function loadLesson(index: number): void {
  lessonIndex = ((index % LESSONS.length) + LESSONS.length) % LESSONS.length;
  runner = new LessonRunner(LESSONS[lessonIndex]!);
  vehicle.reset();
  input.clear();
  signal = initialSignalState();
  renderLessonChrome();
  syncBayVisibility();
}

// Edge-triggered keyboard shortcuts (held movement keys live in DrivingInput).
window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.code === "KeyC") toggleCamera();
  if (event.code === "KeyR") resetVehicle();
  if (event.code === "KeyL") loadLesson(lessonIndex + 1);
  if (event.code === "KeyZ" || event.code === "Comma") toggleSignal("left");
  if (event.code === "KeyX" || event.code === "Period") toggleSignal("right");
});

setupTouchControls(input, {
  onToggleCamera: toggleCamera,
  onReset: resetVehicle,
  onSignalLeft: () => toggleSignal("left"),
  onSignalRight: () => toggleSignal("right"),
  onGear: () => input.toggleReverse(),
});
setupSteeringWheel(input);

// HUD element handles.
const speedElement = document.querySelector<HTMLElement>("#speed");
const gearElement = document.querySelector<HTMLElement>("#gear");
const gearButton = document.querySelector<HTMLElement>("#gearButton");
const limitElement = document.querySelector<HTMLElement>("#speedLimit");
const zoneElement = document.querySelector<HTMLElement>("#zoneLabel");
const stopCueElement = document.querySelector<HTMLElement>("#stopCue");
const indLeft = document.querySelector<HTMLElement>("#indLeft");
const indRight = document.querySelector<HTMLElement>("#indRight");
const signalLeftButton = document.querySelector<HTMLElement>("#signalLeft");
const signalRightButton = document.querySelector<HTMLElement>("#signalRight");
const coachScoreElement = document.querySelector<HTMLElement>("#coachScore");
const coachFlashElement = document.querySelector<HTMLElement>("#coachFlash");
const lessonTitleEl = document.querySelector<HTMLElement>("#lessonTitle");
const lessonInstructionEl = document.querySelector<HTMLElement>("#lessonInstruction");
const lessonObjectivesEl = document.querySelector<HTMLElement>("#lessonObjectives");
const lessonStatusEl = document.querySelector<HTMLElement>("#lessonStatus");
const lessonButton = document.querySelector<HTMLElement>("#lessonButton");
let flashTimer = 0;
let lastObjSig = "";
let lastStatus: LessonStatus | null = null;

function renderLessonChrome(): void {
  const lesson = LESSONS[lessonIndex]!;
  if (lessonTitleEl) lessonTitleEl.textContent = lesson.title;
  if (lessonInstructionEl) lessonInstructionEl.textContent = lesson.instruction;
}

lessonButton?.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  loadLesson(lessonIndex + 1);
});
renderLessonChrome();
syncBayVisibility();

let blinkOn = false;
let blinkTimer = 0;

// Dev-only inspection hook for headless smoke tests (stripped from prod builds).
if (import.meta.env.DEV) {
  (window as unknown as { __cadl: () => unknown }).__cadl = () => ({
    ...vehicle.pose,
    lesson: LESSONS[lessonIndex]?.id,
    status: runner.status,
    reverse: input.inReverse,
  });
}

engine.runRenderLoop(() => {
  // Clamp dt so a backgrounded tab regaining focus can't teleport the car.
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
  const drive = input.read();

  const headingBefore = vehicle.pose.heading;
  // Step traffic first (it yields to the player's current position), then feed
  // the cars in as dynamic obstacles so the player collides with them too.
  const before = vehicle.pose;
  traffic = stepTraffic(traffic, dt, { x: before.x, z: before.z, heading: before.heading });
  trafficView.sync(traffic);
  pedestrians = stepPedestrians(pedestrians, dt);
  pedestrianView.sync(pedestrians);
  const trafficRects = traffic.map((c) => ({ cx: c.x, cz: c.z, halfW: 1.3, halfD: 2.6 }));

  vehicle.update(drive, dt, trafficRects);
  const pose = vehicle.pose;

  // If the car wrapped across the world edge, jump the chase camera with it so
  // it doesn't fly across the whole map trying to catch up. (The overview cam
  // recomputes from its target each frame, so it needs no help.)
  const wrapDx = pose.x - before.x;
  const wrapDz = pose.z - before.z;
  if (Math.abs(wrapDx) > WORLD / 2) followCamera.position.x += wrapDx;
  if (Math.abs(wrapDz) > WORLD / 2) followCamera.position.z += wrapDz;

  // Turn signals: advance the state machine, then run the blink timer.
  signal = updateSignal(signal, pose.heading - headingBefore, drive.steer);
  blinkTimer += dt;
  if (blinkTimer >= 0.45) {
    blinkOn = !blinkOn;
    blinkTimer = 0;
  }
  const lit = signal.active !== null && blinkOn;
  vehicle.setBlinkers(signal.active, lit);

  // HUD + rule outputs.
  const limit = speedLimitAt(pose.x, pose.z);
  const over = isOverLimit(pose.speedMph, limit.limitMph);
  const stop = stopSignAhead(pose.x, pose.z, pose.heading);

  if (speedElement) {
    speedElement.textContent = `${Math.round(pose.speedMph)} mph`;
    speedElement.classList.toggle("over-limit", over);
  }
  // Gear indicators reflect the SELECTED gear (D/R), like a real shifter — the
  // HUD badge, the on-screen button label, and the button's active highlight.
  if (gearElement) gearElement.textContent = drive.reverse ? "R" : "D";
  if (gearButton) {
    gearButton.textContent = drive.reverse ? "R" : "D";
    gearButton.classList.toggle("reverse", drive.reverse);
  }
  if (limitElement) limitElement.textContent = String(limit.limitMph);
  if (zoneElement) zoneElement.textContent = limit.zone ?? "";
  if (stopCueElement) {
    if (stop) {
      stopCueElement.textContent = `◈ STOP AHEAD · ${Math.round(stop.distance)} m`;
      stopCueElement.hidden = false;
    } else {
      stopCueElement.hidden = true;
    }
  }

  // Lesson: grade the frame, then surface score, objectives, status, and a flash.
  const leadGap = leadGapFor(pose, traffic);
  const junction = intersectionAt(pose.x, pose.z);
  const crossTraffic = junction ? crossTrafficInJunction(traffic, junction, pose.heading) : false;
  const pedestrianAhead = pedestrianHazard(pose.x, pose.z, pose.heading, pedestrians);
  const bay = LESSONS[lessonIndex]?.bay;
  const parked = bay ? isParked(bay, pose.x, pose.z, pose.heading, pose.speedMph) : false;
  const event = runner.observe(
    {
      heading: pose.heading,
      speedMph: pose.speedMph,
      overLimit: over,
      signal: signal.active,
      stopAhead: stop,
      leadGap,
      junction,
      crossTraffic,
      pedestrianAhead,
      parked,
    },
    dt,
  );
  if (coachScoreElement) {
    coachScoreElement.textContent = String(runner.score);
    coachScoreElement.classList.toggle("warn", runner.score < 90 && runner.score >= 70);
    coachScoreElement.classList.toggle("bad", runner.score < 70);
  }
  if (lessonObjectivesEl) {
    const objectives = runner.objectives;
    const sig = `${lessonIndex}:${objectives.map((o) => (o.done ? "1" : "0")).join("")}`;
    if (sig !== lastObjSig) {
      lastObjSig = sig;
      lessonObjectivesEl.innerHTML = objectives
        .map((o) => `<div class="obj ${o.done ? "done" : ""}">${o.done ? "✓" : "○"} ${o.label}</div>`)
        .join("");
    }
  }
  if (lessonStatusEl) {
    const status = runner.status;
    if (status !== lastStatus) {
      lastStatus = status;
      if (status === "passed") {
        lessonStatusEl.textContent = "✓ Lesson passed";
        lessonStatusEl.className = "lesson-status passed";
        lessonStatusEl.hidden = false;
      } else if (status === "failed") {
        lessonStatusEl.textContent = `✗ ${runner.failReasonText ?? "Lesson failed"}`;
        lessonStatusEl.className = "lesson-status failed";
        lessonStatusEl.hidden = false;
      } else {
        lessonStatusEl.hidden = true;
      }
    }
  }
  if (coachFlashElement) {
    if (event) {
      const good = event.type === "achievement";
      coachFlashElement.textContent = `${good ? "✓" : "−"} ${event.message}`;
      coachFlashElement.classList.toggle("good", good);
      coachFlashElement.classList.add("show");
      flashTimer = 2.2;
    } else if (flashTimer > 0) {
      flashTimer -= dt;
      if (flashTimer <= 0) coachFlashElement.classList.remove("show");
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
