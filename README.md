# cron-next

A five-field cron expression parser and next-fire-time calculator. No dependencies, no
build step — plain ES modules and `node:test`.

```js
import { parse, nextRun } from './src/cron.js';

const schedule = parse('0 9 * * *');
nextRun(schedule, new Date('2026-03-01T00:00:00Z'));
// 2026-03-01T09:00:00.000Z
```

`CONTEXT.md` holds the rules this implements — field ranges, the syntax each field
accepts, and how the two day fields combine. Where the code and `CONTEXT.md` disagree,
`CONTEXT.md` is right.

## Running the tests

```sh
npm test
```

## Status

0.1. Ranges, lists, `*`, `L` and step syntax are supported. Named months and weekdays and
timezones other than UTC are not yet — see `docs/adr/` for what is deliberately out of
scope rather than merely unbuilt.
