import React, { useRef, useState } from 'react';
import * as htmlToImage from 'html-to-image';
import GroundPlane from './components/GroundPlane';
import ArtPlane from './components/ArtPlane';

// VΞILPØINT SANITIZER: Strict Structural Gate
const extractVeilpointPayload = (rawString) => {
  if (!rawString || typeof rawString !== 'string') return null;

  // HOSTILE EXCLUSION: Catch extended React/JS source code
  const killWords = [
    'import React', 'export default', '<!DOCTYPE html>', 
    'function App', 'ReactDOM', 'module.exports', 
    'import {', 'export const'
  ];
  if (killWords.some(word => rawString.includes(word))) return null;

  const cssMatch = rawString.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  let css = cssMatch ? cssMatch.map(m => m.replace(/<\/?style[^>]*>/gi, '')).join('\n') : '';

  // OVERRIDE: Force absolute transparency AND strip native borders (fixes the brown border issue)
  css += `\n body, main, div#root, .calibration-grid { background-color: transparent !important; background: transparent !important; border: none !important; outline: none !important; box-shadow: none !important; }`;

  let html = rawString
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') 
    .replace(/ on\w+="[^"]*"/g, '')                                     
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')                     
    .replace(/<!DOCTYPE html>/gi, '')                                   
    .replace(/<\/?html[^>]*>/gi, '')                                    
    .replace(/<\/?head[^>]*>/gi, '')                                    
    .replace(/<\/?body[^>]*>/gi, '');

  // STRICT STRUCTURAL GATE: Must contain actual renderable DOM nodes (filters out raw text notes)
  const hasRenderableNodes = /<(svg|div|main|section|canvas|nav|header|footer)[^>]*>/i.test(html);

  if (!css.trim() && !hasRenderableNodes) return null;

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
          
          const recursiveSearch = (obj, parentLabel = null) => {
            if (!obj || typeof obj !== 'object') return;
            
            if (obj.scratchpad) {
              Object.keys(obj.scratchpad).forEach(tabKey => {
                const payload = extractVeilpointPayload(obj.scratchpad[tabKey]);
                if (payload) {
                  const displayName = parentLabel ? parentLabel : tabKey.toUpperCase();
                  extractedPayloads.push({
                    id: displayName,
                    css: payload.css,
                    html: payload.html
                  });
                }
              });
            }
            
            Object.keys(obj).forEach(key => {
              if (key === 'scratchpad') return; 
              
              let nextObj = obj[key];
              let nextLabel = parentLabel;

              if (obj.attachments && Array.isArray(obj.attachments) && obj.attachments.includes(nextObj)) {
                nextLabel = nextObj.label || nextObj.filename || "ATTACHMENT";
              } else if (nextObj && typeof nextObj === 'object' && nextObj.label) {
                nextLabel = nextObj.label;
              }

              if (typeof nextObj === 'string' && nextObj.trim().startsWith('{')) {
                try { nextObj = JSON.parse(nextObj); } catch(e) {}
              }
              
              if (typeof nextObj === 'object') {
                recursiveSearch(nextObj, nextLabel);
              }
            });
          };
          
          recursiveSearch(json, null);
          
        } catch (err) {
          console.error("Failed to parse .srcd payload:", err);
        }
      }
    }
    
    if (extractedPayloads.length > 0) {
      setPayloads(prev => [...prev, ...extractedPayloads]);
      setActivePayloadIdx(payloads.length); 
    }
    event.target.value = ''; 
  };

  const executeRenderPipeline = async () => {
    if (!exportRef.current) return;
    setIsRendering(true);
    setIsPitchMode(true);
    await new Promise(resolve => setTimeout(resolve, 150)); 

    try {
      const dataUrl = await htmlToImage.toPng(exportRef.current, {
        quality: 1.0,
        pixelRatio: 2,
        backgroundColor: '#000',
        style: { transform: 'none' } 
      });
      
      const link = document.createElement('a');
      link.download = `SRC-VRT-MATRIX_${Date.now()}.png`;
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
                  <div className="[&>svg]:max-w-full [&>svg]:max-h-full w-full h-full flex items-center justify-center" dangerouslySetInnerHTML={{ __html: payloads[activePayloadIdx].html }} />
                </div>
              ) : null}
            </ArtPlane>
          </GroundPlane>

        </div>
      </main>

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
