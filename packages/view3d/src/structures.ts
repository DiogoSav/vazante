import * as THREE from 'three';
import { STRUCTURES, STRUCTURE_KINDS, type StructureKind, type StructureView } from '@vazante/shared';
import { toon } from './materials.ts';
import { PALETTE } from './palette.ts';

const CAP = 1024;

/** Geometry for each finished structure type; origin at the cell centre on the ground. */
function geometryFor(kind: StructureKind, cs: number): THREE.BufferGeometry {
  const h = STRUCTURES[kind].height;
  const w = cs - 0.2;
  switch (kind) {
    case 'hesco': {
      // A straight run east-west: what a lone sandbag cell (and the placement ghost) looks like.
      const arm = sandbagArm(cs);
      return merge([sandbagCore(cs), arm, arm.clone().rotateY(Math.PI)]);
    }
    case 'wall': {
      const g = new THREE.BoxGeometry(w, h, w);
      g.translate(0, h / 2, 0);
      return g;
    }
    case 'gate': {
      const posts = [-1, 1].map((s) => {
        const g = new THREE.BoxGeometry(0.6, h + 0.4, w);
        g.translate((s * (w - 0.6)) / 2, (h + 0.4) / 2, 0);
        return g;
      });
      const leaf = new THREE.BoxGeometry(w - 1.2, h, w * 0.5);
      leaf.translate(0, h / 2, 0);
      return merge([...posts, leaf]);
    }
    case 'command_post': {
      // Watchtower: a sandbagged bunker at the foot, legs up to a parapet platform, a roof on
      // posts and a radio mast. Height h (8 m) is the roof.
      const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
      const parts: THREE.BufferGeometry[] = [];
      const deck = h * 0.55;
      const i = w / 2 - 0.25;
      parts.push(box(w, 1.6, w, 0, 0.8, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.35, deck, 0.35, sx * i, deck / 2, sz * i));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.15, h - deck, 0.15, sx * i, deck + (h - deck) / 2, sz * i));
      parts.push(box(w, 0.3, w, 0, deck, 0));
      parts.push(box(w, 1.0, 0.45, 0, deck + 0.65, -i), box(w, 1.0, 0.45, 0, deck + 0.65, i));
      parts.push(box(0.45, 1.0, w - 0.9, -i, deck + 0.65, 0), box(0.45, 1.0, w - 0.9, i, deck + 0.65, 0));
      parts.push(box(w + 0.5, 0.25, w + 0.5, 0, h, 0));
      parts.push(box(0.1, 3.2, 0.1, i * 0.6, h + 1.6, i * 0.6));
      return merge(parts);
    }
    case 'mg_nest':
      // The placement ghost shows the ring and the gun together; built nests draw them as two meshes.
      return merge([nestRing(cs), nestGun()]);
  }
}

/**
 * Sandbags are drawn per cell as a core in the middle and one arm towards each neighbour they join,
 * so lines run either way and meet as corners, tees and crossings. Courses of bags in running bond,
 * each course a little narrower than the one below.
 */
const SANDBAG_COURSES = 4;
/** Depth of the bottom course as a share of the cell, and how much each course above narrows. */
const SANDBAG_BASE = 0.62;
const SANDBAG_STEP = 0.06;

/** Middle of a sandbag cell: a square of bags as deep as the line, laid crosswise on alternate courses. */
function sandbagCore(cs: number): THREE.BufferGeometry {
  const h = STRUCTURES.hesco.height;
  const w = cs - 0.2;
  const ch = h / SANDBAG_COURSES;
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < SANDBAG_COURSES; k++) {
    const depth = w * (SANDBAG_BASE - k * SANDBAG_STEP);
    const half = depth / 2 - 0.04;
    // Two bags side by side, turned a quarter on every other course so the joints never line up.
    for (const o of [-1, 1]) {
      const g = k % 2 === 0 ? new THREE.BoxGeometry(half, ch * 0.92, depth - 0.04) : new THREE.BoxGeometry(depth - 0.04, ch * 0.92, half);
      g.translate(k % 2 === 0 ? (o * depth) / 4 : 0, ch * k + ch / 2, k % 2 === 0 ? 0 : (o * depth) / 4);
      parts.push(g);
    }
  }
  return merge(parts);
}

