import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, '.', '');

  // Prioritize system environment variables (process.env) over loaded .env file variables
  // This is crucial for environments where API keys are injected directly into the process
  const apiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || process.env.API_KEY || env.API_KEY || env.VITE_API_KEY;

  return {
    plugins: [react()],
    define: {
      // Expose the API key to the client-side code
      'process.env.GEMINI_API_KEY': JSON.stringify(apiKey),
      // Also expose as API_KEY for backward compatibility if needed
      'process.env.API_KEY': JSON.stringify(apiKey)
    },
    server: {
      port: 3000
    }
  };
});