import * as THREE from 'three';
import { MaterialLibrary } from '../textures/ProceduralMaterials';
import { RegionId } from '../types/game';

export interface InteractiveStation {
  id: string;
  labelTr: string;
  labelEn: string;
  position: THREE.Vector3;
  radius: number;
  mesh: THREE.Object3D;
}

export interface BuiltWorld {
  group: THREE.Group;
  stations: InteractiveStation[];
  interactables: THREE.Object3D[];
  // Animated components
  waterwheel: THREE.Group;
  bellowsPaddle: THREE.Group;
  hearthLight: THREE.PointLight;
  forgeMetalGroup: THREE.Group;
  forgeMetalMeshes: THREE.Mesh[];
  forgeMetalMats: THREE.MeshStandardMaterial[];
  catapultArm: THREE.Group;
  catapultBoulder: THREE.Mesh;
  drawbridgeLeaf: THREE.Group;
  ballistaTurret: THREE.Group;
  oilPourMesh: THREE.Mesh;
  streamWaterMesh: THREE.Mesh;
  warlordBrazierLights: THREE.PointLight[];
  mineCart: THREE.Group;
  dispose: () => void;
}

// Single continuous terrain height function for the entire 5-region Toros Valley
export function groundHeightAt(x: number, z: number): number {
  // 1. Crimson Keep central plateau (r < 22)
  const keepDist = Math.hypot(x, z);

  // Alpine stream trench running along x = -11.5 (north to south, curving into gorge)
  const streamCenterX = -11.5 + Math.sin(z * 0.04) * 3.5;
  const distToStream = Math.abs(x - streamCenterX);
  let streamCarve = 0;
  if (z > -45 && z < 80 && distToStream < 5.5) {
    const t = 1 - distToStream / 5.5;
    streamCarve = -2.2 * t * t;
  }

  // Deep Canyon Gorge running E-W around z = 64
  let gorgeCarve = 0;
  if (Math.abs(z - 64) < 16) {
    const t = 1 - Math.abs(z - 64) / 16;
    gorgeCarve = -10.5 * t * t;
  }

  // Northern Switchback Road & Eagle's Crag Peak (around x = 0, z = -74)
  let peakRise = 0;
  if (z < -22) {
    const northDist = Math.min(1, (-22 - z) / 52);
    const corridorWidth = Math.abs(x) < 18 ? 1 : Math.max(0, 1 - (Math.abs(x) - 18) / 26);
    peakRise = Math.pow(northDist, 1.35) * 12.6 * (0.45 + 0.55 * corridorWidth);
  }
  // Flatten the Eagle's Crag arena at top (0, -74)
  const cragDist = Math.hypot(x, z + 74);
  if (cragDist < 13) {
    const flatBlend = 1 - cragDist / 13;
    peakRise = THREE.MathUtils.lerp(peakRise, 12.5, flatBlend * 0.85);
  }

  // Cedar Woods gentle rolling hills (-54, 36)
  const woodsHills =
    Math.sin(x * 0.07) * Math.cos(z * 0.07) * 1.1 +
    Math.sin(x * 0.14 + z * 0.11) * 0.4;

  // Outer Taurus Mountain Ring (r > 88)
  let outerRing = 0;
  if (keepDist > 86) {
    const rim = (keepDist - 86) / 48;
    const ridgeNoise = Math.sin(Math.atan2(z, x) * 7) * 0.35 + Math.cos(x * 0.05) * 0.25 + 0.85;
    outerRing = Math.pow(rim, 1.65) * 34 * ridgeNoise;
  }

  // Base elevation = 2.0m
  let h = 2.0 + woodsHills * (keepDist < 22 ? 0.04 : 1.0) + peakRise + streamCarve + gorgeCarve + outerRing;

  // Flatten Crimson Keep interior courtyard
  if (keepDist < 19 && distToStream > 4.5) {
    const keepFlat = Math.max(0, 1 - Math.max(0, keepDist - 14) / 5);
    h = THREE.MathUtils.lerp(h, 2.0, keepFlat);
  }

  // Flatten Deep Ore Mines entrance plaza (62, 6)
  const mineDist = Math.hypot(x - 62, z - 6);
  if (mineDist < 13) {
    const mineFlat = 1 - mineDist / 13;
    h = THREE.MathUtils.lerp(h, 2.2, mineFlat * 0.85);
  }

  // Keep Gorge Viaduct approaches level at z = 48 and z = 80 near x = 0
  if (Math.abs(x) < 6 && Math.abs(z - 64) < 18) {
    // Under the bridge is still the gorge; walkway deck sits at y = 2.05m
    return h;
  }

  return h;
}

