import React, { useState, useEffect, useRef } from 'react';
import solveHomography from '../utils/mathUtils'; 

const getCenteredCoordinates = () => {
  const w = typeof window !== 'undefined' ? window.innerWidth : 400;
  const h = typeof window !== 'undefined' ? window.innerHeight * 0.8 : 600; 
  const size = 120; 
  
  return [
    { x: (w / 2) - size, y: (h / 2) - size }, 
    { x: (w / 2) + size, y: (h / 2) - size }, 
    { x: (w / 2) + size, y: (h / 2) + size }, 
    { x: (w / 2) - size, y: (h / 2) + size }  
  ];
};

// ── SPATIAL SCALE UTILS ────────────────────────────────────────────────────
// Derives a pixel→physical ratio from WebXR hit data or a manual reference.
// artPlaneBaseSize is the width of the untransformed 240px quad in px.
// physicalPerPx: metres per pixel (from WebXR) or null when unknown.
const derivePhysicalDimensions = (payloadScale, physicalPerPx, artPlaneBaseSize = 240) => {
  if (!physicalPerPx) return null;
  const physicalWidth  = physicalPerPx * artPlaneBaseSize * payloadScale;
  const physicalHeight = physicalPerPx * artPlaneBaseSize * payloadScale;
  const toFtIn = (m) => {
    const totalIn = m * 39.3701;
    const ft = Math.floor(totalIn / 12);
    const inches = (totalIn % 12).toFixed(1);
    return ft > 0 ? `${ft}′ ${inches}″` : `${inches}″`;
  };
  return { w: toFtIn(physicalWidth), h: toFtIn(physicalHeight), wM: physicalWidth, hM: physicalHeight };
};

// ── WEBXR SCALE HOOK ───────────────────────────────────────────────────────
// Attempts to resolve metres-per-pixel via WebXR hit-test.
// Falls back silently to null; caller handles the null case with manual entry.
// SDAP-VISION slot is stubbed here for future vision-model object recognition.
const useWebXRScale = (isActive) => {
  const [physicalPerPx, setPhysicalPerPx] = useState(null);
  const [xrStatus, setXrStatus] = useState('IDLE'); // IDLE | SCANNING | LOCKED | MANUAL | UNSUPPORTED

  useEffect(() => {
    if (!isActive) return;

    const tryWebXR = async () => {
      if (!navigator.xr) { setXrStatus('UNSUPPORTED'); return; }
      const supported = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
      if (!supported) { setXrStatus('UNSUPPORTED'); return; }

      setXrStatus('SCANNING');
      try {
        const session = await navigator.xr.requestSession('immersive-ar', {
          requiredFeatures: ['hit-test'],
          optionalFeatures: ['dom-overlay'],
        });

        const refSpace = await session.requestReferenceSpace('local');
        const hitTestSource = await session.requestHitTestSource({ space: refSpace });

        const onFrame = (time, frame) => {
          const hits = frame.getHitTestResults(hitTestSource);
          if (hits.length > 0) {
            const pose = hits[0].getPose(refSpace);
            if (pose) {
              // Use the XR hit distance (metres from device to surface)
              // combined with FOV to derive px→m at image centre.
              // Approximation: at 1m distance, ~60° FOV, screen width px →
              // physical width = 2 * tan(30°) * distance ≈ 1.155m per screen-width
              const distM = Math.sqrt(
                pose.transform.position.x ** 2 +
                pose.transform.position.y ** 2 +
                pose.transform.position.z ** 2
              );
              const screenWidthPx = window.innerWidth;
              const fovRad = (60 * Math.PI) / 180;
              const physicalWidthM = 2 * Math.tan(fovRad / 2) * distM;
              const mPerPx = physicalWidthM / screenWidthPx;
              setPhysicalPerPx(mPerPx);
              setXrStatus('LOCKED');
              hitTestSource.cancel();
              session.end();
            }
          }
          if (xrStatus !== 'LOCKED') session.requestAnimationFrame(onFrame);
        };
        session.requestAnimationFrame(onFrame);
      } catch (err) {
        console.warn('[VRT] WebXR hit-test failed, falling back to manual.', err);
        setXrStatus('UNSUPPORTED');
      }
    };

    tryWebXR();
  }, [isActive]);

  // Manual reference setter: user supplies two pixel points + known physical distance
  const setManualReference = (pixelDistance, physicalMetres) => {
    if (pixelDistance > 0 && physicalMetres > 0) {
      setPhysicalPerPx(physicalMetres / pixelDistance);
      setXrStatus('MANUAL');
    }
  };

  // SDAP-VISION: object recognition scale resolution — deferred to future build
  // const resolveViaVision = async (imageDataUrl) => { ... }

  return { physicalPerPx, xrStatus, setManualReference };
};


