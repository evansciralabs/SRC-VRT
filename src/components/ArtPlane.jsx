import React, { useState, useEffect, useRef } from 'react';
import { calculateMatrix3D } from '../utils/mathUtils';

export default function ArtPlane({ activePayload }) {
  const [anchors, setAnchors] = useState([
    { x: 50, y: 50 },   
    { x: 350, y: 50 },  
    { x: 350, y: 350 }, 
    { x: 50, y: 350 }   
  ]);
  
  const [transformMatrix, setTransformMatrix] = useState('none');
  const draggingAnchor = useRef(null);

  useEffect(() => {
    const matrix = calculateMatrix3D(400, 400, anchors[0], anchors[1], anchors[2], anchors[3]);
    setTransformMatrix(`matrix3d(${matrix.join(',')})`);
  }, [anchors]);

  const handlePointerDown = (index, e) => {
    draggingAnchor.current = index;
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (draggingAnchor.current === null) return;
    const index = draggingAnchor.current;
    setAnchors(prev => {
      const newAnchors = [...prev];
      newAnchors[index] = { 
        x: newAnchors[index].x + e.movementX, 
        y: newAnchors[index].y + e.movementY 
      };
      return newAnchors;
    });
  };

  const handlePointerUp = (e) => {
    if (draggingAnchor.current !== null) {
      e.target.releasePointerCapture(e.pointerId);
      draggingAnchor.current = null;
    }
  };

  return (
    <div className="art-plane absolute inset-0 pointer-events-none overflow-hidden z-10">
      <div 
        className="payload-container origin-top-left absolute"
        style={{ transform: transformMatrix, width: '400px', height: '400px' }}
      >
        {activePayload && (
          <>
            <style dangerouslySetInnerHTML={{ __html: activePayload.css }} />
            <div dangerouslySetInnerHTML={{ __html: activePayload.svg }} />
          </>
        )}
      </div>

      {anchors.map((point, i) => (
        <div 
          key={i}
          className="anchor-point absolute w-6 h-6 bg-cyan-400 border-2 border-white rounded-full pointer-events-auto shadow-[0_0_12px_rgba(0,255,204,0.6)] hover:scale-110 transition-transform cursor-grab active:cursor-grabbing"
          style={{ left: point.x - 12, top: point.y - 12, touchAction: 'none' }}
          onPointerDown={(e) => handlePointerDown(i, e)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      ))}
    </div>
  );
}
