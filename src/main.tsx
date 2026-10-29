import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { resetStaleClientStorage } from './utils/storageReset'
import { redirectUnknownWorklaneSubdomain } from './utils/worklaneHost'
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './index.css'
import App from './App.tsx'
import { LucideProvider } from 'lucide-react'
import { TooltipProvider } from './components/ui/tooltip'
import { ConfirmProvider } from './components/ui/ConfirmProvider'
import { PrimitivesGallery } from './components/ui/PrimitivesGallery'

resetStaleClientStorage();

const globalProcess = typeof globalThis !== 'undefined' ? (globalThis as any).process : undefined;
const envApiUrl =
  globalProcess?.env?.NEXT_PUBLIC_API_URL ||
  (import.meta as any).env?.NEXT_PUBLIC_API_URL ||
  (import.meta as any).env?.VITE_API_URL;
const forceDirectApi = String((import.meta as any).env?.VITE_API_DIRECT || '') === '1';

// Production browsers call same-origin `/api/v1` (Vercel rewrite). VITE_API_URL is
// only required when forcing a direct backend URL via VITE_API_DIRECT=1.
if (!envApiUrl && !(import.meta as any).env?.DEV && forceDirectApi) {
  throw new Error(
    '[Reamarc] VITE_API_URL / NEXT_PUBLIC_API_URL is required when VITE_API_DIRECT=1. Refusing to start with a localhost API fallback.'
  );
}

const isGallery =
  Boolean((import.meta as any).env?.DEV) &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('ui-gallery');

function removeBootSplash() {
  document.getElementById('boot-splash')?.remove();
}

function mount() {
  removeBootSplash();
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
  );
}

// Unknown company subdomains (hello.oneworklane.com) → apex. Fail-open on API errors.
void redirectUnknownWorklaneSubdomain().then((redirected) => {
  if (!redirected) mount();
});
