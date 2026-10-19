/* Copyright (c) 2026 Richard Rodger, MIT License */


// Shard 3 of the executed pages; see SHARDS in docs.test.ts. The
// shard is read when docs.test.ts loads, so it is set before the load.

process.env.AONTU_DOCS_SHARD = '3'

require('./docs.test')
