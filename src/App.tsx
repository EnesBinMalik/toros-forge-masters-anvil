import { useEffect, useRef, useState } from 'react';
import { DiegeticOverlay } from './components/DiegeticOverlay';
import { ParchmentMapModal } from './components/ParchmentMapModal';
import { TorosEngine } from './engine/TorosEngine';
import { DiegeticStatus } from './types/game';

const INITIAL_STATUS: DiegeticStatus = {
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

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<TorosEngine | null>(null);
  const [status, setStatus] = useState<DiegeticStatus>(INITIAL_STATUS);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new TorosEngine(container, (nextStatus) => {
      setStatus(nextStatus);
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0e0c0a]">
      {/* Dedicated isolated WebGL canvas container */}
      <div
        ref={mountRef}
        className="absolute inset-0 w-full h-full"
        aria-label="Toros Forge 3D Viewport"
      />

      <DiegeticOverlay
        status={status}
        onStart={() => engineRef.current?.startExperience()}
        onToggleCamera={() => engineRef.current?.toggleCameraMode()}
        onToggleMap={() => engineRef.current?.toggleMap()}
        onToggleControls={() => engineRef.current?.toggleControlsPanel()}
        onToggleMute={() => engineRef.current?.toggleMute()}
        onSelectEquipment={(eq) => engineRef.current?.setEquipment(eq)}
        onSelectForgeChoice={(ch) => engineRef.current?.setForgeWeaponChoice(ch)}
        onInteract={() => engineRef.current?.triggerContextualInteraction()}
        onLockPointer={() => engineRef.current?.requestPointerLock()}
      />

      <ParchmentMapModal
        status={status}
        onClose={() => engineRef.current?.toggleMap()}
        onTravel={(region) => engineRef.current?.travelToRegion(region)}
      />
    </main>
  );
}
