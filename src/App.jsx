import React, { useRef, useState, useEffect } from 'react';
import * as htmlToImage from 'html-to-image';
import GroundPlane from './components/GroundPlane';
import ArtPlane from './components/ArtPlane';

// VΞILPØINT SANITIZER
const extractVeilpointPayload = (rawString) => {
  if (!rawString || typeof rawString !== 'string') return null;

  const killWords = [
    'import React', 'export default', '<!DOCTYPE html>', 
    'function App', 'ReactDOM', 'module.exports', 
    'import {', 'export const', '"dependencies":'
  ];
  if (killWords.some(word => rawString.includes(word))) return null;

  if (!rawString.includes('<style') && !rawString.includes('<svg')) return null;

  const cssMatch = rawString.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  let css = cssMatch ? cssMatch.map(m => m.replace(/<\/?style[^>]*>/gi, '')).join('\n') : '';

  css += `\n body, main, div#root, .calibration-grid { background-color: transparent !important; background: transparent !important; border: none !important; outline: none !important; box-shadow: none !important; }`;

  let html = rawString
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') 
    .replace(/ on\w+="[^"]*"/g, '')                                     
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')                     
    .replace(/<!DOCTYPE html>/gi, '')                                   
    .replace(/<\/?html[^>]*>/gi, '')                                    
    .replace(/<\/?head[^>]*>/gi, '')                                    
    .replace(/<\/?body[^>]*>/gi, '');

  if (!css.trim() && !html.includes('<svg')) return null;

  return { css, html: html.trim() };
};

// MASTER THEME CONFIGURATOR
const getThemeStyles = (theme) => {
  if (theme === 'daylight') return {
    appBg: 'bg-[#f4f4f5]',
    panel: 'bg-white/95 border border-blue-400 text-slate-500 shadow-none',
    btnDefault: 'bg-white border border-blue-400 text-blue-500 shadow-none hover:bg-blue-50 transition-colors',
    btnDanger: 'bg-white border border-red-400 text-red-500 shadow-none hover:bg-red-50 transition-colors',
    textMain: 'text-slate-500',
    anchor: 'border-blue-400 bg-white/50 shadow-none',
    anchorActive: 'active:bg-blue-400/30'
  };
  if (theme === 'ghost') return {
    appBg: 'bg-[#050505]',
    panel: 'bg-[#0a0a0a]/95 border border-gray-800 text-gray-600 shadow-none',
    btnDefault: 'bg-transparent border border-gray-700 text-gray-600 shadow-none hover:bg-gray-900 transition-colors',
    btnDanger: 'bg-transparent border border-red-900 text-red-900 shadow-none hover:bg-red-950 transition-colors',
    textMain: 'text-gray-600',
    anchor: 'border-gray-700 bg-transparent shadow-none',
    anchorActive: 'active:bg-gray-800/50'
  };
  // Neon (Default)
  return {
    appBg: 'bg-black',
    panel: 'bg-[#112222]/95 border border-cyan-400 text-cyan-400 shadow-[0_0_15px_rgba(0,255,204,0.5)]',
    btnDefault: 'bg-black/80 border border-cyan-400 text-cyan-400 shadow-[0_0_10px_rgba(0,255,204,0.3)] hover:bg-cyan-900 transition-colors',
    btnDanger: 'bg-black/80 border border-red-500 text-red-500 shadow-[0_0_10px_rgba(255,0,0,0.3)] hover:bg-red-900 transition-colors',
    textMain: 'text-cyan-400',
    anchor: 'border-cyan-400 bg-black/50 shadow-[0_0_10px_rgba(0,255,204,0.5)]',
    anchorActive: 'active:bg-cyan-400/50'
  };
};

