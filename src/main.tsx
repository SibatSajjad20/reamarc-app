import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const globalProcess = typeof globalThis !== 'undefined' ? (globalThis as any).process : undefined;
const envApiUrl =
  globalProcess?.env?.NEXT_PUBLIC_API_URL ||
  (import.meta as any).env?.NEXT_PUBLIC_API_URL ||
  (import.meta as any).env?.VITE_API_URL;

if (!envApiUrl && !(import.meta as any).env?.DEV) {
  console.warn(
    '⚠️ [Reamarc AI] NEXT_PUBLIC_API_URL is not defined in environment variables. Defaulting to http://localhost:8000/api/v1'
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
