import React, { useState } from 'react';
import GroundPlane from './components/GroundPlane';
import ArtPlane from './components/ArtPlane';
import { parseSRCD } from './utils/VeilpointParser';

export default function VRTConsole() {
  const [indexedPayloads, setIndexedPayloads] = useState([]);
  const [activePayload, setActivePayload] = useState(null);

  const handleFileIngestion = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const payloads = await parseSRCD(file);
      setIndexedPayloads(payloads);
      if (payloads.length > 0) setActivePayload(payloads[0]);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-black overflow-hidden font-mono text-gray-200">
      <GroundPlane>
        <ArtPlane activePayload={activePayload} />
      </GroundPlane>

      <div className="dock-viewport h-[20vh] w-full bg-[#0a0a0a] flex items-center overflow-x-auto px-4 snap-x">
        {indexedPayloads.length === 0 ? (
          <label className="text-gray-500 border border-gray-700 px-4 py-2 rounded cursor-pointer hover:bg-gray-800 transition-colors">
            INGEST .SRCD FILE
            <input type="file" accept=".srcd,.json" onChange={handleFileIngestion} className="hidden" />
          </label>
        ) : (
          indexedPayloads.map((payload) => (
            <button
              key={payload.id}
              onClick={() => setActivePayload(payload)}
              className={`srcd-card flex-shrink-0 w-32 h-20 mr-4 rounded-md border text-xs font-bold tracking-wider snap-center transition-all 
                ${activePayload?.id === payload.id 
                  ? 'bg-[#112222] border-cyan-400 text-cyan-400 shadow-[0_0_12px_rgba(0,255,204,0.4)]' 
                  : 'bg-[#1a1a1a] border-gray-700 hover:bg-gray-800 text-gray-400'}`}
            >
              {payload.id}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
