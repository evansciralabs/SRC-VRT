export const parseSRCD = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawData = JSON.parse(event.target.result);
        const indexedTabs = indexAndSanitize(rawData);
        resolve(indexedTabs);
      } catch (error) {
        reject("Veilpoint Error: Invalid JSON structure.");
      }
    };
    reader.readAsText(file);
  });
};

const indexAndSanitize = (data) => {
  const safePayloads = [];

  if (data.scratchpad) {
    extractFromScratchpad(data.scratchpad, "SINGLE-EXPORT", safePayloads);
  }

  if (data.projects && Array.isArray(data.projects)) {
    data.projects.forEach(project => {
      if (project.attachments && Array.isArray(project.attachments)) {
        project.attachments.forEach(attachment => {
          try {
            const content = typeof attachment.content === 'string' 
              ? JSON.parse(attachment.content) 
              : attachment.content;
              
            if (content.scratchpad) {
              extractFromScratchpad(content.scratchpad, attachment.label || "FILE", safePayloads);
            }
          } catch (e) {
            console.warn("Veilpoint dropped unparseable attachment node.");
          }
        });
      }
    });
  }
  return safePayloads;
};

const extractFromScratchpad = (scratchpad, labelPrefix, safePayloads) => {
  Object.keys(scratchpad).forEach(tab => {
    const rawString = scratchpad[tab];
    
    const safeCSS = extractRegex(rawString, /<style>([\s\S]*?)<\/style>/i);
    const safeSVG = extractRegex(rawString, /<svg[\s\S]*?<\/svg>/i);
    
    if (safeCSS || safeSVG) {
      safePayloads.push({
        id: `${labelPrefix}-${tab}`.toUpperCase(),
        type: tab,
        css: safeCSS || '',
        svg: safeSVG || ''
      });
    }
  });
};

const extractRegex = (text, regex) => {
  const match = text.match(regex);
  return match ? match[1] || match[0] : null;
};
