# The definition

The formal definition of the aontu language, in Lean 4: what a value
admits, the order between values, and what any `subsume` must answer,
written as relations that say what the right answer is and not how to
compute it. The plan is
[sketch/DEFINITION.0.md](../sketch/DEFINITION.0.md) and the
decision is ADR-069.

It is one definition. Every module reads one model of the data, one
syntax of values, and one admission relation, under one namespace,
`Aontu`, and no module declares a copy of its own. It is not a third
implementation: `ts/` and `go/` implement the language, `test/spec/`
holds the shared rows they are held to, and `spec/` says what those
rows should expect.

It says what values mean and nothing about text. A value of
`Aontu/Syntax.lean` is a term, not a text, and the data of
`Aontu/Data.lean` are aontu's own values, not JSON: numbers in the
language's four leaves, each held as what it is, strings, booleans,
null, maps, and lists. How a file becomes either is the business of
the [grammar](../grammar/aontu.abnf) and of each port's reader. The vet
modes are not reading alone: they change what `valid` means, so the
plan makes them parameters of the definition. The data holds every
leaf either mode reads a number into, and stating each mode's reading
is still to come. The oracle writes its cases as text for the ports to
run, so its printer, `Oracle/Print.lean`, sits beside it, outside the
definition.

JSON Schema is not a concept of the language, and nothing here
mentions it. The language's part is power: what the importer writes
for a JSON Schema keyword is an aontu value, such as
`number & mulof(1)` for the whole numbers, and the definition says
what that value means on its own terms. The importer is a tool, held
to the JSON Schema suite.

## Layout

