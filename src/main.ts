import {
  ArcRotateCamera,
  Color4,
  DirectionalLight,
  Engine,
  FollowCamera,
  HemisphericLight,
  Scene,
  Vector3,
} from "@babylonjs/core";
import "./style.css";
import { DrivingInput } from "./input/DrivingInput";
import { createEnvironment } from "./scene/createEnvironment";
import { setupTouchControls } from "./ui/TouchControls";
import { TrainingVehicle } from "./vehicle/TrainingVehicle";

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

function resetVehicle(): void {
  vehicle.reset();
  input.clear(); // reset must also drop any active input state
}

// Edge-triggered keyboard shortcuts (held movement keys live in DrivingInput).
window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.code === "KeyC") toggleCamera();
  if (event.code === "KeyR") resetVehicle();
});

setupTouchControls(input, { onToggleCamera: toggleCamera, onReset: resetVehicle });

const speedElement = document.querySelector<HTMLElement>("#speed");
engine.runRenderLoop(() => {
  // Clamp dt so a backgrounded tab regaining focus can't teleport the car.
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
  vehicle.update(input.read(), dt);
  if (speedElement) speedElement.textContent = `${Math.round(vehicle.speedMph)} mph`;
  scene.render();
});

window.addEventListener("resize", () => engine.resize());
