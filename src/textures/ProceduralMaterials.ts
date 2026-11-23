import * as THREE from 'three';

export interface MaterialLibrary {
  torosStone: THREE.MeshStandardMaterial;
  darkFortressStone: THREE.MeshStandardMaterial;
  cedarWood: THREE.MeshStandardMaterial;
  charredWood: THREE.MeshStandardMaterial;
  damascusSteel: THREE.MeshPhysicalMaterial;
  wroughtIron: THREE.MeshStandardMaterial;
  hammeredCopper: THREE.MeshStandardMaterial;
  buffaloLeather: THREE.MeshStandardMaterial;
  rawLinen: THREE.MeshStandardMaterial;
  hearthCoals: THREE.MeshStandardMaterial;
  alpineRock: THREE.MeshStandardMaterial;
  forestFloor: THREE.MeshStandardMaterial;
  snowCrust: THREE.MeshStandardMaterial;
  mountainWater: THREE.MeshPhysicalMaterial;
  parchmentMap: THREE.MeshStandardMaterial;
  copperOreVein: THREE.MeshStandardMaterial;
  ironOreVein: THREE.MeshStandardMaterial;
  enemyPlate: THREE.MeshStandardMaterial;
  warlordArmor: THREE.MeshPhysicalMaterial;
  dispose: () => void;
}

// Deterministic pseudo-random helper for repeatable artisanal textures
function hash2d(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function fbm(x: number, y: number, octaves = 4): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    const xi = Math.floor(x * freq);
    const yi = Math.floor(y * freq);
    const xf = x * freq - xi;
    const yf = y * freq - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash2d(xi, yi);
    const b = hash2d(xi + 1, yi);
    const c = hash2d(xi, yi + 1);
    const d = hash2d(xi + 1, yi + 1);
    value += amp * ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v);
    freq *= 2.02;
    amp *= 0.5;
  }
  return value;
}

