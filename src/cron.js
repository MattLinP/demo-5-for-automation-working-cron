// A five-field cron expression parser and next-fire-time calculator.
//
// Field order is the standard one:
//
//     ┌─ minute        0-59
//     │ ┌─ hour        0-23
//     │ │ ┌─ day of month  1-31
//     │ │ │ ┌─ month    1-12
//     │ │ │ │ ┌─ day of week  0-6, Sunday is 0
//     * * * * *
//
// See CONTEXT.md for the semantics this implements, in particular how the two day
// fields combine.

const FIELDS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'dayOfMonth', min: 1, max: 31, allowsLast: true },
  { name: 'month', min: 1, max: 12 },
  { name: 'dayOfWeek', min: 0, max: 6 },
];

// `L`, the last day of the month, as it stands in an expanded day-of-month field. It is
// the one piece of syntax whose value is not known at parse time — 28, 29, 30 or 31
// depending on the month being tested — so it travels through the expansion as itself
// and is resolved against a date by `dayOfMonthMatches`.
export const LAST_DAY_OF_MONTH = 'L';

export class CronError extends Error {
  // When the error is about one field, `options` says which: `expression` is the
  // expression as it was passed, and `offset` and `length` locate the field within
  // it. The message then gains a caret line under that field, and the three stay on
  // the error so a caller can render them their own way instead. Errors with no field
  // to point at are built without them and read as they always have. `options` is
  // otherwise the standard one `Error` takes, so `cause` still reaches it.
  constructor(message, options) {
    const { expression, offset, length } = options ?? {};
    const located = typeof expression === 'string';
    super(located ? `${message}\n\n${excerpt(expression, offset, length)}` : message, options);
    this.name = 'CronError';
    if (located) {
      this.expression = expression;
      this.offset = offset;
      this.length = length;
    }
  }
}

// The two lines a compiler prints under a message: the expression itself, and carets
// under the field that failed.
function excerpt(expression, offset, length) {
  const indent = '  ';
  // The text before the field becomes the caret line's padding with everything but
  // its whitespace blanked out, so a tab between fields advances both lines equally
  // instead of one space standing in for a tab stop.
  const pad = expression.slice(0, offset).replace(/\S/g, ' ');
  return `${indent}${expression}\n${indent}${pad}${'^'.repeat(length)}`;
}

// A CronError from inside a field's expansion, named for the field it came from and
// carrying the range that field allows.
//
// `name` is absent when `expandField` is called directly rather than through `parse`:
// there is no field being read, so there is nothing to name.
function fieldError(message, min, max, name) {
  const field = name === undefined ? '' : `${name}: `;
  return new CronError(`${field}${message} (allowed ${min}-${max})`);
}

// One field into the sorted set of values it allows.
//
// Understands `*`, a single number, an inclusive range `a-b`, and a comma-separated
// list of any of those. `name` is the field's name, used to say where an error came
// from.
//
// When `allowsLast` is set — only the day-of-month field sets it — a list item may also
// be `L`, which expands to `LAST_DAY_OF_MONTH` rather than to a number. It is a value in
// its own right and not a number, so it cannot be an end of a range.
export function expandField(text, min, max, name, allowsLast = false) {
  if (text === '*') {
    const all = [];
    for (let v = min; v <= max; v++) all.push(v);
    return all;
  }

  const values = new Set();
  for (const part of text.split(',')) {
    if (part === '') throw fieldError('empty list item', min, max, name);

    if (allowsLast && part === LAST_DAY_OF_MONTH) {
      values.add(LAST_DAY_OF_MONTH);
      continue;
    }

    const dash = part.indexOf('-');
    if (dash === -1) {
      values.add(toNumber(part, min, max, name));
      continue;
    }

    const lo = toNumber(part.slice(0, dash), min, max, name);
    const hi = toNumber(part.slice(dash + 1), min, max, name);
    if (lo > hi) throw fieldError(`range out of order: ${part}`, min, max, name);
    for (let v = lo; v < hi; v++) values.add(v);
  }

  return [...values].sort(ascending);
}

// Ascending order, with `L` after every number: whatever month it lands in, the last day
// is the latest day the field allows.
function ascending(a, b) {
  if (a === LAST_DAY_OF_MONTH) return 1;
  if (b === LAST_DAY_OF_MONTH) return -1;
  return a - b;
}