/** Half a cell of bags from the core out to the cell edge along +x, where the neighbour's arm meets it. */
function sandbagArm(cs: number): THREE.BufferGeometry {
  const h = STRUCTURES.hesco.height;
  const w = cs - 0.2;
  const ch = h / SANDBAG_COURSES;
  const end = cs / 2;
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < SANDBAG_COURSES; k++) {
    const depth = w * (SANDBAG_BASE - k * SANDBAG_STEP);
    // Each course starts at the edge of the core's course at the same height.
    const start = depth / 2;
    // Running bond: odd courses start half a bag in, so the joints of one course sit over the bags of the next.
    const n = 2;
    const bag = (end - start) / n;
    const cuts = k % 2 === 0 ? [0, 1, 2] : [0, 0.5, 1.5, 2];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = start + cuts[i] * bag;
      const b = start + cuts[i + 1] * bag;
      const g = new THREE.BoxGeometry(b - a - 0.05, ch * 0.92, depth - 0.04);
      g.translate((a + b) / 2, ch * k + ch / 2, 0);
      parts.push(g);
    }
  }
  return merge(parts);
}

/** Bags along x from `a` to `b` in one course: `n` bags, or half a bag first on odd courses (running bond). */
function bagRun(a: number, b: number, n: number, odd: boolean, y: number, ch: number, depth: number, z: number): THREE.BufferGeometry[] {
  const bag = (b - a) / n;
  const cuts = odd ? [0, 0.5, ...Array.from({ length: n - 1 }, (_, i) => i + 1.5), n] : Array.from({ length: n + 1 }, (_, i) => i);
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const x0 = a + cuts[i] * bag;
    const x1 = a + cuts[i + 1] * bag;
    out.push(new THREE.BoxGeometry(x1 - x0 - 0.05, ch * 0.92, depth - 0.04).translate((x0 + x1) / 2, y, z));
  }
  return out;
}

/**
 * Machine-gun nest parapet: a square ring of sandbag courses round a pit, like the sandbag lines.
 * Each course steps in a little, and the corners interlock: on even courses the north and south
 * runs cover the corners, on odd courses the east and west runs do.
 */
function nestRing(cs: number): THREE.BufferGeometry {
  const h = STRUCTURES.mg_nest.height;
  const w = cs - 0.2;
  const ch = h / SANDBAG_COURSES;
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < SANDBAG_COURSES; k++) {
    const y = ch * k + ch / 2;
    const odd = k % 2 === 1;
    const outer = w / 2 - k * 0.05;
    const depth = 0.8 - k * 0.04;
    const mid = outer - depth / 2;
    // The runs that cover the corners this course span the whole side; the others fit between them.
    const long = [-outer, outer] as const;
    const short = [-outer + depth, outer - depth] as const;
    const [nsA, nsB] = odd ? short : long;
    const [ewA, ewB] = odd ? long : short;
    for (const z of [-mid, mid]) parts.push(...bagRun(nsA, nsB, odd ? 3 : 4, odd, y, ch, depth, z));
    for (const x of [-mid, mid]) for (const g of bagRun(ewA, ewB, odd ? 4 : 3, !odd, y, ch, depth, 0)) parts.push(g.rotateY(Math.PI / 2).translate(x, 0, 0));
  }
  return merge(parts);
}

/** A box spanning from `a` to `b` with a square section `t`: a tripod leg. */
function beam(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.BoxGeometry(t, d.length(), t);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

/** A cylinder along z from `z0` to `z1` (z0 > z1, towards the muzzle) at height y. */
function tube(r: number, z0: number, z1: number, y: number, x = 0, sides = 10): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r, r, z0 - z1, sides).rotateX(Math.PI / 2).translate(x, y, (z0 + z1) / 2);
}

