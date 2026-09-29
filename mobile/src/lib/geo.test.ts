import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyGpsFix, gpsFieldsForPunch, shouldAcceptLiveSample, type PunchFix } from './geo.ts';

const away: PunchFix = {
  lat: 33.54,
  lng: 73.09,
  accuracy: 25,
  capturedAt: '2026-09-29T11:00:00.000Z',
  quality: 'out_of_range',
};

describe('punch location', () => {
  it('treats a confident far pin as out of range', () => {
    assert.equal(classifyGpsFix(2200, 25, 500), 'out_of_range');
  });

  it('treats a pin inside the fence as in range', () => {
    assert.equal(classifyGpsFix(40, 15, 500), 'in_range');
  });

  it('treats a city-level guess as coarse', () => {
    assert.equal(classifyGpsFix(2200, 2500, 500), 'coarse');
  });

  it('accepts a live sample only when it is inside the fence and tight', () => {
    assert.equal(shouldAcceptLiveSample('in_range', 20), true);
    assert.equal(shouldAcceptLiveSample('in_range', 400), false);
    assert.equal(shouldAcceptLiveSample('out_of_range', 20), false);
  });

  it('omits a tight miss when the office network is already verified', () => {
    assert.deepEqual(gpsFieldsForPunch(away, true), {});
  });

  it('sends a tight miss when the device is not on the office network', () => {
    const fields = gpsFieldsForPunch(away, false);
    assert.equal(fields.latitude, away.lat);
    assert.equal(fields.longitude, away.lng);
    assert.equal(fields.accuracy_meters, 25);
  });

  it('sends an in-range fix on the office network', () => {
    const fields = gpsFieldsForPunch({ ...away, quality: 'in_range', accuracy: 12 }, true);
    assert.equal(fields.latitude, away.lat);
    assert.equal(fields.accuracy_meters, 12);
  });
});
