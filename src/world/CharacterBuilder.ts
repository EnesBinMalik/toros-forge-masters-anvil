import * as THREE from 'three';
import { MaterialLibrary } from '../textures/ProceduralMaterials';
import { ActiveEquipment } from '../types/game';

export interface EnesRig {
  root: THREE.Group;
  torsoGroup: THREE.Group;
  headGroup: THREE.Group;
  rightArmPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  shieldGroup: THREE.Group;
  swordGroup: THREE.Group;
  hammerGroup: THREE.Group;
  warhammerGroup: THREE.Group;
  pickaxeGroup: THREE.Group;
  apronMat: THREE.MeshStandardMaterial;
  skinMat: THREE.MeshStandardMaterial;
  shirtMat: THREE.MeshStandardMaterial;
  swordBladeMat: THREE.MeshPhysicalMaterial;
  setEquipment: (eq: ActiveEquipment) => void;
  updateVisualWear: (soot: number, wetness: number, sharpness: number, healthRatio: number) => void;
}

export interface FirstPersonRig {
  root: THREE.Group;
  rightHandPivot: THREE.Group;
  leftHandPivot: THREE.Group;
  shieldGroup: THREE.Group;
  swordGroup: THREE.Group;
  hammerGroup: THREE.Group;
  warhammerGroup: THREE.Group;
  pickaxeGroup: THREE.Group;
  skinMat: THREE.MeshStandardMaterial;
  swordBladeMat: THREE.MeshPhysicalMaterial;
  setEquipment: (eq: ActiveEquipment) => void;
  updateVisualWear: (soot: number, sharpness: number) => void;
}

export interface EnemyRig {
  root: THREE.Group;
  torso: THREE.Group;
  rightArm: THREE.Group;
  leftArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  weakPlateLeft: THREE.Mesh;
  weakPlateRight: THREE.Mesh;
  visorLightMat: THREE.MeshStandardMaterial;
  isWarlord: boolean;
}

function buildWeaponMeshes(mats: MaterialLibrary) {
  // 1. Damascus Broadsword (multi-part: pommel, leather grip, copper crossguard, beveled Damascus blade)
  const swordGroup = new THREE.Group();
  const swordBladeMat = mats.damascusSteel.clone();
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.22, 10), mats.buffaloLeather);
  grip.position.y = 0.08;
  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.036, 1), mats.hammeredCopper);
  pommel.position.y = -0.04;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.028, 0.042), mats.hammeredCopper);
  guard.position.y = 0.2;

  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.034, 0);
  bladeShape.lineTo(0.034, 0);
  bladeShape.lineTo(0.024, 0.72);
  bladeShape.lineTo(0, 0.88);
  bladeShape.lineTo(-0.024, 0.72);
  bladeShape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.012,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.006,
    bevelSegments: 2,
  });
  bladeGeo.center();
  const blade = new THREE.Mesh(bladeGeo, swordBladeMat);
  blade.position.y = 0.65;
  blade.castShadow = true;

  const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.54, 0.022), mats.wroughtIron);
  fuller.position.y = 0.56;

  swordGroup.add(grip, pommel, guard, blade, fuller);

  // 2. Blacksmith Hammer (charred cedar shaft + heavy forged iron head)
  const hammerGroup = new THREE.Group();
  const hShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.48, 10), mats.charredWood);
  hShaft.position.y = 0.22;
  const hHead = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.075, 0.08), mats.wroughtIron);
  hHead.position.y = 0.44;
  hHead.castShadow = true;
  const hPeen = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.04, 0.04, 12), mats.damascusSteel);
  hPeen.rotation.z = Math.PI / 2;
  hPeen.position.set(0.09, 0.44, 0);
  hammerGroup.add(hShaft, hHead, hPeen);

  // 3. Heavy Siege Warhammer
  const warhammerGroup = new THREE.Group();
  const wShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.86, 10), mats.charredWood);
  wShaft.position.y = 0.4;
  const wHead = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.11, 0.12), mats.wroughtIron);
  wHead.position.y = 0.8;
  wHead.castShadow = true;
  const wSpike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 6), mats.damascusSteel);
  wSpike.rotation.z = -Math.PI / 2;
  wSpike.position.set(0.18, 0.8, 0);
  const wCap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 8), mats.hammeredCopper);
  wCap.position.y = 0.88;
  warhammerGroup.add(wShaft, wHead, wSpike, wCap);

  // 4. Miner's Pickaxe
  const pickaxeGroup = new THREE.Group();
  const pShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.78, 10), mats.cedarWood);
  pShaft.position.y = 0.36;
  const pCollar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.07), mats.wroughtIron);
  pCollar.position.y = 0.72;
  const pBladeL = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.24, 6), mats.damascusSteel);
  pBladeL.rotation.z = Math.PI / 2 + 0.18;
  pBladeL.position.set(-0.14, 0.7, 0);
  const pBladeR = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.24, 6), mats.damascusSteel);
  pBladeR.rotation.z = -Math.PI / 2 - 0.18;
  pBladeR.position.set(0.14, 0.7, 0);
  pickaxeGroup.add(pShaft, pCollar, pBladeL, pBladeR);

  return {
    swordGroup,
    swordBladeMat,
    hammerGroup,
    warhammerGroup,
    pickaxeGroup,
  };
}