| Path | Holds |
|---|---|
| `Aontu/Data.lean` | the data, scalars first: the four leaves, each a type named as aontu names it and holding exactly its leaf's numbers: `Integer`, a whole number with the proof that the `integer` leaf holds it (`IntegerLeaf`); `Float`, a float as its binary64 fields, with the decimal it shows; `BigInteger`; `BigDecimal`; then `Number`, the four together; strings; then `Data`, with maps and lists, `Same`, which compares two values as values, paths into a value, `WellFormed` (no key twice in a map), and `Data.eqb`, which decides whether two data are one Lean `Data`. `ℤ` and `ℕ` are Lean's `Int` and `Nat` |
| `Aontu/Arith.lean` | `Fn`, every function a call names, the calls on bags and text among them and the ten components of the component tree (`Cmp`), whose rules `Aontu/Verdict.lean` holds; the functions on numbers, `add`, `sub`, `mul`, `div`, `mod`, `rem` and `-`, by the tower's rules (`Number.arith`): an integer with an integer exact and in the `integer` leaf, anything with a float the double nearest the exact answer (`Float.nearest`, a tie to the even significand), a float with an exact big number no value, and otherwise the widest exact leaf, a big decimal within the exactness budget and never divided; division truncates toward zero, `rem` takes the dividend's sign and `mod` the divisor's, and a zero divisor gives no value; and the folds on a bag's members (`Number.fold`): `sum` adds them from the left, from the integer zero, and `least` and `greatest` answer the first no other is below or above; a number rounded up or down in its own leaf, exactly (`Number.round`); and a number as `+` writes it beside a string (`Number.text`), a float as JavaScript writes a number |
| `Aontu/Text.lean` | the escaping conventions `esc` writes and `usc` reads back, on a string's code points, `Escape.esc` and `Escape.usc`: C and JSON in double quotes, single-quoted C, standard SQL, POSIX shell quoting, XML's five entities, percent-encoding over UTF-8 (`utf8Bytes`, and `utf8Decode`, strict) and a pattern's metacharacters, each inverse refusing text no text escapes to; the words of a name (`nameWords`) and the nine spellings `nom` writes them in (`NameStyle.write`), in ASCII case; and what `rep` and `split` make of a pattern's matches, read as Go's regexp reads them: `Match`, where one falls and what its groups captured, the scan that reads them from the left (`scanMatches`), the fields they cut (`cutFields`), and what a replacement writes for each (`expandSub`, `replaceMatches`) |
| `Aontu/Syntax.lean` | the values, one constructor per construct, scalars first: the kinds, the four number kinds among them, `string & empty()`, and the words `map` and `list` as the kinds of the containers, scalar literals, numbers of every leaf among them, the bounds `min`, `max`, `above`, and `below` (the constructor `beneath`, since Lean keeps `below`), each with a number or a string at its end (`Bound`), `neq`, `mulof`, `len`, `unique`, `re`, and `format`, maps with optional keys, a spread and a seal, lists with a spread and a seal, `\|` with each arm's rank, `*` alone, `&`, aliases, paths, the trial schemas `nof`, `must`, `when`, `contains` and `rest`, with `Cover`, the record of trials a `rest` reads a member through, and the selections `match`, as `select`, and `filter`; `key`, the key of the member a spread is tried on, which `Val.atKey` writes in at the spread's own position; `keyUp`, `key(n)` as written, which `keyUpAt` reads at a position, with `Step`, a step of one, and `stepped`; `call`, a call on numbers, which the reading makes; `hole`, the placeholder `_`, which a generator's template binds to its member; the riders `meta`, `deprecate` and `ident`, one form `ride` with its `Rider` and a `Record`, the members of a map of data, and the marks `type()` and `hide()` among them, which a term carries at its own position through `&` and the riders (`Val.hasMark`); `Env`, the alias declarations; and `super`, the parent type of a term, which `*x` alone widens to |
| `Aontu/Admits.lean` | `Host`, what the definition leaves to the engines, which strings a pattern matches and which a format reads, which patterns lie in the subset `rep` and `split` hand the host's pattern engine, how many groups such a pattern captures and where its leftmost match falls, and how a string changes case, as the opaque constant `host`, which the oracle runs as `oracleHost`, reading fixed patterns alone (`fixedPieces`, `fixedFind`); `Judge`, the trial of a value on a datum and its answer, one inference rule per form and per answer, with `Admits` the answer `true` and `Refuses` the answer `false`, where a name with no declaration, a path left unread and a `key` no spread has read refuse every value, the answer for a reading the definition was not given; a map's spread judged on each member under the member's key, a list's under the element's position; the trial schemas `nof`, `must`, `when` and `contains` among the forms, the first two counting the branches that admit the datum and judging as the count's term judges the count, the third holding the datum to the branch its condition picks, the fourth counting the members of the datum its term admits, the fifth holding each member no cover evaluates to its term; `judge_unique`, that no value both admits and refuses a datum; `judge_root`, that no rule reads the root, so a judgement under one root is a judgement under any; and `Instance`, the question `aontu vet` answers, which only a value can satisfy |
| `Aontu/Names.lean` | `Decls`, a document's alias declarations and the environment they make, each body read without the `ident()` that is its identity (`Val.unident`) and without its marks, at every depth (`Val.unmark`); `Val.refs` and `Val.unguardedRefs`, the names a value refers to, and those it reaches with no key and no element between; `Recursive`, a name that refers to itself through any number of declarations; `Guarded`, the alias-cycle rule, that no name does so with nothing between; `close`, the closure computed by rounds and admitted by `recursiveB_iff` and `guardedB_iff`; and `alias_self_judges_nothing`, that a name declared as itself admits nothing and refuses nothing |
| `Aontu/Alias.lean` | how a document reads under its declarations: `expand`, each reference to a name that is not recursive replaced by the meet of its bodies, and a reference to a recursive name left as a residual; `Decls.envE`, the environment of expanded bodies; `meetD`, the meet in which a residual expands by one level against concrete structure and never against `any`, a reference or a connective, and a literal meets a term by the checker that reads the names, `litMeetD`, beside `admits_meetD`; `normaliseD`; `checkD` and `checkR`, the checker whose hook unfolds a name against the data, a stack holding the names being unfolded at one datum, beside `checkR_iff` under the alias-cycle rule, that its `true` is admission and its `false` refusal; `normaliseD_checkableA`, that the meet keeps a term the checker can read; and `OutputD` with `outputD_admits` and `outputD_iff` |
| `Aontu/Paths.lean` | how a path reads: `Val.at`, the term at a path, through maps by key and lists by index, the riders around either read through (`Val.unride`), and through nothing else; `pathName` and `Val.pathsToAliases`, each path read as a reference to a name; `Decls.ofPaths` and `Decls.withPaths`, the names declared as the terms at the paths in the root, the normal form of the schema met with the data; `Decls.Resolves`, that every path resolves in the schema's own tree; and `VetP` with `vetP_iff`, the verdict of a document with paths |
| `Aontu/Order.lean` | the order `⊑`, its ends, the meet as its greatest lower bound, the strict bounds under their closed ones (`above_le_min`, `beneath_le_max`), ADR-045's merge as a theorem, and `SubsumeCorrect`, the contract any `subsume` must meet |
| `Aontu/Subsume.lean` | the profiles of `subsume`: the reference's table, "Rules, by value former", as theorems of `⊑`, the ends (`le_nil_iff`, `any_le_iff`), the kinds (`leaf_le_leaf_iff`, `number_not_le_leaf`), the literals (`lit_le_lit_iff`), the bounds, patterns and formats under the kinds that cover their domains, with `re_not_le_string` and `max_str_not_le_string` where `string`, which refuses `""`, covers none, disjunction (`or_le_iff`, `le_or_of_mem`), preference (`pref_le_or`, `or_le_pref`) and the meet (`le_meet_iff`); `Profile`; `DefaultsLe`, the order the default profile asks, every default the specific side declares at a position the general side declares there too (`Val.declaresDefault`), with `defaults_sees_the_default`, `defaults_sees_through_riders`, since a rider declares what its value declares, and `DefaultsLe.of_lit`, since a literal declares none; `GenLe`, the marks agreeing at every position both sides have, a container's spread among them (`MarksAgree`, `hide_not_genLe`, `hide_spread_not_genLe`); `defaultsAt` and `marksAt`, what `defaults` and `gen` ask at one position, decided, walked through every position both sides have by `defaultsBelow` and `marksBelow`, so that `defaultsLe_of_walk` and `genLe_of_walk` prove each profile's order where `leDecF` proves the order and the walk fails nowhere, and `not_defaultsLe_of_refutes` and `not_genLe_of_refutes` refute it at one position; `ProfileCorrect`, one contract per profile, the `values` profile's being `SubsumeCorrect`; `map_le`, `list_le` and `not_le_map_required`, the table's rows for maps and lists, the members' order carried to the root they are judged under by `admits_of_le`; the constraint algebra's own rows, an interval below one that contains it (`min_le_min_iff`, `max_le_max_iff`, `min_le_above_iff`, `above_le_min_of_le` and the rest, for numbers and for strings), a concrete number below the bounds that admit it (`lit_le_min_iff` and the rest), `neq_le_neq` and `len_le_len`; `map_le_spread` and `list_le_spread`, a spread on the general side holding every member of the specific side, and `mulof_le_mulof`, `mulof(a)` below `mulof(b)` where `a` is a multiple of `b`, on `Number.multipleOf_trans`; `leDecF`, the order decided with its proof where the scalars, the connectives, two maps and two lists decide it, so that `leDecF_sound` holds by construction; `not_le_of_witness`, that an instance one value admits and the other refuses puts the first outside the order; and the order on documents, `InstanceD` and `LeD`, each side read under its own declarations as `vet` reads it, with `SubsumeCorrectD`, `instance_of_checkable` and `leD_of_le`, that two readings that read no name are ordered as under the empty environment, `alias_le_unroll` and `unroll_le_alias`, that a recursion and its unrolling are below each other, `not_leD_of_witness`, refuting by `checkR`, and `leDecD`, the order on documents decided where both readings read no name |
| `Aontu/Meet.lean` | `meet`, the meet computed as the engines compute it, one step at a time: `nil` the zero and `any` the unit, a disjunction met arm by arm with its dead arms dropped, a preference alone as `x \| super(x)`, two maps merged key by key and two lists position by position, each member met with the spread read under its key and its selection made (`Val.selectNow`), a literal met with what admits it, two references to one name met in that name, and two atoms that share no value met in `nil`; beside `admits_meet`, the theorem that the term it computes admits a value exactly when both sides do, and `normalise`, a term met with `any` |
| `Aontu/Output.lean` | `Gen`, what a term generates, by recursion on the term: a literal its value, a map its declared keys that generate, but an optional one whose value generates an empty map or list, a list its positions, a disjunction what the arms the rank rule picks all generate, a meet left as written what one side generates and the other admits; `Val.visible`, a term's visible part, each marked member of a map optional and holding anything; `Output`, `Gen` of the visible part of the normal form; `output_admits`, ADR-007; `output_unique`; and `gen`, which computes it, beside `gen_iff` |
| `Aontu/Verdict.lean` | `selectArm` and `resolveD`, a term with its selections made, read for the member a generator's template is read for, each hole reading as it, and at the position the term stands at, each `key(n)` reading it (`keyUpAt`), a template standing where its instance lands and a `filter`'s condition where the member it tries lands, as `keptAt` counts, each `each` the list of its template read for each member of its data (`Val.members`), each `pack` the open map of its template read for each member under the member's key (`Val.keyedMembers`), each `match` the result its arms select for the value its scrutinee generates, each `filter` the members its condition admits, read for each member it tries, and each call the term `callTerm` makes: a `+` what `plusOf` makes of its operands, two numbers added, text joined, two lists concatenated (`plusOf_lists`, `plusOf_nil_list`, `plusOf_list_lit`), `nil` for a sum no leaf holds, and itself, waiting, for operands it does not take; a `join` what `joinOf` makes, the members' texts joined, an error for a member with no text, a separator that is no string or a value that is no bag, and itself, waiting, where a member or the separator is not settled; a `pick` and a `sort` what `pickOf` and `sortOf` make, never waiting, the list of what a projector reads in each member (`Val.project?`, a key in a map member and an index in a list member) and the members ordered by the keys it reads, by exact value or by code point, equal keys in their order (`sortLe`), and an error for a member that lacks what the projector names, keys of no one order, or an argument outside the function's domain; an `upper` and a `lower` what `caseOf` makes, the run of code points a range selects (`caseSpan`) converted by the host's case conversion, or a number rounded in its own leaf (`Number.round`); a `translate` what `translateOf` makes, each code point its sets name written by its last naming (`expandSet`, `translateChar`); an `esc` and a `usc` what `escOf` makes, the text written in a convention of `Aontu/Text.lean` or read back out of it; a `super` its argument's parent type, `Val.super` read before the normal form, so that a preference reads as its default; a `split` what `splitOf` makes, the fields a literal separator cuts a string into (`splitText`), or a pattern's matches do (`Host.cut`); a `rep` what `repOf` makes, the text with each match replaced (`replaceMatches`); a `nom` what `nomOf` makes, the name in one spelling or the sealed map of all nine; a component's call what `cmpOf` makes, the sealed node of its name, its props and its children, as one table of the props each admits and the components each holds says (`Cmp.props`, `Cmp.kids`); neither waits, so a call handed a pattern reads to a term the checker can read (`resolveD_expandF_split`, `resolveD_expandF_rep`); and any other call the number `callValue` computes, a fold from the members of its one bag that the output would hold (`Val.members`) and any other function from its arguments, each a number in its normal form, and `Decls.readR`, how a document reads, from the top, and `Decls.readU`, the root a path reads, its keys as written, with `selectArm_first`, `selectArm_next`, `selectArm_default`, `resolveD_filter_list` and `resolveD_filter_scalar`, and of the folds `Number.least_mem`, `Number.least_lowest`, `Number.greatest_mem` and `Number.greatest_highest`; `Vet`, the verdict `vet` gives under a mode: `error` for an `ident()` out of its place, read in the text, a body no reference reads included (`Decls.identMisplaced`), and for a schema whose normal form holds a `nil` outside a spread, a preference clash, a size its container literal breaks (`sizeClash`, the size's upper half against the count of what the literal generates), or a call the reading could not make, `invalid` where the meet with the data is dead or refuses, read whole, the value it gives with its trials and sizes unread (`Val.untried`, `RefusedAt`), `valid` where it singles out a value, and without the fill where the data is an instance too, `incomplete` otherwise; `vet` computes it beside `vet_iff`; and the theorems `vet_strict_valid_instance`, `vet_valid_filled` and `vet_invalid_refuses` |
| `Aontu/Trial.lean` | the trial schemas as theorems: `judge_must_iff_nof`, that `must(c, m)` asks what `nof(1, c)` asks (ADR-055); `judge_nof_zero`, that `nof(0, c)` is the complement of `c`, JSON Schema's `not` (ADR-049); and `judge_when_iff` and `when_nil_refuses`, that a conditional holds a value to the branch its condition picks, an `else` not written reading as `any`, and that `when(c, nil)` refuses every value `c` admits (ADR-050); and `judge_contains_empty` and `contains_refuses_scalar`, that `contains(c, n)` over an empty list judges as `n` judges `0`, and that a scalar, which has no members, is refused (ADR-051); and `rest_admits_scalar` and `rest_nil_closes`, that `rest` admits a scalar and that `rest(nil)` with no cover admits a container only where it has no members (ADR-058) |
| `Aontu/Check.lean` | `checkWith`, the checker with a hook for names, beside `checkWith_judge` and `checkWith_iff`, the theorems that make its answer the definition's judgement, `true` admission and `false` refusal, on every value that reads no pattern and no format, given a hook whose answers are judgements where it is asked (`HookOk`); `check`, the checker with no hook, beside `check_iff` on every checkable value, one that reads no alias, no path, no pattern and no format; `checkSuper`, which judges by the parent type, beside `checkSuper_iff`; `Data.wf`, which decides that a Lean `Data` is a value, beside `Data.wf_iff`; and `Data.same`, which decides `Data.Same`, beside `Data.same_iff` |
| `Aontu/Tour.lean` | the examples [`docs/tutorial-definition.md`](../docs/tutorial-definition.md) walks through, each proved, and each a transcript on that page too |
| `Aontu/Axioms.lean` | the axiom gate: `#print axioms` on the named theorems, held by `#guard_msgs` to `propext` and `Quot.sound` |
| `Oracle/Print.lean` | the oracle's printer, from values and data to the text both CLIs read; no part of the definition |
| `Oracle.lean` | the executable: every value of the fragment up to one meet (600) against 24 instances, 14,400 `verdict` rows, each with the verdict `check` gives, which `verdict_exact` makes the definition's, and the words `map` and `list` in 13 values against the same instances, 312 rows, which `kind_verdict_exact` makes the definition's; and, as `oracle bounds`, the second fragment, the bounds beyond `min`, `max`, and `mulof` (115 values) against 30 instances, 3,450 rows, which `bound_verdict_exact` makes the definition's; and, as `oracle choice`, the third, `\|` and `*` over scalars, kinds, bounds, and sealed lists (52 values) against 22 instances, 1,144 rows, which `choice_verdict_exact` makes the definition's; as `oracle gen`, the fourth, what evaluation singles out, `gens` rows which `gen_output_exact` makes the definition's; as `oracle verdict`, the fifth, the verdicts of 57 cases in the three modes, which `vet_verdict_exact` makes the definition's, then the sizes met with container literals (`len_verdict_exact`) and the marks (`mark_verdict_exact`); as `oracle alias`, the sixth, 70 documents with declarations in the three modes, recursive names among them, 210 rows, which `alias_verdict_exact` makes the definition's; as `oracle paths`, the seventh, 60 documents with paths in the three modes, 180 rows, which `path_verdict_exact` makes the definition's; as `oracle trials`, the eighth, 65 documents with trial schemas inside values in the three modes, 195 rows, which `trial_verdict_exact` makes the definition's; and as `oracle subsume`, the ninth, the order between 58 values pairwise, 3,265 `subsumption` rows under the `values` profile, each the answers the contract allows, which `subsume_rows_exact` makes the definition's, and 60 rows more for `map` and `list` against 16 values, which `kind_subsume_rows_exact` makes the definition's; as `oracle subsumedocs`, the tenth, 20 documents with declarations compared pairwise, each read under its own declarations, 310 `subsumption` rows, decided by `leDecD` or refuted by an instance, which `subsume_doc_rows_exact` makes the definition's; and as `oracle forms`, no rows but `forms.tsv`, the spelling of every form of the syntax, each call's held to the printer first |
| `ledger.tsv` | the rows the ports do not answer as the definition does, each with its cause and which side moves; both runners read it by name |
| `forms.tsv` | every form of the definition's syntax with its spelling as the oracle's printer writes it, a word, the name of a call, or a mark of the grammar, generated by `oracle forms`; the check that the JSON Schema importer writes only forms of the definition, `ts/test/jsonschema-forms.test.ts` and `go/jsonschema_forms_test.go`, reads it |
| `forms-outside.tsv` | a form the importer writes that the definition lacks, on its decision in the design note, of which there is none now: the file is empty and bounded at zero; the same check requires each row still written, so a form that enters the definition leaves the file |
| `tools/differential.py` | runs the rows through both CLIs and writes every disagreement by name, the material of the ledger |

