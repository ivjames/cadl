import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { pedestrianHeading, pedestrianPos, type Pedestrian } from "../pedestrians/pedestrians";

const SHIRTS = [
  new Color3(0.2, 0.4, 0.75),
  new Color3(0.75, 0.3, 0.3),
  new Color3(0.3, 0.6, 0.4),
  new Color3(0.7, 0.6, 0.2),
  new Color3(0.5, 0.35, 0.6),
];

/** Renders pedestrians as simple figures; `sync` pushes the pure states. */
export class PedestrianView {
  private readonly roots: Mesh[] = [];

  constructor(scene: Scene, count: number) {
    const skin = new StandardMaterial("pedSkin", scene);
    skin.diffuseColor = new Color3(0.85, 0.68, 0.55);
    const legs = new StandardMaterial("pedLegs", scene);
    legs.diffuseColor = new Color3(0.2, 0.22, 0.28);

    for (let i = 0; i < count; i += 1) {
      const root = new Mesh(`ped-${i}`, scene);
      const shirt = new StandardMaterial(`pedShirt-${i}`, scene);
      shirt.diffuseColor = SHIRTS[i % SHIRTS.length]!;

      const lower = CreateBox(`pedLower-${i}`, { width: 0.45, height: 0.8, depth: 0.35 }, scene);
      lower.material = legs;
      lower.position.y = 0.4;
      lower.parent = root;

      const torso = CreateBox(`pedTorso-${i}`, { width: 0.5, height: 0.7, depth: 0.35 }, scene);
      torso.material = shirt;
      torso.position.y = 1.15;
      torso.parent = root;

      const head = CreateBox(`pedHead-${i}`, { width: 0.32, height: 0.32, depth: 0.32 }, scene);
      head.material = skin;
      head.position.y = 1.66;
      head.parent = root;

      this.roots.push(root);
    }
  }

  sync(peds: readonly Pedestrian[]): void {
    for (let i = 0; i < peds.length; i += 1) {
      const root = this.roots[i];
      const ped = peds[i];
      if (!root || !ped) continue;
      const { x, z } = pedestrianPos(ped);
      root.position.set(x, 0, z);
      root.rotation.y = pedestrianHeading(ped);
    }
  }
}
