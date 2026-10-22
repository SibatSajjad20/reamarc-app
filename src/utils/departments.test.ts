import { describe, it } from 'vitest';
import { canonicalDept, memberDepartmentLists, sameDept, uniqueCanonicalDepts } from './departments';
import { visiblePipelineStages } from './contentCalendarWorkflow';
import { PIPELINE_STAGES } from '../types/contentCalendar';

describe('departments', () => {
  it('runs departments test suite', () => {

const SOCIAL_STAGES = PIPELINE_STAGES.slice(8);

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(canonicalDept('social_media') === 'Social media', 'social_media alias');
assert(canonicalDept('Social Media') === 'Social media', 'Social Media casing');
assert(canonicalDept('performance') === 'Performance marketing', 'performance alias');
assert(canonicalDept('Software development') === 'Software development', 'software development stays');
assert(canonicalDept('  Mystery Desk ') === 'Mystery Desk', 'unknown kept trimmed');
assert(sameDept('Social Media', 'social_media'), 'sameDept ignores case/alias');

const unique = uniqueCanonicalDepts(['Social media', 'Social Media', 'Performance marketing']);
assert(unique.join('|') === 'Social media|Performance marketing', `unique got ${unique.join('|')}`);

const prefill = memberDepartmentLists({
  primary_department: 'social media',
  departments: ['Social Media', 'Performance Marketing'],
});
assert(prefill.primary === 'Social media', `prefill primary ${prefill.primary}`);
assert(prefill.secondaries.join('|') === 'Performance marketing', `prefill secondaries ${prefill.secondaries.join('|')}`);

const unknownPrimary = memberDepartmentLists({
  primary_department: 'Mystery Desk',
  departments: ['Mystery Desk'],
});
assert(unknownPrimary.primary === 'Mystery Desk', 'unknown primary kept as selectable value');

const perfSocial = {
  id: 'u1',
  role: 'team_member',
  department: 'Social media',
  departments: ['Social media', 'Performance marketing'],
  permissions: {
    summary: { content_calendar: 'own_stages' },
    content_stages: ['social_media'],
  },
};
const stages = visiblePipelineStages(perfSocial as any);
assert(stages.join('|') === SOCIAL_STAGES.join('|'), `visible stages ${stages.join('|')}`);
assert(!stages.includes('Content'), 'no content stages for performance+social member');
assert(!stages.includes('Creative Production'), 'no creative stages');

const viewOnlyMember = {
  role: 'team_member',
  permissions: {
    summary: { content_calendar: 'view' },
    content_stages: ['social_media'],
  },
};
const viewStages = visiblePipelineStages(viewOnlyMember as any);
assert(viewStages.length !== PIPELINE_STAGES.length, 'view summary alone does not unlock all stages');
assert(viewStages.join('|') === SOCIAL_STAGES.join('|'), 'view member still scoped to social stages');

console.log('All department and visiblePipelineStages tests passed successfully!');
  });
});
