import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

type SignPainter = (ctx: CanvasRenderingContext2D, size: number) => void;

/** A post + a self-lit panel textured by `paint`, facing `faceHeading`. */
function buildSign(
  scene: Scene,
  postMat: StandardMaterial,
  name: string,
  x: number,
  z: number,
  faceHeading: number,
  paint: SignPainter,
  panel = 1.3,
): void {
  const postHeight = 2.3;
  const post = CreateCylinder(`${name}-post`, { diameter: 0.14, height: postHeight, tessellation: 8 }, scene);
  post.material = postMat;
  post.position.set(x, postHeight / 2, z);
  post.freezeWorldMatrix();

  const size = 256;
  const tex = new DynamicTexture(`${name}-tex`, { width: size, height: size }, scene, true);
  paint(tex.getContext() as unknown as CanvasRenderingContext2D, size);
  tex.update();

  const mat = new StandardMaterial(`${name}-mat`, scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex; // self-lit so signs read clearly regardless of lighting
  mat.emissiveColor = new Color3(1, 1, 1);
  mat.specularColor = new Color3(0, 0, 0);

  const board = CreateBox(`${name}-panel`, { width: panel, height: panel, depth: 0.08 }, scene);
  board.material = mat;
  board.position.set(x, postHeight + panel / 2 - 0.2, z);
  board.rotation.y = faceHeading;
  board.freezeWorldMatrix();
}

function paintStop(ctx: CanvasRenderingContext2D, s: number): void {
  const c = s / 2;
  ctx.fillStyle = "#b32217";
  ctx.fillRect(0, 0, s, s);
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    const px = c + s * 0.46 * Math.cos(a);
    const py = c + s * 0.46 * Math.sin(a);
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.lineWidth = s * 0.05;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${s * 0.24}px sans-serif`;
  ctx.fillText("STOP", c, c);
}

function paintSpeedLimit(ctx: CanvasRenderingContext2D, s: number): void {
  const c = s / 2;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = s * 0.04;
  ctx.strokeRect(s * 0.06, s * 0.06, s * 0.88, s * 0.88);
  ctx.fillStyle = "#111111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${s * 0.13}px sans-serif`;
  ctx.fillText("SPEED", c, s * 0.26);
  ctx.fillText("LIMIT", c, s * 0.42);
  ctx.font = `bold ${s * 0.34}px sans-serif`;
  ctx.fillText("25", c, s * 0.72);
}

function paintSchoolZone(ctx: CanvasRenderingContext2D, s: number): void {
  const c = s / 2;
  ctx.fillStyle = "#c6e000";
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = "#111111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${s * 0.16}px sans-serif`;
  ctx.fillText("SCHOOL", c, s * 0.3);
  ctx.font = `bold ${s * 0.12}px sans-serif`;
  ctx.fillText("ZONE", c, s * 0.46);
  ctx.font = `bold ${s * 0.3}px sans-serif`;
  ctx.fillText("20", c, s * 0.74);
}

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
  const box = CreateBox(name, size, scene);
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

  const ground = CreateGround("ground", { width: WORLD, height: WORLD }, scene);
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

  // --- Stop lines: one across the approaching (right-hand) lane on each arm.
  // Lane sides match the stop controls in rules/stopControls.ts and the stop
  // signs below, so the painted line, the HUD's "stop ahead" measure, and the
  // sign all refer to the same lane. LANE is the right-lane centre offset.
  const stopOffset = ROAD_HALF + 0.6;
  const LANE = ROAD_HALF / 2;
  slab(scene, "stopS", { width: ROAD_HALF, height: 0.04, depth: 0.5 }, new Vector3(LANE, 0.1, -stopOffset), whiteMat);
  slab(scene, "stopN", { width: ROAD_HALF, height: 0.04, depth: 0.5 }, new Vector3(-LANE, 0.1, stopOffset), whiteMat);
  slab(scene, "stopW", { width: 0.5, height: 0.04, depth: ROAD_HALF }, new Vector3(-stopOffset, 0.1, -LANE), whiteMat);
  slab(scene, "stopE", { width: 0.5, height: 0.04, depth: ROAD_HALF }, new Vector3(stopOffset, 0.1, LANE), whiteMat);

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
    const trunk = CreateCylinder(`trunk-${tx}-${tz}`, { diameter: 0.4, height: 1.6, tessellation: 8 }, scene);
    trunk.material = trunkMat;
    trunk.position.set(tx, 0.8, tz);
    trunk.freezeWorldMatrix();
    const canopy = CreateCylinder(`canopy-${tx}-${tz}`, { diameterTop: 0, diameterBottom: 2.6, height: 3, tessellation: 10 }, scene);
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

  // --- Traffic signs (a sign faces the driver approaching it) ---
  const postMat = flatMaterial(scene, "signPostMat", new Color3(0.55, 0.55, 0.58));
  const HALF_PI = Math.PI / 2;

  // Stop signs on the right of each approach, just outside the junction.
  buildSign(scene, postMat, "stopS", 6.3, -6.5, Math.PI, paintStop);
  buildSign(scene, postMat, "stopN", -6.3, 6.5, 0, paintStop);
  buildSign(scene, postMat, "stopW", -6.5, -6.3, Math.PI + HALF_PI, paintStop);
  buildSign(scene, postMat, "stopE", 6.5, 6.3, HALF_PI, paintStop);

  // Speed-limit sign well south of the junction for the northbound approach.
  buildSign(scene, postMat, "speed25", 6.3, -20, Math.PI, paintSpeedLimit);

  // School-zone signs bracketing the east arm of the E–W road (the 20 mph zone).
  buildSign(scene, postMat, "schoolW", 9, -6.5, Math.PI + HALF_PI, paintSchoolZone);
  buildSign(scene, postMat, "schoolE", 42, 6.5, HALF_PI, paintSchoolZone);
}
