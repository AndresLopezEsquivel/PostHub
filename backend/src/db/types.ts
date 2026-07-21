import { types } from 'pg';

// pg type-parser fixes. Imported once, for side effects, before any query runs
// (pool.ts imports this at the top).
//
// node-pg returns PostgreSQL `bigint` (OID 20, aka int8) as a STRING to avoid
// silent precision loss past Number.MAX_SAFE_INTEGER. But COUNT(*) is typed
// bigint, and this schema leans on COUNT aggregates everywhere — likeCount,
// commentCount, follower counts, the pagination `total`. Left unparsed they
// arrive as "12", which then string-concatenates instead of adding.
//
// Our counts are page-sized, nowhere near 2^53, so parsing them to a JS number
// is safe. If a genuinely large bigint column ever appears, cast it to text in
// the query (`col::text`) rather than reverting this globally.
types.setTypeParser(types.builtins.INT8, (value) => parseInt(value, 10));
