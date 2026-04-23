import React, { useState, useEffect, useRef } from 'react';

export default function GroundPlane({ children }) {
  const [backgroundImage, setBackgroundImage] = useState(null);
  const [isCameraLive, setIsCameraLive] = useState(false);
  const [tilt, setTilt] = useState({ beta: 0, gamma: 0 }); // beta = front/back tilt, gamma = left/right tilt
  const [permissionGranted, setPermissionGranted] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // --- HARDWARE TELEMETRY ---
  const handleOrientation = (event) => {
    setTilt({
      beta: event.beta || 0,
      gamma: event.gamma || 0
    });
  };

  const requestHardwareAccess = async () => {
    // iOS 13+ Gyroscope Permission Gate
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permissionState = await DeviceOrientationEvent.requestPermission();
        if (permissionState === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation);
          setPermissionGranted(true);
        } else {
          console.warn("Gyroscope access denied.");
        }
      } catch (error) {
        console.error("Error requesting device orientation:", error);
      }
    } else {
      // Non-iOS devices
      window.addEventListener('deviceorientation', handleOrientation);
      setPermissionGranted(true);
    }
    
    startCamera();
  };

  // --- OPTICAL SENSOR (WEBRTC) ---
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } // Forces the rear camera
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraLive(true);
      }
    } catch (err) {
      console.error("Camera initialization failed. Ensure HTTPS.", err);
    }
  };

  const captureFrame = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const frameUrl = canvas.toDataURL('image/png');
      setBackgroundImage(frameUrl);
      stopCamera();
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
    }
    setIsCameraLive(false);
    window.removeEventListener('deviceorientation', handleOrientation);
  };

  // --- FALLBACK FILE INGESTION ---
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      setBackgroundImage(imageUrl);
    }
  };

  // --- UI COMPUTATIONS ---
  // A perfectly flat phone has beta and gamma near 0.
  const isLevel = Math.abs(tilt.beta) < 3 && Math.abs(tilt.gamma) < 3;
  
  // Map tilt to CSS translation for the crosshair
  const crosshairX = Math.min(Math.max(tilt.gamma * 2, -50), 50);
  const crosshairY = Math.min(Math.max(tilt.beta * 2, -50), 50);

  return (
    <div className="ground-plane-container relative w-full h-[80vh] bg-[#111] overflow-hidden flex items-center justify-center">
      
      {/* 1. IDLE STATE: INGESTION CONTROLS */}
      {!backgroundImage && !isCameraLive && (
        <div className="absolute z-50 flex flex-col items-center gap-4">
          <button 
            onClick={requestHardwareAccess}
            className="bg-[#112222] border-2 border-cyan-400 text-cyan-400 px-6 py-3 rounded-md font-mono font-bold tracking-widest shadow-[0_0_15px_rgba(0,255,204,0.4)] hover:bg-cyan-900 transition-colors"
          >
            [ INIT LENS & GYRO ]
          </button>
          
          <label className="text-gray-500 border border-gray-700 px-4 py-2 rounded cursor-pointer hover:bg-gray-800 transition-colors font-mono text-xs">
            FALLBACK: UPLOAD RASTER
            <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      )}

      {/* 2. LIVE CAMERA & TELEMETRY UI */}
      {isCameraLive && (
        <div className="absolute inset-0 z-20">
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            className="w-full h-full object-cover"
          />
          
          {/* Leveling Reticle */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/* Outer static ring */}
            <div className="w-24 h-24 border-2 border-gray-400/50 rounded-full flex items-center justify-center relative">
              {/* Inner dynamic bubble mapped to gyroscope */}
              <div 
                className={`w-6 h-6 rounded-full transition-all duration-75 shadow-[0_0_10px_rgba(0,0,0,0.8)] ${isLevel ? 'bg-green-500 scale-125' : 'bg-red-500'}`}
                style={{ transform: `translate(${crosshairX}px, ${crosshairY}px)` }}
              />
            </div>
            {/* Axis Lines */}
            <div className={`absolute w-32 h-[1px] ${isLevel ? 'bg-green-400/80' : 'bg-cyan-400/30'}`} />
            <div className={`absolute h-32 w-[1px] ${isLevel ? 'bg-green-400/80' : 'bg-cyan-400/30'}`} />
          </div>

          {/* Capture Trigger */}
          <button 
            onClick={captureFrame}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white text-black font-mono font-bold px-8 py-3 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.5)] active:scale-95 transition-transform z-30"
          >
            CAPTURE LOCK
          </button>
        </div>
      )}

      {/* 3. CAPTURED STATE: RENDER LOOP */}
            {/* 3. CAPTURED STATE: RENDER LOOP */}
      {backgroundImage && (
        <>
          <div 
            className="absolute inset-0 origin-center transition-transform duration-75"
            style={{
              backgroundImage: `url(${backgroundImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          />
          <button 
            onClick={() => setBackgroundImage(null)}
            className="absolute top-4 right-4 z-50 bg-black/60 border border-red-500 text-red-500 px-3 py-1 text-xs font-mono rounded hover:bg-red-900 transition-colors"
          >
            PURGE LAYER
          </button>
        </>
      )}


      {/* Hidden canvas for extraction */}
      <canvas ref={canvasRef} className="hidden" />

      {/* The payload injection zone */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        {children}
      </div>
    </div>
  );
}
          className="absolute inset-0 origin-center transition-transform duration-75"
          style={{
            backgroundImage: `url(${backgroundImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale}) rotate(${rotation}deg)`
          }}
        />
      )}

      <div className="absolute inset-0 z-10 pointer-events-none">
        {children}
      </div>
    </div>
  );
}
