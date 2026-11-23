import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AcousticEngine } from '../audio/AcousticEngine';
import { createMaterialLibrary, MaterialLibrary } from '../textures/ProceduralMaterials';
import {
  ActiveEquipment,
  CameraMode,
  DiegeticStatus,
  ForgeWeaponChoice,
  RegionId,
  REGIONS,
} from '../types/game';
import {
  createEnemyCharacter,
  createEnesCharacter,
  createFirstPersonRig,
  EnemyRig,
  EnesRig,
  FirstPersonRig,
} from '../world/CharacterBuilder';
import {
  buildTorosWorld,
  BuiltWorld,
  groundHeightAt,
  regionAtPosition,
  walkableHeightAt,
} from '../world/WorldBuilder';

// Pre-allocated math helpers (zero GC inside animation loop)
const _vec3 = new THREE.Vector3();
const _vec3b = new THREE.Vector3();
const _vec3c = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _color = new THREE.Color();

interface ParticleItem {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  kind: 'spark' | 'steam' | 'snow';
}

interface EnemyActor {
  id: number;
  rig: EnemyRig;
  pos: THREE.Vector3;
  velY: number;
  yaw: number;
  hp: number;
  maxHp: number;
  staggerTimer: number;
  attackTimer: number;
  attackWindup: number;
  isAttacking: boolean;
  leftPlateBroken: boolean;
  rightPlateBroken: boolean;
  alive: boolean;
  respawnTimer: number;
  homePos: THREE.Vector3;
  isWarlord: boolean;
}

interface ProjectileItem {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  active: boolean;
  radius: number;
  damage: number;
  isBoulder: boolean;
}

function blackbodyColor(tempC: number, target: THREE.Color): number {
  // Physical blackbody glow from 450C (dark iron) to 1250C (bright yellow-white)
  const t = THREE.MathUtils.clamp((tempC - 420) / 830, 0, 1);
  if (t <= 0.01) {
    target.setRGB(0, 0, 0);
    return 0;
  }
  if (t < 0.45) {
    const k = t / 0.45;
    target.setRGB(0.65 * k, 0.06 * k, 0.01);
    return k * 1.4;
  }
  if (t < 0.8) {
    const k = (t - 0.45) / 0.35;
    target.setRGB(0.85 + 0.15 * k, 0.12 + 0.48 * k, 0.02 + 0.06 * k);
    return 1.4 + k * 1.6;
  }
  const k = (t - 0.8) / 0.2;
  target.setRGB(1.0, 0.6 + 0.35 * k, 0.08 + 0.45 * k);
  return 3.0 + k * 1.6;
}

export class TorosEngine {
  private container: HTMLElement;
  private onStatusChange: (status: DiegeticStatus) => void;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private mats!: MaterialLibrary;
  private world!: BuiltWorld;
  private enes!: EnesRig;
  private fpRig!: FirstPersonRig;
  private audio = new AcousticEngine();

  private isSoftwareGl = false;
  private frameId = 0;
  private disposed = false;
  private clock = new THREE.Clock();
  private statusEmitTimer = 0;

  // Particle pools
  private sparkPool: ParticleItem[] = [];
  private sparkGeo!: THREE.BufferGeometry;
  private sparkPoints!: THREE.Points;
  private steamPool: ParticleItem[] = [];
  private steamGeo!: THREE.BufferGeometry;
  private steamPoints!: THREE.Points;

  // Enemies & Siege Projectiles
  private enemies: EnemyActor[] = [];
  private projectiles: ProjectileItem[] = [];
  private ballistaCooldown = 2.0;

  // Input & Movement State
  private keys: Record<string, boolean> = {};
  private pointerLocked = false;
  private isDraggingLook = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private raycaster = new THREE.Raycaster();
  private ndcMouse = new THREE.Vector2(0, 0);

  // Player Physics & Animation
  private playerPos = new THREE.Vector3(1.5, 2.0, -0.5);
  private playerVelY = 0;
  private yaw = Math.PI * 0.88; // facing workshop hearth/anvil
  private pitch = -0.08;
  private grounded = true;
  private walkCycle = 0;

  private swingTimer = 0;
  private swingHitChecked = false;
  private isBlocking = false;
  private parryWindowTimer = 0;
  private riposteReadyTimer = 0;
  private bellowsAnimTimer = 0;
  private breathEmitTimer = 0;
  private activeZoneIdx = 1;

  private catapultThrowing = false;
  private catapultThrowProgress = 0;
  private oilPourTimer = 0;

  // Core Diegetic State
  private state: DiegeticStatus = {
    started: false,
    pointerLocked: false,
    cameraMode: 'first_person',
    currentRegion: 'crimson_keep',
    equipment: 'sword_shield',
    interactionPrompt: null,
    interactionActionId: null,
    inForgeStation: false,
    mapOpen: false,
    muted: false,
    controlsExpanded: false,
    healthRatio: 1.0,
    staminaRatio: 1.0,
    edgeSharpness: 0.88,
    sootRatio: 0.12,
    wetnessRatio: 0.0,
    parryFlash: 0,
    damageFlash: 0,
    forge: {
      hearthTemp: 760,
      coalFuel: 0.85,
      ingotTemp: 320,
      ingotLocation: 'anvil',
      weaponChoice: 'broadsword',
      zones: [
        { id: 'tang', label: 'Kabza Kökü', progress: 0.35, strikes: 1 },
        { id: 'fuller', label: 'Namlu Oluğu', progress: 0.25, strikes: 1 },
        { id: 'edge', label: 'Çelik Ağız', progress: 0.2, strikes: 0 },
        { id: 'tip', label: 'Keskin Uç', progress: 0.15, strikes: 0 },
      ],
      isQuenched: false,
      forgedMasterworks: 0,
      rawOreCount: 4,
      cedarTimberCount: 3,
    },
    defense: {
      catapultWind: 0.5,
      catapultLoaded: true,
      oilBoilingHeat: 1.0,
      oilCooldown: 0,
      drawbridgeRaised: false,
      waterwheelSpeed: 0.85,
      ballistaActive: true,
      mechanismIntegrity: 92,
      gateIntegrity: 100,
    },
    warlordDefeated: false,
    activeSiegeThreat: false,
  };

  constructor(container: HTMLElement, onStatusChange: (status: DiegeticStatus) => void) {
    this.container = container;
    this.onStatusChange = onStatusChange;
    this.initScene();
    this.bindEvents();
    this.emitStatus();
    this.tick();
  }

