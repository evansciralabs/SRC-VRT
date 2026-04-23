import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import GroundPlane from './components/GroundPlane';
import ArtPlane from './components/ArtPlane';

export default function App() {
  const exportRef = useRef(null);
  const [isPitchMode, setIsPitchMode] = useState(false);
  const [isRendering, setIsRendering] = useState(false);

  const executeRenderPipeline = async () => {
    if (!exportRef.current) return;
    
    // 1. INITIATE PITCH MODE (Purge UI)
    setIsRendering(true);
    setIsPitchMode(true);

    // 2. WAIT FOR VIRTUAL DOM TO FLUSH
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      // 3. FLATTEN THE DOM TO CANVAS
      const canvas = await html2canvas(exportRef.current, {
        useCORS: true,           
        backgroundColor: '#000', 
        scale: 2,                // 2x Retina resolution for sharp exports
        logging: false
      });

      // 4. EXTRACT & DOWNLOAD
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `SRC-VRT-RENDER_${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Render Pipeline Failed:", error);
    } finally {
      // 5. RESTORE UI STATE
      setIsPitchMode(false);
      setIsRendering(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-black text-cyan-400 font-mono flex flex-col">
      
      {/* HEADER / EXPORT CONTROLS */}
      <header className="p-4 flex justify-between items-center border-b border-[#112222] bg-[#0a0a0a] z-50">
        <h1 className="tracking-widest font-bold text-sm md:text-base">SRC-VRT // TERMINAL</h1>
        
        <button 
          onClick={executeRenderPipeline}
          disabled={isRendering}
          className={`px-4 py-2 border-2 font-bold tracking-widest transition-all text-xs md:text-sm ${
            isRendering 
              ? 'border-gray-500 text-gray-500 bg-transparent' 
              : 'border-cyan-400 text-black bg-cyan-400 hover:bg-cyan-300 hover:shadow-[0_0_15px_rgba(0,255,204,0.6)] active:scale-95'
          }`}
        >
          {isRendering ? '[ FLATTENING... ]' : '[ EXPORT RENDER ]'}
        </button>
      </header>

      {/* THE CAPTURE ZONE */}
      <main className="flex-grow flex items-center justify-center p-2 md:p-4 overflow-hidden">
        <div 
          ref={exportRef} 
          className="relative w-full max-w-4xl mx-auto rounded-sm overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.8)] border border-gray-800"
        >
          {/* We pass isPitchMode down so the child components know to hide their UI */}
          <GroundPlane isPitchMode={isPitchMode}>
            <ArtPlane isPitchMode={isPitchMode}>
              
              {/* === INJECT YOUR .SRCD PAYLOAD COMPONENT HERE === */}
              {/* <SrcdViewer file={activeFile} /> */}
              
              {/* Placeholder graphic for testing the render engine */}
              <div className="w-full h-full bg-cyan-900/40 text-cyan-400 flex items-center justify-center font-bold text-xl tracking-widest uppercase text-center p-4">
                Awaiting Payload
              </div>

            </ArtPlane>
          </GroundPlane>
        </div>
      </main>
    </div>
  );
}
