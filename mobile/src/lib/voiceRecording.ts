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
}

export interface VoiceTaskParseResponse {
  transcript: string;
  task: VoiceTaskProposal;
  confidence: VoiceTaskConfidence;
}

let activeRecording: any = null;

/**
 * Safely check and load native audio library.
 * Supports modern expo-audio (SDK 52/58) and legacy expo-av.
 * Guards against crashing standalone APKs when native module is missing.
 */
export function getAudioLibrary(): { type: 'expo-audio' | 'expo-av'; lib: any } | null {
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

  try {
    const g = globalThis as any;
    const hasNativeExpoAv = Boolean(
      g?.expo?.modules?.ExponentAV ||
      g?.ExpoModules?.ExponentAV ||
      g?.nativeExpoModules?.ExponentAV
    );
    if (hasNativeExpoAv) {
      const ExpoAv = require('expo-av');
      if (ExpoAv && ExpoAv.Audio) {
        return { type: 'expo-av', lib: ExpoAv.Audio };
      }
    }
  } catch {
    /* expo-av not available */
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
    if (mod.type === 'expo-av') {
      const { requestPermissionsAsync } = mod.lib;
      if (typeof requestPermissionsAsync === 'function') {
        const res = await requestPermissionsAsync();
        return res?.status === 'granted';
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

  // 1. expo-audio (Modern Expo SDK 52/58)
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

  // 2. expo-av (Legacy fallback)
  if (mod.type === 'expo-av') {
    const Audio = mod.lib;
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync({
      isMeteringEnabled: true,
      android: {
        extension: '.m4a',
        outputFormat: Audio.AndroidOutputFormat?.MPEG_4 ?? 2,
        audioEncoder: Audio.AndroidAudioEncoder?.AAC ?? 3,
        sampleRate: VOICE_SAMPLE_RATE,
        numberOfChannels: VOICE_CHANNELS,
        bitRate: VOICE_BIT_RATE,
      },
      ios: {
        extension: '.m4a',
        audioQuality: Audio.IOSAudioQuality?.MEDIUM ?? 64,
        sampleRate: VOICE_SAMPLE_RATE,
        numberOfChannels: VOICE_CHANNELS,
        bitRate: VOICE_BIT_RATE,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
      web: {
        mimeType: 'audio/webm',
        bitsPerSecond: VOICE_BIT_RATE,
      },
    });

    await recording.startAsync();
    activeRecording = { type: 'expo-av', rec: recording };
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

  if (current.type === 'expo-av') {
    const status = await current.rec.getStatusAsync();
    await current.rec.stopAndUnloadAsync();
    const uri = current.rec.getURI();
    if (!uri) throw new Error('Failed to retrieve recording audio file.');
    return { uri, durationMillis: status.durationMillis || 0 };
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
      } else if (current.type === 'expo-av') {
        await current.rec.stopAndUnloadAsync().catch(() => {});
        uri = current.rec.getURI?.();
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
  // Multipart upload with a fixed name; the server checks size and magic bytes.
  const form = new FormData();
  form.append('audio', { uri, name: VOICE_UPLOAD_NAME, type: VOICE_UPLOAD_TYPE } as any);

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
