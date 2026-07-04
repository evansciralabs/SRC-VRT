import React, { useRef, useState, useEffect } from 'react';
import * as htmlToImage from 'html-to-image';
import GroundPlane from './components/GroundPlane';
import ArtPlane from './components/ArtPlane';
import solveHomography from './utils/mathUtils';
import { sealImagePayload } from './lib/imagePayloadCodec';
import { sanitizeVeilpointHtml, scopeVeilpointCss } from './lib/veilpointSanitizer';
import { DEFAULT_SDAP_BRANDING, SDAP_BRANDING_FIELDS, resolveSdapBranding, applyAestheticPreset } from './lib/sdapBranding';
import { designBBox, unionRects, bboxToRect } from './lib/exportBounds';

// VΞILPØINT SANITIZER — now backed by DOMPurify (real DOM parser) + CSS
// selector scoping, replacing the old regex blocklist that could be bypassed
// by unquoted/single-quoted event handlers and foreignObject smuggling.
let _veilpointScopeCounter = 0;
const extractVeilpointPayload = (rawString) => {
  if (!rawString || typeof rawString !== 'string') return null;
  const killWords = ['import React', 'export default', '<!DOCTYPE html>', 'function App', 'ReactDOM', 'module.exports', 'import {', 'export const', '"dependencies":'];
  if (killWords.some(word => rawString.includes(word))) return null;
  if (!rawString.includes('<style') && !rawString.includes('<svg')) return null;

  // Unique scope class so this payload's CSS can only ever match its own wrapper.
  const scopeClass = `vp-scope-${++_veilpointScopeCounter}-${Date.now().toString(36)}`;

  const cssMatch = rawString.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  const rawCss = cssMatch ? cssMatch.map(m => m.replace(/<\/?style[^>]*>/gi, '')).join('\n') : '';
  // Scope every selector to .${scopeClass} — injected CSS can no longer touch
  // app chrome (buttons, lock control, etc). Replaces the old forced
  // body/main/#root background-transparent patch, which now simply never
  // matches. If a design leaned on a body-level background, it renders
  // without it; add a scoped fallback here if that ever regresses an import.
  const css = scopeVeilpointCss(rawCss, scopeClass);

  const rawHtml = rawString
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!DOCTYPE html>/gi, '')
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<\/?head[^>]*>/gi, '')
    .replace(/<\/?body[^>]*>/gi, '');
  // DOMPurify SVG profile — strips scripts, event handlers (any quoting),
  // javascript: URIs, and foreignObject regardless of how they're written.
  const html = sanitizeVeilpointHtml(rawHtml);

  if (!css.trim() && !html.includes('<svg')) return null;
  return { css, html: html.trim(), scopeClass };
};

// MASTER THEME CONFIGURATOR
const getThemeStyles = (theme) => {
  if (theme === 'daylight') return {
    appBg: 'bg-[#f4f4f5]', panel: 'bg-white/95 border border-blue-400 text-slate-500 shadow-none',
    btnDefault: 'bg-white border border-blue-400 text-blue-500 shadow-none hover:bg-blue-50 transition-colors',
    btnDanger: 'bg-white border border-red-400 text-red-500 shadow-none hover:bg-red-50 transition-colors',
    textMain: 'text-slate-500', anchor: 'border-blue-400 bg-white/50 shadow-none', anchorActive: 'active:bg-blue-400/30'
  };
  if (theme === 'ghost') return {
    appBg: 'bg-[#050505]', panel: 'bg-[#0a0a0a]/95 border border-gray-800 text-gray-600 shadow-none',
    btnDefault: 'bg-transparent border border-gray-700 text-gray-600 shadow-none hover:bg-gray-900 transition-colors',
    btnDanger: 'bg-transparent border border-red-900 text-red-900 shadow-none hover:bg-red-950 transition-colors',
    textMain: 'text-gray-600', anchor: 'border-gray-700 bg-transparent shadow-none', anchorActive: 'active:bg-gray-800/50'
  };
  return {
    appBg: 'bg-black', panel: 'bg-[#112222]/95 border border-cyan-400 text-cyan-400 shadow-[0_0_15px_rgba(0,255,204,0.5)]',
    btnDefault: 'bg-black/80 border border-cyan-400 text-cyan-400 shadow-[0_0_10px_rgba(0,255,204,0.3)] hover:bg-cyan-900 transition-colors',
    btnDanger: 'bg-black/80 border border-red-500 text-red-500 shadow-[0_0_10px_rgba(255,0,0,0.3)] hover:bg-red-900 transition-colors',
    textMain: 'text-cyan-400', anchor: 'border-cyan-400 bg-black/50 shadow-[0_0_10px_rgba(0,255,204,0.5)]', anchorActive: 'active:bg-cyan-400/50'
  };
};

