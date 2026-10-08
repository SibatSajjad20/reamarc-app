import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './index.css'
import App from './App.tsx'
import { LucideProvider } from 'lucide-react'
import { TooltipProvider } from './components/ui/tooltip'
import { ConfirmProvider } from './components/ui/ConfirmProvider'
import { PrimitivesGallery } from './components/ui/PrimitivesGallery'

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

const isGallery =
  Boolean((import.meta as any).env?.DEV) &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('ui-gallery');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LucideProvider strokeWidth={1.5} size={16} absoluteStrokeWidth={false}>
      <TooltipProvider>
        <ConfirmProvider>
          {isGallery ? <PrimitivesGallery /> : <App />}
        </ConfirmProvider>
      </TooltipProvider>
    </LucideProvider>
  </StrictMode>,
)

