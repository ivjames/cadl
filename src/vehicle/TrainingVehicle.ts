import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import {
  type CarState,
  type DriveInput,
  spawnState,
  speedToMph,
  stepCar,
} from "./driving";

/**
 * A recognisable procedural car (body + cabin + four wheels + lights) whose
 * motion is driven entirely by the pure `driving` model. All visible parts are
 * parented to an invisible `root` mesh so cameras can track a single node.
 */
export class TrainingVehicle {
  /** Invisible pivot at ground level; the camera target and motion carrier. */
  readonly root: Mesh;
  private state: CarState = spawnState();

  constructor(scene: Scene) {
    this.root = new Mesh("vehicleRoot", scene);

    const paint = new StandardMaterial("carPaint", scene);
    paint.diffuseColor = new Color3(0.06, 0.35, 0.65);

    const glass = new StandardMaterial("carGlass", scene);
    glass.diffuseColor = new Color3(0.1, 0.13, 0.18);

    const rubber = new StandardMaterial("carRubber", scene);
    rubber.diffuseColor = new Color3(0.05, 0.05, 0.06);

    const headlight = new StandardMaterial("carHeadlight", scene);
    headlight.diffuseColor = new Color3(0.95, 0.93, 0.7);
    headlight.emissiveColor = new Color3(0.5, 0.48, 0.3);

    const taillight = new StandardMaterial("carTaillight", scene);
    taillight.diffuseColor = new Color3(0.6, 0.05, 0.05);
    taillight.emissiveColor = new Color3(0.35, 0.02, 0.02);

    // Front of the car is +Z (the forward heading direction).
    const body = MeshBuilder.CreateBox(
      "carBody",
      { width: 1.8, height: 0.6, depth: 4.0 },
      scene,
    );
    body.material = paint;
    body.position.y = 0.55;
    body.parent = this.root;

    const cabin = MeshBuilder.CreateBox(
      "carCabin",
      { width: 1.5, height: 0.6, depth: 2.0 },
      scene,
    );
    cabin.material = glass;
    cabin.position.set(0, 1.05, -0.25); // set slightly back to read front/rear
    cabin.parent = this.root;

    const wheelPositions: Array<[number, number]> = [
      [0.95, 1.3],
      [-0.95, 1.3],
      [0.95, -1.3],
      [-0.95, -1.3],
    ];
    for (const [wx, wz] of wheelPositions) {
      const wheel = MeshBuilder.CreateCylinder(
        `carWheel-${wx}-${wz}`,
        { diameter: 0.7, height: 0.3, tessellation: 16 },
        scene,
      );
      wheel.material = rubber;
      wheel.rotation.z = Math.PI / 2; // lay the cylinder on its side to roll
      wheel.position.set(wx, 0.35, wz);
      wheel.parent = this.root;
    }

    for (const hx of [-0.6, 0.6]) {
      const light = MeshBuilder.CreateBox(
        `carHeadlight-${hx}`,
        { width: 0.35, height: 0.2, depth: 0.1 },
        scene,
      );
      light.material = headlight;
      light.position.set(hx, 0.6, 2.0);
      light.parent = this.root;
    }

    for (const tx of [-0.7, 0.7]) {
      const light = MeshBuilder.CreateBox(
        `carTaillight-${tx}`,
        { width: 0.3, height: 0.2, depth: 0.1 },
        scene,
      );
      light.material = taillight;
      light.position.set(tx, 0.6, -2.0);
      light.parent = this.root;
    }

    this.syncTransform();
  }

  /** Advance the simulation one frame and push the result onto the meshes. */
  update(input: DriveInput, dt: number): void {
    this.state = stepCar(this.state, input, dt);
    this.syncTransform();
  }

  /** Return to spawn position, heading, and zero speed. */
  reset(): void {
    this.state = spawnState();
    this.syncTransform();
  }

  get speedMph(): number {
    return speedToMph(this.state.speed);
  }

  get position(): Vector3 {
    return this.root.position;
  }

  private syncTransform(): void {
    this.root.position.set(this.state.x, 0, this.state.z);
    this.root.rotation.y = this.state.heading;
  }
}
