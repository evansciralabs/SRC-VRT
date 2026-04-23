import React, { useState, useEffect, useRef } from 'react';

export default function GroundPlane({ children, isPitchMode, hardwareTrigger, groundImage, setGroundImage }) {
  const [isCameraLive, setIsCameraLive] = useState(false);
  const [mediaStream, setMediaStream] = useState(null);
  
  // Image Manipulation State
  const [imgTransform, setImgTransform] = useState({ rotate: 0, flipX: 1, flipY: 1 });
  
  const videoRef = useRef(null);

  useEffect(() => {
    if (hardwareTrigger > 0) requestHardwareAccess();
  }, [hardwareTrigger]);

  const requestHardwareAccess = async () => {
    startCamera();
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setMediaStream(stream);
      setIsCameraLive(true);
    } catch (err) { console.error("Lens init failed:", err); }
  };

  useEffect(() => {
    if (isCameraLive && videoRef.current && mediaStream) {
      videoRef.current.srcObject = mediaStream;
    }
  }, [isCameraLive, mediaStream]);

  const captureFrame = (e) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (video) {
      const memoryCanvas = document.createElement('canvas');
      memoryCanvas.width = video.videoWidth || video.clientWidth || window.innerWidth;
      memoryCanvas.height = video.videoHeight || video.clientHeight || window.innerHeight;
      
      const ctx = memoryCanvas.getContext('2d');
      ctx.drawImage(video, 0, 0, memoryCanvas.width, memoryCanvas.height);
      
      setGroundImage(memoryCanvas.toDataURL('image/png'));
      setImgTransform({ rotate: 0, flipX: 1, flipY: 1 }); // Reset transforms on new capture
      stopCamera();
    }
  };

  const stopCamera = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }
    setIsCameraLive(false);
  };

  const handlePurge = () => {
    setGroundImage(null);
    setImgTransform({ rotate: 0, flipX: 1, flipY: 1 });
    if (isCameraLive) stopCamera();
  };

  const resetLens = () => {
    setImgTransform({ rotate: 0, flipX: 1, flipY: 1 });
  };

  return (
    <div className="ground-plane-container absolute inset-0 w-full h-full bg-[#111] overflow-hidden flex items-center justify-center">
      
      {/* RASTER / CAMERA LAYER (z-10) */}
      <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden">
        {isCameraLive && !groundImage && (
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        )}
        
        {groundImage && (
          <img 
            src={groundImage} 
            alt="Environment"
            className="w-full h-full object-contain"
            style={{ 
              transform: `rotate(${imgTransform.rotate}deg) scaleX(${imgTransform.flipX}) scaleY(${imgTransform.flipY})`,
              transition: 'transform 0.3s ease-out'
            }} 
          />
        )}
      </div>

      {/* ART PLANE (z-40) */}
      <div className="absolute inset-0 z-40 pointer-events-none">
        {children}
      </div>

      {/* UI CONTROLS (Hide during export) */}
      {!isPitchMode && (
        <>
          {/* TOP LEFT: PURGE & RESET */}
          {(groundImage || isCameraLive) && (
            <div className="absolute top-4 left-4 z-50 flex items-center gap-2 pointer-events-auto">
              <button onClick={handlePurge} className="w-8 h-8 flex items-center justify-center bg-black/80 border border-red-500 text-red-500 font-bold rounded hover:bg-red-900 shadow-[0_0_10px_rgba(255,0,0,0.3)] active:scale-95">✕</button>
              {groundImage && (
                <button onClick={resetLens} className="px-3 h-8 bg-black/80 border border-cyan-500 text-cyan-400 text-xs font-mono rounded hover:bg-cyan-900 shadow-[0_0_10px_rgba(0,255,255,0.3)] active:scale-95">[ RESET LENS ]</button>
              )}
            </div>
          )}

          {/* LEFT MIDDLE: ORIENTATION CONTROLS */}
          {groundImage && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-50 pointer-events-auto">
              <button onClick={() => setImgTransform(p => ({ ...p, rotate: p.rotate - 90 }))} className="w-8 h-8 bg-black/80 border border-gray-500 text-gray-300 rounded text-xs hover:bg-gray-800 shadow-[0_0_10px_rgba(255,255,255,0.1)]">↶</button>
              <button onClick={() => setImgTransform(p => ({ ...p, rotate: p.rotate + 90 }))} className="w-8 h-8 bg-black/80 border border-gray-500 text-gray-300 rounded text-xs hover:bg-gray-800 shadow-[0_0_10px_rgba(255,255,255,0.1)]">↷</button>
              <button onClick={() => setImgTransform(p => ({ ...p, flipX: p.flipX * -1 }))} className="w-8 h-8 bg-black/80 border border-gray-500 text-gray-300 rounded text-xs hover:bg-gray-800 font-bold shadow-[0_0_10px_rgba(255,255,255,0.1)]">↔</button>
              <button onClick={() => setImgTransform(p => ({ ...p, flipY: p.flipY * -1 }))} className="w-8 h-8 bg-black/80 border border-gray-500 text-gray-300 rounded text-xs hover:bg-gray-800 font-bold shadow-[0_0_10px_rgba(255,255,255,0.1)]">↕</button>
            </div>
          )}

          {/* CAPTURE BUTTON */}
          {isCameraLive && (
            <button 
              onPointerDown={captureFrame}
              className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-white text-black font-mono font-bold px-8 py-3 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.8)] active:scale-95 z-50 pointer-events-auto"
            >
              CAPTURE LOCK
            </button>
          )}
        </>
      )}
    </div>
  );
}
