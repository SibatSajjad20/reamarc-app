/**
 * Voice task limits and recording settings (pure, no native imports, so they can be unit-tested).
 * Server limits: 3 MB audio, 600-character text, 60 s per command.
 */
export const VOICE_MAX_SECONDS = 60;
export const VOICE_SAMPLE_RATE = 16000;
export const VOICE_CHANNELS = 1;
export const VOICE_BIT_RATE = 32000;
export const VOICE_MAX_BYTES = 3 * 1024 * 1024;
export const VOICE_MAX_TEXT = 600;
export const VOICE_UPLOAD_NAME = 'voice.m4a';
export const VOICE_UPLOAD_TYPE = 'audio/mp4';
export const VOICE_TOO_LONG_MESSAGE = 'Recording is too large. Keep voice commands under 60 seconds.';

/** expo-audio RecordingOptions: 16 kHz mono AAC at ~32 kbps using the speech-tuned Android source. */
export function buildExpoAudioRecordingOptions(lib: any = {}) {
  return {
    extension: '.m4a',
    sampleRate: VOICE_SAMPLE_RATE,
    numberOfChannels: VOICE_CHANNELS,
    bitRate: VOICE_BIT_RATE,
    android: {
      extension: '.m4a',
      outputFormat: 'mpeg4',
      audioEncoder: 'aac',
      audioSource: 'voice_recognition',
      sampleRate: VOICE_SAMPLE_RATE,
    },
    ios: {
      extension: '.m4a',
      outputFormat: lib?.IOSOutputFormat?.MPEG4AAC ?? 'aac ',
      audioQuality: lib?.AudioQuality?.MEDIUM ?? 64,
      sampleRate: VOICE_SAMPLE_RATE,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: VOICE_BIT_RATE,
    },
  };
}

/** Only files inside the app cache folder may be deleted. */
export function isDeletableCacheUri(uri: string | null | undefined, cacheDir: string | null | undefined): boolean {
  if (!uri || !cacheDir) return false;
  const norm = (v: string) => v.replace(/^file:\/\//, '').replace(/\/+$/, '');
  const file = norm(uri);
  const dir = norm(cacheDir);
  if (!dir || file.includes('..')) return false;
  return file.startsWith(`${dir}/`);
}

export function isVoiceFileTooLarge(sizeBytes: number | null | undefined): boolean {
  return typeof sizeBytes === 'number' && sizeBytes > VOICE_MAX_BYTES;
}

export function clampVoiceText(text: string): string {
  return (text || '').slice(0, VOICE_MAX_TEXT);
}

export function shouldAutoStop(elapsedSeconds: number): boolean {
  return elapsedSeconds >= VOICE_MAX_SECONDS;
}
