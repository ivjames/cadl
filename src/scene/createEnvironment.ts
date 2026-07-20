import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { LANE, LINE_OFFSET, ROAD_HALF, ROADS, WORLD, approachesAt, intersections } from "../rules/roadGrid";

type SignPainter = (ctx: CanvasRenderingContext2D, size: number) => void;

function flatMaterial(scene: Scene, name: string, color: Color3): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.specularColor = new Color3(0.04, 0.04, 0.04);
  return material;
}

/** A merged, frozen, non-pickable mesh from a group of boxes sharing a material. */
function merge(scene: Scene, name: string, parts: Mesh[], material: StandardMaterial): void {
  if (parts.length === 0) return;
  const mesh = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
  if (!mesh) return;
  mesh.name = name;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
}

function box(scene: Scene, w: number, h: number, d: number, x: number, y: number, z: number): Mesh {
  const m = CreateBox("part", { width: w, height: h, depth: d }, scene);
  m.position.set(x, y, z);
  return m;
}

/** Spans of a road (along its axis) between intersection junction boxes. */
function segmentsAlong(): Array<[center: number, length: number]> {
  const half = WORLD / 2;
  const segs: Array<[number, number]> = [];
  let start = -half;
  for (const cross of ROADS) {
    const end = cross - ROAD_HALF;
    if (end > start) segs.push([(start + end) / 2, end - start]);
    start = cross + ROAD_HALF;
  }
  if (half > start) segs.push([(start + half) / 2, half - start]);
  return segs;
}

