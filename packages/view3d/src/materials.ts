import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** Three-band toon ramp shared by every lit material. */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

export function toon(params: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ gradientMap: toonGradient(), ...params });
}

/** Shared by every building: 0 by day, 1 at night (lit windows). */
export const cityUniforms = { uNight: { value: 0 } };

/** Which facade a building wall paints: apartment block, house or warehouse. */
export type FacadeKind = 'block' | 'house' | 'warehouse';

/** Wall painting per facade, inside the shader's wall branch (`along`, `across` and `diffuseColor` in scope; sets `litWindow`). */
const FACADES: Record<FacadeKind, string> = {
  block: `
          float floorY = fract(vWorldPos.y / 3.0);
          float col = fract(along / 2.6);
          float window = step(0.35, floorY) * step(floorY, 0.8) * step(0.25, col) * step(col, 0.75);
          // Ground floor: shop fronts, no windows above 0.5 m slab line.
          float ground = 1.0 - step(3.0, vWorldPos.y);
          float slab = step(0.94, floorY);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.15, 0.19), window * (1.0 - ground) * 0.85);
          // A few windows stay lit at night: survivors, or lights nobody switched off.
          vec3 cellId = vec3(floor(along / 2.6), floor(vWorldPos.y / 3.0), floor(across * 0.5));
          float rnd = fract(sin(dot(cellId, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          litWindow = window * (1.0 - ground) * step(0.86, rnd);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.18, 0.16), ground * step(0.3, col) * step(col, 0.9) * step(0.15, floorY) * 0.7);
          diffuseColor.rgb *= 1.0 - slab * 0.18;`,
  // Small shuttered windows on every floor, a door now and then, and a darker plinth.
  house: `
          float floorY = fract(vWorldPos.y / 3.0);
          float col = fract((along + 1.1) / 3.4);
          float band = step(0.36, floorY) * step(floorY, 0.76);
          float window = band * step(0.34, col) * step(col, 0.62);
          float shutter = band * (step(0.24, col) * step(col, 0.33) + step(0.63, col) * step(col, 0.72));
          vec3 cellId = vec3(floor((along + 1.1) / 3.4), floor(vWorldPos.y / 3.0), floor(across * 0.5));
          float rnd = fract(sin(dot(cellId, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float door = (1.0 - step(2.3, vWorldPos.y)) * step(0.36, col) * step(col, 0.6) * step(0.8, rnd);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.14, 0.16), window * (1.0 - door) * 0.85);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28, 0.34, 0.28), shutter * 0.65);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.2, 0.14), door * 0.85);
          diffuseColor.rgb *= 1.0 - 0.22 * (1.0 - step(0.6, vWorldPos.y));
          litWindow = window * (1.0 - door) * step(0.8, fract(rnd * 7.13));`,
  // Corrugated sheet walls with rust streaks, roller doors along the base, no windows.
  warehouse: `
          float rib = step(0.5, fract(along / 0.7));
          diffuseColor.rgb *= 0.92 + 0.08 * rib;
          float strip = floor(along / 0.7);
          float rust = step(0.82, fract(sin(strip * 91.17 + floor(across) * 3.1) * 43758.5453));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.26, 0.16), rust * 0.35 * (1.0 - smoothstep(0.0, 7.0, vWorldPos.y)));
          float bay = fract(along / 15.0);
          float door = step(0.38, bay) * step(bay, 0.62) * (1.0 - step(4.4, vWorldPos.y));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.31, 0.32), door * 0.85);
          diffuseColor.rgb *= 1.0 - door * step(0.8, fract(vWorldPos.y / 0.45)) * 0.18;
          diffuseColor.rgb *= 1.0 - 0.25 * (1.0 - step(0.9, vWorldPos.y));`,
};

/** Burnt out, after the facade: soot climbs the wall in uneven columns, the glass is gone and nothing is lit. */
const BURNT_WALL = `
          float sootCol = fract(sin(floor(along / 1.3) * 78.233 + floor(across * 0.5) * 12.9898) * 43758.5453);
          float sootFloor = fract(vWorldPos.y / 3.0);
          diffuseColor.rgb *= 0.42 + 0.3 * sootCol * (1.0 - 0.5 * sootFloor);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04, 0.035, 0.03), step(0.55, sootCol) * smoothstep(0.2, 0.9, sootFloor) * 0.55);
          litWindow = 0.0;`;

/**
 * Toon material for buildings that paints floors, windows and a roof parapet procedurally
 * from world position, so instanced boxes read as buildings without textures.
 */
export function buildingMaterial(kind: FacadeKind = 'block', burnt = false): THREE.MeshToonMaterial {
  const m = toon();
  // Every facade shares one onBeforeCompile source, so tell them apart in the program cache.
  m.customProgramCacheKey = () => `building-${kind}${burnt ? '-burnt' : ''}`;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = cityUniforms.uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        vWorldPos = wp.xyz;
        mat3 nm = mat3(modelMatrix);
        #ifdef USE_INSTANCING
          nm = nm * mat3(instanceMatrix);
        #endif
        vWorldNormal = normalize(nm * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;\nuniform float uNight;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.68, 0.34) * litWindow * uNight * 0.55;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float litWindow = 0.0;
        vec3 n = normalize(vWorldNormal);
        if (n.y > 0.5) {
          // Roof: darker with a light parapet line every few metres for texture.
          diffuseColor.rgb *= 0.62;
          float g = step(0.92, fract(vWorldPos.x * 0.25)) + step(0.92, fract(vWorldPos.z * 0.25));
          diffuseColor.rgb *= 1.0 - 0.08 * clamp(g, 0.0, 1.0);
          ${burnt ? 'diffuseColor.rgb *= 0.45;' : ''}
        } else {
          float along = abs(n.x) > 0.5 ? vWorldPos.z : vWorldPos.x;
          float across = abs(n.x) > 0.5 ? vWorldPos.x : vWorldPos.z;
          ${FACADES[kind]}
          ${burnt ? BURNT_WALL : ''}
        }`,
      );
  };
  return m;
}