function buildArtisanShield(mats: MaterialLibrary): THREE.Group {
  const shield = new THREE.Group();
  // Dished steel disk
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.035, 24), mats.damascusSteel);
  disk.rotation.x = Math.PI / 2;
  disk.castShadow = true;

  // Copper outer rim
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.024, 10, 28), mats.hammeredCopper);
  rim.position.z = 0.015;

  // Center forged boss
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.wroughtIron);
  boss.rotation.x = Math.PI / 2;
  boss.position.z = 0.02;

  // 8 copper rivets around rim
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), mats.hammeredCopper);
    rivet.position.set(Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0.024);
    shield.add(rivet);
  }

  shield.add(disk, rim, boss);
  return shield;
}

export function createEnesCharacter(mats: MaterialLibrary): EnesRig {
  const root = new THREE.Group();

  const apronMat = mats.buffaloLeather.clone();
  const shirtMat = mats.rawLinen.clone();
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xc99a74,
    roughness: 0.68,
    metalness: 0.04,
  });
  const beardMat = new THREE.MeshStandardMaterial({
    color: 0x241a15,
    roughness: 0.9,
  });
  const bootMat = mats.charredWood.clone();
  bootMat.color.setHex(0x2a1c15);

  // Legs (pivoted at hip)
  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.14, 0.84, 0);
  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.56, 6, 10), mats.charredWood);
  legL.position.y = -0.36;
  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.24), bootMat);
  bootL.position.set(0, -0.72, 0.03);
  leftLegPivot.add(legL, bootL);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.14, 0.84, 0);
  const legR = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.56, 6, 10), mats.charredWood);
  legR.position.y = -0.36;
  const bootR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.24), bootMat);
  bootR.position.set(0, -0.72, 0.03);
  rightLegPivot.add(legR, bootR);

  // Torso (linen shirt + leather apron + Damascus chest/shoulder plate)
  const torsoGroup = new THREE.Group();
  torsoGroup.position.y = 0.86;

  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.21, 0.58, 12), shirtMat);
  chest.position.y = 0.29;
  chest.castShadow = true;

  // Hand-stitched buffalo leather blacksmith apron
  const apron = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.78, 0.06), apronMat);
  apron.position.set(0, 0.12, 0.19);
  apron.castShadow = true;

  // Forged Damascus Steel Chest Plate & Left Shoulder Pauldron
  const damascusPlate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.08), mats.damascusSteel);
  damascusPlate.position.set(-0.04, 0.4, 0.19);
  damascusPlate.castShadow = true;

  const pauldronL = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
    mats.damascusSteel
  );
  pauldronL.position.set(-0.29, 0.54, 0.02);
  pauldronL.rotation.z = 0.45;
  pauldronL.castShadow = true;

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.07, 14), mats.buffaloLeather);
  belt.position.y = 0.04;
  const beltBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.04), mats.hammeredCopper);
  beltBuckle.position.set(0, 0.04, 0.23);

  torsoGroup.add(chest, apron, damascusPlate, pauldronL, belt, beltBuckle);

  // Head
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.66, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 14), skinMat);
  head.position.y = 0.12;
  head.castShadow = true;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), beardMat);
  hair.position.set(0, 0.14, -0.015);
  const beard = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.07, 0.11, 12), beardMat);
  beard.position.set(0, 0.03, 0.04);
  headGroup.add(head, hair, beard);
  torsoGroup.add(headGroup);

  // Arms
  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.3, 0.52, 0);
  const rSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.22, 6, 10), shirtMat);
  rSleeve.position.y = -0.14;
  const rForearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.24, 6, 10), skinMat);
  rForearm.position.set(0, -0.38, 0.06);
  rForearm.rotation.x = -0.35;
  const rBracer = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.058, 0.16, 10), apronMat);
  rBracer.position.set(0, -0.4, 0.07);
  rBracer.rotation.x = -0.35;
  rightArmPivot.add(rSleeve, rForearm, rBracer);

  const weapons = buildWeaponMeshes(mats);
  const handMount = new THREE.Group();
  handMount.position.set(0, -0.52, 0.14);
  handMount.rotation.x = Math.PI / 2 - 0.2;
  handMount.add(
    weapons.swordGroup,
    weapons.hammerGroup,
    weapons.warhammerGroup,
    weapons.pickaxeGroup
  );
  rightArmPivot.add(handMount);

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.3, 0.52, 0);
  const lSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.22, 6, 10), shirtMat);
  lSleeve.position.y = -0.14;
  const lForearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.24, 6, 10), skinMat);
  lForearm.position.set(0, -0.38, 0.06);
  lForearm.rotation.x = -0.35;
  const shieldGroup = buildArtisanShield(mats);
  shieldGroup.position.set(-0.08, -0.42, 0.18);
  shieldGroup.rotation.y = -Math.PI / 3;
  leftArmPivot.add(lSleeve, lForearm, shieldGroup);

  torsoGroup.add(rightArmPivot, leftArmPivot);
  root.add(leftLegPivot, rightLegPivot, torsoGroup);

  const setEquipment = (eq: ActiveEquipment) => {
    weapons.swordGroup.visible = eq === 'sword_shield';
    shieldGroup.visible = eq === 'sword_shield';
    weapons.hammerGroup.visible = eq === 'forge_hammer';
    weapons.warhammerGroup.visible = eq === 'warhammer';
    weapons.pickaxeGroup.visible = eq === 'pickaxe';
  };
  setEquipment('sword_shield');

  const updateVisualWear = (
    soot: number,
    wetness: number,
    sharpness: number,
    healthRatio: number
  ) => {
    // Soot & wetness physically darken Enes's linen shirt, leather apron, and skin!
    const sootDark = 1 - soot * 0.42;
    const wetDark = 1 - wetness * 0.35;
    const injuryTint = 1 - (1 - healthRatio) * 0.22;
    apronMat.color.setRGB(
      0.95 * sootDark * wetDark,
      0.88 * sootDark * wetDark * injuryTint,
      0.82 * sootDark * wetDark * injuryTint
    );
    apronMat.roughness = 0.72 - wetness * 0.38;
    shirtMat.color.setRGB(
      0.96 * sootDark * wetDark,
      0.92 * sootDark * wetDark * injuryTint,
      0.86 * sootDark * wetDark * injuryTint
    );
    skinMat.color.setRGB(
      0.79 * (1 - soot * 0.35),
      0.60 * (1 - soot * 0.38),
      0.45 * (1 - soot * 0.35)
    );
    skinMat.roughness = 0.68 - wetness * 0.25;

    // Blade dullness & scratches reflected directly on Damascus steel surface
    weapons.swordBladeMat.roughness = 0.22 + (1 - sharpness) * 0.48;
    weapons.swordBladeMat.clearcoat = 0.15 + sharpness * 0.65;
  };

  return {
    root,
    torsoGroup,
    headGroup,
    rightArmPivot,
    leftArmPivot,
    leftLegPivot,
    rightLegPivot,
    shieldGroup,
    swordGroup: weapons.swordGroup,
    hammerGroup: weapons.hammerGroup,
    warhammerGroup: weapons.warhammerGroup,
    pickaxeGroup: weapons.pickaxeGroup,
    apronMat,
    skinMat,
    shirtMat,
    swordBladeMat: weapons.swordBladeMat,
    setEquipment,
    updateVisualWear,
  };
}

