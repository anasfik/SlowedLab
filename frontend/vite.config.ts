/**
 * Frontend Configuration - TypeScript
 * Optimized for SEO with performance enhancements
 */

import react from "@vitejs/plugin-react";
import path from "path";

export default {
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@components": path.resolve(__dirname, "./src/components"),
      "@services": path.resolve(__dirname, "./src/services"),
      "@utils": path.resolve(__dirname, "./src/utils"),
      "@styles": path.resolve(__dirname, "./src/styles"),
    },
  },
  build: {
    target: "ES2020",
    minify: "terser",
    sourcemap: false,
    outDir: "build",
    // SEO-friendly optimizations
    rollupOptions: {
      output: {
        // Optimize chunk splitting for better caching
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          "webaudio-vendor": [],
        },
      },
    },
    // Improve build performance and reduce bundle size
    reportCompressedSize: true,
    chunkSizeWarningLimit: 500,
  },
  server: {
    port: 3001,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  // Performance optimization for SEO
  define: {
    __APP_VERSION__: JSON.stringify("1.0.0"),
  },
};