function makeCanvas(size = 512): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  repeatX: number,
  repeatY: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createMaterialLibrary(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean
): MaterialLibrary {
  const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy() || 4, isSoftwareGl ? 2 : 8);
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];

  const trackTex = (t: THREE.Texture) => {
    textures.push(t);
    return t;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // 1. Cut Toros Limestone Ashlar (Color + Bump)
  const [stoneColC, stoneColCtx] = makeCanvas(512);
  const [stoneBumpC, stoneBumpCtx] = makeCanvas(512);
  {
    const imgC = stoneColCtx.createImageData(512, 512);
    const imgB = stoneBumpCtx.createImageData(512, 512);
    const rows = 8;
    const rowH = 512 / rows;
    for (let y = 0; y < 512; y++) {
      const row = Math.floor(y / rowH);
      const localY = y % rowH;
      const offset = (row % 2) * 64;
      const blockW = 128;
      for (let x = 0; x < 512; x++) {
        const bx = (x + offset) % 512;
        const blockIdx = Math.floor(bx / blockW);
        const localX = bx % blockW;
        const isMortar = localY < 4 || localY > rowH - 3 || localX < 4 || localX > blockW - 3;
        const n = fbm(x * 0.045, y * 0.045, 4);
        const chisel = Math.sin((x + y * 0.4) * 0.65) * 0.08 + hash2d(x * 0.2, y * 0.2) * 0.08;
        const blockTone = (hash2d(blockIdx + row * 17, row * 31) - 0.5) * 26;
        const idx = (y * 512 + x) * 4;
        if (isMortar) {
          imgC.data[idx] = 58 + n * 18;
          imgC.data[idx + 1] = 52 + n * 16;
          imgC.data[idx + 2] = 46 + n * 14;
          imgC.data[idx + 3] = 255;
          imgB.data[idx] = imgB.data[idx + 1] = imgB.data[idx + 2] = 35;
          imgB.data[idx + 3] = 255;
        } else {
          const base = 118 + blockTone + (n - 0.5) * 42 + chisel * 24;
          imgC.data[idx] = Math.min(255, Math.max(0, base + 12));
          imgC.data[idx + 1] = Math.min(255, Math.max(0, base + 3));
          imgC.data[idx + 2] = Math.min(255, Math.max(0, base - 10));
          imgC.data[idx + 3] = 255;
          const bVal = Math.min(255, Math.max(0, 145 + (n - 0.5) * 90 + chisel * 55));
          imgB.data[idx] = imgB.data[idx + 1] = imgB.data[idx + 2] = bVal;
          imgB.data[idx + 3] = 255;
        }
      }
    }
    stoneColCtx.putImageData(imgC, 0, 0);
    stoneBumpCtx.putImageData(imgB, 0, 0);
  }
  const stoneMap = trackTex(finalizeTexture(stoneColC, true, 2, 2, maxAniso));
  const stoneBump = trackTex(finalizeTexture(stoneBumpC, false, 2, 2, maxAniso));

  const torosStone = trackMat(
    new THREE.MeshStandardMaterial({
      map: stoneMap,
      bumpMap: stoneBump,
      bumpScale: 0.14,
      roughness: 0.88,
      metalness: 0.04,
    })
  );

  const darkFortressStone = trackMat(
    new THREE.MeshStandardMaterial({
      map: stoneMap,
      bumpMap: stoneBump,
      bumpScale: 0.16,
      color: 0x998e82,
      roughness: 0.9,
      metalness: 0.05,
    })
  );

  // 2. Burnt Taurus Cedar Timber (Color + Bump)
  const [woodColC, woodColCtx] = makeCanvas(512);
  const [woodBumpC, woodBumpCtx] = makeCanvas(512);
  {
    const imgC = woodColCtx.createImageData(512, 512);
    const imgB = woodBumpCtx.createImageData(512, 512);
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const warp = fbm(x * 0.015, y * 0.06, 3) * 14;
        const grain = Math.sin((x * 0.18 + warp) * 1.4) * 0.5 + 0.5;
        const fine = fbm(x * 0.25, y * 0.025, 3);
        const knot = Math.max(0, 1 - Math.hypot(x - 210, (y - 260) * 0.38) / 36);
        const plankSeam = x % 128 < 3 ? 0.45 : 1.0;
        const shade = (0.52 + grain * 0.3 + fine * 0.18 - knot * 0.28) * plankSeam;
        const idx = (y * 512 + x) * 4;
        imgC.data[idx] = Math.min(255, shade * 116);
        imgC.data[idx + 1] = Math.min(255, shade * 72);
        imgC.data[idx + 2] = Math.min(255, shade * 42);
        imgC.data[idx + 3] = 255;
        const b = Math.min(255, Math.max(0, (grain * 120 + fine * 80) * plankSeam));
        imgB.data[idx] = imgB.data[idx + 1] = imgB.data[idx + 2] = b;
        imgB.data[idx + 3] = 255;
      }
    }
    woodColCtx.putImageData(imgC, 0, 0);
    woodBumpCtx.putImageData(imgB, 0, 0);
  }
  const woodMap = trackTex(finalizeTexture(woodColC, true, 1, 1, maxAniso));
  const woodBump = trackTex(finalizeTexture(woodBumpC, false, 1, 1, maxAniso));

  const cedarWood = trackMat(
    new THREE.MeshStandardMaterial({
      map: woodMap,
      bumpMap: woodBump,
      bumpScale: 0.08,
      roughness: 0.78,
      metalness: 0.04,
    })
  );

  const charredWood = trackMat(
    new THREE.MeshStandardMaterial({
      map: woodMap,
      bumpMap: woodBump,
      bumpScale: 0.1,
      color: 0x4b382c,
      roughness: 0.9,
      metalness: 0.05,
    })
  );

  // 3. Hand-Forged Damascus Steel (Acid-etched folding layers)
  const [damC, damCtx] = makeCanvas(512);
  const [damRoughC, damRoughCtx] = makeCanvas(512);
  {
    const imgC = damCtx.createImageData(512, 512);
    const imgR = damRoughCtx.createImageData(512, 512);
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const swirl = fbm(x * 0.025, y * 0.025, 4) * 18;
        const wave = Math.sin(y * 0.12 + x * 0.035 + swirl) * 0.5 + 0.5;
        const bands = Math.sin(wave * Math.PI * 5) * 0.5 + 0.5;
        const brush = fbm(x * 0.4, y * 0.04, 2) * 0.15;
        const val = 115 + bands * 85 + brush * 30;
        const idx = (y * 512 + x) * 4;
        imgC.data[idx] = val;
        imgC.data[idx + 1] = val + 4;
        imgC.data[idx + 2] = val + 12;
        imgC.data[idx + 3] = 255;
        const rVal = 48 + (1 - bands) * 76;
        imgR.data[idx] = imgR.data[idx + 1] = imgR.data[idx + 2] = rVal;
        imgR.data[idx + 3] = 255;
      }
    }
    damCtx.putImageData(imgC, 0, 0);
    damRoughCtx.putImageData(imgR, 0, 0);
  }
  const damMap = trackTex(finalizeTexture(damC, true, 1, 2, maxAniso));
  const damRough = trackTex(finalizeTexture(damRoughC, false, 1, 2, maxAniso));

  const damascusSteel = trackMat(
    new THREE.MeshPhysicalMaterial({
      map: damMap,
      roughnessMap: damRough,
      metalness: 0.94,
      roughness: 0.34,
      anisotropy: 0.72,
      anisotropyRotation: 0.3,
      clearcoat: 0.25,
      clearcoatRoughness: 0.25,
    })
  );

  const wroughtIron = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b3d42,
      bumpMap: stoneBump,
      bumpScale: 0.025,
      metalness: 0.85,
      roughness: 0.54,
    })
  );

  // 4. Hammered Copper
  const [copC, copCtx] = makeCanvas(256);
  {
    const img = copCtx.createImageData(256, 256);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const peen = Math.sin(x * 0.35) * Math.cos(y * 0.35) * 0.5 + 0.5;
        const n = fbm(x * 0.06, y * 0.06, 3);
        const idx = (y * 256 + x) * 4;
        img.data[idx] = 185 + peen * 35 + n * 20;
        img.data[idx + 1] = 104 + peen * 24 + n * 16;
        img.data[idx + 2] = 62 + peen * 12 + n * 10;
        img.data[idx + 3] = 255;
      }
    }
    copCtx.putImageData(img, 0, 0);
  }
  const copperMap = trackTex(finalizeTexture(copC, true, 1, 1, maxAniso));

  const hammeredCopper = trackMat(
    new THREE.MeshStandardMaterial({
      map: copperMap,
      bumpMap: copperMap,
      bumpScale: 0.02,
      metalness: 0.88,
      roughness: 0.32,
    })
  );

  // 5. Buffalo Leather (Apron & Bellows)
  const [leathC, leathCtx] = makeCanvas(256);
  {
    const img = leathCtx.createImageData(256, 256);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const pore = fbm(x * 0.14, y * 0.14, 3);
        const scuff = fbm(x * 0.03, y * 0.03, 3);
        const idx = (y * 256 + x) * 4;
        img.data[idx] = 68 + pore * 28 + scuff * 18;
        img.data[idx + 1] = 39 + pore * 16 + scuff * 10;
        img.data[idx + 2] = 24 + pore * 10 + scuff * 6;
        img.data[idx + 3] = 255;
      }
    }
    leathCtx.putImageData(img, 0, 0);
  }
  const leatherMap = trackTex(finalizeTexture(leathC, true, 1, 1, maxAniso));

  const buffaloLeather = trackMat(
    new THREE.MeshStandardMaterial({
      map: leatherMap,
      bumpMap: leatherMap,
      bumpScale: 0.03,
      roughness: 0.72,
      metalness: 0.05,
    })
  );

  // 6. Raw Linen Shirt
  const [linC, linCtx] = makeCanvas(256);
  {
    const img = linCtx.createImageData(256, 256);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const weave = ((x % 4 < 2 ? 1 : 0) ^ (y % 4 < 2 ? 1 : 0)) ? 14 : -10;
        const n = fbm(x * 0.06, y * 0.06, 2) * 18;
        const idx = (y * 256 + x) * 4;
        img.data[idx] = 194 + weave + n;
        img.data[idx + 1] = 180 + weave + n;
        img.data[idx + 2] = 156 + weave + n;
        img.data[idx + 3] = 255;
      }
    }
    linCtx.putImageData(img, 0, 0);
  }
  const linenMap = trackTex(finalizeTexture(linC, true, 2, 2, maxAniso));

  const rawLinen = trackMat(
    new THREE.MeshStandardMaterial({
      map: linenMap,
      roughness: 0.92,
      metalness: 0.0,
    })
  );

  // 7. Hearth Coals + Emissive Ember Cracks
  const [coalC, coalCtx] = makeCanvas(256);
  const [coalEmC, coalEmCtx] = makeCanvas(256);
  {
    const imgC = coalCtx.createImageData(256, 256);
    const imgE = coalEmCtx.createImageData(256, 256);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const n = fbm(x * 0.07, y * 0.07, 4);
        const crack = Math.max(0, 1 - Math.abs(n - 0.5) * 9);
        const idx = (y * 256 + x) * 4;
        imgC.data[idx] = 26 + crack * 160;
        imgC.data[idx + 1] = 22 + crack * 45;
        imgC.data[idx + 2] = 20;
        imgC.data[idx + 3] = 255;

        imgE.data[idx] = crack * 255;
        imgE.data[idx + 1] = crack * crack * 110;
        imgE.data[idx + 2] = crack * crack * 18;
        imgE.data[idx + 3] = 255;
      }
    }
    coalCtx.putImageData(imgC, 0, 0);
    coalEmCtx.putImageData(imgE, 0, 0);
  }
  const coalMap = trackTex(finalizeTexture(coalC, true, 1, 1, maxAniso));
  const coalEmissive = trackTex(finalizeTexture(coalEmC, true, 1, 1, maxAniso));

  const hearthCoals = trackMat(
    new THREE.MeshStandardMaterial({
      map: coalMap,
      emissiveMap: coalEmissive,
      emissive: new THREE.Color(0xff5511),
      emissiveIntensity: 1.6,
      roughness: 0.9,
      metalness: 0.1,
    })
  );

  // 8. Alpine Taurus Rock, Forest Floor, Snow Crust
  const [rockC, rockCtx] = makeCanvas(512);
  {
    const img = rockCtx.createImageData(512, 512);
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const n = fbm(x * 0.03, y * 0.03, 5);
        const strata = Math.sin(y * 0.06 + n * 6) * 14;
        const idx = (y * 512 + x) * 4;
        const base = 92 + n * 52 + strata;
        img.data[idx] = Math.min(255, Math.max(0, base + 6));
        img.data[idx + 1] = Math.min(255, Math.max(0, base + 2));
        img.data[idx + 2] = Math.min(255, Math.max(0, base - 4));
        img.data[idx + 3] = 255;
      }
    }
    rockCtx.putImageData(img, 0, 0);
  }
  const rockMap = trackTex(finalizeTexture(rockC, true, 6, 6, maxAniso));

  const alpineRock = trackMat(
    new THREE.MeshStandardMaterial({
      map: rockMap,
      bumpMap: rockMap,
      bumpScale: 0.25,
      roughness: 0.92,
      metalness: 0.03,
      vertexColors: true,
    })
  );

  const forestFloor = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b452c,
      bumpMap: rockMap,
      bumpScale: 0.12,
      roughness: 0.95,
      metalness: 0.0,
    })
  );

  const snowCrust = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe3e8ef,
      bumpMap: rockMap,
      bumpScale: 0.08,
      roughness: 0.72,
      metalness: 0.02,
    })
  );

  const mountainWater = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x2c5c6b,
      roughness: 0.16,
      metalness: 0.05,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12,
      transparent: true,
      opacity: 0.86,
    })
  );

  // 9. Hand-Inked Parchment Map Texture on the Workshop Oak Table
  const [parchC, parchCtx] = makeCanvas(512);
  {
    parchCtx.fillStyle = '#d7c39c';
    parchCtx.fillRect(0, 0, 512, 512);
    // Paper mottling
    for (let i = 0; i < 1600; i++) {
      const rx = hash2d(i, 3) * 512;
      const ry = hash2d(i, 9) * 512;
      parchCtx.fillStyle = i % 2 === 0 ? 'rgba(130,96,58,0.06)' : 'rgba(245,232,200,0.06)';
      parchCtx.fillRect(rx, ry, 18, 12);
    }
    // Hand-drawn ink border & topographic contours
    parchCtx.strokeStyle = '#47301c';
    parchCtx.lineWidth = 3;
    parchCtx.strokeRect(18, 18, 476, 476);
    parchCtx.lineWidth = 1.2;
    for (let r = 36; r < 180; r += 26) {
      parchCtx.beginPath();
      parchCtx.ellipse(256, 110, r * 1.4, r * 0.7, 0.15, 0, Math.PI * 2);
      parchCtx.stroke();
    }
    // River path
    parchCtx.strokeStyle = '#2d4d5e';
    parchCtx.lineWidth = 4;
    parchCtx.beginPath();
    parchCtx.moveTo(80, 40);
    parchCtx.bezierCurveTo(210, 180, 260, 290, 290, 480);
    parchCtx.stroke();
    // Title calligraphy
    parchCtx.fillStyle = '#2b1b0e';
    parchCtx.font = 'bold 20px Georgia, serif';
    parchCtx.fillText('TOROS GEÇİDİ SAVUNMA KROKİSİ', 64, 58);
    parchCtx.font = 'italic 14px Georgia, serif';
    parchCtx.fillText('Kızılgeçit · Sedir Ormanı · Kanyon · Maden · Zirve', 76, 466);
    // Red wax seal
    parchCtx.fillStyle = '#8b211a';
    parchCtx.beginPath();
    parchCtx.arc(430, 420, 22, 0, Math.PI * 2);
    parchCtx.fill();
  }
  const parchTex = trackTex(finalizeTexture(parchC, true, 1, 1, maxAniso));
  const parchmentMap = trackMat(
    new THREE.MeshStandardMaterial({
      map: parchTex,
      roughness: 0.85,
      metalness: 0.02,
    })
  );

  const copperOreVein = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b4a46,
      emissive: new THREE.Color(0xb45c2a),
      emissiveIntensity: 0.35,
      roughness: 0.55,
      metalness: 0.65,
    })
  );

  const ironOreVein = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x454952,
      emissive: new THREE.Color(0x3a4859),
      emissiveIntensity: 0.25,
      roughness: 0.48,
      metalness: 0.78,
    })
  );

  const enemyPlate = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2b292c,
      roughness: 0.42,
      metalness: 0.85,
    })
  );

  const warlordArmor = trackMat(
    new THREE.MeshPhysicalMaterial({
      map: damMap,
      color: 0x2a1f1d,
      roughness: 0.32,
      metalness: 0.92,
      clearcoat: 0.4,
    })
  );

  return {
    torosStone,
    darkFortressStone,
    cedarWood,
    charredWood,
    damascusSteel,
    wroughtIron,
    hammeredCopper,
    buffaloLeather,
    rawLinen,
    hearthCoals,
    alpineRock,
    forestFloor,
    snowCrust,
    mountainWater,
    parchmentMap,
    copperOreVein,
    ironOreVein,
    enemyPlate,
    warlordArmor,
    dispose: () => {
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
