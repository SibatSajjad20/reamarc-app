import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatHoursShort,
  getEarliestLogDate,
  parseHours,
  taskStatusTone,
  type DailyLogEntry,
} from './dailyLog.ts';
import { normalizeTask, stageTone } from './taskForm.ts';

describe('mobile daily log parsing and task linking', () => {
  it('parses colon time formats like 0:30 and 1:45', () => {
    assert.equal(parseHours('0:30'), 0.5);
    assert.equal(parseHours('0:15'), 0.25);
    assert.equal(parseHours('1:30'), 1.5);
    assert.equal(parseHours('2:15'), 2.25);
  });

  it('parses quick pick labels and human inputs like 30m, 1h 30m, 45 mins', () => {
    assert.equal(parseHours('30m'), 0.5);
    assert.equal(parseHours('45m'), 0.75);
    assert.equal(parseHours('45 mins'), 0.75);
    assert.equal(parseHours('1h 30m'), 1.5);
    assert.equal(parseHours('2h'), 2.0);
    assert.equal(parseHours('2 hrs'), 2.0);
    assert.equal(parseHours('1.5'), 1.5);
    assert.equal(parseHours('0.5'), 0.5);
    assert.equal(parseHours(1.5), 1.5);
    assert.equal(parseHours(''), 0);
    assert.equal(parseHours(null), 0);
  });

  it('formats hours short correctly', () => {
    assert.equal(formatHoursShort(0.5), '30m');
    assert.equal(formatHoursShort('30m'), '30m');
    assert.equal(formatHoursShort('0:30'), '30m');
    assert.equal(formatHoursShort(1), '1h');
    assert.equal(formatHoursShort(1.5), '1h 30m');
  });

  it('computes 48h earliest selectable date strictly before or equal to today', () => {
    const now = new Date('2026-11-17T12:00:00Z');
    const earliest = getEarliestLogDate(now);
    assert.ok(earliest.getTime() < now.getTime());
    // Earliest must be within 2 to 5 days back
    const diffDays = (now.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24);
    assert.ok(diffDays >= 2 && diffDays <= 5);
  });

  it('supports task_id, task_serial, and sync_task_status on DailyLogEntry', () => {
    const entry: DailyLogEntry = {
      id: 'log-1',
      date: '2026-11-17',
      resource_name: 'Test Dev',
      role: 'team_member',
      client_project: 'Reamarc',
      task_description: 'Implemented unified daily log and task manager linking',
      task_type: 'Scheduled Task',
      task_status: 'Incomplete',
      hours_utilized: 1.5,
      task_id: 'task-123',
      task_serial: 'T-0031',
      sync_task_status: 'in_progress',
    };

    assert.equal(entry.task_id, 'task-123');
    assert.equal(entry.task_serial, 'T-0031');
    assert.equal(entry.sync_task_status, 'in_progress');
  });

  it('normalizes task with logged_hours preserved', () => {
    const raw = {
      id: 'task-99',
      title: 'Fix UI of form',
      status: 'in_progress',
      estimate_hours: 4.0,
      logged_hours: 1.5,
    };
    const task = normalizeTask(raw);
    assert.equal(task.estimate_hours, 4.0);
    assert.equal(task.logged_hours, 1.5);
  });

  it('evaluates stageTone for task stages', () => {
    assert.equal(stageTone('completed').color, '#059669');
    assert.equal(stageTone('in_progress').color, '#4338CA');
    assert.equal(stageTone('review').color, '#B45309');
  });
});
