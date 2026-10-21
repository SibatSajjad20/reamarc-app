import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/services/apiClient';
import {
  companyBrandingService,
  notifyBrandingUpdated,
  type CompanyBranding,
  type CompanyBrandingAdapter,
} from '@/services/companyBrandingService';
import { AvatarCropModal } from '../AvatarCropModal';
import { SettingsCard } from '../SettingsCard';
import { StickySaveBar } from '../StickySaveBar';
import { BrandMark } from '@/components/ui/BrandMark';
import { applyAccent } from '@/context/BrandingProvider';
import {
  ACCENT_SWATCHES,
  contrastAgainstWhite,
  initialsOf,
  normalizeHexInput,
} from '@/utils/branding';
import { cn } from '@/lib/utils';

interface CompanyBrandingFormProps {
  adapter?: CompanyBrandingAdapter;
  readOnly?: boolean;
  onSaved?: (branding: CompanyBranding) => void;
  variant?: 'page' | 'drawer';
}

const LOGO_HELP = "PNG, JPG or WebP, up to 2 MB, at least 128 × 128 px. SVG isn't accepted.";

function apiMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError && err.message) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function BrandingRow({
  variant,
  title,
  description,
  children,
}: {
  variant: 'page' | 'drawer';
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const isDrawer = variant === 'drawer';
  return (
    <div
      className={cn(
        'min-w-0 py-5',
        isDrawer ? 'flex flex-col gap-3' : 'grid grid-cols-1 md:grid-cols-[232px_1fr] gap-6'
      )}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        <p
          className={cn(
            'text-xs text-fg-muted mt-1 leading-relaxed',
            isDrawer && 'break-words'
          )}
        >
          {description}
        </p>
      </div>
      <div className="min-w-0 max-w-full">{children}</div>
    </div>
  );
}

export const CompanyBrandingForm: React.FC<CompanyBrandingFormProps> = ({
  adapter = companyBrandingService,
  readOnly = false,
  onSaved,
  variant = 'page',
}) => {
  const { user, refreshUser, updateUser } = useAuth();
  const { addToast } = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);

  const [branding, setBranding] = useState<CompanyBranding | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [accentColor, setAccentColor] = useState('#6847E0');
  const [hexDraft, setHexDraft] = useState('#6847E0');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  const hydrate = useCallback((data: CompanyBranding) => {
    setBranding(data);
    setDisplayName(data.display_name || '');
    setAccentColor(data.accent_color);
    setHexDraft(data.accent_color);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await adapter.getBranding();
        if (!cancelled) {
          setError(null);
          hydrate(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(apiMessage(err, 'Could not load branding.'));
          if (user?.company) {
            setDisplayName(user.company.display_name || '');
            const accent = user.company.accent_color || '#6847E0';
            setAccentColor(accent);
            setHexDraft(accent);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adapter, hydrate]);

  const dirty = useMemo(() => {
    if (!branding) return false;
    return displayName.trim() !== (branding.display_name || '') || accentColor.toUpperCase() !== branding.accent_color.toUpperCase();
  }, [accentColor, branding, displayName]);

  const contrast = contrastAgainstWhite(accentColor);
  const brandPreview = displayName.trim() || branding?.name || user?.company?.name || 'Reamarc';
  const disabled = readOnly || user?.read_only;
  const pickerValue = /^#[0-9a-fA-F]{6}$/.test(accentColor)
    ? accentColor
    : /^#[0-9a-fA-F]{3}$/.test(accentColor)
      ? `#${accentColor[1]}${accentColor[1]}${accentColor[2]}${accentColor[2]}${accentColor[3]}${accentColor[3]}`
      : '#6847E0';
  useEffect(() => {
    if (!accentColor) return;
    applyAccent(accentColor);
  }, [accentColor]);

  const applyLocalUser = (data: CompanyBranding) => {
    if (!user) return;
    const nextCompany = {
      ...(user.company || {}),
      id: data.company_id,
      name: data.name,
      display_name: data.display_name,
      brand_name: data.brand_name,
      logo_url: data.logo_url,
      accent_color: data.accent_color,
    };
    const companies = (user.companies || []).map((item) =>
      item.id === data.company_id
        ? {
            ...item,
            name: data.name,
            display_name: data.display_name,
            brand_name: data.brand_name,
            logo_url: data.logo_url,
            accent_color: data.accent_color,
          }
        : item
    );
    updateUser({ company: nextCompany, companies });
    notifyBrandingUpdated();
    void refreshUser();
    onSaved?.(data);
  };

  const setAccent = (value: string) => {
    const next = normalizeHexInput(value).toUpperCase();
    setAccentColor(next);
    setHexDraft(next);
  };

  const handleFile = (file: File) => {
    if (disabled) return;
    if (!branding?.uploads_enabled) {
      setError("Logo uploads aren't set up on this server yet.");
      return;
    }
    if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
      setError("SVG isn't accepted. Export your logo as PNG.");
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('PNG, JPG or WebP only.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo must be 2 MB or smaller.');
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      if (img.width < 128 || img.height < 128) {
        URL.revokeObjectURL(url);
        setError('Logo must be at least 128 × 128 px.');
        return;
      }
      setError(null);
      setCropSrc(url);
      setCropOpen(true);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Couldn't read that image.");
    };
    img.src = url;
  };

  const handleCropComplete = async (blob: Blob) => {
    setUploading(true);
    try {
      const data = await adapter.uploadLogo(blob);
      hydrate(data);
      applyLocalUser(data);
      setCropOpen(false);
      if (cropSrc) URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
      addToast('Logo updated', 'Your company logo is now live.', 'success');
    } catch (err) {
      setError(apiMessage(err, "Couldn't upload the logo."));
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    const ok = await confirm({
      title: 'Remove logo?',
      description: 'The sidebar will show your company initials instead.',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    try {
      const data = await adapter.removeLogo();
      hydrate(data);
      applyLocalUser(data);
      addToast('Logo removed', 'Initials will show until you upload a new logo.', 'success');
    } catch (err) {
      setError(apiMessage(err, "Couldn't remove the logo."));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = await adapter.updateBranding({
        display_name: displayName,
        accent_color: accentColor,
      });
      hydrate(data);
      applyLocalUser(data);
      addToast('Branding saved', 'Your company look is updated.', 'success');
    } catch (err) {
      setError(apiMessage(err, "Couldn't save branding."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-fg-muted">Loading branding…</div>;
  }

  const isDrawer = variant === 'drawer';
  const logoFileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      className="hidden"
      disabled={disabled || !branding?.uploads_enabled}
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) handleFile(file);
      }}
    />
  );
  const logoButtons = (
    <div className="flex flex-wrap gap-2 min-w-0">
      {logoFileInput}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled || !branding?.uploads_enabled}
        onClick={() => fileRef.current?.click()}
      >
        {branding?.has_logo ? 'Replace logo' : 'Upload logo'}
      </Button>
      {branding?.has_logo && (
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => void handleRemoveLogo()}>
          Remove
        </Button>
      )}
    </div>
  );
  const logoHelp = (
    <>
      <p className={cn('text-xs text-fg-muted', isDrawer && 'break-words max-w-full')}>{LOGO_HELP}</p>
      {!branding?.uploads_enabled && (
        <p className={cn('text-xs text-warning-fg', isDrawer && 'break-words max-w-full')}>
          Logo uploads aren't set up on this server yet.
        </p>
      )}
    </>
  );
  const displayNameHelp = (
    <p className={cn('text-xs text-fg-muted mt-2', isDrawer && 'break-words max-w-full')}>
      Shown in the sidebar, company switcher, browser tab and exports. Leave blank to use the registered name{' '}
      <span className="font-semibold text-fg">{branding?.name || user?.company?.name}</span>.
    </p>
  );
  const accentControls = (
    <div className="space-y-3 min-w-0 max-w-full">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        {ACCENT_SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            disabled={disabled}
            aria-label={`Accent ${swatch}`}
            onClick={() => setAccent(swatch)}
            className={cn(
              'w-8 h-8 rounded-full border-2 transition-transform',
              isDrawer && 'shrink-0',
              accentColor.toUpperCase() === swatch ? 'border-fg scale-105' : 'border-transparent'
            )}
            style={{ backgroundColor: swatch }}
          />
        ))}
        <label className="relative w-8 h-8 rounded-full border border-border overflow-hidden cursor-pointer shrink-0">
          <span className="sr-only">Pick a custom accent colour</span>
          <input
            type="color"
            disabled={disabled}
            value={pickerValue}
            onChange={(e) => setAccent(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <span className="block h-full w-full" style={{ backgroundColor: pickerValue }} />
        </label>
        <Input
          value={hexDraft}
          disabled={disabled}
          className={cn('w-[108px]', isDrawer && 'max-w-full min-w-0')}
          onChange={(e) => {
            const next = normalizeHexInput(e.target.value);
            setHexDraft(next);
            if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(next)) {
              setAccentColor(next.toUpperCase());
            }
          }}
        />
      </div>
      {contrast != null && contrast >= 4.5 && (
        <p className="text-xs text-success-fg flex items-center gap-1.5">
          <Check size={14} /> Contrast with white text {contrast.toFixed(1)}:1. Buttons and badges stay readable.
        </p>
      )}
      {contrast != null && contrast >= 3 && contrast < 4.5 && (
        <p className="text-xs text-warning-fg">Text on buttons may be harder to read.</p>
      )}
      {contrast != null && contrast < 3 && (
        <p className="text-xs text-danger-fg">This colour doesn't have enough contrast with white button text.</p>
      )}
      <p className={cn('text-xs text-fg-muted', isDrawer && 'break-words max-w-full')}>
        Used for buttons, links, active menu items and charts for everyone in this company.
      </p>
    </div>
  );
  const previewSamples = (
    <>
      <div className="rounded-lg border border-border bg-surface p-3 space-y-3 min-w-0 max-w-full">
        <div className="flex items-center gap-2 min-w-0">
          <BrandMark
            size={28}
            logoUrl={branding?.logo_url}
            initial={initialsOf(brandPreview)}
            accentColor={accentColor}
          />
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate">{brandPreview}</div>
            <div className="text-[10px] text-fg-muted">Admin</div>
          </div>
        </div>
        <div
          className="text-xs font-medium rounded-md px-2 py-1.5"
          style={{ backgroundColor: `${accentColor}22`, color: accentColor }}
        >
          Dashboard
        </div>
        <div className="text-xs text-fg-muted px-2">Attendance</div>
      </div>
      <div className="space-y-3 min-w-0 max-w-full">
        <div>
          <div className="text-sm font-semibold">Good morning, Sample User</div>
          <div className="text-xs text-fg-muted break-words">Browser tab: {brandPreview}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <button
            type="button"
            className="h-7 px-2.5 rounded-md text-xs font-medium text-white border shadow-xs"
            style={{ backgroundColor: accentColor, borderColor: accentColor }}
          >
            Check in
          </button>
          {!branding?.has_logo && (
            <span className="text-xs text-fg-muted break-words min-w-0">
              No logo? The sidebar shows the initials {initialsOf(brandPreview)}
            </span>
          )}
        </div>
      </div>
    </>
  );

  const fields = (
    <div className={cn('divide-y divide-border', !isDrawer && '-my-1')}>
      <BrandingRow
        variant={variant}
        title="Logo"
        description="Square mark shown in the sidebar, company switcher and browser tab."
      >
        {isDrawer ? (
          <div className="min-w-0 max-w-full space-y-3">
            <div data-testid="branding-logo-row" className="flex items-center gap-3 flex-wrap min-w-0">
              <BrandMark
                size={56}
                logoUrl={branding?.logo_url}
                initial={initialsOf(brandPreview)}
                accentColor={accentColor}
                className="rounded-xl border border-border shrink-0"
              />
              {logoButtons}
            </div>
            {logoHelp}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
            <BrandMark
              size={80}
              logoUrl={branding?.logo_url}
              initial={initialsOf(brandPreview)}
              accentColor={accentColor}
              className="rounded-xl border border-border"
            />
            <div className="min-w-0 space-y-2">
              {logoButtons}
              {logoHelp}
            </div>
          </div>
        )}
      </BrandingRow>

      <BrandingRow variant={variant} title="Display name" description="The name your team sees. Optional.">
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={branding?.name || user?.company?.name}
          disabled={disabled}
          maxLength={60}
          className={cn(isDrawer && 'max-w-full min-w-0')}
        />
        {displayNameHelp}
      </BrandingRow>

      <BrandingRow variant={variant} title="Accent colour" description="Brand colour for the whole app.">
        {accentControls}
      </BrandingRow>

      <BrandingRow variant={variant} title="Preview" description="What your team will see after saving.">
        <div
          className={cn(
            'rounded-xl border border-border bg-subtle/60 p-4 min-w-0 max-w-full',
            isDrawer ? 'flex flex-col gap-4' : 'grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4'
          )}
        >
          {previewSamples}
        </div>
      </BrandingRow>
    </div>
  );

  return (
    <div className={cn('min-w-0 max-w-full', isDrawer ? 'flex flex-col' : 'space-y-6')}>
      {disabled && (
        <p className="text-xs text-fg-muted bg-subtle border border-border rounded-lg px-3 py-2">
          Read-only owner session.
        </p>
      )}

      {isDrawer ? fields : <SettingsCard>{fields}</SettingsCard>}

      {error && <p className={cn('text-sm text-danger-fg', isDrawer && 'break-words px-0 py-2')}>{error}</p>}

      {isDrawer ? (
        dirty &&
        !disabled && (
          <div className="sticky bottom-0 border-t bg-surface p-4 flex justify-end gap-2 min-w-0">
            <Button type="button" variant="secondary" size="sm" onClick={() => branding && hydrate(branding)} disabled={saving}>
              Discard
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={() => void handleSave()} loading={saving}>
              Save changes
            </Button>
          </div>
        )
      ) : (
        <StickySaveBar
          isDirty={dirty && !disabled}
          isSaving={saving}
          onDiscard={() => branding && hydrate(branding)}
          onSave={() => void handleSave()}
          errorMessage={error}
        />
      )}

      <AvatarCropModal
        isOpen={cropOpen}
        imageSrc={cropSrc}
        isUploading={uploading}
        cropShape="rect"
        allowFit
        outputType="image/png"
        title="Position logo"
        description="You can zoom out to fit a wide logo. Transparent padding is kept."
        confirmLabel="Save logo"
        onClose={() => {
          if (uploading) return;
          setCropOpen(false);
          if (cropSrc) URL.revokeObjectURL(cropSrc);
          setCropSrc(null);
        }}
        onCropComplete={handleCropComplete}
      />
    </div>
  );
};
