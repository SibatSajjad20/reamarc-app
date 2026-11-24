import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  VOICE_BIT_RATE,
  VOICE_MAX_BYTES,
  VOICE_MAX_SECONDS,
  VOICE_MAX_TEXT,
  VOICE_SAMPLE_RATE,
  buildExpoAudioRecordingOptions,
  clampVoiceText,
  isDeletableCacheUri,
  isVoiceFileTooLarge,
  shouldAutoStop,
} from './voiceLimits.ts';
import { canUseVoiceTasks } from './roles.ts';

describe('voice limits', () => {
  it('matches the server limits', () => {
    assert.equal(VOICE_MAX_SECONDS, 60);
    assert.equal(VOICE_SAMPLE_RATE, 16000);
    assert.equal(VOICE_BIT_RATE, 32000);
    assert.equal(VOICE_MAX_BYTES, 3 * 1024 * 1024);
    assert.equal(VOICE_MAX_TEXT, 600);
  });

  it('records 16 kHz mono ~32 kbps with the voice_recognition source', () => {
    const opts = buildExpoAudioRecordingOptions({ IOSOutputFormat: { MPEG4AAC: 'aac ' }, AudioQuality: { MEDIUM: 64 } });
    assert.equal(opts.sampleRate, 16000);
    assert.equal(opts.numberOfChannels, 1);
    assert.equal(opts.bitRate, 32000);
    assert.equal(opts.android.audioSource, 'voice_recognition');
    assert.equal(opts.android.outputFormat, 'mpeg4');
    assert.equal(opts.android.audioEncoder, 'aac');
    assert.equal(opts.ios.outputFormat, 'aac ');
  });

  it('auto-stops at 60 s and clamps text', () => {
    assert.equal(shouldAutoStop(59), false);
    assert.equal(shouldAutoStop(60), true);
    assert.equal(clampVoiceText('a'.repeat(700)).length, 600);
    assert.equal(isVoiceFileTooLarge(VOICE_MAX_BYTES), false);
    assert.equal(isVoiceFileTooLarge(VOICE_MAX_BYTES + 1), true);
  });

  it('only deletes files inside the cache folder', () => {
    const cache = 'file:///data/user/0/app/cache/';
    assert.equal(isDeletableCacheUri('file:///data/user/0/app/cache/Audio/rec.m4a', cache), true);
    assert.equal(isDeletableCacheUri('file:///data/user/0/app/files/db.sqlite', cache), false);
    assert.equal(isDeletableCacheUri('file:///data/user/0/app/cache/../files/x', cache), false);
    assert.equal(isDeletableCacheUri('', cache), false);
    assert.equal(isDeletableCacheUri('file:///x', null), false);
  });
});

describe('canUseVoiceTasks', () => {
  it('allows admin, super_admin, team_lead and lead', () => {
    for (const role of ['admin', 'super_admin', 'team_lead', 'lead', 'Team_Lead', 'ADMIN']) {
      assert.equal(canUseVoiceTasks({ role }), true, role);
    }
  });

  it('blocks members, HR, operations (incl. Safeer) and missing users', () => {
    for (const role of ['team_member', 'hr', 'operations', '']) {
      assert.equal(canUseVoiceTasks({ role }), false, role);
    }
    assert.equal(canUseVoiceTasks({ role: 'operations', full_name: 'Safeer' } as any), false);
    assert.equal(canUseVoiceTasks(null), false);
  });
});
