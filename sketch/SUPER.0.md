# super(): the immediate parent type, structurally

Status: P0 implemented (this document's rules; see the register note
at the end). Owner ruling (Richard, 2026-08-29): `super(x)` must
always answer the immediate parent type of `x`, and must descend into
maps and lists. `top` is the answer only where `top` genuinely is the
immediate parent.

## What was wrong

`super(x)` delegated to the lattice primitive `Val.superior()`, which
serves a different master: the preference override gate (`superpeg`)
and query kind-lifting. That primitive answers `top` for everything
that is not a scalar or a kind — so `super({a:1})`, `super([1])`,
`super(*1)`, `super(1|2)` and `super(min(3))` all answered `top`,
which is a sound answer (top subsumes everything) and a useless one.
The full before/after table is at the end.

`Val.superior()` is NOT changed by this design. The override gate's
semantics (`*{...}`'s gate is `top`, so any conjunct overrides a
ranked default) and `query`'s kind lift stay exactly as they are; the
new semantics live in `super()`'s own resolver, as a structural walk.

## The rules

`superOf(v)`, applied to the RESOLVED argument (`FuncBaseVal` drives
arguments before `resolve()` runs, unchanged):

1. **Concrete scalar → its leaf kind.** `1 → integer`, `1.5 → float`,
   `0d5 → biginteger`, `0d0.1 → bigdecimal`, `a → string`,
   `true → boolean`, `null →` the null kind. Unchanged.
2. **Kind → its parent kind.** The four numeric leaves lift to
   `number`; `number`, `string`, `boolean` and the null kind lift to
   `top` — that IS their immediate parent. `top → top` (fixpoint).
   Unchanged.
3. **Map → the map of its children's supers.** Same keys, each value
   lifted by `superOf`; `optionalKeys` carried over (`?` is shape, not
   value); a spread template is lifted too (`{&: integer} →
   {&: number}`), so the lifted map admits at the lifted level for
   future keys exactly as the original admitted at its own. The
   result is a fresh map (ADR-005 instantiation): `type`/`hide` marks
   are NOT copied — the lift of a hidden definition is output.
4. **List → the list of its elements' supers**, positionally; spread
   lifted as in rule 3.
5. **Preference → the super of its value.** `super(*1) → integer`,
   `super(*integer) → number`: the parent TYPE of a soft value is the
   parent of the value, and softness does not survive typing. (This
   deliberately does NOT reuse `superpeg`, which answers `top` for a
   kind peg — that is gate semantics, rule 0 above.)
6. **Disjunct → the disjunct of its arms' supers**, deduplicated;
   an arm lifting to `top` absorbs the whole answer to `top`.
   `super(1|2) → integer`, `super(1|"a") → integer|string`,
   `super(integer|string) → top` (via `number|top`).
7. **Constraint → the kind it constrains.** A constraint that has
   absorbed a leaf kind answers that kind
   (`super(integer & min(3)) → integer`); otherwise its domain
   answers (`min(3) → number`, `min("a") → string`,
   `re(abc) → string`); a constraint with neither — `length(3)`,
   which applies to strings, lists and maps alike — answers `top`.
8. **Nil → propagates.** `super(1 & 2)` is the conflict, not a type.
   Unchanged.
9. **Recursion residual → symbolic.** `super($.N)` (and a residual
   met during descent, e.g. the `next?` slot of a recursive body)
   stays an unresolved call: canon prints `super($.N)`, generation
   refuses it as any unresolved call. See the boundary below.
10. **Hole → waits**, through the ordinary placeholder machinery
    (`super(_)` fills from a peer, as `upper(_)` does). Unchanged.
11. Anything still unresolved (a held conjunct, a pending reference)
    keeps the call pending, exactly as every other function waits for
    its arguments. Unchanged.

The soundness invariant holds throughout: every non-error answer
subsumes the argument, and the ladder composes —
`super(super({a:1}))` is `{a:number}`.

## The phase boundary: recursion

