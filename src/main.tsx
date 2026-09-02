import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import './index.css'
import App from './App.tsx'

const globalProcess = typeof globalThis !== 'undefined' ? (globalThis as any).process : undefined;
const envApiUrl =
  globalProcess?.env?.NEXT_PUBLIC_API_URL ||
  (import.meta as any).env?.NEXT_PUBLIC_API_URL ||
  (import.meta as any).env?.VITE_API_URL;

if (!envApiUrl && !(import.meta as any).env?.DEV) {
  throw new Error(
    '[Reamarc AI] VITE_API_URL / NEXT_PUBLIC_API_URL is required in production. Refusing to start with a localhost API fallback.'
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

