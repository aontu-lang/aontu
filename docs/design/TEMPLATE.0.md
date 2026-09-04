# The template surface: generators written in the target's own syntax

*Design note, 2026-09-04. The sugar that desugars to
[EMIT.0.md](EMIT.0.md)'s `emit`, and the three string builtins it needs
— `esc`, `usc` and `rep`. Companion to
[G9](../capability-review/g9-transformation.md), which is the plan.
Every claim marked VERIFIED was run against the built CLIs at 0.56.0
and, for output claims, against
[`voxgig/podmind`](https://github.com/voxgig/podmind)'s backend at
`ab7f333`. This note is design; status lives in the
[progress register](../capability-review/progress.md).*

## D1. One rule

A generator is a file in the TARGET's syntax. **A marked line is Aontu
source; every other line is a line of output.** That is the entire
desugaring, and it round-trips: a marked line becomes Aontu verbatim,
an unmarked line becomes a list element in the enclosing template's
`body`.

Nothing else is borrowed from the target's space at the line level, and
nothing target-shaped is borrowed into Aontu: **no line of target code
appears inside an Aontu string.**

## D2. The marker is the target's comment token plus a dash

`//-`, `#-`, `---`, and the block form `/*- … */` where the language
has no line comment. One rule, derivable for a language the profile
table has never seen, and quieter on the page than a colon — which
matters, because a generator file is mostly marker lines and mostly
read rather than written.

A marker is recognised **after leading whitespace and keeps its own
indentation** through the round trip, which is what lets a template be
written where its output appears (D7).

## D3. A value reaches the output through `replace`, not a delimiter

A template may carry a `replace` map. **Its key is an exact string the
body already contains as ordinary target text**; its value is an
expression evaluated against the matched node.

```ts
  //- emit(.client, {match: {pin: string}, esc: sq, replace: {PIN: .pin}, body: [
  seneca.client({type:'sqs',pin:'PIN'})
  //- ]}),
```

`pin:'PIN'` is ordinary TypeScript. There is no hole syntax in it at
all, and that is the point.

### Why not an inline hole

Two spellings were built and measured before this one, and both failed
on the same rock: **any inline delimiter is somebody's syntax.**

`${expr}` breaks twice on this project's own material. The assessed
backend's model carries the bucket name
`podmind01-backend01-file02-${self:provider.stage}`, and a serverless
template must emit `${self:provider.stage}` verbatim — VERIFIED, the
desugaring ate it. And a generated TypeScript file holding
`` log(`handler ${name} ready`) `` collides twice, on `${}` and on the
backtick the canonical form quoted with.

`<-expr->` is better and still not safe. Tested against realistic lines
from twenty languages, **it breaks in ten of twenty-five**:

| clean | breaks |
| --- | --- |
| TypeScript, JavaScript, Go, Python, Rust, Java, Kotlin, PHP, Clojure, SQL, shell, YAML, JSON | Haskell, Scala, Elixir, Erlang, F#, OCaml, Coq, R, Markdown and other prose, HTML comments, C++ in one style |

The breaks are ordinary code — `xs <- mapM (\x -> f x) ys`,
`for (k <- m) yield k -> v`, `x <- c(1,2); 3 -> y`. **There is no
universally safe ASCII pair**, and a design that picks one and moves on
is wrong somewhere it has not looked.

`replace` removes the question rather than answering it. There is no
delimiter to collide, so no profile data, no per-file override, and no
parse-check refusal to write. It also **simplifies the canonical
form**: a body line is a plain string with no concatenation at all —
VERIFIED, zero `+` in the canonical form of the worked generator, where
the hole spelling had one per hole.

### The three substitution rules

1. **A single left-to-right pass over the literal line.** At each
   position the longest matching key wins.
2. **A substituted value is never re-scanned**, so no value can
   introduce a key. This is what keeps substitution from becoming an
   injection channel of its own.
3. **A template's replacements apply to its own literal body lines
   only**, never to results spliced in from a nested `emit`. Those
   carry their own template's replacements and are finished.

### The two static checks

Both look only at the template, before any data — the flavour of static
check the rule layer exists to make possible:

| code | when | why |
| --- | --- | --- |
| `replace_overlap` | one key is a substring of another | ambiguous whatever the order |
| `replace_unused` | a key matches nothing in the body | the template drifted from its map |

VERIFIED, both fire: `replace_overlap: key "P" is inside "PIN"`, and
`replace_unused: key "NOPE" matches nothing in the body`.

**The residual risk is an accidental match** — a key that is also
genuine target text somewhere in the body. `replace_unused` cannot
catch that, and no mechanism can; the mitigation is the same convention
every fragment-replacement tool uses, an upper-case placeholder that
reads as a placeholder. It is a narrower risk than a delimiter's,
because the author chooses the key against a body they can see.

## D4. Escaping: `esc`, `usc`, and escaped by default

```
esc(src: string, variant?: string) : string
usc(src: string, variant?: string) : string
```

Interpolation without escaping is the oldest bug in code generation,
and this surface had it. VERIFIED, with a service named `o'brien` and a
pin of `it's,a:pin`:

```
  let s = await getSeneca('o'brien', complete)
  seneca.client({type:'sqs',pin:'it's,a:pin'})
```

`tsc` rejects that with nine errors. Through the escape it is
`'o\'brien'` and `'it\'s,a:pin'` — **0 errors**, VERIFIED against the
same compiler.

**`esc` is an ordinary string builtin.** It sits beside `upper` and
`lower`, returns a string, composes with `+`, and has no renderer
coupling, so it can land before the profiles do. The name is free in
both ports' function tables, as is `usc`.

**With no variant it is the C escape, JSON canonical** — `\\`, `\"`,
`\n`, `\r`, `\t`, `\b`, `\f`, and control characters as `\uXXXX`. That
one convention covers TypeScript, JavaScript, Java, C, C++, C#, Go,
Rust, Swift, Kotlin, Scala and JSON itself, which is why it is the
default rather than a lookup.

**A variant names a CONVENTION, not a language**, and that is why it is
a variant rather than profile data: several languages share one
convention, and one language has several — a C-family literal escapes
differently in each quote, and SQL spells a literal one way and an
identifier another.

| variant | convention | needed by |
| --- | --- | --- |
| *(none)* | C / JSON, double-quoted | the TypeScript and Go profiles, and JSON output |
| `sq` | single-quoted C-family | the handlers themselves — they write `pin:'…'` |
| `sql` | `''` doubling, standard SQL | the SQL profile |
| `shell` | POSIX single-quote, `'` → `'\''` | generated scripts |
| `xml` | the five entities; covers HTML | any markup target |
| `uri` | percent-encoding | generated URLs and paths |
| `regex` | metacharacters (`regex`, not `re`, which is a builtin) | patterns built from model data |

An unknown variant is a located refusal at the call, never a
pass-through. New conventions arrive by name — Terraform's `$${`/`%%{`
is the obvious next — rather than by teaching a profile a new
behaviour.

**`usc` is the left inverse, and it is partial.** `usc(esc(s)) == s`
for every `s`; `esc(usc(t)) == t` only for canonically escaped `t`,
because several spellings escape to the same value (`\x41` and `A`).
Malformed input — a truncated `\u12`, an undefined `\q` — has no
inverse and is a located refusal (`usc_malformed`), not a
pass-through. It earns its place beyond generation: reading a value
back out of a generated artifact, or out of an external one, is the
same operation.

### Replacements are escaped by default

**A `replace` value is escaped**, with the variant the template
declares. That is the right posture for a code generator and it costs
nothing: the escape is a **no-op on any value that was already safe**,
and a fix on the rest. VERIFIED for the worked generator — no service
name and no message carries a character `esc(_, sq)` would change, so
the twelve files are byte-identical either way.

The variant is declared **once per template**:

```aon
{match: …, esc: sq, replace: {PIN: .pin}, body: [ … ]}
```

with the C default when `esc:` is absent, and `esc: none` as the
explicit opt-out for a replacement that is not going into a literal.

**No metadata on the value, and that is deliberate.** The obvious
alternative is to mark a string as already-escaped so `emit` can skip
the default — but a new value mark has parity, canon-hash and `fmt`
consequences in both ports, and marks leak:
[BUGS §79](../../use-cases/BUGS.md) is a live case of `join` folding a
`hide`-marked child into returned text. Declaring the variant on the
template gets the same result for one word, and **`esc` is then never
written inside a `replace` value at all**, so "was it already applied?"
is a question that never arises.

**Open:** a body needing two literal conventions in one template. Today
that means two templates. A per-key override would need a spelling that
does not collide with a genuine list value, and none of the obvious
ones read well; recorded rather than invented.

## D5. `rep`: one regexp language, used to derive names

```
rep(src: string, re: string, sub: string) : string
```

A generator derives names as much as it interpolates them, and the
assessed backend proves it: its serverless YAML names an SQS queue
`QueueAimIngestProcessEpisode`, derived from the pin
`aim:ingest,process:episode`. Nothing in the language does that today.

**`re` is the same portable subset `re()` takes** — RE2-compatible, no
backreferences, no lookaround, per
[AONTUCONSTRAINTS.0.md](AONTUCONSTRAINTS.0.md). One regexp language in
the document, not two, and the subset's linear-time guarantee matters
more here than in a constraint: a generator runs this over model data.

**`sub` is a substitution string in the JavaScript spelling** — `$1`…
`$9` for numbered groups, `$&` for the whole match, `$$` for a literal
`$`, and `$<name>` for a group RE2 named with `(?P<name>…)`.

**It replaces every match.** `re()` is unanchored and a
replace-the-first default is a footgun in a generator that normalises
separators; anchoring is how you ask for one.

Two refusals rather than silent results, by the same posture as `esc`'s
unknown variant: a pattern outside the subset refuses at the call, and
a `sub` naming a group the pattern does not have refuses rather than
expanding to nothing.

**And an honest limit, measured.** `rep` does not close the motivating
case on its own:

| step | result |
| --- | --- |
| `rep(.pin, "[:,]", " ")` | `aim ingest process episode` |
| `upper(…)` | `AIM INGEST PROCESS EPISODE` |
| wanted | `QueueAimIngestProcessEpisode` |

A string substitution cannot change case, and `upper`/`lower` are
whole-string. **Per-word capitalisation is the gap `rep` reveals rather
than fills**, and there are two candidate answers: case operators in
`sub` (sed and Perl spell them `\u`/`\U`, which departs from the
JavaScript model this note adopts), or a case builtin beside `upper`
and `lower`. Recorded, not chosen — the corpus asks for it, so it
should be settled with `rep` rather than after it.

## D6. The canonical quote is chosen per line

Raw backticks need no escaping and read best, so a body line takes one
unless it holds a backtick, in which case it takes the escaping quote
with `\` and `"` escaped. VERIFIED: `` log(`handler ${name} ready`) ``
survives as `` "  log(`handler ${name} ready`)" ``, where the raw quote
could not represent it at all.

This is the one place the canonical form is allowed to be less pretty,
because representability beats readability in a form no one writes by
hand.

**The residual escape needs no new syntax.** A line that still cannot
be written verbatim — one starting with the marker — is written in a
marker line AS its canonical element, and the re-sugaring leaves it
there because it TESTS the round trip: it rebuilds the target line,
desugars the rebuild, and accepts it only if that reproduces the
canonical line. **The sugar is the fixpoint of the two transforms
rather than a table of escapes**, and an un-representable line is
simply one the fixpoint leaves alone.

## D7. Templates go where their output goes

`emit`'s table argument is an expression, so it can be a literal at the
call site — which means a template is written **exactly where its
output appears**, indented to match, with no new mechanism:

```ts
//- @"./model.aon"
//- @"./wire.aon"
//- svc: $.main.srv & $.wire & pack($.main.srv, {name: key()})
//- files: emit($.svc, {match: {name: string}, esc: sq, replace: {SERVICE: .name}, body: [
import { getSeneca } from '../../env/lambda/lambda'

function complete(seneca: any) {
  //- emit(.listen, {match: {pin: string}, esc: sq, replace: {PIN: .pin}, body: [
  seneca.listen({type:'sqs',pin:'PIN'})
  //- ]}),
  //- emit(.client, {match: {pin: string}, esc: sq, replace: {PIN: .pin}, body: [
  seneca.client({type:'sqs',pin:'PIN'})
  //- ]}),
  //- emit(filter(.on.file.events, {source: 's3'}), {match: {source: 's3', msg: string}, esc: sq, replace: {MSG: .msg}, body: [

  const makeGatewayHandler = seneca.export('s3-store/makeGatewayHandler')
  seneca
    .act('sys:gateway,kind:lambda,add:hook,hook:handler', {
       handler: makeGatewayHandler('MSG') })
  //- ]}),
}

exports.handler = async (
  event:any,
  context:any
) => {
  
  let seneca = await getSeneca('SERVICE', complete)
  
  let handler = seneca.export('gateway-lambda/handler')
  let res = await handler(event, context)
  return res
}
//- ]})
```

That is the whole generator for twelve deployed Lambda handlers.
Indentation is right by construction: a body line is verbatim, so
`  seneca.listen(…)` is indented two spaces because that is where it
belongs in the generated file.

**Nothing in the mechanism is about handlers.** `emit`, `match`,
`replace`, `body`, `esc` and the marker are the whole vocabulary; what
makes this file produce Lambda handlers is the target text in it.

## D8. Whitespace control is absent, and one hazard is not

Every template engine grows trim markers — Jinja's `{%- -%}`, Go
templates' `{{- -}}`, ERB's `<%- -%>` — because a control construct
occupies a line and that line's newline leaks into the output. **This
surface has none and needs none: a marker line is not an output line at
all**, so a construct cannot leak anything. VERIFIED by the handlers,
which reproduce byte-identically including two blank lines and two
lines that are two spaces and nothing else.

The residual is one template used at two depths, and that is what the
fragment algebra's `at` is for — re-indentation on splice belongs to
the renderer, not to a template directive. Unverified: the shared-table
probe used one depth.

**The hazard is the template file's own trailing whitespace.** Those
two-space lines are significant, and an editor set to trim on save
destroys them silently. The canonical form quotes them explicitly, so
it is the artifact of record and a desugar-and-compare check catches
the damage — but the surface has to say so, because the first person
bitten will not guess.

## Verified

| property | result |
| --- | --- |
| Output against `voxgig/podmind` at `ab7f333` | **12 of 12 handler files byte-identical** |
| Round trip, both directions | identical |
| Concatenations in the canonical form | **0** |
| The generator file parsed as TypeScript (`tsc --noEmit`) | **0 syntax errors** |
| `replace_overlap` / `replace_unused` | both fire on a seeded template |
| `esc(_, sq)` on this data | a no-op — the twelve files are identical either way |

The run is an expansion, because `emit`, `esc` and `usc` do not exist
yet; [EMIT.0.md](EMIT.0.md) records the four engine facts that make the
expansion necessary and the builtin unavoidable.

## Open

- **A body needing two escape conventions** — see D4.
- **The marker's own escape.** A target line beginning with the marker
  falls to the fixpoint rule, which works but is not obvious; the
  surface phase should say so in one line of documentation.
- **`fmt` over a template file.** The canonical form is Aontu and
  formats today; the template form needs a rule for how far `fmt` may
  reach into marker lines without touching body lines.
