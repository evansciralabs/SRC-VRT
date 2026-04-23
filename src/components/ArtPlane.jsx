import React, { useState, useEffect, useRef } from 'react';
import { solveHomography } from '../utils/mathUtils'; // Ensure this path matches your setup

// Calculate true center based on the device window
const getCenteredCoordinates = () => {
  const w = typeof window !== 'undefined' ? window.innerWidth : 400;
  // 80vh of screen height to match GroundPlane
  const h = typeof window !== 'undefined' ? window.innerHeight * 0.8 : 600; 
  const size = 120; // Radius from center. Total size will be 240x240px initially
  
  return [
    { x: (w / 2) - size, y: (h / 2) - size }, // Top Left
    { x: (w / 2) + size, y: (h / 2) - size }, // Top Right
    { x: (w / 2) + size, y: (h / 2) + size }, // Bottom Right
    { x: (w / 2) - size, y: (h / 2) + size }  // Bottom Left
  ];
};

export default function ArtPlane({ children }) {
  const [corners, setCorners] = useState(getCenteredCoordinates());
  const [activeCorner, setActiveCorner] = useState(null);
  const containerRef = useRef(null);

  // Recalculate center if they rotate the device
  useEffect(() => {
    const handleResize = () => setCorners(getCenteredCoordinates());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePointerDown = (index, e) => {
    e.stopPropagation();
    setActiveCorner(index);
  };

  const handlePointerMove = (e) => {
    if (activeCorner === null || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newCorners = [...corners];
    newCorners[activeCorner] = { x, y };
    setCorners(newCorners);
  };

  const handlePointerUp = () => {
    setActiveCorner(null);
  };

  const resetPlane = () => {
    setCorners(getCenteredCoordinates());
  };

  // Ensure matrix doesn't crash if homography fails
  const transformMatrix = solveHomography(corners) || 'matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)';

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 w-full h-full pointer-events-auto"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* RESET BUTTON */}
      <button 
        onClick={resetPlane}
        className="absolute top-4 left-4 z-50 bg-[#112222]/90 border border-cyan-400 text-cyan-400 px-3 py-2 text-xs font-mono rounded hover:bg-cyan-900 transition-colors shadow-[0_0_10px_rgba(0,255,204,0.3)] active:scale-95"
      >
        [ RESET PLANE ]
      </button>

      {/* THE TRANSFORMED PAYLOAD */}
      <div 
        className="absolute top-0 left-0 origin-top-left border border-cyan-500/50 shadow-[0_0_20px_rgba(0,255,204,0.1)]"
        style={{
          transform: transformMatrix,
          width: '240px', // Matches the 'size * 2' in getCenteredCoordinates
          height: '240px',
          pointerEvents: 'none' // Let clicks pass through the art to the ground if needed
        }}
      >
        {children}
      </div>

      {/* DRAG ANCHORS */}
      {corners.map((corner, i) => (
        <div
          key={i}
          onPointerDown={(e) => handlePointerDown(i, e)}
          className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full border-2 border-cyan-400 bg-black/50 cursor-grab active:cursor-grabbing active:bg-cyan-400/50 transition-colors z-40 shadow-[0_0_10px_rgba(0,255,204,0.5)] touch-none"
          style={{ 
            left: corner.x, 
            top: corner.y 
          }}
        />
      ))}
    </div>
  );
}
