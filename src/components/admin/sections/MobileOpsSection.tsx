import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  Bell,
  RefreshCw,
  Smartphone,
  Unlink,
  Send,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { adminService } from '../../../services/adminService';
import { useToast } from '../../../context/ToastContext';
import { useConfirm } from '../../ui/ConfirmProvider';
import { PageHeader } from '../../ui/PageHeader';
import { Button } from '../../ui/button';
import { StatusPill } from '../../ui/StatusPill';
import { CustomSelect } from '../../ui/CustomSelect';
import {
  TableCard,
  TableToolbar,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
  TableEmptyRow,
} from '../../ui/DataTable';

interface BoundDevice {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  device_name?: string;
  platform: string;
  has_push_token: boolean;
  last_seen?: string;
  created_at?: string;
}

const AppleIcon: React.FC<{ size?: number; className?: string }> = ({ size = 14, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={`shrink-0 ${className}`}>
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.63-.77 1.06-1.85.94-2.93-.93.04-2.03.63-2.69 1.4-.58.67-1.1 1.76-.96 2.82 1.04.08 2.08-.52 2.71-1.29" />
  </svg>
);

const AndroidIcon: React.FC<{ size?: number; className?: string }> = ({ size = 14, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={`shrink-0 ${className}`}>
    <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4116 13.8533 8.125 12 8.125c-1.8533 0-3.5902.2866-5.1368.8247L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396" />
  </svg>
);

export const MobileOpsSection: React.FC = () => {
  const { addToast } = useToast();
  const confirm = useConfirm();

  const [devices, setDevices] = useState<BoundDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Notification form
  const [audience, setAudience] = useState('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [transferring, setTransferring] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await adminService.listMobileDevices();
      setDevices(rows || []);
    } catch (err: any) {
      addToast('Could not load devices', err.message || 'Try again', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleTransfer = async (deviceId: string, userId: string, name?: string) => {
    const targetName = name || 'this device';
    const ok = await confirm({
      title: `Unbind ${targetName}'s phone?`,
      description: "They'll need to sign in again on a new device to bind it.",
      confirmLabel: 'Unbind phone',
      tone: 'danger',
    });
    if (!ok) return;

    setTransferring(deviceId);
    try {
      const res = await adminService.transferMobileDevice(userId, deviceId);
      addToast('Device unbound', res.message, 'success');
      await load();
    } catch (err: any) {
      addToast('Unbind failed', err.message || 'Try again', 'error');
    } finally {
      setTransferring(null);
    }
  };

  const handleBroadcast = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !body.trim()) return;

    setSending(true);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        user_ids: audience === 'all' ? undefined : [audience],
      };
      const res = await adminService.broadcastMobilePush(payload);
      addToast(
        res.in_app ? 'Saved to Alerts' : 'Notification sent',
        res.message,
        res.in_app || res.sent ? 'success' : 'warning',
      );
      setTitle('');
      setBody('');
    } catch (err: any) {
      addToast('Send failed', err.message || 'Try again', 'error');
    } finally {
      setSending(false);
    }
  };

  const filteredDevices = useMemo(() => {
    if (!searchQuery.trim()) return devices;
    const q = searchQuery.toLowerCase();
    return devices.filter((d) =>
      (d.user_name || '').toLowerCase().includes(q) ||
      (d.user_email || '').toLowerCase().includes(q) ||
      (d.device_name || '').toLowerCase().includes(q) ||
      (d.platform || '').toLowerCase().includes(q)
    );
  }, [devices, searchQuery]);

  const audienceOptions = useMemo(() => {
    const opts = [{ value: 'all', label: `All bound phones (${devices.length})` }];
    devices.forEach((d) => {
      opts.push({
        value: d.user_id,
        label: `${d.user_name || d.user_email || 'Member'} (${d.device_name || d.platform || 'Phone'})`,
      });
    });
    return opts;
  }, [devices]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mobile devices and alerts"
        description="Device binding management, push delivery status and custom notification dispatch."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            loading={loading}
            icon={RefreshCw}
          >
            Refresh
          </Button>
        }
      />

      {/* Card "Send a custom notification" */}
      <div className="border border-border rounded-xl bg-surface p-5 space-y-4">
        <div className="flex items-center gap-2 text-fg">
          <Bell className="w-4 h-4 text-accent-text" />
          <h3 className="text-sm font-semibold text-fg">Send a custom notification</h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left: Form */}
          <form onSubmit={handleBroadcast} className="space-y-3.5">
            <div>
              <label className="block text-ui font-medium text-fg mb-1">Audience</label>
              <CustomSelect
                value={audience}
                onChange={setAudience}
                options={audienceOptions}
                placeholder="Select audience"
              />
            </div>

            <div>
              <label className="block text-ui font-medium text-fg mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Meeting in 15 minutes"
                className="w-full h-9 px-3 text-ui bg-surface border border-border rounded-md text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-ui font-medium text-fg mb-1">Message</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Please join the conference room or submit your shift tasks before end of day."
                rows={3}
                className="w-full p-3 text-ui bg-surface border border-border rounded-md text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent resize-none"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={sending}
              disabled={sending || !title.trim() || !body.trim()}
              icon={Send}
            >
              {audience === 'all' ? 'Send to all bound phones' : 'Send notification'}
            </Button>
          </form>

          {/* Right: Neutral Live Preview Card (13px text) */}
          <div className="flex flex-col gap-2">
            <span className="text-caption font-medium uppercase tracking-wider text-fg-muted">
              Live device preview
            </span>
            <div className="border border-border rounded-xl p-4 bg-canvas/70 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-accent flex items-center justify-center text-white text-[10px] font-semibold">
                    R
                  </div>
                  <span className="text-xs font-semibold text-fg uppercase tracking-wider">
                    Reamarc
                  </span>
                </div>
                <span className="text-xs text-fg-faint tabular-nums">Just now</span>
              </div>

              <div className="space-y-1">
                <div className="text-[13px] font-semibold text-fg leading-snug">
                  {title.trim() || 'Notification Title'}
                </div>
                <div className="text-[13px] text-fg-muted leading-relaxed whitespace-pre-wrap">
                  {body.trim() || 'Your notification message preview will render here in real-time as you type.'}
                </div>
              </div>

              <div className="pt-2 border-t border-border flex items-center gap-1.5 text-xs text-fg-faint">
                <CheckCircle2 size={12} className="text-success-fg" />
                <span>Delivered via lock screen push banner and in-app alerts feed</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Card "Bound phones" */}
      <TableCard>
        <TableToolbar className="flex-wrap gap-3">
          <div className="relative min-w-[240px] max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Filter by employee, device or platform..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-ui bg-surface border border-border rounded-md text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
            />
          </div>
          <div className="text-caption text-fg-muted ml-auto tabular-nums">
            {filteredDevices.length} bound {filteredDevices.length === 1 ? 'device' : 'devices'}
          </div>
        </TableToolbar>

        <Table>
          <THead>
            <TR>
              <TH>Member</TH>
              <TH>Device</TH>
              <TH>Platform</TH>
              <TH>Push token</TH>
              <TH>Bound on</TH>
              <TH>Last seen</TH>
              <TH align="right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filteredDevices.length === 0 ? (
              <TableEmptyRow
                colSpan={7}
                message={
                  loading
                    ? 'Loading bound mobile devices...'
                    : 'No registered phones found. Employees bind a phone on first login.'
                }
              />
            ) : (
              filteredDevices.map((d) => {
                const isIos = (d.platform || '').toLowerCase().includes('ios') || (d.platform || '').toLowerCase().includes('apple');
                const isAndroid = (d.platform || '').toLowerCase().includes('android');

                return (
                  <TR key={d.id} className="hover:bg-hover transition-colors">
                    {/* Member */}
                    <TD>
                      <div className="flex flex-col">
                        <span className="font-medium text-fg">
                          {d.user_name || d.user_id}
                        </span>
                        {d.user_email && (
                          <span className="text-caption text-fg-muted">
                            {d.user_email}
                          </span>
                        )}
                      </div>
                    </TD>

                    {/* Device */}
                    <TD className="text-ui text-fg">
                      <div className="flex items-center gap-1.5">
                        <Smartphone size={14} className="text-fg-muted shrink-0" />
                        <span>{d.device_name || 'Phone'}</span>
                      </div>
                    </TD>

                    {/* Platform icon */}
                    <TD>
                      <div className="inline-flex items-center gap-1.5 text-caption font-medium text-fg">
                        {isIos ? (
                          <AppleIcon size={14} className="text-fg" />
                        ) : isAndroid ? (
                          <AndroidIcon size={14} className="text-[#3DDC84]" />
                        ) : (
                          <Smartphone size={14} className="text-fg-muted" />
                        )}
                        <span>{d.platform || 'Unknown'}</span>
                      </div>
                    </TD>

                    {/* Push Token Status */}
                    <TD>
                      <StatusPill
                        variant={d.has_push_token ? 'success' : 'neutral'}
                        label={d.has_push_token ? 'Active' : 'No token'}
                        dot
                      />
                    </TD>

                    {/* Bound On */}
                    <TD className="text-caption text-fg-muted tabular-nums">
                      {d.created_at ? new Date(d.created_at).toLocaleDateString() : '—'}
                    </TD>

                    {/* Last seen */}
                    <TD className="text-caption text-fg-muted tabular-nums">
                      {d.last_seen ? new Date(d.last_seen).toLocaleString() : '—'}
                    </TD>

                    {/* Actions */}
                    <TD align="right">
                      <Button
                        variant="danger-secondary"
                        size="sm"
                        icon={Unlink}
                        loading={transferring === d.id}
                        disabled={transferring === d.id}
                        onClick={() => handleTransfer(d.id, d.user_id, d.user_name)}
                      >
                        Unbind
                      </Button>
                    </TD>
                  </TR>
                );
              })
            )}
          </TBody>
        </Table>
      </TableCard>
    </div>
  );
};
