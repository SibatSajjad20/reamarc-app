import React, { useEffect, useState } from 'react';
import {
  Activity,
  Calendar,
  CheckCircle2,
  Code,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Webhook,
  Check,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { StatusPill } from '../../ui/StatusPill';
import { API_BASE_URL } from '../../../services/apiClient';
import { crmService } from '../../../services/crmService';
import { useToast } from '../../../context/ToastContext';
import { useConfirm } from '../../ui/ConfirmProvider';
import type { CrmIngestSource, CrmMetaPage, CrmQueueStats } from '../../../types/crm';

type IngestSubTab = 'sources' | 'meta' | 'scheduler' | 'queue';

export const CrmSettingsIngest: React.FC = () => {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<IngestSubTab>('sources');
  const [sources, setSources] = useState<CrmIngestSource[]>([]);
  const [metaPages, setMetaPages] = useState<CrmMetaPage[]>([]);
  const [queueStats, setQueueStats] = useState<CrmQueueStats | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Webhook source form
  const [name, setName] = useState('WordPress website form');
  const [defaultSource, setDefaultSource] = useState('wordpress');
  const [defaultCampaign, setDefaultCampaign] = useState('');
  const [freshToken, setFreshToken] = useState<{ name: string; path: string; token: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  // Meta page connect form
  const [metaPageId, setMetaPageId] = useState('');
  const [metaPageName, setMetaPageName] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [metaAppSecret, setMetaAppSecret] = useState('');
  const [savingPage, setSavingPage] = useState(false);

  // Scheduler embed state
  const [activeEmbedType, setActiveEmbedType] = useState<'iframe' | 'button' | 'link'>('iframe');
  const [showGuide, setShowGuide] = useState(false);

  // Scheduler configuration settings state
  const [schedulerConfig, setSchedulerConfig] = useState({
    title: 'Digital Services Consultancy Session',
    description: (
      "Hi! thanks for showing interest.\n" +
      "Our upcoming 30-minute meeting will provide an excellent opportunity for us to get better acquainted. " +
      "During our conversation, we'll explore the challenges you're currently encountering and brainstorm ways in which " +
      "we can collaborate effectively to address them and meet your specific requirements.\n" +
      "I'm eagerly looking forward to our discussion. Thanks once again!"
    ),
    host_name: 'Muhammad Faizan Khan',
    host_email: 'faizan@reamarc.com',
    duration_minutes: 30,
    buffer_minutes: 0,
    working_days: [1, 2, 3, 4, 5, 6],
    start_hour: '11:00',
    end_hour: '23:00',
    office_address: 'Reamarc Office, Rawalpindi HQ, Pakistan',
  });
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const effectiveBaseUrl =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : API_BASE_URL;

  const absoluteUrl = (path: string) => {
    if (path.startsWith('http')) return path;
    const base = API_BASE_URL.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
    let suffix = path.startsWith('/') ? path : `/${path}`;
    if (base.endsWith('/api/v1') && suffix.startsWith('/api/v1/')) {
      suffix = suffix.slice('/api/v1'.length);
    }
    return `${base}${suffix}`;
  };

  const copyText = async (text: string, type: 'token' | 'link' | 'embed') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'token') {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
      } else if (type === 'link') {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } else {
        setCopiedEmbed(true);
        setTimeout(() => setCopiedEmbed(false), 2000);
      }
      addToast('Copied to clipboard', 'Snippet copied successfully.', 'info');
    } catch {
      // Fallback
    }
  };

  const loadSources = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await crmService.listIngestSources();
      setSources(data);
    } catch (err: any) {
      setError(err?.message || 'Could not load ingest sources.');
    } finally {
      setLoading(false);
    }
  };

  const loadMetaPages = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await crmService.listMetaPages();
      setMetaPages(data);
    } catch (err: any) {
      setError(err?.message || 'Could not load Meta pages.');
    } finally {
      setLoading(false);
    }
  };

  const loadSchedulerConfig = async () => {
    setLoadingConfig(true);
    try {
      const data = await crmService.getSchedulerSettings();
      if (data && data.title) {
        setSchedulerConfig({
          title: data.title || '',
          description: data.description || '',
          host_name: data.host_name || '',
          host_email: data.host_email || '',
          duration_minutes: data.duration_minutes || 30,
          buffer_minutes: data.buffer_minutes || 0,
          working_days: data.working_days || [1, 2, 3, 4, 5, 6],
          start_hour: data.start_hour || '11:00',
          end_hour: data.end_hour || '23:00',
          office_address: data.office_address || 'Reamarc Office, Rawalpindi HQ, Pakistan',
        });
      }
    } catch {
      // Non-critical fallback to defaults
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleSaveSchedulerSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setError(null);
    try {
      await crmService.updateSchedulerSettings(schedulerConfig);
      addToast('Scheduler updated', 'New booking rules and host details are now live.', 'success');
      setSuccessMsg('Scheduler settings saved!');
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setError(err?.message || 'Could not save scheduler settings.');
    } finally {
      setSavingConfig(false);
    }
  };

  const loadQueueStats = async () => {
    setPolling(true);
    try {
      const data = await crmService.getQueueStats();
      setQueueStats(data);
    } catch {
      // Background poll
    } finally {
      setPolling(false);
    }
  };

  useEffect(() => {
    void loadSources();
    void loadMetaPages();
    void loadSchedulerConfig();
    void loadQueueStats();
  }, []);

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await crmService.createIngestSource({
        name: name.trim(),
        default_source: defaultSource.trim() || 'wordpress',
        default_campaign: defaultCampaign.trim() || null,
      });
      setName('WordPress website form');
      setDefaultCampaign('');
      if (created.token && created.ingest_path) {
        setFreshToken({
          name: created.name,
          path: created.ingest_path,
          token: created.token,
        });
      }
      addToast('Webhook created', `Endpoint for ${created.name} is active.`, 'success');
      await loadSources();
    } catch (err: any) {
      setError(err?.message || 'Could not create webhook source.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSource = async (s: CrmIngestSource) => {
    try {
      await crmService.updateIngestSource(s.id, { enabled: !s.enabled });
      addToast('Status updated', `${s.name} is now ${!s.enabled ? 'active' : 'disabled'}.`, 'info');
      await loadSources();
    } catch (err: any) {
      addToast('Error', err?.message || 'Could not update source.', 'error');
    }
  };

  const handleDeleteSource = async (s: CrmIngestSource) => {
    const ok = await confirm({
      title: `Delete "${s.name}"?`,
      description: 'Connected forms will stop sending leads.',
      confirmLabel: 'Delete source',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await crmService.deleteIngestSource(s.id);
      addToast('Deleted', `Webhook source "${s.name}" deleted.`, 'info');
      await loadSources();
    } catch (err: any) {
      addToast('Error', err?.message || 'Could not delete source.', 'error');
    }
  };

  const handleConnectMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metaPageId.trim() || !metaPageName.trim() || !metaAccessToken.trim()) {
      setError('Page ID, page name, and access token are required.');
      return;
    }
    setSavingPage(true);
    setError(null);
    try {
      await crmService.connectMetaPage({
        page_id: metaPageId.trim(),
        page_name: metaPageName.trim(),
        access_token: metaAccessToken.trim(),
        app_secret: metaAppSecret.trim() || undefined,
      });
      setMetaPageId('');
      setMetaPageName('');
      setMetaAccessToken('');
      setMetaAppSecret('');
      addToast('Meta page connected', `Subscribed to leads for ${metaPageName}.`, 'success');
      await loadMetaPages();
    } catch (err: any) {
      setError(err?.message || 'Could not connect Meta page.');
    } finally {
      setSavingPage(false);
    }
  };

  const handleSyncMeta = async () => {
    setPolling(true);
    try {
      const res = await crmService.pollMetaForms();
      const forms = res.forms || [];
      const created = forms.reduce((n, f) => n + (f.created || 0), 0);
      const duplicates = forms.reduce((n, f) => n + (f.duplicates || 0), 0);
      addToast('Sync completed', `Meta poll: ${created} new leads, ${duplicates} duplicates.`, 'info');
      await loadMetaPages();
    } catch (err: any) {
      addToast('Sync error', err?.message || 'Could not sync Meta page.', 'error');
    } finally {
      setPolling(false);
    }
  };

  const handleDisconnectMeta = async (page: CrmMetaPage) => {
    const ok = await confirm({
      title: `Disconnect "${page.page_name}"?`,
      description: 'Leads will no longer import from this page.',
      confirmLabel: 'Disconnect',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await crmService.disconnectMetaPage(page.page_id);
      addToast('Disconnected', `Disconnected ${page.page_name}.`, 'info');
      await loadMetaPages();
    } catch (err: any) {
      addToast('Error', err?.message || 'Could not disconnect page.', 'error');
    }
  };

  const toggleWorkingDay = (day: number) => {
    setSchedulerConfig((prev) => {
      const exists = prev.working_days.includes(day);
      const nextDays = exists
        ? prev.working_days.filter((d) => d !== day)
        : [...prev.working_days, day].sort();
      return { ...prev, working_days: nextDays };
    });
  };

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-6">
      {/* Top Banner Card */}
      <div className="p-4 rounded-lg bg-surface border border-border flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-accent-soft text-accent flex items-center justify-center shrink-0">
            <Webhook className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-ui font-semibold text-fg">Lead sources</h2>
            <p className="text-small text-fg-muted mt-0.5">
              Connect external lead capture sources: WordPress webhooks, Elementor forms, Meta Ads (Facebook &amp; Instagram), and meeting scheduler.
            </p>
          </div>
        </div>

        {/* Sub-tab switcher */}
        <div className="flex items-center gap-1 p-1 rounded-md bg-subtle border border-border self-start md:self-auto shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('sources')}
            className={`px-3 py-1.5 rounded-sm text-small font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'sources'
                ? 'bg-surface text-fg shadow-xs'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Webhooks</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('meta')}
            className={`px-3 py-1.5 rounded-sm text-small font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'meta'
                ? 'bg-surface text-fg shadow-xs'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Webhook className="w-3.5 h-3.5" />
            <span>Meta Ads</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('scheduler')}
            className={`px-3 py-1.5 rounded-sm text-small font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'scheduler'
                ? 'bg-surface text-fg shadow-xs'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Scheduler embed</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`px-3 py-1.5 rounded-sm text-small font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'queue'
                ? 'bg-surface text-fg shadow-xs'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Queue health</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-danger-bg border border-danger-bd text-small text-danger-fg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-md bg-success-bg border border-success-bd text-small text-success-fg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-success-fg shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* TAB 1: WEBHOOKS & WORDPRESS */}
      {activeTab === 'sources' && (
        <div className="space-y-6">
          {freshToken && (
            <div className="p-4 rounded-lg bg-warning-bg/40 border border-warning-bd text-small space-y-2">
              <div className="flex items-center gap-2 font-semibold text-warning-fg">
                <CheckCircle2 className="w-4 h-4 text-warning-fg" />
                <span>New webhook endpoint ready: {freshToken.name}</span>
              </div>
              <p className="text-fg-muted">
                Copy this endpoint URL and paste it into your WordPress form or automation webhook action:
              </p>
              <div className="flex items-center gap-2 bg-surface p-2 rounded-md border border-border">
                <Input
                  readOnly
                  value={absoluteUrl(freshToken.path)}
                  className="font-mono text-small flex-1 bg-subtle"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => copyText(absoluteUrl(freshToken.path), 'token')}
                  className="shrink-0"
                >
                  {copiedToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedToken ? 'Copied' : 'Copy URL'}</span>
                </Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Active Webhooks */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-ui font-semibold text-fg">
                  Active webhook endpoints
                </h3>
                <span className="text-small text-fg-muted font-numeric">{sources.length} total</span>
              </div>

              {loading ? (
                <div className="p-8 rounded-lg bg-surface border border-border text-center space-y-2">
                  <Loader2 className="w-5 h-5 animate-spin text-accent mx-auto" />
                  <p className="text-small text-fg-muted">Loading webhook sources…</p>
                </div>
              ) : sources.length === 0 ? (
                <div className="p-8 rounded-lg bg-surface border border-dashed border-border text-center space-y-2">
                  <Globe className="w-8 h-8 text-fg-muted mx-auto" />
                  <p className="text-ui font-medium text-fg">No webhook sources configured</p>
                  <p className="text-small text-fg-muted">Create a webhook endpoint to start capturing leads from WordPress.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sources.map((s) => (
                    <div
                      key={s.id}
                      className="p-4 rounded-lg bg-surface border border-border shadow-xs space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ui text-fg">{s.name}</span>
                          <span className="px-2 py-0.5 rounded text-micro font-medium bg-subtle text-fg-muted border border-border uppercase">
                            {s.default_source || 'custom'}
                          </span>
                          <StatusPill
                            variant={s.enabled ? 'success' : 'neutral'}
                            label={s.enabled ? 'Active' : 'Disabled'}
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => void handleToggleSource(s)}
                          >
                            {s.enabled ? 'Disable' : 'Enable'}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleDeleteSource(s)}
                            className="text-fg-muted hover:text-danger-fg"
                            aria-label={`Delete ${s.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Input
                          readOnly
                          value={s.ingest_path ? absoluteUrl(s.ingest_path) : `Token: ${s.token_prefix}…`}
                          className="font-mono text-small flex-1 bg-subtle"
                        />
                        {s.ingest_path && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => copyText(absoluteUrl(s.ingest_path!), 'token')}
                            className="shrink-0"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-caption text-fg-muted pt-0.5">
                        <span className="font-numeric">Received hits: {s.hit_count ?? 0}</span>
                        {s.default_campaign && <span>Default campaign: {s.default_campaign}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Integration Guide Accordion */}
              <div className="rounded-lg border border-border bg-surface overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowGuide(!showGuide)}
                  className="w-full px-4 py-3 flex items-center justify-between text-ui font-medium text-fg hover:bg-hover cursor-pointer transition"
                >
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-accent" />
                    <span>How to connect WordPress (Elementor, WPForms, Contact Form 7)</span>
                  </div>
                  {showGuide ? <ChevronUp className="w-4 h-4 text-fg-muted" /> : <ChevronDown className="w-4 h-4 text-fg-muted" />}
                </button>

                {showGuide && (
                  <div className="p-4 pt-2 border-t border-border text-small text-fg-muted space-y-2.5 leading-relaxed bg-subtle">
                    <p>
                      Reamarc accepts standard HTTP POST payloads in <code className="px-1 py-0.5 rounded bg-surface border border-border text-micro font-mono">application/json</code>, <code className="px-1 py-0.5 rounded bg-surface border border-border text-micro font-mono">multipart/form-data</code>, and <code className="px-1 py-0.5 rounded bg-surface border border-border text-micro font-mono">application/x-www-form-urlencoded</code>.
                    </p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><strong>Elementor Pro Forms:</strong> In Form Actions After Submit, add <em>Webhook</em> and paste the copied URL above.</li>
                      <li><strong>WPForms:</strong> Enable Webhooks addon and configure a POST request to this URL.</li>
                      <li><strong>Field Mapping:</strong> Fields like <code className="px-1 bg-surface border border-border rounded font-mono">name</code>, <code className="px-1 bg-surface border border-border rounded font-mono">phone</code>, <code className="px-1 bg-surface border border-border rounded font-mono">email</code>, and <code className="px-1 bg-surface border border-border rounded font-mono">company</code> are automatically mapped.</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Create Webhook Form */}
            <div className="lg:col-span-5 space-y-4">
              <h3 className="text-ui font-semibold text-fg">
                New webhook source
              </h3>

              <form
                onSubmit={handleCreateSource}
                className="p-5 rounded-lg bg-surface border border-border shadow-xs space-y-4"
              >
                <div>
                  <label className="text-label text-fg block mb-1.5">
                    Source name
                  </label>
                  <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Website Contact Form"
                    required
                  />
                </div>

                <div>
                  <label className="text-label text-fg block mb-1.5">
                    Default source tag
                  </label>
                  <Input
                    type="text"
                    value={defaultSource}
                    onChange={(e) => setDefaultSource(e.target.value)}
                    placeholder="e.g. wordpress or landing_page"
                    required
                  />
                </div>

                <div>
                  <label className="text-label text-fg block mb-1.5">
                    Default campaign (optional)
                  </label>
                  <Input
                    type="text"
                    value={defaultCampaign}
                    onChange={(e) => setDefaultCampaign(e.target.value)}
                    placeholder="e.g. organic_contact or q3_promo"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={saving}
                  variant="primary"
                  className="w-full"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                  Create webhook endpoint
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: META PAGES (FB/IG LEAD ADS) */}
      {activeTab === 'meta' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Connected Pages */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-ui font-semibold text-fg">
                Connected Meta Facebook &amp; Instagram pages
              </h3>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleSyncMeta()}
                  disabled={polling}
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${polling ? 'animate-spin' : ''}`} />
                  <span>Sync Meta leads</span>
                </Button>
                <span className="text-small text-fg-muted font-numeric">{metaPages.length} connected</span>
              </div>
            </div>

            {loading ? (
              <div className="p-8 rounded-lg bg-surface border border-border text-center space-y-2">
                <Loader2 className="w-5 h-5 animate-spin text-accent mx-auto" />
                <p className="text-small text-fg-muted">Loading Meta pages…</p>
              </div>
            ) : metaPages.length === 0 ? (
              <div className="p-8 rounded-lg bg-surface border border-dashed border-border text-center space-y-2">
                <Webhook className="w-8 h-8 text-fg-muted mx-auto" />
                <p className="text-ui font-medium text-fg">No Meta pages connected</p>
                <p className="text-small text-fg-muted">Connect a Meta Page to auto-import instant forms from Facebook and Instagram.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {metaPages.map((p) => (
                  <div
                    key={p.id}
                    className="p-4 rounded-lg bg-surface border border-border shadow-xs space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-ui text-fg">{p.page_name}</span>
                        <div className="text-caption text-fg-muted font-mono">Page ID: {p.page_id}</div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDisconnectMeta(p)}
                        className="text-fg-muted hover:text-danger-fg"
                        aria-label={`Disconnect ${p.page_name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Connect Page Form */}
          <div className="lg:col-span-5 space-y-4">
            <h3 className="text-ui font-semibold text-fg">
              Connect Meta page
            </h3>

            <form
              onSubmit={handleConnectMeta}
              className="p-5 rounded-lg bg-surface border border-border shadow-xs space-y-4"
            >
              <div>
                <label className="text-label text-fg block mb-1.5">
                  Facebook page name
                </label>
                <Input
                  type="text"
                  value={metaPageName}
                  onChange={(e) => setMetaPageName(e.target.value)}
                  placeholder="e.g. Reamarc Agency"
                  required
                />
              </div>

              <div>
                <label className="text-label text-fg block mb-1.5">
                  Facebook page ID
                </label>
                <Input
                  type="text"
                  value={metaPageId}
                  onChange={(e) => setMetaPageId(e.target.value)}
                  placeholder="e.g. 109847291823"
                  required
                />
              </div>

              <div>
                <label className="text-label text-fg block mb-1.5">
                  Page access token (permanent / long-lived)
                </label>
                <Input
                  type="password"
                  value={metaAccessToken}
                  onChange={(e) => setMetaAccessToken(e.target.value)}
                  placeholder="EAAG..."
                  className="font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-label text-fg block mb-1.5">
                  App secret (optional, for signature verification)
                </label>
                <Input
                  type="password"
                  value={metaAppSecret}
                  onChange={(e) => setMetaAppSecret(e.target.value)}
                  placeholder="App secret from Meta Developers"
                  className="font-mono"
                />
              </div>

              <Button
                type="submit"
                disabled={savingPage}
                variant="primary"
                className="w-full"
              >
                {savingPage ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                Connect page
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: MEETING SCHEDULER & EMBED */}
      {activeTab === 'scheduler' && (
        <div className="space-y-6">
          {/* Public Link Card */}
          <div className="p-4 rounded-lg bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div>
              <div className="text-ui font-semibold text-fg flex items-center gap-2">
                <Calendar className="w-4 h-4 text-accent" />
                <span>Public booking URL</span>
              </div>
              <p className="text-small text-fg-muted mt-0.5">Share this link directly with prospective leads.</p>
            </div>

            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={`${effectiveBaseUrl}/book`}
                className="font-mono text-small bg-subtle w-64"
              />
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => copyText(`${effectiveBaseUrl}/book`, 'link')}
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied' : 'Copy link'}</span>
              </Button>
              <a
                href={`${effectiveBaseUrl}/book`}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-md border border-border hover:bg-hover text-fg-muted transition inline-flex items-center justify-center"
                title="Preview public booking page"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Scheduler Settings Form */}
            <form
              onSubmit={handleSaveSchedulerSettings}
              className="lg:col-span-7 p-5 rounded-lg bg-surface border border-border shadow-xs space-y-4"
            >
              <div className="border-b border-border pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-ui font-semibold text-fg">
                    Meeting scheduler configuration
                  </h3>
                  <p className="text-small text-fg-muted mt-0.5">Set host identity, timings, and location.</p>
                </div>
                {loadingConfig && <Loader2 className="w-4 h-4 animate-spin text-accent" />}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-label text-fg block mb-1">
                    Host name
                  </label>
                  <Input
                    type="text"
                    value={schedulerConfig.host_name}
                    onChange={(e) => setSchedulerConfig({ ...schedulerConfig, host_name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="text-label text-fg block mb-1">
                    Host email
                  </label>
                  <Input
                    type="email"
                    value={schedulerConfig.host_email}
                    onChange={(e) => setSchedulerConfig({ ...schedulerConfig, host_email: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-label text-fg block mb-1">
                  Session title
                </label>
                <Input
                  type="text"
                  value={schedulerConfig.title}
                  onChange={(e) => setSchedulerConfig({ ...schedulerConfig, title: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="text-label text-fg block mb-1">
                  Session description
                </label>
                <Textarea
                  rows={3}
                  value={schedulerConfig.description}
                  onChange={(e) => setSchedulerConfig({ ...schedulerConfig, description: e.target.value })}
                  className="leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-label text-fg block mb-1">
                    Duration (minutes)
                  </label>
                  <select
                    value={schedulerConfig.duration_minutes}
                    onChange={(e) => setSchedulerConfig({ ...schedulerConfig, duration_minutes: Number(e.target.value) })}
                    className="w-full h-8.5 px-2.5 rounded-md border border-border bg-surface text-small text-fg outline-none cursor-pointer focus:border-border-strong"
                  >
                    <option value={15}>15 mins</option>
                    <option value={30}>30 mins</option>
                    <option value={45}>45 mins</option>
                    <option value={60}>60 mins</option>
                  </select>
                </div>
                <div>
                  <label className="text-label text-fg block mb-1">
                    Start hour
                  </label>
                  <Input
                    type="time"
                    value={schedulerConfig.start_hour}
                    onChange={(e) => setSchedulerConfig({ ...schedulerConfig, start_hour: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-label text-fg block mb-1">
                    End hour
                  </label>
                  <Input
                    type="time"
                    value={schedulerConfig.end_hour}
                    onChange={(e) => setSchedulerConfig({ ...schedulerConfig, end_hour: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="text-label text-fg block mb-1.5">
                  Available working days
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_LABELS.map((label, idx) => {
                    const active = schedulerConfig.working_days.includes(idx);
                    return (
                      <button
                        type="button"
                        key={label}
                        onClick={() => toggleWorkingDay(idx)}
                        className={`px-3 py-1 rounded-sm text-small font-medium transition cursor-pointer ${
                          active
                            ? 'bg-accent text-accent-fg'
                            : 'bg-subtle text-fg-muted hover:bg-hover hover:text-fg'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-label text-fg block mb-1">
                  Office address (for in-person meetings)
                </label>
                <Input
                  type="text"
                  value={schedulerConfig.office_address}
                  onChange={(e) => setSchedulerConfig({ ...schedulerConfig, office_address: e.target.value })}
                  placeholder="e.g. Reamarc Office, Rawalpindi HQ, Pakistan"
                />
              </div>

              <Button
                type="submit"
                disabled={savingConfig}
                variant="primary"
              >
                {savingConfig ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                <span>Save scheduler settings</span>
              </Button>
            </form>

            {/* WordPress Embed Snippet Generator */}
            <div className="lg:col-span-5 p-5 rounded-lg bg-surface border border-border shadow-xs space-y-4">
              <div>
                <h3 className="text-ui font-semibold text-fg flex items-center gap-1.5">
                  <Code className="w-3.5 h-3.5 text-accent" />
                  <span>WordPress embed generator</span>
                </h3>
                <p className="text-small text-fg-muted mt-0.5">Compatible with Elementor, Gutenberg, &amp; Divi.</p>
              </div>

              <div className="flex items-center gap-1 p-1 rounded-md bg-subtle border border-border">
                <button
                  type="button"
                  onClick={() => setActiveEmbedType('iframe')}
                  className={`flex-1 py-1 text-caption font-medium rounded-sm transition cursor-pointer ${
                    activeEmbedType === 'iframe'
                      ? 'bg-surface text-fg shadow-xs'
                      : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  iFrame embed
                </button>
                <button
                  type="button"
                  onClick={() => setActiveEmbedType('button')}
                  className={`flex-1 py-1 text-caption font-medium rounded-sm transition cursor-pointer ${
                    activeEmbedType === 'button'
                      ? 'bg-surface text-fg shadow-xs'
                      : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  CTA button
                </button>
                <button
                  type="button"
                  onClick={() => setActiveEmbedType('link')}
                  className={`flex-1 py-1 text-caption font-medium rounded-sm transition cursor-pointer ${
                    activeEmbedType === 'link'
                      ? 'bg-surface text-fg shadow-xs'
                      : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  UTM tracking URL
                </button>
              </div>

              <div className="relative">
                <pre className="p-3 rounded-md bg-subtle text-fg border border-border text-mono font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-56">
                  {activeEmbedType === 'iframe' &&
`<div style="width: 100%; max-width: 920px; margin: 0 auto; overflow: hidden; border-radius: 12px;">
  <iframe 
    src="${effectiveBaseUrl}/book?embed=true" 
    style="width: 100%; height: 750px; border: none; overflow: hidden;"
    loading="lazy"
    title="Reamarc Session Scheduler">
  </iframe>
</div>`}
                  {activeEmbedType === 'button' &&
`<a href="${effectiveBaseUrl}/book" 
   target="_blank" 
   style="display: inline-block; background-color: #6847e0; color: #ffffff; padding: 12px 24px; border-radius: 8px; font-weight: 600; text-decoration: none; font-family: sans-serif;">
   Book session ↗
</a>`}
                  {activeEmbedType === 'link' &&
`${effectiveBaseUrl}/book?utm_source=wordpress&utm_medium=website&utm_campaign=strategy_session`}
                </pre>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const snippet =
                      activeEmbedType === 'iframe'
                        ? `<div style="width: 100%; max-width: 920px; margin: 0 auto; overflow: hidden; border-radius: 12px;">\n  <iframe src="${effectiveBaseUrl}/book?embed=true" style="width: 100%; height: 750px; border: none; overflow: hidden;" loading="lazy" title="Reamarc Session Scheduler"></iframe>\n</div>`
                        : activeEmbedType === 'button'
                        ? `<a href="${effectiveBaseUrl}/book" target="_blank" style="display: inline-block; background-color: #6847e0; color: #ffffff; padding: 12px 24px; border-radius: 8px; font-weight: 600; text-decoration: none; font-family: sans-serif;">Book session ↗</a>`
                        : `${effectiveBaseUrl}/book?utm_source=wordpress&utm_medium=website&utm_campaign=strategy_session`;
                    void copyText(snippet, 'embed');
                  }}
                  className="mt-2 w-full"
                >
                  {copiedEmbed ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                  <span>{copiedEmbed ? 'Snippet copied' : 'Copy code snippet'}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: QUEUE & RELIABILITY */}
      {activeTab === 'queue' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-surface border border-border shadow-xs">
              <span className="text-caption text-fg-muted">Pending tasks</span>
              <div className="text-kpi font-semibold font-numeric text-fg mt-1">
                {queueStats?.pending ?? 0}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-surface border border-border shadow-xs">
              <span className="text-caption text-fg-muted">In processing</span>
              <div className="text-kpi font-semibold font-numeric text-accent mt-1">
                {queueStats?.processing ?? 0}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-surface border border-border shadow-xs">
              <span className="text-caption text-fg-muted">Delivered / completed</span>
              <div className="text-kpi font-semibold font-numeric text-success-fg mt-1">
                {queueStats?.completed ?? 0}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-surface border border-border shadow-xs">
              <span className="text-caption text-fg-muted">Retries / warnings</span>
              <div className="text-kpi font-semibold font-numeric text-warning-fg mt-1">
                {queueStats?.retry ?? 0}
              </div>
            </div>
          </div>

          <div className="p-5 rounded-lg bg-surface border border-border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-ui font-semibold text-fg">Guaranteed delivery SLA</h3>
              <p className="text-small text-fg-muted mt-0.5">
                Incoming leads and webhook events are persisted and automatically retried across 30s, 2m, 10m, 30m, and 1h windows.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void loadQueueStats()}
              disabled={polling}
              className="shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${polling ? 'animate-spin' : ''}`} />
              <span>Refresh queue status</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
