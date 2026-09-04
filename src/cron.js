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

// The names two of the fields accept, as the numbers they spell. A name is a spelling of
// a number and nothing more: it is read in `toNumber`, the one place a field's text
// becomes a number, so every position a number may take accepts a name for free — on its
// own, at either end of a range, as a list item, and as the bounds of a stepped range.
//
// Keyed by field name, because names belong only to the fields that have them. A field
// absent from this table has no names, and `JAN` in it is an error rather than 1.
const NAMES = {
  month: {
    JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
    JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
  },
  dayOfWeek: { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 },
};

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
  //
  // `suggestion` is a guess at what the writer meant, from `suggestionFor`. It goes on
  // the error as well, and on its own line at the end of the message — after the caret
  // block, so the message opens with what is certainly wrong and closes with what is
  // only likely. A failure no guess recognises carries none and reads as it always has.
  constructor(message, options) {
    const { expression, offset, length, suggestion } = options ?? {};
    const located = typeof expression === 'string';
    const lines = [located ? `${message}\n\n${excerpt(expression, offset, length)}` : message];
    if (suggestion !== undefined) lines.push(`likely cause: ${suggestion}`);
    super(lines.join('\n'), options);
    this.name = 'CronError';
    if (located) {
      this.expression = expression;
      this.offset = offset;
      this.length = length;
    }
    if (suggestion !== undefined) this.suggestion = suggestion;
  }
}

// The mistakes common enough to be worth guessing at, and what to say about each.
//
// Each of these describes a decision rather than a gap — names belong to two fields, five
// fields is the shape this parser takes, Sunday is 0 — so none is waiting on anything and
// none goes stale on its own.
const SUGGESTIONS = {
  noNamesHere: 'only the month and day-of-week fields have names; use the number',
  unknownName: 'month and weekday names are the first three letters, as in JAN and MON',
  fieldCount:
    'this parser takes five fields; a leading seconds field is a Quartz expression — see docs/adr/0001-five-fields-only.md',
  sundayIsZero: 'days of the week are 0–6, where 0 is Sunday',
};

// A guess at what a failure meant, or `undefined` when it is none of the mistakes above
// — which is the answer for most failures, and a better one than a wrong guess.
//
// A failure is described either by `fieldCount`, for an expression that does not have
// five fields, or by the `text` of the one field that would not expand together with
// that field's `name`. The first guess that matches wins, so a field that could read as
// two mistakes gets the one looked for first.
//
// A `/` is not one of the marks looked for: step syntax is supported, so a field
// carrying one failed for some other reason — `*/0` is a step of zero, `5/15` steps over
// a single value — and saying "step syntax is not supported" of either would be a wrong
// guess.
function suggestionFor({ fieldCount, text, name }) {
  // Too few fields is a typo and says nothing about what was meant. Too many is usually
  // a Quartz expression, which this parser refuses by decision rather than by omission.
  if (fieldCount !== undefined) return fieldCount > 5 ? SUGGESTIONS.fieldCount : undefined;

  // Month and weekday names are three letters, so a run of letters is someone reaching
  // for one. A run this field already reads is not the mistake — `MON/2` failed over its
  // step, not its name — so only a run the field cannot read earns a guess, and which
  // guess that is depends on whether the field has names at all. A lone letter is
  // neither: `L` is real syntax here, in the day-of-month field, and `L` in the wrong
  // field or at the end of a range is not a misspelled name.
  const runs = text.match(/[A-Za-z]{2,}/g) ?? [];
  if (runs.some((run) => spelledNumber(run, name) === undefined)) {
    return namesFor(name) === undefined ? SUGGESTIONS.noNamesHere : SUGGESTIONS.unknownName;
  }
  // Sunday as 7 rather than 0 — a convention borrowed from another dialect rather than a
  // value picked at random, which is why only the bare 7 is read this way.
  if (name === 'dayOfWeek' && text === '7') return SUGGESTIONS.sundayIsZero;
  return undefined;
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
  return new CronError(`${namedFor(message, name)} (allowed ${min}-${max})`);
}

// A field error about a step rather than about a value. A step is a distance and not a
// value the field takes, so the field's range has nothing to say about it and is left
// off: `*/90` in the minute field is legal, and `(allowed 0-59)` would suggest otherwise.
function stepError(message, name) {
  return new CronError(namedFor(message, name));
}

function namedFor(message, name) {
  return name === undefined ? message : `${name}: ${message}`;
}