/**
 * The heavy machine gun on its tripod, pointing north (-z) over the front parapet: tripod legs,
 * receiver with spade grips and feed cover, perforated cooling jacket, barrel and flash hider,
 * and an olive ammunition box on the left feeding a belt. Coloured per vertex (metal, olive, brass).
 */
function nestGun(): THREE.BufferGeometry {
  const metal = new THREE.Color(PALETTE.gunMetal);
  const dark = new THREE.Color(PALETTE.weapon);
  const olive = new THREE.Color(PALETTE.ammoBox);
  const brass = new THREE.Color(PALETTE.brass);
  const y = STRUCTURES.mg_nest.height + 0.22;
  const parts: [THREE.BufferGeometry, THREE.Color][] = [];
  const pivot = new THREE.Vector3(0, y - 0.12, -0.55);
  // Tripod: two rear legs splayed into the pit, one forward leg resting on the front parapet.
  for (const foot of [new THREE.Vector3(-0.55, 0, 0.15), new THREE.Vector3(0.55, 0, 0.15), new THREE.Vector3(0, STRUCTURES.mg_nest.height, -1.05)]) parts.push([beam(pivot, foot, 0.06), dark]);
  parts.push([new THREE.BoxGeometry(0.12, 0.14, 0.12).translate(pivot.x, pivot.y + 0.04, pivot.z), dark]);
  // Receiver, feed cover on top, spade grips and a trigger plate at the back.
  parts.push([new THREE.BoxGeometry(0.22, 0.2, 0.72).translate(0, y, -0.5), metal]);
  parts.push([new THREE.BoxGeometry(0.2, 0.05, 0.4).translate(0, y + 0.12, -0.56), dark]);
  for (const s of [-1, 1]) parts.push([new THREE.BoxGeometry(0.04, 0.13, 0.05).translate(s * 0.08, y, -0.08), dark]);
  parts.push([new THREE.BoxGeometry(0.2, 0.04, 0.06).translate(0, y - 0.06, -0.08), dark]);
  // Cooling jacket with a few rings standing proud, then the bare barrel and the flash hider.
  parts.push([tube(0.075, -0.86, -1.5, y + 0.02), metal]);
  for (const z of [-0.95, -1.15, -1.35]) parts.push([tube(0.088, z, z - 0.04, y + 0.02), dark]);
  parts.push([tube(0.034, -1.5, -1.92, y + 0.02, 0, 8), dark]);
  parts.push([tube(0.055, -1.92, -2.06, y + 0.02, 0, 8), dark]);
  // Ammunition box on the left of the receiver and the belt running into the feed.
  parts.push([new THREE.BoxGeometry(0.2, 0.22, 0.32).translate(-0.3, y - 0.02, -0.52), olive]);
  parts.push([new THREE.BoxGeometry(0.21, 0.03, 0.33).translate(-0.3, y + 0.1, -0.52), dark]);
  parts.push([new THREE.BoxGeometry(0.12, 0.03, 0.09).translate(-0.15, y + 0.06, -0.54), brass]);
  return mergeColoured(parts);
}

/** Directions to a neighbour cell and the turn that points an arm (built along +x) that way. */
const SANDBAG_DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [0, 1, -Math.PI / 2],
  [-1, 0, Math.PI],
  [0, -1, Math.PI / 2],
];