export default function App() {
  const exportRef = useRef(null);
  const tapTimer = useRef(null);

  // ARCHITECTURE STATE
  const [isPitchMode, setIsPitchMode] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [hardwareTrigger, setHardwareTrigger] = useState(0); 
  const [groundImage, setGroundImage] = useState(null);      
  
  const [payloads, setPayloads] = useState([]);
  const [activePayloadIdx, setActivePayloadIdx] = useState(0);

  // HUD STATE
  const [isAmbi, setIsAmbi] = useState(false);
  const [theme, setTheme] = useState('neon'); // 'neon', 'ghost', 'daylight'

  const themeCfg = getThemeStyles(theme);

  // TEMPORAL LOGIC: Single vs Double Tap
  const handleVRTTap = (e) => {
    e.stopPropagation();
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      setTheme(prev => prev === 'daylight' ? 'neon' : 'daylight');
    } else {
      tapTimer.current = setTimeout(() => {
        tapTimer.current = null;
        setTheme(prev => prev === 'ghost' ? 'neon' : 'ghost');
      }, 250); 
    }
  };

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
                if (payload) extractedPayloads.push({ id: parentLabel || tabKey.toUpperCase(), ...payload });
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
              if (typeof nextObj === 'object') recursiveSearch(nextObj, nextLabel);
            });
          };
          
          recursiveSearch(json, null);
        } catch (err) {}
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
      const dataUrl = await htmlToImage.toPng(exportRef.current, { quality: 1.0, pixelRatio: 2, backgroundColor: theme === 'daylight' ? '#ffffff' : '#000000', style: { transform: 'none' } });
      const link = document.createElement('a');
      link.download = `SRC-VRT-MATRIX_${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {} finally {
      setIsPitchMode(false);
      setIsRendering(false);
    }
  };

  const clearArtPlane = () => {
    setPayloads([]);
    setActivePayloadIdx(0);
  };

  const hasActivePayload = payloads.length > 0;

  // DYNAMIC BUTTON STYLES FOR PRIMARY TOOLS
  const getToolStyle = (type) => {
    if (theme === 'daylight') return 'bg-white border-blue-400 text-blue-500 shadow-none';
    if (theme === 'ghost') return 'bg-transparent border-gray-700 text-gray-600 shadow-none';
    if (type === 'cam') return 'bg-slate-800 border-green-500 text-green-400 shadow-[0_0_10px_rgba(0,255,0,0.3)]';
    if (type === 'import') return 'bg-slate-800 border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(0,255,255,0.3)]';
    if (type === 'export') return 'bg-slate-800 border-yellow-500 text-yellow-400 shadow-[0_0_10px_rgba(255,215,0,0.3)]';
  };

  return (
    <div className={`w-full h-screen font-mono overflow-hidden relative transition-colors duration-300 ${themeCfg.appBg} ${themeCfg.textMain}`}>
      
      {/* VRT BRANDING (MODE TOGGLE) */}
      <div 
        onClick={handleVRTTap}
        className={`absolute top-4 left-1/2 -translate-x-1/2 text-sm font-bold tracking-[0.3em] cursor-pointer select-none z-[60] transition-colors ${theme === 'daylight' ? 'text-blue-500' : (theme === 'ghost' ? 'text-gray-700' : 'text-cyan-600/50')}`}
      >
        VRT
      </div>

      {/* SRC BRANDING (AMBIDEXTROUS SWAP) */}
      <div 
        onClick={() => setIsAmbi(!isAmbi)}
        className={`absolute top-4 ${isAmbi ? 'left-4' : 'right-4'} text-sm font-bold tracking-[0.3em] cursor-pointer select-none z-[60] transition-colors ${theme === 'daylight' ? 'text-slate-400 hover:text-slate-600' : 'text-gray-600 hover:text-gray-400'}`}
      >
        SRC
      </div>

      {/* TACTICAL Y-AXIS TOOLSET */}
      <div className={`absolute top-1/2 -translate-y-1/2 flex flex-col gap-8 z-[60] pointer-events-auto transition-all duration-300 ${isAmbi ? 'right-4' : 'left-4'}`}>
        <button onClick={() => setHardwareTrigger(prev => prev + 1)} className={`w-12 h-12 rounded-full border flex items-center justify-center text-xl active:scale-90 transition-colors ${getToolStyle('cam')}`}>ᛰ</button>
        <label className={`w-12 h-12 rounded-full border flex items-center justify-center text-xl active:scale-90 cursor-pointer transition-colors ${getToolStyle('import')}`}>
          ⤓<input type="file" multiple accept=".srcd, image/*" onChange={handleSmartImport} className="hidden" />
        </label>
        <button onClick={executeRenderPipeline} disabled={isRendering} className={`w-12 h-12 rounded-full border flex items-center justify-center text-xl active:scale-90 transition-colors ${isRendering ? 'border-gray-500 text-gray-500 bg-transparent' : getToolStyle('export')}`}>
          {isRendering ? '⧖' : '⤒'}
        </button>
      </div>

      <main className="w-full h-full">
        <div ref={exportRef} className={`w-full h-full relative overflow-hidden transition-colors duration-300 ${theme === 'daylight' ? 'bg-[#ffffff]' : 'bg-[#0a0a0a]'}`}>
          
          <GroundPlane isPitchMode={isPitchMode} hardwareTrigger={hardwareTrigger} groundImage={groundImage} setGroundImage={setGroundImage} isAmbi={isAmbi} theme={theme} themeCfg={themeCfg}>
            <ArtPlane isPitchMode={isPitchMode} isActive={hasActivePayload} clearPayload={clearArtPlane} isAmbi={isAmbi} themeCfg={themeCfg}>
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

      {/* ELEVATED THUMB CAROUSEL */}
      {payloads.length > 0 && !isPitchMode && (
        <div className={`absolute bottom-32 left-1/2 -translate-x-1/2 flex items-center gap-4 px-5 py-2 rounded-full z-[70] pointer-events-auto transition-colors duration-300 ${themeCfg.panel}`}>
          <button onClick={() => setActivePayloadIdx(p => (p > 0 ? p - 1 : payloads.length - 1))} className="hover:opacity-70 font-bold px-3 py-1 text-xl active:scale-90">{'<'}</button>
          <span className="text-[11px] font-mono whitespace-nowrap tracking-widest max-w-[150px] overflow-hidden text-ellipsis">{payloads[activePayloadIdx].id}</span>
          <button onClick={() => setActivePayloadIdx(p => (p < payloads.length - 1 ? p + 1 : 0))} className="hover:opacity-70 font-bold px-3 py-1 text-xl active:scale-90">{'>'}</button>
        </div>
      )}
    </div>
  );
}