The lift of a recursive type is itself recursive: the true
`super($.N)` for `N: {v: integer, next?: $.N}` is the fixpoint
`{v: number, next?: <itself>}`. This phase keeps that answer
SYMBOLIC — the deferred call is the mu-term, finite in canon —
rather than giving it expansion moments of its own. Consequences:

- canon: `x: super($.N)` prints as written; descent into a recursive
  body prints `{"v":number,"next"?:super($.N)}` — finite.
- gen: an unexpanded symbolic lift refuses (an optional key holding
  one drops, as `next?: $.N` itself does).
- meet: data unified against a symbolic lift is HELD, so a deep
  instance refuses rather than validating one level and lying below.

A follow-up phase can give the symbolic lift the residual's three
moments (expand one level per meet with structure / symbolic in
canon / refuse at gen) if schema-from-example over recursive types
is wanted. Refusing today is sound; silently answering shallowly
would not be.

## The null print ambiguity (recorded, not fixed)

`super(null)` answers the null KIND, whose canon is `null` — the same
spelling as the value. The ladder is correct (`super(super(null)) →
top`; generating a kind refuses), but a reader of canon output cannot
tell the two apart. Any fix (a distinct kind spelling) is a language
surface change and needs its own ruling.

## The table (engine-probed, both ports byte-identical)

| Input | Before | After |
|---|---|---|
| `super(1)` | `integer` | `integer` |
| `super(1.5)` | `float` | `float` |
| `super(0d5)` / `super(0d0.1)` | `biginteger` / `bigdecimal` | unchanged |
| `super(a)` / `super(true)` | `string` / `boolean` | unchanged |
| `super(null)` | null kind | unchanged |
| `super(integer)` etc. | `number` | unchanged |
| `super(number)` / `super(string)` / `super(boolean)` | `top` | unchanged (top IS the parent) |
| `super(top)` | `top` | unchanged (fixpoint) |
| `super({a:1, b?: x})` | `top` | `{a: integer, b?: string}` |
| `super({&: integer, a: 1})` | `top` | `{&: number, a: integer}` |
| `super({})` / `super([])` | `top` | `{}` / `[]` (nothing to lift) |
| `super([1, a])` | `top` | `[integer, string]` |
| `super(*1)` | `top` | `integer` |
| `super(*integer)` | `top` | `number` |
| `super(1 \| 2)` | `top` | `integer` |
| `super(1 \| "a")` | `top` | `integer\|string` |
| `super(integer \| string)` | `top` | `top` (an arm lifts to top) |
| `super(min(3))` | `top` | `number` |
| `super(min("a"))` | `top` | `string` |
| `super(re(abc))` | `top` | `string` |
| `super(integer & min(3))` | `top` | `integer` |
| `super(length(3))` | `top` | `top` (multi-domain) |
| `super($.T)`, `T: type({a:1})` | `top` | `{a: integer}` |
| `super($.N)` recursive | `top` | symbolic `super($.N)` |
| `super(mul(2,3))` | `integer` | unchanged (resolves first) |
| `super(upper(a))` | `string` | unchanged |
| `super(super(1))` | `number` | unchanged |
| `super($.zzz)` | `no_path` | unchanged |
| `super(1 & 2)` | conflict | unchanged |
| `super()` / `super(1,2)` | `func_arity` | unchanged |

## Implementation

- `ts/src/val/SuperFuncVal.ts`: `resolve()` becomes the `superOf`
  walk; `deferResolve()` answers true while the driven argument holds
  a recursion residual anywhere, riding the ordinary residuate path.
- `go/func.go`: the twin walk in the `super` resolver.
- Shared rows: `test/spec/super.tsv` (new file) pins every row of the
  table's "after" column that the existing 26 scalar/kind rows do not
  already pin. No existing row changes — the old `top` answers were
  never pinned.
- Docs: the `super(x)` section of `docs/reference-language.md` and
  its built-ins table row; `docs/test-coverage.md` spec table.
