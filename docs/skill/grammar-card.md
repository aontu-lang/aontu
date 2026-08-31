# Aontu grammar card

Everything the language spells, on one page. The published machine
grammar is [`grammar/aontu.gbnf`](../../grammar/aontu.gbnf) (and
`aontu.lark`); this is its human twin.

## Values

| Write | Means |
|-------|-------|
| `{"a":1}`, `a: 1` | a map; keys may be bare or quoted |
| `[1,2]` | a list |
| `"s"`, `1`, `1.5`, `true`, `null` | scalars, as JSON |
| `0d9007199254740993` | an EXACT number, at any magnitude |
| `string integer number float boolean null` | kinds: any value of that kind |
| `top` | anything at all; `nil` is the failure |

## Combining

| Write | Means |
|-------|-------|
| `a & b` | both must hold — the meet |
| `a \| b` | either may hold — the join |
| `*1 \| integer` | either, with `1` the DEFAULT a generation picks |
| | the branch keeps its kind: a later `1.5` is refused, not admitted |
| `x: 1` twice | the two meet; `1 & 2` is an error, `1 & integer` is `1` |
| `$.a.b` | the value at that path of this document |
| `1 + 2` | arithmetic on concrete numbers |

## Maps that say more

| Write | Means |
|-------|-------|
| `{&: {k: integer}}` | a TEMPLATE every key must satisfy |
| `close({a:1})` | no key beyond those named |
| `{a?: 1}` | optional: dropped if unresolved |
| `hide(x)` | evaluated, then dropped from the output |
| `type(x)` | a definition, not a value: it generates nothing |
| `deprecate(x, {msg:"…"})` | still works, and says so |
| `refer(t) & path($.a.b)` | a checked LINK: the tree address must resolve, and `t` flows into it |

## Constraints

`min(n) max(n) above(n) below(n)` bound a number;
`length(n)` and `unique()` bound a list or string;
`re("^…$")` matches a string; `neq(v)` refuses one value;
`must(cond, "why")` is the escape hatch.

Bounds compose: `integer & min(1) & max(10)` is a range, and two
ranges meet to their overlap.

## Files

`@"other.aon"` includes another document — it unifies in, it does not
concatenate. (A constrained decoder is not given this: generated
documents describe values, they do not load files.)
