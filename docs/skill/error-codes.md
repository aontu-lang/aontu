# What a refusal means

Every Aontu error carries a **code**, and every code has a **class**.
The class says what kind of thing went wrong, which is what decides
your next move. The full registry — every code, its class, and the
version it appeared in — is
[`test/spec/errcodes.tsv`](../../test/spec/errcodes.tsv), which the
test suite holds to the engine in both implementations.

| Class | Meaning | What to do |
|-------|---------|------------|
| `parse` | the text is not a document | fix the syntax at the site the frame points at |
| `conflict` | two values cannot both hold | one of them is wrong: `aontu why <path>` names both and where they were written |
| `incomplete` | nothing contradicts, but the value is not concrete | supply what is missing, or accept it with `--partial` |
| `reference` | a path names nothing | check the spelling; `aontu get $ --keys` lists what is there |
| `compat` | a change breaks an earlier version | that is `aontu subsume` / `aontu breaking` talking: widen the change or version it |
| `budget` | evaluation hit a deterministic limit | usually a cycle; simplify, or raise the budget deliberately |
| `internal` | the engine surprised itself | a bug worth reporting |

## The repair loop

```
aontu vet schema.aon mine.aon --format json
```

The exit code branches for you: `0` valid, `1` invalid (fix the
data), `3` incomplete (supply more), `4` the schema itself is
unusable (fix the truth, not the data). Every finding carries
`path`, `code`, and the sites on both sides — the data site first,
because that is the one to edit.

For a conflict, `aontu why <path> mine.aon` lists every contribution
to that path with its role and source line, which turns "these
disagree" into "these two lines disagree".

Then fix it:

```
aontu set '$.replicas=5' --entry schema.aon --overlay mine.aon --in-place
```

`--in-place` rewrites the pinned literal **where it was written**, so
comments and layout survive. Without it, `set` APPENDS — which is the
right thing when the document left a hole, and cannot work when it
pinned the wrong value, because unification only narrows.

The edit is verified before a byte is written: a site carries the
source text it covers, and the text at the span must match it. Where
that cannot be established — the value comes from a `&:` template or a
`$ref`, two statements pin the path, the site names the opening token
of a compound like `min(1)`, or the overlay `@"includes"` another
document — the assignment is appended as usual and a **warning** says
which case it hit. A warning never changes the verdict, so asking for
`--in-place` cannot make a run fail that would have succeeded.
