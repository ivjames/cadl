import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { ParkingBay } from "../rules/parking";

/**
 * Draws a parking bay: a translucent fill plus a painted white outline, at the
 * bay's position and orientation. Hidden until the parking lesson is active.
 */
export class ParkingBayView {
  private readonly root: Mesh;

  constructor(scene: Scene, bay: ParkingBay) {
    this.root = new Mesh("parkingBay", scene);
    this.root.position.set(bay.cx, 0, bay.cz);
    this.root.rotation.y = bay.axis;

    const fillMat = new StandardMaterial("bayFill", scene);
    fillMat.diffuseColor = new Color3(0.15, 0.55, 0.25);
    fillMat.emissiveColor = new Color3(0.08, 0.3, 0.14);
    fillMat.alpha = 0.35;

    const paint = new StandardMaterial("bayPaint", scene);
    paint.diffuseColor = new Color3(0.95, 0.95, 0.95);
    paint.emissiveColor = new Color3(0.35, 0.35, 0.35);

    const fill = CreateGround(
      "bayFill",
      { width: bay.halfW * 2, height: bay.halfD * 2 },
      scene,
    );
    fill.material = fillMat;
    fill.position.y = 0.03;
    fill.parent = this.root;

    // Four painted edges (thin boxes) framing the bay in bay-local coordinates:
    // local +X is "across" (width), local +Z is "along" (length).
    const line = 0.16;
    const edges: Array<[number, number, number, number]> = [
      [-bay.halfW, 0, line, bay.halfD * 2], // left side
      [bay.halfW, 0, line, bay.halfD * 2], // right side
      [0, -bay.halfD, bay.halfW * 2, line], // back end
      [0, bay.halfD, bay.halfW * 2, line], // front end (open kerb line)
    ];
    for (const [lx, lz, w, d] of edges) {
      const edge = CreateBox("bayEdge", { width: w, height: 0.06, depth: d }, scene);
      edge.material = paint;
      edge.position.set(lx, 0.05, lz);
      edge.parent = this.root;
    }

    this.setVisible(false);
  }

  setVisible(on: boolean): void {
    this.root.setEnabled(on);
  }
}
