import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import GroundPlane from './components/GroundPlane';
import ArtPlane from './components/ArtPlane';

export default function App() {
  const exportRef = useRef(null);
  const [isPitchMode, setIsPitchMode] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [activePayload, setActivePayload] = useState(null);

  // --- SRCD INGESTION PIPELINE ---
  const handlePayloadImport = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Generates a local URL for the ingested asset (.srcd visual or image)
      const payloadUrl = URL.createObjectURL(file);
      setActivePayload(payloadUrl);
    }
  };

  // --- RENDERING ENGINE ---
  const executeRenderPipeline = async () => {
    if (!exportRef.current) return;
    
    setIsRendering(true);
    setIsPitchMode(true);

    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      const canvas = await html2canvas(exportRef.current, {
        useCORS: true,           
        backgroundColor: '#000', 
        scale: 2,                
        logging: false
      });

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `SRC-VRT-RENDER_${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Render Pipeline Failed:", error);
    } finally {
      setIsPitchMode(false);
      setIsRendering(false);
    }
  };

  return (
    <div className="w-full h-screen bg-black text-cyan-400 font-mono overflow-hidden relative">
      
      {/* TACTICAL HUD: MINIMAL DASHBOARD CLUSTER */}
      <div className="absolute top-4 right-4 z-[60] flex gap-3 pointer-events-auto">
        
        {/* [ ⭡ ] IMPORT PAYLOAD */}
        <label className="flex items-center justify-center w-12 h-12 bg-[#112222]/90 border border-cyan-400 text-cyan-400 font-bold text-2xl rounded-sm hover:bg-cyan-900 cursor-pointer shadow-[0_0_15px_rgba(0,255,204,0.3)] transition-colors active:scale-95">
          ⭡
          <input 
            type="file" 
            accept=".srcd, image/*" 
            onChange={handlePayloadImport} 
            className="hidden" 
          />
        </label>

        {/* [ ⭣ ] EXPORT RENDER */}
        <button 
          onClick={executeRenderPipeline}
          disabled={isRendering}
          className={`flex items-center justify-center w-12 h-12 border font-bold text-2xl rounded-sm transition-all ${
            isRendering 
              ? 'border-gray-500 text-gray-500 bg-black/50' 
              : 'bg-[#112222]/90 border-cyan-400 text-cyan-400 hover:bg-cyan-900 hover:shadow-[0_0_15px_rgba(0,255,204,0.3)] active:scale-95'
          }`}
        >
          {isRendering ? '⧖' : '⭣'}
        </button>
      </div>

      {/* THE MASTER CAPTURE ZONE */}
      <main className="w-full h-full">
        <div ref={exportRef} className="w-full h-full bg-[#0a0a0a]">
          
          <GroundPlane isPitchMode={isPitchMode}>
            <ArtPlane isPitchMode={isPitchMode}>
              
              {/* PAYLOAD INJECTION ZONE */}
              {activePayload ? (
                <img 
                  src={activePayload} 
                  alt="SRC Payload" 
                  className="w-full h-full object-contain pointer-events-none" 
                />
              ) : (
                <div className="w-full h-full border border-dashed border-cyan-700/50 flex flex-col items-center justify-center text-cyan-700 font-bold tracking-widest text-sm bg-black/40">
                  <span>[ AWAITING ]</span>
                  <span>[ PAYLOAD ]</span>
                </div>
              )}

            </ArtPlane>
          </GroundPlane>

        </div>
      </main>

    </div>
  );
}
