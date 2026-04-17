import React, { useState } from 'react';

export default function GroundPlane({ children }) {
  const [backgroundImage, setBackgroundImage] = useState(null);
  
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      setBackgroundImage(imageUrl);
    }
  };

  return (
    <div className="ground-plane-container relative w-full h-[80vh] bg-[#2a2a2a] overflow-hidden">
      {!backgroundImage && (
        <div className="absolute top-4 left-4 z-50">
          <label className="bg-black/80 border border-gray-600 text-cyan-400 px-5 py-3 rounded-md cursor-pointer font-mono font-bold tracking-widest shadow-lg hover:bg-[#112222] transition-colors">
            [ INITIALIZE_CAMERA ]
            <input 
              type="file" 
              accept="image/*" 
              capture="environment" 
              onChange={handleImageUpload} 
              className="hidden" 
            />
          </label>
        </div>
      )}

      {backgroundImage && (
        <div 
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
