import React, { useState, useEffect, useRef } from 'react';

export default function GroundPlane({ children, isPitchMode, hardwareTrigger, groundImage, setGroundImage, isAmbi, theme, themeCfg }) {
  const [isCameraLive, setIsCameraLive] = useState(false);
  const [mediaStream, setMediaStream] = useState(null);
  const [imgTransform, setImgTransform] = useState({ rotate: 0, flipX: 1, flipY: 1 });
  const videoRef = useRef(null);

  const [tilt, setTilt] = useState({ beta: 0, gamma: 0 });
  const [hasGyroPermission, setHasGyroPermission] = useState(false);

  useEffect(() => {
    if (hardwareTrigger > 0) requestHardwareAccess();
  }, [hardwareTrigger]);

  const requestHardwareAccess = async () => {
    setGroundImage(null);
    setImgTransform({ rotate: 0, flipX: 1, flipY: 1 });

    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm === 'granted') setHasGyroPermission(true);
      } catch (err) { console.error("Gyro perm failed", err); }
    } else {
      setHasGyroPermission(true); 
    }
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

  useEffect(() => {
    if (isCameraLive && hasGyroPermission) {
      const handleOrientation = (e) => setTilt({ beta: e.beta || 0, gamma: e.gamma || 0 });
      window.addEventListener('deviceorientation', handleOrientation);
      return () => window.removeEventListener('deviceorientation', handleOrientation);
    }
  }, [isCameraLive, hasGyroPermission]);

  const isLevel = Math.abs(tilt.beta) < 2 && Math.abs(tilt.gamma) < 2;

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
          <>
            <video ref={videoRef} autoPlay playsInline muted crossOrigin="anonymous" className="w-full h-full object-cover" />
            
            {hasGyroPermission && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                <div style={{
                  width: '80px', height: '80px', borderRadius: '50%',
                  border: `4px solid ${isLevel ? '#22c55e' : '#ef4444'}`,
                  transform: `translate(${tilt.gamma * 3}px, ${tilt.beta * 3}px)`,
                  transition: 'transform 0.1s ease-out, border-color 0.2s',
                  boxShadow: isLevel ? '0 0 15px #22c55e' : 'none'
                }} />
                <div className="absolute w-2 h-2 bg-white rounded-full" />
                <div className="absolute top-32 text-white/70 font-mono text-xs text-center font-bold tracking-widest drop-shadow-md">
                  <p>PITCH: {tilt.beta.toFixed(1)}°</p>
                  <p>ROLL: {tilt.gamma.toFixed(1)}°</p>
                </div>
              </div>
            )}
          </>
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
          {(groundImage || isCameraLive) && (
            <div className={`absolute top-28 z-50 flex items-center gap-2 pointer-events-auto transition-all duration-300 ${isAmbi ? 'right-4 flex-row-reverse' : 'left-4'}`}>
              <button onClick={handlePurge} className={`w-8 h-8 flex items-center justify-center font-bold rounded active:scale-95 ${themeCfg.btnDanger}`}>✕</button>
              {groundImage && (
                <button onClick={() => setImgTransform({ rotate: 0, flipX: 1, flipY: 1 })} className={`px-3 h-8 text-xs font-mono rounded active:scale-95 ${themeCfg.btnDefault}`}>[ RESET LENS ]</button>
              )}
            </div>
          )}

          {groundImage && (
            <div className={`absolute top-1/2 -translate-y-1/2 flex flex-col gap-8 z-50 pointer-events-auto transition-all duration-300 ${isAmbi ? 'left-4' : 'right-4'}`}>
              <button onClick={() => setImgTransform(p => ({ ...p, rotate: p.rotate - 90 }))} className={`w-12 h-12 rounded-full text-xl flex items-center justify-center active:scale-90 ${themeCfg.btnDefault}`}>↶</button>
              <button onClick={() => setImgTransform(p => ({ ...p, rotate: p.rotate + 90 }))} className={`w-12 h-12 rounded-full text-xl flex items-center justify-center active:scale-90 ${themeCfg.btnDefault}`}>↷</button>
              <button onClick={() => setImgTransform(p => ({ ...p, flipX: p.flipX * -1 }))} className={`w-12 h-12 rounded-full text-xl flex items-center justify-center active:scale-90 font-bold ${themeCfg.btnDefault}`}>↔</button>
              <button onClick={() => setImgTransform(p => ({ ...p, flipY: p.flipY * -1 }))} className={`w-12 h-12 rounded-full text-xl flex items-center justify-center active:scale-90 font-bold ${themeCfg.btnDefault}`}>↕</button>
            </div>
          )}

          {isCameraLive && (
            <button 
              onPointerDown={(isLevel || !hasGyroPermission) ? captureFrame : null} 
              className={`absolute bottom-12 left-1/2 -translate-x-1/2 font-mono font-bold px-8 py-3 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.8)] z-50 pointer-events-auto transition-all duration-300 ${
                (isLevel || !hasGyroPermission) 
                  ? 'bg-white text-black active:scale-95' 
                  : 'bg-red-900/80 text-red-300 border border-red-500 scale-95'
              }`}
            >
              {(!hasGyroPermission || isLevel) ? 'CAPTURE LOCK' : 'LEVEL DEVICE'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
