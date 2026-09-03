# 0001 — Five fields, and only five

## Status

Accepted.

## Context

There are two widely used cron dialects. The Unix one this project implements has five
fields, the smallest of which is a minute. The Quartz scheduler's has six or seven — it
adds a leading seconds field and a trailing year field, and with them a set of special
characters (`?`, `L`, `W`, `#`) whose meaning depends on which field they appear in.

Requests to accept Quartz expressions arrive regularly, usually phrased as "just accept
six fields too".

## Decision

**This library parses five-field expressions and nothing else.** A six-field expression
is an error, not a schedule.

The two dialects disagree about more than field count. In Quartz, day-of-month and
day-of-week are mutually exclusive and one of them must be `?`; here they combine with
OR (`CONTEXT.md`). An expression that is valid in both dialects can therefore mean two
different things, and a parser that accepts both has to guess which the caller meant. A
wrong guess is a schedule that fires on the wrong days and says nothing.

Supporting Quartz properly means a second parser, a second set of matching rules, and a
way for callers to say which dialect they are writing. That is a different library.

## Consequences

- `parse` refuses anything that is not exactly five fields, with the count it saw.
- The special characters `?`, `W` and `#` are not implemented and will not be. `L` is a
  separate question — it exists in the Unix dialect too — and is merely unbuilt.
- Anyone needing Quartz should use a Quartz parser.
