import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Cesium from 'cesium'
import App from './App.tsx'

// Cesium now ships in the app bundle (via vite-plugin-cesium) instead of a CDN
// <script>. The map stack still reads `window.Cesium`; publishing the bundled
// package onto that global is a deliberate, temporary bridge so consumers can
// migrate to module imports one at a time (slices 02–03). Removed once the last
// consumer is off the global.
window.Cesium = Cesium

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)