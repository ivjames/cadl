import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { Scene } from "@babylonjs/core/scene";
import {
  type CarState,
  type DriveInput,
  spawnState,
  speedToMph,
  stepCar,
} from "./driving";
import { buildingRects, resolveMovement } from "../rules/obstacles";

const OBSTACLES = buildingRects();

/**
 * A recognisable procedural car (body + cabin + four wheels + lights) whose
 * motion is driven entirely by the pure `driving` model. All visible parts are
 * parented to an invisible `root` mesh so cameras can track a single node.
 */
export class TrainingVehicle {
  /** Invisible pivot at ground level; the camera target and motion carrier. */
  readonly root: Mesh;
  private state: CarState = spawnState();
  // One material per side; toggling its emissive blinks both lights on that side.
  private readonly blinkerLeftMat: StandardMaterial;
  private readonly blinkerRightMat: StandardMaterial;
  private readonly amberOn = new Color3(1, 0.62, 0);
  private readonly amberOff = new Color3(0.32, 0.2, 0.03);

  constructor(scene: Scene) {
    this.root = new Mesh("vehicleRoot", scene);

    this.blinkerLeftMat = new StandardMaterial("blinkerLeft", scene);
    this.blinkerLeftMat.diffuseColor = this.amberOff.clone();
    this.blinkerRightMat = new StandardMaterial("blinkerRight", scene);
    this.blinkerRightMat.diffuseColor = this.amberOff.clone();

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
    const body = CreateBox(
      "carBody",
      { width: 1.8, height: 0.6, depth: 4.0 },
      scene,
    );
    body.material = paint;
    body.position.y = 0.55;
    body.parent = this.root;

    const cabin = CreateBox(
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
      const wheel = CreateCylinder(
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
      const light = CreateBox(
        `carHeadlight-${hx}`,
        { width: 0.35, height: 0.2, depth: 0.1 },
        scene,
      );
      light.material = headlight;
      light.position.set(hx, 0.6, 2.0);
      light.parent = this.root;
    }

    for (const tx of [-0.7, 0.7]) {
      const light = CreateBox(
        `carTaillight-${tx}`,
        { width: 0.3, height: 0.2, depth: 0.1 },
        scene,
      );
      light.material = taillight;
      light.position.set(tx, 0.6, -2.0);
      light.parent = this.root;
    }

    // Amber blinkers at all four corners (front z=+, rear z=-; left x=-, right x=+).
    const blinkerSpecs: Array<[string, number, number, StandardMaterial]> = [
      ["blinkFL", -0.85, 1.95, this.blinkerLeftMat],
      ["blinkRL", -0.85, -1.95, this.blinkerLeftMat],
      ["blinkFR", 0.85, 1.95, this.blinkerRightMat],
      ["blinkRR", 0.85, -1.95, this.blinkerRightMat],
    ];
    for (const [name, bx, bz, mat] of blinkerSpecs) {
      const light = CreateBox(name, { width: 0.22, height: 0.18, depth: 0.16 }, scene);
      light.material = mat;
      light.position.set(bx, 0.55, bz);
      light.parent = this.root;
    }

    this.syncTransform();
  }

  /** Light or clear the blinkers on one side (call each frame from a blink timer). */
  setBlinkers(side: "left" | "right" | null, on: boolean): void {
    this.blinkerLeftMat.emissiveColor = side === "left" && on ? this.amberOn : this.amberOff;
    this.blinkerRightMat.emissiveColor = side === "right" && on ? this.amberOn : this.amberOff;
  }

  /** Position, heading, and speed for the HUD and rule checks. */
  get pose(): { x: number; z: number; heading: number; speed: number; speedMph: number } {
    return {
      x: this.state.x,
      z: this.state.z,
      heading: this.state.heading,
      speed: this.state.speed,
      speedMph: this.speedMph,
    };
  }

  /** Advance the simulation one frame and push the result onto the meshes. */
  update(input: DriveInput, dt: number): void {
    const prev = this.state;
    const next = stepCar(prev, input, dt);
    // Block movement into buildings / off the world; slide along walls and
    // bleed off speed on impact so the car bumps to a stop instead of clipping.
    const moved = resolveMovement(prev.x, prev.z, next.x, next.z, OBSTACLES);
    this.state = moved.hit
      ? { ...next, x: moved.x, z: moved.z, speed: next.speed * 0.25 }
      : next;
    this.syncTransform();
  }

  /** Return to spawn position, heading, and zero speed. */
  reset(): void {
    this.state = spawnState();
    this.setBlinkers(null, false);
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
