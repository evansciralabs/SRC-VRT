import React, { useRef, useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import GroundPlane from './components/GroundPlane';
import ArtPlane from './components/ArtPlane';

// VΞILPØINT SANITIZER: Strips executable script tags before rendering
const sanitizeMarkup = (rawHtml) => {
  if (!rawHtml) return '';
  // Strip <script> blocks and inline onload/onerror handlers
  let clean = rawHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  clean = clean.replace(/ on\w+="[^"]*"/g, '');
  return clean;
};

export default function App() {
  const exportRef = useRef(null);
  
  const [isPitchMode, setIsPitchMode] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  
  const [hardwareTrigger, setHardwareTrigger] = useState(0); 
  const [groundImage, setGroundImage] = useState(null);      
  
  // Code Payload States
  const [payloadMarkup, setPayloadMarkup] = useState([]);
  const [activePayloadIdx, setActivePayloadIdx] = useState(0);

  // --- SMART INGESTION ENGINE ---
  const handleSmartImport = async (event) => {
    const files = Array.from(event.target.files);
    
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        // Route raster images to the GroundPlane
        setGroundImage(URL.createObjectURL(file));
      } 
      else if (file.name.endsWith('.srcd')) {
        // Parse .srcd for HTML/CSS/SVG payloads
        try {
          const text = await file.text();
          const json = JSON.parse(text);
          let extractedCodes = [];
          
          // Deep scan SRC-D2 schema for markup data
          const scanForCode = (obj) => {
            if (obj && typeof obj === 'object') {
              if (obj.main && typeof obj.main === 'string') extractedCodes.push(obj.main);
              if (obj.code && typeof obj.code === 'string') extractedCodes.push(obj.code);
              if (obj.snippet && typeof obj.snippet === 'string') extractedCodes.push(obj.snippet);
              // Grab attachment content if it's not a base64 image
              if (obj.content && typeof obj.content === 'string' && !obj.content.startsWith('data:image')) {
                extractedCodes.push(obj.content);
              }
              Object.values(obj).forEach(scanForCode);
            } else if (Array.isArray(obj)) {
              obj.forEach(scanForCode);
            }
          };
          
          scanForCode(json);
          
          // Filter out empty strings and sanitize
          const cleanCodes = [...new Set(extractedCodes)]
            .filter(code => code.trim().length > 0)
            .map(sanitizeMarkup);

          if (cleanCodes.length > 0) {
            setPayloadMarkup(cleanCodes);
            setActivePayloadIdx(0);
          } else {
            console.warn("No coded design assets found in .srcd payload.");
          }
        } catch (err) {
          console.error("Failed to parse .srcd payload:", err);
        }
      }
    }
    event.target.value = ''; 
  };

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
      
      {/* TACTICAL HUD */}
      <div className="absolute top-4 right-4 z-[60] flex gap-2 pointer-events-auto">
        <button 
          onClick={() => setHardwareTrigger(prev => prev + 1)}
          title="Init Lens & Gyro"
          className="w-10 h-10 rounded-full bg-slate-800 border border-green-500 text-green-400 hover:bg-green-900 hover:text-white shadow-[0_0_10px_rgba(0,255,0,0.3)] flex items-center justify-center text-lg transition-all active:scale-95"
        >ᛰ</button>

        <label 
          title="Import Payload (.srcd / Image)"
          className="w-10 h-10 rounded-full bg-slate-800 border border-cyan-500 text-cyan-400 hover:bg-cyan-900 hover:text-white shadow-[0_0_10px_rgba(0,255,255,0.3)] flex items-center justify-center text-lg transition-all active:scale-95 cursor-pointer"
        >⤓<input type="file" multiple accept=".srcd, image/*" onChange={handleSmartImport} className="hidden" /></label>

        <button 
          onClick={executeRenderPipeline}
          disabled={isRendering}
          title="Export Render"
          className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all active:scale-95 ${
            isRendering ? 'border-gray-500 text-gray-500 bg-black/50' : 'bg-slate-800 border border-yellow-500 text-yellow-400 hover:bg-yellow-900 hover:text-white shadow-[0_0_10px_rgba(255,215,0,0.3)]'
          }`}
        >{isRendering ? '⧖' : '⤒'}</button>
      </div>

      <main className="w-full h-full">
        <div ref={exportRef} className="w-full h-full bg-[#0a0a0a]">
          
          <GroundPlane 
            isPitchMode={isPitchMode} 
            hardwareTrigger={hardwareTrigger}
            groundImage={groundImage}
            setGroundImage={setGroundImage}
          >
            <ArtPlane isPitchMode={isPitchMode}>
              
              {/* VΞILPØINT SECURE RENDER ZONE */}
              {payloadMarkup.length > 0 ? (
                <div className="relative w-full h-full flex flex-col pointer-events-auto">
                  
                  {/* The Sandboxed Iframe */}
                  <iframe 
                    srcDoc={payloadMarkup[activePayloadIdx]}
                    sandbox="" /* Max Security: Blocks all script execution */
                    className="w-full h-full border-none pointer-events-none bg-transparent"
                    title="VRT Payload"
                  />
                  
                  {/* The Thumb Carousel */}
                  {payloadMarkup.length > 1 && !isPitchMode && (
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/90 px-4 py-1 border border-cyan-500/50 rounded-full z-50">
                      <button onClick={(e) => { e.stopPropagation(); setActivePayloadIdx(p => (p > 0 ? p - 1 : payloadMarkup.length - 1)); }} className="text-cyan-400 hover:text-white font-bold">{'<'}</button>
                      <span className="text-xs text-cyan-400 font-mono whitespace-nowrap">{activePayloadIdx + 1} / {payloadMarkup.length}</span>
                      <button onClick={(e) => { e.stopPropagation(); setActivePayloadIdx(p => (p < payloadMarkup.length - 1 ? p + 1 : 0)); }} className="text-cyan-400 hover:text-white font-bold">{'>'}</button>
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
