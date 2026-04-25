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
  // UPGRADE 1: LocalStorage Data Persistence
  const [corners, setCorners] = useState(() => {
    const savedMatrix = localStorage.getItem('src-vrt-matrix-lock');
    return savedMatrix ? JSON.parse(savedMatrix) : getCenteredCoordinates();
  });
  
  const [activeCorner, setActiveCorner] = useState(null);
  const [dragStart, setDragStart] = useState(null); 
  
  // UPGRADE 2: Physical UI Lock & Independent Scaling
  const [isLocked, setIsLocked] = useState(false);
  const [payloadScale, setPayloadScale] = useState(1);
  const containerRef = useRef(null);

  // Auto-save coordinate state to device memory
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
      {!isPitchMode && (
        <div className={`absolute top-16 z-50 flex items-center gap-2 pointer-events-auto transition-all duration-300 ${isAmbi ? 'right-4 flex-row-reverse' : 'left-4'}`}>
          <button onClick={clearPayload} className={`w-8 h-8 flex items-center justify-center font-bold rounded active:scale-95 ${themeCfg.btnDanger}`}>✕</button>
          
          {/* INJECTED LOCK UI BUTTON */}
          <button 
            onClick={() => setIsLocked(!isLocked)} 
            className={`px-3 h-8 text-xs font-mono rounded active:scale-95 transition-colors ${isLocked ? themeCfg.btnDanger : themeCfg.btnDefault}`}
          >
            {isLocked ? '[ MATRIX: LOCKED ]' : '[ MATRIX: ACTIVE ]'}
          </button>
          
          <button onClick={() => setCorners(getCenteredCoordinates())} className={`px-3 h-8 text-xs font-mono rounded active:scale-95 ${themeCfg.btnDefault}`}>[ RESET PLANE ]</button>
        </div>
      )}

      <div 
        className="absolute top-0 left-0 origin-top-left flex items-center justify-center overflow-visible"
        style={{ transform: transformMatrix, width: '240px', height: '240px', pointerEvents: 'none' }}
      >
        {/* INJECTED DECOUPLED PAYLOAD SCALE WRAPPER */}
        <div style={{ transform: `scale(${payloadScale})`, transformOrigin: 'center center', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {children}
        </div>
      </div>

      {/* INDEPENDENT SCALE SLIDER UI */}
      {!isPitchMode && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center pointer-events-auto">
          <label className={`text-xs font-mono tracking-widest mb-2 font-bold ${themeCfg.appBg === 'bg-[#f4f4f5]' ? 'text-gray-800' : 'text-cyan-400'}`}>
            SCALE: {payloadScale.toFixed(2)}x
          </label>
          <input 
            type="range" 
            min="0.2" max="3" step="0.05" 
            value={payloadScale} 
            onChange={(e) => setPayloadScale(parseFloat(e.target.value))}
            className="w-48 accent-cyan-500"
          />
        </div>
      )}

      {/* NODE RENDER CONDITIONED ON isLocked */}
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
