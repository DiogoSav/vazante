import * as THREE from 'three';
import { Ground, type BuildingRect, type DistrictZone, type MapInfo } from '@vazante/shared';
import { buildingMaterial, toon, type FacadeKind } from './materials.ts';
import { PALETTE } from './palette.ts';

/** Texels per cell in the ground texture (lane markings, curbs, grain). */
const TPC = 8;

/** Ground texture, buildings (one instanced mesh), cosmetic props, and base/depot outlines. */
export function buildCity(map: MapInfo): THREE.Group {
  const group = new THREE.Group();
  const cs = map.cellSize;
  const wM = map.width * cs;
  const hM = map.height * cs;

  const groundMesh = new THREE.Mesh(groundGeometry(wM, hM), toon({ map: groundTexture(map) }));
  groundMesh.position.set(wM / 2, 0, hM / 2);
  groundMesh.receiveShadow = true;
  groundMesh.name = 'ground';
  group.add(groundMesh);

  group.add(buildBuildings(map));

  const props = buildProps(map);
  group.add(props);
  group.userData.lamps = props.userData.lamps;

  group.add(buildOutskirts(map));
  splitIntoChunks(group, CHUNK_M);
  return group;
}

/** A building's footprint in metres, inset a little so alleys and sidewalks read between buildings. */
function footprint(b: BuildingRect, cs: number): { x: number; z: number; w: number; d: number } {
  const w = (b.x1 - b.x0 + 1) * cs - 0.6;
  const d = (b.y1 - b.y0 + 1) * cs - 0.6;
  return { x: b.x0 * cs + (w + 0.6) / 2, z: b.y0 * cs + (d + 0.6) / 2, w, d };
}

/** A tower's podium height and how far the shaft above it is set back from the podium edge (metres). */
function towerShape(b: BuildingRect, w: number, d: number): { podium: number; inset: number } {
  return { podium: 6 + (hash(b.id * 31) % 3) * 3, inset: Math.max(1.2, Math.min(w, d) * (0.14 + (hash(b.id * 53) % 10) / 100)) };
}

/** What the fall of the city did to a building. Purely visual: the simulation keeps its footprint and height. */
export type BuildingDamage = 'none' | 'burning' | 'burnt' | 'collapsed' | 'destroyed';

/** Share of the buildings per damage, in thousandths: 15 % of the city in all. */
const DAMAGE_SHARE: ReadonlyArray<readonly [BuildingDamage, number]> = [
  ['burning', 30],
  ['burnt', 60],
  ['collapsed', 35],
  ['destroyed', 25],
];

/** Stable per building and city seed, so the renderer's fires land on the buildings drawn as burning. */
export function buildingDamage(b: BuildingRect, seed: number): BuildingDamage {
  // The hospital stands: the player has to recognise it.
  if (b.style === 'hospital') return 'none';
  let r = hash(b.id * 2246822519 + seed * 7919) % 1000;
  for (const [damage, share] of DAMAGE_SHARE) {
    if (r < share) return damage;
    r -= share;
  }
  return 'none';
}

/**
 * The buildings, one instanced mesh per facade and roof shape: towers on a podium downtown,
 * apartment blocks, houses under tiled gable roofs and warehouses under barrel or low metal roofs.
 * Damaged buildings get sooty facades; collapsed ones lose their top or roof to rubble, and
 * destroyed ones are a mound of rubble with a few wall stumps standing.
 */
