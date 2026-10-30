import { types } from 'pg';

// Imported for its side effect by pool.ts, before any query runs.
//
// pg returns PostgreSQL bigint (int8) as a string, because a JS number loses
// precision past Number.MAX_SAFE_INTEGER. COUNT(*) returns bigint, so without
// this parser every count (likes, comments, followers, pagination totals) would
// arrive as a string like "12", and adding to it would concatenate.
//
// No count here comes near 2^53, so parsing to a number is safe. If a bigint
// column that large is ever added, select it as `col::text` instead of removing
// this parser.
types.setTypeParser(types.builtins.INT8, (value) => parseInt(value, 10));
