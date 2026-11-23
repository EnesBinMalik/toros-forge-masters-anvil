import React from 'react';
import {
  ActiveEquipment,
  DiegeticStatus,
  ForgeWeaponChoice,
  REGIONS,
} from '../types/game';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Hammer,
  Map as MapIcon,
  Pickaxe,
  Shield,
  Sword,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface DiegeticOverlayProps {
  status: DiegeticStatus;
  onStart: () => void;
  onToggleCamera: () => void;
  onToggleMap: () => void;
  onToggleControls: () => void;
  onToggleMute: () => void;
  onSelectEquipment: (eq: ActiveEquipment) => void;
  onSelectForgeChoice: (choice: ForgeWeaponChoice) => void;
  onInteract: () => void;
  onLockPointer: () => void;
}

export const DiegeticOverlay: React.FC<DiegeticOverlayProps> = ({
  status,
  onStart,
  onToggleCamera,
  onToggleMap,
  onToggleControls,
  onToggleMute,
  onSelectEquipment,
  onSelectForgeChoice,
  onInteract,
  onLockPointer,
}) => {
  // 1. Opening Title Lockup over Live 3D Crimson Keep Forge
  if (!status.started) {
    return (
      <div className="fixed inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-t from-[#0c0907]/90 via-[#0c0907]/35 to-[#0c0907]/60 px-6 text-center">
        <div className="max-w-2xl space-y-5">
          <div className="text-xs tracking-[0.28em] uppercase text-[#c89d66]">
            Enes Öztürk · Kızılgeçit Kalesi ve Toros Geçitleri
          </div>
          <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-wider text-[#efe4d2] drop-shadow-lg">
            TOROS FORGE
          </h1>
          <div className="font-display text-lg sm:text-xl tracking-[0.22em] text-[#d4a464] uppercase">
            The Master&apos;s Anvil
          </div>
          <p className="font-editorial text-base sm:text-lg text-[#cfc2af] leading-relaxed max-w-xl mx-auto">
            Körüğü çek, Şam çeliğini örs üzerinde elinle şekillendir, su verip bileyle;
            mancınık ve su çarkı savunmalarıyla Toros geçitlerini koru.
          </p>
          <div className="pt-4">
            <button
              onClick={onStart}
              className="px-8 py-3.5 font-display text-sm sm:text-base font-bold tracking-widest uppercase bg-[#9c3a1a] hover:bg-[#b54520] text-[#f7ecd9] border border-[#d68c53]/60 rounded-sm shadow-xl transition-colors cursor-pointer"
            >
              Ocağın Başına Geç
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Diegetic optical response for exhaustion, wounds, and steel parry (zero HUD boxes)
  const fatigueOpacity = Math.max(0, (0.55 - status.healthRatio) * 0.95);
  const damageOpacity = status.damageFlash * 0.45;
  const parryOpacity = status.parryFlash * 0.35;
  const region = REGIONS[status.currentRegion];

  return (
    <>
      {/* Pure Optical Wound / Exhaustion / Parry Vignette */}
      <div
        className="pointer-events-none fixed inset-0 z-10 transition-opacity duration-150"
        style={{
          background:
            'radial-gradient(circle at center, transparent 52%, rgba(92, 14, 10, 0.85) 100%)',
          opacity: Math.min(0.82, fatigueOpacity + damageOpacity),
        }}
      />
      {parryOpacity > 0.01 && (
        <div
          className="pointer-events-none fixed inset-0 z-10"
          style={{
            background:
              'radial-gradient(circle at center, transparent 60%, rgba(255, 198, 112, 0.6) 100%)',
            opacity: parryOpacity,
          }}
        />
      )}

      {/* Minimal Static Center Aim Pinpoint when Pointer-Locked */}
      {status.pointerLocked && !status.mapOpen && (
        <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center">
          <div className="w-1 h-1 rounded-full bg-[#efe4d2]/75" />
        </div>
      )}

      {/* Subtle Diegetic Region Name Whisper only when controls drawer is expanded or brief top caption */}
      <div className="pointer-events-none fixed top-4 left-1/2 -translate-x-1/2 z-10 text-center">
        <div className="font-display text-xs tracking-[0.2em] uppercase text-[#e6d7bf]/70">
          {region.titleTr}
        </div>
      </div>

      {/* Discreet Bottom-Center Contextual Interaction Whisper */}
      {status.interactionPrompt && !status.mapOpen && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-20">
          <button
            onClick={onInteract}
            className="px-4 py-2 text-xs sm:text-sm font-editorial tracking-wide bg-[#16120e]/88 hover:bg-[#241c15] text-[#f0dec2] border border-[#8e6d45]/60 rounded-sm shadow-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            {status.interactionPrompt}
          </button>
        </div>
      )}

      {/* Collapsible Bottom Artisan Control Dock (Zero Viewport Occlusion) */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
        <button
          onClick={onToggleControls}
          className="flex items-center gap-1.5 px-3 py-1 text-[11px] tracking-wider uppercase font-display bg-[#14100c]/88 hover:bg-[#211a14] text-[#cbb697] border border-[#6a5236]/55 rounded-sm transition-colors cursor-pointer whitespace-nowrap"
        >
          {status.controlsExpanded ? (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Arayüzü Gizle (H)</span>
            </>
          ) : (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Teçhizat ve Kroki (H)</span>
            </>
          )}
        </button>

        {status.controlsExpanded && (
          <div className="mt-1.5 px-3 py-2.5 bg-[#14100c]/95 border border-[#6a5236]/60 rounded-sm shadow-2xl flex flex-wrap items-center justify-center gap-2 max-w-[94vw]">
            {/* Equipment Switcher */}
            <div className="flex items-center gap-1 pr-2 border-r border-[#5c462e]/50">
              <button
                onClick={() => onSelectEquipment('sword_shield')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-sm border transition-colors cursor-pointer whitespace-nowrap ${
                  status.equipment === 'sword_shield'
                    ? 'bg-[#8f381b] border-[#d68c53] text-[#f8ecd9]'
                    : 'bg-[#1e1812] border-[#4e3b27] text-[#cbb89b] hover:text-[#f8ecd9]'
                }`}
              >
                <Sword className="w-3.5 h-3.5" />
                <span>[1] Kılıç · Kalkan</span>
              </button>
              <button
                onClick={() => onSelectEquipment('warhammer')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-sm border transition-colors cursor-pointer whitespace-nowrap ${
                  status.equipment === 'warhammer'
                    ? 'bg-[#8f381b] border-[#d68c53] text-[#f8ecd9]'
                    : 'bg-[#1e1812] border-[#4e3b27] text-[#cbb89b] hover:text-[#f8ecd9]'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>[2] Savaş Çekici</span>
              </button>
              <button
                onClick={() => onSelectEquipment('forge_hammer')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-sm border transition-colors cursor-pointer whitespace-nowrap ${
                  status.equipment === 'forge_hammer'
                    ? 'bg-[#8f381b] border-[#d68c53] text-[#f8ecd9]'
                    : 'bg-[#1e1812] border-[#4e3b27] text-[#cbb89b] hover:text-[#f8ecd9]'
                }`}
              >
                <Hammer className="w-3.5 h-3.5" />
                <span>[3] Balyoz</span>
              </button>
              <button
                onClick={() => onSelectEquipment('pickaxe')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-sm border transition-colors cursor-pointer whitespace-nowrap ${
                  status.equipment === 'pickaxe'
                    ? 'bg-[#8f381b] border-[#d68c53] text-[#f8ecd9]'
                    : 'bg-[#1e1812] border-[#4e3b27] text-[#cbb89b] hover:text-[#f8ecd9]'
                }`}
              >
                <Pickaxe className="w-3.5 h-3.5" />
                <span>[4] Kazma</span>
              </button>
            </div>

            {/* Forge Project Selector */}
            <div className="flex items-center gap-1 pr-2 border-r border-[#5c462e]/50">
              <button
                onClick={() => onSelectForgeChoice('broadsword')}
                className={`px-2 py-1 text-xs rounded-sm border cursor-pointer whitespace-nowrap ${
                  status.forge.weaponChoice === 'broadsword'
                    ? 'bg-[#3d2b1a] border-[#c89d66] text-[#f5e7ce]'
                    : 'bg-[#1a1510] border-[#4a3825] text-[#a79579]'
                }`}
              >
                Ocak: Şam Kılıcı
              </button>
              <button
                onClick={() => onSelectForgeChoice('warhammer')}
                className={`px-2 py-1 text-xs rounded-sm border cursor-pointer whitespace-nowrap ${
                  status.forge.weaponChoice === 'warhammer'
                    ? 'bg-[#3d2b1a] border-[#c89d66] text-[#f5e7ce]'
                    : 'bg-[#1a1510] border-[#4a3825] text-[#a79579]'
                }`}
              >
                Ocak: Savaş Çekici
              </button>
            </div>

            {/* View, Map, Pointer Lock & Sound */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={onToggleCamera}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-[#1e1812] hover:bg-[#2a2219] border border-[#5c462e] text-[#e4d5bc] rounded-sm cursor-pointer whitespace-nowrap"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{status.cameraMode === 'first_person' ? '1. Şahıs (V)' : '3. Şahıs (V)'}</span>
              </button>
              <button
                onClick={onToggleMap}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-[#1e1812] hover:bg-[#2a2219] border border-[#5c462e] text-[#e4d5bc] rounded-sm cursor-pointer whitespace-nowrap"
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>Kroki (M)</span>
              </button>
              {!status.pointerLocked && (
                <button
                  onClick={onLockPointer}
                  className="px-2.5 py-1.5 text-xs bg-[#2c2116] hover:bg-[#3b2c1d] border border-[#8e6d45] text-[#f0dec2] rounded-sm cursor-pointer whitespace-nowrap"
                >
                  Bakışı Kilitle
                </button>
              )}
              <button
                onClick={onToggleMute}
                aria-label={status.muted ? 'Sesi Aç' : 'Sesi Kapat'}
                className="p-1.5 text-xs bg-[#1e1812] hover:bg-[#2a2219] border border-[#5c462e] text-[#e4d5bc] rounded-sm cursor-pointer"
              >
                {status.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Quiet 1-line movement & combat controls */}
            <div className="w-full text-center text-[11px] text-[#9e8c72] pt-1 border-t border-[#473623]/40">
              WASD: Yürü · Shift: Koş · Sol Tık / F: Savur / Çekiçle · Sağ Tık / Q: Kalkan &amp; Parry · E: Etkileşim · M: Parşömen Kroki · V: Kamera
            </div>
          </div>
        )}
      </div>
    </>
  );
};
