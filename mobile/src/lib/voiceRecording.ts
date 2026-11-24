import { api } from './api';

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
 */
export function getAudioLibrary(): { type: 'expo-audio' | 'expo-av'; lib: any } | null {
  try {
    const ExpoAudio = require('expo-audio');
    if (ExpoAudio && (ExpoAudio.AudioModule || ExpoAudio.useAudioRecorder)) {
      return { type: 'expo-audio', lib: ExpoAudio };
    }
  } catch {
    /* expo-audio not available */
  }

  try {
    const ExpoAv = require('expo-av');
    if (ExpoAv && ExpoAv.Audio) {
      return { type: 'expo-av', lib: ExpoAv.Audio };
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
  } catch (err) {
    console.warn('Failed to request microphone permission:', err);
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
    const { AudioModule, RecordingPresets } = mod.lib;
    if (!AudioModule || !AudioModule.AudioRecorder) {
      throw new Error('ExpoAudio native recorder is not available.');
    }

    if (typeof AudioModule.setAudioModeAsync === 'function') {
      await AudioModule.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      }).catch(() => {});
    }

    const preset = RecordingPresets?.HIGH_QUALITY || {
      extension: '.m4a',
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 64000,
    };

    const recorder = new AudioModule.AudioRecorder(preset);
    if (typeof recorder.prepareToRecordAsync === 'function') {
      await recorder.prepareToRecordAsync();
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
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 64000,
      },
      ios: {
        extension: '.m4a',
        audioQuality: Audio.IOSAudioQuality?.HIGH ?? 2,
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 64000,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
      web: {
        mimeType: 'audio/webm',
        bitsPerSecond: 64000,
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
    try {
      if (current.type === 'expo-audio') {
        await current.rec.stop().catch(() => {});
      } else if (current.type === 'expo-av') {
        await current.rec.stopAndUnloadAsync().catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Reads local audio recording file and returns base64-encoded string.
 * Uses modern expo-file-system File API with fallbacks to legacy and fetch.
 */
export async function readAudioFileAsBase64(uri: string): Promise<string> {
  // Method 1: expo-file-system File (SDK 52/58 modern standard)
  try {
    const { File: ExpoFile } = require('expo-file-system');
    if (ExpoFile) {
      const file = new ExpoFile(uri);
      if (typeof file.base64 === 'function') {
        const b64 = await file.base64();
        if (b64 && typeof b64 === 'string' && b64.length > 0) {
          return b64;
        }
      }
    }
  } catch (err) {
    console.warn('ExpoFile.base64 failed, falling back:', err);
  }

  // Method 2: expo-file-system/legacy
  try {
    const FileSystemLegacy = require('expo-file-system/legacy');
    if (FileSystemLegacy && typeof FileSystemLegacy.readAsStringAsync === 'function') {
      const b64 = await FileSystemLegacy.readAsStringAsync(uri, {
        encoding: FileSystemLegacy.EncodingType?.Base64 ?? 'base64',
      });
      if (b64 && typeof b64 === 'string' && b64.length > 0) {
        return b64;
      }
    }
  } catch (err) {
    console.warn('expo-file-system/legacy failed, falling back:', err);
  }

  // Method 3: fetch as arrayBuffer
  try {
    const res = await fetch(uri);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    if (typeof btoa === 'function') {
      const b64 = btoa(binary);
      if (b64 && b64.length > 0) return b64;
    }
  } catch (err) {
    console.warn('fetch arrayBuffer conversion failed:', err);
  }

  throw new Error('Unable to read voice recording audio file.');
}

export async function parseVoiceTaskAudio(uri: string): Promise<VoiceTaskParseResponse> {
  const filename = uri.split('/').pop() || 'voice_task.m4a';
  const audio_base64 = await readAudioFileAsBase64(uri);

  return await api<VoiceTaskParseResponse>('/tasks/voice-parse', {
    method: 'POST',
    body: JSON.stringify({
      audio_base64,
      filename,
      content_type: 'audio/m4a',
    }),
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