export function createFirstPersonRig(mats: MaterialLibrary): FirstPersonRig {
  const root = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xc99a74,
    roughness: 0.66,
  });

  const rightHandPivot = new THREE.Group();
  rightHandPivot.position.set(0.36, -0.34, -0.52);

  const rArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.34, 6, 10), skinMat);
  rArm.rotation.x = Math.PI / 2 - 0.25;
  rArm.position.set(0.04, -0.08, 0.16);
  const rBracer = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.054, 0.18, 10), mats.buffaloLeather);
  rBracer.rotation.x = Math.PI / 2 - 0.25;
  rBracer.position.set(0.03, -0.05, 0.1);

  const weapons = buildWeaponMeshes(mats);
  const weaponMount = new THREE.Group();
  weaponMount.rotation.set(-0.55, -0.15, 0.14);
  weaponMount.add(
    weapons.swordGroup,
    weapons.hammerGroup,
    weapons.warhammerGroup,
    weapons.pickaxeGroup
  );
  rightHandPivot.add(rArm, rBracer, weaponMount);

  const leftHandPivot = new THREE.Group();
  leftHandPivot.position.set(-0.38, -0.32, -0.48);
  const lArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.3, 6, 10), skinMat);
  lArm.rotation.x = Math.PI / 2 - 0.2;
  lArm.position.set(-0.04, -0.08, 0.16);
  const shieldGroup = buildArtisanShield(mats);
  shieldGroup.scale.setScalar(0.85);
  shieldGroup.rotation.set(0.15, 0.55, 0);
  shieldGroup.position.set(0.06, 0.04, -0.04);
  leftHandPivot.add(lArm, shieldGroup);

  root.add(rightHandPivot, leftHandPivot);

  const setEquipment = (eq: ActiveEquipment) => {
    weapons.swordGroup.visible = eq === 'sword_shield';
    shieldGroup.visible = eq === 'sword_shield';
    weapons.hammerGroup.visible = eq === 'forge_hammer';
    weapons.warhammerGroup.visible = eq === 'warhammer';
    weapons.pickaxeGroup.visible = eq === 'pickaxe';
  };
  setEquipment('sword_shield');

  const updateVisualWear = (soot: number, sharpness: number) => {
    skinMat.color.setRGB(
      0.79 * (1 - soot * 0.35),
      0.60 * (1 - soot * 0.38),
      0.45 * (1 - soot * 0.35)
    );
    weapons.swordBladeMat.roughness = 0.22 + (1 - sharpness) * 0.48;
    weapons.swordBladeMat.clearcoat = 0.15 + sharpness * 0.65;
  };

  return {
    root,
    rightHandPivot,
    leftHandPivot,
    shieldGroup,
    swordGroup: weapons.swordGroup,
    hammerGroup: weapons.hammerGroup,
    warhammerGroup: weapons.warhammerGroup,
    pickaxeGroup: weapons.pickaxeGroup,
    skinMat,
    swordBladeMat: weapons.swordBladeMat,
    setEquipment,
    updateVisualWear,
  };
}

