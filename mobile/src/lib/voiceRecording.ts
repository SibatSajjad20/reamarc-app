import { api } from './api';
import {
  VOICE_BIT_RATE,
  VOICE_CHANNELS,
  VOICE_SAMPLE_RATE,
  VOICE_UPLOAD_NAME,
  VOICE_UPLOAD_TYPE,
  buildExpoAudioRecordingOptions,
  isDeletableCacheUri,
} from './voiceLimits';

export interface VoiceTaskConfidence {
  status: 'matched' | 'needs_selection' | 'unassigned';
  ambiguous_candidates: Array<{
    id: string;
    name: string;
    department?: string;
    role?: string;
  }>;
}

export interface VoiceTaskProposal {
  title: string;
  description: string;
  assignee_id: string | null;
  assignee_name: string | null;
  watcher_ids?: string[];
  watcher_names?: string[];
  company_id?: string | null;
  company_name?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  start_date?: string | null;
  due_date: string | null;
  due_time: string | null;
  estimate_hours?: number | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  checklist: Array<{ text: string }>;
  /** Collective draft: main task owned by a lead plus sub-tasks. Always confirmed by the user. */
  is_collective?: boolean;
  subtasks?: VoiceSubtaskProposal[];
}

export interface VoiceSubtaskProposal {
  title: string;
  description?: string;
  assignee_id: string | null;
  assignee_name?: string | null;
  assignee_status?: 'matched' | 'needs_selection' | 'unassigned';
  due_date?: string | null;
  estimate_hours?: number | null;
}

export interface VoiceTaskParseResponse {
  transcript: string;
  task: VoiceTaskProposal;
  confidence: VoiceTaskConfidence;
}

let activeRecording: any = null;

/**
 * Safely check and load native audio library.
 * Modern Expo SDK 58 uses expo-audio.
 * Guards against crashing standalone APKs when native module is missing.
 */
export function getAudioLibrary(): { type: 'expo-audio'; lib: any } | null {
  try {
    const g = globalThis as any;
    const hasNativeExpoAudio = Boolean(
      g?.expo?.modules?.ExpoAudio ||
      g?.ExpoModules?.ExpoAudio ||
      g?.nativeExpoModules?.ExpoAudio
    );
    if (hasNativeExpoAudio) {
      const ExpoAudio = require('expo-audio');
      if (ExpoAudio && (ExpoAudio.AudioModule || ExpoAudio.useAudioRecorder)) {
        return { type: 'expo-audio', lib: ExpoAudio };
      }
    }
  } catch {
    /* expo-audio native module not linked or failed to load */
  }

  return null;
}

export function isAudioRecordingAvailable(): boolean {
  return getAudioLibrary() !== null;
}

export async function requestMicrophonePermission(): Promise<boolean> {
  const mod = getAudioLibrary();
  if (!mod) return false;

  try {
    if (mod.type === 'expo-audio') {
      const { requestRecordingPermissionsAsync } = mod.lib;
      if (typeof requestRecordingPermissionsAsync === 'function') {
        const res = await requestRecordingPermissionsAsync();
        return res?.granted === true;
      }
    }
  } catch {
    /* permission request failed; treated as denied */
  }
  return false;
}

export async function startVoiceRecording(): Promise<any> {
  const mod = getAudioLibrary();
  if (!mod) {
    throw new Error('Native audio recording module is not available in this build.');
  }

  const hasPerm = await requestMicrophonePermission();
  if (!hasPerm) {
    throw new Error('Microphone permission is required to record voice commands.');
  }

  // Cancel any existing recording
  await cancelVoiceRecording().catch(() => {});

  // 1. expo-audio (Modern Expo SDK 58)
  if (mod.type === 'expo-audio') {
    const { AudioModule } = mod.lib;
    if (!AudioModule || !AudioModule.AudioRecorder) {
      throw new Error('ExpoAudio native recorder is not available.');
    }

    if (typeof AudioModule.setAudioModeAsync === 'function') {
      await AudioModule.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      }).catch(() => {});
    }

    // Speech-sized recording: 16 kHz mono ~32 kbps (not the 44.1 kHz stereo HIGH_QUALITY preset).
    // expo-audio flattens the per-platform keys (android.audioSource etc.) inside prepareToRecordAsync(options).
    const options = buildExpoAudioRecordingOptions(mod.lib);
    const recorder = new AudioModule.AudioRecorder(options);
    if (typeof recorder.prepareToRecordAsync === 'function') {
      await recorder.prepareToRecordAsync(options);
    }
    recorder.record();
    activeRecording = { type: 'expo-audio', rec: recorder };
    return activeRecording;
  }

  throw new Error('No supported audio recording driver found.');
}

