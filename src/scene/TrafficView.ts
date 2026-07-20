import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { TrafficCar } from "../traffic/traffic";

const PAINT = [
  new Color3(0.75, 0.2, 0.18),
  new Color3(0.85, 0.6, 0.1),
  new Color3(0.2, 0.5, 0.35),
  new Color3(0.6, 0.6, 0.65),
  new Color3(0.4, 0.25, 0.5),
];

/** Renders the ambient traffic cars; `sync` pushes the pure states each frame. */
export class TrafficView {
  private readonly roots: Mesh[] = [];

  constructor(scene: Scene, count: number) {
    const glass = new StandardMaterial("trafficGlass", scene);
    glass.diffuseColor = new Color3(0.08, 0.09, 0.12);

    for (let i = 0; i < count; i += 1) {
      const root = new Mesh(`traffic-${i}`, scene);
      const paint = new StandardMaterial(`trafficPaint-${i}`, scene);
      paint.diffuseColor = PAINT[i % PAINT.length]!;

      const body = CreateBox(`tbody-${i}`, { width: 1.8, height: 0.7, depth: 4.2 }, scene);
      body.material = paint;
      body.position.y = 0.5;
      body.parent = root;

      const cabin = CreateBox(`tcab-${i}`, { width: 1.5, height: 0.55, depth: 2.0 }, scene);
      cabin.material = glass;
      cabin.position.set(0, 1.0, -0.2);
      cabin.parent = root;

      this.roots.push(root);
    }
  }

  sync(cars: readonly TrafficCar[]): void {
    for (let i = 0; i < cars.length; i += 1) {
      const root = this.roots[i];
      const car = cars[i];
      if (!root || !car) continue;
      root.position.set(car.x, 0, car.z);
      root.rotation.y = car.heading;
    }
  }
}
