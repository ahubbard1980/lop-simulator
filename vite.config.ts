import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // "Web Design Elements" is a scratch folder of raw source assets
      // (not imported by the app — finished ornaments get copied into
      // public/ as needed), and dropping large freshly-generated images in
      // there has repeatedly crashed the dev server with an EBUSY error
      // when Vite's watcher tries to stat a file that's still mid-write.
      // It doesn't need to be watched at all.
      ignored: ['**/Web Design Elements/**'],
    },
  },
})