export async function stopVoiceRecording(): Promise<{ uri: string; durationMillis: number }> {
  if (!activeRecording) {
    throw new Error('No active voice recording to stop.');
  }

  const current = activeRecording;
  activeRecording = null;

  if (current.type === 'expo-audio') {
    await current.rec.stop();
    const uri = current.rec.uri || current.rec.url;
    if (!uri) throw new Error('Failed to retrieve recording audio file.');
    const duration = current.rec.currentTime ? current.rec.currentTime * 1000 : 0;
    return { uri, durationMillis: duration };
  }

  throw new Error('Unsupported recorder.');
}

export async function cancelVoiceRecording(): Promise<void> {
  if (activeRecording) {
    const current = activeRecording;
    activeRecording = null;
    let uri: string | undefined;
    try {
      if (current.type === 'expo-audio') {
        await current.rec.stop().catch(() => {});
        uri = current.rec.uri || current.rec.url;
      }
    } catch {
      /* ignore */
    }
    await deleteRecordingFile(uri);
  }
}

function getFileSystem(): { File?: any; Paths?: any; legacy?: any } {
  const out: { File?: any; Paths?: any; legacy?: any } = {};
  try {
    const fs = require('expo-file-system');
    out.File = fs?.File;
    out.Paths = fs?.Paths;
  } catch {
    /* not available */
  }
  try {
    out.legacy = require('expo-file-system/legacy');
  } catch {
    /* not available */
  }
  return out;
}

function getCacheDir(fs: { Paths?: any; legacy?: any }): string | null {
  const modern = fs.Paths?.cache?.uri;
  if (typeof modern === 'string' && modern) return modern;
  const legacy = fs.legacy?.cacheDirectory;
  return typeof legacy === 'string' && legacy ? legacy : null;
}

/** Deletes a recording from the app cache. Never throws; ignores paths outside the cache folder. */
export async function deleteRecordingFile(uri?: string | null): Promise<void> {
  if (!uri) return;
  const fs = getFileSystem();
  if (!isDeletableCacheUri(uri, getCacheDir(fs))) return;
  try {
    if (fs.File) {
      const file = new fs.File(uri);
      if (file.exists !== false && typeof file.delete === 'function') {
        file.delete();
        return;
      }
    }
  } catch {
    /* fall through to legacy */
  }
  try {
    if (fs.legacy && typeof fs.legacy.deleteAsync === 'function') {
      await fs.legacy.deleteAsync(uri, { idempotent: true });
    }
  } catch {
    /* ignore */
  }
}

/** Size of a local recording in bytes, or null if it cannot be read. */
export async function getRecordingFileSize(uri: string): Promise<number | null> {
  const fs = getFileSystem();
  try {
    if (fs.File) {
      const size = new fs.File(uri).size;
      if (typeof size === 'number') return size;
    }
  } catch {
    /* fall through */
  }
  try {
    if (fs.legacy && typeof fs.legacy.getInfoAsync === 'function') {
      const info = await fs.legacy.getInfoAsync(uri);
      if (info && typeof info.size === 'number') return info.size;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function parseVoiceTaskAudio(uri: string): Promise<VoiceTaskParseResponse> {
  const fs = getFileSystem();

  // Expo's WinterCG fetch serializer requires a part with .bytes() or a standard Blob.
  // Passing { uri, name, type } throws "Unsupported FormDataPart implementation".
  const audioPart = {
    name: VOICE_UPLOAD_NAME,
    type: VOICE_UPLOAD_TYPE,
    uri,
    bytes: async (): Promise<Uint8Array> => {
      try {
        if (fs.File) {
          const file = new fs.File(uri);
          const raw = await file.bytes();
          if (raw && raw.length > 0) return raw;
        }
      } catch {
        /* fall through to fetch/arrayBuffer */
      }
      const res = await fetch(uri);
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    },
  };

  const form = new FormData();
  form.append('audio', audioPart as any);

  return await api<VoiceTaskParseResponse>('/tasks/voice-parse', {
    method: 'POST',
    body: form,
  });
}

export async function parseVoiceTaskText(text: string): Promise<VoiceTaskParseResponse> {
  return await api<VoiceTaskParseResponse>('/tasks/voice-parse', {
    method: 'POST',
    body: JSON.stringify({
      text: text.trim(),
    }),
  });
}