// --- Sign painters (256×256 canvas) ---
function paintStop(ctx: CanvasRenderingContext2D, s: number): void {
  const c = s / 2;
  ctx.clearRect(0, 0, s, s); // transparent corners → octagon silhouette (alpha test)
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    const px = c + s * 0.48 * Math.cos(a);
    const py = c + s * 0.48 * Math.sin(a);
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = "#b32217";
  ctx.fill();
  ctx.lineWidth = s * 0.045;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${s * 0.26}px sans-serif`;
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

/** Build a shared, self-lit material carrying a painted sign texture. */
function signMaterial(scene: Scene, name: string, paint: SignPainter, alpha: boolean): StandardMaterial {
  const size = 256;
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, true);
  paint(tex.getContext() as unknown as CanvasRenderingContext2D, size);
  tex.update();
  const mat = new StandardMaterial(`${name}-mat`, scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex; // self-lit so signs read clearly regardless of lighting
  mat.emissiveColor = new Color3(1, 1, 1);
  mat.specularColor = new Color3(0, 0, 0);
  if (alpha) {
    tex.hasAlpha = true;
    mat.useAlphaFromDiffuseTexture = true;
    mat.transparencyMode = 1; // ALPHA_TEST — crisp edges, no sort issues
  }
  return mat;
}

/** A single-sided sign panel facing the driver on `heading` (blank back). */
function signPanel(scene: Scene, x: number, z: number, heading: number): Mesh {
  const panel = CreatePlane("sign", { size: 1.3 }, scene);
  panel.position.set(x, 2.45, z);
  panel.rotation.y = heading + Math.PI; // front faces the approaching driver
  return panel;
}

/**
 * Builds a large procedural city grid: green ground, a network of asphalt
 * streets with lane markings and stop lines at every intersection, curbs and
 * sidewalks, stop / speed-limit / school-zone signs, and blockout buildings and
 * trees. Static geometry is merged per material so the whole scene stays cheap
 * to render on mobile.
 */
export function createEnvironment(scene: Scene): void {
  const half = WORLD / 2;
  const grassMat = flatMaterial(scene, "grassMat", new Color3(0.22, 0.42, 0.2));
  const asphaltMat = flatMaterial(scene, "asphaltMat", new Color3(0.12, 0.13, 0.15));
  const yellowMat = flatMaterial(scene, "laneYellowMat", new Color3(0.95, 0.78, 0.08));
  const whiteMat = flatMaterial(scene, "laneWhiteMat", new Color3(0.9, 0.9, 0.92));
  const curbMat = flatMaterial(scene, "curbMat", new Color3(0.72, 0.72, 0.75));
  const walkMat = flatMaterial(scene, "sidewalkMat", new Color3(0.6, 0.6, 0.62));
  const postMat = flatMaterial(scene, "postMat", new Color3(0.5, 0.5, 0.53));
  const trunkMat = flatMaterial(scene, "trunkMat", new Color3(0.32, 0.2, 0.11));
  const leafMat = flatMaterial(scene, "leafMat", new Color3(0.16, 0.4, 0.18));
  const buildingMat = flatMaterial(scene, "buildingMat", new Color3(0.52, 0.52, 0.55));

  const ground = CreateGround("ground", { width: WORLD, height: WORLD }, scene);
  ground.material = grassMat;
  ground.isPickable = false;
  ground.freezeWorldMatrix();

  const roads: Mesh[] = [];
  const dashes: Mesh[] = [];
  const lines: Mesh[] = [];
  const curbs: Mesh[] = [];
  const walks: Mesh[] = [];
  const posts: Mesh[] = [];
  const stopSigns: Mesh[] = [];
  const otherSigns: { mesh: Mesh; mat: StandardMaterial }[] = [];
  const trunks: Mesh[] = [];
  const canopies: Mesh[] = [];
  const buildings: Mesh[] = [];

  const nearIntersection = (v: number): boolean => ROADS.some((c) => Math.abs(v - c) < ROAD_HALF + 2);

  // --- Roads, dashes, curbs, sidewalks along both axes ---
  for (const c of ROADS) {
    // North-south road at x = c, and east-west road at z = c.
    roads.push(box(scene, 11, 0.08, WORLD, c, 0.04, 0));
    roads.push(box(scene, WORLD, 0.08, 11, 0, 0.04, c));

    for (let d = -half + 4; d <= half - 4; d += 8) {
      if (!nearIntersection(d)) {
        dashes.push(box(scene, 0.16, 0.04, 4, c, 0.1, d));
        dashes.push(box(scene, 4, 0.04, 0.16, d, 0.1, c));
      }
    }

    for (const [center, length] of segmentsAlong()) {
      for (const side of [-1, 1]) {
        curbs.push(box(scene, 0.3, 0.22, length, c + side * (ROAD_HALF + 0.15), 0.11, center));
        curbs.push(box(scene, length, 0.22, 0.3, center, 0.11, c + side * (ROAD_HALF + 0.15)));
        walks.push(box(scene, 2.4, 0.16, length, c + side * (ROAD_HALF + 1.5), 0.08, center));
        walks.push(box(scene, length, 0.16, 2.4, center, 0.08, c + side * (ROAD_HALF + 1.5)));
      }
    }
  }

  // --- Stop lines + stop signs at every approach of every intersection ---
  for (const { cx, cz } of intersections()) {
    for (const a of approachesAt(cx, cz)) {
      // White limit line across the approaching lane, oriented along the road.
      const alongZ = Math.abs(Math.cos(a.heading)) > 0.5; // S/N approaches run along Z
      if (alongZ) {
        lines.push(box(scene, ROAD_HALF, 0.04, 0.5, a.x, 0.1, a.z));
      } else {
        lines.push(box(scene, 0.5, 0.04, ROAD_HALF, a.x, 0.1, a.z));
      }
      // Stop sign on the right, just outside the line, facing the approach.
      const sx = a.x + Math.sin(a.heading + Math.PI / 2) * 0.9;
      const sz = a.z + Math.cos(a.heading + Math.PI / 2) * 0.9;
      posts.push(CreateCylinder("post", { diameter: 0.14, height: 2.3, tessellation: 6 }, scene));
      posts[posts.length - 1]!.position.set(sx, 1.15, sz);
      stopSigns.push(signPanel(scene, sx, sz, a.heading));
    }
  }

  // --- A speed-limit sign and school-zone signs on the origin east arm ---
  const stdSign = (x: number, z: number, heading: number, mat: StandardMaterial): void => {
    const post = CreateCylinder("post", { diameter: 0.14, height: 2.3, tessellation: 6 }, scene);
    post.position.set(x, 1.15, z);
    posts.push(post);
    otherSigns.push({ mesh: signPanel(scene, x, z, heading), mat });
  };
  const speedMat = signMaterial(scene, "speedTex", paintSpeedLimit, false);
  const schoolMat = signMaterial(scene, "schoolTex", paintSchoolZone, false);
  stdSign(LANE + ROAD_HALF, -16, 0, speedMat); // northbound approaching origin
  stdSign(9, -ROAD_HALF - 1, Math.PI / 2, schoolMat); // school zone, east arm
  stdSign(42, ROAD_HALF + 1, -Math.PI / 2, schoolMat);

  // --- Buildings + trees, one cluster per city block ---
  const mids = ROADS.slice(0, -1).map((v, i) => (v + ROADS[i + 1]!) / 2);
  mids.forEach((bx, ix) => {
    mids.forEach((bz, iz) => {
      const height = 7 + ((ix * 3 + iz * 5) % 12);
      buildings.push(box(scene, 22, height, 20, bx, height / 2, bz));
      // A couple of trees near the block's road-facing corner.
      const treeSpots: Array<[number, number]> = [
        [bx - 16, bz - 16],
        [bx + 16, bz + 15],
      ];
      for (const [tx, tz] of treeSpots) {
        const trunk = CreateCylinder("trunk", { diameter: 0.4, height: 1.6, tessellation: 6 }, scene);
        trunk.position.set(tx, 0.8, tz);
        trunks.push(trunk);
        const canopy = CreateCylinder("canopy", { diameterTop: 0, diameterBottom: 2.6, height: 3, tessellation: 8 }, scene);
        canopy.position.set(tx, 3.0, tz);
        canopies.push(canopy);
      }
    });
  });

  merge(scene, "roads", roads, asphaltMat);
  merge(scene, "dashes", dashes, yellowMat);
  merge(scene, "stopLines", lines, whiteMat);
  merge(scene, "curbs", curbs, curbMat);
  merge(scene, "sidewalks", walks, walkMat);
  merge(scene, "signPosts", posts, postMat);
  merge(scene, "stopSigns", stopSigns, signMaterial(scene, "stopTex", paintStop, true));
  merge(scene, "trunks", trunks, trunkMat);
  merge(scene, "canopies", canopies, leafMat);
  merge(scene, "buildings", buildings, buildingMat);
  for (const { mesh, mat } of otherSigns) {
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
  }
}
