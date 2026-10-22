import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inboxPrimeKey, shouldSwitchCompanyForPush } from './notificationCompany.ts';

describe('mobile inbox and push company switching', () => {
  it('changes the inbox prime key when company_id changes for the same user', () => {
    const userA = { id: 'usr_1', company_id: 'comp_a' };
    const userB = { id: 'usr_1', company_id: 'comp_b' };
    assert.notEqual(inboxPrimeKey(userA), inboxPrimeKey(userB));
    assert.equal(inboxPrimeKey(userA), 'usr_1:comp_a');
  });

  it('switches company only when the push target is in the membership list', () => {
    const companies = [{ id: 'comp_a' }, { id: 'comp_b' }];
    assert.equal(
      shouldSwitchCompanyForPush('comp_a', { company_id: 'comp_b' }, companies),
      'comp_b',
    );
    assert.equal(shouldSwitchCompanyForPush('comp_a', { company_id: 'comp_a' }, companies), null);
    assert.equal(shouldSwitchCompanyForPush('comp_a', { company_id: 'comp_other' }, companies), null);
  });
});
