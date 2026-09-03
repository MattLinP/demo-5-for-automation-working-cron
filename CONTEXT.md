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
- `a,b,c` — a **list**, whose items may themselves be single values or ranges.

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

Step syntax (`*/5`, `10-20/2`), named months and weekdays (`JAN`, `MON`), `L` for the
last day of a month, and any timezone other than UTC. Expressions using them are
refused with an error rather than silently misread.