/** Gate leaf lowered into the ground when open: just the posts. */
function openGateGeometry(cs: number): THREE.BufferGeometry {
  const h = STRUCTURES.gate.height;
  const w = cs - 0.2;
  return merge(
    [-1, 1].map((s) => {
      const g = new THREE.BoxGeometry(0.6, h + 0.4, w);
      g.translate((s * (w - 0.6)) / 2, (h + 0.4) / 2, 0);
      return g;
    }),
  );
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    pos.push(...(g.attributes.position.array as Float32Array));
    nor.push(...(g.attributes.normal.array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

/** Like `merge`, with a colour per part kept as a vertex colour (for a model with several materials in one mesh). */
function mergeColoured(parts: [THREE.BufferGeometry, THREE.Color][]): THREE.BufferGeometry {
  const out = merge(parts.map(([g]) => g));
  const col: number[] = [];
  for (const [g, c] of parts) {
    const n = (g.index ? g.index.count : g.attributes.position.count);
    for (let i = 0; i < n; i++) col.push(c.r, c.g, c.b);
  }
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

const KIND_COLOUR: Record<StructureKind, number> = {
  hesco: PALETTE.hesco,
  wall: PALETTE.concrete,
  gate: PALETTE.gate,
  // Same bags as the sandbag lines.
  mg_nest: PALETTE.hesco,
  command_post: PALETTE.commandPost,
};

/**
 * Structures, blueprints and the placement ghost. Rebuilt from each frame's structure list
 * (a few hundred at most), so it never holds state the simulation does not.
 */
export class StructureLayer {
  readonly group = new THREE.Group();
  private readonly built = new Map<StructureKind | 'gate_open', THREE.InstancedMesh>();
  /** Sandbags are drawn as a core per cell and an arm per joined neighbour instead of one fixed shape. */
  private readonly sandCore: THREE.InstancedMesh;
  private readonly sandArm: THREE.InstancedMesh;
  /** The gun on each built nest, coloured per vertex (metal, olive box, brass belt) and darkened with wear. */
  private readonly nestGun: THREE.InstancedMesh;
  private readonly blueprint: THREE.InstancedMesh;
  private readonly ghosts = new Map<StructureKind, THREE.InstancedMesh>();
  private readonly m = new THREE.Matrix4();
  private readonly col = new THREE.Color();
  private readonly dark = new THREE.Color(0x201a16);
  /** Height (m) of the finished, closed structure per cell; zombies inside are drawn on top of it. */
  readonly heightAt: Float32Array;

  constructor(
    private readonly cs: number,
    private readonly width: number,
    height: number,
  ) {
    this.heightAt = new Float32Array(width * height);
    const mat = toon();
    for (const k of Object.keys(STRUCTURES) as StructureKind[]) if (k !== 'hesco') this.built.set(k, this.instanced(k === 'mg_nest' ? nestRing(cs) : geometryFor(k, cs), mat));
    this.built.set('gate_open', this.instanced(openGateGeometry(cs), mat));
    this.nestGun = this.instanced(nestGun(), toon({ vertexColors: true }));
    this.sandCore = this.instanced(sandbagCore(cs), mat);
    this.sandArm = this.instanced(sandbagArm(cs), mat, CAP * 4);
    const box = new THREE.BoxGeometry(cs - 0.2, 1, cs - 0.2);
    box.translate(0, 0.5, 0);
    this.blueprint = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: PALETTE.blueprint, transparent: true, opacity: 0.35, depthWrite: false }), CAP);
    this.blueprint.count = 0;
    this.blueprint.frustumCulled = false;
    this.group.add(this.blueprint);
    const ghostMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false });
    for (const k of STRUCTURE_KINDS) {
      const g = new THREE.InstancedMesh(geometryFor(k, cs), ghostMat, 128);
      g.count = 0;
      g.frustumCulled = false;
      g.renderOrder = 2;
      this.ghosts.set(k, g);
      this.group.add(g);
    }
  }

  private instanced(geo: THREE.BufferGeometry, mat: THREE.Material, cap = CAP): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.count = 0;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    this.group.add(m);
    return m;
  }

  update(list: readonly StructureView[]): void {
    const counts = new Map<string, number>();
    for (const mesh of this.built.values()) mesh.count = 0;
    this.heightAt.fill(0);
    // Cells a sandbag line joins up with: other sandbags and the walls, gates and nests it butts against.
    const joins = new Set<number>();
    for (const s of list) if (s.built && s.kind !== 'command_post') joins.add(s.cy * this.width + s.cx);
    let cores = 0;
    let arms = 0;
    let guns = 0;
    let bp = 0;
    for (const s of list) {
      const x = (s.cx + 0.5) * this.cs;
      const y = (s.cy + 0.5) * this.cs;
      if (!s.built) {
        if (bp >= CAP) continue;
        const h = Math.max(0.15, STRUCTURES[s.kind].height * s.progress);
        this.m.makeScale(1, h, 1).setPosition(x, 0, y);
        this.blueprint.setMatrixAt(bp++, this.m);
        continue;
      }
      if (s.kind === 'hesco') {
        if (cores >= CAP) continue;
        this.col.set(KIND_COLOUR.hesco).lerp(this.dark, (1 - s.hp / s.maxHp) * 0.6);
        this.m.makeTranslation(x, 0, y);
        this.sandCore.setMatrixAt(cores, this.m);
        this.sandCore.setColorAt(cores++, this.col);
        const joined = SANDBAG_DIRS.map(([dx, dy]) => s.cx + dx >= 0 && s.cx + dx < this.width && joins.has((s.cy + dy) * this.width + s.cx + dx));
        const n = joined.filter(Boolean).length;
        SANDBAG_DIRS.forEach(([, , turn], d) => {
          // A lone cell runs east-west; a cell joined on one side carries straight on through the other.
          const arm = n === 0 ? d % 2 === 0 : n === 1 ? joined[d] || joined[(d + 2) % 4] : joined[d];
          if (!arm) return;
          this.m.makeRotationY(turn).setPosition(x, 0, y);
          this.sandArm.setMatrixAt(arms, this.m);
          this.sandArm.setColorAt(arms++, this.col);
        });
        this.heightAt[s.cy * this.width + s.cx] = STRUCTURES.hesco.height;
        continue;
      }
      const key = s.kind === 'gate' && s.open ? 'gate_open' : s.kind;
      const mesh = this.built.get(key)!;
      const i = counts.get(key) ?? 0;
      if (i >= CAP) continue;
      counts.set(key, i + 1);
      this.m.makeTranslation(x, 0, y);
      mesh.setMatrixAt(i, this.m);
      const wear = 1 - s.hp / s.maxHp;
      this.col.set(KIND_COLOUR[s.kind]).lerp(this.dark, wear * 0.6);
      mesh.setColorAt(i, this.col);
      mesh.count = i + 1;
      if (s.kind === 'mg_nest' && guns < CAP) {
        this.nestGun.setMatrixAt(guns, this.m);
        this.nestGun.setColorAt(guns++, this.col.set(0xffffff).lerp(this.dark, wear * 0.5));
      }
      if (key !== 'gate_open') this.heightAt[s.cy * this.width + s.cx] = STRUCTURES[s.kind].height;
    }
    this.sandCore.count = cores;
    this.sandArm.count = arms;
    this.nestGun.count = guns;
    for (const mesh of [...this.built.values(), this.sandCore, this.sandArm, this.nestGun]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.blueprint.count = bp;
    this.blueprint.instanceMatrix.needsUpdate = true;
  }

  /** Placement preview: one ghost per cell, green when valid and red otherwise. Empty hides it. */
  setGhosts(kind: StructureKind | null, cells: readonly { cx: number; cy: number; ok: boolean }[]): void {
    for (const [k, mesh] of this.ghosts) {
      if (k !== kind) {
        mesh.count = 0;
        continue;
      }
      const n = Math.min(cells.length, 128);
      for (let i = 0; i < n; i++) {
        const c = cells[i];
        this.m.makeTranslation((c.cx + 0.5) * this.cs, 0.02, (c.cy + 0.5) * this.cs);
        mesh.setMatrixAt(i, this.m);
        mesh.setColorAt(i, this.col.set(c.ok ? PALETTE.ghostOk : PALETTE.ghostBad));
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
