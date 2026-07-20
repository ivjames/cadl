import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { TrafficCar } from "../traffic/traffic";

const PAINT = [
  new Color3(0.75, 0.2, 0.18),
  new Color3(0.85, 0.6, 0.1),
  new Color3(0.2, 0.5, 0.35),
  new Color3(0.6, 0.6, 0.65),
  new Color3(0.4, 0.25, 0.5),
];

const AMBER_ON = new Color3(1, 0.62, 0);
const AMBER_OFF = new Color3(0.28, 0.17, 0.02);

/** Renders the ambient traffic cars; `sync` pushes the pure states each frame. */
export class TrafficView {
  private readonly roots: Mesh[] = [];
  // Per-car amber turn-signal materials, one per side.
  private readonly leftBlink: StandardMaterial[] = [];
  private readonly rightBlink: StandardMaterial[] = [];

  constructor(scene: Scene, count: number) {
    const glass = new StandardMaterial("trafficGlass", scene);
    glass.diffuseColor = new Color3(0.08, 0.09, 0.12);
    const rubber = new StandardMaterial("trafficRubber", scene);
    rubber.diffuseColor = new Color3(0.05, 0.05, 0.06);
    const headlight = new StandardMaterial("trafficHeadlight", scene);
    headlight.diffuseColor = new Color3(0.95, 0.93, 0.7);
    headlight.emissiveColor = new Color3(0.5, 0.48, 0.3);
    const taillight = new StandardMaterial("trafficTaillight", scene);
    taillight.diffuseColor = new Color3(0.6, 0.05, 0.05);
    taillight.emissiveColor = new Color3(0.35, 0.02, 0.02);

    for (let i = 0; i < count; i += 1) {
      const root = new Mesh(`traffic-${i}`, scene);
      const paint = new StandardMaterial(`trafficPaint-${i}`, scene);
      paint.diffuseColor = PAINT[i % PAINT.length]!;

      const body = CreateBox(`tbody-${i}`, { width: 1.8, height: 0.6, depth: 4.2 }, scene);
      body.material = paint;
      body.position.y = 0.55;
      body.parent = root;

      const cabin = CreateBox(`tcab-${i}`, { width: 1.5, height: 0.55, depth: 2.0 }, scene);
      cabin.material = glass;
      cabin.position.set(0, 1.05, -0.2);
      cabin.parent = root;

      // Four wheels (front = +z).
      for (const [wx, wz] of [
        [0.95, 1.3],
        [-0.95, 1.3],
        [0.95, -1.3],
        [-0.95, -1.3],
      ] as const) {
        const wheel = CreateCylinder(`twheel-${i}-${wx}-${wz}`, { diameter: 0.7, height: 0.3, tessellation: 12 }, scene);
        wheel.material = rubber;
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.35, wz);
        wheel.parent = root;
      }
      // Head- and taillights.
      for (const hx of [-0.6, 0.6]) {
        const light = CreateBox(`thead-${i}-${hx}`, { width: 0.35, height: 0.2, depth: 0.1 }, scene);
        light.material = headlight;
        light.position.set(hx, 0.6, 2.1);
        light.parent = root;
      }
      for (const tx of [-0.7, 0.7]) {
        const light = CreateBox(`ttail-${i}-${tx}`, { width: 0.3, height: 0.2, depth: 0.1 }, scene);
        light.material = taillight;
        light.position.set(tx, 0.6, -2.1);
        light.parent = root;
      }

      // Amber turn signals at all four corners; one material per side blinks both.
      const leftMat = new StandardMaterial(`tblinkL-${i}`, scene);
      leftMat.diffuseColor = AMBER_OFF.clone();
      leftMat.emissiveColor = AMBER_OFF.clone();
      const rightMat = new StandardMaterial(`tblinkR-${i}`, scene);
      rightMat.diffuseColor = AMBER_OFF.clone();
      rightMat.emissiveColor = AMBER_OFF.clone();
      for (const [bx, bz, mat] of [
        [-0.85, 1.95, leftMat],
        [-0.85, -1.95, leftMat],
        [0.85, 1.95, rightMat],
        [0.85, -1.95, rightMat],
      ] as const) {
        const b = CreateBox(`tblink-${i}-${bx}-${bz}`, { width: 0.22, height: 0.18, depth: 0.16 }, scene);
        b.material = mat;
        b.position.set(bx, 0.55, bz);
        b.parent = root;
      }
      this.leftBlink.push(leftMat);
      this.rightBlink.push(rightMat);

      this.roots.push(root);
    }
  }

  /** Push car states; `blinkOn` is the shared blink phase for turn signals. */
  sync(cars: readonly TrafficCar[], blinkOn = false): void {
    for (let i = 0; i < cars.length; i += 1) {
      const root = this.roots[i];
      const car = cars[i];
      if (!root || !car) continue;
      root.position.set(car.x, 0, car.z);
      root.rotation.y = car.heading;
      const left = this.leftBlink[i];
      const right = this.rightBlink[i];
      if (left) left.emissiveColor = car.blinker === -1 && blinkOn ? AMBER_ON : AMBER_OFF;
      if (right) right.emissiveColor = car.blinker === 1 && blinkOn ? AMBER_ON : AMBER_OFF;
    }
  }
}
