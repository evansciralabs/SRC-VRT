import React, { useState, useEffect, useRef } from 'react';

export default function GroundPlane({ children, isPitchMode, hardwareTrigger, groundImage, setGroundImage }) {
  const [isCameraLive, setIsCameraLive] = useState(false);
  const [mediaStream, setMediaStream] = useState(null);
  const [tilt, setTilt] = useState({ beta: 0, gamma: 0 }); 
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (hardwareTrigger > 0) requestHardwareAccess();
  }, [hardwareTrigger]);

  const handleOrientation = (event) => {
    setTilt({ beta: event.beta || 0, gamma: event.gamma || 0 });
  };

  const requestHardwareAccess = async () => {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permissionState = await DeviceOrientationEvent.requestPermission();
        if (permissionState === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation);
        }
      } catch (error) {
        console.error("Gyro error:", error);
      }
    } else {
      window.addEventListener('deviceorientation', handleOrientation);
    }
    startCamera();
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setMediaStream(stream);
      setIsCameraLive(true);
    } catch (err) {
      console.error("Lens init failed:", err);
    }
  };

  useEffect(() => {
    if (isCameraLive && videoRef.current && mediaStream) {
      videoRef.current.srcObject = mediaStream;
    }
  }, [isCameraLive, mediaStream]);

  // STABILIZED CAPTURE LOGIC
  const captureFrame = () => {
    if (videoRef.current && canvasRef.current && videoRef.current.videoWidth > 0) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      setGroundImage(canvas.toDataURL('image/png'));
      stopCamera();
    }
  };

  const stopCamera = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }
    setIsCameraLive(false);
    window.removeEventListener('deviceorientation', handleOrientation);
  };

  // UNIFIED PURGE COMMAND
  const handlePurge = () => {
    setGroundImage(null);
    if (isCameraLive) stopCamera();
  };

  const isLevel = Math.abs(tilt.beta) < 3 && Math.abs(tilt.gamma) < 3;
  const crosshairX = Math.min(Math.max(tilt.gamma * 2, -50), 50);
  const crosshairY = Math.min(Math.max(tilt.beta * 2, -50), 50);

  return (
    <div className="ground-plane-container relative w-full h-full bg-[#111] overflow-hidden flex items-center justify-center">
      
      <div className="absolute inset-0 z-40 pointer-events-none">
        {children}
      </div>

      {isCameraLive && (
        <div className="absolute inset-0 z-20">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          
          {!isPitchMode && (
            <>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-24 h-24 border-2 border-gray-400/50 rounded-full flex items-center justify-center relative">
                  <div 
                    className={`w-6 h-6 rounded-full transition-all duration-75 shadow-[0_0_10px_rgba(0,0,0,0.8)] ${isLevel ? 'bg-green-500 scale-125' : 'bg-red-500'}`}
                    style={{ transform: `translate(${crosshairX}px, ${crosshairY}px)` }}
                  />
                </div>
                <div className={`absolute w-32 h-[1px] ${isLevel ? 'bg-green-400/80' : 'bg-cyan-400/30'}`} />
                <div className={`absolute h-32 w-[1px] ${isLevel ? 'bg-green-400/80' : 'bg-cyan-400/30'}`} />
              </div>

              <button 
                onClick={captureFrame}
                className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-white text-black font-mono font-bold px-8 py-3 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.8)] active:scale-95 transition-transform z-50 pointer-events-auto"
              >
                CAPTURE LOCK
              </button>
            </>
          )}
        </div>
      )}

      {groundImage && (
        <div 
          className="absolute inset-0 origin-center transition-transform duration-75 bg-black z-20 pointer-events-none"
          style={{
            backgroundImage: `url(${groundImage})`,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center'
          }}
        />
      )}

      {/* RE-ALIGNED PURGE BUTTON: Placed next to ArtPlane Reset (left-36) */}
      {!isPitchMode && (groundImage || isCameraLive) && (
        <button 
          onClick={handlePurge}
          className="absolute top-4 left-36 z-50 bg-black/80 border border-red-500 text-red-500 px-3 py-2 text-xs font-mono rounded hover:bg-red-900 transition-colors pointer-events-auto shadow-[0_0_10px_rgba(255,0,0,0.3)] active:scale-95"
        >
          [ PURGE LENS ]
        </button>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
