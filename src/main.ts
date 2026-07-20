import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  FollowCamera,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import "./style.css";

type InputState = {
  throttle: number;
  steering: number;
};

class TrainingVehicle {
  readonly mesh: Mesh;
  speedMetersPerSecond = 0;
  private heading = 0;

  constructor(scene: Scene) {
    this.mesh = MeshBuilder.CreateBox(
      "trainingVehicle",
      { width: 1.8, height: 0.9, depth: 4.2 },
      scene,
    );
    this.mesh.position = new Vector3(0, 0.55, -22);

    const material = new StandardMaterial("vehicleMaterial", scene);
    material.diffuseColor = new Color3(0.06, 0.35, 0.65);
    this.mesh.material = material;
  }

  update(input: InputState, deltaSeconds: number): void {
    const acceleration = input.throttle >= 0 ? 5.5 : 8;
    this.speedMetersPerSecond += input.throttle * acceleration * deltaSeconds;

    if (input.throttle === 0) {
      const drag = 3.5 * deltaSeconds;
      this.speedMetersPerSecond = Math.abs(this.speedMetersPerSecond) <= drag
        ? 0
        : this.speedMetersPerSecond - Math.sign(this.speedMetersPerSecond) * drag;
    }

    this.speedMetersPerSecond = Math.max(-4, Math.min(18, this.speedMetersPerSecond));

    const steeringEffect = Math.min(Math.abs(this.speedMetersPerSecond) / 5, 1);
    this.heading += input.steering * steeringEffect * 1.35 * deltaSeconds;
    this.mesh.rotation.y = this.heading;

    const forward = new Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.mesh.position.addInPlace(forward.scale(this.speedMetersPerSecond * deltaSeconds));
  }

  get speedMph(): number {
    return Math.abs(this.speedMetersPerSecond) * 2.23694;
  }
}

function createRoad(scene: Scene): void {
  const ground = MeshBuilder.CreateGround("ground", { width: 100, height: 100 }, scene);
  const groundMaterial = new StandardMaterial("groundMaterial", scene);
  groundMaterial.diffuseColor = new Color3(0.22, 0.42, 0.2);
  ground.material = groundMaterial;

  const roadMaterial = new StandardMaterial("roadMaterial", scene);
  roadMaterial.diffuseColor = new Color3(0.12, 0.13, 0.15);

  const northSouth = MeshBuilder.CreateBox(
    "northSouthRoad",
    { width: 11, height: 0.08, depth: 100 },
    scene,
  );
  northSouth.position.y = 0.04;
  northSouth.material = roadMaterial;

  const eastWest = MeshBuilder.CreateBox(
    "eastWestRoad",
    { width: 100, height: 0.08, depth: 11 },
    scene,
  );
  eastWest.position.y = 0.04;
  eastWest.material = roadMaterial;

  const lineMaterial = new StandardMaterial("lineMaterial", scene);
  lineMaterial.diffuseColor = new Color3(0.95, 0.78, 0.08);

  for (let z = -45; z <= 45; z += 8) {
    if (Math.abs(z) < 8) continue;
    const line = MeshBuilder.CreateBox(
      `centerLine-${z}`,
      { width: 0.15, height: 0.04, depth: 4 },
      scene,
    );
    line.position = new Vector3(0, 0.1, z);
    line.material = lineMaterial;
  }
}

function readInput(keys: Set<string>): InputState {
  const throttle = Number(keys.has("KeyW") || keys.has("ArrowUp"))
    - Number(keys.has("KeyS") || keys.has("ArrowDown"));
  const steering = Number(keys.has("KeyD") || keys.has("ArrowRight"))
    - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  return { throttle, steering };
}

const canvas = document.querySelector<HTMLCanvasElement>("#renderCanvas");
if (!canvas) throw new Error("Render canvas was not found.");

const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.55, 0.75, 0.92, 1);

new HemisphericLight("ambientLight", new Vector3(0, 1, 0), scene).intensity = 0.75;
new DirectionalLight("sunLight", new Vector3(-0.4, -1, 0.3), scene).intensity = 0.8;

createRoad(scene);
const vehicle = new TrainingVehicle(scene);

const followCamera = new FollowCamera("followCamera", new Vector3(0, 5, -10), scene);
followCamera.lockedTarget = vehicle.mesh;
followCamera.radius = 11;
followCamera.heightOffset = 4;
followCamera.rotationOffset = 180;
followCamera.cameraAcceleration = 0.08;
followCamera.maxCameraSpeed = 20;

const overviewCamera = new ArcRotateCamera(
  "overviewCamera",
  -Math.PI / 2,
  Math.PI / 3,
  32,
  vehicle.mesh.position,
  scene,
);
overviewCamera.lockedTarget = vehicle.mesh;
scene.activeCamera = followCamera;

const keys = new Set<string>();
window.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "KeyC" && !event.repeat) {
    scene.activeCamera = scene.activeCamera === followCamera ? overviewCamera : followCamera;
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());

const speedElement = document.querySelector<HTMLElement>("#speed");
engine.runRenderLoop(() => {
  vehicle.update(readInput(keys), engine.getDeltaTime() / 1000);
  if (speedElement) speedElement.textContent = `${Math.round(vehicle.speedMph)} mph`;
  scene.render();
});

window.addEventListener("resize", () => engine.resize());
