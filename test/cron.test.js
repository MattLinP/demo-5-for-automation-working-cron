import test from 'node:test';
import assert from 'node:assert/strict';

import { CronError, expandField, nextRun, parse } from '../src/cron.js';

test('a star expands to the whole range', () => {
  assert.deepEqual(expandField('*', 0, 3), [0, 1, 2, 3]);
});

test('a single number expands to itself', () => {
  assert.deepEqual(expandField('5', 0, 59), [5]);
});

test('a list expands to its members, sorted and deduplicated', () => {
  assert.deepEqual(expandField('5,1,3,1', 0, 59), [1, 3, 5]);
});

test('a range includes the values between its ends', () => {
  const values = expandField('10-20', 0, 59);
  assert.ok(values.includes(12));
  assert.ok(values.includes(15));
  assert.ok(!values.includes(9));
});

test('a range written backwards is refused', () => {
  assert.throws(() => expandField('20-10', 0, 59), CronError);
});

test('a value outside the field is refused', () => {
  assert.throws(() => expandField('99', 0, 59), CronError);
});

test('a field that is not a number is refused', () => {
  assert.throws(() => expandField('mon', 0, 59), CronError);
});

test('an expression needs exactly five fields', () => {
  assert.throws(() => parse('0 9 * *'), CronError);
  assert.throws(() => parse('0 9 * * * *'), CronError);
});

test('an expression that is not a string is refused', () => {
  assert.throws(() => parse(null), CronError);
  assert.throws(() => parse(42), CronError);
});

test('parse returns one value set per field', () => {
  const schedule = parse('0 9 * * *');
  assert.deepEqual(schedule.minute, [0]);
  assert.deepEqual(schedule.hour, [9]);
  assert.equal(schedule.month.length, 12);
  assert.equal(schedule.source, '0 9 * * *');
});

test('a daily schedule fires at its hour', () => {
  const schedule = parse('0 9 * * *');
  const next = nextRun(schedule, new Date('2026-03-01T00:00:00Z'));
  assert.equal(next.toISOString(), '2026-03-01T09:00:00.000Z');
});

test('a daily schedule already past today fires tomorrow', () => {
  const schedule = parse('0 9 * * *');
  const next = nextRun(schedule, new Date('2026-03-01T10:00:00Z'));
  assert.equal(next.toISOString(), '2026-03-02T09:00:00.000Z');
});

test('a day-of-month schedule fires on that day', () => {
  const schedule = parse('0 0 15 * *');
  const next = nextRun(schedule, new Date('2026-03-01T00:00:00Z'));
  assert.equal(next.getUTCDate(), 15);
  assert.equal(next.getUTCHours(), 0);
});

test('a day-of-week schedule fires on that weekday', () => {
  const schedule = parse('0 0 * * 1');
  const next = nextRun(schedule, new Date('2026-03-01T00:00:00Z'));
  assert.equal(next.getUTCDay(), 1);
  assert.equal(next.getUTCHours(), 0);
});

test('a month-restricted schedule waits for that month', () => {
  const schedule = parse('0 0 1 7 *');
  const next = nextRun(schedule, new Date('2026-03-01T00:00:00Z'));
  assert.equal(next.getUTCMonth() + 1, 7);
  assert.equal(next.getUTCDate(), 1);
});

test('step syntax is not supported yet', () => {
  assert.throws(() => parse('*/5 * * * *'), CronError);
});

test('named weekdays are not supported yet', () => {
  assert.throws(() => parse('0 0 * * MON'), CronError);
});

test('an out of range value names its field and states the range', () => {
  assert.throws(() => parse('0 9 32 * *'), {
    name: 'CronError',
    message: 'dayOfMonth: out of range: 32 (allowed 1-31)',
  });
});

test('a minute error names the minute field', () => {
  assert.throws(() => parse('60 * * * *'), {
    name: 'CronError',
    message: 'minute: out of range: 60 (allowed 0-59)',
  });
});

test('an hour error names the hour field', () => {
  assert.throws(() => parse('* 9-2 * * *'), {
    name: 'CronError',
    message: 'hour: range out of order: 9-2 (allowed 0-23)',
  });
});

test('a month error names the month field', () => {
  assert.throws(() => parse('* * * JAN *'), {
    name: 'CronError',
    message: 'month: not a number: JAN (allowed 1-12)',
  });
});

test('a day of week error names the day of week field', () => {
  assert.throws(() => parse('* * * * 1,'), {
    name: 'CronError',
    message: 'dayOfWeek: empty list item (allowed 0-6)',
  });
});

test('expandField called without a field name still states the range', () => {
  assert.throws(() => expandField('99', 0, 59), {
    name: 'CronError',
    message: 'out of range: 99 (allowed 0-59)',
  });
});

test('errors raised before any field is read are unchanged', () => {
  assert.throws(() => parse('0 9 * *'), {
    name: 'CronError',
    message: 'expected 5 fields, got 4',
  });
  assert.throws(() => parse(null), {
    name: 'CronError',
    message: 'expression must be a string',
  });
});
