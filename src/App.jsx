import React, { useRef, useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import GroundPlane from './components/GroundPlane';
import ArtPlane from './components/ArtPlane';

export default function App() {
  const exportRef = useRef(null);
  
  // Pipeline States
  const [isPitchMode, setIsPitchMode] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  
  // Hardware & Layer States
  const [hardwareTrigger, setHardwareTrigger] = useState(0); // Triggers GroundPlane lens
  const [groundImage, setGroundImage] = useState(null);      // Environmental Raster
  
  // Payload States (.srcd Carousel)
  const [payloadImages, setPayloadImages] = useState([]);
  const [activePayloadIdx, setActivePayloadIdx] = useState(0);

  // --- SMART INGESTION ENGINE ---
  const handleSmartImport = async (event) => {
    const files = Array.from(event.target.files);
    
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        // Route images to the GroundPlane
        setGroundImage(URL.createObjectURL(file));
      } 
      else if (file.name.endsWith('.srcd')) {
        // Parse .srcd and extract graphic assets for the ArtPlane
        try {
          const text = await file.text();
          const json = JSON.parse(text);
          
          let extractedImages = [];
          
          // Deep scan SRC-D2 schema for attachments
          const scanForImages = (obj) => {
            if (obj && typeof obj === 'object') {
              if (obj.mimeType && obj.mimeType.startsWith('image/') && obj.content) {
                extractedImages.push(obj.content);
              }
              Object.values(obj).forEach(scanForImages);
            } else if (Array.isArray(obj)) {
                obj.forEach(scanForImages);
            }
          };
          
          scanForImages(json);
          
          if (extractedImages.length > 0) {
            setPayloadImages(extractedImages);
            setActivePayloadIdx(0);
          } else {
            console.warn("No visual assets found in .srcd payload.");
          }
        } catch (err) {
          console.error("Failed to parse .srcd payload:", err);
        }
      }
    }
    event.target.value = ''; // Reset input
  };

  // --- RENDERING ENGINE ---
  const executeRenderPipeline = async () => {
    if (!exportRef.current) return;
    setIsRendering(true);
    setIsPitchMode(true);

    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      const canvas = await html2canvas(exportRef.current, {
        useCORS: true, backgroundColor: '#000', scale: 2, logging: false
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `SRC-VRT_${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Render Failed:", error);
    } finally {
      setIsPitchMode(false);
      setIsRendering(false);
    }
  };

  return (
    <div className="w-full h-screen bg-black text-cyan-400 font-mono overflow-hidden relative">
      
      {/* TACTICAL HUD: SRC-D2 GLYPHS */}
      <div className="absolute top-4 right-4 z-[60] flex gap-2 pointer-events-auto">
        
        {/* [ ᛰ ] INIT HARDWARE */}
        <button 
          onClick={() => setHardwareTrigger(prev => prev + 1)}
          title="Init Lens & Gyro"
          className="w-10 h-10 rounded-full bg-slate-800 border border-green-500 text-green-400 hover:bg-green-900 hover:text-white shadow-[0_0_10px_rgba(0,255,0,0.3)] flex items-center justify-center text-lg transition-all active:scale-95"
        >
          ᛰ
        </button>

        {/* [ ⤓ ] SMART IMPORT */}
        <label 
          title="Import Payload (.srcd / Image)"
          className="w-10 h-10 rounded-full bg-slate-800 border border-cyan-500 text-cyan-400 hover:bg-cyan-900 hover:text-white shadow-[0_0_10px_rgba(0,255,255,0.3)] flex items-center justify-center text-lg transition-all active:scale-95 cursor-pointer"
        >
          ⤓
          <input type="file" multiple accept=".srcd, image/*" onChange={handleSmartImport} className="hidden" />
        </label>

        {/* [ ⤒ ] EXPORT RENDER */}
        <button 
          onClick={executeRenderPipeline}
          disabled={isRendering}
          title="Export Render"
          className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all active:scale-95 ${
            isRendering 
              ? 'border-gray-500 text-gray-500 bg-black/50' 
              : 'bg-slate-800 border border-yellow-500 text-yellow-400 hover:bg-yellow-900 hover:text-white shadow-[0_0_10px_rgba(255,215,0,0.3)]'
          }`}
        >
          {isRendering ? '⧖' : '⤒'}
        </button>
      </div>

      {/* MASTER CAPTURE ZONE */}
      <main className="w-full h-full">
        <div ref={exportRef} className="w-full h-full bg-[#0a0a0a]">
          
          <GroundPlane 
            isPitchMode={isPitchMode} 
            hardwareTrigger={hardwareTrigger}
            groundImage={groundImage}
            setGroundImage={setGroundImage}
          >
            <ArtPlane isPitchMode={isPitchMode}>
              
              {/* .SRCD CAROUSEL INJECTION */}
              {payloadImages.length > 0 ? (
                <div className="relative w-full h-full flex items-center justify-center group pointer-events-auto">
                  <img 
                    src={payloadImages[activePayloadIdx]} 
                    alt="SRC Payload" 
                    className="max-w-full max-h-full object-contain pointer-events-none" 
                  />
                  
                  {/* Carousel Controls */}
                  {payloadImages.length > 1 && !isPitchMode && (
                    <div className="absolute bottom-2 flex gap-4 bg-black/80 px-4 py-1 border border-cyan-500/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); setActivePayloadIdx(p => (p > 0 ? p - 1 : payloadImages.length - 1)); }} className="text-cyan-400 hover:text-white">{'<'}</button>
                      <span className="text-xs text-gray-400 font-mono">{activePayloadIdx + 1} / {payloadImages.length}</span>
                      <button onClick={(e) => { e.stopPropagation(); setActivePayloadIdx(p => (p < payloadImages.length - 1 ? p + 1 : 0)); }} className="text-cyan-400 hover:text-white">{'>'}</button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center opacity-0"></div>
              )}

            </ArtPlane>
          </GroundPlane>
        </div>
      </main>
    </div>
  );
}
