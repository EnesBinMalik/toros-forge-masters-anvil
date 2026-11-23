export type RegionId =
  | 'crimson_keep'
  | 'cedar_woods'
  | 'gorge_viaduct'
  | 'ore_mines'
  | 'eagles_crag';

export interface RegionInfo {
  id: RegionId;
  titleTr: string;
  titleEn: string;
  subtitle: string;
  x: number;
  z: number;
  elevation: string;
}

export type CameraMode = 'first_person' | 'third_person';

export type ActiveEquipment =
  | 'sword_shield'
  | 'warhammer'
  | 'forge_hammer'
  | 'pickaxe';

export type IngotLocation = 'hearth' | 'anvil' | 'quench' | 'none';

export type ForgeWeaponChoice = 'broadsword' | 'warhammer';

export interface BladeZoneState {
  id: 'tang' | 'fuller' | 'edge' | 'tip';
  label: string;
  progress: number; // 0..1 forged shape perfection
  strikes: number;
}

export interface ForgeState {
  hearthTemp: number; // 250..1350 C
  coalFuel: number; // 0..1
  ingotTemp: number; // 20..1300 C
  ingotLocation: IngotLocation;
  weaponChoice: ForgeWeaponChoice;
  zones: BladeZoneState[];
  isQuenched: boolean;
  forgedMasterworks: number;
  rawOreCount: number;
  cedarTimberCount: number;
}

export interface DefenseState {
  catapultWind: number; // 0..1
  catapultLoaded: boolean;
  oilBoilingHeat: number; // 0..1
  oilCooldown: number;
  drawbridgeRaised: boolean;
  waterwheelSpeed: number; // 0..1
  ballistaActive: boolean;
  mechanismIntegrity: number; // 0..100
  gateIntegrity: number; // 0..100
}

export interface DiegeticStatus {
  started: boolean;
  pointerLocked: boolean;
  cameraMode: CameraMode;
  currentRegion: RegionId;
  equipment: ActiveEquipment;
  interactionPrompt: string | null;
  interactionActionId: string | null;
  inForgeStation: boolean;
  mapOpen: boolean;
  muted: boolean;
  controlsExpanded: boolean;
  // Diegetic thresholds (never shown as raw bars or numbers in active play)
  healthRatio: number; // 0..1
  staminaRatio: number; // 0..1
  edgeSharpness: number; // 0..1
  sootRatio: number; // 0..1
  wetnessRatio: number; // 0..1
  parryFlash: number; // 0..1 transient
  damageFlash: number; // 0..1 transient
  forge: ForgeState;
  defense: DefenseState;
  warlordDefeated: boolean;
  activeSiegeThreat: boolean;
}

export const REGIONS: Record<RegionId, RegionInfo> = {
  crimson_keep: {
    id: 'crimson_keep',
    titleTr: 'Kızılgeçit Kalesi ve Ana Ocak',
    titleEn: 'The Crimson Keep',
    subtitle: 'Demirci Atölyesi · Su Çarkı · Surlar',
    x: 0,
    z: 0,
    elevation: '1.420 m',
  },
  cedar_woods: {
    id: 'cedar_woods',
    titleTr: 'Sedir Ormanları ve Oduncu Kampı',
    titleEn: 'The Cedar Woods',
    subtitle: 'Toros Sedirleri · Kereste Kampı · Öncü Pususu',
    x: -54,
    z: 36,
    elevation: '1.380 m',
  },
  gorge_viaduct: {
    id: 'gorge_viaduct',
    titleTr: 'Derin Kanyon ve Asma Taş Köprü',
    titleEn: 'The Gorge Viaduct',
    subtitle: 'Tarihi Kemer Köprü · Kuşatma Hattı',
    x: 0,
    z: 64,
    elevation: '1.310 m',
  },
  ore_mines: {
    id: 'ore_mines',
    titleTr: 'Eski Bakır ve Demir Madeni',
    titleEn: 'The Deep Ore Mines',
    subtitle: 'Yeraltı Galerisi · Cevher Damarı · Raylı Vagon',
    x: 62,
    z: 6,
    elevation: '1.390 m',
  },
  eagles_crag: {
    id: 'eagles_crag',
    titleTr: 'Kartal Yuvası Gözetleme Kulesi',
    titleEn: "The Eagle's Crag",
    subtitle: 'Karlı Zirve · Zırhlı Kuşatma Komutanı',
    x: 0,
    z: -74,
    elevation: '2.180 m',
  },
};
