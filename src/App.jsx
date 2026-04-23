import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import GroundPlane from './components/GroundPlane';
import ArtPlane from './components/ArtPlane';

// VΞILPØINT SANITIZER: Preserves visual code, strips malicious scripts
const extractVeilpointPayload = (rawString) => {
  if (!rawString || typeof rawString !== 'string') return null;

  const cssMatch = rawString.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const css = cssMatch ? cssMatch[1] : '';

  let html = rawString.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  html = html.replace(/ on\w+="[^"]*"/g, ''); 
  html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ''); 

  // If it has no CSS and no SVG/classes, it's likely raw source code. Drop it.
  if (!css.trim() && !html.includes('<svg') && !html.includes('class=')) return null;

  return { css, html: html.trim() };
};

export default function App() {
  const exportRef = useRef(null);
  const [isPitchMode, setIsPitchMode] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [hardwareTrigger, setHardwareTrigger] = useState(0); 
  const [groundImage, setGroundImage] = useState(null);      
  
  const [payloads, setPayloads] = useState([]);
  const [activePayloadIdx, setActivePayloadIdx] = useState(0);

  // OMNI-PARSER: Hunts through any .srcd structure
  const handleSmartImport = async (event) => {
    const files = Array.from(event.target.files);
    let extractedPayloads = [];
    
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        setGroundImage(URL.createObjectURL(file));
      } 
      else if (file.name.endsWith('.srcd')) {
        try {
          const text = await file.text();
          const json = JSON.parse(text);
          
          const recursiveSearch = (obj, pathLabel = "DESIGN") => {
            if (!obj || typeof obj !== 'object') return;
            
            // If we hit a scratchpad, extract its tabs
            if (obj.scratchpad) {
              Object.keys(obj.scratchpad).forEach(tabKey => {
                const payload = extractVeilpointPayload(obj.scratchpad[tabKey]);
                if (payload) {
                  extractedPayloads.push({
                    id: `${pathLabel} [${tabKey}]`.toUpperCase(),
                    css: payload.css,
                    html: payload.html
                  });
                }
              });
            }
            
            // Dig deeper
            Object.keys(obj).forEach(key => {
              if (key === 'scratchpad') return; // already handled
              let nextObj = obj[key];
              // Handle stringified attachments common in SRC-D2
              if (typeof nextObj === 'string' && nextObj.trim().startsWith('{')) {
                try { nextObj = JSON.parse(nextObj); } catch(e) {}
              }
              if (typeof nextObj === 'object') {
                recursiveSearch(nextObj, obj.label || obj.title || pathLabel);
              }
            });
          };
          
          recursiveSearch(json);
        } catch (err) {
          console.error("Failed to parse .srcd payload:", err);
        }
      }
    }
    
    if (extractedPayloads.length > 0) {
      setPayloads(prev => [...prev, ...extractedPayloads]);
      setActivePayloadIdx(payloads.length); // Jump to first new item
    }
    event.target.value = ''; 
  };

  const executeRenderPipeline = async () => {
    if (!exportRef.current) return;
    setIsRendering(true);
    setIsPitchMode(true);
    await new Promise(resolve => setTimeout(resolve, 100)); // Give DOM time to flush UI

    try {
      const canvas = await html2canvas(exportRef.current, {
        useCORS: true, 
        backgroundColor: '#000', 
        scale: 2, 
        logging: false,
        allowTaint: true
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

  const clearArtPlane = () => {
    setPayloads([]);
    setActivePayloadIdx(0);
  };

  const hasActivePayload = payloads.length > 0;

  return (
    <div className="w-full h-screen bg-black text-cyan-400 font-mono overflow-hidden relative">
      
      {/* TACTICAL HUD */}
      <div className="absolute top-4 right-4 z-[60] flex gap-2 pointer-events-auto">
        <button onClick={() => setHardwareTrigger(prev => prev + 1)} className="w-10 h-10 rounded-full bg-slate-800 border border-green-500 text-green-400 flex items-center justify-center text-lg active:scale-95 shadow-[0_0_10px_rgba(0,255,0,0.3)]">ᛰ</button>
        <label className="w-10 h-10 rounded-full bg-slate-800 border border-cyan-500 text-cyan-400 flex items-center justify-center text-lg active:scale-95 cursor-pointer shadow-[0_0_10px_rgba(0,255,255,0.3)]">
          ⤓<input type="file" multiple accept=".srcd, image/*" onChange={handleSmartImport} className="hidden" />
        </label>
        <button onClick={executeRenderPipeline} disabled={isRendering} className={`w-10 h-10 rounded-full flex items-center justify-center text-lg active:scale-95 ${isRendering ? 'border-gray-500 text-gray-500 bg-black/50' : 'bg-slate-800 border border-yellow-500 text-yellow-400 shadow-[0_0_10px_rgba(255,215,0,0.3)]'}`}>
          {isRendering ? '⧖' : '⤒'}
        </button>
      </div>

      <main className="w-full h-full">
        <div ref={exportRef} className="w-full h-full bg-[#0a0a0a] relative overflow-hidden">
          
          <GroundPlane isPitchMode={isPitchMode} hardwareTrigger={hardwareTrigger} groundImage={groundImage} setGroundImage={setGroundImage}>
            <ArtPlane isPitchMode={isPitchMode} isActive={hasActivePayload} clearPayload={clearArtPlane}>
              {hasActivePayload ? (
                <div className="w-full h-full flex items-center justify-center pointer-events-none">
                  <style dangerouslySetInnerHTML={{ __html: payloads[activePayloadIdx].css }} />
                  <div className="[&>svg]:max-w-full [&>svg]:max-h-full" dangerouslySetInnerHTML={{ __html: payloads[activePayloadIdx].html }} />
                </div>
              ) : null}
            </ArtPlane>
          </GroundPlane>

        </div>
      </main>

      {/* ELEVATED THUMB CAROUSEL (bottom-32) */}
      {payloads.length > 0 && !isPitchMode && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-[#112222]/95 px-5 py-2 border border-cyan-400 rounded-full z-[70] pointer-events-auto shadow-[0_0_15px_rgba(0,255,204,0.5)]">
          <button onClick={() => setActivePayloadIdx(p => (p > 0 ? p - 1 : payloads.length - 1))} className="text-cyan-400 hover:text-white font-bold px-3 py-1 text-xl active:scale-90">{'<'}</button>
          <span className="text-[11px] text-cyan-400 font-mono whitespace-nowrap tracking-widest max-w-[150px] overflow-hidden text-ellipsis">{payloads[activePayloadIdx].id}</span>
          <button onClick={() => setActivePayloadIdx(p => (p < payloads.length - 1 ? p + 1 : 0))} className="text-cyan-400 hover:text-white font-bold px-3 py-1 text-xl active:scale-90">{'>'}</button>
        </div>
      )}
    </div>
  );
}