function buildBuildings(map: MapInfo): THREE.Group {
  const group = new THREE.Group();
  const cs = map.cellSize;
  type Part = [THREE.Matrix4, THREE.Color];
  const walls: Record<FacadeKind, Part[]> = { block: [], house: [], warehouse: [] };
  const burnt: Record<FacadeKind, Part[]> = { block: [], house: [], warehouse: [] };
  const tiles: Part[] = [];
  const barrels: Part[] = [];
  const sheets: Part[] = [];
  const rubble: Part[] = [];
  const crosses: Part[] = [];
  const pick = (list: readonly number[], h: number) => new THREE.Color(list[h % list.length]).multiplyScalar(0.9 + (hash(h * 7) % 20) / 100);
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const flat = new THREE.Quaternion();
  const turned = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const tumble = new THREE.Euler();
  const part = (x: number, y: number, z: number, sx: number, sy: number, sz: number, q = flat) => new THREE.Matrix4().compose(pos.set(x, y, z), q, scale.set(sx, sy, sz));
  // A pitched roof runs its ridge along the longer side of the footprint.
  const roof = (x: number, y: number, z: number, w: number, d: number, rise: number, eave: number) =>
    w >= d ? part(x, y, z, w + eave, rise, d + eave) : part(x, y, z, d + eave, rise, w + eave, turned);
  const concrete = new THREE.Color(0x77756f);
  const char = new THREE.Color(0x1d1b19);
  // Chunks of rubble tumbled at random over the footprint (and a little past it), tinted from the building.
  const scatter = (seed: number, x: number, y: number, z: number, w: number, d: number, n: number, size: number, tone: THREE.Color) => {
    for (let k = 0; k < n; k++) {
      const r = hash(seed + k * 7919);
      const s = size * (0.5 + (r % 100) / 100);
      tumble.set(((r >>> 7) % 314) / 100, ((r >>> 13) % 628) / 100, ((r >>> 19) % 314) / 100);
      const px = x + (((r >>> 3) % 1000) / 1000 - 0.5) * w;
      const pz = z + (((r >>> 11) % 1000) / 1000 - 0.5) * d;
      const c = tone.clone().lerp(k % 3 === 0 ? char : concrete, 0.55).multiplyScalar(0.55 + ((r >>> 5) % 30) / 100);
      rubble.push([part(px, y + s * 0.2, pz, s * 1.4, s * 0.7, s, new THREE.Quaternion().setFromEuler(tumble)), c]);
    }
  };
  // Jagged wall stumps along the edge of a broken top (or of a ruin's footprint).
  const stumps = (seed: number, kind: FacadeKind, x: number, y: number, z: number, w: number, d: number, n: number, tall: number, tone: THREE.Color) => {
    for (let k = 0; k < n; k++) {
      const r = hash(seed + k * 104729);
      const len = 1.5 + (r % 40) / 10;
      const ht = 0.8 + ((r >>> 6) % 100) / 100 * tall;
      const t = ((r >>> 12) % 1000) / 1000 - 0.5;
      const side = (r >>> 22) % 4;
      const sx = side < 2 ? Math.min(len, w) : 0.6;
      const sz = side < 2 ? 0.6 : Math.min(len, d);
      const px = side < 2 ? x + t * (w - sx) : x + (side === 2 ? -1 : 1) * (w / 2 - 0.3);
      const pz = side < 2 ? z + (side === 0 ? -1 : 1) * (d / 2 - 0.3) : z + t * (d - sz);
      burnt[kind].push([part(px, y, pz, sx, ht, sz), tone]);
    }
  };

  for (const b of map.buildings) {
    const { x, z, w, d } = footprint(b, cs);
    const h = hash(b.id);
    const damage = buildingDamage(b, map.seed);
    const kind: FacadeKind = b.style === 'house' ? 'house' : b.style === 'warehouse' ? 'warehouse' : 'block';
    const tone = b.style === 'house' ? pick(PALETTE.houseTones, h) : b.style === 'warehouse' ? pick(PALETTE.warehouseTones, h) : pick(PALETTE.buildingTones, h);
    const wallsOf = damage === 'none' ? walls : burnt;
    const roofTone = (list: readonly number[]) => (damage === 'none' ? pick(list, h >>> 4) : pick(list, h >>> 4).multiplyScalar(0.35));

    if (damage === 'destroyed') {
      // A low mound of rubble over the whole lot, broken slabs on it and a few walls still standing.
      const mound = 0.6 + (h % 8) / 10;
      rubble.push([part(x, mound / 2, z, w * 0.9, mound, d * 0.9), tone.clone().lerp(concrete, 0.6).multiplyScalar(0.6)]);
      scatter(h, x, mound, z, w + 2, d + 2, 6 + Math.round((w * d) / 30), 1.6, tone);
      stumps(h, kind, x, 0, z, w, d, 2 + (h % 3), Math.min(b.height, 8), tone);
      continue;
    }

    if (b.style === 'hospital') {
      // White plaster block, a red cross on the roof and over the entrance, and a canopy at the door.
      // The entrance faces north (-z), towards the open front of the site.
      const white = new THREE.Color(PALETTE.hospital);
      walls.block.push([part(x, 0, z, w, b.height, d), white]);
      walls.block.push([part(x, 0, z - d / 2 - 1.6, Math.min(12, w * 0.3), 0.5, 3.2), white.clone().multiplyScalar(0.92)]);
      walls.block.push([part(x, 3.1, z - d / 2 - 1.6, Math.min(12, w * 0.3), 0.4, 3.4), white]);
      const arm = Math.min(w, d) * 0.7;
      const red = new THREE.Color(PALETTE.redCross);
      crosses.push([part(x, b.height, z, arm, 0.15, arm / 3.2), red], [part(x, b.height, z, arm / 3.2, 0.15, arm), red]);
      const fy = b.height - 4.5;
      crosses.push([part(x, fy, z - d / 2 - 0.06, 3.6, 1.15, 0.1), red], [part(x, fy - 1.25, z - d / 2 - 0.06, 1.15, 3.6, 0.1), red]);
      continue;
    }

    if (b.style === 'tower') {
      const { podium, inset } = towerShape(b, w, d);
      const sw = w - 2 * inset;
      const sd = d - 2 * inset;
      // A collapsed tower keeps its podium and the stump of its shaft.
      const shaft = damage === 'collapsed' ? (b.height - podium) * (0.3 + (h % 30) / 100) : b.height - podium;
      wallsOf.block.push([part(x, 0, z, w, podium, d), tone]);
      wallsOf.block.push([part(x, podium, z, sw, shaft, sd), pick(PALETTE.towerTones, h)]);
      if (damage === 'collapsed') {
        stumps(h, 'block', x, podium + shaft, z, sw, sd, 4 + (h % 3), 4, pick(PALETTE.towerTones, h));
        scatter(h * 3, x, podium, z, w, d, 8, 1.8, tone);
        scatter(h * 5, x, 0, z, w + 6, d + 6, 6, 1.4, tone);
      }
    } else if (b.style === 'house' || b.style === 'warehouse') {
      wallsOf[kind].push([part(x, 0, z, w, b.height, d), tone]);
      if (damage === 'collapsed') {
        // The roof has fallen in: rubble fills the shell and spills out of the doors.
        scatter(h, x, b.height * 0.5, z, w * 0.8, d * 0.8, 5 + Math.round((w * d) / 40), 1.5, tone);
        scatter(h * 7, x, 0, z, w + 3, d + 3, 4, 1.1, tone);
      } else if (b.style === 'house') {
        tiles.push([roof(x, b.height, z, w, d, Math.min(3.2, Math.max(1.6, Math.min(w, d) * 0.32)), 0.8), roofTone(PALETTE.roofTiles)]);
      } else if (h % 3 === 0) {
        sheets.push([roof(x, b.height, z, w, d, Math.min(w, d) * 0.12, 0.4), roofTone(PALETTE.metalRoofs)]);
      } else {
        barrels.push([roof(x, b.height, z, w, d, Math.min(w, d) * 0.2, 0.2), roofTone(PALETTE.metalRoofs)]);
      }
    } else {
      // A collapsed block loses its upper floors: a broken top with stumps, rubble on it and at its foot.
      const top = damage === 'collapsed' ? Math.max(3, Math.round(b.height * (0.4 + (h % 30) / 100))) : b.height;
      wallsOf.block.push([part(x, 0, z, w, top, d), tone]);
      if (damage === 'collapsed') {
        stumps(h, 'block', x, top, z, w, d, 4 + (h % 3), 3.5, tone);
        scatter(h * 3, x, top, z, w * 0.8, d * 0.8, 6, 1.6, tone);
        scatter(h * 5, x, 0, z, w + 6, d + 6, 6, 1.4, tone);
      }
    }
  }

  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  // Gable: a triangular prism one unit long (x), wide (z) and high (y), sitting on y = 0.
  const tri = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]);
  const gable = new THREE.ExtrudeGeometry(tri, { depth: 1, bevelEnabled: false });
  gable.translate(0, 0, -0.5);
  gable.rotateY(Math.PI / 2);
  // Barrel vault: half a cylinder along x, half a unit high, scaled to the rise.
  const barrel = new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1, false, 0, Math.PI);
  barrel.rotateZ(Math.PI / 2);
  barrel.scale(1, 2, 1);
  const add = (geo: THREE.BufferGeometry, material: THREE.Material, list: Part[], name: string) => {
    if (list.length === 0) return;
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach(([m, c], i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    group.add(mesh);
  };
  for (const kind of ['block', 'house', 'warehouse'] as const) {
    add(box, buildingMaterial(kind), walls[kind], 'buildings');
    add(box, buildingMaterial(kind, true), burnt[kind], 'buildings');
  }
  const chunk = new THREE.BoxGeometry(1, 1, 1);
  add(chunk, toon(), rubble, 'rubble');
  add(box, toon(), crosses, 'red_cross');
  add(gable, toon(), tiles, 'roofs');
  add(gable, toon(), sheets, 'roofs');
  add(barrel, toon(), barrels, 'roofs');
  return group;
}

/** Side of a culling chunk (metres): 32 cells. */
const CHUNK_M = 128;

/**
 * Split every large instanced mesh into square chunks with their own bounds, so the camera and the
 * shadow camera skip what they cannot see. On the 2 km city this cuts the drawn buildings, roofs and
 * trees to the few chunks around the view instead of all of them; the slice map has 16 chunks.
 */
function splitIntoChunks(root: THREE.Object3D, size: number): void {
  const meshes: THREE.InstancedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).count > 64) meshes.push(o as THREE.InstancedMesh);
  });
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  for (const mesh of meshes) {
    const buckets = new Map<string, number[]>();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      const key = `${Math.floor(m.elements[12] / size)},${Math.floor(m.elements[14] / size)}`;
      let list = buckets.get(key);
      if (!list) buckets.set(key, (list = []));
      list.push(i);
    }
    if (buckets.size < 2) continue;
    const parent = mesh.parent!;
    for (const list of buckets.values()) {
      const chunk = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
      list.forEach((src, i) => {
        mesh.getMatrixAt(src, m);
        chunk.setMatrixAt(i, m);
        if (mesh.instanceColor) {
          mesh.getColorAt(src, c);
          chunk.setColorAt(i, c);
        }
      });
      chunk.castShadow = mesh.castShadow;
      chunk.receiveShadow = mesh.receiveShadow;
      chunk.name = mesh.name;
      chunk.computeBoundingSphere();
      parent.add(chunk);
    }
    parent.remove(mesh);
    mesh.dispose();
  }
}

