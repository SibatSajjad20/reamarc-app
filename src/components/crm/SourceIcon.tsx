import React from 'react';
import { Globe, PenLine, Users, Megaphone, Mail } from 'lucide-react';
import {
  MetaIcon,
  GoogleIcon,
  FacebookIcon,
  InstagramIcon,
  WhatsAppIcon,
  WordPressIcon,
  LinkedInIcon,
  TikTokIcon,
} from '../ui/brand-icons';

type Kind = 'brand' | 'glyph';
interface Entry {
  test: (s: string) => boolean;
  kind: Kind;
  render: () => React.ReactNode;
}

const glyph = (Icon: React.ComponentType<{ className?: string }>) => () => <Icon className="w-3.5 h-3.5" />;

// Order matters: specific sources before generic ones ("wordpress" before "web").
const ENTRIES: Entry[] = [
  { test: (s) => s.includes('instagram'), kind: 'brand', render: () => <InstagramIcon size={14} variant="brand" /> },
  { test: (s) => s.includes('facebook') || s === 'fb', kind: 'brand', render: () => <FacebookIcon size={14} variant="brand" /> },
  { test: (s) => s.includes('meta'), kind: 'brand', render: () => <MetaIcon size={14} variant="brand" /> },
  { test: (s) => s.includes('whatsapp') || s === 'wa', kind: 'brand', render: () => <WhatsAppIcon size={14} variant="brand" /> },
  { test: (s) => s.includes('wordpress') || s === 'wp' || s.includes('elementor'), kind: 'brand', render: () => <WordPressIcon size={14} variant="brand" /> },
  { test: (s) => s.includes('linkedin'), kind: 'brand', render: () => <LinkedInIcon size={14} variant="brand" /> },
  { test: (s) => s.includes('tiktok'), kind: 'brand', render: () => <TikTokIcon size={14} variant="brand" /> },
  { test: (s) => s.includes('google'), kind: 'brand', render: () => <GoogleIcon size={14} variant="brand" /> },
  { test: (s) => s.includes('website') || s.includes('web') || s.includes('form'), kind: 'glyph', render: glyph(Globe) },
  { test: (s) => s.includes('manual'), kind: 'glyph', render: glyph(PenLine) },
  { test: (s) => s.includes('referral') || s.includes('refer'), kind: 'glyph', render: glyph(Users) },
  { test: (s) => s.includes('email') || s.includes('mail'), kind: 'glyph', render: glyph(Mail) },
  { test: (s) => s.includes('ads') || s.includes('campaign'), kind: 'glyph', render: glyph(Megaphone) },
];

export function sourceIconKind(source?: string | null): Kind | 'text' | null {
  if (!source) return null;
  const s = source.toLowerCase().trim();
  const hit = ENTRIES.find((e) => e.test(s));
  return hit ? hit.kind : 'text';
}

/** Small logo for a lead's source, shared by the board and the lead drawer. */
export function SourceIcon({ source }: { source?: string | null }) {
  if (!source) return null;
  const s = source.toLowerCase().trim();
  const hit = ENTRIES.find((e) => e.test(s));
  const label = source.charAt(0).toUpperCase() + source.slice(1);
  if (!hit) {
    return (
      <span className="text-xs text-fg-muted uppercase font-medium" title={label}>
        {source.slice(0, 3)}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center ${hit.kind === 'glyph' ? 'text-fg-muted' : ''}`}
      title={label}
      aria-label={label}
      data-source-icon={hit.kind}
    >
      {hit.render()}
    </span>
  );
}

export default SourceIcon;