// One field into the sorted set of values it allows.
//
// Understands `*`, a single number, an inclusive range `a-b`, a step over either of
// those — `*/n` and `a-b/n` — and a comma-separated list of any of those. `name` is the
// field's name, used to say where an error came from, and to decide which names the
// field accepts: wherever a number may be written, a field with names takes one of its
// own instead.
//
// A step counts from the lower bound of whatever it steps over: `*/n` from the field's
// own minimum, `a-b/n` from `a`. So `5-20/5` is 5, 10, 15 and 20 rather than every fifth
// minute of the hour that happens to land inside 5-20.
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

    // A step is written after the values it counts over, so the item splits at the `/`
    // into what to step over and how far to step. An item with no `/` steps by one,
    // which walks every value and leaves a plain number or range as it was.
    const slash = part.indexOf('/');
    const stepped = slash !== -1;
    const over = stepped ? part.slice(0, slash) : part;
    const step = stepped ? toStep(part.slice(slash + 1), part, name) : 1;

    const dash = over.indexOf('-');
    let lo;
    let hi;
    if (stepped && over === '*') {
      // `*/n` steps over the whole field. Bare `*` is not a list item, so the star is
      // read this way only when there is a step for it to carry.
      lo = min;
      hi = max;
    } else if (dash === -1) {
      // A single value is a range of one, and a range of one is nothing for a step to
      // count over: `5/15` is a mistake rather than a roundabout way of writing `5`.
      if (stepped) throw stepError(`step needs * or a range: ${part}`, name);
      lo = toNumber(over, min, max, name);
      hi = lo;
    } else {
      lo = toNumber(over.slice(0, dash), min, max, name);
      hi = toNumber(over.slice(dash + 1), min, max, name);
      if (lo > hi) throw fieldError(`range out of order: ${part}`, min, max, name);
    }

    // The first value is always in, so a step wider than what it counts over gives that
    // value alone rather than nothing.
    for (let v = lo; v <= hi; v += step) values.add(v);
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

// The `n` of a step: how far to advance, not a value the field takes, so the field's own
// range does not bound it — `*/90` in the minute field is legal and means minute 0 alone.
// Zero is refused, since a step of nothing would never leave the first value.
//
// Errors quote the whole list item rather than the step alone: `*/n` is what was written,
// and `not a number: n` on its own leaves the reader looking for an `n` in the field.
function toStep(text, part, name) {
  if (!/^[0-9]+$/.test(text)) throw stepError(`not a number: ${part}`, name);
  const step = Number(text);
  if (step === 0) throw stepError(`step of zero: ${part}`, name);
  return step;
}

// One value's text as the number it stands for, bounded by the field's range.
//
// A name is resolved to its number and then checked like any other, rather than trusted
// past the check: past this point nothing can tell a name from the digits that spell the
// same number. Errors quote the text as it was written, so `DEC` is reported as `DEC`.
function toNumber(text, min, max, name) {
  const value = spelledNumber(text, name);
  if (value === undefined) throw fieldError(`not a number: ${text}`, min, max, name);
  if (value < min || value > max) throw fieldError(`out of range: ${text}`, min, max, name);
  return value;
}

// The number a piece of a field's text spells, or `undefined` when it spells none.
//
// Digits spell the number they write out. In a field that has names, so does a name, in
// any case — `mon`, `Mon` and `MON` are one name. Nothing else is a number, so `L` and
// a name in a field without names both land here as `undefined`.
function spelledNumber(text, name) {
  if (/^[0-9]+$/.test(text)) return Number(text);
  const names = namesFor(name);
  const key = text.toUpperCase();
  // `hasOwn`, so that `constructor` and `toString` are as unknown as any other word.
  return names !== undefined && Object.hasOwn(names, key) ? names[key] : undefined;
}

// The names a field accepts, or `undefined` for a field that has none — which is every
// field but month and day of week, and also the no-field case, where `expandField` was
// called directly and there is no field whose names these would be.
function namesFor(name) {
  return Object.hasOwn(NAMES, name) ? NAMES[name] : undefined;
}

// Where each field starts, counted in the expression as it was passed rather than
// re-derived by joining the split fields, so that runs of whitespace between fields do
// not shift the offsets.
function fieldOffsets(expression) {
  return [...expression.matchAll(/\S+/g)].map((match) => match.index);
}

// A field error re-raised with the place in the expression it came from, and with the
// guess at what was meant if there is one: a field error becomes a located one exactly
// once, so the message is composed once and in one order. Anything that is not a
// CronError is left alone.
function pointingAt(error, location) {
  return error instanceof CronError ? new CronError(error.message, location) : error;
}

// A cron expression into the five value sets it allows.
export function parse(expression) {
  if (typeof expression !== 'string') throw new CronError('expression must be a string');

  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new CronError(`expected 5 fields, got ${parts.length}`, {
      suggestion: suggestionFor({ fieldCount: parts.length }),
    });
  }

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
      throw pointingAt(error, {
        expression,
        offset,
        length: parts[i].length,
        suggestion: suggestionFor({ text: parts[i], name: field.name }),
      });
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

// The next `count` moments the schedule allows, starting after `from` and in ascending
// order.
//
// Each answer becomes the next question, which is what makes the moments distinct:
// `nextRun` starts from the minute *after* the moment it is given, so handing it back
// its own answer asks for the run after that one. Writing this loop at a call site is
// where the off-by-one lives — a caller who adds a second first, or subtracts one, is a
// whole run out at a boundary — so it lives here instead, and `nextRun` stays the one
// place that decides whether a moment matches.
//
// The list is short rather than padded when the schedule runs out: `nextRun` answers
// `null` past the horizon it searches, and that ends the list. Each hop searches that
// horizon afresh from where the previous one landed, so a long list may reach further
// ahead than a single `nextRun` from `from` would.
export function nextRuns(schedule, from, count) {
  if (!Number.isInteger(count) || count < 0) {
    throw new CronError(`count must be a non-negative integer, got ${count}`);
  }

  const runs = [];
  let at = from;
  for (let i = 0; i < count; i++) {
    const next = nextRun(schedule, at);
    if (next === null) break;
    runs.push(next);
    at = next;
  }
  return runs;
}
