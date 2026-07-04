import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cesium from 'vite-plugin-cesium'

// https://vitejs.dev/config/
export default defineConfig({
  // vite-plugin-cesium bundles the npm `cesium` package: sets CESIUM_BASE_URL,
  // copies Cesium's static assets (Assets/Workers/ThirdParty/Widgets) into the
  // build, and injects widgets.css — replacing the old CDN <script>/<link>.
  plugins: [react(), cesium()],
})
