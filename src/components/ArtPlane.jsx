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

export default function ArtPlane({ children, isPitchMode, isActive, clearPayload }) {
  const [corners, setCorners] = useState(getCenteredCoordinates());
  const [activeCorner, setActiveCorner] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setCorners(getCenteredCoordinates());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePointerDown = (index, e) => {
    if (isPitchMode || !isActive) return;
    e.stopPropagation();
    setActiveCorner(index);
  };

  const handlePointerMove = (e) => {
    if (activeCorner === null || !containerRef.current || isPitchMode || !isActive) return;
    const rect = containerRef.current.getBoundingClientRect();
    const newCorners = [...corners];
    newCorners[activeCorner] = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setCorners(newCorners);
  };

  const handlePointerUp = () => setActiveCorner(null);
  const resetPlane = () => setCorners(getCenteredCoordinates());

  const transformMatrix = solveHomography(corners) || 'matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)';

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
        <div className="absolute top-16 left-4 z-50 flex items-center gap-2 pointer-events-auto">
          {/* CORRECTED: Hostile Red Purge Trigger */}
          <button 
            onClick={clearPayload} 
            className="w-8 h-8 flex items-center justify-center bg-black/80 border border-red-500 text-red-500 font-bold rounded hover:bg-red-900 shadow-[0_0_10px_rgba(255,0,0,0.3)] active:scale-95 transition-colors"
          >
            ✕
          </button>
          <button 
            onClick={resetPlane}
            className="px-3 h-8 bg-[#112222]/90 border border-cyan-400 text-cyan-400 text-xs font-mono rounded hover:bg-cyan-900 shadow-[0_0_10px_rgba(0,255,204,0.3)] active:scale-95 transition-colors"
          >
            [ RESET PLANE ]
          </button>
        </div>
      )}

      <div 
        className="absolute top-0 left-0 origin-top-left flex items-center justify-center overflow-visible"
        style={{ transform: transformMatrix, width: '240px', height: '240px', pointerEvents: 'none' }}
      >
        {children}
      </div>

      {!isPitchMode && corners.map((corner, i) => (
        <div
          key={i}
          onPointerDown={(e) => handlePointerDown(i, e)}
          className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full border-2 border-cyan-400 bg-black/50 cursor-grab active:cursor-grabbing active:bg-cyan-400/50 shadow-[0_0_10px_rgba(0,255,204,0.5)] touch-none z-[60]"
          style={{ left: corner.x, top: corner.y }}
        />
      ))}
    </div>
  );
}