The rows live in the eight `def-` files of `test/spec/`, `def-fragment.tsv`
to `def-trial.tsv`, under the `verdict` and `gens` modes of the shared
format, where both ports' spec runners run them as they run every row;
nothing here is needed at test time. A `verdict` row runs
`aontu vet` on data written in aontu, whose literals name their leaf,
so the default reading gives each number the leaf the oracle means:
`0d1.5` is a big decimal, and `1.5` would be a float. No term the
oracle builds holds a literal or a default, so the schema supplies no
member for `--no-fill` to refuse. Core Lean only: no library, no
network.

## What it does not yet hold

None of these has a rule here, so the definition says nothing about
it. Each waits on a later phase of the plan, on a ruling of its §7
not yet built, or, where neither owns it, on the issue that tracks it:

- each read mode's reading of a number, and the exactness budget of a
  big decimal (P1);
- `open()`, which the syntax has no form for, and with it the way out
  of the seal that both ports give a body written `type(open(...))`
  (P2);
- a selection inside a recursive name's body, which the checker reads
  unmade: P3 and P4 landed without it (#403);
- two recursions of one shape under different names, which the order
  leaves undecided (P5);
- `key(n)` deeper in a spread than its own position, which both ports
  read as the member's key (P9);
- a path into a generator's output, which both ports read with the
  keys the generator wrote, where any other path rereads them where it
  lands (decision 22);
- a marked list element, which both ports leave out of the output
  where no reading by position admits the output (decision 18, #421);
- a size that is a disjunction, which both ports refuse as an argument
  (#413);
- a declaration nothing reads, which both ports evaluate, so that a
  conflict inside it is an error (#417).

The rest of the language waits on phases P8 to P12 of the plan:
`copy` written as a call (P8, #445); a hole its call's peer fills,
relative paths and generation with `emit` (P9);
source loading, modules and variables (P10); links and relations
(P11); and grammars (P12).

## Build and run

The toolchain is pinned in `lean-toolchain`: Lean 4.24.1, the newest
release whose oracle loads on macOS 26 and whose strings keep every
proof constructive (ADR-077). With `lean` and `lake` from that release
on `PATH`:

```sh
make spec                                   # every proof, the rows regenerated, the committed copy diffed
cd spec && lake build                       # the proofs alone
cd spec && lake exe oracle > ../test/spec/def-fragment.tsv
cd spec && lake exe oracle bounds > ../test/spec/def-bounds.tsv
cd spec && lake exe oracle choice > ../test/spec/def-choice.tsv
cd spec && lake exe oracle gen > ../test/spec/def-gen.tsv
cd spec && lake exe oracle verdict > ../test/spec/def-verdict.tsv
cd spec && lake exe oracle alias > ../test/spec/def-alias.tsv
cd spec && lake exe oracle paths > ../test/spec/def-path.tsv
cd spec && lake exe oracle trials > ../test/spec/def-trial.tsv
python3 -I tools/differential.py ../test/spec/def-fragment.tsv <workdir> <go-cli> <ts-cli-js>
```

`lake build` ends with no `sorry`, and no named theorem rests on an
axiom beyond `propext` and `Quot.sound`: none uses `Classical.choice`,
so every proof is constructive, and `Aontu/Axioms.lean` fails the
build if one comes to. The rows are a committed generated copy: `make spec` fails when the committed file differs from a fresh
one, as the coverage job does for `ts/dist`. CI runs `make spec` as
`build.yml`'s `spec` job, which fetches the Lean release by hash.

## What is trusted

The relations are the definition and prove nothing about themselves.
Everything executable in it is admitted only beside a proof, `check`
by `check_iff`, which reads its `true` as admission and its `false` as
refusal, and `Data.wf` by `Data.wf_iff`, but one function: the
decimal a float shows, `Float.shortest`, is part of the definition
itself. No theorem states what makes a decimal the shortest; the
function matches the shortest rendering of JavaScript and of Go on
6,381 doubles, normal, subnormal, and extreme. Two predicates are not
stated at all: which strings a pattern matches and which a format
reads are the opaque `host`'s, so a theorem about `re` or `format`
holds whatever they are, and `check` answers neither. The one piece
trusted without proof is the oracle's printer, `Oracle/Print.lean`,
which turns the abstract syntax into the text the CLIs read, and spells a sealed container as `close(…)` only where no open container sits beneath it, a reference or a path counting as one, since `close()` seals every level. It is no part of the
definition: that a port reads the printed text as the value printed is
a claim about the port's reader, which the rows test and no theorem
makes. It spells what the published grammar spells, prints only the
forms the oracle writes, and is reviewed as the definition is.
