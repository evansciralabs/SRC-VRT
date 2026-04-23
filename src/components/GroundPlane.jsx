import React, { useState, useEffect, useRef } from 'react';

export default function GroundPlane({ children, isPitchMode, hardwareTrigger, groundImage, setGroundImage, isAmbi, theme, themeCfg }) {
  const [isCameraLive, setIsCameraLive] = useState(false);
  const [mediaStream, setMediaStream] = useState(null);
  const [imgTransform, setImgTransform] = useState({ rotate: 0, flipX: 1, flipY: 1 });
  const videoRef = useRef(null);

  useEffect(() => {
    if (hardwareTrigger > 0) requestHardwareAccess();
  }, [hardwareTrigger]);

  const requestHardwareAccess = async () => startCamera();

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
      setImgTransform({ rotate: 0, flipX: 1, flipY: 1 }); 
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

  return (
    <div className={`ground-plane-container absolute inset-0 w-full h-full overflow-hidden flex items-center justify-center transition-colors duration-300 ${theme === 'daylight' ? 'bg-[#e4e4e7]' : 'bg-[#111]'}`}>
      
      <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden">
        {isCameraLive && !groundImage && (
          <video ref={videoRef} autoPlay playsInline muted crossOrigin="anonymous" className="w-full h-full object-cover" />
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

      <div className="absolute inset-0 z-40 pointer-events-none">
        {children}
      </div>

      {!isPitchMode && (
        <>
          {/* PURGE / RESET: Top 28, swaps via isAmbi */}
          {(groundImage || isCameraLive) && (
            <div className={`absolute top-28 z-50 flex items-center gap-2 pointer-events-auto transition-all duration-300 ${isAmbi ? 'right-4 flex-row-reverse' : 'left-4'}`}>
              <button onClick={handlePurge} className={`w-8 h-8 flex items-center justify-center font-bold rounded active:scale-95 ${themeCfg.btnDanger}`}>✕</button>
              {groundImage && (
                <button onClick={() => setImgTransform({ rotate: 0, flipX: 1, flipY: 1 })} className={`px-3 h-8 text-xs font-mono rounded active:scale-95 ${themeCfg.btnDefault}`}>[ RESET LENS ]</button>
              )}
            </div>
          )}

          {/* ORIENTATION: Center Y, swaps via isAmbi */}
          {groundImage && (
            <div className={`absolute top-1/2 -translate-y-1/2 flex flex-col gap-8 z-50 pointer-events-auto transition-all duration-300 ${isAmbi ? 'left-4' : 'right-4'}`}>
              <button onClick={() => setImgTransform(p => ({ ...p, rotate: p.rotate - 90 }))} className={`w-12 h-12 rounded-full text-xl flex items-center justify-center active:scale-90 ${themeCfg.btnDefault}`}>↶</button>
              <button onClick={() => setImgTransform(p => ({ ...p, rotate: p.rotate + 90 }))} className={`w-12 h-12 rounded-full text-xl flex items-center justify-center active:scale-90 ${themeCfg.btnDefault}`}>↷</button>
              <button onClick={() => setImgTransform(p => ({ ...p, flipX: p.flipX * -1 }))} className={`w-12 h-12 rounded-full text-xl flex items-center justify-center active:scale-90 font-bold ${themeCfg.btnDefault}`}>↔</button>
              <button onClick={() => setImgTransform(p => ({ ...p, flipY: p.flipY * -1 }))} className={`w-12 h-12 rounded-full text-xl flex items-center justify-center active:scale-90 font-bold ${themeCfg.btnDefault}`}>↕</button>
            </div>
          )}

          {isCameraLive && (
            <button onPointerDown={captureFrame} className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-white text-black font-mono font-bold px-8 py-3 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.8)] active:scale-95 z-50 pointer-events-auto">
              CAPTURE LOCK
            </button>
          )}
        </>
      )}
    </div>
  );
}
