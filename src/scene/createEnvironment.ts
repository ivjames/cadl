import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";

/** Half-width of each road (roads are 11 m wide, spanning -5.5..5.5). */
const ROAD_HALF = 5.5;
const WORLD = 100;

function flatMaterial(scene: Scene, name: string, color: Color3): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.specularColor = new Color3(0.05, 0.05, 0.05);
  return material;
}

function slab(
  scene: Scene,
  name: string,
  size: { width: number; height: number; depth: number },
  position: Vector3,
  material: StandardMaterial,
): Mesh {
  const box = MeshBuilder.CreateBox(name, size, scene);
  box.position = position;
  box.material = material;
  box.freezeWorldMatrix(); // static scenery: skip per-frame matrix recompute
  return box;
}

/**
 * Builds the static training environment: green ground, a four-way asphalt
 * intersection with lane markings and stop lines, raised curbs, sidewalks, and
 * lightweight blockout scenery (trees + buildings). Everything is procedural
 * and frozen — no external assets, cheap to render on mobile.
 */
export function createEnvironment(scene: Scene): void {
  const grassMat = flatMaterial(scene, "grassMat", new Color3(0.22, 0.42, 0.2));
  const asphaltMat = flatMaterial(scene, "asphaltMat", new Color3(0.12, 0.13, 0.15));
  const yellowMat = flatMaterial(scene, "laneYellowMat", new Color3(0.95, 0.78, 0.08));
  const whiteMat = flatMaterial(scene, "laneWhiteMat", new Color3(0.9, 0.9, 0.92));
  const curbMat = flatMaterial(scene, "curbMat", new Color3(0.75, 0.75, 0.78));
  const walkMat = flatMaterial(scene, "sidewalkMat", new Color3(0.62, 0.62, 0.64));

  const ground = MeshBuilder.CreateGround("ground", { width: WORLD, height: WORLD }, scene);
  ground.material = grassMat;
  ground.freezeWorldMatrix();

  // --- Roads (a north-south and east-west strip crossing at the origin) ---
  slab(scene, "roadNS", { width: 11, height: 0.08, depth: WORLD }, new Vector3(0, 0.04, 0), asphaltMat);
  slab(scene, "roadEW", { width: WORLD, height: 0.08, depth: 11 }, new Vector3(0, 0.04, 0), asphaltMat);

  // --- Dashed centre lines on both roads (skip the intersection box) ---
  for (let d = -46; d <= 46; d += 8) {
    if (Math.abs(d) < ROAD_HALF + 2) continue;
    slab(scene, `dashNS-${d}`, { width: 0.16, height: 0.04, depth: 4 }, new Vector3(0, 0.1, d), yellowMat);
    slab(scene, `dashEW-${d}`, { width: 4, height: 0.04, depth: 0.16 }, new Vector3(d, 0.1, 0), yellowMat);
  }

  // --- Stop lines: one across the approaching lane on each of the four arms ---
  const stopOffset = ROAD_HALF + 0.6;
  slab(scene, "stopS", { width: ROAD_HALF, height: 0.04, depth: 0.5 }, new Vector3(-ROAD_HALF / 2, 0.1, -stopOffset), whiteMat);
  slab(scene, "stopN", { width: ROAD_HALF, height: 0.04, depth: 0.5 }, new Vector3(ROAD_HALF / 2, 0.1, stopOffset), whiteMat);
  slab(scene, "stopW", { width: 0.5, height: 0.04, depth: ROAD_HALF }, new Vector3(-stopOffset, 0.1, ROAD_HALF / 2), whiteMat);
  slab(scene, "stopE", { width: 0.5, height: 0.04, depth: ROAD_HALF }, new Vector3(stopOffset, 0.1, -ROAD_HALF / 2), whiteMat);

  // --- Curbs + sidewalks in each of the four quadrants beside the roads ---
  const quadrants: Array<[number, number]> = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  const armReach = WORLD / 2 - ROAD_HALF; // length of curb along each road edge
  const armCentre = ROAD_HALF + armReach / 2;
  for (const [sx, sz] of quadrants) {
    // Curb running along the north-south road edge (varies in Z).
    slab(scene, `curbNS-${sx}-${sz}`, { width: 0.3, height: 0.22, depth: armReach }, new Vector3(sx * (ROAD_HALF + 0.15), 0.11, sz * armCentre), curbMat);
    // Curb running along the east-west road edge (varies in X).
    slab(scene, `curbEW-${sx}-${sz}`, { width: armReach, height: 0.22, depth: 0.3 }, new Vector3(sx * armCentre, 0.11, sz * (ROAD_HALF + 0.15)), curbMat);
    // Sidewalk strips just outside each curb.
    slab(scene, `walkNS-${sx}-${sz}`, { width: 2.4, height: 0.16, depth: armReach }, new Vector3(sx * (ROAD_HALF + 1.5), 0.08, sz * armCentre), walkMat);
    slab(scene, `walkEW-${sx}-${sz}`, { width: armReach, height: 0.16, depth: 2.4 }, new Vector3(sx * armCentre, 0.08, sz * (ROAD_HALF + 1.5)), walkMat);
  }

  // --- Trees: trunk + conical canopy, scattered off the roadway ---
  const trunkMat = flatMaterial(scene, "trunkMat", new Color3(0.32, 0.2, 0.11));
  const leafMat = flatMaterial(scene, "leafMat", new Color3(0.16, 0.4, 0.18));
  const treeSpots: Array<[number, number]> = [
    [12, 12], [12, 26], [26, 12], [12, -14], [24, -22], [14, -30],
    [-12, 12], [-22, 24], [-14, 30], [-12, -12], [-26, -14], [-14, -28],
  ];
  for (const [tx, tz] of treeSpots) {
    const trunk = MeshBuilder.CreateCylinder(`trunk-${tx}-${tz}`, { diameter: 0.4, height: 1.6, tessellation: 8 }, scene);
    trunk.material = trunkMat;
    trunk.position.set(tx, 0.8, tz);
    trunk.freezeWorldMatrix();
    const canopy = MeshBuilder.CreateCylinder(`canopy-${tx}-${tz}`, { diameterTop: 0, diameterBottom: 2.6, height: 3, tessellation: 10 }, scene);
    canopy.material = leafMat;
    canopy.position.set(tx, 3.0, tz);
    canopy.freezeWorldMatrix();
  }

  // --- Blockout buildings: flat-shaded boxes set back on each block corner ---
  const buildingColors = [
    new Color3(0.55, 0.5, 0.45),
    new Color3(0.45, 0.48, 0.55),
    new Color3(0.6, 0.55, 0.5),
    new Color3(0.5, 0.52, 0.5),
  ];
  const buildingSpots: Array<[number, number, number, number]> = [
    // x, z, width, depth
    [22, 22, 14, 12],
    [-24, 20, 12, 16],
    [20, -26, 16, 12],
    [-22, -24, 12, 14],
    [34, 8, 10, 20],
    [-34, -8, 10, 20],
  ];
  buildingSpots.forEach(([bx, bz, bw, bd], index) => {
    const height = 6 + ((index * 3) % 9);
    const mat = flatMaterial(scene, `buildingMat-${index}`, buildingColors[index % buildingColors.length]!);
    slab(scene, `building-${index}`, { width: bw, height, depth: bd }, new Vector3(bx, height / 2, bz), mat);
  });
}
