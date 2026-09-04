import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CronError,
  LAST_DAY_OF_MONTH,
  expandField,
  nextRun,
  nextRuns,
  parse,
} from '../src/cron.js';

test('a star expands to the whole range', () => {
  assert.deepEqual(expandField('*', 0, 3), [0, 1, 2, 3]);
});

test('a single number expands to itself', () => {
  assert.deepEqual(expandField('5', 0, 59), [5]);
});

test('a list expands to its members, sorted and deduplicated', () => {
  assert.deepEqual(expandField('5,1,3,1', 0, 59), [1, 3, 5]);
});

test('a range expands to every value from its start to its end, inclusive', () => {
  assert.deepEqual(expandField('1-5', 0, 59), [1, 2, 3, 4, 5]);
  assert.deepEqual(
    expandField('10-20', 0, 59),
    [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  );
});

test('a range at the top of a field keeps its last value', () => {
  assert.deepEqual(expandField('55-59', 0, 59), [55, 56, 57, 58, 59]);
  assert.deepEqual(expandField('0-6', 0, 6), [0, 1, 2, 3, 4, 5, 6]);
});

test('a range of one value expands to that value', () => {
  assert.deepEqual(expandField('7-7', 0, 59), [7]);
});

test('a range inside a list keeps its last value', () => {
  assert.deepEqual(expandField('1,3-5,9', 0, 59), [1, 3, 4, 5, 9]);
  assert.deepEqual(expandField('16-31', 1, 31), [
    16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
  ]);
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
      'likely cause: named months and weekdays are not supported in this version; use the number',
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

test('step syntax gets a guess at what was meant', () => {
  assert.throws(() => parse('*/5 * * * *'), {
    name: 'CronError',
    message: [
      'minute: not a number: */5 (allowed 0-59)',
      '',
      '  */5 * * * *',
      '  ^^^',
      'likely cause: step syntax is not supported in this version',
    ].join('\n'),
  });
});

test('a named weekday gets a guess at what was meant', () => {
  assert.throws(() => parse('0 0 * * MON'), {
    name: 'CronError',
    message: [
      'dayOfWeek: not a number: MON (allowed 0-6)',
      '',
      '  0 0 * * MON',
      '          ^^^',
      'likely cause: named months and weekdays are not supported in this version; use the number',
    ].join('\n'),
  });
});

test('more than five fields gets a guess at what was meant', () => {
  assert.throws(() => parse('0 0 0 * * *'), {
    name: 'CronError',
    message: [
      'expected 5 fields, got 6',
      'likely cause: this parser takes five fields; a leading seconds field is a Quartz expression — see docs/adr/0001-five-fields-only.md',
    ].join('\n'),
  });
});

test('7 in the day of week field gets a guess at what was meant', () => {
  assert.throws(() => parse('0 0 * * 7'), {
    name: 'CronError',
    message: [
      'dayOfWeek: out of range: 7 (allowed 0-6)',
      '',
      '  0 0 * * 7',
      '          ^',
      'likely cause: days of the week are 0–6, where 0 is Sunday',
    ].join('\n'),
  });
});

test('the suggestion is a property of the error as well', () => {
  assert.throws(() => parse('*/5 * * * *'), (error) => {
    assert.equal(error.suggestion, 'step syntax is not supported in this version');
    return true;
  });
});

test('a failure none of the guesses recognise gets no suggestion', () => {
  assert.throws(() => parse('60 * * * *'), (error) => {
    assert.equal(error.suggestion, undefined);
    assert.equal(
      error.message,
      ['minute: out of range: 60 (allowed 0-59)', '', '  60 * * * *', '  ^^'].join('\n'),
    );
    return true;
  });
});

test('L is not read as a name it does not resemble', () => {
  // `L` is real syntax here, in the day-of-month field, so a field that is only `L`
  // failing elsewhere is not someone reaching for `MON`. Month and weekday names are
  // three letters, which is what the guess looks for.
  assert.throws(() => parse('0 0 * * L'), (error) => {
    assert.equal(error.suggestion, undefined);
    return true;
  });
  assert.throws(() => parse('0 0 1-L * *'), (error) => {
    assert.equal(error.suggestion, undefined);
    return true;
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

test('L in the day of month expands to the last-day marker', () => {
  assert.deepEqual(parse('0 0 L * *').dayOfMonth, [LAST_DAY_OF_MONTH]);
});

test('expandField expands L only when the field allows it', () => {
  assert.deepEqual(expandField('L', 1, 31, 'dayOfMonth', true), [LAST_DAY_OF_MONTH]);
  assert.throws(() => expandField('L', 1, 31, 'dayOfMonth'), {
    name: 'CronError',
    message: 'dayOfMonth: not a number: L (allowed 1-31)',
  });
});

test('L is refused in every field but the day of month', () => {
  assert.throws(() => parse('L * * * *'), CronError);
  assert.throws(() => parse('* L * * *'), CronError);
  assert.throws(() => parse('* * * L *'), CronError);
  assert.throws(() => parse('* * * * L'), CronError);
});

test('L in another field names that field and points at it', () => {
  assert.throws(() => parse('0 0 * * L'), {
    name: 'CronError',
    message: [
      'dayOfWeek: not a number: L (allowed 0-6)',
      '',
      '  0 0 * * L',
      '          ^',
    ].join('\n'),
  });
});

test('L is not a range end', () => {
  assert.throws(() => parse('0 0 1-L * *'), CronError);
  assert.throws(() => parse('0 0 L-5 * *'), CronError);
});

test('L fires on the last day of a 31 day month', () => {
  const schedule = parse('0 0 L * *');
  const next = nextRun(schedule, new Date('2026-01-01T00:00:00Z'));
  assert.equal(next.toISOString(), '2026-01-31T00:00:00.000Z');
});

test('L fires on the last day of a short February', () => {
  const schedule = parse('0 0 L * *');
  const next = nextRun(schedule, new Date('2026-02-01T00:00:00Z'));
  assert.equal(next.toISOString(), '2026-02-28T00:00:00.000Z');
});

test('L fires on the last day of a leap February', () => {
  const schedule = parse('0 0 L * *');
  const next = nextRun(schedule, new Date('2028-02-01T00:00:00Z'));
  assert.equal(next.toISOString(), '2028-02-29T00:00:00.000Z');
});

test('L fires on the last day of a 30 day month', () => {
  const schedule = parse('0 0 L * *');
  const next = nextRun(schedule, new Date('2026-04-01T00:00:00Z'));
  assert.equal(next.toISOString(), '2026-04-30T00:00:00.000Z');
});

test('L is resolved per month rather than once at parse time', () => {
  const schedule = parse('0 0 L * *');
  assert.equal(
    nextRun(schedule, new Date('2026-01-31T00:01:00Z')).toISOString(),
    '2026-02-28T00:00:00.000Z',
  );
  assert.equal(
    nextRun(schedule, new Date('2026-02-28T00:01:00Z')).toISOString(),
    '2026-03-31T00:00:00.000Z',
  );
});

test('L composes in a list', () => {
  const schedule = parse('0 0 1,L * *');
  const first = nextRun(schedule, new Date('2026-04-01T00:01:00Z'));
  assert.equal(first.toISOString(), '2026-04-30T00:00:00.000Z');
  assert.equal(nextRun(schedule, first).toISOString(), '2026-05-01T00:00:00.000Z');
});

test('L is a restricted day of month, so it ORs with a restricted day of week', () => {
  const schedule = parse('0 0 L * 1');
  // 30 April 2026 is a Thursday, and the Monday before it is the 27th.
  const next = nextRun(schedule, new Date('2026-04-28T00:00:00Z'));
  assert.equal(next.toISOString(), '2026-04-30T00:00:00.000Z');
});

test('nextRuns returns a schedule that fires several times a day in order', () => {
  const schedule = parse('0 9,17 * * *');
  const runs = nextRuns(schedule, new Date('2026-03-01T00:00:00Z'), 5);
  assert.deepEqual(
    runs.map((run) => run.toISOString()),
    [
      '2026-03-01T09:00:00.000Z',
      '2026-03-01T17:00:00.000Z',
      '2026-03-02T09:00:00.000Z',
      '2026-03-02T17:00:00.000Z',
      '2026-03-03T09:00:00.000Z',
    ],
  );
});

test('each run is strictly later than the one before it', () => {
  const runs = nextRuns(parse('0 9,17 * * *'), new Date('2026-03-01T09:00:00Z'), 4);
  for (let i = 1; i < runs.length; i++) {
    assert.ok(runs[i] > runs[i - 1], `${runs[i].toISOString()} follows ${runs[i - 1].toISOString()}`);
  }
});

test('nextRuns walks a monthly schedule a month at a time', () => {
  const schedule = parse('0 0 1 * *');
  const runs = nextRuns(schedule, new Date('2026-03-15T00:00:00Z'), 3);
  assert.deepEqual(
    runs.map((run) => run.toISOString()),
    ['2026-04-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'],
  );
});

test('a schedule that never fires again gives a short array rather than nulls', () => {
  // The 30th of February: every field is legal, and no date satisfies them together.
  const runs = nextRuns(parse('0 0 30 2 *'), new Date('2026-03-01T00:00:00Z'), 3);
  assert.deepEqual(runs, []);
});

test('a count of zero returns no runs', () => {
  assert.deepEqual(nextRuns(parse('0 9 * * *'), new Date('2026-03-01T00:00:00Z'), 0), []);
});

test('a negative count is refused', () => {
  assert.throws(
    () => nextRuns(parse('0 9 * * *'), new Date('2026-03-01T00:00:00Z'), -1),
    CronError,
  );
});
