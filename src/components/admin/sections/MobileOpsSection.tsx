import React, { useCallback, useEffect, useState } from 'react';
import { Bell, RefreshCw, Smartphone, Unlink } from 'lucide-react';
import { adminService } from '../../../services/adminService';
import { useToast } from '../../../context/ToastContext';

interface BoundDevice {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  device_name?: string;
  platform: string;
  has_push_token: boolean;
  last_seen?: string;
}

export const MobileOpsSection: React.FC = () => {
  const { addToast } = useToast();
  const [devices, setDevices] = useState<BoundDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [transferring, setTransferring] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await adminService.listMobileDevices();
      setDevices(rows);
    } catch (err: any) {
      addToast('Could not load devices', err.message || 'Try again', 'warning');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleTransfer = async (deviceId: string, userId: string, name?: string) => {
    if (!window.confirm(`Unbind ${name || 'this device'}'s phone record so they can log in on a new device?`)) {
      return;
    }
    setTransferring(deviceId);
    try {
      const res = await adminService.transferMobileDevice(userId, deviceId);
      addToast('Device unbound', res.message, 'success');
      await load();
    } catch (err: any) {
      addToast('Transfer failed', err.message || 'Try again', 'warning');
    } finally {
      setTransferring(null);
    }
  };

  const handleBroadcast = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    try {
      const res = await adminService.broadcastMobilePush({ title: title.trim(), body: body.trim() });
      addToast(
        res.in_app ? 'Saved to Alerts' : 'Notification sent',
        res.message,
        res.in_app || res.sent ? 'success' : 'warning',
      );
      setTitle('');
      setBody('');
    } catch (err: any) {
      addToast('Send failed', err.message || 'Try again', 'warning');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Mobile devices & alerts</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Each employee is locked to one phone. Expo Go cannot show lock-screen pushes (SDK 53+).
          Keep Reamarc open on the phone, send from here, then check the Alerts tab — a banner
          appears within a few seconds while the app is open.
        </p>
      </div>

      <form
        onSubmit={handleBroadcast}
        className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-3"
      >
        <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
          <Bell className="w-4 h-4" />
          <h3 className="text-sm font-bold">Send a custom notification</h3>
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Meeting in 15 min"
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Please come to Room 2. Shift ends at 5 today — finish your work before then."
          rows={3}
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={sending || !title.trim() || !body.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold px-4 py-2 disabled:opacity-50"
        >
          Send to all bound phones
        </button>
      </form>

      <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-zinc-500" />
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Bound phones</h3>
          </div>
          <button type="button" onClick={load} className="text-zinc-400 hover:text-zinc-700">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {devices.length === 0 && !loading && (
          <p className="text-sm text-zinc-500">No phones registered yet. Employees bind a device on first mobile login.</p>
        )}
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {devices.map((d) => (
            <li key={d.id} className="py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {d.user_name || d.user_id}
                </p>
                <p className="text-xs text-zinc-500">
                  {d.device_name || 'Phone'} · {d.platform} · {d.has_push_token ? 'push on' : 'no push token'}
                  {d.user_email ? ` · ${d.user_email}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleTransfer(d.id, d.user_id, d.user_name || d.user_id)}
                disabled={transferring === d.id}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:underline"
              >
                <Unlink className="w-3.5 h-3.5" />
                Transfer
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
