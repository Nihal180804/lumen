const { contextBridge } = require('electron');

// The RAG server's base URL is passed in as a launch argument by main.js
// (the port is chosen dynamically to avoid conflicts). Expose it to the
// renderer so the React app knows where to send API calls.
function readRagBase() {
  const arg = process.argv.find((a) => a.startsWith('--rag-base='));
  return arg ? arg.replace('--rag-base=', '') : 'http://localhost:5001';
}

contextBridge.exposeInMainWorld('bookshelf', {
  ragBase: readRagBase(),
  platform: process.platform,
  isDesktop: true,
});