/** Map-scale overlay (district bounds, base and depot frames), shown only above the tactical view. */
export function buildDistrictOverlay(map: MapInfo): THREE.Group {
  const g = new THREE.Group();
  const cs = map.cellSize;
  for (const d of map.districts) g.add(rectOutline(d.x0 * cs + 1, d.y0 * cs + 1, (d.x1 + 1) * cs - 1, (d.y1 + 1) * cs - 1, PALETTE.district, 40));
  for (const s of map.sites) g.add(rectOutline(s.x0 * cs, s.y0 * cs, (s.x1 + 1) * cs, (s.y1 + 1) * cs, s.kind === 'base' ? PALETTE.base : PALETTE.depot, 40));
  return g;
}

/**
 * Beyond the playable map the city carries on into the dark: a ground apron fading to black and
 * low ruined blocks, so the camera never shows the edge of the world as a void.
 */
function buildOutskirts(map: MapInfo): THREE.Group {
  const group = new THREE.Group();
  const cs = map.cellSize;
  const wM = map.width * cs;
  const hM = map.height * cs;
  const pad = 420;
  const seg = 48;
  const geo = new THREE.PlaneGeometry(wM + pad * 2, hM + pad * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const near = new THREE.Color(PALETTE.street).multiplyScalar(0.8);
  const far = new THREE.Color(0x0c0e11);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + wM / 2;
    const z = pos.getZ(i) + hM / 2;
    const dx = Math.max(0, -x, x - wM);
    const dz = Math.max(0, -z, z - hM);
    const t = Math.min(1, Math.hypot(dx, dz) / 320);
    c.copy(near).lerp(far, t * t * (3 - 2 * t));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const apron = new THREE.Mesh(geo, toon({ vertexColors: true }));
  apron.position.set(wM / 2, -0.04, hM / 2);
  apron.receiveShadow = true;
  group.add(apron);

  // The street grid carries on: 48 m blocks split into one to four buildings, some collapsed to
  // rubble, lower and darker the further they stand from the playable city.
  const ruins: [THREE.Matrix4, THREE.Color][] = [];
  const step = 48;
  const street = 12;
  const tones = PALETTE.buildingTones.map((t) => new THREE.Color(t));
  for (let gy = -Math.ceil(pad / step) * step; gy < hM + pad; gy += step) {
    for (let gx = -Math.ceil(pad / step) * step; gx < wM + pad; gx += step) {
      if (gx + step > 0 && gx < wM && gy + step > 0 && gy < hM) continue;
      const dx = Math.max(0, -(gx + step), gx - wM);
      const dz = Math.max(0, -(gy + step), gy - hM);
      const fade = Math.min(1, Math.hypot(dx, dz) / 340);
      const h0 = hash((gx + 4096) * 7349 + (gy + 4096) * 3001);
      const split = 1 + (h0 % 4);
      const inner = step - street;
      for (let k = 0; k < split; k++) {
        const h = hash(h0 + k * 977);
        const vertical = split > 1 && h0 % 2 === 0;
        const part = inner / split;
        const w = vertical ? part - 1.5 : inner;
        const d = vertical ? inner : part - 1.5;
        const ox = gx + street / 2 + (vertical ? k * part : 0);
        const oy = gy + street / 2 + (vertical ? 0 : k * part);
        const collapsed = h % 4 === 0;
        const height = collapsed ? 1.5 + (h % 3) : (5 + ((h >>> 6) % 24)) * (1 - 0.7 * fade);
        const m = new THREE.Matrix4().makeScale(w, height, d).setPosition(ox + w / 2, 0, oy + d / 2);
        const col = tones[(h >>> 3) % tones.length].clone().lerp(new THREE.Color(0x55555a), 0.45);
        ruins.push([m, col.multiplyScalar((collapsed ? 0.55 : 0.75) * (1 - 0.85 * fade))]);
      }
    }
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const inst = new THREE.InstancedMesh(box, buildingMaterial(), ruins.length);
  ruins.forEach(([m, col], i) => {
    inst.setMatrixAt(i, m);
    inst.setColorAt(i, col);
  });
  inst.castShadow = true;
  inst.receiveShadow = true;
  group.add(inst);
  return group;
}

function groundGeometry(wM: number, hM: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(wM, hM);
  g.rotateX(-Math.PI / 2);
  // After rotation, uv v=1 sits at -z (north). Flip so texture row 0 is the map's row 0.
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  return g;
}

function groundTexture(map: MapInfo): THREE.DataTexture {
  const W = map.width * TPC;
  const H = map.height * TPC;
  const data = new Uint8Array(W * H * 4);
  const base: Record<number, number> = {
    [Ground.Street]: PALETTE.street,
    [Ground.Sidewalk]: PALETTE.sidewalk,
    [Ground.Lot]: PALETTE.lot,
    [Ground.Building]: PALETTE.lot,
    [Ground.Water]: PALETTE.water,
    [Ground.Park]: PALETTE.park,
  };
  const g = (cx: number, cy: number) => (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height ? -1 : map.ground[cy * map.width + cx]);
  const inSite = (cx: number, cy: number) => map.sites.some((st) => cx >= st.x0 && cx <= st.x1 && cy >= st.y0 && cy <= st.y1);
  const zones = new Array<DistrictZone>(map.width * map.height).fill('mixed');
  for (const d of map.districts) for (let y = d.y0; y <= d.y1; y++) for (let x = d.x0; x <= d.x1; x++) zones[y * map.width + x] = d.zone;
  for (let ty = 0; ty < H; ty++) {
    const cy = Math.floor(ty / TPC);
    const sy = ty % TPC;
    for (let tx = 0; tx < W; tx++) {
      const cx = Math.floor(tx / TPC);
      const sx = tx % TPC;
      const kind = g(cx, cy);
      let c = base[kind] ?? PALETTE.lot;
      let shade = 1 + ((hash(tx * 7919 + ty * 104729) % 9) - 4) / 100;
      const n1 = valueNoise(tx / 14, ty / 14, 1);
      const n2 = valueNoise(tx / 5, ty / 5, 2);
      let mix: number | null = null;
      let mixT = 0;
      if (kind === Ground.Street) {
        // Dashed centre lines where a street run is 2+ cells wide in one axis.
        const horiz = g(cx, cy - 1) !== Ground.Street || g(cx, cy + 1) !== Ground.Street;
        const vert = g(cx - 1, cy) !== Ground.Street || g(cx + 1, cy) !== Ground.Street;
        const nsStreet = g(cx, cy - 1) === Ground.Street && g(cx, cy + 1) === Ground.Street;
        const ewStreet = g(cx - 1, cy) === Ground.Street && g(cx + 1, cy) === Ground.Street;
        if (nsStreet && !ewStreet && vert && g(cx + 1, cy) === Ground.Street && sx === TPC - 1 && cy % 2 === 0) c = PALETTE.marking;
        if (ewStreet && !nsStreet && horiz && g(cx, cy + 1) === Ground.Street && sy === TPC - 1 && cx % 2 === 0) c = PALETTE.marking;
        if (c === PALETTE.marking) {
          // Worn paint: gaps where the asphalt shows through.
          if (n2 > 0.72) c = PALETTE.street;
        } else {
          // Patched asphalt, oil stains and cracks.
          shade *= 0.92 + 0.12 * n1;
          if (n2 < 0.12) shade *= 0.9;
          const crack = hash(Math.floor(tx / 6) * 31 + Math.floor(ty / 6) * 977) % 17 === 0 && Math.abs(((tx % 6) - (ty % 6))) < 1;
          if (crack) shade *= 0.82;
          const h = hash(cx * 5333 + cy * 9001);
          if (h % 37 === 0 && Math.hypot(sx - 3.5, sy - 3.5) < 1.6) shade *= 0.6; // manhole
        }
      } else if (kind === Ground.Sidewalk) {
        if (sx === 0 || sy === 0) shade *= 0.9; // paving slabs
        const curb = (g(cx - 1, cy) === Ground.Street && sx === 0) || (g(cx + 1, cy) === Ground.Street && sx === TPC - 1) || (g(cx, cy - 1) === Ground.Street && sy === 0) || (g(cx, cy + 1) === Ground.Street && sy === TPC - 1);
        if (curb) c = PALETTE.curb;
      } else if (kind === Ground.Park) {
        // Uneven grass: lighter dry patches, darker clumps, tufts.
        shade *= 0.88 + 0.22 * n1 + ((hash(tx * 31 + ty * 17) % 13) - 6) / 50;
        if (n2 > 0.75) {
          mix = 0x6b6a3e;
          mixT = 0.5;
        }
      } else if ((kind === Ground.Lot || kind === Ground.Building) && zones[cy * map.width + cx] === 'residential' && !inSite(cx, cy)) {
        // House gardens: overgrown lawns with bare patches.
        mix = n1 > 0.62 ? 0x5a553f : PALETTE.garden;
        mixT = 0.6 + 0.25 * n2;
        shade *= 0.88 + 0.2 * n1 + ((hash(tx * 31 + ty * 17) % 13) - 6) / 60;
      } else if ((kind === Ground.Lot || kind === Ground.Building) && zones[cy * map.width + cx] === 'industrial' && !inSite(cx, cy)) {
        // Industrial yards: concrete slabs with oil stains.
        c = PALETTE.yard;
        if ((sx === 0 && cx % 3 === 0) || (sy === 0 && cy % 3 === 0)) shade *= 0.85;
        if (n2 < 0.18) shade *= 0.78;
        shade *= 0.94 + 0.1 * n1;
      } else if ((kind === Ground.Lot || kind === Ground.Building) && !inSite(cx, cy)) {
        // Empty lots: dirt, weeds and broken concrete.
        mix = n1 > 0.55 ? 0x56513f : 0x4f5a39;
        mixT = 0.35 + 0.4 * Math.abs(n1 - 0.55);
        shade *= 0.9 + 0.2 * n2;
        if (hash(tx * 4241 + ty * 7577) % 23 === 0) shade *= 1.25; // rubble
      } else if (kind === Ground.Lot && inSite(cx, cy)) {
        // Bases and depots sit on a gravel pad with concrete slab joints and worn vehicle tracks.
        c = PALETTE.basePad;
        if ((sx === 0 && cx % 2 === 0) || (sy === 0 && cy % 2 === 0)) shade *= 0.86;
        if ((cx + cy) % 7 === 0 && (sx === 2 || sx === 5)) shade *= 0.9;
        shade *= 1 + ((hash(tx * 131 + ty * 977) % 7) - 3) / 40;
        // Hazard paint along the perimeter of the pad.
        const st = map.sites.find((q) => cx >= q.x0 && cx <= q.x1 && cy >= q.y0 && cy <= q.y1)!;
        const edge = (cx === st.x0 && sx < 2) || (cx === st.x1 && sx >= TPC - 2) || (cy === st.y0 && sy < 2) || (cy === st.y1 && sy >= TPC - 2);
        if (edge) {
          c = (Math.floor((tx + ty) / 3) % 2 === 0) ? 0xc9a23a : 0x2a2a28;
          shade = n2 > 0.8 ? 0.8 : 1;
        }
      }
      // Contact shadow at the foot of buildings (cheap ambient occlusion).
      if (kind !== Ground.Building) {
        const ao = Math.min(
          g(cx - 1, cy) === Ground.Building ? sx : 9,
          g(cx + 1, cy) === Ground.Building ? TPC - 1 - sx : 9,
          g(cx, cy - 1) === Ground.Building ? sy : 9,
          g(cx, cy + 1) === Ground.Building ? TPC - 1 - sy : 9,
        );
        if (ao < 3) shade *= 0.66 + ao * 0.11;
      }
      let r = (c >> 16) & 255;
      let gg = (c >> 8) & 255;
      let bb = c & 255;
      if (mix !== null) {
        r += (((mix >> 16) & 255) - r) * mixT;
        gg += (((mix >> 8) & 255) - gg) * mixT;
        bb += ((mix & 255) - bb) * mixT;
      }
      const o = (ty * W + tx) * 4;
      data[o] = Math.min(255, r * shade);
      data[o + 1] = Math.min(255, gg * shade);
      data[o + 2] = Math.min(255, bb * shade);
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Cosmetic props: trees in parks and lamp posts on sidewalk corners. They do not block movement. */
function buildProps(map: MapInfo): THREE.Group {
  const group = new THREE.Group();
  const cs = map.cellSize;
  const trees: [number, number, number][] = [];
  const lamps: [number, number][] = [];
  for (let cy = 0; cy < map.height; cy++) {
    for (let cx = 0; cx < map.width; cx++) {
      const k = map.ground[cy * map.width + cx];
      const h = hash(cx * 73856093 ^ cy * 19349663);
      if (k === Ground.Park && h % 2 === 0) trees.push([(cx + 0.2 + (h % 60) / 100) * cs, (cy + 0.2 + ((h >> 8) % 60) / 100) * cs, 0.8 + ((h >> 4) % 50) / 100]);
      if (k === Ground.Sidewalk && h % 19 === 0) lamps.push([(cx + 0.5) * cs, (cy + 0.5) * cs]);
    }
  }
  const m = new THREE.Matrix4();
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 2, 5);
  trunkGeo.translate(0, 1, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1.6, 0);
  crownGeo.translate(0, 3.2, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, toon({ color: PALETTE.trunk }), Math.max(1, trees.length));
  const crowns = new THREE.InstancedMesh(crownGeo, toon({ color: PALETTE.foliage }), Math.max(1, trees.length));
  trees.forEach(([x, y, s], i) => {
    m.makeScale(s, s, s).setPosition(x, 0, y);
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
  });
  trunks.count = crowns.count = trees.length;
  for (const mesh of [trunks, crowns]) {
    mesh.castShadow = true;
    group.add(mesh);
  }
  const poleGeo = new THREE.BoxGeometry(0.2, 5, 0.2);
  poleGeo.translate(0, 2.5, 0);
  const headGeo = new THREE.BoxGeometry(0.5, 0.15, 0.25);
  headGeo.translate(0, 5, 0);
  const poles = new THREE.InstancedMesh(poleGeo, toon({ color: PALETTE.pole }), Math.max(1, lamps.length));
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: PALETTE.lampHead }), Math.max(1, lamps.length));
  lamps.forEach(([x, y], i) => {
    m.makeTranslation(x, 0, y);
    poles.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
  });
  poles.count = heads.count = lamps.length;
  poles.castShadow = true;
  group.add(poles, heads);
  group.userData.lamps = lamps;
  return group;
}

function rectOutline(x0: number, y0: number, x1: number, y1: number, color: number, y: number): THREE.LineLoop {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x0, y, y0),
    new THREE.Vector3(x1, y, y0),
    new THREE.Vector3(x1, y, y1),
    new THREE.Vector3(x0, y, y1),
  ]);
  return new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color }));
}

/** Smooth 0..1 value noise on a unit lattice, for large-scale ground variation. */
function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const v = (i: number, j: number) => (hash((x0 + i) * 73856093 ^ (y0 + j) * 19349663 ^ seed * 83492791) % 1024) / 1023;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = v(0, 0) + (v(1, 0) - v(0, 0)) * sx;
  const b = v(0, 1) + (v(1, 1) - v(0, 1)) * sx;
  return a + (b - a) * sy;
}

/** Small integer hash for stable cosmetic variation. */
export function hash(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}
