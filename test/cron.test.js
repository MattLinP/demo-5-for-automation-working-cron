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

test('an out of range value names its field and points at it', () => {
  assert.throws(() => parse('0 9 32 * *'), {
    name: 'CronError',
    message: [
      'dayOfMonth: out of range: 32 (allowed 1-31)',
      '',
      '  0 9 32 * *',
      '      ^^',
    ].join('\n'),
  });
});

test('a minute error names the minute field', () => {
  assert.throws(() => parse('60 * * * *'), {
    name: 'CronError',
    message: [
      'minute: out of range: 60 (allowed 0-59)',
      '',
      '  60 * * * *',
      '  ^^',
    ].join('\n'),
  });
});

test('an hour error names the hour field', () => {
  assert.throws(() => parse('* 9-2 * * *'), {
    name: 'CronError',
    message: [
      'hour: range out of order: 9-2 (allowed 0-23)',
      '',
      '  * 9-2 * * *',
      '    ^^^',
    ].join('\n'),
  });
});

test('a month error names the month field', () => {
  assert.throws(() => parse('* * * JAN *'), {
    name: 'CronError',
    message: [
      'month: not a number: JAN (allowed 1-12)',
      '',
      '  * * * JAN *',
      '        ^^^',
    ].join('\n'),
  });
});

test('a day of week error names the day of week field', () => {
  assert.throws(() => parse('* * * * 1,'), {
    name: 'CronError',
    message: [
      'dayOfWeek: empty list item (allowed 0-6)',
      '',
      '  * * * * 1,',
      '          ^^',
    ].join('\n'),
  });
});

test('the caret follows the expression own spacing', () => {
  assert.throws(() => parse('0  9  32 * *'), {
    name: 'CronError',
    message: [
      'dayOfMonth: out of range: 32 (allowed 1-31)',
      '',
      '  0  9  32 * *',
      '        ^^',
    ].join('\n'),
  });
});

test('the expression is shown exactly as it was passed', () => {
  assert.throws(() => parse('  0 9 32 * *  '), {
    name: 'CronError',
    message: [
      'dayOfMonth: out of range: 32 (allowed 1-31)',
      '',
      '    0 9 32 * *  ',
      '        ^^',
    ].join('\n'),
  });
});

test('a tab between fields moves both lines by the same amount', () => {
  assert.throws(() => parse('0\t9\t32 * *'), {
    name: 'CronError',
    message: [
      'dayOfMonth: out of range: 32 (allowed 1-31)',
      '',
      '  0\t9\t32 * *',
      '   \t \t^^',
    ].join('\n'),
  });
});

test('the expression and the offending field are properties of the error', () => {
  assert.throws(() => parse('0  9  32 * *'), (error) => {
    assert.equal(error.expression, '0  9  32 * *');
    assert.equal(error.offset, 6);
    assert.equal(error.length, 2);
    return true;
  });
});

test('expandField called without a field name still states the range', () => {
  assert.throws(() => expandField('99', 0, 59), {
    name: 'CronError',
    message: 'out of range: 99 (allowed 0-59)',
  });
});

test('CronError still takes the options bag Error takes', () => {
  const root = new Error('why');
  const error = new CronError('boom', { cause: root });
  assert.equal(error.message, 'boom');
  assert.equal(error.cause, root);
  assert.equal(error.expression, undefined);
});

test('errors with no field to point at are unchanged', () => {
  assert.throws(() => parse('0 9 * *'), {
    name: 'CronError',
    message: 'expected 5 fields, got 4',
  });
  assert.throws(() => parse(null), {
    name: 'CronError',
    message: 'expression must be a string',
  });
  assert.throws(() => parse(''), {
    name: 'CronError',
    message: 'expected 5 fields, got 1',
  });
});

test('both day fields restricted fires on either, not only their overlap', () => {
  const schedule = parse('0 0 1 * 1');
  const next = nextRun(schedule, new Date('2026-03-01T00:00:00Z'));
  assert.equal(next.toISOString(), '2026-03-02T00:00:00.000Z');
});

test('both day fields restricted fires on a Monday that is not the first', () => {
  const schedule = parse('0 0 1 * 1');
  const next = nextRun(schedule, new Date('2026-03-02T00:01:00Z'));
  assert.equal(next.toISOString(), '2026-03-09T00:00:00.000Z');
});

test('both day fields restricted fires on a first that is not a Monday', () => {
  const schedule = parse('0 0 1 * 1');
  const next = nextRun(schedule, new Date('2026-03-30T00:01:00Z'));
  assert.equal(next.toISOString(), '2026-04-01T00:00:00.000Z');
});

test('a restricted day of month alone still decides on its own', () => {
  const schedule = parse('0 0 15 * *');
  const next = nextRun(schedule, new Date('2026-03-01T00:00:00Z'));
  assert.equal(next.toISOString(), '2026-03-15T00:00:00.000Z');
});

test('a restricted day of week alone still decides on its own', () => {
  const schedule = parse('0 0 * * 1');
  const next = nextRun(schedule, new Date('2026-03-01T00:00:00Z'));
  assert.equal(next.toISOString(), '2026-03-02T00:00:00.000Z');
});

test('parse records which day fields were restricted', () => {
  assert.equal(parse('0 0 1 * 1').dayOfMonthRestricted, true);
  assert.equal(parse('0 0 1 * 1').dayOfWeekRestricted, true);
  assert.equal(parse('0 0 * * *').dayOfMonthRestricted, false);
  assert.equal(parse('0 0 * * *').dayOfWeekRestricted, false);
  assert.equal(parse('0 0 1 * *').dayOfMonthRestricted, true);
  assert.equal(parse('0 0 1 * *').dayOfWeekRestricted, false);
});

test('a day field is restricted by being written out, not by what it covers', () => {
  // `0,1,2,3,4,5,6` allows every weekday, but it is not `*`, so the OR applies and
  // the day-of-month field stops narrowing anything.
  const schedule = parse('0 0 15 * 0,1,2,3,4,5,6');
  const next = nextRun(schedule, new Date('2026-03-01T00:00:00Z'));
  assert.equal(next.toISOString(), '2026-03-02T00:00:00.000Z');
});
