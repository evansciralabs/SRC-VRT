import React, { useState, useRef, useEffect } from 'react';

/**
 * CalibrationAnchor
 * ─────────────────
 * Two draggable nodes define a reference line over a known physical dimension
 * in the captured image. The user inputs the real-world length; the component
 * calculates R = D_physical / D_pixel and exposes it via onRatioChange so the
 * parent (or ArtPlane) can translate CSS scale into physical dimensions.
 *
 * Props:
 *   isActive        bool    — mount/unmount from parent toggle
 *   themeCfg        object  — theme tokens from App
 *   payloadScale    number  — current ArtPlane scale (passed in for live readout)
 *   artPlaneBaseSize number — pixel width of the ArtPlane base quad (default 240)
 *   onRatioChange   (ratio: number | null) => void
 */
export default function CalibrationAnchor({
  isActive,
  themeCfg,
  payloadScale = 1,
  artPlaneBaseSize = 240,
  onRatioChange,
}) {
  // Two anchor points in screen-space pixels
  const defaultA = { x: window.innerWidth * 0.3, y: window.innerHeight * 0.5 };
  const defaultB = { x: window.innerWidth * 0.7, y: window.innerHeight * 0.5 };

  const [pointA, setPointA] = useState(defaultA);
  const [pointB, setPointB] = useState(defaultB);
  const [dragging, setDragging] = useState(null); // 'A' | 'B' | null

  const [physicalInput, setPhysicalInput] = useState('');
  const [physicalUnit, setPhysicalUnit] = useState('ft');
  const [isInputFocused, setIsInputFocused] = useState(false);

  const containerRef = useRef(null);

  // ── Pixel distance between the two anchor points ─────────────────────────
  const dx = pointB.x - pointA.x;
  const dy = pointB.y - pointA.y;
  const pixelDistance = Math.sqrt(dx * dx + dy * dy);

  // ── Ratio calculation ─────────────────────────────────────────────────────
  const physicalValue = parseFloat(physicalInput);
  const ratio = physicalValue > 0 && pixelDistance > 0
    ? physicalValue / pixelDistance
    : null;

  // ── Live payload dimension estimate ──────────────────────────────────────
  // The ArtPlane base is artPlaneBaseSize px wide; scaled by payloadScale.
  const physicalWidth = ratio ? ratio * artPlaneBaseSize * payloadScale : null;
  const physicalHeight = physicalWidth; // base quad is square

  // ── Notify parent of ratio changes ───────────────────────────────────────
  useEffect(() => {
    if (onRatioChange) onRatioChange(ratio);
  }, [ratio]);

  // ── Pointer event handlers ───────────────────────────────────────────────
  const handlePointerDown = (point, e) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(point);
  };

  const handlePointerMove = (e) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (dragging === 'A') setPointA(pos);
    if (dragging === 'B') setPointB(pos);
  };

  const handlePointerUp = () => setDragging(null);

  if (!isActive) return null;

  // ── Midpoint for label placement ─────────────────────────────────────────
  const midX = (pointA.x + pointB.x) / 2;
  const midY = (pointA.y + pointB.y) / 2;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  const isNeon = themeCfg.appBg === 'bg-black';
  const isDaylight = themeCfg.appBg === 'bg-[#f4f4f5]';

  const accentColor = isDaylight ? '#3b82f6' : isNeon ? '#f59e0b' : '#6b7280';
  const accentText = isDaylight ? 'text-blue-500' : isNeon ? 'text-amber-400' : 'text-gray-500';
  const panelClass = isDaylight
    ? 'bg-white/90 border border-blue-300 text-slate-600'
    : isNeon
    ? 'bg-black/80 border border-amber-500/50 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
    : 'bg-[#0a0a0a]/80 border border-gray-700 text-gray-500';

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-[55] pointer-events-auto"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* SVG overlay: reference line + tick marks */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
        style={{ zIndex: 1 }}
      >
        {/* Dashed reference line */}
        <line
          x1={pointA.x} y1={pointA.y}
          x2={pointB.x} y2={pointB.y}
          stroke={accentColor}
          strokeWidth="1.5"
          strokeDasharray="6 4"
          opacity="0.8"
        />
        {/* End tick A */}
        <line
          x1={pointA.x} y1={pointA.y - 8}
          x2={pointA.x} y2={pointA.y + 8}
          stroke={accentColor}
          strokeWidth="2"
          transform={`rotate(${angle}, ${pointA.x}, ${pointA.y})`}
        />
        {/* End tick B */}
        <line
          x1={pointB.x} y1={pointB.y - 8}
          x2={pointB.x} y2={pointB.y + 8}
          stroke={accentColor}
          strokeWidth="2"
          transform={`rotate(${angle}, ${pointB.x}, ${pointB.y})`}
        />
        {/* Pixel distance label above midpoint */}
        <text
          x={midX}
          y={midY - 14}
          textAnchor="middle"
          fill={accentColor}
          fontSize="9"
          fontFamily="monospace"
          fontWeight="bold"
          opacity="0.7"
          transform={`rotate(${angle > 90 || angle < -90 ? angle + 180 : angle}, ${midX}, ${midY - 14})`}
        >
          {pixelDistance.toFixed(1)}px
        </text>
      </svg>

      {/* Drag handle A */}
      <div
        onPointerDown={(e) => handlePointerDown('A', e)}
        className="absolute z-10 w-6 h-6 -ml-3 -mt-3 rounded-full border-2 cursor-grab active:cursor-grabbing touch-none flex items-center justify-center"
        style={{
          left: pointA.x,
          top: pointA.y,
          borderColor: accentColor,
          backgroundColor: `${accentColor}22`,
          boxShadow: `0 0 8px ${accentColor}80`,
        }}
      >
        <span className="text-[8px] font-mono font-bold" style={{ color: accentColor }}>A</span>
      </div>

      {/* Drag handle B */}
      <div
        onPointerDown={(e) => handlePointerDown('B', e)}
        className="absolute z-10 w-6 h-6 -ml-3 -mt-3 rounded-full border-2 cursor-grab active:cursor-grabbing touch-none flex items-center justify-center"
        style={{
          left: pointB.x,
          top: pointB.y,
          borderColor: accentColor,
          backgroundColor: `${accentColor}22`,
          boxShadow: `0 0 8px ${accentColor}80`,
        }}
      >
        <span className="text-[8px] font-mono font-bold" style={{ color: accentColor }}>B</span>
      </div>

      {/* Control panel: physical input + live readout */}
      <div
        className={`absolute bottom-40 left-1/2 -translate-x-1/2 z-20 rounded-lg px-4 py-3 font-mono text-[10px] tracking-widest backdrop-blur-md pointer-events-auto ${panelClass}`}
        style={{ minWidth: '220px' }}
      >
        {/* Header */}
        <div className={`text-[9px] font-bold tracking-[0.2em] mb-2 opacity-60 ${accentText}`}>
          CALIBRATION ANCHOR
        </div>

        {/* Physical dimension input row */}
        <div className="flex items-center gap-2 mb-2">
          <span className="opacity-60">REF =</span>
          <input
            type="number"
            min="0.01"
            step="0.1"
            value={physicalInput}
            onChange={(e) => setPhysicalInput(e.target.value)}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            placeholder="0.0"
            className={`w-16 bg-transparent border-b outline-none text-center font-mono text-[11px] font-bold ${accentText} ${
              isNeon ? 'border-amber-700' : isDaylight ? 'border-blue-300' : 'border-gray-700'
            }`}
          />
          {/* Unit toggle */}
          <button
            onClick={() =>
              setPhysicalUnit((u) => {
                const units = ['ft', 'in', 'm', 'cm'];
                return units[(units.indexOf(u) + 1) % units.length];
              })
            }
            className={`text-[10px] font-bold opacity-70 hover:opacity-100 transition-opacity ${accentText}`}
          >
            [{physicalUnit}]
          </button>
        </div>

        {/* Ratio + live payload readout */}
        {ratio ? (
          <div className="space-y-0.5 opacity-80">
            <div>
              R = {ratio.toFixed(4)} {physicalUnit}/px
            </div>
            <div className={`font-bold ${accentText}`}>
              PAYLOAD W: {(physicalWidth).toFixed(2)} {physicalUnit}
            </div>
            <div className={`font-bold ${accentText}`}>
              PAYLOAD H: {(physicalHeight).toFixed(2)} {physicalUnit}
            </div>
          </div>
        ) : (
          <div className="opacity-40">
            {physicalInput
              ? 'DRAG A→B OVER KNOWN REF'
              : 'ENTER PHYSICAL DIMENSION'}
          </div>
        )}

        {/* Pixel distance passthrough */}
        <div className="mt-1.5 opacity-40 text-[9px]">
          Δpx = {pixelDistance.toFixed(1)}
        </div>
      </div>
    </div>
  );
}
