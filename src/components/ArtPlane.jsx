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

export default function ArtPlane({ children, isPitchMode, isActive, clearPayload, isAmbi, themeCfg }) {
  const [corners, setCorners] = useState(() => {
    const savedMatrix = localStorage.getItem('src-vrt-matrix-lock');
    return savedMatrix ? JSON.parse(savedMatrix) : getCenteredCoordinates();
  });
  
  const [activeCorner, setActiveCorner] = useState(null);
  const [dragStart, setDragStart] = useState(null); 
  
  const [isLocked, setIsLocked] = useState(false);
  const [payloadScale, setPayloadScale] = useState(1);
  const containerRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('src-vrt-matrix-lock', JSON.stringify(corners));
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

  const handleReset = () => {
    setCorners(getCenteredCoordinates());
    setPayloadScale(1);
  };

  const transformMatrix = solveHomography(corners) || 'matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)';

  const centerX = corners.reduce((sum, c) => sum + c.x, 0) / 4;
  const centerY = corners.reduce((sum, c) => sum + c.y, 0) / 4;

  if (!isActive) {
    return <div className="absolute inset-0 pointer-events-none z-40">{children}</div>;
  }

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 w-full h-full pointer-events-auto z-40"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* Global CSS injection for sleek hardware slider aesthetics */}
      <style>{`
        .cyber-slider { -webkit-appearance: none; appearance: none; background: transparent; }
        .cyber-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 8px; height: 18px;
          background: #06b6d4; border: 1px solid #cffafe;
          cursor: pointer; border-radius: 1px;
          box-shadow: 0 0 10px #06b6d4;
          margin-top: -7px;
        }
        .cyber-slider::-webkit-slider-runnable-track {
          width: 100%; height: 4px;
          cursor: pointer; background: rgba(6, 182, 212, 0.2);
          border-radius: 2px; border: 1px solid rgba(6, 182, 212, 0.4);
        }
        .cyber-slider::-moz-range-thumb {
          width: 8px; height: 18px;
          background: #06b6d4; border: 1px solid #cffafe;
          cursor: pointer; border-radius: 1px;
          box-shadow: 0 0 10px #06b6d4;
        }
      `}</style>

      {/* Top Header Controls */}
      {!isPitchMode && (
        <div className={`absolute top-16 z-50 flex items-center gap-4 pointer-events-auto transition-all duration-300 ${isAmbi ? 'right-4 flex-row-reverse' : 'left-4'}`}>
          <button onClick={clearPayload} className={`w-10 h-10 flex items-center justify-center font-bold text-lg rounded-full active:scale-95 ${themeCfg.btnDanger}`}>✕</button>
          <button onClick={handleReset} className={`px-4 h-10 text-xs font-mono font-bold rounded-full active:scale-95 ${themeCfg.btnDefault}`}>[ RESET PLANE ]</button>
        </div>
      )}

      {/* Vertical Stack: Hexagon Lock */}
      {!isPitchMode && (
        <div className={`absolute top-1/3 -translate-y-1/2 z-50 flex flex-col items-center gap-4 pointer-events-auto transition-all duration-300 ${isAmbi ? 'right-4' : 'left-4'}`}>
          <button 
            onClick={() => setIsLocked(!isLocked)} 
            className={`w-12 h-12 flex items-center justify-center text-3xl rounded-full border-2 active:scale-90 transition-all duration-300 ${isLocked ? 'text-red-500 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)] bg-red-900/20' : 'text-cyan-400 border-cyan-400 shadow-[0_0_10px_rgba(0,204,255,0.3)] bg-cyan-900/20'}`}
          >
            {isLocked ? '⬣' : '⎔'}
          </button>
        </div>
      )}

      <div 
        className="absolute top-0 left-0 origin-top-left flex items-center justify-center overflow-visible"
        style={{ transform: transformMatrix, width: '240px', height: '240px', pointerEvents: 'none' }}
      >
        <div style={{ transform: `scale(${payloadScale})`, transformOrigin: 'center center', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {children}
        </div>
      </div>

      {/* Sleek Middle-Ground HUD Slider - Tuned to avoid Carousel & OS hitboxes */}
      {!isPitchMode && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[45] flex flex-col items-center pointer-events-auto w-64 bg-[#0a0a0c]/80 px-4 py-2 rounded-lg border border-cyan-500/30 shadow-[0_0_15px_rgba(0,204,255,0.1)] backdrop-blur-md">
          <div className="flex justify-between w-full px-1 mb-2">
            <span className={`text-[9px] font-mono font-bold tracking-widest ${themeCfg.appBg === 'bg-[#f4f4f5]' ? 'text-gray-500' : 'text-cyan-700'}`}>MIN</span>
            <label className={`text-[10px] font-mono tracking-widest font-black shadow-cyan-500/50 drop-shadow-md ${themeCfg.appBg === 'bg-[#f4f4f5]' ? 'text-gray-800' : 'text-cyan-400'}`}>
              SCALE // {payloadScale.toFixed(2)}x
            </label>
            <span className={`text-[9px] font-mono font-bold tracking-widest ${themeCfg.appBg === 'bg-[#f4f4f5]' ? 'text-gray-500' : 'text-cyan-700'}`}>MAX</span>
          </div>
          <input 
            type="range" 
            min="0.2" max="3" step="0.05" 
            value={payloadScale} 
            onChange={(e) => setPayloadScale(parseFloat(e.target.value))}
            className="cyber-slider w-full"
          />
        </div>
      )}

      {!isPitchMode && !isLocked && corners.map((corner, i) => (
        <div
          key={i}
          onPointerDown={(e) => handlePointerDown(i, e)}
          className={`absolute w-8 h-8 -ml-4 -mt-4 rounded-full border-2 cursor-grab active:cursor-grabbing touch-none z-[60] transition-colors duration-300 ${themeCfg.anchor} ${themeCfg.anchorActive}`}
          style={{ left: corner.x, top: corner.y }}
        />
      ))}

      {!isPitchMode && !isLocked && (
        <div
          onPointerDown={(e) => handlePointerDown('center', e)}
          className={`absolute w-12 h-12 -ml-6 -mt-6 rounded-full border flex items-center justify-center cursor-move active:cursor-grabbing touch-none z-[60] transition-colors duration-300 ${themeCfg.anchor} ${themeCfg.anchorActive}`}
          style={{ left: centerX, top: centerY }}
        >
          <div className={`w-2 h-2 rounded-full ${themeCfg.appBg === 'bg-[#f4f4f5]' ? 'bg-blue-500' : 'bg-cyan-400'}`} />
        </div>
      )}
    </div>
  );
}