export default function ArtPlane({ children, isPitchMode, isActive, clearPayload, clearAll, isAmbi, themeCfg, onCyclePrev, onCycleNext, onStamp, stampedCount, isLocked, stampTrigger, lockTrigger, onCornersChange, onScaleChange, restoredCorners, restoredScale }) {
  const [corners, setCorners] = useState(() => {
    const savedMatrix = localStorage.getItem('src-vrt-matrix-lock');
    return savedMatrix ? JSON.parse(savedMatrix) : getCenteredCoordinates();
  });
  
  const [activeCorner, setActiveCorner] = useState(null);
  const [dragStart, setDragStart] = useState(null); 
  
  const [payloadScale, setPayloadScale] = useState(1);
  const containerRef = useRef(null);

  // When a stamped layer is reactivated, restore its exact corners and scale
  useEffect(() => {
    if (restoredCorners) {
      setCorners(restoredCorners);
      if (onCornersChange) onCornersChange(restoredCorners);
    }
  }, [restoredCorners]);

  useEffect(() => {
    if (restoredScale !== null && restoredScale !== undefined) {
      setPayloadScale(restoredScale);
      if (onScaleChange) onScaleChange(restoredScale);
    }
  }, [restoredScale]);

  // ── CALIBRATION STATE ────────────────────────────────────────────────────
  // Manual reference tap state: two points on the captured image
  const [manualPtA, setManualPtA] = useState(null);
  const [manualPtB, setManualPtB] = useState(null);
  const [manualTapMode, setManualTapMode] = useState(false); // awaiting tap A then B
  const [manualTapStep, setManualTapStep] = useState(0);     // 0=none, 1=awaiting A, 2=awaiting B
  const [manualPhysInput, setManualPhysInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  const { physicalPerPx, xrStatus, setManualReference } = useWebXRScale(isActive);

  const dims = derivePhysicalDimensions(payloadScale, physicalPerPx);

  useEffect(() => {
    localStorage.setItem('src-vrt-matrix-lock', JSON.stringify(corners));
    if (onCornersChange) onCornersChange(corners);
  }, [corners]);

  useEffect(() => {
    const handleResize = () => setCorners(getCenteredCoordinates());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePointerDown = (index, e) => {
    if (isPitchMode || !isActive || isLocked) return;
    e.stopPropagation();
    setActiveCorner(index);
    if (index === 'center') {
      setDragStart({ x: e.clientX, y: e.clientY, initialCorners: [...corners] });
    }
  };

  const handlePointerMove = (e) => {
    if (activeCorner === null || !containerRef.current || isPitchMode || !isActive || isLocked) return;
    
    if (activeCorner === 'center' && dragStart) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      const newCorners = dragStart.initialCorners.map(c => ({ x: c.x + dx, y: c.y + dy }));
      setCorners(newCorners);
    } 
    else if (typeof activeCorner === 'number') {
      const rect = containerRef.current.getBoundingClientRect();
      const newCorners = [...corners];
      newCorners[activeCorner] = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setCorners(newCorners);
    }
  };

  const handlePointerUp = () => {
    setActiveCorner(null);
    setDragStart(null);
  };

  // Reset zeroes out the matrix and snaps the scale back to 1.00x
  const handleReset = () => {
    setCorners(getCenteredCoordinates());
    setPayloadScale(1);
    if (onScaleChange) onScaleChange(1);
  };

  // ── STAMP ────────────────────────────────────────────────────────────────
  // Fires current matrix + scale up to App, then resets plane for next node.
  const handleStamp = () => {
    if (!onStamp) return;
    onStamp(transformMatrix, payloadScale, corners);
    setCorners(getCenteredCoordinates());
    setPayloadScale(1);
  };

  // Fires when App's lock button is tapped (stampTrigger increments) — advances to next node
  useEffect(() => {
    if (stampTrigger > 0) handleStamp();
  }, [stampTrigger]);

  // Fires when App's lock button is held (lockTrigger increments) — bakes final position, no advance
  useEffect(() => {
    if (lockTrigger > 0 && onStamp) {
      onStamp(transformMatrix, payloadScale, corners, true);
    }
  }, [lockTrigger]);
  // ────────────────────────────────────────────────────────────────────────

  // ── MANUAL CAL TAP ───────────────────────────────────────────────────────
  const handleContainerTap = (e) => {
    if (!manualTapMode) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (manualTapStep === 1) {
      setManualPtA(pt);
      setManualTapStep(2);
    } else if (manualTapStep === 2) {
      setManualPtB(pt);
      setManualTapStep(0);
      setManualTapMode(false);
      setShowManualInput(true);
    }
  };

  const commitManualReference = () => {
    if (!manualPtA || !manualPtB) return;
    const dx = manualPtB.x - manualPtA.x;
    const dy = manualPtB.y - manualPtA.y;
    const pixDist = Math.sqrt(dx * dx + dy * dy);
    const physM = parseFloat(manualPhysInput) * 0.3048; // ft to metres
    setManualReference(pixDist, physM);
    setShowManualInput(false);
    setManualPtA(null);
    setManualPtB(null);
  };
  // ────────────────────────────────────────────────────────────────────────

  const transformMatrix = solveHomography(corners) || 'matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)';

  const centerX = corners.reduce((sum, c) => sum + c.x, 0) / 4;
  const centerY = corners.reduce((sum, c) => sum + c.y, 0) / 4;

  const isNeon = themeCfg.appBg === 'bg-black';
  const isDaylight = themeCfg.appBg === 'bg-[#f4f4f5]';

  if (!isActive && !isLocked) {
    return <div className="absolute inset-0 pointer-events-none z-40">{children}</div>;
  }

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 w-full h-full pointer-events-auto z-40"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onClick={handleContainerTap}
    >
      <style>{`
        .cyber-slider { -webkit-appearance: none; appearance: none; background: transparent; }
        .cyber-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none; width: 8px; height: 18px;
          background: #06b6d4; border: 1px solid #cffafe; cursor: pointer; border-radius: 1px;
          box-shadow: 0 0 10px #06b6d4; margin-top: -7px;
        }
        .cyber-slider::-webkit-slider-runnable-track {
          width: 100%; height: 4px; cursor: pointer; background: rgba(6, 182, 212, 0.2);
          border-radius: 2px; border: 1px solid rgba(6, 182, 212, 0.4);
        }
        .cyber-slider::-moz-range-thumb {
          width: 8px; height: 18px; background: #06b6d4; border: 1px solid #cffafe;
          cursor: pointer; border-radius: 1px; box-shadow: 0 0 10px #06b6d4;
        }
      `}</style>

      {/* Top Header Controls */}
      {!isPitchMode && (
        <div className={`absolute top-16 z-50 flex items-center gap-2 pointer-events-auto transition-all duration-300 ${isAmbi ? 'right-4 flex-row-reverse' : 'left-4'}`}>
          {/* X: clears active layer only */}
          <button onClick={clearPayload} className={`w-8 h-8 flex items-center justify-center font-bold rounded active:scale-95 ${themeCfg.btnDanger}`}>✕</button>
          {/* Reset plane: resets geometry only, keeps payload */}
          <button onClick={handleReset} className={`px-3 h-8 text-xs font-mono rounded active:scale-95 ${themeCfg.btnDefault}`}>[ RESET PLANE ]</button>
        </div>
      )}


      {/* No lock button here — lives in App toolset column for proper spacing */}

      {/* Art content — identical to V1 */}
      <div 
        className="absolute top-0 left-0 origin-top-left flex items-center justify-center overflow-visible"
        style={{ transform: transformMatrix, width: '240px', height: '240px', pointerEvents: 'none' }}
      >
        <div style={{ transform: `scale(${payloadScale})`, transformOrigin: 'center center', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {children}
        </div>
      </div>

      {/* ── MANUAL CALIBRATION TAP OVERLAY ──────────────────────────────── */}
      {manualTapMode && (
        <div className="absolute inset-0 z-[65] pointer-events-none flex items-center justify-center">
          <div className="text-white/80 font-mono text-xs tracking-widest text-center bg-black/60 px-4 py-2 rounded-lg">
            {manualTapStep === 1 ? 'TAP POINT A' : 'TAP POINT B'}
          </div>
        </div>
      )}

      {/* Reference dots */}
      {manualPtA && (
        <div className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-amber-400 bg-amber-400/30 pointer-events-none z-[66]"
          style={{ left: manualPtA.x, top: manualPtA.y }} />
      )}
      {manualPtB && (
        <div className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-amber-400 bg-amber-400/30 pointer-events-none z-[66]"
          style={{ left: manualPtB.x, top: manualPtB.y }} />
      )}
      {manualPtA && manualPtB && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-[65]" style={{ overflow: 'visible' }}>
          <line x1={manualPtA.x} y1={manualPtA.y} x2={manualPtB.x} y2={manualPtB.y}
            stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5 3" opacity="0.7" />
        </svg>
      )}

      {/* Manual physical input — appears after both points are set */}
      {showManualInput && (
        <div className={`absolute bottom-40 left-1/2 -translate-x-1/2 z-[70] rounded-lg px-4 py-3 font-mono text-[10px] tracking-widest backdrop-blur-md pointer-events-auto flex flex-col items-center gap-2 ${
          isDaylight ? 'bg-white/90 border border-blue-300 text-slate-600'
          : isNeon ? 'bg-black/85 border border-amber-500/50 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
          : 'bg-[#0a0a0a]/85 border border-gray-700 text-gray-400'
        }`}>
          <div className="text-[9px] opacity-60 tracking-[0.2em]">KNOWN DISTANCE (FT)</div>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="number" min="0.1" step="0.1"
              value={manualPhysInput}
              onChange={e => setManualPhysInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && commitManualReference()}
              placeholder="0.0"
              className="w-20 bg-transparent border-b outline-none text-center font-mono text-[12px] font-bold"
              style={{ borderColor: isNeon ? '#b45309' : isDaylight ? '#93c5fd' : '#4b5563' }}
            />
            <button onClick={commitManualReference}
              className={`px-3 h-7 text-[10px] font-mono rounded active:scale-95 ${themeCfg.btnDefault}`}>
              SET
            </button>
          </div>
        </div>
      )}
      {/* ─────────────────────────────────────────────────────────────────── */}

      {/* ── LOWER QUADRANT: Slider + calibration readout ─────────────────── */}
      {!isPitchMode && (
        <div className="absolute bottom-24 w-full px-6 flex justify-center items-center gap-3 z-50 pointer-events-auto">
          {onCyclePrev && (
            <button onClick={onCyclePrev} className={`w-12 h-12 rounded-full text-xl flex items-center justify-center active:scale-90 font-bold shadow-lg ${themeCfg.btnDefault}`}>◁</button>
          )}
          
          <div className="flex-1 max-w-[220px] flex flex-col items-center bg-[#0a0a0c]/80 px-4 py-2 rounded-lg border border-cyan-500/30 shadow-[0_0_15px_rgba(0,204,255,0.1)] backdrop-blur-md">
            <label className={`text-[10px] font-mono tracking-widest font-black mb-1 shadow-cyan-500/50 drop-shadow-md ${isDaylight ? 'text-gray-800' : 'text-cyan-400'}`}>
              SCALE // {payloadScale.toFixed(2)}x
            </label>
            <input 
              type="range" min="0.2" max="3" step="0.05" 
              value={payloadScale} 
              onChange={(e) => { const s = parseFloat(e.target.value); setPayloadScale(s); if (onScaleChange) onScaleChange(s); }}
              className="cyber-slider w-full"
            />

            {/* ── CALIBRATION READOUT — lives inside slider panel ─────── */}
            {dims ? (
              <div className="mt-1.5 text-[9px] font-mono tracking-wider text-center w-full border-t border-cyan-500/20 pt-1">
                <span className={isDaylight ? 'text-slate-500' : 'text-cyan-300/70'}>
                  W {dims.w} · H {dims.h}
                </span>
                {xrStatus === 'LOCKED' && <span className="ml-1 text-green-400/70">⬡XR</span>}
                {xrStatus === 'MANUAL' && <span className="ml-1 text-amber-400/70">⬡REF</span>}
              </div>
            ) : (
              /* Only show the calibration nudge when WebXR isn't available */
              xrStatus === 'UNSUPPORTED' && (
                <button
                  onClick={() => { setManualTapMode(true); setManualTapStep(1); setManualPtA(null); setManualPtB(null); }}
                  className="mt-1.5 text-[9px] font-mono tracking-wider opacity-40 hover:opacity-70 transition-opacity"
                  style={{ color: isDaylight ? '#64748b' : '#67e8f9' }}
                >
                  [ SET SCALE REF ]
                </button>
              )
            )}
            {/* ─────────────────────────────────────────────────────────── */}
          </div>

          {onCycleNext && (
            <button onClick={onCycleNext} className={`w-12 h-12 rounded-full text-xl flex items-center justify-center active:scale-90 font-bold shadow-lg ${themeCfg.btnDefault}`}>▷</button>
          )}
        </div>
      )}

      {/* Corner drag handles — identical to V1 */}
      {!isPitchMode && !isLocked && corners.map((corner, i) => (
        <div
          key={i}
          onPointerDown={(e) => handlePointerDown(i, e)}
          className={`absolute w-8 h-8 -ml-4 -mt-4 rounded-full border-2 cursor-grab active:cursor-grabbing touch-none z-[60] transition-colors duration-300 ${themeCfg.anchor} ${themeCfg.anchorActive}`}
          style={{ left: corner.x, top: corner.y }}
        />
      ))}

      {/* Center drag handle — identical to V1 */}
      {!isPitchMode && !isLocked && (
        <div
          onPointerDown={(e) => handlePointerDown('center', e)}
          className={`absolute w-12 h-12 -ml-6 -mt-6 rounded-full border flex items-center justify-center cursor-move active:cursor-grabbing touch-none z-[60] transition-colors duration-300 ${themeCfg.anchor} ${themeCfg.anchorActive}`}
          style={{ left: centerX, top: centerY }}
        >
          <div className={`w-2 h-2 rounded-full ${isDaylight ? 'bg-blue-500' : 'bg-cyan-400'}`} />
        </div>
      )}
    </div>
  );
}
