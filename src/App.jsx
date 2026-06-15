import React, { useRef, useState, useEffect } from 'react';
import * as htmlToImage from 'html-to-image';
import GroundPlane from './components/GroundPlane';
import ArtPlane from './components/ArtPlane';
import solveHomography from './utils/mathUtils';

// VΞILPØINT SANITIZER
const extractVeilpointPayload = (rawString) => {
  if (!rawString || typeof rawString !== 'string') return null;
  const killWords = ['import React', 'export default', '<!DOCTYPE html>', 'function App', 'ReactDOM', 'module.exports', 'import {', 'export const', '"dependencies":'];
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

// Pure utility — compute centroid of a layer's corner quad
const layerCenter = (layer) => {
  if (!layer.corners) return null;
  return {
    x: layer.corners.reduce((s, c) => s + c.x, 0) / 4,
    y: layer.corners.reduce((s, c) => s + c.y, 0) / 4,
  };
};

export default function App() {
  const exportRef = useRef(null);
  const tapTimer = useRef(null);
  const holdTimer = useRef(null);
  const activeCornersRef = useRef(null);
  const activeScaleRef = useRef(1);
  const isLockingRef = useRef(false); // set true immediately on hold to freeze corner updates

  // CORE STATE
  const [isPitchMode, setIsPitchMode] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [hardwareTrigger, setHardwareTrigger] = useState(0);
  const [groundImage, setGroundImage] = useState(null);

  // PAYLOAD SCROLL STACK — persists across lock/unlock cycles
  // This is the full library of imported designs the user scrolls through.
  const [payloadLibrary, setPayloadLibrary] = useState([]);

  // STAMP ARCHITECTURE
  const [stampedLayers, setStampedLayers] = useState([]);
  const [isLocked, setIsLocked] = useState(false);
  const [stampTrigger, setStampTrigger] = useState(0);

  // ACTIVE LAYER STATE
  const [activeDesignIdx, setActiveDesignIdx] = useState(0);
  const [reactivatedLayer, setReactivatedLayer] = useState(null);
  const [reactivatedFromIdx, setReactivatedFromIdx] = useState(null);
  const [reactivatedDesignIdx, setReactivatedDesignIdx] = useState(null); // library idx matching reactivated layer, or -1 if not found
  const [restoredCorners, setRestoredCorners] = useState(null);
  const [restoredScale, setRestoredScale] = useState(null);
  const [isPlacing, setIsPlacing] = useState(false);

  // EXPORT MODAL
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPrefix, setExportPrefix] = useState('VRT-MATRIX');
  const [exportGridlines, setExportGridlines] = useState(false);

  // HUD
  const [isAmbi, setIsAmbi] = useState(false);
  const [theme, setTheme] = useState('neon');
  const themeCfg = getThemeStyles(theme);

  // TEMPORAL LOGIC
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
        // Convert to data URL so html-to-image canvas doesn't get tainted by blob URLs
        const reader = new FileReader();
        reader.onload = (e) => setGroundImage(e.target.result);
        reader.readAsDataURL(file);
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
        if (wasEmpty) setIsPlacing(true); // auto-start placing on first import
        return [...prev, ...extracted];
      });
    }
    event.target.value = '';
  };

  // ── LAYER ACTIVATION ─────────────────────────────────────────────────────
  // Pulls a stamped layer out for editing. Restores its geometry.
  // The full payload library remains available for scrolling to switch designs.
  // All state transitions synchronous — no setTimeout.
  const activateStampedLayer = (layerIdx) => {
    if (isLocked) return;

    const layer = stampedLayers[layerIdx];
    if (!layer) return;

    // If something is currently active, auto-stamp it at its current position first
    if (hasActiveLayer && activeCornersRef.current && activeDesign) {
      const matrix = solveHomography(activeCornersRef.current) || 'matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)';
      const autoStamped = {
        id: `${activeDesign.id}-${Date.now()}`,
        css: activeDesign.css, html: activeDesign.html,
        matrix, scale: activeScaleRef.current,
        corners: activeCornersRef.current,
      };
      if (mode === 'editing') {
        // Re-insert at original position
        setStampedLayers(prev => {
          const next = [...prev];
          next.splice(reactivatedFromIdx, 0, autoStamped);
          // Now remove the target layer from the updated array
          const targetIdx = layerIdx >= reactivatedFromIdx ? layerIdx + 1 : layerIdx;
          return next.filter((_, i) => i !== targetIdx);
        });
      } else {
        // Was placing — append auto-stamp, remove target from remaining
        setStampedLayers(prev => {
          const appended = [...prev.filter((_, i) => i !== layerIdx), autoStamped];
          return appended;
        });
      }
    } else {
      // Nothing active — just remove target from stamps
      setStampedLayers(prev => prev.filter((_, i) => i !== layerIdx));
    }

    setIsPlacing(false);
    setReactivatedLayer(layer);
    setReactivatedFromIdx(layerIdx);
    setRestoredCorners(layer.corners || null);
    setRestoredScale(layer.scale || 1);

    // Match reactivated layer to library by comparing actual css/html content,
    // not just id — ids can collide when multiple scratchpad tabs produce same label.
    const matchIdx = payloadLibrary.findIndex(p =>
      p.css === layer.css && p.html === layer.html
    );
    setReactivatedDesignIdx(matchIdx >= 0 ? matchIdx : -1);
  };

  const executeStampLayer = (matrix, scale, corners) => {
    if (!activeDesign) return;

    const newLayer = {
      id: `${activeDesign.id}-${Date.now()}`,
      css: activeDesign.css,
      html: activeDesign.html,
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
      setReactivatedDesignIdx(null);
      setRestoredCorners(null);
      setRestoredScale(null);
      setIsPlacing(false);
    } else {
      // Fresh placing — append, advance library index, stay in placing
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
      setReactivatedDesignIdx(null);
      setRestoredCorners(null);
      setRestoredScale(null);
      setIsPlacing(false);
    } else if (mode === 'placing') {
      // Cancel current placement, return to idle
      setIsPlacing(false);
    }
  };

  // Full reset — clears everything
  const clearAll = () => {
    setPayloadLibrary([]);
    setActiveDesignIdx(0);
    setStampedLayers([]);
    setReactivatedLayer(null);
    setReactivatedFromIdx(null);
    setReactivatedDesignIdx(null);
    setRestoredCorners(null);
    setRestoredScale(null);
    setIsLocked(false);
    setIsPlacing(false);
  };
  // ─────────────────────────────────────────────────────────────────────────

  // ── RENDER PIPELINE ───────────────────────────────────────────────────────
  // Captures with transparent background, crops to content bounds.
  // Content bounds = ground image rect expanded to include all stamped layer corners.
  // Areas outside the ground image but inside content bounds = transparent.
  const executeRenderPipeline = async (prefix, includeGridlines) => {
    setShowExportModal(false);

    setIsRendering(true);
    setIsPitchMode(true);
    await new Promise(resolve => setTimeout(resolve, 150));

    try {
      const pixelRatio = 2;
      const W = window.innerWidth;
      const H = window.innerHeight;

      // Step 1: Capture full viewport to canvas with transparent background
      const fullDataUrl = await htmlToImage.toPng(exportRef.current, {
        quality: 1.0,
        pixelRatio,
        backgroundColor: null, // transparent
        width: W,
        height: H,
        style: {
          transform: 'none',
          transformOrigin: 'top left',
          width: `${W}px`,
          height: `${H}px`,
          overflow: 'visible',
          position: 'fixed',
          top: '0',
          left: '0',
        },
      });

      // Step 3: Scan captured pixels to find true content bounds.
      // Uses directional edge sweeps — O(w+h) not O(w×h) — safe for mobile.
      const scanImg = new Image();
      scanImg.crossOrigin = 'anonymous';
      await new Promise((resolve) => {
        scanImg.onload = resolve;
        scanImg.onerror = resolve; // fall back to full viewport on error
        scanImg.src = fullDataUrl;
      });

      const scanCanvas = document.createElement('canvas');
      scanCanvas.width = scanImg.width;
      scanCanvas.height = scanImg.height;
      const scanCtx = scanCanvas.getContext('2d');
      scanCtx.drawImage(scanImg, 0, 0);

      let left = 0, top = 0, right = W, bottom = H;

      try {
        const imageData = scanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
        const data = imageData.data;
        const sw = scanCanvas.width;
        const sh = scanCanvas.height;
        const ALPHA_THRESHOLD = 8;

        const hasContent = (x, y) => data[(y * sw + x) * 4 + 3] > ALPHA_THRESHOLD;

        let minY = 0;
        outer1: for (let y = 0; y < sh; y++) {
          for (let x = 0; x < sw; x++) { if (hasContent(x, y)) { minY = y; break outer1; } }
        }
        let maxY = sh - 1;
        outer2: for (let y = sh - 1; y >= 0; y--) {
          for (let x = 0; x < sw; x++) { if (hasContent(x, y)) { maxY = y; break outer2; } }
        }
        let minX = 0;
        outer3: for (let x = 0; x < sw; x++) {
          for (let y = minY; y <= maxY; y++) { if (hasContent(x, y)) { minX = x; break outer3; } }
        }
        let maxX = sw - 1;
        outer4: for (let x = sw - 1; x >= 0; x--) {
          for (let y = minY; y <= maxY; y++) { if (hasContent(x, y)) { maxX = x; break outer4; } }
        }

        const cl = Math.floor(minX / pixelRatio);
        const ct = Math.floor(minY / pixelRatio);
        const cr = Math.ceil(maxX / pixelRatio);
        const cb = Math.ceil(maxY / pixelRatio);

        if (cr > cl && cb > ct) {
          left = cl; top = ct; right = cr; bottom = cb;
        }
      } catch (scanErr) {
        console.warn('[VRT] Pixel scan failed, using full viewport:', scanErr);
        // left/top/right/bottom already set to full viewport above
      }

      const cropW = right - left;
      const cropH = bottom - top;

      // Step 4: Crop using the pixel-scanned bounds
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = cropW * pixelRatio;
      cropCanvas.height = cropH * pixelRatio;
      const ctx = cropCanvas.getContext('2d');

      ctx.drawImage(
        scanImg,
        left * pixelRatio, top * pixelRatio,
        cropW * pixelRatio, cropH * pixelRatio,
        0, 0,
        cropW * pixelRatio, cropH * pixelRatio
      );

      const croppedDataUrl = cropCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      const shortHash = Math.random().toString(36).substring(2, 6).toUpperCase();
      link.download = `${prefix || 'VRT-MATRIX'}_${shortHash}.png`;
      link.href = croppedDataUrl;
      link.click();

    } catch (error) {
      console.error('Pipeline failure:', error);
    } finally {
      setIsPitchMode(false);
      setIsRendering(false);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  // DERIVED STATE
  // isPlacing: user is actively positioning a fresh design element
  // We track this explicitly rather than inferring from library state,
  // because the library persists across lock/unlock but placing does not.
  // mode drives all layer interaction logic:
  //   idle    = nothing active, stamps are tappable (unlocked)
  //   placing = fresh layer from library being positioned
  //   editing = reactivated stamped layer being adjusted
  const mode = isLocked ? 'idle'
    : reactivatedLayer !== null ? 'editing'
    : isPlacing ? 'placing'
    : 'idle';

  const hasActiveLayer = mode === 'placing' || mode === 'editing';

  const activeDesign = mode === 'editing'
    ? (reactivatedDesignIdx !== null && reactivatedDesignIdx >= 0 && payloadLibrary.length > 0
        ? payloadLibrary[reactivatedDesignIdx]
        : reactivatedLayer) // fallback to stored design if not in library
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

  return (
    <div className={`w-full h-screen font-mono overflow-visible relative transition-colors duration-300 ${themeCfg.appBg} ${themeCfg.textMain}`} style={isPitchMode ? { backgroundColor: 'transparent' } : undefined}>

      {/* VRT BRANDING */}
      <div onClick={handleVRTTap} className={`absolute top-4 left-1/2 -translate-x-1/2 text-sm font-bold tracking-[0.3em] cursor-pointer select-none z-[60] transition-colors ${theme === 'daylight' ? 'text-blue-500' : theme === 'ghost' ? 'text-gray-700' : 'text-cyan-600/50'}`}>VRT</div>

      {/* SRC BRANDING */}
      <div onClick={() => setIsAmbi(!isAmbi)} className={`absolute top-4 ${isAmbi ? 'left-4' : 'right-4'} text-sm font-bold tracking-[0.3em] cursor-pointer select-none z-[60] transition-colors ${theme === 'daylight' ? 'text-slate-400 hover:text-slate-600' : 'text-gray-600 hover:text-gray-400'}`}>SRC</div>

      {/* TACTICAL Y-AXIS TOOLSET */}
      <div className={`absolute top-1/2 -translate-y-1/2 flex flex-col gap-8 z-[60] pointer-events-auto transition-all duration-300 ${isAmbi ? 'right-4' : 'left-4'}`}>

        {/* Lock button: visible when library loaded, active, or locked */}
        {(hasActiveLayer || isLocked || payloadLibrary.length > 0) && (
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              holdTimer.current = setTimeout(() => {
                holdTimer.current = null;
                if (!isLocked) {
                  // Freeze corner updates immediately — before rAF fires
                  isLockingRef.current = true;
                  // Snapshot closure values now — they may change before rAF fires
                  const snapDesign = activeDesign;
                  const snapMode = mode;
                  const snapReactivatedFromIdx = reactivatedFromIdx;
                  // Use rAF to ensure we read corners after the final pointer move paints
                  requestAnimationFrame(() => {
                    if (activeCornersRef.current && snapDesign) {
                      const matrix = solveHomography(activeCornersRef.current) || 'matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1)';
                      const newLayer = {
                        id: `${snapDesign.id}-${Date.now()}`,
                        css: snapDesign.css, html: snapDesign.html,
                        matrix, scale: activeScaleRef.current,
                        corners: activeCornersRef.current,
                      };
                      if (snapMode === 'editing') {
                        setStampedLayers(prev => {
                          const next = [...prev];
                          next.splice(snapReactivatedFromIdx, 0, newLayer);
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
                    setReactivatedDesignIdx(null);
                    setRestoredCorners(null);
                    setRestoredScale(null);
                    isLockingRef.current = false;
                  });
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
                  // Stamp current active layer
                  setStampTrigger(t => t + 1);
                } else if (payloadLibrary.length > 0) {
                  // Idle with library content — start fresh placement
                  setIsPlacing(true);
                }
              }
            }}
            onPointerLeave={() => {
              if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
            }}
            className={`w-12 h-12 rounded-full border flex items-center justify-center text-xl active:scale-90 select-none touch-none transition-colors duration-300 ${isLocked ? themeCfg.btnDanger : themeCfg.btnDefault}`}
            style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
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
        {/* Library clear: wipes imported .srcd files and resets session */}
        {payloadLibrary.length > 0 && !isLocked && (
          <button
            onClick={clearAll}
            className={`w-12 h-12 rounded-full border flex items-center justify-center text-xl active:scale-90 transition-colors opacity-40 hover:opacity-80 ${themeCfg.btnDanger}`}
            title="Clear library and reset session"
          >
            ✕
          </button>
        )}
      </div>

      <main className="w-full h-full">
        <div ref={exportRef} className={`w-full h-full relative overflow-visible transition-colors duration-300 ${theme === 'daylight' ? 'bg-[#ffffff]' : 'bg-[#0a0a0a]'}`} style={isPitchMode ? { backgroundColor: 'transparent' } : undefined}>

          <GroundPlane isPitchMode={isPitchMode} hardwareTrigger={hardwareTrigger} groundImage={groundImage} setGroundImage={setGroundImage} isAmbi={isAmbi} theme={theme} themeCfg={themeCfg}>

            {/* STAMPED LAYERS — art content only, no pointer events */}
            <div className="absolute inset-0 z-30" style={{ pointerEvents: 'none' }}>
              {stampedLayers.map((layer) => (
                <div key={layer.id} className="absolute inset-0" style={{ pointerEvents: 'none' }}>
                  <div
                    className="absolute top-0 left-0 origin-top-left flex items-center justify-center overflow-visible"
                    style={{ transform: layer.matrix, width: '240px', height: '240px', pointerEvents: 'none' }}
                  >
                    <div style={{ transform: `scale(${layer.scale})`, transformOrigin: 'center center', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <style dangerouslySetInnerHTML={{ __html: layer.css }} />
                      <div className="[&>svg]:max-w-full [&>svg]:max-h-full w-full h-full flex items-center justify-center" dangerouslySetInnerHTML={{ __html: layer.html }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <ArtPlane
              isPitchMode={isPitchMode}
              isActive={hasActiveLayer}
              clearPayload={clearActiveLayer}
              clearAll={clearAll}
              isAmbi={isAmbi}
              themeCfg={themeCfg}
              onCyclePrev={payloadLibrary.length > 1 ? () => {
                if (mode === 'editing') {
                  const cur = reactivatedDesignIdx >= 0 ? reactivatedDesignIdx : 0;
                  setReactivatedDesignIdx(cur > 0 ? cur - 1 : payloadLibrary.length - 1);
                } else {
                  setActiveDesignIdx(i => (i > 0 ? i - 1 : payloadLibrary.length - 1));
                }
              } : undefined}
              onCycleNext={payloadLibrary.length > 1 ? () => {
                if (mode === 'editing') {
                  const cur = reactivatedDesignIdx >= 0 ? reactivatedDesignIdx : 0;
                  setReactivatedDesignIdx(cur < payloadLibrary.length - 1 ? cur + 1 : 0);
                } else {
                  setActiveDesignIdx(i => (i < payloadLibrary.length - 1 ? i + 1 : 0));
                }
              } : undefined}
              onStamp={executeStampLayer}
              stampedCount={stampedLayers.length}
              isLocked={isLocked}
              stampTrigger={stampTrigger}
              restoredCorners={restoredCorners}
              restoredScale={restoredScale}
              onCornersChange={(c) => { if (!isLockingRef.current) activeCornersRef.current = c; }}
              onScaleChange={(s) => { if (!isLockingRef.current) activeScaleRef.current = s; }}
            >
              {hasActiveLayer && activeDesign ? (
                <div className="w-full h-full flex items-center justify-center pointer-events-none">
                  <style dangerouslySetInnerHTML={{ __html: activeDesign.css }} />
                  <div className="[&>svg]:max-w-full [&>svg]:max-h-full w-full h-full flex items-center justify-center" dangerouslySetInnerHTML={{ __html: activeDesign.html }} />
                </div>
              ) : null}
            </ArtPlane>

            {/* TAP TARGETS — separate overlay above ArtPlane (z-50) so they're never blocked */}
            {!isLocked && !isPitchMode && (
              <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 50 }}>
                {stampedLayers.map((layer, layerIdx) => {
                  const center = layerCenter(layer);
                  if (!center) return null;

                  // Detect overlap with other layers — offset dots so both are tappable
                  const OVERLAP_THRESHOLD = 32;
                  const overlapCount = stampedLayers.slice(0, layerIdx).filter(other => {
                    const oc = layerCenter(other);
                    if (!oc) return false;
                    return Math.abs(oc.x - center.x) < OVERLAP_THRESHOLD &&
                           Math.abs(oc.y - center.y) < OVERLAP_THRESHOLD;
                  }).length;

                  // Each overlapping layer gets a small radial offset
                  const angle = (overlapCount * 60) * (Math.PI / 180);
                  const radius = overlapCount > 0 ? 20 : 0;
                  const offsetX = overlapCount > 0 ? Math.cos(angle) * radius : 0;
                  const offsetY = overlapCount > 0 ? Math.sin(angle) * radius : 0;

                  const dotX = center.x + offsetX;
                  const dotY = center.y + offsetY;

                  return (
                    <div
                      key={`tap-${layer.id}`}
                      style={{
                        position: 'absolute',
                        left: dotX - 10, top: dotY - 10,
                        width: 20, height: 20,
                        pointerEvents: 'auto',
                        cursor: 'pointer',
                        borderRadius: '50%',
                        border: '2px solid #06b6d4',
                        backgroundColor: 'rgba(6,182,212,0.15)',
                        boxShadow: '0 0 8px rgba(6,182,212,0.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      onClick={() => activateStampedLayer(layerIdx)}
                    >
                      <div style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#06b6d4' }} />
                    </div>
                  );
                })}
              </div>
            )}

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

      {/* EXPORT MODAL */}
      {showExportModal && (
        <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
          <div className={`rounded-xl px-6 py-5 font-mono flex flex-col gap-4 min-w-[240px] ${themeCfg.panel}`}>
            <div className="text-[10px] tracking-[0.25em] font-bold opacity-60">EXPORT // CONFIGURE</div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] tracking-widest opacity-50">PROJECT PREFIX</label>
              <input autoFocus type="text" value={exportPrefix}
                onChange={e => setExportPrefix(e.target.value.toUpperCase().replace(/\s/g, '-'))}
                onKeyDown={e => e.key === 'Enter' && executeRenderPipeline(exportPrefix, exportGridlines)}
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