function toNumber(text, min, max, name) {
  if (!/^[0-9]+$/.test(text)) throw fieldError(`not a number: ${text}`, min, max, name);
  const value = Number(text);
  if (value < min || value > max) throw fieldError(`out of range: ${text}`, min, max, name);
  return value;
}

// Where each field starts, counted in the expression as it was passed rather than
// re-derived by joining the split fields, so that runs of whitespace between fields do
// not shift the offsets.
function fieldOffsets(expression) {
  return [...expression.matchAll(/\S+/g)].map((match) => match.index);
}

// A field error re-raised with the place in the expression it came from. Anything that
// is not a CronError is left alone.
function pointingAt(error, location) {
  return error instanceof CronError ? new CronError(error.message, location) : error;
}

// A cron expression into the five value sets it allows.
export function parse(expression) {
  if (typeof expression !== 'string') throw new CronError('expression must be a string');

  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) throw new CronError(`expected 5 fields, got ${parts.length}`);

  const schedule = {};
  for (let i = 0; i < FIELDS.length; i++) {
    const field = FIELDS[i];
    try {
      schedule[field.name] = expandField(
        parts[i],
        field.min,
        field.max,
        field.name,
        field.allowsLast,
      );
    } catch (error) {
      // Offsets are wanted only to point at a failure, so they are found here rather
      // than on every parse.
      const offset = fieldOffsets(expression)[i];
      throw pointingAt(error, { expression, offset, length: parts[i].length });
    }
  }
  // Which of the two day fields were restricted, which the expanded sets cannot say:
  // a field written out in full covers the same values as `*` but is still restricted,
  // and the difference decides how the two fields combine. See `matchesDay`.
  schedule.dayOfMonthRestricted = parts[2] !== '*';
  schedule.dayOfWeekRestricted = parts[4] !== '*';
  schedule.source = expression;
  return schedule;
}

// Whether a date's day satisfies the schedule, by the rule in CONTEXT.md: when both day
// fields are restricted the day matches if *either* does, so `0 0 1 * 1` fires on every
// first and on every Monday rather than only on firsts that are Mondays. When at most
// one is restricted the other allows every value, so ANDing lets the restricted one
// decide on its own.
function matchesDay(schedule, date) {
  const byDayOfMonth = dayOfMonthMatches(schedule.dayOfMonth, date);
  const byDayOfWeek = schedule.dayOfWeek.includes(date.getUTCDay());

  if (schedule.dayOfMonthRestricted && schedule.dayOfWeekRestricted) {
    return byDayOfMonth || byDayOfWeek;
  }
  return byDayOfMonth && byDayOfWeek;
}

// Whether an expanded day-of-month field allows a date. Every value in it is a plain
// number except `LAST_DAY_OF_MONTH`, whose day depends on the month being tested, so the
// field is asked whether it allows the date rather than searched for the date's number.
function dayOfMonthMatches(dayOfMonth, date) {
  const day = date.getUTCDate();
  return dayOfMonth.some((allowed) =>
    allowed === LAST_DAY_OF_MONTH ? day === lastDayOfMonth(date) : allowed === day,
  );
}

// The last day of the month `date` falls in. Day 0 of the following month is the day
// before its first, which is this month's last, leap years included.
function lastDayOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

// The first minute at or after `from` that the schedule allows.
//
// Minute-by-minute, which is fast enough for the horizons this is used over and keeps
// the matching rules in one place.
export function nextRun(schedule, from) {
  const at = new Date(from.getTime());
  at.setUTCSeconds(0, 0);
  at.setUTCMinutes(at.getUTCMinutes() + 1);

  const limit = new Date(at.getTime());
  limit.setUTCFullYear(limit.getUTCFullYear() + 5);

  while (at <= limit) {
    if (
      schedule.minute.includes(at.getUTCMinutes()) &&
      schedule.hour.includes(at.getUTCHours()) &&
      schedule.month.includes(at.getUTCMonth() + 1) &&
      matchesDay(schedule, at)
    ) {
      return at;
    }
    at.setUTCMinutes(at.getUTCMinutes() + 1);
  }

  return null;
}