export default function App() {
  const exportRef = useRef(null);
  const tapTimer = useRef(null);
  const holdTimer = useRef(null);
  const activeCornersRef = useRef(null);
  const activeScaleRef = useRef(1);

  // CORE STATE
  const [isPitchMode, setIsPitchMode] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [hardwareTrigger, setHardwareTrigger] = useState(0);
  const [groundImage, setGroundImage] = useState(null);

  // PAYLOAD SCROLL STACK — persists across lock/unlock cycles
  const [payloadLibrary, setPayloadLibrary] = useState([]);

  // STAMP ARCHITECTURE
  const [stampedLayers, setStampedLayers] = useState([]);
  const [isLocked, setIsLocked] = useState(false);
  const [stampTrigger, setStampTrigger] = useState(0);

  // ACTIVE LAYER STATE
  const [activeDesignIdx, setActiveDesignIdx] = useState(0);
  const [reactivatedLayer, setReactivatedLayer] = useState(null);
  const [reactivatedFromIdx, setReactivatedFromIdx] = useState(null);
  const [restoredCorners, setRestoredCorners] = useState(null);
  const [restoredScale, setRestoredScale] = useState(null);
  const [isPlacing, setIsPlacing] = useState(false);

  // EXPORT MODAL
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPrefix, setExportPrefix] = useState('VRT-MATRIX');
  const [exportGridlines, setExportGridlines] = useState(false);

  // ── OPERATOR CONSOLE (folded into the Export Modal) ───────────────────
  // Every field is OPTIONAL. Hitting RENDER with all blank = a plain image
  // (guest mode — no payload embedded). The three resulting modes:
  //   nothing         → GUEST image
  //   callsign only   → device-locked session image (works where the glyph
  //                     was bound in the dashboard; inert elsewhere)
  //   callsign+glyph  → portable key (works on any device; treat as secret)
  const [opCallsign, setOpCallsign] = useState('');
  const [opGlyph, setOpGlyph] = useState('');
  const [opBranding, setOpBranding] = useState({ ...DEFAULT_SDAP_BRANDING });
  const [showBranding, setShowBranding] = useState(false);
  const updateBranding = (k, v) => setOpBranding(b => ({ ...b, [k]: v }));

  const opMode = !opCallsign.trim()
    ? 'GUEST — no credentials embedded'
    : !opGlyph.trim()
    ? 'DEVICE SESSION — logs in where you set this up'
    : 'PORTABLE KEY — works on any device · treat as secret';

  // HUD
  const [isAmbi, setIsAmbi] = useState(false);
  const [theme, setTheme] = useState('neon');
  const themeCfg = getThemeStyles(theme);

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

  // SMART IMPORT — always appends to library, never disrupts active state
  const handleSmartImport = async (event) => {
    const files = Array.from(event.target.files);
    let extracted = [];
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        setGroundImage(URL.createObjectURL(file));
      } else if (file.name.endsWith('.srcd')) {
        try {
          const text = await file.text();
          const json = JSON.parse(text);
          const recursiveSearch = (obj, parentLabel = null) => {
            if (!obj || typeof obj !== 'object') return;
            if (obj.scratchpad) {
              Object.keys(obj.scratchpad).forEach(tabKey => {
                const payload = extractVeilpointPayload(obj.scratchpad[tabKey]);
                if (payload) extracted.push({ id: parentLabel || tabKey.toUpperCase(), ...payload });
              });
            }
            Object.keys(obj).forEach(key => {
              if (key === 'scratchpad') return;
              let nextObj = obj[key];
              let nextLabel = parentLabel;
              if (obj.attachments && Array.isArray(obj.attachments) && obj.attachments.includes(nextObj)) {
                nextLabel = nextObj.label || nextObj.filename || 'ATTACHMENT';
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
        }
      }
    }
    if (extracted.length > 0) {
      setPayloadLibrary(prev => {
        const wasEmpty = prev.length === 0;
        if (wasEmpty) setIsPlacing(true);
        return [...prev, ...extracted];
      });
    }
    event.target.value = '';
  };

  const activateStampedLayer = (layerIdx) => {
    if (isLocked) return;
    const layer = stampedLayers[layerIdx];
    if (!layer) return;

    if (hasActiveLayer && activeCornersRef.current && activeDesign) {
      const matrix = solveHomography(activeCornersRef.current) || 'matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)';
      const autoStamped = {
        id: `${activeDesign.id}-${Date.now()}`,
        css: activeDesign.css, html: activeDesign.html, scopeClass: activeDesign.scopeClass,
        matrix, scale: activeScaleRef.current,
        corners: activeCornersRef.current,
      };
      if (mode === 'editing') {
        setStampedLayers(prev => {
          const next = [...prev];
          next.splice(reactivatedFromIdx, 0, autoStamped);
          const targetIdx = layerIdx >= reactivatedFromIdx ? layerIdx + 1 : layerIdx;
          return next.filter((_, i) => i !== targetIdx);
        });
      } else {
        setStampedLayers(prev => {
          const appended = [...prev.filter((_, i) => i !== layerIdx), autoStamped];
          return appended;
        });
      }
    } else {
      setStampedLayers(prev => prev.filter((_, i) => i !== layerIdx));
    }

    setIsPlacing(false);
    setReactivatedLayer(layer);
    setReactivatedFromIdx(layerIdx);
    setRestoredCorners(layer.corners || null);
    setRestoredScale(layer.scale || 1);
  };

  const executeStampLayer = (matrix, scale, corners) => {
    if (!activeDesign) return;
    const newLayer = {
      id: `${activeDesign.id}-${Date.now()}`,
      css: activeDesign.css,
      html: activeDesign.html,
      scopeClass: activeDesign.scopeClass,
      matrix, scale, corners,
    };
    if (mode === 'editing') {
      setStampedLayers(prev => {
        const next = [...prev];
        next.splice(reactivatedFromIdx, 0, newLayer);
        return next;
      });
      setReactivatedLayer(null);
      setReactivatedFromIdx(null);
      setRestoredCorners(null);
      setRestoredScale(null);
      setIsPlacing(false);
    } else {
      setStampedLayers(prev => [...prev, newLayer]);
      if (payloadLibrary.length > 1) {
        setActiveDesignIdx(i => (i < payloadLibrary.length - 1 ? i + 1 : i));
      }
    }
  };

  const clearActiveLayer = () => {
    if (mode === 'editing') {
      setReactivatedLayer(null);
      setReactivatedFromIdx(null);
      setRestoredCorners(null);
      setRestoredScale(null);
      setIsPlacing(false);
    } else if (mode === 'placing') {
      setIsPlacing(false);
    }
  };

  const clearAll = () => {
    setPayloadLibrary([]);
    setActiveDesignIdx(0);
    setStampedLayers([]);
    setReactivatedLayer(null);
    setReactivatedFromIdx(null);
    setRestoredCorners(null);
    setRestoredScale(null);
    setIsLocked(false);
    setIsPlacing(false);
  };

  // ── RENDER PIPELINE (now seals operator payload into the PNG) ──────────
  const executeRenderPipeline = async (prefix, includeGridlines) => {
    setShowExportModal(false);
    setIsRendering(true);
    setIsPitchMode(true);
    await new Promise(resolve => setTimeout(resolve, 150));
    try {
      // ── COMPUTE TIGHT EXPORT BOUNDS ──────────────────────────────────
      // union of: the ground image's displayed rect (if any) + every
      // stamped/active design's projected bbox. Crop to that; all voids
      // export transparent. No ground + no designs → default portrait canvas.
      const hostRect = exportRef.current.getBoundingClientRect();
      const rects = [];

      // ground image displayed rect (object-contain letterboxes it, so read
      // the real rendered rect and convert to exportRef-local coords)
      const groundEl = exportRef.current.querySelector('img[alt="Environment"]');
      if (groundEl) {
        const g = groundEl.getBoundingClientRect();
        rects.push({
          minX: g.left - hostRect.left, minY: g.top - hostRect.top,
          maxX: g.right - hostRect.left, maxY: g.bottom - hostRect.top,
        });
      }

      // every stamped design: project its matrix3d box
      for (const layer of stampedLayers) {
        const bb = designBBox(layer.matrix);
        if (bb) rects.push(bb);
      }
      // the currently-active (unstamped) design, if positioned
      if (hasActiveLayer && activeCornersRef.current) {
        const m = solveHomography(activeCornersRef.current);
        const bb = designBBox(m);
        if (bb) rects.push(bb);
      }

      const union = unionRects(rects);
      // clamp the union to the visible host so we never capture offscreen white
      let cropRect = bboxToRect(union, 0);
      if (cropRect) {
        cropRect.left = Math.max(0, cropRect.left);
        cropRect.top = Math.max(0, cropRect.top);
        cropRect.width = Math.min(cropRect.width, Math.ceil(hostRect.width) - cropRect.left);
        cropRect.height = Math.min(cropRect.height, Math.ceil(hostRect.height) - cropRect.top);
      }
      // no content at all → sensible default canvas so stego still has a home
      const DEFAULT_W = 720, DEFAULT_H = 1280;
      const rect = cropRect || { left: 0, top: 0, width: DEFAULT_W, height: DEFAULT_H };

      const dataUrl = await htmlToImage.toPng(exportRef.current, {
        quality: 1.0,
        pixelRatio: 2,
        backgroundColor: undefined, // TRANSPARENT — no theme floor painted
        width: rect.width,
        height: rect.height,
        style: {
          transform: `translate(${-rect.left}px, ${-rect.top}px)`,
          transformOrigin: 'top left',
          width: `${Math.ceil(hostRect.width)}px`,
          height: `${Math.ceil(hostRect.height)}px`,
          overflow: 'visible',
          position: 'fixed',
          top: '0',
          left: '0',
          background: 'transparent',
        },
      });

      // SEAL: only when a callsign is present. Blank callsign = guest image,
      // exported plain exactly like before. Glyph and branding are optional
      // on top of that. Plaintext LSB payload — no crypto here; the dashboard
      // derives its key from the recovered callsign+glyph on import.
      let finalUrl = dataUrl;
      if (opCallsign.trim()) {
        try {
          const img = new Image();
          await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const cx = c.getContext('2d', { willReadFrequently: true });
          cx.drawImage(img, 0, 0);
          const imgData = cx.getImageData(0, 0, c.width, c.height);
          const branding = resolveSdapBranding(opBranding);
          const sealed = sealImagePayload(imgData, {
            callsign: opCallsign,
            glyph: opGlyph, // may be '' → callsign-only device mode
            sdap: branding,
          });
          cx.putImageData(new ImageData(sealed, c.width, c.height), 0, 0);
          finalUrl = c.toDataURL('image/png'); // MUST stay PNG — JPEG destroys the payload
        } catch (e) {
          console.error('[OTR] seal failed, exporting unsealed image:', e);
        }
      }

      const link = document.createElement('a');
      const shortHash = Math.random().toString(36).substring(2, 6).toUpperCase();
      link.download = `${prefix || 'VRT-MATRIX'}_${shortHash}.png`;
      link.href = finalUrl;
      link.click();
    } catch (error) {
      console.error('Pipeline failure:', error);
    } finally {
      setIsPitchMode(false);
      setIsRendering(false);
    }
  };

  // DERIVED STATE
  const mode = isLocked ? 'idle'
    : reactivatedLayer !== null ? 'editing'
    : isPlacing ? 'placing'
    : 'idle';

  const hasActiveLayer = mode === 'placing' || mode === 'editing';

  const activeDesign = mode === 'editing'
    ? (payloadLibrary.length > 0 ? payloadLibrary[activeDesignIdx] : reactivatedLayer)
    : mode === 'placing'
    ? (payloadLibrary.length > 0 ? payloadLibrary[activeDesignIdx] : null)
    : null;

  const getToolStyle = (type) => {
    if (theme === 'daylight') return 'bg-white border-blue-400 text-blue-500 shadow-none';
    if (theme === 'ghost') return 'bg-transparent border-gray-700 text-gray-600 shadow-none';
    if (type === 'cam') return 'bg-slate-800 border-green-500 text-green-400 shadow-[0_0_10px_rgba(0,255,0,0.3)]';
    if (type === 'import') return 'bg-slate-800 border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(0,255,255,0.3)]';
    if (type === 'export') return 'bg-slate-800 border-yellow-500 text-yellow-400 shadow-[0_0_10px_rgba(255,215,0,0.3)]';
  };

  const isNeon = theme === 'neon';
  const isDaylight = theme === 'daylight';

  const layerCenter = (layer) => {
    if (!layer.corners) return null;
    return {
      x: layer.corners.reduce((s, c) => s + c.x, 0) / 4,
      y: layer.corners.reduce((s, c) => s + c.y, 0) / 4,
    };
  };

  return (
    <div className={`w-full h-screen font-mono overflow-visible relative transition-colors duration-300 ${themeCfg.appBg} ${themeCfg.textMain}`}>

      {/* VRT BRANDING */}
      <div onClick={handleVRTTap} className={`absolute top-4 left-1/2 -translate-x-1/2 text-sm font-bold tracking-[0.3em] cursor-pointer select-none z-[60] transition-colors ${theme === 'daylight' ? 'text-blue-500' : theme === 'ghost' ? 'text-gray-700' : 'text-cyan-600/50'}`}>VRT</div>

      {/* SRC BRANDING */}
      <div onClick={() => setIsAmbi(!isAmbi)} className={`absolute top-4 ${isAmbi ? 'left-4' : 'right-4'} text-sm font-bold tracking-[0.3em] cursor-pointer select-none z-[60] transition-colors ${theme === 'daylight' ? 'text-slate-400 hover:text-slate-600' : 'text-gray-600 hover:text-gray-400'}`}>SRC</div>

      {/* TACTICAL Y-AXIS TOOLSET */}
      <div className={`absolute top-1/2 -translate-y-1/2 flex flex-col gap-8 z-[60] pointer-events-auto transition-all duration-300 ${isAmbi ? 'right-4' : 'left-4'}`}>

        {(hasActiveLayer || isLocked || payloadLibrary.length > 0) && (
          <button
            onPointerDown={() => {
              holdTimer.current = setTimeout(() => {
                holdTimer.current = null;
                if (!isLocked) {
                  if (activeCornersRef.current && activeDesign) {
                    const matrix = solveHomography(activeCornersRef.current) || 'matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)';
                    const newLayer = {
                      id: `${activeDesign.id}-${Date.now()}`,
                      css: activeDesign.css, html: activeDesign.html, scopeClass: activeDesign.scopeClass,
                      matrix, scale: activeScaleRef.current,
                      corners: activeCornersRef.current,
                    };
                    if (mode === 'editing') {
                      setStampedLayers(prev => {
                        const next = [...prev];
                        next.splice(reactivatedFromIdx, 0, newLayer);
                        return next;
                      });
                    } else {
                      setStampedLayers(prev => [...prev, newLayer]);
                    }
                  }
                  setIsLocked(true);
                  setIsPlacing(false);
                  setReactivatedLayer(null);
                  setReactivatedFromIdx(null);
                  setRestoredCorners(null);
                  setRestoredScale(null);
                } else {
                  setIsLocked(false);
                }
              }, 500);
            }}
            onPointerUp={() => {
              if (holdTimer.current) {
                clearTimeout(holdTimer.current);
                holdTimer.current = null;
                if (isLocked) return;
                if (hasActiveLayer) {
                  setStampTrigger(t => t + 1);
                } else if (payloadLibrary.length > 0) {
                  setIsPlacing(true);
                }
              }
            }}
            onPointerLeave={() => {
              if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
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
        <button onClick={() => !isRendering && setShowExportModal(true)} disabled={isRendering} className={`w-12 h-12 rounded-full border flex items-center justify-center text-xl active:scale-90 transition-colors ${isRendering ? 'border-gray-500 text-gray-500 bg-transparent' : getToolStyle('export')}`}>
          {isRendering ? '⧖' : '⤒'}
        </button>
      </div>

      <main className="w-full h-full">
        <div ref={exportRef} className={`w-full h-full relative overflow-visible transition-colors duration-300 ${theme === 'daylight' ? 'bg-[#ffffff]' : 'bg-[#0a0a0a]'}`}>

          <GroundPlane isPitchMode={isPitchMode} hardwareTrigger={hardwareTrigger} groundImage={groundImage} setGroundImage={setGroundImage} isAmbi={isAmbi} theme={theme} themeCfg={themeCfg}>

            <div className="absolute inset-0 z-30" style={{ pointerEvents: 'none' }}>
              {stampedLayers.map((layer, layerIdx) => {
                const center = layerCenter(layer);
                return (
                  <div key={layer.id} className="absolute inset-0" style={{ pointerEvents: 'none' }}>
                    <div
                      className="absolute top-0 left-0 origin-top-left flex items-center justify-center overflow-visible"
                      style={{ transform: layer.matrix, width: '240px', height: '240px', pointerEvents: 'none' }}
                    >
                      <div style={{ transform: `scale(${layer.scale})`, transformOrigin: 'center center', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <style dangerouslySetInnerHTML={{ __html: layer.css }} />
                        <div className={`${layer.scopeClass || ''} [&>svg]:max-w-full [&>svg]:max-h-full w-full h-full flex items-center justify-center`} dangerouslySetInnerHTML={{ __html: layer.html }} />
                      </div>
                    </div>
                    {!isLocked && !isPitchMode && center && (
                      <div
                        style={{
                          position: 'absolute',
                          left: center.x - 24, top: center.y - 24,
                          width: 48, height: 48,
                          pointerEvents: 'auto', cursor: 'pointer', zIndex: 45,
                        }}
                        onClick={() => activateStampedLayer(layerIdx)}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <ArtPlane
              isPitchMode={isPitchMode}
              isActive={hasActiveLayer}
              clearPayload={clearActiveLayer}
              clearAll={clearAll}
              isAmbi={isAmbi}
              themeCfg={themeCfg}
              onCyclePrev={payloadLibrary.length > 1 ? () => setActiveDesignIdx(i => (i > 0 ? i - 1 : payloadLibrary.length - 1)) : undefined}
              onCycleNext={payloadLibrary.length > 1 ? () => setActiveDesignIdx(i => (i < payloadLibrary.length - 1 ? i + 1 : 0)) : undefined}
              onStamp={executeStampLayer}
              stampedCount={stampedLayers.length}
              isLocked={isLocked}
              stampTrigger={stampTrigger}
              restoredCorners={restoredCorners}
              restoredScale={restoredScale}
              onCornersChange={(c) => { activeCornersRef.current = c; }}
              onScaleChange={(s) => { activeScaleRef.current = s; }}
            >
              {hasActiveLayer && activeDesign ? (
                <div className="w-full h-full flex items-center justify-center pointer-events-none">
                  <style dangerouslySetInnerHTML={{ __html: activeDesign.css }} />
                  <div className={`${activeDesign.scopeClass || ''} [&>svg]:max-w-full [&>svg]:max-h-full w-full h-full flex items-center justify-center`} dangerouslySetInnerHTML={{ __html: activeDesign.html }} />
                </div>
              ) : null}
            </ArtPlane>

          </GroundPlane>
        </div>
      </main>

      {/* ACTIVE DESIGN READOUT */}
      {hasActiveLayer && !isPitchMode && activeDesign && (
        <div className="absolute bottom-40 left-1/2 -translate-x-1/2 z-[70] pointer-events-none text-center w-full max-w-[280px]">
          <span className={`px-4 py-1 text-[10px] font-mono font-bold tracking-widest border-b rounded-full shadow-lg ${isDaylight ? 'text-slate-500 border-slate-300 bg-white/50' : 'text-cyan-400 border-cyan-500/30 bg-black/50 backdrop-blur-sm'}`}>
            NODE: {activeDesign.id}
            {stampedLayers.length > 0 && <span className="ml-2 opacity-60">// {stampedLayers.length}⬡</span>}
            {reactivatedLayer && <span className="ml-2 text-amber-400/70">// EDITING</span>}
          </span>
        </div>
      )}

      {/* EXPORT MODAL + OPERATOR CONSOLE */}
      {showExportModal && (
        <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
          <div className={`rounded-xl px-6 py-5 font-mono flex flex-col gap-4 w-[300px] max-h-[88vh] overflow-y-auto ${themeCfg.panel}`}>
            <div className="text-[10px] tracking-[0.25em] font-bold opacity-60">EXPORT // CONFIGURE</div>

            <div className="flex flex-col gap-1">
              <label className="text-[9px] tracking-widest opacity-50">PROJECT PREFIX</label>
              <input autoFocus type="text" value={exportPrefix}
                onChange={e => setExportPrefix(e.target.value.toUpperCase().replace(/\s/g, '-'))}
                maxLength={24}
                className={`bg-transparent border-b outline-none font-mono text-sm font-bold tracking-widest pb-0.5 ${isDaylight ? 'border-blue-300 text-slate-700' : isNeon ? 'border-cyan-700 text-cyan-300' : 'border-gray-700 text-gray-400'}`}
              />
            </div>

            <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => setExportGridlines(g => !g)}>
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${exportGridlines ? (isNeon ? 'bg-cyan-500 border-cyan-400' : isDaylight ? 'bg-blue-500 border-blue-400' : 'bg-gray-600 border-gray-500') : 'border-current bg-transparent'}`}>
                {exportGridlines && <div className="w-2 h-2 bg-white rounded-sm" />}
              </div>
              <span className="text-[10px] tracking-widest">INCLUDE GRIDLINES</span>
            </div>

            {/* ── OPERATOR CONSOLE (all optional) ─────────────────────── */}
            <div className="flex flex-col gap-2 pt-3 border-t border-current/20">
              <div className="text-[9px] tracking-[0.25em] font-bold opacity-50">OPERATOR // AUTH ARTIFACT</div>
              <div className="text-[8px] opacity-40 leading-tight -mt-1">All optional. Leave blank and hit RENDER for a normal image.</div>

              <input type="text" value={opCallsign}
                onChange={e => setOpCallsign(e.target.value.toUpperCase())}
                placeholder="CALLSIGN"
                spellCheck="false" autoComplete="off"
                className={`bg-transparent border-b outline-none font-mono text-sm tracking-widest pb-0.5 ${isDaylight ? 'border-blue-300 text-slate-700' : 'border-cyan-700 text-cyan-300'}`}
              />
              <input type="text" value={opGlyph}
                onChange={e => setOpGlyph(e.target.value)}
                placeholder="GLYPH"
                spellCheck="false" autoComplete="off"
                className={`bg-transparent border-b outline-none font-mono text-sm tracking-widest pb-0.5 ${isDaylight ? 'border-purple-300 text-purple-600' : 'border-purple-700 text-purple-300'}`}
              />

              <div className="text-[9px] tracking-widest opacity-70">▸ {opMode}</div>

              {opGlyph.trim() && (
                <div className="text-[8px] text-yellow-500/80 leading-tight">
                  ⚠ This PNG carries a working credential. Anyone with the file can log in as this callsign. Share it only over a trusted channel — never as a public avatar.
                </div>
              )}

              {/* SDAP branding — collapsed by default, only meaningful with a callsign */}
              {opCallsign.trim() && (
                <>
                  <button type="button" onClick={() => setShowBranding(s => !s)}
                    className="text-[9px] tracking-widest text-left opacity-60 hover:opacity-100 transition-opacity">
                    {showBranding ? '▾' : '▸'} SDAP BRANDING (optional)
                  </button>
                  {showBranding && (
                    <div className="flex flex-col gap-2 pl-1">
                      {SDAP_BRANDING_FIELDS.map(f => (
                        <div key={f.key} className="flex flex-col gap-0.5">
                          <label className="text-[8px] tracking-widest opacity-40">{f.label}</label>
                          {f.type === 'select' ? (
                            <select value={opBranding[f.key]}
                              onChange={e => {
                                // Selecting an aesthetic prefills color/type/signature
                                // with that aesthetic's preset (user can overwrite).
                                if (f.key === 'aesthetic') {
                                  setOpBranding(b => applyAestheticPreset(b, e.target.value));
                                } else {
                                  updateBranding(f.key, e.target.value);
                                }
                              }}
                              className={`border text-[10px] p-1 rounded ${isDaylight ? 'bg-white border-blue-300 text-slate-700' : 'bg-black/40 border-gray-700 text-gray-200'}`}>
                              {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : f.type === 'slider' ? (
                            <div className="flex items-center gap-2">
                              <input type="range" min={f.min} max={f.max} step={f.step}
                                value={opBranding[f.key]} onChange={e => updateBranding(f.key, parseFloat(e.target.value))}
                                className="flex-1" />
                              <span className="text-[9px] opacity-50 w-8 text-right">{Number(opBranding[f.key]).toFixed(2)}</span>
                            </div>
                          ) : (
                            <input type="text" value={opBranding[f.key]} onChange={e => updateBranding(f.key, e.target.value)}
                              className={`bg-transparent border-b text-[10px] pb-0.5 outline-none ${isDaylight ? 'border-blue-300 text-slate-700 placeholder-slate-400' : 'border-gray-700 text-gray-200 placeholder-gray-600'}`} />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowExportModal(false)} className={`flex-1 py-2 text-[10px] font-mono tracking-widest rounded active:scale-95 ${themeCfg.btnDanger}`}>CANCEL</button>
              <button onClick={() => executeRenderPipeline(exportPrefix, exportGridlines)} className={`flex-1 py-2 text-[10px] font-mono tracking-widest rounded active:scale-95 ${themeCfg.btnDefault}`}>RENDER</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
