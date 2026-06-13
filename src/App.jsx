import React, { useRef, useState, useEffect } from 'react';
import * as htmlToImage from 'html-to-image';
import GroundPlane from './components/GroundPlane';
import ArtPlane from './components/ArtPlane';

// VΞILPØINT SANITIZER — unchanged from V1
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

// MASTER THEME CONFIGURATOR — unchanged from V1
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

  // ARCHITECTURE STATE — V1 core, unchanged
  const [isPitchMode, setIsPitchMode] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [hardwareTrigger, setHardwareTrigger] = useState(0); 
  const [groundImage, setGroundImage] = useState(null);      
  
  const [payloads, setPayloads] = useState([]);
  const [activePayloadIdx, setActivePayloadIdx] = useState(0);

  // ── STAMP ARCHITECTURE ────────────────────────────────────────────────────
  const [stampedLayers, setStampedLayers] = useState([]);
  const [isLocked, setIsLocked] = useState(false);
  const [stampTrigger, setStampTrigger] = useState(0);
  const [lockTrigger, setLockTrigger] = useState(0);
  const holdTimer = useRef(null);
  const activeCornersRef = useRef(null);  // updated by ArtPlane via onCornersChange
  const activeScaleRef = useRef(1);        // updated by ArtPlane via onScaleChange

  const executeStampLayer = (matrix, scale, corners, isLocking = false) => {
    if (payloads.length === 0) return;
    const p = payloads[activePayloadIdx];
    setStampedLayers(prev => [...prev, {
      id: `${p.id}-${Date.now()}`,
      css: p.css,
      html: p.html,
      matrix,
      scale,
      corners,
    }]);
    // Only auto-advance when stamping mid-composition, not when finalizing
    if (!isLocking && payloads.length > 1) {
      setActivePayloadIdx(i => (i < payloads.length - 1 ? i + 1 : 0));
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  // ── EXPORT MODAL STATE ────────────────────────────────────────────────────
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPrefix, setExportPrefix] = useState('VRT-MATRIX');
  const [exportGridlines, setExportGridlines] = useState(false);
  // ─────────────────────────────────────────────────────────────────────────

  // HUD STATE — unchanged from V1
  const [isAmbi, setIsAmbi] = useState(false);
  const [theme, setTheme] = useState('neon');

  const themeCfg = getThemeStyles(theme);

  // TEMPORAL LOGIC — unchanged from V1
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

  // SMART IMPORT — unchanged from V1
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
        } catch (err) {
          console.error(`[SRC-VRT] Failed to parse ${file.name}:`, err);
          const errPayload = { id: `ERR: ${file.name}`, css: '', html: '' };
          setPayloads(prev => [...prev, errPayload]);
          setActivePayloadIdx(prev => prev);
          setTimeout(() => setPayloads(prev => prev.filter(p => p.id !== errPayload.id)), 2000);
        }
      }
    }
    
    if (extractedPayloads.length > 0) {
      const newStartIdx = payloads.length;
      setPayloads(prev => [...prev, ...extractedPayloads]);
      setActivePayloadIdx(newStartIdx);
    }
    event.target.value = ''; 
  };

  // ── RENDER PIPELINE ───────────────────────────────────────────────────────
  const executeRenderPipeline = async (prefix, includeGridlines) => {
    setShowExportModal(false);
    setIsRendering(true);
    setIsPitchMode(true);
    await new Promise(resolve => setTimeout(resolve, 150));

    try {
      // Get the bounding rect of the export container so we know its exact
      // top-left offset relative to the viewport — this is what shifts elements.
      const rect = exportRef.current.getBoundingClientRect();

      const dataUrl = await htmlToImage.toPng(exportRef.current, {
        quality: 1.0,
        pixelRatio: 2,
        backgroundColor: theme === 'daylight' ? '#ffffff' : '#000000',
        // Force the capture dimensions to the full viewport
        width: window.innerWidth,
        height: window.innerHeight,
        // Offset the internal coordinate system so screen-position 0,0
        // aligns with the viewport top-left, not the element's top-left
        style: {
          transform: 'none',
          transformOrigin: 'top left',
          width: `${window.innerWidth}px`,
          height: `${window.innerHeight}px`,
          overflow: 'visible',
          position: 'fixed',
          top: '0',
          left: '0',
        },
      });
      const link = document.createElement('a');
      const shortHash = Math.random().toString(36).substring(2, 6).toUpperCase();
      link.download = `${prefix || 'VRT-MATRIX'}_${shortHash}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Pipeline failure:', error);
    } finally {
      setIsPitchMode(false);
      setIsRendering(false);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  const clearArtPlane = () => {
    setPayloads([]);
    setActivePayloadIdx(0);
    setStampedLayers([]);
  };

  const hasActivePayload = payloads.length > 0;

  // DYNAMIC BUTTON STYLES — unchanged from V1
  const getToolStyle = (type) => {
    if (theme === 'daylight') return 'bg-white border-blue-400 text-blue-500 shadow-none';
    if (theme === 'ghost') return 'bg-transparent border-gray-700 text-gray-600 shadow-none';
    if (type === 'cam') return 'bg-slate-800 border-green-500 text-green-400 shadow-[0_0_10px_rgba(0,255,0,0.3)]';
    if (type === 'import') return 'bg-slate-800 border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(0,255,255,0.3)]';
    if (type === 'export') return 'bg-slate-800 border-yellow-500 text-yellow-400 shadow-[0_0_10px_rgba(255,215,0,0.3)]';
  };

  const isNeon = theme === 'neon';
  const isDaylight = theme === 'daylight';

  return (
    <div className={`w-full h-screen font-mono overflow-visible relative transition-colors duration-300 ${themeCfg.appBg} ${themeCfg.textMain}`}>
      
      {/* VRT BRANDING — unchanged from V1 */}
      <div 
        onClick={handleVRTTap}
        className={`absolute top-4 left-1/2 -translate-x-1/2 text-sm font-bold tracking-[0.3em] cursor-pointer select-none z-[60] transition-colors ${theme === 'daylight' ? 'text-blue-500' : (theme === 'ghost' ? 'text-gray-700' : 'text-cyan-600/50')}`}
      >
        VRT
      </div>

      {/* SRC BRANDING — unchanged from V1 */}
      <div 
        onClick={() => setIsAmbi(!isAmbi)}
        className={`absolute top-4 ${isAmbi ? 'left-4' : 'right-4'} text-sm font-bold tracking-[0.3em] cursor-pointer select-none z-[60] transition-colors ${theme === 'daylight' ? 'text-slate-400 hover:text-slate-600' : 'text-gray-600 hover:text-gray-400'}`}
      >
        SRC
      </div>

      {/* TACTICAL Y-AXIS TOOLSET — lock button added above cam, same gap-8 rhythm */}
      <div className={`absolute top-1/2 -translate-y-1/2 flex flex-col gap-8 z-[60] pointer-events-auto transition-all duration-300 ${isAmbi ? 'right-4' : 'left-4'}`}>
        {/* Lock: tap=stamp (only when unlocked), hold=stamp final layer then lock preview */}
        {hasActivePayload && (
          <button
            onPointerDown={() => {
              holdTimer.current = setTimeout(() => {
                holdTimer.current = null;
                if (!isLocked) {
                  // Bake final position without auto-advancing, then lock.
                  // Payloads are cleared so the active layer stops rendering
                  // on top of the newly stamped copy.
                  setLockTrigger(t => t + 1);
                  setTimeout(() => {
                    setIsLocked(true);
                    setPayloads([]);
                    setActivePayloadIdx(0);
                  }, 50);
                } else {
                  // Already locked — hold again to unlock and resume editing
                  setIsLocked(false);
                }
              }, 500);
            }}
            onPointerUp={() => {
              if (holdTimer.current) {
                clearTimeout(holdTimer.current);
                holdTimer.current = null;
                // Tap only stamps when not in locked preview mode
                if (!isLocked) {
                  setStampTrigger(t => t + 1);
                }
              }
            }}
            onPointerLeave={() => {
              if (holdTimer.current) {
                clearTimeout(holdTimer.current);
                holdTimer.current = null;
              }
            }}
            className={`w-12 h-12 rounded-full border flex items-center justify-center text-xl font-bold transition-colors duration-300 ${isLocked ? themeCfg.btnDanger : themeCfg.btnDefault}`}
          >
            {isLocked ? '⬣' : '⎔'}
          </button>
        )}
        <button onClick={() => setHardwareTrigger(prev => prev + 1)} className={`w-12 h-12 rounded-full border flex items-center justify-center text-xl active:scale-90 transition-colors ${getToolStyle('cam')}`}>ᛰ</button>
        <label className={`w-12 h-12 rounded-full border flex items-center justify-center text-xl active:scale-90 cursor-pointer transition-colors ${getToolStyle('import')}`}>
          ⤓<input type="file" multiple accept=".srcd, image/*" onChange={handleSmartImport} className="hidden" />
        </label>
        <button
          onClick={() => !isRendering && setShowExportModal(true)}
          disabled={isRendering}
          className={`w-12 h-12 rounded-full border flex items-center justify-center text-xl active:scale-90 transition-colors ${isRendering ? 'border-gray-500 text-gray-500 bg-transparent' : getToolStyle('export')}`}
        >
          {isRendering ? '⧖' : '⤒'}
        </button>
      </div>

      <main className="w-full h-full">
        <div ref={exportRef} className={`w-full h-full relative overflow-visible transition-colors duration-300 ${theme === 'daylight' ? 'bg-[#ffffff]' : 'bg-[#0a0a0a]'}`}>
          
          <GroundPlane isPitchMode={isPitchMode} hardwareTrigger={hardwareTrigger} groundImage={groundImage} setGroundImage={setGroundImage} isAmbi={isAmbi} theme={theme} themeCfg={themeCfg}>

            {/* ── STAMPED BACKGROUND LAYERS ───────────────────────────────── */}
            {/* Fully inert — pointer-events none, locked in place */}
            <div className="absolute inset-0 z-30 pointer-events-none">
              {stampedLayers.map(layer => (
                <div
                  key={layer.id}
                  className="absolute top-0 left-0 origin-top-left flex items-center justify-center overflow-visible"
                  style={{ transform: layer.matrix, width: '240px', height: '240px' }}
                >
                  <div style={{ transform: `scale(${layer.scale})`, transformOrigin: 'center center', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <style dangerouslySetInnerHTML={{ __html: layer.css }} />
                    <div className="[&>svg]:max-w-full [&>svg]:max-h-full w-full h-full flex items-center justify-center" dangerouslySetInnerHTML={{ __html: layer.html }} />
                  </div>
                </div>
              ))}
            </div>
            {/* ────────────────────────────────────────────────────────────── */}

            <ArtPlane 
              isPitchMode={isPitchMode} 
              isActive={hasActivePayload} 
              clearPayload={clearArtPlane} 
              isAmbi={isAmbi} 
              themeCfg={themeCfg}
              onCyclePrev={payloads.length > 1 ? () => setActivePayloadIdx(p => (p > 0 ? p - 1 : payloads.length - 1)) : undefined}
              onCycleNext={payloads.length > 1 ? () => setActivePayloadIdx(p => (p < payloads.length - 1 ? p + 1 : 0)) : undefined}
              onStamp={hasActivePayload ? executeStampLayer : undefined}
              stampedCount={stampedLayers.length}
              isLocked={isLocked}
              stampTrigger={stampTrigger}
              lockTrigger={lockTrigger}
              onCornersChange={(c) => { activeCornersRef.current = c; }}
              onScaleChange={(s) => { activeScaleRef.current = s; }}
            >
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

      {/* ACTIVE PAYLOAD READOUT — unchanged from V1, stamped count appended */}
      {payloads.length > 0 && !isPitchMode && (
        <div className="absolute bottom-40 left-1/2 -translate-x-1/2 z-[70] pointer-events-none text-center w-full max-w-[280px]">
          <span className={`px-4 py-1 text-[10px] font-mono font-bold tracking-widest border-b rounded-full shadow-lg ${isDaylight ? 'text-slate-500 border-slate-300 bg-white/50' : 'text-cyan-400 border-cyan-500/30 bg-black/50 backdrop-blur-sm'}`}>
            NODE: {payloads[activePayloadIdx].id}
            {stampedLayers.length > 0 && (
              <span className="ml-2 opacity-60">// {stampedLayers.length}⬡</span>
            )}
          </span>
        </div>
      )}

      {/* ── EXPORT MODAL ─────────────────────────────────────────────────── */}
      {showExportModal && (
        <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
          <div className={`rounded-xl px-6 py-5 font-mono flex flex-col gap-4 min-w-[240px] ${themeCfg.panel}`}>
            
            <div className="text-[10px] tracking-[0.25em] font-bold opacity-60">EXPORT // CONFIGURE</div>

            {/* Prefix input */}
            <div className="flex flex-col gap-1">
              <label className="text-[9px] tracking-widest opacity-50">PROJECT PREFIX</label>
              <input
                autoFocus
                type="text"
                value={exportPrefix}
                onChange={e => setExportPrefix(e.target.value.toUpperCase().replace(/\s/g, '-'))}
                onKeyDown={e => e.key === 'Enter' && executeRenderPipeline(exportPrefix, exportGridlines)}
                maxLength={24}
                className={`bg-transparent border-b outline-none font-mono text-sm font-bold tracking-widest pb-0.5 ${
                  isDaylight ? 'border-blue-300 text-slate-700'
                  : isNeon ? 'border-cyan-700 text-cyan-300'
                  : 'border-gray-700 text-gray-400'
                }`}
              />
            </div>

            {/* Gridlines checkbox */}
            <div
              className="flex items-center gap-3 cursor-pointer select-none"
              onClick={() => setExportGridlines(g => !g)}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                exportGridlines
                  ? (isNeon ? 'bg-cyan-500 border-cyan-400' : isDaylight ? 'bg-blue-500 border-blue-400' : 'bg-gray-600 border-gray-500')
                  : 'border-current bg-transparent'
              }`}>
                {exportGridlines && <div className="w-2 h-2 bg-white rounded-sm" />}
              </div>
              <span className="text-[10px] tracking-widest">INCLUDE GRIDLINES</span>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowExportModal(false)}
                className={`flex-1 py-2 text-[10px] font-mono tracking-widest rounded active:scale-95 ${themeCfg.btnDanger}`}
              >
                CANCEL
              </button>
              <button
                onClick={() => executeRenderPipeline(exportPrefix, exportGridlines)}
                className={`flex-1 py-2 text-[10px] font-mono tracking-widest rounded active:scale-95 ${themeCfg.btnDefault}`}
              >
                RENDER
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ─────────────────────────────────────────────────────────────────── */}

    </div>
  );
}