  private initScene(): void {
    // 1. Detect Software WebGL
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 2. Scene & Atmospheric Taurus Sky/Fog
    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x28323e);
    this.scene.background = skyColor;
    this.scene.fog = new THREE.FogExp2(0x28323e, 0.0085);

    this.camera = new THREE.PerspectiveCamera(
      68,
      this.container.clientWidth / Math.max(1, this.container.clientHeight),
      0.1,
      280
    );
    this.scene.add(this.camera);

    // 3. Studio Environment Reflection (RoomEnvironment + PMREMGenerator)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    // 4. Warm/Cool 3-Point Taurus Mountain Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x8faac7, 0x3b2c22, 0.85);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffdfb4, 1.9);
    sunLight.position.set(42, 64, 32);
    sunLight.castShadow = !this.isSoftwareGl;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 165;
    const d = 52;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    this.scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x7ca2cc, 0.55);
    rimLight.position.set(-40, 26, -50);
    this.scene.add(rimLight);

    // 5. Materials, World, Character Rigs
    this.mats = createMaterialLibrary(this.renderer, this.isSoftwareGl);
    this.world = buildTorosWorld(this.mats, this.isSoftwareGl);
    this.scene.add(this.world.group);

    this.enes = createEnesCharacter(this.mats);
    this.enes.root.position.copy(this.playerPos);
    this.scene.add(this.enes.root);

    this.fpRig = createFirstPersonRig(this.mats);
    this.camera.add(this.fpRig.root);

    this.syncCameraRigMode();
    this.initParticles();
    this.spawnEnemies();
    this.updateForgeBladeVisuals();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  private initParticles(): void {
    // Sparks Pool
    const sparkCount = 160;
    for (let i = 0; i < sparkCount; i++) {
      this.sparkPool.push({
        active: false,
        pos: new THREE.Vector3(0, -50, 0),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.5,
        kind: 'spark',
      });
    }
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(sparkCount * 3), 3)
    );
    const sparkMat = new THREE.PointsMaterial({
      color: 0xffa638,
      size: 0.14,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sparkPoints = new THREE.Points(this.sparkGeo, sparkMat);
    this.sparkPoints.frustumCulled = false;
    this.scene.add(this.sparkPoints);

    // Steam & Snow Pool
    const steamCount = 220;
    for (let i = 0; i < steamCount; i++) {
      this.steamPool.push({
        active: false,
        pos: new THREE.Vector3(0, -50, 0),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1.5,
        kind: 'steam',
      });
    }
    this.steamGeo = new THREE.BufferGeometry();
    this.steamGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(steamCount * 3), 3)
    );
    const steamMat = new THREE.PointsMaterial({
      color: 0xd9e1ea,
      size: 0.28,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
    });
    this.steamPoints = new THREE.Points(this.steamGeo, steamMat);
    this.steamPoints.frustumCulled = false;
    this.scene.add(this.steamPoints);
  }

  private emitSparks(origin: THREE.Vector3, count: number, speed = 4.5): void {
    let spawned = 0;
    for (let i = 0; i < this.sparkPool.length && spawned < count; i++) {
      const p = this.sparkPool[i];
      if (!p.active) {
        p.active = true;
        p.pos.copy(origin);
        p.vel.set(
          (Math.random() - 0.5) * speed * 1.8,
          Math.random() * speed * 1.1 + 1.2,
          (Math.random() - 0.5) * speed * 1.8
        );
        p.maxLife = 0.35 + Math.random() * 0.45;
        p.life = p.maxLife;
        p.kind = 'spark';
        spawned++;
      }
    }
  }

  private emitSteam(
    origin: THREE.Vector3,
    count: number,
    kind: 'steam' | 'snow' = 'steam'
  ): void {
    let spawned = 0;
    for (let i = 0; i < this.steamPool.length && spawned < count; i++) {
      const p = this.steamPool[i];
      if (!p.active) {
        p.active = true;
        p.pos.copy(origin);
        if (kind === 'snow') {
          p.vel.set(
            -2.4 + (Math.random() - 0.5) * 1.5,
            -1.4 - Math.random() * 1.2,
            1.6 + (Math.random() - 0.5) * 1.5
          );
          p.maxLife = 2.4;
        } else {
          p.vel.set(
            (Math.random() - 0.5) * 0.65,
            1.1 + Math.random() * 1.1,
            (Math.random() - 0.5) * 0.65
          );
          p.maxLife = 1.0 + Math.random() * 0.8;
        }
        p.life = p.maxLife;
        p.kind = kind;
        spawned++;
      }
    }
  }

  private spawnEnemies(): void {
    const spawns: { x: number; z: number; warlord: boolean }[] = [
      // Cedar Woods ambush scouts
      { x: -46, z: 32, warlord: false },
      { x: -56, z: 42, warlord: false },
      // Gorge Viaduct siege vanguard
      { x: 0, z: 68, warlord: false },
      { x: 1.8, z: 76, warlord: false },
      // South Gate raider
      { x: 0.5, z: 27, warlord: false },
      // Eagle's Crag Boss: The Iron Warlord
      { x: 0, z: -78, warlord: true },
    ];

    spawns.forEach((sp, idx) => {
      const rig = createEnemyCharacter(this.mats, sp.warlord);
      const y = walkableHeightAt(sp.x, sp.z);
      rig.root.position.set(sp.x, y, sp.z);
      this.scene.add(rig.root);

      this.enemies.push({
        id: idx + 1,
        rig,
        pos: new THREE.Vector3(sp.x, y, sp.z),
        velY: 0,
        yaw: 0,
        hp: sp.warlord ? 260 : 90,
        maxHp: sp.warlord ? 260 : 90,
        staggerTimer: 0,
        attackTimer: 1.5 + idx * 0.3,
        attackWindup: 0,
        isAttacking: false,
        leftPlateBroken: false,
        rightPlateBroken: false,
        alive: true,
        respawnTimer: 0,
        homePos: new THREE.Vector3(sp.x, y, sp.z),
        isWarlord: sp.warlord,
      });
    });
  }

  private syncCameraRigMode(): void {
    const isFP = this.state.cameraMode === 'first_person';
    this.fpRig.root.visible = isFP && this.state.started;
    this.enes.root.visible = !isFP;
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    canvas.addEventListener('webglcontextlost', this.onContextLost);
  }

  private onContextLost = (e: Event): void => {
    e.preventDefault();
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onResize = (): void => {
    if (!this.container || this.disposed) return;
    const w = this.container.clientWidth;
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    this.state.pointerLocked = this.pointerLocked;
    this.emitStatus();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.state.started) return;
    this.keys[e.code] = true;

    if (e.code === 'KeyV') {
      this.toggleCameraMode();
    } else if (e.code === 'KeyM') {
      this.toggleMap();
    } else if (e.code === 'KeyH') {
      this.state.controlsExpanded = !this.state.controlsExpanded;
      this.emitStatus();
    } else if (e.code === 'KeyE') {
      this.triggerContextualInteraction();
    } else if (e.code === 'KeyF') {
      this.performPrimaryAction();
    } else if (e.code === 'KeyQ') {
      this.startBlockParry();
    } else if (e.code === 'Digit1') {
      this.setEquipment('sword_shield');
    } else if (e.code === 'Digit2') {
      this.setEquipment('warhammer');
    } else if (e.code === 'Digit3') {
      this.setEquipment('forge_hammer');
    } else if (e.code === 'Digit4') {
      this.setEquipment('pickaxe');
    } else if (e.code === 'Space' && this.grounded && !this.state.mapOpen) {
      this.playerVelY = 6.2;
      this.grounded = false;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys[e.code] = false;
    if (e.code === 'KeyQ') {
      this.isBlocking = false;
    }
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.state.started || this.state.mapOpen) return;
    this.audio.init();

    if (e.button === 2) {
      this.startBlockParry();
      return;
    }

    if (e.button === 0) {
      // Check if clicking directly on a forge/world station first when cursor isn't locked
      if (!this.pointerLocked) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.ndcMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.ndcMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.ndcMouse, this.camera);
        const hits = this.raycaster.intersectObjects(this.world.interactables, true);
        if (hits.length > 0 && hits[0].distance < 6.5) {
          const hitObj = hits[0].object;
          const sid = hitObj.userData.stationId as string | undefined;
          if (hitObj.userData.forgeZoneIndex !== undefined) {
            this.activeZoneIdx = hitObj.userData.forgeZoneIndex as number;
          }
          if (sid) {
            this.executeStationAction(sid);
            return;
          }
        }
        // Start drag-look & also perform attack/lock if near combat
        this.isDraggingLook = true;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        if (this.state.interactionActionId && this.state.inForgeStation) {
          this.triggerContextualInteraction();
        } else {
          this.performPrimaryAction();
        }
      } else {
        // Pointer locked: check if looking straight at a forging station within reach
        if (this.state.inForgeStation && this.state.equipment === 'forge_hammer') {
          this.triggerContextualInteraction();
        } else {
          this.performPrimaryAction();
        }
      }
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 2) {
      this.isBlocking = false;
    }
    if (e.button === 0) {
      this.isDraggingLook = false;
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.state.started || this.state.mapOpen) return;
    if (this.pointerLocked) {
      this.yaw -= e.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - e.movementY * 0.0022,
        -1.15,
        1.05
      );
    } else if (this.isDraggingLook) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.yaw -= dx * 0.0045;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0045, -1.15, 1.05);
    }
  };

  // =========================================================================
  // PUBLIC CONTROLS FOR REACT / DIEGETIC OVERLAY
  // =========================================================================
  public startExperience(): void {
    this.audio.init();
    this.state.started = true;
    this.syncCameraRigMode();
    this.emitStatus();
  }

  public requestPointerLock(): void {
    if (!this.state.started || this.state.mapOpen) return;
    try {
      this.renderer.domElement.requestPointerLock();
    } catch {
      // Fallback drag-look works automatically
    }
  }

  public toggleCameraMode(): void {
    this.state.cameraMode =
      this.state.cameraMode === 'first_person' ? 'third_person' : 'first_person';
    this.syncCameraRigMode();
    this.emitStatus();
  }

  public toggleMap(): void {
    this.state.mapOpen = !this.state.mapOpen;
    if (this.state.mapOpen && this.pointerLocked) {
      document.exitPointerLock();
    }
    this.emitStatus();
  }

  public toggleControlsPanel(): void {
    this.state.controlsExpanded = !this.state.controlsExpanded;
    this.emitStatus();
  }

  public toggleMute(): void {
    this.state.muted = !this.state.muted;
    this.audio.setMuted(this.state.muted);
    this.emitStatus();
  }

  public setEquipment(eq: ActiveEquipment): void {
    this.state.equipment = eq;
    this.enes.setEquipment(eq);
    this.fpRig.setEquipment(eq);
    this.emitStatus();
  }

  public setForgeWeaponChoice(choice: ForgeWeaponChoice): void {
    this.state.forge.weaponChoice = choice;
    this.state.forge.isQuenched = false;
    this.state.forge.zones.forEach((z) => {
      z.progress = 0.15;
      z.strikes = 0;
    });
    this.updateForgeBladeVisuals();
    this.emitStatus();
  }

  public travelToRegion(regionId: RegionId): void {
    const reg = REGIONS[regionId];
    // Land on safe approach beside the region landmark
    const tx = reg.x === 0 && reg.z === 0 ? 1.5 : reg.x;
    const tz = reg.x === 0 && reg.z === 0 ? -0.5 : reg.z + (regionId === 'eagles_crag' ? 8 : -6);
    this.playerPos.set(tx, walkableHeightAt(tx, tz), tz);
    this.playerVelY = 0;
    this.grounded = true;
    this.state.mapOpen = false;
    this.state.currentRegion = regionId;
    this.emitStatus();
  }

  // =========================================================================
  // FORGING, DEFENSE & COMBAT ACTIONS
  // =========================================================================
  private startBlockParry(): void {
    if (this.state.equipment !== 'sword_shield') return;
    this.isBlocking = true;
    this.parryWindowTimer = 0.36; // Millisecond parry timing window
  }

  private performPrimaryAction(): void {
    if (this.swingTimer > 0) return;

    // Auto-select forge hammer or pickaxe if standing right at anvil or mine vein
    if (this.state.interactionActionId === 'anvil') {
      this.executeStationAction('anvil');
      return;
    }
    if (this.state.interactionActionId === 'mine_ore') {
      this.executeStationAction('mine_ore');
      return;
    }

    if (this.state.staminaRatio < 0.08) return;
    this.state.staminaRatio = Math.max(0, this.state.staminaRatio - 0.14);
    this.swingTimer = 0.42;
    this.swingHitChecked = false;
    this.audio.playSwordSwing(this.state.edgeSharpness);
  }

  public triggerContextualInteraction(): void {
    if (this.state.interactionActionId) {
      this.executeStationAction(this.state.interactionActionId);
    }
  }

  private executeStationAction(stationId: string): void {
    const f = this.state.forge;
    const d = this.state.defense;

    if (stationId === 'hearth') {
      if (f.ingotLocation === 'hearth') {
        f.ingotLocation = 'anvil';
        this.setEquipment('forge_hammer');
      } else {
        f.ingotLocation = 'hearth';
        if (f.coalFuel < 0.25 && f.rawOreCount > 0) {
          f.coalFuel = 0.9;
        }
      }
      this.updateForgeBladeVisuals();
      this.emitStatus();
      return;
    }

    if (stationId === 'bellows') {
      this.bellowsAnimTimer = 0.65;
      f.hearthTemp = Math.min(1340, f.hearthTemp + 155);
      f.coalFuel = Math.min(1, f.coalFuel + 0.08);
      if (f.ingotLocation === 'hearth') {
        f.ingotTemp = Math.min(1260, f.ingotTemp + 185);
      }
      this.state.sootRatio = Math.min(1, this.state.sootRatio + 0.03);
      this.audio.playBellowsPull();
      this.emitSparks(new THREE.Vector3(-4.7, 3.3, -6.2), 14, 2.8);
      this.updateForgeBladeVisuals();
      this.emitStatus();
      return;
    }

    if (stationId === 'anvil') {
      this.setEquipment('forge_hammer');
      this.swingTimer = 0.34;
      if (f.ingotLocation !== 'anvil') {
        f.ingotLocation = 'anvil';
      }
      const tempNorm = THREE.MathUtils.clamp((f.ingotTemp - 400) / 850, 0, 1);
      this.audio.playAnvilStrike(tempNorm, 0.8 + tempNorm * 0.3, this.activeZoneIdx);

      // Shape the targeted blade zone!
      const zone = f.zones[this.activeZoneIdx % f.zones.length];
      const heatEfficiency = tempNorm > 0.25 ? 0.18 + tempNorm * 0.16 : 0.05;
      zone.progress = Math.min(1, zone.progress + heatEfficiency);
      zone.strikes += 1;
      this.activeZoneIdx = (this.activeZoneIdx + 1) % f.zones.length;

      // Soot & sweat buildup while working at the anvil
      this.state.sootRatio = Math.min(1, this.state.sootRatio + 0.025);
      this.emitSparks(new THREE.Vector3(-2.1, 3.35, -2.8), 22, 4.6);
      this.updateForgeBladeVisuals();
      this.emitStatus();
      return;
    }

    if (stationId === 'quench') {
      const avgProgress =
        f.zones.reduce((acc, z) => acc + z.progress, 0) / f.zones.length;
      const tempNorm = THREE.MathUtils.clamp((f.ingotTemp - 300) / 900, 0, 1);
      f.ingotLocation = 'quench';
      this.audio.playQuenchSizzle(tempNorm);
      this.emitSteam(new THREE.Vector3(0.3, 3.05, -3.2), 34, 'steam');
      f.ingotTemp = 120;

      if (avgProgress >= 0.72) {
        f.isQuenched = true;
        f.forgedMasterworks += 1;
        this.state.edgeSharpness = 1.0;
        this.state.healthRatio = Math.min(1, this.state.healthRatio + 0.25);
        this.setEquipment(
          f.weaponChoice === 'warhammer' ? 'warhammer' : 'sword_shield'
        );
        // Reset next blank smoothly
        f.zones.forEach((z) => {
          z.progress = 0.2;
          z.strikes = 0;
        });
      }
      this.updateForgeBladeVisuals();
      this.emitStatus();
      return;
    }

    if (stationId === 'map_table') {
      this.toggleMap();
      return;
    }

    if (stationId === 'catapult') {
      if (!this.catapultThrowing) {
        this.catapultThrowing = true;
        this.catapultThrowProgress = 0;
        this.audio.playCatapultRelease();
        // Spawn heavy boulder trajectory toward South Gate / Gorge Viaduct
        const bGeo = new THREE.DodecahedronGeometry(0.42, 1);
        const bMesh = new THREE.Mesh(bGeo, this.mats.torosStone);
        const startPos = new THREE.Vector3(8.5, 5.2, 13.0);
        bMesh.position.copy(startPos);
        this.scene.add(bMesh);
        this.projectiles.push({
          mesh: bMesh,
          pos: startPos.clone(),
          vel: new THREE.Vector3(-2.6, 12.5, 19.5),
          active: true,
          radius: 3.4,
          damage: 95,
          isBoulder: true,
        });
      }
      return;
    }

    if (stationId === 'oil_cauldron') {
      if (d.oilCooldown <= 0) {
        d.oilCooldown = 6.0;
        this.oilPourTimer = 1.8;
        this.world.oilPourMesh.visible = true;
        this.audio.playQuenchSizzle(0.9);
        // Scorch any raiders near South Gate
        this.enemies.forEach((en) => {
          if (en.alive && en.pos.z > 14 && en.pos.z < 28 && Math.abs(en.pos.x) < 5) {
            this.damageEnemy(en, 80, true);
          }
        });
        this.emitStatus();
      }
      return;
    }

    if (stationId === 'drawbridge') {
      d.drawbridgeRaised = !d.drawbridgeRaised;
      this.audio.playGearRepair();
      this.emitStatus();
      return;
    }

    if (stationId === 'repair_gears') {
      this.swingTimer = 0.35;
      d.mechanismIntegrity = Math.min(100, d.mechanismIntegrity + 30);
      d.gateIntegrity = Math.min(100, d.gateIntegrity + 20);
      d.ballistaActive = true;
      this.audio.playGearRepair();
      this.emitSparks(new THREE.Vector3(-12.5, 3.2, 9.5), 10, 2.2);
      this.emitStatus();
      return;
    }

    if (stationId === 'mine_ore') {
      this.setEquipment('pickaxe');
      this.swingTimer = 0.38;
      f.rawOreCount += 2;
      this.audio.playPickaxeOre();
      this.emitSparks(new THREE.Vector3(66.5, 3.4, 6.0), 16, 3.5);
      this.emitStatus();
      return;
    }

    if (stationId === 'cedar_timber') {
      f.cedarTimberCount += 2;
      this.audio.playGearRepair();
      this.emitStatus();
    }
  }

  private updateForgeBladeVisuals(): void {
    const f = this.state.forge;
    const onAnvil = f.ingotLocation === 'anvil' || f.ingotLocation === 'hearth';
    this.world.forgeMetalGroup.visible = onAnvil;

    const glow = blackbodyColor(f.ingotTemp, _color);
    f.zones.forEach((z, idx) => {
      const seg = this.world.forgeMetalMeshes[idx];
      const mat = this.world.forgeMetalMats[idx];
      if (!seg || !mat) return;
      // Physical deformation: forging flattens thickness & tapers edge width toward sharp blade!
      const p = z.progress;
      const taper = idx === 3 ? 0.45 : idx === 0 ? 0.65 : 1.0 - idx * 0.1;
      seg.scale.set(1 + p * 0.15, 1.0 - p * 0.52, taper * (1.0 - p * 0.35));
      mat.emissive.copy(_color);
      mat.emissiveIntensity = glow;
      mat.roughness = 0.55 - p * 0.28;
    });
  }

  // =========================================================================
  // MAIN SIMULATION & RENDER LOOP
  // =========================================================================
  private tick = (): void => {
    if (this.disposed) return;

    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    const elapsed = this.clock.elapsedTime;

    this.updatePlayer(dt);
    this.updateForgePhysics(dt, elapsed);
    this.updateDefenseMechanisms(dt, elapsed);
    this.updateEnemies(dt, elapsed);
    this.updateProjectiles(dt);
    this.updateParticles(dt);
    this.updateCamera(dt);

    // Update Enes visual wear (soot, rain/stream wetness, edge polish)
    this.enes.updateVisualWear(
      this.state.sootRatio,
      this.state.wetnessRatio,
      this.state.edgeSharpness,
      this.state.healthRatio
    );
    this.fpRig.updateVisualWear(this.state.sootRatio, this.state.edgeSharpness);

    // Update Region & Diegetic Audio Bed
    this.state.currentRegion = regionAtPosition(this.playerPos.x, this.playerPos.z);
    const distKeep = Math.hypot(this.playerPos.x, this.playerPos.z);
    const hearthNorm = THREE.MathUtils.clamp(
      (this.state.forge.hearthTemp - 300) / 1000,
      0,
      1
    );
    this.audio.updateAmbience(
      dt,
      this.state.currentRegion,
      hearthNorm,
      distKeep,
      this.state.staminaRatio,
      this.state.healthRatio,
      this.state.activeSiegeThreat
    );

    // Transient flash decay
    if (this.state.parryFlash > 0) {
      this.state.parryFlash = Math.max(0, this.state.parryFlash - dt * 2.5);
    }
    if (this.state.damageFlash > 0) {
      this.state.damageFlash = Math.max(0, this.state.damageFlash - dt * 2.2);
    }

    // Throttled React overlay sync (~10Hz) so React never stalls 60-144 FPS WebGL
    this.statusEmitTimer += dt;
    if (this.statusEmitTimer >= 0.1) {
      this.statusEmitTimer = 0;
      this.emitStatus();
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const st = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (st === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updatePlayer(dt: number): void {
    if (!this.state.started || this.state.mapOpen) return;

    // Movement Input
    let moveFwd = 0;
    let moveRight = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveFwd += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveFwd -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveRight += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveRight -= 1;

    const isMoving = moveFwd !== 0 || moveRight !== 0;
    const sprinting = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) && !this.isBlocking;
    let speed = sprinting && this.state.staminaRatio > 0.1 ? 8.6 : 5.4;
    if (this.isBlocking) speed = 3.1;

    if (isMoving) {
      const len = Math.hypot(moveFwd, moveRight);
      moveFwd /= len;
      moveRight /= len;

      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);
      const dx = (-sinY * moveFwd + cosY * moveRight) * speed * dt;
      const dz = (-cosY * moveFwd - sinY * moveRight) * speed * dt;

      const nextX = THREE.MathUtils.clamp(this.playerPos.x + dx, -88, 88);
      const nextZ = THREE.MathUtils.clamp(this.playerPos.z + dz, -92, 92);

      // Prevent walking off steep cliffs into deep gorge except on bridge
      const nextY = walkableHeightAt(nextX, nextZ);
      if (nextY - this.playerPos.y < 1.65) {
        this.playerPos.x = nextX;
        this.playerPos.z = nextZ;
      }

      if (sprinting) {
        this.state.staminaRatio = Math.max(0, this.state.staminaRatio - dt * 0.22);
      }
      this.walkCycle += dt * (sprinting ? 11 : 7.5);
    } else {
      this.walkCycle = THREE.MathUtils.damp(this.walkCycle, 0, 8, dt);
    }

    // Stamina & gradual health recovery near the warm hearth
    if (!sprinting && !this.isBlocking) {
      this.state.staminaRatio = Math.min(1, this.state.staminaRatio + dt * 0.24);
    }
    if (Math.hypot(this.playerPos.x + 2, this.playerPos.z + 4) < 8) {
      this.state.healthRatio = Math.min(1, this.state.healthRatio + dt * 0.04);
      this.state.wetnessRatio = Math.max(0, this.state.wetnessRatio - dt * 0.08);
    }

    // Wetness if wading through the Crimson Keep alpine stream
    if (Math.abs(this.playerPos.x + 11.5) < 3.5 && this.playerPos.y < 1.4) {
      this.state.wetnessRatio = Math.min(1, this.state.wetnessRatio + dt * 0.45);
      this.state.sootRatio = Math.max(0, this.state.sootRatio - dt * 0.25);
    }

    // Vertical Gravity & Grounding
    const groundY = walkableHeightAt(this.playerPos.x, this.playerPos.z);
    if (!this.grounded || this.playerPos.y > groundY + 0.05) {
      this.playerVelY -= 18.0 * dt;
      this.playerPos.y += this.playerVelY * dt;
      if (this.playerPos.y <= groundY) {
        this.playerPos.y = groundY;
        this.playerVelY = 0;
        this.grounded = true;
      }
    } else {
      this.playerPos.y = THREE.MathUtils.damp(this.playerPos.y, groundY, 18, dt);
    }

    // Timers for combat parry & swing
    if (this.parryWindowTimer > 0) this.parryWindowTimer -= dt;
    if (this.riposteReadyTimer > 0) this.riposteReadyTimer -= dt;

    if (this.swingTimer > 0) {
      this.swingTimer -= dt;
      if (!this.swingHitChecked && this.swingTimer < 0.24) {
        this.swingHitChecked = true;
        this.checkMeleeStrike();
      }
    }

    // Breath vapor & snow flurries in cold high Toros elevation
    if (this.playerPos.y > 6.5) {
      this.breathEmitTimer -= dt;
      if (this.breathEmitTimer <= 0) {
        this.breathEmitTimer = 0.7;
        _vec3.set(
          this.playerPos.x + (Math.random() - 0.5) * 24,
          this.playerPos.y + 8,
          this.playerPos.z + (Math.random() - 0.5) * 24
        );
        this.emitSteam(_vec3, 5, 'snow');
      }
    }

    // Update 3rd-person Enes animation
    this.enes.root.position.copy(this.playerPos);
    this.enes.root.rotation.y = this.yaw + Math.PI;
    const legSwing = isMoving ? Math.sin(this.walkCycle) * 0.55 : 0;
    this.enes.leftLegPivot.rotation.x = legSwing;
    this.enes.rightLegPivot.rotation.x = -legSwing;

    const swingArc =
      this.swingTimer > 0 ? Math.sin((this.swingTimer / 0.42) * Math.PI) * 1.45 : 0;
    this.enes.rightArmPivot.rotation.x = -swingArc - (isMoving ? legSwing * 0.4 : 0);
    this.enes.leftArmPivot.rotation.x = this.isBlocking ? -1.15 : 0;
    this.enes.leftArmPivot.rotation.y = this.isBlocking ? 0.55 : 0;

    // First-person hand animation
    const bobY = isMoving ? Math.sin(this.walkCycle * 2) * 0.015 : 0;
    this.fpRig.rightHandPivot.position.y = -0.34 + bobY;
    this.fpRig.rightHandPivot.rotation.x = -swingArc * 0.95;
    this.fpRig.rightHandPivot.rotation.z = swingArc * 0.35;
    this.fpRig.leftHandPivot.position.x = THREE.MathUtils.damp(
      this.fpRig.leftHandPivot.position.x,
      this.isBlocking ? -0.14 : -0.38,
      16,
      dt
    );
    this.fpRig.leftHandPivot.position.y = THREE.MathUtils.damp(
      this.fpRig.leftHandPivot.position.y,
      this.isBlocking ? -0.16 : -0.32,
      16,
      dt
    );

    // Contextual Interaction Detection
    let bestId: string | null = null;
    let bestPrompt: string | null = null;
    let bestDist = Infinity;
    for (const st of this.world.stations) {
      const dist = this.playerPos.distanceTo(st.position);
      if (dist < st.radius && dist < bestDist) {
        bestDist = dist;
        bestId = st.id;
        bestPrompt = `[E] ${st.labelTr} · ${st.labelEn}`;
      }
    }
    this.state.interactionActionId = bestId;
    this.state.interactionPrompt = bestPrompt;
    this.state.inForgeStation =
      bestId === 'hearth' ||
      bestId === 'bellows' ||
      bestId === 'anvil' ||
      bestId === 'quench';
  }

  private checkMeleeStrike(): void {
    const isHammer = this.state.equipment === 'warhammer';
    const baseDmg =
      (isHammer ? 44 : 34) *
      (0.5 + this.state.edgeSharpness * 0.65) *
      (this.riposteReadyTimer > 0 ? 2.1 : 1.0);
    const reach = isHammer ? 3.2 : 3.4;

    _vec3.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();

    for (const en of this.enemies) {
      if (!en.alive) continue;
      _vec3b.subVectors(en.pos, this.playerPos);
      const dist = _vec3b.length();
      if (dist > reach) continue;
      _vec3b.y = 0;
      _vec3b.normalize();
      const dot = _vec3.dot(_vec3b);
      if (dot > 0.35) {
        const weakPoint =
          en.staggerTimer > 0 || !en.leftPlateBroken || !en.rightPlateBroken;
        this.damageEnemy(en, baseDmg, weakPoint);
        // Weapon edge wears slightly on heavy iron impact
        this.state.edgeSharpness = Math.max(0.25, this.state.edgeSharpness - 0.025);
        this.riposteReadyTimer = 0;
      }
    }
  }

  private damageEnemy(en: EnemyActor, dmg: number, weakPoint: boolean): void {
    en.hp -= weakPoint ? dmg * 1.35 : dmg;
    en.staggerTimer = Math.max(en.staggerTimer, 0.55);
    this.audio.playArmorImpact(weakPoint);
    _vec3c.copy(en.pos).setY(en.pos.y + 1.35);
    this.emitSparks(_vec3c, weakPoint ? 24 : 12, 4.8);

    if (weakPoint && !en.leftPlateBroken) {
      en.leftPlateBroken = true;
      en.rig.weakPlateLeft.visible = false;
    } else if (weakPoint && !en.rightPlateBroken && en.hp < en.maxHp * 0.55) {
      en.rightPlateBroken = true;
      en.rig.weakPlateRight.visible = false;
    }

    if (en.hp <= 0) {
      en.alive = false;
      en.rig.root.visible = false;
      en.respawnTimer = en.isWarlord ? 9999 : 28;
      if (en.isWarlord) {
        this.state.warlordDefeated = true;
      }
      this.emitStatus();
    }
  }

  private updateForgePhysics(dt: number, elapsed: number): void {
    const f = this.state.forge;

    // Bellows animation
    if (this.bellowsAnimTimer > 0) {
      this.bellowsAnimTimer = Math.max(0, this.bellowsAnimTimer - dt);
      const phase = Math.sin((this.bellowsAnimTimer / 0.65) * Math.PI);
      this.world.bellowsPaddle.rotation.z = -phase * 0.38;
    } else {
      this.world.bellowsPaddle.rotation.z = THREE.MathUtils.damp(
        this.world.bellowsPaddle.rotation.z,
        0,
        8,
        dt
      );
    }

    // Hearth cooling & coal consumption
    f.hearthTemp = Math.max(420, f.hearthTemp - dt * 11);
    f.coalFuel = Math.max(0.15, f.coalFuel - dt * 0.004);

    // Steel ingot heating in hearth / cooling on anvil
    if (f.ingotLocation === 'hearth') {
      const targetT = f.hearthTemp * 0.94;
      f.ingotTemp = THREE.MathUtils.lerp(f.ingotTemp, targetT, dt * 0.55);
    } else if (f.ingotLocation === 'anvil') {
      f.ingotTemp = Math.max(80, f.ingotTemp - dt * 16);
    }

    // Flickering hearth light intensity
    const heatNorm = THREE.MathUtils.clamp((f.hearthTemp - 350) / 950, 0, 1);
    const flicker =
      1.0 + Math.sin(elapsed * 19) * 0.12 + Math.cos(elapsed * 31) * 0.08;
    this.world.hearthLight.intensity = (2.0 + heatNorm * 7.5) * flicker;
    this.mats.hearthCoals.emissiveIntensity = (0.6 + heatNorm * 2.2) * flicker;

    this.updateForgeBladeVisuals();
  }

  private updateDefenseMechanisms(dt: number, elapsed: number): void {
    const d = this.state.defense;

    // Waterwheel spins continuously by creek torque
    this.world.waterwheel.rotation.x -= dt * (0.9 + d.waterwheelSpeed * 1.1);
    this.world.streamWaterMesh.position.z = ((elapsed * 2.4) % 4) - 2;

    // Drawbridge angle smooth damping
    const targetBridgeAngle = d.drawbridgeRaised ? -Math.PI * 0.42 : 0;
    this.world.drawbridgeLeaf.rotation.x = THREE.MathUtils.damp(
      this.world.drawbridgeLeaf.rotation.x,
      targetBridgeAngle,
      5,
      dt
    );

    // Catapult arm swing & reset
    if (this.catapultThrowing) {
      this.catapultThrowProgress += dt * 2.2;
      if (this.catapultThrowProgress < 1) {
        this.world.catapultArm.rotation.x = THREE.MathUtils.lerp(
          0.45,
          -0.9,
          this.catapultThrowProgress
        );
        this.world.catapultBoulder.visible = this.catapultThrowProgress < 0.55;
      } else {
        this.catapultThrowing = false;
        this.world.catapultArm.rotation.x = 0.45;
        this.world.catapultBoulder.visible = true;
      }
    }

    // Boiling Oil Pour
    if (d.oilCooldown > 0) d.oilCooldown = Math.max(0, d.oilCooldown - dt);
    if (this.oilPourTimer > 0) {
      this.oilPourTimer -= dt;
      if (this.oilPourTimer <= 0) {
        this.world.oilPourMesh.visible = false;
      }
    }

    // Waterwheel-driven automatic repeating ballista fires at nearby raiders
    if (d.ballistaActive && d.mechanismIntegrity > 20) {
      this.ballistaCooldown -= dt;
      let nearest: EnemyActor | null = null;
      let nearestD = 42;
      for (const en of this.enemies) {
        if (!en.alive || en.isWarlord) continue;
        const dist = Math.hypot(en.pos.x + 12.5, en.pos.z - 9.5);
        if (dist < nearestD) {
          nearestD = dist;
          nearest = en;
        }
      }
      if (nearest) {
        const targetYaw = Math.atan2(
          nearest.pos.x + 12.5,
          nearest.pos.z - 9.5
        );
        this.world.ballistaTurret.rotation.y = targetYaw;
        if (this.ballistaCooldown <= 0) {
          this.ballistaCooldown = 4.2;
          const boltGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6);
          boltGeo.rotateX(Math.PI / 2);
          const bolt = new THREE.Mesh(boltGeo, this.mats.damascusSteel);
          const origin = new THREE.Vector3(-12.5, 3.6, 9.5);
          bolt.position.copy(origin);
          _vec3.subVectors(nearest.pos, origin).add(new THREE.Vector3(0, 1.2, 0)).normalize();
          bolt.lookAt(origin.clone().add(_vec3));
          this.scene.add(bolt);
          this.projectiles.push({
            mesh: bolt,
            pos: origin,
            vel: _vec3.clone().multiplyScalar(28),
            active: true,
            radius: 1.2,
            damage: 32,
            isBoulder: false,
          });
        }
      }
    }

    // Minecart gentle sway & Eagle's Crag brazier flicker
    this.world.mineCart.position.x = 1.5 + Math.sin(elapsed * 0.4) * 0.8;
    this.world.warlordBrazierLights.forEach((l, i) => {
      l.intensity = 2.8 + Math.sin(elapsed * 16 + i * 1.7) * 0.65;
    });
  }

  private updateEnemies(dt: number, elapsed: number): void {
    let threatCount = 0;

    for (const en of this.enemies) {
      if (!en.alive) {
        en.respawnTimer -= dt;
        if (en.respawnTimer <= 0) {
          en.alive = true;
          en.hp = en.maxHp;
          en.leftPlateBroken = false;
          en.rightPlateBroken = false;
          en.rig.weakPlateLeft.visible = true;
          en.rig.weakPlateRight.visible = true;
          en.pos.copy(en.homePos);
          en.rig.root.visible = true;
        }
        continue;
      }

      const distToPlayer = en.pos.distanceTo(this.playerPos);
      if (distToPlayer < 16) threatCount++;

      if (en.staggerTimer > 0) {
        en.staggerTimer -= dt;
        en.rig.torso.rotation.x = -0.25 * Math.sin(en.staggerTimer * 10);
        en.rig.root.position.copy(en.pos);
        continue;
      }
      en.rig.torso.rotation.x = 0;

      // Aggro & Pursuit
      const aggroRadius = en.isWarlord ? 15 : 19;
      if (distToPlayer < aggroRadius && this.state.started) {
        _vec3.subVectors(this.playerPos, en.pos);
        _vec3.y = 0;
        const planarDist = _vec3.length();
        en.yaw = Math.atan2(_vec3.x, _vec3.z);

        if (planarDist > (en.isWarlord ? 2.6 : 2.1)) {
          _vec3.normalize();
          const moveSpd = en.isWarlord ? 3.5 : 3.1;
          const nx = en.pos.x + _vec3.x * moveSpd * dt;
          const nz = en.pos.z + _vec3.z * moveSpd * dt;
          const ny = walkableHeightAt(nx, nz);
          if (Math.abs(ny - en.pos.y) < 1.8) {
            en.pos.set(nx, ny, nz);
          }
          const walk = Math.sin(elapsed * 7 + en.id) * 0.45;
          en.rig.leftLeg.rotation.x = walk;
          en.rig.rightLeg.rotation.x = -walk;
        } else {
          en.rig.leftLeg.rotation.x = 0;
          en.rig.rightLeg.rotation.x = 0;
          en.attackTimer -= dt;
          if (en.attackTimer <= 0 && !en.isAttacking) {
            en.isAttacking = true;
            en.attackWindup = 0.52;
          }
        }

        // Enemy Attack Windup & Parry Check!
        if (en.isAttacking) {
          en.attackWindup -= dt;
          en.rig.rightArm.rotation.x =
            en.attackWindup > 0 ? -1.45 : 0.45;
          if (en.attackWindup <= 0) {
            en.isAttacking = false;
            en.attackTimer = en.isWarlord ? 1.55 : 2.1;
            if (distToPlayer < (en.isWarlord ? 3.2 : 2.7)) {
              if (this.isBlocking && this.parryWindowTimer > 0) {
                // PERFECT SHIELD PARRY!
                this.audio.playParryClang();
                this.state.parryFlash = 1.0;
                this.riposteReadyTimer = 1.8;
                en.staggerTimer = 1.4;
                _vec3b.copy(this.playerPos).setY(this.playerPos.y + 1.3);
                this.emitSparks(_vec3b, 28, 5.2);
              } else if (this.isBlocking) {
                // Standard Shield Block
                this.audio.playParryClang();
                this.state.staminaRatio = Math.max(0, this.state.staminaRatio - 0.16);
                this.state.healthRatio = Math.max(0.05, this.state.healthRatio - 0.04);
                _vec3b.copy(this.playerPos).setY(this.playerPos.y + 1.3);
                this.emitSparks(_vec3b, 12, 3.0);
              } else {
                // Direct Hit on Enes
                this.audio.playArmorImpact(false);
                this.state.damageFlash = 1.0;
                this.state.healthRatio = Math.max(
                  0.06,
                  this.state.healthRatio - (en.isWarlord ? 0.22 : 0.12)
                );
              }
            }
          }
        } else {
          en.rig.rightArm.rotation.x = THREE.MathUtils.damp(
            en.rig.rightArm.rotation.x,
            0,
            8,
            dt
          );
        }
      }

      en.rig.root.position.copy(en.pos);
      en.rig.root.rotation.y = en.yaw;
    }

    this.state.activeSiegeThreat = threatCount > 0;
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!p.active) continue;

      if (p.isBoulder) {
        p.vel.y -= 16 * dt;
      }
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);

      // Check Enemy Hit
      let hit = false;
      for (const en of this.enemies) {
        if (!en.alive) continue;
        if (p.pos.distanceTo(en.pos) < p.radius + 1.1) {
          this.damageEnemy(en, p.damage, true);
          hit = true;
          if (!p.isBoulder) break;
        }
      }

      const gy = groundHeightAt(p.pos.x, p.pos.z);
      if (hit || p.pos.y <= gy || p.pos.length() > 140) {
        if (p.isBoulder) {
          this.emitSparks(p.pos, 26, 6.0);
          this.audio.playArmorImpact(true);
        }
        p.active = false;
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateParticles(dt: number): void {
    const sAttr = this.sparkGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.sparkPool.length; i++) {
      const p = this.sparkPool[i];
      if (p.active) {
        p.life -= dt;
        p.vel.y -= 12.0 * dt;
        p.pos.addScaledVector(p.vel, dt);
        const gy = groundHeightAt(p.pos.x, p.pos.z);
        if (p.pos.y < gy) {
          p.pos.y = gy;
          p.vel.y *= -0.45;
        }
        if (p.life <= 0) {
          p.active = false;
          p.pos.set(0, -100, 0);
        }
      } else {
        p.pos.set(0, -100, 0);
      }
      sAttr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
    }
    sAttr.needsUpdate = true;

    const stAttr = this.steamGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.steamPool.length; i++) {
      const p = this.steamPool[i];
      if (p.active) {
        p.life -= dt;
        p.pos.addScaledVector(p.vel, dt);
        if (p.life <= 0) {
          p.active = false;
          p.pos.set(0, -100, 0);
        }
      } else {
        p.pos.set(0, -100, 0);
      }
      stAttr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
    }
    stAttr.needsUpdate = true;
  }

  private updateCamera(dt: number): void {
    if (!this.state.started) {
      // Gentle atmospheric orbit around Crimson Keep Master's Forge on title screen
      const t = this.clock.elapsedTime * 0.14;
      _vec3.set(
        -2.2 + Math.cos(t) * 6.8,
        4.8 + Math.sin(t * 0.7) * 0.6,
        -3.5 + Math.sin(t) * 6.8
      );
      this.camera.position.lerp(_vec3, Math.min(1, dt * 3));
      this.camera.lookAt(-2.5, 3.2, -4.2);
      return;
    }

    if (this.state.cameraMode === 'first_person') {
      _vec3.set(this.playerPos.x, this.playerPos.y + 1.62, this.playerPos.z);
      this.camera.position.copy(_vec3);
      _euler.set(this.pitch, this.yaw, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      this.camera.quaternion.copy(_quat);
    } else {
      // Smooth third-person over-the-shoulder camera
      const dist = 4.2;
      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);
      const cosP = Math.cos(this.pitch * 0.6);
      const targetX = this.playerPos.x + sinY * dist * cosP + cosY * 0.45;
      const targetZ = this.playerPos.z + cosY * dist * cosP - sinY * 0.45;
      const targetY = Math.max(
        walkableHeightAt(targetX, targetZ) + 0.8,
        this.playerPos.y + 2.0 - Math.sin(this.pitch) * 2.1
      );
      _vec3.set(targetX, targetY, targetZ);
      this.camera.position.lerp(_vec3, 1 - Math.exp(-12 * dt));
      _vec3b.set(this.playerPos.x, this.playerPos.y + 1.45, this.playerPos.z);
      this.camera.lookAt(_vec3b);
    }
  }

  private emitStatus(): void {
    this.onStatusChange({
      ...this.state,
      forge: {
        ...this.state.forge,
        zones: this.state.forge.zones.map((z) => ({ ...z })),
      },
      defense: { ...this.state.defense },
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('mousedown', this.onMouseDown);
    canvas.removeEventListener('contextmenu', this.onContextMenu);
    canvas.removeEventListener('webglcontextlost', this.onContextLost);

    this.audio.dispose();
    this.world.dispose();
    this.mats.dispose();
    this.sparkGeo.dispose();
    this.steamGeo.dispose();
    this.renderer.dispose();
    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
