import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import GroundPlane from './components/GroundPlane';
import ArtPlane from './components/ArtPlane';

// VΞILPØINT SANITIZER: Precise Regex Extraction
const extractRegex = (text, regex) => {
  const match = text.match(regex);
  return match ? (match[1] || match[0]) : null;
};

export default function App() {
  const exportRef = useRef(null);
  
  const [isPitchMode, setIsPitchMode] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  
  const [hardwareTrigger, setHardwareTrigger] = useState(0); 
  const [groundImage, setGroundImage] = useState(null);      
  
  // Payload States (Objects containing { id, css, svg })
  const [payloads, setPayloads] = useState([]);
  const [activePayloadIdx, setActivePayloadIdx] = useState(0);

  // --- SMART INGESTION ENGINE ---
  const handleSmartImport = async (event) => {
    const files = Array.from(event.target.files);
    
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        setGroundImage(URL.createObjectURL(file));
      } 
      else if (file.name.endsWith('.srcd')) {
        try {
          const text = await file.text();
          const json = JSON.parse(text);
          let extractedPayloads = [];
          
          // Deep scan SRC-D2 schema for scratchpads
          const scanForCode = (obj, labelPrefix = "FILE") => {
            if (obj && typeof obj === 'object') {
              if (obj.scratchpad) {
                Object.keys(obj.scratchpad).forEach(tab => {
                  const rawString = obj.scratchpad[tab];
                  
                  [span_5](start_span)// Strict Veilpoint extraction[span_5](end_span)
                  const safeCSS = extractRegex(rawString, /<style>([\s\S]*?)<\/style>/i);
                  const safeSVG = extractRegex(rawString, /<svg[\s\S]*?<\/svg>/i);
                  
                  if (safeCSS || safeSVG) {
                    extractedPayloads.push({
                      id: `${labelPrefix}-${tab}`.toUpperCase(),
                      css: safeCSS || '',
                      svg: safeSVG || ''
                    });
                  }
                });
              }
              // Recursively scan attachments
              if (obj.attachments && Array.isArray(obj.attachments)) {
                 obj.attachments.forEach(att => {
                    try {
                      const content = typeof att.content === 'string' ? JSON.parse(att.content) : att.content;
                      scanForCode(content, att.label || "ATTACH");
                    } catch(e) {} // Ignore non-JSON attachments
                 });
              } else if (Array.isArray(obj)) {
                 obj.forEach(item => scanForCode(item, labelPrefix));
              } else {
                 Object.values(obj).forEach(val => scanForCode(val, labelPrefix));
              }
            }
          };
          
          scanForCode(json, file.name.split('_')[0]);

          if (extractedPayloads.length > 0) {
            setPayloads(extractedPayloads);
            setActivePayloadIdx(0);
          } else {
            console.warn("No visual assets found in .srcd payload.");
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
              
              {/* NATIVE RENDER ZONE */}
              {payloads.length > 0 ? (
                <div className="relative w-full h-full flex flex-col pointer-events-none items-center justify-center">
                  
                  [span_6](start_span){/* Injecting CSS and SVG natively[span_6](end_span) */}
                  <style dangerouslySetInnerHTML={{ __html: payloads[activePayloadIdx].css }} />
                  <div 
                    className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full" 
                    dangerouslySetInnerHTML={{ __html: payloads[activePayloadIdx].svg }} 
                  />
                  
                  {/* Thumb Carousel */}
                  {payloads.length > 1 && !isPitchMode && (
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-[#112222]/90 px-4 py-1 border border-cyan-500/50 rounded-full z-50 pointer-events-auto shadow-[0_0_10px_rgba(0,255,204,0.3)]">
                      <button onClick={(e) => { e.stopPropagation(); setActivePayloadIdx(p => (p > 0 ? p - 1 : payloads.length - 1)); }} className="text-cyan-400 hover:text-white font-bold p-2 active:scale-90">{'<'}</button>
                      <span className="text-[10px] text-cyan-400 font-mono whitespace-nowrap tracking-widest">{payloads[activePayloadIdx].id}</span>
                      <button onClick={(e) => { e.stopPropagation(); setActivePayloadIdx(p => (p < payloads.length - 1 ? p + 1 : 0)); }} className="text-cyan-400 hover:text-white font-bold p-2 active:scale-90">{'>'}</button>
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
