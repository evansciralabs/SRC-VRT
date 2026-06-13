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
  const holdTimer = useRef(null);
  const activeCornersRef = useRef(null);  // updated by ArtPlane via onCornersChange
  const activeScaleRef = useRef(1);        // updated by ArtPlane via onScaleChange

  const executeStampLayer = (matrix, scale, corners) => {
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
    // Auto-advance to next payload so next STAMP targets a fresh node
    if (payloads.length > 1) {
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
  // Uses a canvas instead of html-to-image to avoid coordinate system issues.
  // Draws: ground image → stamped layers → active layer, all at exact screen positions.
  const executeRenderPipeline = async (prefix, includeGridlines) => {
    setShowExportModal(false);
    setIsRendering(true);
    setIsPitchMode(true);
    await new Promise(resolve => setTimeout(resolve, 150));

    try {
      const scale = 2; // retina
      const W = window.innerWidth;
      const H = window.innerHeight;
      const canvas = document.createElement('canvas');
      canvas.width = W * scale;
      canvas.height = H * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);

      // 1. Background fill
      ctx.fillStyle = theme === 'daylight' ? '#ffffff' : '#0a0a0a';
      ctx.fillRect(0, 0, W, H);

      // 2. Ground image — draw at full screen size matching object-contain
      if (groundImage) {
        const img = await loadImage(groundImage);
        const { sx, sy, sw, sh, dx, dy, dw, dh } = objectContainRect(img.naturalWidth, img.naturalHeight, W, H);
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
      }

      // 3. Render each layer (stamped + active) via their stored corner coords
      const layersToRender = [
        ...stampedLayers,
        ...(hasActivePayload ? [{
          id: 'active',
          css: payloads[activePayloadIdx].css,
          html: payloads[activePayloadIdx].html,
          corners: activeCornersRef.current,
          scale: activeScaleRef.current,
        }] : [])
      ];

      for (const layer of layersToRender) {
        if (!layer.corners) continue;
        const svgDataUrl = await layerToDataUrl(layer.css, layer.html, 240, 240);
        if (!svgDataUrl) continue;
        const img = await loadImage(svgDataUrl);
        ctx.save();
        // Apply the same 4-point perspective transform using the stored corners
        applyHomographyToCanvas(ctx, layer.corners, layer.scale, img, 240);
        ctx.restore();
      }

      const dataUrl = canvas.toDataURL('image/png');
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

  // Loads an image URL into an HTMLImageElement
  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  // Calculates object-contain draw rect for a given image and container
  const objectContainRect = (iw, ih, cw, ch) => {
    const scale = Math.min(cw / iw, ch / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;
    return { sx: 0, sy: 0, sw: iw, sh: ih, dx, dy, dw, dh };
  };

  // Renders a layer's css+html into a data URL via an offscreen SVG foreignObject
  const layerToDataUrl = (css, html, w, h) => new Promise((resolve) => {
    try {
      const svgStr = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;">
              <style>${css}</style>
              ${html}
            </div>
          </foreignObject>
        </svg>`;
      const blob = new Blob([svgStr], { type: 'image/svg+xml' });
      resolve(URL.createObjectURL(blob));
    } catch { resolve(null); }
  });

  // Draws an image onto canvas using 4-point homography corners (screen coords)
  // Approximates perspective via bilinear quad subdivision
  const applyHomographyToCanvas = (ctx, corners, layerScale, img, baseSize) => {
    const scaledSize = baseSize * layerScale;
    // Use the corners directly — they are already in screen pixel coordinates
    const [tl, tr, br, bl] = corners;
    ctx.save();
    // Draw using canvas setTransform approximation via the bounding parallelogram
    // For full perspective accuracy we subdivide into two triangles
    drawQuadImage(ctx, img, tl, tr, br, bl);
    ctx.restore();
  };

  // Draws an image mapped to an arbitrary quad by splitting into two triangles
  const drawQuadImage = (ctx, img, tl, tr, br, bl) => {
    drawTriangleImage(ctx, img, 0, 0, img.naturalWidth, 0, img.naturalWidth, img.naturalHeight,
      tl.x, tl.y, tr.x, tr.y, br.x, br.y);
    drawTriangleImage(ctx, img, 0, 0, img.naturalWidth, img.naturalHeight, 0, img.naturalHeight,
      tl.x, tl.y, br.x, br.y, bl.x, bl.y);
  };

  // Draws a triangle of an image onto a destination triangle using canvas transform
  const drawTriangleImage = (ctx, img, sx1, sy1, sx2, sy2, sx3, sy3, dx1, dy1, dx2, dy2, dx3, dy3) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dx1, dy1);
    ctx.lineTo(dx2, dy2);
    ctx.lineTo(dx3, dy3);
    ctx.closePath();
    ctx.clip();
    const m = solveAffine(sx1, sy1, sx2, sy2, sx3, sy3, dx1, dy1, dx2, dy2, dx3, dy3);
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  };

  // Solves affine transform mapping src triangle to dst triangle
  const solveAffine = (sx1, sy1, sx2, sy2, sx3, sy3, dx1, dy1, dx2, dy2, dx3, dy3) => {
    const det = (sx1*(sy2-sy3) + sx2*(sy3-sy1) + sx3*(sy1-sy2));
    if (det === 0) return [1,0,0,1,0,0];
    const a = ((dx1*(sy2-sy3) + dx2*(sy3-sy1) + dx3*(sy1-sy2)) / det);
    const b = ((dy1*(sy2-sy3) + dy2*(sy3-sy1) + dy3*(sy1-sy2)) / det);
    const c = ((sx1*(dx2-dx3) + sx2*(dx3-dx1) + sx3*(dx1-dx2)) / det);
    const d = ((sx1*(dy2-dy3) + sx2*(dy3-sy1) + sx3*(dy1-dy2)) / det);
    const e = dx1 - a*sx1 - c*sy1;
    const f = dy1 - b*sx1 - d*sy1;
    return [a, b, c, d, e, f];
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
        {/* Lock: tap=stamp (only when unlocked), hold=toggle clean preview lock */}
        {hasActivePayload && (
          <button
            onPointerDown={() => {
              holdTimer.current = setTimeout(() => {
                setIsLocked(l => !l);
                holdTimer.current = null;
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
