# CONTEXT

The vocabulary and the rules this project implements. Where the code and this file
disagree, this file is right and the code has a defect.

## Expression

A **cron expression** is five whitespace-separated **fields**:

| Position | Field | Range | Names |
| --- | --- | --- | --- |
| 1 | minute | 0–59 | — |
| 2 | hour | 0–23 | — |
| 3 | day of month | 1–31 | — |
| 4 | month | 1–12 | `JAN`–`DEC` |
| 5 | day of week | 0–6, where 0 is Sunday | `SUN`–`SAT` |

The **names** column is the only spelling other than digits a field accepts. A field with
no names accepts none: `JAN` in the minute field is an error, not 1.

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
- `JAN` and `MON` — **the month and day-of-week fields only**: a **name**, which is a
  spelling of the number beside it in the table above and nothing more. Months are
  `JAN` `FEB` `MAR` `APR` `MAY` `JUN` `JUL` `AUG` `SEP` `OCT` `NOV` `DEC`, standing for
  1–12; weekdays are `SUN` `MON` `TUE` `WED` `THU` `FRI` `SAT`, standing for 0–6. Case
  does not matter — `mon`, `Mon` and `MON` are one name. A name may be written anywhere
  a number may: on its own, at either end of a range, as a list item, and as the bounds
  of a stepped range. So `MON-FRI` is 1, 2, 3, 4 and 5, and `MON-FRI/2` is 1, 3 and 5.
  A name in a field that has none is an error.
- `L` — **the day-of-month field only**: the last day of whichever month is being
  tested. 31 in January, 28 in February, 29 in a leap February, 30 in April. It is a
  value and may be a list item — `1,L` is the first and last day of each month — but it
  is not a number, so it cannot be an end of a range. In any other field it is an error.

Values outside a field's range, ranges written backwards, and text that is neither a
number nor a name the field knows are all errors. An expression that is not a string, or
does not have exactly five fields, is an error.

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

Any timezone other than UTC. Expressions using one are refused with an error rather than
silently misread.