// Effective walkable surface height (accounts for bridges & ramparts)
export function walkableHeightAt(x: number, z: number): number {
  // Gorge Viaduct Stone Bridge deck spanning z = 46..82 at x in [-3.4, 3.4]
  if (Math.abs(x) <= 3.6 && z >= 46 && z <= 82) {
    return 2.15;
  }
  // Crimson Keep Drawbridge spanning across South Gate (x in [-3.2, 3.2], z in [17, 25])
  if (Math.abs(x) <= 3.2 && z >= 17 && z <= 25) {
    return 2.15;
  }
  // Wooden creek footbridge in Crimson Keep (z in [-2.4, 2.4], x in [-16, -6])
  if (Math.abs(z) <= 2.4 && x >= -16 && x <= -6) {
    return 2.15;
  }
  return groundHeightAt(x, z);
}

export function regionAtPosition(x: number, z: number): RegionId {
  if (z < -46) return 'eagles_crag';
  if (z > 42 && Math.abs(x) < 28) return 'gorge_viaduct';
  if (x < -28 && z > 8) return 'cedar_woods';
  if (x > 34) return 'ore_mines';
  return 'crimson_keep';
}

export function buildTorosWorld(
  mats: MaterialLibrary,
  isSoftwareGl: boolean
): BuiltWorld {
  const group = new THREE.Group();
  const stations: InteractiveStation[] = [];
  const interactables: THREE.Object3D[] = [];
  const disposableGeos: THREE.BufferGeometry[] = [];
  const warlordBrazierLights: THREE.PointLight[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeos.push(g);
    return g;
  };

  const registerStation = (
    id: string,
    labelTr: string,
    labelEn: string,
    position: THREE.Vector3,
    radius: number,
    mesh: THREE.Object3D
  ) => {
    mesh.userData.stationId = id;
    mesh.traverse((child) => {
      child.userData.stationId = id;
    });
    stations.push({ id, labelTr, labelEn, position, radius, mesh });
    interactables.push(mesh);
  };

  // =========================================================================
  // 1. CONTINUOUS TERRAIN MESH (with vertex colors for stone, moss, path, snow)
  // =========================================================================
  const terrainSize = 270;
  const segs = isSoftwareGl ? 96 : 150;
  const terrainGeo = trackGeo(new THREE.PlaneGeometry(terrainSize, terrainSize, segs, segs));
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const cTmp = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const vy = groundHeightAt(vx, vz);
    posAttr.setY(i, vy);

    // Biome vertex coloring
    const keepDist = Math.hypot(vx, vz);
    const onRoad =
      (Math.abs(vx) < 3.6 && vz > -76 && vz < 82) ||
      (Math.abs(vz - 6) < 3.4 && vx > 0 && vx < 64) ||
      (Math.abs(vz - vx * -0.58) < 4.0 && vx < 0 && vx > -56);

    if (vy > 11.2) {
      // High Taurus Snow Crust
      cTmp.setHex(0xdce4ee);
    } else if (vy > 6.5) {
      // Alpine slate & scattered snow
      cTmp.setHex(0x8b8680);
    } else if (keepDist < 20) {
      // Keep Courtyard Cobble
      cTmp.setHex(0x887f74);
    } else if (onRoad) {
      // Packed mountain trade path
      cTmp.setHex(0x8a7558);
    } else if (vx < -20 && vz > 0) {
      // Cedar forest moss & pine floor
      cTmp.setHex(0x4b5734);
    } else {
      cTmp.setHex(0x6d685c);
    }
    colors[i * 3] = cTmp.r;
    colors[i * 3 + 1] = cTmp.g;
    colors[i * 3 + 2] = cTmp.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMesh = new THREE.Mesh(terrainGeo, mats.alpineRock);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // Rushing Mountain Stream Ribbon
  const streamGeo = trackGeo(new THREE.PlaneGeometry(7.2, 130, 12, 32));
  streamGeo.rotateX(-Math.PI / 2);
  const sPos = streamGeo.attributes.position;
  for (let i = 0; i < sPos.count; i++) {
    const sz = sPos.getZ(i) + 18;
    const sx = sPos.getX(i) + (-11.5 + Math.sin(sz * 0.04) * 3.5);
    sPos.setX(i, sx);
    sPos.setZ(i, sz);
    sPos.setY(i, 0.55);
  }
  streamGeo.computeVertexNormals();
  const streamWaterMesh = new THREE.Mesh(streamGeo, mats.mountainWater);
  streamWaterMesh.receiveShadow = true;
  group.add(streamWaterMesh);

  // =========================================================================
  // 2. REGION 1: KIZILGEÇİT KALESİ & MASTER'S FORGE (0, 0)
  // =========================================================================
  const keepGroup = new THREE.Group();
  const baseY = 2.0;

  // Stone Courtyard Slab
  const courtyard = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(18.5, 19.5, 0.3, 24)),
    mats.torosStone
  );
  courtyard.position.set(0, baseY - 0.12, 0);
  courtyard.receiveShadow = true;
  keepGroup.add(courtyard);

  // Perimeter Battlement Curtain Walls & Crenellations (with N/S/E/W gates)
  const wallSegments: [number, number, number, number, number][] = [
    // [x, z, width, depth, rotY]
    [-9.5, 17.5, 11, 2.2, 0],
    [9.5, 17.5, 11, 2.2, 0],
    [-9.5, -17.5, 11, 2.2, 0],
    [9.5, -17.5, 11, 2.2, 0],
    [17.5, -9.5, 2.2, 11, 0],
    [17.5, 9.5, 2.2, 11, 0],
    [-17.5, -9.5, 2.2, 11, 0],
    [-17.5, 9.5, 2.2, 11, 0],
  ];

  wallSegments.forEach(([wx, wz, ww, wd]) => {
    const wall = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(ww, 4.6, wd)),
      mats.darkFortressStone
    );
    wall.position.set(wx, baseY + 2.3, wz);
    wall.castShadow = true;
    wall.receiveShadow = true;
    keepGroup.add(wall);

    // Merlons (crenellations)
    const count = Math.max(2, Math.floor(Math.max(ww, wd) / 2.6));
    for (let m = 0; m < count; m++) {
      const t = (m / (count - 1 || 1) - 0.5) * (Math.max(ww, wd) - 2);
      const merlon = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(1.1, 1.0, 1.1)),
        mats.torosStone
      );
      merlon.position.set(
        wx + (ww > wd ? t : 0),
        baseY + 5.1,
        wz + (wd > ww ? t : 0)
      );
      merlon.castShadow = true;
      keepGroup.add(merlon);
    }
  });

  // 4 Corner Bastion Towers (multi-part stone cylinders + timber roofs)
  const towerCorners: [number, number][] = [
    [-17, -17],
    [17, -17],
    [-17, 17],
    [17, 17],
  ];
  towerCorners.forEach(([tx, tz]) => {
    const tower = new THREE.Group();
    const shaft = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(2.6, 3.0, 7.6, 12)),
      mats.darkFortressStone
    );
    shaft.position.y = 3.8;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    const crown = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(2.9, 2.6, 1.0, 12)),
      mats.torosStone
    );
    crown.position.y = 7.9;
    const roof = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(3.2, 2.4, 12)),
      mats.charredWood
    );
    roof.position.y = 9.5;
    roof.castShadow = true;
    tower.add(shaft, crown, roof);
    tower.position.set(tx, baseY, tz);
    keepGroup.add(tower);
  });

  // South Gatehouse Arch + Drawbridge + Boiling Oil Cauldron
  const gateL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.0, 5.4, 3.2)), mats.darkFortressStone);
  gateL.position.set(-3.9, baseY + 2.7, 17.5);
  const gateR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.0, 5.4, 3.2)), mats.darkFortressStone);
  gateR.position.set(3.9, baseY + 2.7, 17.5);
  const gateLintel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(9.8, 1.6, 3.4)), mats.torosStone);
  gateLintel.position.set(0, baseY + 5.8, 17.5);
  keepGroup.add(gateL, gateR, gateLintel);

  // Chain Drawbridge Leaf
  const drawbridgeLeaf = new THREE.Group();
  drawbridgeLeaf.position.set(0, baseY + 0.12, 18.8);
  const bridgePlanks = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(5.6, 0.25, 6.2)),
    mats.cedarWood
  );
  bridgePlanks.position.set(0, 0, 3.1);
  bridgePlanks.castShadow = true;
  bridgePlanks.receiveShadow = true;
  const chainL = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.05, 0.05, 6.2, 6)), mats.wroughtIron);
  chainL.rotation.x = Math.PI / 4;
  chainL.position.set(-2.6, 2.1, 3.0);
  const chainR = chainL.clone();
  chainR.position.x = 2.6;
  drawbridgeLeaf.add(bridgePlanks, chainL, chainR);
  keepGroup.add(drawbridgeLeaf);
  registerStation(
    'drawbridge',
    'Zincirli Asma Köprüyü Çevir',
    'Toggle Chain Drawbridge',
    new THREE.Vector3(-3.4, baseY + 1.2, 16.5),
    3.5,
    drawbridgeLeaf
  );

  // Boiling Oil Cauldron Station above Gatehouse
  const oilGroup = new THREE.Group();
  oilGroup.position.set(0, baseY + 6.7, 17.6);
  const cauldron = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.75, 0.55, 0.9, 14)),
    mats.wroughtIron
  );
  cauldron.castShadow = true;
  const oilSurface = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.68, 0.68, 0.08, 14)),
    new THREE.MeshStandardMaterial({
      color: 0x3b240c,
      emissive: 0xb84800,
      emissiveIntensity: 0.9,
      roughness: 0.25,
    })
  );
  oilSurface.position.y = 0.35;
  const oilPourMesh = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.35, 0.9, 5.8, 10)),
    new THREE.MeshStandardMaterial({
      color: 0xff6a11,
      emissive: 0xff4400,
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 0.85,
    })
  );
  oilPourMesh.position.set(0, -3.2, 1.4);
  oilPourMesh.visible = false;
  oilGroup.add(cauldron, oilSurface, oilPourMesh);
  keepGroup.add(oilGroup);
  registerStation(
    'oil_cauldron',
    'Kızgın Yağ Kazanını Dök',
    'Pour Boiling Oil on Gate',
    new THREE.Vector3(0, baseY + 1.2, 15.2),
    3.6,
    oilGroup
  );

  // Bastion Trebuchet / Catapult (Mancınık) at (8.5, baseY, 13)
  const catapultGroup = new THREE.Group();
  catapultGroup.position.set(8.5, baseY, 13.0);
  const cBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.8, 0.3, 4.2)), mats.cedarWood);
  cBase.position.y = 0.15;
  const cFrameL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, 2.8, 0.32)), mats.cedarWood);
  cFrameL.position.set(-1.1, 1.5, 0);
  const cFrameR = cFrameL.clone();
  cFrameR.position.x = 1.1;
  const cAxle = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 2.6, 10)), mats.wroughtIron);
  cAxle.rotation.z = Math.PI / 2;
  cAxle.position.y = 2.6;

  const catapultArm = new THREE.Group();
  catapultArm.position.set(0, 2.6, 0);
  const armBeam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 0.24, 4.4)), mats.charredWood);
  armBeam.position.z = -0.6;
  armBeam.castShadow = true;
  const cWeight = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.95, 0.9, 0.8)), mats.darkFortressStone);
  cWeight.position.set(0, -0.55, 1.3);
  const catapultBoulder = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(0.42, 1)), mats.torosStone);
  catapultBoulder.position.set(0, 0.35, -2.5);
  catapultArm.add(armBeam, cWeight, catapultBoulder);
  catapultArm.rotation.x = 0.45;

  catapultGroup.add(cBase, cFrameL, cFrameR, cAxle, catapultArm);
  keepGroup.add(catapultGroup);
  registerStation(
    'catapult',
    'Mancınığı Kur ve Ateşle',
    'Wind & Fire Bastion Catapult',
    new THREE.Vector3(8.5, baseY + 1.0, 13.0),
    3.8,
    catapultGroup
  );

  // =========================================================================
  // THE MASTER'S FORGE WORKSHOP (Inside Crimson Keep: center at (-2, baseY, -4))
  // =========================================================================
  const workshopGroup = new THREE.Group();
  workshopGroup.position.set(-1.5, baseY, -4.0);

  // Timber Posts & Gabled Cedar Roof (open-sided so sunlight & mountain air pour in)
  const postCoords: [number, number][] = [
    [-5.5, -4.5],
    [5.5, -4.5],
    [-5.5, 4.5],
    [5.5, 4.5],
  ];
  postCoords.forEach(([px, pz]) => {
    const post = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.38, 4.2, 0.38)), mats.charredWood);
    post.position.set(px, 2.1, pz);
    post.castShadow = true;
    workshopGroup.add(post);
  });
  const roofPitchL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.8, 0.22, 10.6)), mats.cedarWood);
  roofPitchL.position.set(-3.0, 5.0, 0);
  roofPitchL.rotation.z = 0.28;
  roofPitchL.castShadow = true;
  const roofPitchR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.8, 0.22, 10.6)), mats.cedarWood);
  roofPitchR.position.set(3.0, 5.0, 0);
  roofPitchR.rotation.z = -0.28;
  roofPitchR.castShadow = true;
  workshopGroup.add(roofPitchL, roofPitchR);

  // A. Stone Forge Hearth (`Ocak`) at local (-3.2, 0, -2.2)
  const hearthGroup = new THREE.Group();
  hearthGroup.position.set(-3.2, 0, -2.2);
  const hearthBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.6, 1.15, 2.1)), mats.darkFortressStone);
  hearthBase.position.y = 0.575;
  hearthBase.castShadow = true;
  hearthBase.receiveShadow = true;
  const chimney = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.65, 1.15, 4.4, 8)), mats.darkFortressStone);
  chimney.position.set(0, 3.6, -0.35);
  chimney.castShadow = true;
  const coalBed = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.82, 0.9, 0.28, 12)), mats.hearthCoals);
  coalBed.position.set(0, 1.18, 0.15);
  const hearthLight = new THREE.PointLight(0xff6b1a, 4.5, 18, 1.5);
  hearthLight.position.set(0, 1.75, 0.3);
  hearthGroup.add(hearthBase, chimney, coalBed, hearthLight);
  workshopGroup.add(hearthGroup);

  const hearthWorldPos = new THREE.Vector3(-4.7, baseY + 1.2, -6.2);
  registerStation(
    'hearth',
    'Kor Ocağına Çelik Koy / Çıkar',
    'Place or Retrieve Steel from Hearth',
    hearthWorldPos,
    3.0,
    hearthGroup
  );

  // B. Oak & Leather Bellows (`Körük`) beside Hearth at local (-1.1, 0, -2.2)
  const bellowsGroup = new THREE.Group();
  bellowsGroup.position.set(-1.1, 0, -2.2);
  const bStand = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.9, 1.0, 1.1)), mats.charredWood);
  bStand.position.y = 0.5;
  const bNozzle = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.16, 0.9, 10)), mats.wroughtIron);
  bNozzle.rotation.z = Math.PI / 2;
  bNozzle.position.set(-0.75, 1.15, 0);
  const bLeather = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.1, 0.45, 0.85)), mats.buffaloLeather);
  bLeather.position.y = 1.22;
  const bellowsPaddle = new THREE.Group();
  bellowsPaddle.position.set(-0.5, 1.48, 0);
  const paddleBoard = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.2, 0.08, 0.92)), mats.cedarWood);
  paddleBoard.position.x = 0.55;
  const paddleHandle = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 8)), mats.cedarWood);
  paddleHandle.rotation.z = -0.35;
  paddleHandle.position.set(1.05, 0.35, 0);
  bellowsPaddle.add(paddleBoard, paddleHandle);
  bellowsGroup.add(bStand, bNozzle, bLeather, bellowsPaddle);
  workshopGroup.add(bellowsGroup);

  registerStation(
    'bellows',
    'Deri Körüğü Çek (Ocağı Harla)',
    'Pull Leather Bellows',
    new THREE.Vector3(-2.6, baseY + 1.2, -6.2),
    2.8,
    bellowsGroup
  );

  // C. The Master's Anvil (`Örs`) at local (-0.6, 0, 1.2)
  const anvilGroup = new THREE.Group();
  anvilGroup.position.set(-0.6, 0, 1.2);
  const stump = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.5, 0.58, 0.72, 12)), mats.charredWood);
  stump.position.y = 0.36;
  stump.castShadow = true;
  const anvilFoot = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.7, 0.18, 0.46)), mats.wroughtIron);
  anvilFoot.position.y = 0.81;
  const anvilWaist = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.45, 0.24, 0.34)), mats.wroughtIron);
  anvilWaist.position.y = 0.98;
  const anvilFace = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.95, 0.18, 0.38)), mats.damascusSteel);
  anvilFace.position.y = 1.15;
  anvilFace.castShadow = true;
  const anvilHorn = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.16, 0.48, 10)), mats.damascusSteel);
  anvilHorn.rotation.z = Math.PI / 2;
  anvilHorn.position.set(-0.66, 1.14, 0);
  anvilGroup.add(stump, anvilFoot, anvilWaist, anvilFace, anvilHorn);

  // Interactive 4-Zone Glowing Steel Blank resting on the Anvil
  const forgeMetalGroup = new THREE.Group();
  forgeMetalGroup.position.set(0, 1.27, 0);
  const forgeMetalMeshes: THREE.Mesh[] = [];
  const forgeMetalMats: THREE.MeshStandardMaterial[] = [];
  const zoneOffsets = [-0.32, -0.1, 0.12, 0.34];
  zoneOffsets.forEach((zx, idx) => {
    const m = mats.damascusSteel.clone() as unknown as THREE.MeshStandardMaterial;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x62666d,
      roughness: 0.35,
      metalness: 0.9,
      emissive: new THREE.Color(0xff4400),
      emissiveIntensity: 0,
    });
    void m;
    const segW = idx === 3 ? 0.2 : 0.21;
    const seg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(segW, 0.04, 0.12)), mat);
    seg.position.x = zx;
    seg.userData.forgeZoneIndex = idx;
    forgeMetalGroup.add(seg);
    forgeMetalMeshes.push(seg);
    forgeMetalMats.push(mat);
  });
  anvilGroup.add(forgeMetalGroup);
  workshopGroup.add(anvilGroup);

  registerStation(
    'anvil',
    'Örs Üzerinde Çekiçle Şekillendir',
    'Hammer & Shape Steel on Anvil',
    new THREE.Vector3(-2.1, baseY + 1.2, -2.8),
    2.9,
    anvilGroup
  );

  // D. Oak Quench Barrel (`Su Verme Fıçısı`) at local (1.8, 0, 0.8)
  const quenchGroup = new THREE.Group();
  quenchGroup.position.set(1.8, 0, 0.8);
  const barrel = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.46, 0.42, 0.95, 16)), mats.cedarWood);
  barrel.position.y = 0.475;
  barrel.castShadow = true;
  const hoop1 = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.46, 0.025, 6, 20)), mats.wroughtIron);
  hoop1.rotation.x = Math.PI / 2;
  hoop1.position.y = 0.25;
  const hoop2 = hoop1.clone();
  hoop2.position.y = 0.72;
  const qWater = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.41, 0.41, 0.04, 16)), mats.mountainWater);
  qWater.position.y = 0.88;
  quenchGroup.add(barrel, hoop1, hoop2, qWater);
  workshopGroup.add(quenchGroup);

  registerStation(
    'quench',
    'Kor Çeliği Suya Daldır (Su Verme)',
    'Quench Blade in Water Barrel',
    new THREE.Vector3(0.3, baseY + 1.0, -3.2),
    2.7,
    quenchGroup
  );

  // E. Architect's Oak Table & Hand-Drawn Parchment Tactical Map at local (3.2, 0, -2.1)
  const tableGroup = new THREE.Group();
  tableGroup.position.set(3.2, 0, -2.1);
  const tableTop = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.0, 0.12, 1.35)), mats.cedarWood);
  tableTop.position.y = 0.92;
  tableTop.castShadow = true;
  tableTop.receiveShadow = true;
  [
    [-0.85, -0.52],
    [0.85, -0.52],
    [-0.85, 0.52],
    [0.85, 0.52],
  ].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 0.9, 0.12)), mats.charredWood);
    leg.position.set(lx, 0.45, lz);
    tableGroup.add(leg);
  });
  const parchmentSheet = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.45, 0.02, 1.0)), mats.parchmentMap);
  parchmentSheet.position.set(0, 0.99, 0);
  parchmentSheet.rotation.y = 0.06;
  const waxSeal = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.06, 0.065, 0.02, 12)),
    new THREE.MeshStandardMaterial({ color: 0x8b211a, roughness: 0.4 })
  );
  waxSeal.position.set(0.52, 1.01, 0.34);
  tableGroup.add(tableTop, parchmentSheet, waxSeal);
  workshopGroup.add(tableGroup);

  registerStation(
    'map_table',
    'Parşömen Savunma Krokisini İncele',
    'Inspect Hand-Drawn Defense Map',
    new THREE.Vector3(1.7, baseY + 1.0, -6.1),
    3.0,
    tableGroup
  );

  keepGroup.add(workshopGroup);

  // Waterwheel & Waterwheel-Powered Automatic Repeating Ballista at creek (-9.8, 0.5, 4)
  const waterwheel = new THREE.Group();
  waterwheel.position.set(-9.8, 2.35, 3.5);
  const wwRim = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(2.1, 0.14, 8, 24)), mats.cedarWood);
  wwRim.rotation.y = Math.PI / 2;
  waterwheel.add(wwRim);
  for (let p = 0; p < 10; p++) {
    const a = (p / 10) * Math.PI * 2;
    const spoke = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 4.1, 0.12)), mats.charredWood);
    spoke.rotation.x = a;
    waterwheel.add(spoke);
    const paddle = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.85, 0.1, 0.42)), mats.cedarWood);
    paddle.position.set(0, Math.sin(a) * 2.1, Math.cos(a) * 2.1);
    paddle.rotation.x = -a;
    waterwheel.add(paddle);
  }
  keepGroup.add(waterwheel);

  // Creek Footbridge connecting Workshop to Western Bank
  const creekBridge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(10.5, 0.28, 4.4)), mats.cedarWood);
  creekBridge.position.set(-11, baseY + 0.02, 0);
  creekBridge.receiveShadow = true;
  creekBridge.castShadow = true;
  keepGroup.add(creekBridge);

  // Waterwheel-Driven Repeating Ballista on West Bastion (-13.5, baseY + 4.6, 10)
  const ballistaGroup = new THREE.Group();
  ballistaGroup.position.set(-12.5, baseY, 9.5);
  const balBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.1, 1.3, 1.2, 10)), mats.darkFortressStone);
  balBase.position.y = 0.6;
  const ballistaTurret = new THREE.Group();
  ballistaTurret.position.y = 1.35;
  const balStock = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.28, 2.4)), mats.cedarWood);
  const balBowL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.2, 0.14, 0.18)), mats.damascusSteel);
  balBowL.position.set(-0.65, 0.08, 0.9);
  balBowL.rotation.y = 0.25;
  const balBowR = balBowL.clone();
  balBowR.position.x = 0.65;
  balBowR.rotation.y = -0.25;
  const balGear = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.45, 0.45, 0.14, 12)), mats.hammeredCopper);
  balGear.rotation.z = Math.PI / 2;
  balGear.position.set(0.35, -0.2, 0);
  ballistaTurret.add(balStock, balBowL, balBowR, balGear);
  ballistaGroup.add(balBase, ballistaTurret);
  keepGroup.add(ballistaGroup);

  registerStation(
    'repair_gears',
    'Su Çarkı Dişlilerini ve Ok Atarı Onar',
    'Repair Waterwheel Gears & Ballista',
    new THREE.Vector3(-12.5, baseY + 1.0, 9.5),
    3.5,
    ballistaGroup
  );

  group.add(keepGroup);

  // =========================================================================
  // 3. REGION 2: SEDİR ORMANLARI VE ODUNCU KAMPI (-54, 36)
  // =========================================================================
  const cedarGroup = new THREE.Group();
  const treeCount = 72;
  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.28, 0.44, 6.2, 7));
  trunkGeo.translate(0, 3.1, 0);
  const foliageGeo = trackGeo(new THREE.ConeGeometry(2.6, 2.2, 8));
  foliageGeo.translate(0, 6.4, 0);
  const foliageUpperGeo = trackGeo(new THREE.ConeGeometry(1.8, 1.9, 8));
  foliageUpperGeo.translate(0, 8.0, 0);

  const trunkInst = new THREE.InstancedMesh(trunkGeo, mats.charredWood, treeCount);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x243b24, roughness: 0.92 });
  const leafInst1 = new THREE.InstancedMesh(foliageGeo, leafMat, treeCount);
  const leafInst2 = new THREE.InstancedMesh(foliageUpperGeo, leafMat, treeCount);
  trunkInst.castShadow = !isSoftwareGl;
  leafInst1.castShadow = !isSoftwareGl;

  const dummy = new THREE.Object3D();
  const leafColor = new THREE.Color();
  for (let i = 0; i < treeCount; i++) {
    // Hand-arranged groves flanking Cedar Woods & foothills (avoiding main roads & keep)
    const angle = i * 2.39996;
    const radius = 12 + (i % 15) * 2.6;
    const cx = -50 + Math.cos(angle) * radius * 0.95;
    const cz = 34 + Math.sin(angle) * radius * 0.85;
    const cy = groundHeightAt(cx, cz);
    const sc = 0.85 + ((i * 37) % 30) / 100;

    dummy.position.set(cx, cy - 0.1, cz);
    dummy.rotation.y = (i * 1.1) % (Math.PI * 2);
    dummy.scale.set(sc, sc * (0.9 + (i % 5) * 0.08), sc);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);
    leafInst1.setMatrixAt(i, dummy.matrix);
    leafInst2.setMatrixAt(i, dummy.matrix);

    const shade = 0.82 + ((i * 19) % 35) / 100;
    leafColor.setRGB(0.14 * shade, 0.24 * shade, 0.15 * shade);
    leafInst1.setColorAt(i, leafColor);
    leafInst2.setColorAt(i, leafColor);
  }
  trunkInst.computeBoundingSphere();
  leafInst1.computeBoundingSphere();
  leafInst2.computeBoundingSphere();
  cedarGroup.add(trunkInst, leafInst1, leafInst2);

  // Timber Camp Log Stack & Chopping Stump at (-54, y, 36)
  const campY = groundHeightAt(-54, 36);
  const campGroup = new THREE.Group();
  campGroup.position.set(-54, campY, 36);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3 - r; c++) {
      const log = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.26, 0.28, 3.8, 8)), mats.cedarWood);
      log.rotation.z = Math.PI / 2;
      log.position.set(0, 0.28 + r * 0.45, (c - (2 - r) * 0.5) * 0.56);
      log.castShadow = true;
      campGroup.add(log);
    }
  }
  cedarGroup.add(campGroup);
  registerStation(
    'cedar_timber',
    'Sedir Kerestesi Topla (Kale & Mancınık İçin)',
    'Gather Cedar Timber',
    new THREE.Vector3(-54, campY + 0.8, 36),
    3.5,
    campGroup
  );
  group.add(cedarGroup);

  // =========================================================================
  // 4. REGION 3: DERİN KANYON VE ASMA TAŞ KÖPRÜ (0, 64)
  // =========================================================================
  const viaductGroup = new THREE.Group();
  viaductGroup.position.set(0, 0, 64);
  const deck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.2, 0.7, 36)), mats.torosStone);
  deck.position.set(0, 1.8, 0);
  deck.receiveShadow = true;
  deck.castShadow = true;
  viaductGroup.add(deck);

  // Parapet railings
  const paraL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.55, 1.1, 36)), mats.darkFortressStone);
  paraL.position.set(-3.3, 2.7, 0);
  const paraR = paraL.clone();
  paraR.position.x = 3.3;
  viaductGroup.add(paraL, paraR);

  // Stone Arched Piers descending deep into the gorge
  [-12, 0, 12].forEach((pz) => {
    const pier = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.4, 12, 3.4)), mats.darkFortressStone);
    pier.position.set(0, -4.4, pz);
    pier.castShadow = true;
    viaductGroup.add(pier);
  });
  group.add(viaductGroup);

  // =========================================================================
  // 5. REGION 4: ESKİ BAKIR VE DEMİR MADENİ (62, 6)
  // =========================================================================
  const mineGroup = new THREE.Group();
  const mineY = groundHeightAt(62, 6);
  mineGroup.position.set(62, mineY, 6);

  // Stone Cliff Mound & Tunnel Portal
  const cliffMound = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(11, 1)), mats.darkFortressStone);
  cliffMound.position.set(10, 4.5, 0);
  cliffMound.scale.set(1.2, 0.9, 1.4);
  mineGroup.add(cliffMound);

  // Timber Mine Gallery Props
  for (let i = 0; i < 4; i++) {
    const tx = -2 + i * 3.2;
    const postL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 3.6, 0.32)), mats.charredWood);
    postL.position.set(tx, 1.8, -2.1);
    const postR = postL.clone();
    postR.position.z = 2.1;
    const lintel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.36, 0.34, 4.8)), mats.charredWood);
    lintel.position.set(tx, 3.6, 0);
    mineGroup.add(postL, postR, lintel);
  }

  // Iron Mine Rails + Minecart
  const railL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(12, 0.08, 0.1)), mats.wroughtIron);
  railL.position.set(2, 0.08, -0.55);
  const railR = railL.clone();
  railR.position.z = 0.55;
  mineGroup.add(railL, railR);

  const mineCart = new THREE.Group();
  mineCart.position.set(1.5, 0.14, 0);
  const cartTub = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.4, 0.8, 1.0)), mats.wroughtIron);
  cartTub.position.y = 0.52;
  const oreLoad = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(0.42, 0)), mats.copperOreVein);
  oreLoad.position.y = 0.92;
  mineCart.add(cartTub, oreLoad);
  mineGroup.add(mineCart);

  // Copper & Iron Ore Veins
  const copperVein = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(1.15, 0)), mats.copperOreVein);
  copperVein.position.set(4.5, 1.1, -2.2);
  const ironVein = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(1.25, 0)), mats.ironOreVein);
  ironVein.position.set(5.2, 1.1, 2.2);
  const mineLantern = new THREE.PointLight(0xff9c3b, 3.2, 16, 1.5);
  mineLantern.position.set(3.5, 3.0, 0);
  mineGroup.add(copperVein, ironVein, mineLantern);

  registerStation(
    'mine_ore',
    'Bakır ve Demir Cevheri Kaz (Kazma ile)',
    'Mine Copper & Iron Ore Vein',
    new THREE.Vector3(66.5, mineY + 1.0, 6.0),
    4.5,
    ironVein
  );
  group.add(mineGroup);

  // =========================================================================
  // 6. REGION 5: KARTAL YUVASI GÖZETLEME KULESİ (0, -74)
  // =========================================================================
  const cragGroup = new THREE.Group();
  const cragY = groundHeightAt(0, -74);
  cragGroup.position.set(0, cragY, -74);

  const arenaStone = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(11.5, 13.5, 0.8, 18)),
    mats.darkFortressStone
  );
  arenaStone.position.y = -0.2;
  arenaStone.receiveShadow = true;
  cragGroup.add(arenaStone);

  // Watchtower Ruin Bastion at North edge
  const watchTower = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(3.4, 4.0, 9.5, 12)),
    mats.darkFortressStone
  );
  watchTower.position.set(0, 4.5, -10.5);
  watchTower.castShadow = true;
  const watchSnow = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(3.8, 1.8, 12)), mats.snowCrust);
  watchSnow.position.set(0, 10.0, -10.5);
  cragGroup.add(watchTower, watchSnow);

  // 4 Blazing Iron Braziers around Eagle's Crag Arena
  [
    [-7.5, -5.5],
    [7.5, -5.5],
    [-7.5, 5.5],
    [7.5, 5.5],
  ].forEach(([bx, bz]) => {
    const brazier = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.45, 0.3, 1.2, 8)), mats.wroughtIron);
    brazier.position.set(bx, 0.6, bz);
    const ember = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.32, 8, 6)), mats.hearthCoals);
    ember.position.set(bx, 1.25, bz);
    const bLight = new THREE.PointLight(0xff6b22, 3.2, 16, 1.4);
    bLight.position.set(bx, 1.8, bz);
    warlordBrazierLights.push(bLight);
    cragGroup.add(brazier, ember, bLight);
  });

  group.add(cragGroup);

  return {
    group,
    stations,
    interactables,
    waterwheel,
    bellowsPaddle,
    hearthLight,
    forgeMetalGroup,
    forgeMetalMeshes,
    forgeMetalMats,
    catapultArm,
    catapultBoulder,
    drawbridgeLeaf,
    ballistaTurret,
    oilPourMesh,
    streamWaterMesh,
    warlordBrazierLights,
    mineCart,
    dispose: () => {
      disposableGeos.forEach((g) => g.dispose());
    },
  };
}
