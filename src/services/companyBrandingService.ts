import { apiClient } from './apiClient';

export interface CompanyBranding {
  company_id: string;
  name: string;
  display_name?: string | null;
  brand_name: string;
  logo_url?: string | null;
  has_logo: boolean;
  accent_color: string;
  branding_updated_at?: string | null;
  uploads_enabled: boolean;
  configured?: boolean;
  writes_enabled?: boolean;
}

export interface CompanyBrandingUpdate {
  display_name?: string | null;
  accent_color?: string | null;
}

export interface CompanyBrandingAdapter {
  getBranding: () => Promise<CompanyBranding>;
  updateBranding: (body: CompanyBrandingUpdate) => Promise<CompanyBranding>;
  uploadLogo: (blob: Blob) => Promise<CompanyBranding>;
  removeLogo: () => Promise<CompanyBranding>;
}

async function uploadLogoAt(endpoint: string, blob: Blob): Promise<CompanyBranding> {
  const formData = new FormData();
  formData.append('file', blob, 'logo.png');
  return apiClient.upload<CompanyBranding>(endpoint, formData);
}

export const companyBrandingService: CompanyBrandingAdapter = {
  getBranding() {
    return apiClient.get<CompanyBranding>('/company/branding');
  },
  updateBranding(body) {
    return apiClient.patch<CompanyBranding>('/company/branding', body);
  },
  uploadLogo(blob) {
    return uploadLogoAt('/company/branding/logo', blob);
  },
  removeLogo() {
    return apiClient.delete<CompanyBranding>('/company/branding/logo');
  },
};

export function ownerBrandingAdapter(companyId: string): CompanyBrandingAdapter {
  const base = `/owner/companies/${companyId}/branding`;
  return {
    getBranding() {
      return apiClient.get<CompanyBranding>(base);
    },
    updateBranding(body) {
      return apiClient.patch<CompanyBranding>(base, body);
    },
    uploadLogo(blob) {
      return uploadLogoAt(`${base}/logo`, blob);
    },
    removeLogo() {
      return apiClient.delete<CompanyBranding>(`${base}/logo`);
    },
  };
}

export function notifyBrandingUpdated() {
  try {
    const channel = new BroadcastChannel('reamarc_branding');
    channel.postMessage({ type: 'branding_updated' });
    channel.close();
  } catch {
    // BroadcastChannel may be unavailable.
  }
}
