import React from 'react';
import { RegionId, REGIONS, DiegeticStatus } from '../types/game';
import { Compass, X } from 'lucide-react';

interface ParchmentMapModalProps {
  status: DiegeticStatus;
  onClose: () => void;
  onTravel: (region: RegionId) => void;
}

const REGION_COORDS: Record<RegionId, { cx: number; cy: number }> = {
  eagles_crag: { cx: 340, cy: 76 },
  crimson_keep: { cx: 340, cy: 235 },
  ore_mines: { cx: 560, cy: 248 },
  cedar_woods: { cx: 135, cy: 330 },
  gorge_viaduct: { cx: 340, cy: 395 },
};

export const ParchmentMapModal: React.FC<ParchmentMapModalProps> = ({
  status,
  onClose,
  onTravel,
}) => {
  if (!status.mapOpen) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4">
      <div
        className="relative w-full max-w-4xl rounded-sm border border-[#6c5234] bg-[#d8c49c] text-[#2a1c10] shadow-2xl p-6 md:p-8"
        style={{
          backgroundImage:
            'radial-gradient(circle at 25% 20%, rgba(255,244,218,0.45), transparent 55%), radial-gradient(circle at 80% 85%, rgba(112,78,40,0.22), transparent 60%)',
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#8c6e49]/50 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs tracking-widest text-[#5d4225] uppercase">
              <Compass className="w-4 h-4" />
              <span>Enes Öztürk El Yazması · Kızılgeçit Arşivi</span>
            </div>
            <h2 className="font-display text-2xl md:text-3xl font-bold tracking-wide text-[#24160b] mt-1">
              Toros Geçidi Savunma Krokisi
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold border border-[#6c5234]/60 rounded-sm bg-[#cbb386] hover:bg-[#bfa370] text-[#24160b] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Kapat (M)</span>
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Hand-inked SVG Topographic Map */}
          <div className="lg:col-span-8 border border-[#7c5f3d]/60 bg-[#cfb88e]/70 rounded-sm p-2">
            <svg
              viewBox="0 0 680 460"
              className="w-full h-auto block select-none"
              role="img"
              aria-label="Toros Geçidi Savunma Krokisi"
            >
              {/* Topographic contours */}
              <g fill="none" stroke="#6f5333" strokeOpacity="0.35" strokeWidth="1.2">
                <ellipse cx="340" cy="76" rx="145" ry="52" />
                <ellipse cx="340" cy="76" rx="95" ry="34" />
                <ellipse cx="560" cy="248" rx="90" ry="70" />
                <ellipse cx="135" cy="330" rx="105" ry="75" />
                <path d="M 40 370 Q 200 330 340 365 T 640 385" strokeDasharray="4 4" />
                <path d="M 40 420 Q 210 385 340 425 T 640 430" strokeDasharray="4 4" />
              </g>

              {/* Mountain Creek Path */}
              <path
                d="M 215 20 C 235 120, 265 180, 285 240 C 305 300, 290 360, 295 450"
                fill="none"
                stroke="#35586c"
                strokeWidth="5"
                strokeLinecap="round"
                strokeOpacity="0.72"
              />

              {/* Trade Roads connecting all 5 regions */}
              <g fill="none" stroke="#4a3119" strokeWidth="2.5" strokeDasharray="7 5">
                <line x1="340" y1="76" x2="340" y2="235" />
                <line x1="340" y1="235" x2="340" y2="395" />
                <line x1="340" y1="235" x2="560" y2="248" />
                <line x1="340" y1="235" x2="135" y2="330" />
              </g>

              {/* Interactive Region Pins */}
              {(Object.keys(REGIONS) as RegionId[]).map((rid) => {
                const reg = REGIONS[rid];
                const { cx, cy } = REGION_COORDS[rid];
                const isHere = status.currentRegion === rid;
                return (
                  <g
                    key={rid}
                    onClick={() => onTravel(rid)}
                    className="cursor-pointer group"
                  >
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isHere ? 20 : 15}
                      fill={isHere ? '#8c2318' : '#3d2817'}
                      fillOpacity={isHere ? 0.25 : 0.12}
                      stroke={isHere ? '#8c2318' : '#3d2817'}
                      strokeWidth={isHere ? 2.5 : 1.5}
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={6}
                      fill={isHere ? '#9e261a' : '#2f1f11'}
                    />
                    <text
                      x={cx}
                      y={cy + 30}
                      textAnchor="middle"
                      fill="#24160b"
                      fontSize="13"
                      fontWeight="700"
                      fontFamily="Cinzel, Georgia, serif"
                    >
                      {reg.titleTr.split(' ve ')[0]}
                    </text>
                    <text
                      x={cx}
                      y={cy + 44}
                      textAnchor="middle"
                      fill="#5a3f24"
                      fontSize="10"
                      fontFamily="Georgia, serif"
                    >
                      {reg.elevation}
                    </text>
                  </g>
                );
              })}

              {/* Red Wax Seal Stamp */}
              <g transform="translate(605, 395)">
                <circle cx="0" cy="0" r="24" fill="#8c2318" fillOpacity="0.88" />
                <circle cx="0" cy="0" r="17" fill="none" stroke="#c96b59" strokeWidth="1" />
                <text
                  x="0"
                  y="4"
                  textAnchor="middle"
                  fill="#f4dec2"
                  fontSize="11"
                  fontWeight="700"
                  fontFamily="Cinzel, Georgia, serif"
                >
                  E.Ö.
                </text>
              </g>
            </svg>
          </div>

          {/* Field Notes & Quick Region Route List */}
          <div className="lg:col-span-4 flex flex-col justify-between gap-4 text-sm">
            <div className="space-y-3">
              <p className="font-editorial italic text-[#422c17] leading-relaxed border-b border-[#8c6e49]/40 pb-3">
                “Her geçit taşını kendi elimle ördüm. Haritada bir bölgeye dokunarak
                doğrudan o hatta ilerleyebilirsin.”
              </p>
              <div className="space-y-2">
                {(Object.keys(REGIONS) as RegionId[]).map((rid) => {
                  const reg = REGIONS[rid];
                  const isHere = status.currentRegion === rid;
                  return (
                    <button
                      key={rid}
                      onClick={() => onTravel(rid)}
                      className={`w-full text-left px-3 py-2 rounded-sm border transition-colors cursor-pointer ${
                        isHere
                          ? 'bg-[#8c2318]/15 border-[#8c2318] text-[#24160b]'
                          : 'bg-[#d4be94]/60 border-[#7c5f3d]/40 hover:bg-[#c6ae80] text-[#2f1f11]'
                      }`}
                    >
                      <div className="font-display text-xs font-bold">
                        {reg.titleTr}
                      </div>
                      <div className="text-xs text-[#593e22] mt-0.5">
                        {reg.subtitle} · {reg.elevation}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-[#8c6e49]/40 pt-3 text-xs text-[#4a331c] space-y-1">
              <div>
                Dövülen Usta İşi Silah: <strong className="tabular-nums">{status.forge.forgedMasterworks}</strong>
              </div>
              <div>
                Cevher / Sedir Kerestesi:{' '}
                <strong className="tabular-nums">
                  {status.forge.rawOreCount} · {status.forge.cedarTimberCount}
                </strong>
              </div>
              <div>
                Zırhlı Kuşatma Komutanı:{' '}
                <strong>{status.warlordDefeated ? 'Alt Edildi' : 'Kartal Yuvası Zirvesinde'}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