export function createEnemyCharacter(
  mats: MaterialLibrary,
  isWarlord: boolean
): EnemyRig {
  const root = new THREE.Group();
  const scale = isWarlord ? 1.38 : 1.04;
  const armorMat = isWarlord ? mats.warlordArmor : mats.enemyPlate;

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.15, 0.85, 0);
  const lMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.85, 8), armorMat);
  lMesh.position.y = -0.42;
  leftLeg.add(lMesh);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.15, 0.85, 0);
  const rMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.85, 8), armorMat);
  rMesh.position.y = -0.42;
  rightLeg.add(rMesh);

  const torso = new THREE.Group();
  torso.position.y = 0.85;

  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.66, 10), armorMat);
  chest.position.y = 0.33;
  chest.castShadow = true;

  const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.32, 10), armorMat);
  helm.position.y = 0.84;
  helm.castShadow = true;

  const visorLightMat = new THREE.MeshStandardMaterial({
    color: isWarlord ? 0xff4511 : 0xaa3311,
    emissive: new THREE.Color(isWarlord ? 0xff4400 : 0x551808),
    emissiveIntensity: isWarlord ? 1.8 : 0.7,
    roughness: 0.4,
  });
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.06), visorLightMat);
  visor.position.set(0, 0.85, 0.14);

  // Breakable weak joint plates on shoulders
  const weakPlateLeft = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.22), mats.hammeredCopper);
  weakPlateLeft.position.set(-0.32, 0.56, 0);
  weakPlateLeft.castShadow = true;

  const weakPlateRight = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.22), mats.hammeredCopper);
  weakPlateRight.position.set(0.32, 0.56, 0);
  weakPlateRight.castShadow = true;

  if (isWarlord) {
    // Horned crown crest for the Iron Warlord
    const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.28, 6), mats.hammeredCopper);
    hornL.position.set(-0.14, 1.04, 0);
    hornL.rotation.z = 0.45;
    const hornR = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.28, 6), mats.hammeredCopper);
    hornR.position.set(0.14, 1.04, 0);
    hornR.rotation.z = -0.45;
    torso.add(hornL, hornR);
  }

  const rightArm = new THREE.Group();
  rightArm.position.set(0.34, 0.52, 0);
  const rArmMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.44, 6, 8), armorMat);
  rArmMesh.position.y = -0.22;
  const maceShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.95, 8), mats.wroughtIron);
  maceShaft.rotation.x = Math.PI / 2;
  maceShaft.position.set(0, -0.44, 0.36);
  const maceHead = new THREE.Mesh(new THREE.DodecahedronGeometry(isWarlord ? 0.16 : 0.11, 0), armorMat);
  maceHead.position.set(0, -0.44, 0.82);
  rightArm.add(rArmMesh, maceShaft, maceHead);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.34, 0.52, 0);
  const lArmMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.44, 6, 8), armorMat);
  lArmMesh.position.y = -0.22;
  const kiteShield = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 0.44), armorMat);
  kiteShield.position.set(-0.08, -0.26, 0.2);
  leftArm.add(lArmMesh, kiteShield);

  torso.add(chest, helm, visor, weakPlateLeft, weakPlateRight, rightArm, leftArm);
  root.add(leftLeg, rightLeg, torso);
  root.scale.setScalar(scale);

  return {
    root,
    torso,
    rightArm,
    leftArm,
    leftLeg,
    rightLeg,
    weakPlateLeft,
    weakPlateRight,
    visorLightMat,
    isWarlord,
  };
}
