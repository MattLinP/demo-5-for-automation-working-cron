# CONTEXT

The vocabulary and the rules this project implements. Where the code and this file
disagree, this file is right and the code has a defect.

## Expression

A **cron expression** is five whitespace-separated **fields**:

| Position | Field | Range |
| --- | --- | --- |
| 1 | minute | 0–59 |
| 2 | hour | 0–23 |
| 3 | day of month | 1–31 |
| 4 | month | 1–12 |
| 5 | day of week | 0–6, where 0 is Sunday |

## Field syntax

- `*` — every value in the field's range.
- `n` — that single value.
- `a-b` — a **range**, and it is **inclusive at both ends**. `1-5` is 1, 2, 3, 4 and 5.
- `*/n` and `a-b/n` — a **step**: every nth value of what it is written over, **counted
  from that lower bound**. `*/15` in the minute field is 0, 15, 30 and 45; `5-20/5` is 5,
  10, 15 and 20, because the count starts at the range's own lower bound and not at the
  field's. A step of zero is an error, and a step wider than what it counts over yields
  that first value alone. A single value is nothing to count over, so `5/15` is an error.
- `a,b,c` — a **list**, whose items may themselves be single values, ranges or steps.
- `L` — **the day-of-month field only**: the last day of whichever month is being
  tested. 31 in January, 28 in February, 29 in a leap February, 30 in April. It is a
  value and may be a list item — `1,L` is the first and last day of each month — but it
  is not a number, so it cannot be an end of a range. In any other field it is an error.

Values outside a field's range, ranges written backwards, and text that is not a number
are all errors. An expression that is not a string, or does not have exactly five
fields, is an error.

## How the two day fields combine

This is the rule most implementations get wrong, and it is deliberate rather than
accidental in the original cron.

**When both the day-of-month field and the day-of-week field are restricted — that is,
neither one is `*` — a run happens if *either* matches. They are ORed, not ANDed.**

So `0 0 1 * MON` fires on the first of every month **and** on every Monday, not only on
Mondays that fall on the first.

When one of the two is `*`, the question does not arise: the restricted one decides.

## Timing

All matching is in **UTC**. A schedule fires at the first minute at or after the moment
asked about that satisfies every field. Seconds are not part of an expression and are
always zero.

## Not implemented in 0.1

Named months and weekdays (`JAN`, `MON`), and any timezone other than UTC. Expressions
using them are refused with an error rather than silently misread.
