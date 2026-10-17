# Tutorial: read the formal definition

The [language reference](reference-language.md) describes aontu in
prose. Part of the language is also defined in
[Lean 4](https://lean-lang.org/), in the repository's
[`spec/`](../spec/) directory, as statements a proof checker verifies,
and the test suites hold both engines to that definition.

Read the definition one part at a time. Each rule on the page comes
with a document it admits and a document it refuses, checked twice: as
a Lean example the definition's build proves, and as a transcript of
the engine. You need no Lean beforehand, because each step says what
its notation means where it first appears. The page assumes the
[first tutorial](tutorial-config.md).

## 1. Set up

The definition is four Lean modules and one program:

| File | Holds |
|---|---|
| [`spec/Aontu/Core.lean`](../spec/Aontu/Core.lean) | the fragment the engines' test rows come from: JSON data, nine value forms, what each admits, the order, and a checker proved to agree |
| [`spec/Aontu/Structures.lean`](../spec/Aontu/Structures.lean) | a sketch of more of the language: lists, closed maps, disjunction, preference, aliases, path references, evaluation output and trial schemas |
| [`spec/Aontu/WhatNotHow.lean`](../spec/Aontu/WhatNotHow.lean) | recursion through an alias, and the contract any `subsume` must meet |
| [`spec/Aontu/Tour.lean`](../spec/Aontu/Tour.lean) | the examples this page shows that the other three do not hold |
| [`spec/Oracle.lean`](../spec/Oracle.lean) | the program that writes the engines' test rows from the fragment |

You can follow the page without installing Lean. Every Lean fence on it
quotes one of these files, and the documentation test checks that each
quote is still that file's text. To check the proofs as well,
install the Lean release that
[`spec/lean-toolchain`](../spec/lean-toolchain) names, and from the
repository root run:

<!-- test: skip needs the Lean toolchain, which no transcript runs -->
```sh
make spec
```

That builds every module, which checks every proof, then regenerates
the test rows and fails if they differ from the committed copy.

The transcripts run [`aontu vet`](reference-api.md#aontu-vet) with two
flags: `--no-fill` checks the data as written rather than as the schema
could complete it, and `--exact-numbers` reads each data number by its
exact value. The definition answers for those two modes. Each step's
schema states its value at two keys, `admitted` and `refused`, and the
data gives each key one document. A finding names the key the engine
refused, and the exit code says which kind of refusal it was: `1` for
`invalid`, `3` for `incomplete`, `4` for `error`.

## 2. The data

The definition starts with what a JSON document is:

<!-- test: quote spec/Aontu/Core.lean -->
```lean
/-- JSON data. Numbers are integers only in this fragment. -/
inductive Json where
  | null
  | bool (b : Bool)
  | int (n : Int)
  | str (s : String)
  | obj (fs : List (String × Json))
```

`inductive` lists every way to build a value of a new type, one
constructor per line. A document here is `null`, a boolean, an
integer, a string, or an object, and `List (String × Json)` reads "a
list of pairs of a string and a document". The fragment leaves decimals
and arrays out; arrays return in [step 10](#10-lists-and-closed-maps).

## 3. The values

The value forms come next, each with its aontu spelling in the comment:

<!-- test: quote spec/Aontu/Core.lean -->
```lean
/-- The value forms of the fragment. -/
inductive Val where
  | top                                       -- `any`
  | nil                                       -- `nil`
  | int                                       -- `integer`
  | wholeNum                                  -- `number & multiple(1)`
  | str                                       -- `string`, never `""`
  | anyStr                                    -- `string & empty()`
  | min (m : Int)                             -- `min(m)`
  | field (k : String) (opt : Bool) (v : Val) -- a map holding `k: v`, or `k?: v`
  | meet (a b : Val)                          -- `a & b`
```

Two of the lines record a choice the language makes. `str` is `string`,
which never holds the empty string, and `anyStr` is `string & empty()`,
which holds `""` as well. `field` is a map that declares one key, and
its `opt` flag says whether the key is optional.

## 4. What a value admits

One definition says which documents each value admits:

<!-- test: quote spec/Aontu/Core.lean -->
```lean
/-- `admits v j`: the JSON `j` is an instance of the value `v`. This is the
definition every engine answer is held to. -/
def admits : Val → Json → Prop
  | .top, _ => True
  | .nil, _ => False
  | .int, j => ∃ n, j = .int n ∧ intRange n
  | .wholeNum, j => ∃ n, j = .int n
  | .str, j => ∃ s, j = .str s ∧ s ≠ ""
  | .anyStr, j => ∃ s, j = .str s
  | .min m, j => ∃ n, j = .int n ∧ m ≤ n
  | .field k opt v, j => j.isObj = true ∧ keyOk opt (admits v) (j.get? k)
  | .meet a b, j => admits a j ∧ admits b j
```

Read each line as a rule: the value on the left admits the document `j`
exactly when the statement on the right holds. The result type `Prop`
is a statement, true or false, that Lean establishes by proof and never
by running anything. `∃ n, j = .int n ∧ intRange n` reads "there is an
`n` such that `j` is the integer `n` and `n` is in range". `True` holds
of every document and `False` of none.

The examples state facts in the same terms.
`example : admits .int (.int 3)` claims that `integer` admits `3`, and
what follows `:=` is the proof, which the build checks. A claim that
opens with `¬` says the value refuses the document.

### The two ends: `any` and `nil`

`any` admits every document and `nil` admits none. They are the
[top](unification.md) and the [bottom](unification.md) of the
[lattice](unification.md):

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `any` admits `null`. -/
example : admits .top .null := trivial

/-- `nil` refuses `null`, and everything else. -/
example : ¬ admits .nil .null := fun h => h
```

`trivial` proves `True`. For `nil`, `fun h => h` takes a supposed proof
that `nil` admits `null`, which by the rule is a proof of `False`, and
hands it back as the contradiction `¬` asks for. Write `ends.aontu`:

<!-- test: scenario ends -->
<!-- test: file ends.aontu -->
```aontu
admitted: any
refused: nil
```

and `ends.json`:

<!-- test: file ends.json -->
```json
{"admitted": null, "refused": null}
```

Now vet the data against the schema:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers ends.aontu ends.json
verdict: invalid

$.refused: literal_nil [conflict]
...
$ echo $?
1
```

The only finding is at `$.refused`, so `any` admitted its `null`.

### Integers, within a range

In the fragment, `integer` holds the integers no larger in size than
2^53, every one of which a float64 holds exactly:

<!-- test: quote spec/Aontu/Core.lean -->
```lean
/-- The integers `integer` holds. Simplified: the engine also holds the
larger integers a float64 represents exactly, such as 10^18. -/
def intRange (n : Int) : Prop := n.natAbs ≤ 9007199254740992
```

The comment marks a simplification: both engines also admit the larger
integers a float64 holds exactly, such as 10^18, which the fragment's
`integer` refuses. `number & multiple(1)` holds every whole number:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `integer` admits `3`. -/
example : admits .int (.int 3) := ⟨3, rfl, by simp [intRange]⟩

/-- `integer` refuses `"a"`. -/
example : ¬ admits .int (.str "a") := by simp [admits]

/-- `integer` refuses `9007199254740993`, which a float64 cannot hold. -/
example : ¬ admits .int (.int 9007199254740993) := by simp [admits, intRange]

/-- `number & multiple(1)` admits it. -/
example : admits .wholeNum (.int 9007199254740993) := ⟨_, rfl⟩
```

`by simp [admits]` asks Lean's simplifier to unfold the rule and finish
the proof, and `by decide` evaluates a statement that has a yes or no
answer. Write `integers.aontu`:

<!-- test: scenario integers -->
<!-- test: file integers.aontu -->
```aontu
admitted: integer
refused: integer
beyond: integer
wide: number & multiple(1)
```

and `integers.json`:

<!-- test: file integers.json -->
```json
{"admitted": 3, "refused": "a", "beyond": 9007199254740993, "wide": 9007199254740993}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers integers.aontu integers.json
verdict: invalid

$.refused: no_scalar_unify [conflict]
...
$.beyond: no_scalar_unify [conflict]
...
$ echo $?
1
```

`beyond` and `wide` hold the same number. `integer` refuses it, since
no float64 holds it exactly, and `number & multiple(1)` admits it.

### Strings are never empty

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `string` admits `"a"`. -/
example : admits .str (.str "a") := ⟨"a", rfl, by decide⟩

/-- `string` refuses `""`. -/
example : ¬ admits .str (.str "") := by simp [admits]

/-- `string & empty()` admits `""`. -/
example : admits .anyStr (.str "") := ⟨"", rfl⟩
```

Write `strings.aontu`:

<!-- test: scenario strings -->
<!-- test: file strings.aontu -->
```aontu
admitted: string
refused: string
empty: string & empty()
```

and `strings.json`:

<!-- test: file strings.json -->
```json
{"admitted": "a", "refused": "", "empty": ""}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers strings.aontu strings.json
verdict: invalid

$.refused: string_empty [conflict]
...
$ echo $?
1
```

The engine calls the refusal `string_empty`. `string` holds every
string but `""`, and `& empty()` admits that one too.

### Bounds

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `min(3)` admits `3`. -/
example : admits (.min 3) (.int 3) := ⟨3, rfl, by decide⟩

/-- `min(3)` refuses `2`. -/
example : ¬ admits (.min 3) (.int 2) := by simp [admits]
```

Write `bounds.aontu`:

<!-- test: scenario bounds -->
<!-- test: file bounds.aontu -->
```aontu
admitted: min(3)
refused: min(3)
```

and `bounds.json`:

<!-- test: file bounds.json -->
```json
{"admitted": 3, "refused": 2}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers bounds.aontu bounds.json
verdict: invalid

$.refused: constraint [conflict]
...
$ echo $?
1
```

The rule is `m ≤ n`, so `min(3)` admits `3` itself.

### Keys, required and optional

A map's key goes through one more definition, which decides what an
absent key means:

<!-- test: quote spec/Aontu/Core.lean -->
```lean
/-- A key's slot: an absent key passes only where the key is optional. -/
def keyOk (opt : Bool) (p : Json → Prop) : Option Json → Prop
  | none => opt = true
  | some x => p x
```

`Option Json` is either `none`, an absent key, or `some x`, a key that
holds `x`. An absent key passes only where the key is optional, and a
present one must hold what its value admits:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x: integer}` admits `{"x": 1}`. -/
example : admits (.field "x" false .int) (.obj [("x", .int 1)]) := by
  simp [admits, keyOk, Json.get?, Json.isObj, lookup, intRange]

/-- `{x: integer}` refuses `{}`. -/
example : ¬ admits (.field "x" false .int) (.obj []) := by
  simp [admits, keyOk, Json.get?, Json.isObj, lookup]

/-- `{x?: integer}` admits `{}`. -/
example : admits (.field "x" true .int) (.obj []) := by
  simp [admits, keyOk, Json.get?, Json.isObj, lookup]

/-- `{x?: integer}` refuses `{"x": "a"}`. -/
example : ¬ admits (.field "x" true .int) (.obj [("x", .str "a")]) := by
  simp [admits, keyOk, Json.get?, Json.isObj, lookup]
```

The formatter writes a map under a key as a path, so
`admitted: x: integer` is `admitted: {x: integer}`. Write `keys.aontu`:

<!-- test: scenario keys -->
<!-- test: file keys.aontu -->
```aontu
admitted: x: integer
refused: x: integer
optional: x?: integer
wrong: x?: integer
```

and `keys.json`:

<!-- test: file keys.json -->
```json
{"admitted": {"x": 1}, "refused": {}, "optional": {}, "wrong": {"x": "a"}}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers keys.aontu keys.json
verdict: invalid

$.refused.x: mapval_no_gen [incomplete]
...
$.wrong.x: no_scalar_unify [conflict]
...
$ echo $?
1
```

The two refusals are of different kinds. At `$.refused.x` nothing
contradicts the schema, but a required key is missing, so the class is
`incomplete`; at `$.wrong.x`, `"a"` can never be an integer. The
definition says only that the value refuses both, and the class is the
engine's.

### Conjunction

The last rule, for `a & b`, asks both sides:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `integer & min(3)` admits `7`. -/
example : admits (.meet .int (.min 3)) (.int 7) :=
  ⟨⟨7, rfl, by simp [intRange]⟩, ⟨7, rfl, by decide⟩⟩

/-- `integer & min(3)` refuses `2`. -/
example : ¬ admits (.meet .int (.min 3)) (.int 2) := by simp [admits]
```

Write `meet.aontu`:

<!-- test: scenario meet -->
<!-- test: file meet.aontu -->
```aontu
admitted: integer & min(3)
refused: integer & min(3)
```

and `meet.json`:

<!-- test: file meet.json -->
```json
{"admitted": 7, "refused": 2}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers meet.aontu meet.json
verdict: invalid

$.refused: constraint [conflict]
...
$ echo $?
1
```

`2` fails `min(3)`, though `integer` alone admits it.

## 5. The order, and the meet

The definition orders values by what they admit:

<!-- test: quote spec/Aontu/Core.lean -->
```lean
/-- `a ⊑ b`: every instance of `a` is an instance of `b`. `subsume b a`
answers this question. -/
def Le (a b : Val) : Prop := ∀ j, admits a j → admits b j

infix:50 " ⊑ " => Le
```

`∀ j` reads "for every document `j`" and `→` reads "implies", so
`a ⊑ b` says every instance of `a` is an instance of `b`. Three theorems
make `&` the [meet](unification.md) of that order, its greatest lower
bound:

<!-- test: quote spec/Aontu/Core.lean -->
```lean
theorem meet_le_left (a b : Val) : Val.meet a b ⊑ a := fun _ h => h.1
theorem meet_le_right (a b : Val) : Val.meet a b ⊑ b := fun _ h => h.2
theorem le_meet {a b c : Val} (ha : c ⊑ a) (hb : c ⊑ b) : c ⊑ Val.meet a b :=
  fun j h => ⟨ha j h, hb j h⟩
```

The first two put `a & b` below each side, and `le_meet` puts anything
below both sides below `a & b`. `fun _ h => h.1` is the whole first
proof: an instance of `a & b` is an instance of `a`, by the rule for
`meet`.

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `integer` is above `integer & min(3)`. -/
example : Val.meet .int (.min 3) ⊑ .int := meet_le_left _ _

/-- `integer & min(3)` is not above `integer`: `2` is the instance that
shows it. -/
example : ¬ (Val.int ⊑ Val.meet .int (.min 3)) := fun h =>
  absurd (h (.int 2) ⟨2, rfl, by simp [intRange]⟩) (by simp [admits])
```

`aontu subsume` answers this question, the general document first.
Write `wide.aontu`:

<!-- test: scenario order -->
<!-- test: file wide.aontu -->
```aontu
v: integer
```

and `narrow.aontu`:

<!-- test: file narrow.aontu -->
```aontu
v: integer & min(3)
```

Now ask both ways:

<!-- test: run -->
```sh
$ aontu subsume wide.aontu narrow.aontu
verdict: subsumes
$ aontu subsume narrow.aontu wide.aontu
verdict: does_not_subsume

$.v: compat_narrowed [compat]
...
$ echo $?
1
```

`compat_narrowed` is the engine's way of saying what the second example
proves: `integer` admits a document, such as `2`, that
`integer & min(3)` refuses.

## 6. Two declarations of one key

When a document declares one key twice, the engine merges the two
declarations into one field:

<!-- test: quote spec/Aontu/Core.lean -->
```lean
def mergeField (k : String) (o₁ o₂ : Bool) (v₁ v₂ : Val) : Val :=
  .field k (o₁ && o₂) (.meet v₁ v₂)
```

The merged key is optional only where both declarations say so
(`o₁ && o₂`), and its value is the meet of the two. A theorem states
that the merge loses nothing and adds nothing:

<!-- test: quote spec/Aontu/Core.lean -->
```lean
/-- The merge is exact: it admits what the two declarations admit together. -/
theorem mergeField_exact (k : String) (o₁ o₂ : Bool) (v₁ v₂ : Val) (j : Json) :
    admits (mergeField k o₁ o₂ v₁ v₂) j ↔
      admits (.meet (.field k o₁ v₁) (.field k o₂ v₂)) j := by
```

`↔` reads "exactly when". A quote that ends at `:= by` stops before the
proof, which follows in the file and which the build checks.

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x?: integer} & {x: integer}` refuses `{}`: the key is required. -/
example : ¬ admits (mergeField "x" true false .int .int) (.obj []) := by
  simp [mergeField, admits, keyOk, Json.get?, Json.isObj, lookup]

/-- It admits `{"x": 1}`. -/
example : admits (mergeField "x" true false .int .int) (.obj [("x", .int 1)]) := by
  simp [mergeField, admits, keyOk, Json.get?, Json.isObj, lookup, intRange]
```

Write `merge.aontu`:

<!-- test: scenario merge -->
<!-- test: file merge.aontu -->
```aontu
admitted: { x?:integer } & { x:integer }
refused: { x?:integer } & { x:integer }
```

and `merge.json`:

<!-- test: file merge.json -->
```json
{"admitted": {"x": 1}, "refused": {}}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers merge.aontu merge.json
verdict: incomplete

$.refused.x: mapval_no_gen [incomplete]
...
$ echo $?
3
```

One side makes `x` optional and the other makes it required, so the
merged key must be present, and `{}` lacks it.

## 7. Where the definition and the engines differ

Both engines' test suites run rows the definition generates (step 8
shows how), and on a few of them the engines do not answer as the
definition does. [`spec/ledger.tsv`](../spec/ledger.tsv) lists each such case,
with the answer each side gives, which side changes, and why.

In some, the engines admit what the definition refuses. No meet with
`string` admits `""`:

<!-- test: quote spec/Aontu/Core.lean -->
```lean
/-- `string & empty()` admits `""`, which `string` refuses, so in a calculus
whose meet is a greatest lower bound it is not a meet: no meet with
`string` admits `""`. It is a value form of its own (`anyStr`). -/
theorem no_meet_with_str_admits_empty (b : Val) :
    ¬ admits (.meet .str b) (.str "") := by
  simp [admits]
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `string & (string & empty())` refuses `""`, which both engines admit. -/
example : ¬ admits (.meet .str .anyStr) (.str "") :=
  no_meet_with_str_admits_empty _
```

Write `waiver.aontu`:

<!-- test: scenario differ -->
<!-- test: file waiver.aontu -->
```aontu
v: string & (string & empty())
```

and `waiver.json`:

<!-- test: file waiver.json -->
```json
{"v": ""}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers waiver.aontu waiver.json
verdict: valid
```

Both engines let the `empty()` beside `string` widen the conjunction,
which a greatest lower bound cannot do. For this kind, the ledger names
the engines as the side that changes.

In others, two optional declarations of one key cannot both hold:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x?: string} & {x?: integer}` admits `{}`, where both engines answer
`error`. -/
example : admits (.meet (.field "x" true .str) (.field "x" true .int)) (.obj []) := by
  simp [admits, keyOk, Json.get?, Json.isObj, lookup]
```

Write `contradiction.aontu`:

<!-- test: file contradiction.aontu -->
```aontu
v: { x?:string } & { x?:integer }
```

and `contradiction.json`:

<!-- test: file contradiction.json -->
```json
{"v": {}}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers contradiction.aontu contradiction.json
verdict: error
...
$ echo $?
4
```

The definition reads a key that nothing can satisfy as a key that must
be absent, and so admits `{}`. Both engines answer `error`, a schema
they cannot use. For this kind the ledger names the definition as
the side that changes, since it has no ill-formed values, which is what
`error` reports.

## 8. A checker, admitted by a proof

`admits` is a statement, so Lean cannot run it. Running needs an
algorithm, and the definition holds one beside it:

<!-- test: quote spec/Aontu/Core.lean -->
```lean
def check : Val → Json → Bool
  | .top, _ => true
  | .nil, _ => false
  | .int, .int n => decide (n.natAbs ≤ 9007199254740992)
  | .int, _ => false
  | .wholeNum, .int _ => true
  | .wholeNum, _ => false
  | .str, .str s => s != ""
  | .str, _ => false
  | .anyStr, .str _ => true
  | .anyStr, _ => false
  | .min m, .int n => decide (m ≤ n)
  | .min _, _ => false
  | .field k opt v, j =>
    j.isObj && (match j.get? k with
      | none => opt
      | some x => check v x)
  | .meet a b, j => check a j && check b j
```

`check` returns `true` or `false`, where `admits` returns a statement.
Nothing in the code says the two agree. One theorem does:

<!-- test: quote spec/Aontu/Core.lean -->
```lean
theorem check_iff (v : Val) (j : Json) : check v j = true ↔ admits v j := by
```

With `check_iff` proved, an answer `check` computes is the definition's
answer. The file runs two:

<!-- test: quote spec/Aontu/Core.lean -->
```lean
#eval check (.meet .int (.min 3)) (.int 7)
#eval check (.field "x" false .int) (.obj [])
```

`lake build` prints `true` for the first, since `integer & min(3)`
admits `7`, and `false` for the second, since `{x: integer}` refuses
`{}`.

`spec/Oracle.lean` uses `check` to write the engines' test rows. It
builds every value of the fragment up to one `&`, and a set of
documents to try each against:

<!-- test: quote spec/Oracle.lean -->
```lean
def bases : List Val :=
  [.top, .nil, .int, .wholeNum, .str, .anyStr, .min 0, .min 3]

def level1 : List Val :=
  bases ++ bases.foldr (fun v acc => .field "x" true v :: .field "x" false v :: acc) []

def vals : List Val :=
  level1 ++ level1.foldr (fun a acc => level1.map (Val.meet a) ++ acc) []

def scalars : List Json :=
  [.null, .bool true, .int 0, .int 3, .int (-1), .str "", .str "a"]

def jsons : List Json :=
  scalars ++ [.obj []] ++ scalars.map (fun j => .obj [("x", j)]) ++ [.obj [("y", .int 1)]]
```

It writes one row for each value and document, and both engines' test
suites run every row. Two of them, from
[`test/spec/def-fragment.tsv`](../test/spec/def-fragment.tsv):

<!-- test: quote test/spec/def-fragment.tsv -->
```tsv
c69	verdict	v: string	v: ""	{"opts":{"noFill":true,"exactNumbers":true},"verdict":["invalid","incomplete","error"]}
c70	verdict	v: string	v: "a"	{"opts":{"noFill":true,"exactNumbers":true},"verdict":"valid"}
```

A row holds a schema, a document, the two `vet` modes and the verdict
`check` gives. The oracle writes a refusal as the three verdicts it
may be, since the definition answers admit or refuse and no more.

## 9. The JSON Schema translations

The fragment includes a small piece of JSON Schema, and what a 2020-12
validator answers for it:

<!-- test: quote spec/Aontu/Core.lean -->
```lean
/-- A JSON Schema fragment: `type` and `allOf`. -/
inductive Schema where
  | typeString
  | typeInteger
  | allOf (a b : Schema)

/-- What a 2020-12 validator answers for the fragment. -/
def valid : Schema → Json → Prop
  | .typeString, j => ∃ s, j = .str s
  | .typeInteger, j => ∃ n, j = .int n
  | .allOf a b, j => valid a j ∧ valid b j
```

and two translations into aontu values:

<!-- test: quote spec/Aontu/Core.lean -->
```lean
def importFaithful : Schema → Val
  | .typeString => .anyStr
  | .typeInteger => .wholeNum
  | .allOf a b => .meet (importFaithful a) (importFaithful b)
```

<!-- test: quote spec/Aontu/Core.lean -->
```lean
def importNatural : Schema → Val
  | .typeString => .str
  | .typeInteger => .int
  | .allOf a b => .meet (importNatural a) (importNatural b)
```

The first spells each keyword by what a validator admits, so
`type: string` holds `""` and `type: integer` holds every whole number. The
second uses the aontu kind of the same name. A theorem states what each
gives:

<!-- test: quote spec/Aontu/Core.lean -->
```lean
theorem faithful_exact (s : Schema) (j : Json) :
    admits (importFaithful s) j ↔ valid s j := by
```

<!-- test: quote spec/Aontu/Core.lean -->
```lean
/-- The natural mode may refuse what a validator admits, and never admits
what a validator refuses. -/
theorem natural_sound (s : Schema) (j : Json) :
    admits (importNatural s) j → valid s j := by
```

The first admits exactly what a validator admits. The second never
admits what a validator refuses and may refuse more, and two theorems
name what it refuses:

<!-- test: quote spec/Aontu/Core.lean -->
```lean
/-- The natural mode's departures, stated as theorems rather than prose. -/
theorem natural_refuses_empty_string :
    valid .typeString (.str "") ∧ ¬ admits (importNatural .typeString) (.str "") := by
```

<!-- test: quote spec/Aontu/Core.lean -->
```lean
theorem natural_refuses_beyond_float64 :
    valid .typeInteger (.int 9007199254740993) ∧
      ¬ admits (importNatural .typeInteger) (.int 9007199254740993) := by
```

`aontu jsonschema import` writes the first translation, and no option
writes the second. Write `count.json`:

<!-- test: scenario import -->
<!-- test: file count.json -->
```json
{"type": "integer"}
```

Now import it:

<!-- test: run -->
```sh
$ aontu jsonschema import count.json
number & multiple(1)
```

The import is `number & multiple(1)`, which admitted `9007199254740993`
in step 4 where `integer` refused it.

## 10. Lists and closed maps

`spec/Aontu/Structures.lean` sketches more of the language. Its values
add the kinds and forms the fragment leaves out:

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
inductive Val where
  | any                                         -- `any`
  | nil                                         -- `nil`
  | null                                        -- `null`
  | boolean                                     -- `boolean`
  | number                                      -- `number`
  | integer                                     -- `integer`
  | string                                      -- `string`
  | anyString                                   -- `string & empty()`
  | lit (j : Json)                              -- `1`, `"a"`, `true`
  | min (n : Int)                               -- `min(n)`
  | max (n : Int)                               -- `max(n)`
  | len (lo : Nat)                              -- `len(min(lo))`, on a list
  | map (fs : List (String × Bool × Val)) (spread : Option Val) (closed : Bool)
                                                -- `{k: v, k?: v, &: s}`, `closed` by `close()`
  | list (items : List Val) (spread : Option Val)  -- `[a, b, &: s]`
  | meet (a b : Val)                            -- `a & b`
  | join (a b : Val)                            -- `a | b`
  | pref (a : Val)                              -- `*a`
  | alias (n : String)                          -- `%n`
  | path (p : List Seg)                         -- `$.a.b`
```

Admission there is a relation built from rules, one constructor for
each, rather than a definition by cases:

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
inductive Admits (env : String → Val) (root : Json) : Val → Json → Prop
  | any {j : Json} : Admits env root .any j
  | null : Admits env root .null .null
  | boolean {b : Bool} : Admits env root .boolean (.bool b)
  | number {n : Int} : Admits env root .number (.num n)
  | integer {n : Int} : Admits env root .integer (.num n)
  | string {s : String} : s ≠ "" → Admits env root .string (.str s)
  | anyString {s : String} : Admits env root .anyString (.str s)
  | lit {j : Json} : Admits env root (.lit j) j
  | min {m n : Int} : m ≤ n → Admits env root (.min m) (.num n)
  | max {m n : Int} : n ≤ m → Admits env root (.max m) (.num n)
  | len {lo : Nat} {xs : List Json} : lo ≤ xs.length → Admits env root (.len lo) (.arr xs)
```

Each constructor is a rule of inference: when its premises hold, its
conclusion, after the last `→`, holds. A value admits a document when a
finite tree of these rules proves it. `env` gives each alias its value,
and `root` is the whole instance, which a path reference reads
([step 12](#12-path-references-and-recursion)). An argument in braces,
such as `{j : Json}`, is one Lean works out for itself.

A list's rule:

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
  /-- A list: every written position is present and holds its value; later
  elements are allowed; the spread holds every element. -/
  | list {items : List Val} {spread : Option Val} {xs : List Json} :
      items.length ≤ xs.length →
      (∀ (i : Nat) (v : Val) (x : Json), items[i]? = some v → xs[i]? = some x →
        Admits env root v x) →
      (∀ s, spread = some s → ∀ x, x ∈ xs → Admits env root s x) →
      Admits env root (.list items spread) (.arr xs)
```

So `[integer, string]` needs two elements, and allows more:

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
/-- `[integer, string]` admits `[1, "a", true]`. -/
example : Admits noAlias .null (.list [.integer, .string] none)
    (.arr [.num 1, .str "a", .bool true]) := by
```

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
/-- `[integer, string]` refuses `[1]`. -/
example : ¬ Admits noAlias .null (.list [.integer, .string] none) (.arr [.num 1]) := by
```

The formatter separates list elements with spaces. Write
`lists.aontu`:

<!-- test: scenario lists -->
<!-- test: file lists.aontu -->
```aontu
admitted: [integer string]
refused: [integer string]
```

and `lists.json`:

<!-- test: file lists.json -->
```json
{"admitted": [1, "a", true], "refused": [1]}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers lists.aontu lists.json
verdict: incomplete

$.refused.1: listval_no_gen [incomplete]
...
$ echo $?
3
```

The list stays open, so it admits `true`, past the written positions.
The missing second element is `incomplete`, the class of a missing
required key.

A map's rule covers optional keys, spreads and `close()`:

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
  /-- A map: every declared key that is present holds its value; a key that
  is absent is optional; the spread holds every member, declared or not;
  a closed map holds no key it does not declare. -/
  | map {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool}
      {jfs : List (String × Json)} :
      (∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x → Admits env root v x) →
      (∀ k o v, (k, o, v) ∈ fs → lookup k jfs = none → o = true) →
      (∀ s, spread = some s → ∀ k x, (k, x) ∈ jfs → Admits env root s x) →
      (closed = true → ∀ k x, (k, x) ∈ jfs → ∃ o v, (k, o, v) ∈ fs) →
      Admits env root (.map fs spread closed) (.obj jfs)
```

The last premise is `close()`: a closed map holds no key it does not
declare. An absent optional key is still admitted:

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
/-- `close({a: integer})` refuses `{"a": 1, "b": 2}`. -/
example : ¬ Admits noAlias .null (.map [("a", false, .integer)] none true)
    (.obj [("a", .num 1), ("b", .num 2)]) := by
```

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
/-- `close({a?: integer})` admits `{}`. -/
example : Admits noAlias .null (.map [("a", true, .integer)] none true) (.obj []) := by
```

Write `closed.aontu`:

<!-- test: scenario closed -->
<!-- test: file closed.aontu -->
```aontu
admitted: close({ a?:integer })
refused: close({ a:integer })
```

and `closed.json`:

<!-- test: file closed.json -->
```json
{"admitted": {}, "refused": {"a": 1, "b": 2}}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers closed.aontu closed.json
verdict: invalid

$.refused.b: closed [conflict]
...
$ echo $?
1
```

`close()` refuses `b`, which `{ a:integer }` does not declare, and
leaves the absent `a?` alone.

## 11. Disjunction and preference

The rules for `&`, `|`, `*`, aliases and path references:

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
  | meet {a b : Val} {j : Json} :
      Admits env root a j → Admits env root b j → Admits env root (.meet a b) j
  | joinL {a b : Val} {j : Json} : Admits env root a j → Admits env root (.join a b) j
  | joinR {a b : Val} {j : Json} : Admits env root b j → Admits env root (.join a b) j
  /-- A preference does not narrow what is admitted; it matters to `Gen`. -/
  | pref {a : Val} {j : Json} : Admits env root a j → Admits env root (.pref a) j
  | alias {n : String} {j : Json} : Admits env root (env n) j → Admits env root (.alias n) j
  /-- A path reference admits the instance's own value at that path. -/
  | path {p : List Seg} {j : Json} : root.at p = some j → Admits env root (.path p) j
```

A disjunction has two rules, one for each branch, and a preference has
one that passes admission straight through: `*` changes what
evaluation outputs ([step 13](#13-what-evaluation-outputs)), not what a
value admits.

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
example : Admits noAlias .null (.join (.pref (.lit (.num 1))) .integer) (.num 5) :=
  .joinR .integer
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `*1 | integer` refuses `"a"`: neither branch admits it. -/
example : ¬ Admits noAlias .null (.join (.pref (.lit (.num 1))) .integer) (.str "a") := by
  intro h
  cases h with
  | joinL h => cases h with | pref h => cases h
  | joinR h => cases h
```

`cases h` lists every rule that could have proved the claim and finds
that none applies. Write `prefer.aontu`:

<!-- test: scenario prefer -->
<!-- test: file prefer.aontu -->
```aontu
admitted: *1|integer
refused: *1|integer
```

and `prefer.json`:

<!-- test: file prefer.json -->
```json
{"admitted": 5, "refused": "a"}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers prefer.aontu prefer.json
verdict: invalid

$.refused: empty [conflict]
...
$ echo $?
1
```

The value admits `5` although the preferred branch is `1`.

## 12. Path references and recursion

A path reference admits the instance's own value at its path, read
from `root`:

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
abbrev refDoc : Val := .map [("x", false, .path [.key "y"]), ("y", false, .integer)] none false

abbrev inst (x y : Int) : Json := .obj [("x", .num x), ("y", .num y)]
```

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
/-- It admits `{"x": 1, "y": 1}`. -/
example : Admits noAlias (inst 1 1) refDoc (inst 1 1) := by
```

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
/-- It refuses `{"x": 1, "y": 2}`. -/
example : ¬ Admits noAlias (inst 1 2) refDoc (inst 1 2) := by
```

Here the schema is the whole document, so there are no `admitted` and
`refused` keys. Write `refs.aontu`:

<!-- test: scenario refs -->
<!-- test: file refs.aontu -->
```aontu
x: $.y
y: integer
```

then `same.json`:

<!-- test: file same.json -->
```json
{"x": 1, "y": 1}
```

and `different.json`:

<!-- test: file different.json -->
```json
{"x": 1, "y": 2}
```

Now vet each:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers refs.aontu same.json
verdict: valid
$ aontu vet --no-fill --exact-numbers refs.aontu different.json
verdict: invalid

$.x: scalar_value [conflict]
...
$ echo $?
1
```

Recursion takes one more rule, from `spec/Aontu/WhatNotHow.lean`, which
spells an alias `ref`:

<!-- test: quote spec/Aontu/WhatNotHow.lean -->
```lean
  | ref {name : String} {j : Json} :
      Admits env (env name) j → Admits env (.ref name) j
```

An alias admits what its value admits, and that is the whole of
recursion. The same file gives a key's two cases a rule each, `present`
and `absent`. For `%T = {n?: %T, v?: integer}`:

<!-- test: quote spec/Aontu/WhatNotHow.lean -->
```lean
abbrev T : Val := .meet (.field "n" true (.ref "T")) (.field "v" true .int)

def env : String → Val := fun _ => T
```

<!-- test: quote spec/Aontu/WhatNotHow.lean -->
```lean
/-- `{"n": {"v": 1}}` is a `%T`. The proof is the derivation itself. -/
example : Admits env T (.obj [("n", .obj [("v", .int 1)])]) :=
  .meet
    (.present rfl rfl
      (.ref (.meet (.absent rfl rfl) (.present rfl rfl (.int (by decide))))))
    (.absent rfl rfl)
```

<!-- test: quote spec/Aontu/WhatNotHow.lean -->
```lean
/-- `{"v": "x"}` is not: no derivation exists. -/
example : ¬ Admits env T (.obj [("v", .str "x")]) := by
```

Read the positive proof from the inside out. `{"v": 1}` is a `%T`,
because its `n` is absent and its `v` is an integer in range, so
`{"n": {"v": 1}}` is a `%T` too. A document is finite, so the
derivation stops where the data stops. Write `tree.aontu`:

<!-- test: scenario tree -->
<!-- test: file tree.aontu -->
```aontu
%T = { n?:%T v?:integer }
admitted: %T
refused: %T
```

and `tree.json`:

<!-- test: file tree.json -->
```json
{"admitted": {"n": {"v": 1}}, "refused": {"v": "x"}}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers tree.aontu tree.json
verdict: invalid

$.refused.v: no_scalar_unify [conflict]
...
$ echo $?
1
```

## 13. What evaluation outputs

Admission says which documents fit a value. Evaluation writes one
document, and the sketch defines that separately:

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
inductive Gen (env : String → Val) : Val → Json → Prop
  | lit {j : Json} : Gen env (.lit j) j
  | meetL {a b : Val} {j : Json} : Gen env a j → Admits env j b j → Gen env (.meet a b) j
  | meetR {a b : Val} {j : Json} : Admits env j a j → Gen env b j → Gen env (.meet a b) j
  | prefer {a b : Val} {j : Json} : Gen env a j → Gen env (.join (.pref a) b) j

def Output (env : String → Val) (v : Val) (j : Json) : Prop :=
  Gen env v j ∧ ∀ j', Gen env v j' → j' = j
```

`Gen env v j` says `v` can single out `j`, and `Output` adds that
nothing else qualifies, so with two candidates evaluation has no
answer. The sketch proves three cases:

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
/-- `*1 | integer` evaluates to `1`. -/
example : Output noAlias (.join (.pref (.lit (.num 1))) .integer) (.num 1) := by
```

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
/-- `integer & 1` evaluates to `1`. -/
example : Output noAlias (.meet .integer (.lit (.num 1))) (.num 1) := by
```

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
/-- `1 | 2` evaluates to nothing. -/
example : ¬ ∃ j, Output noAlias (.join (.lit (.num 1)) (.lit (.num 2))) j := by
```

Evaluate each:

<!-- test: scenario output -->
<!-- test: run -->
```sh
$ echo 'v: *1 | integer' | aontu
{
  "v": 1
}
$ echo 'v: integer & 1' | aontu
{
  "v": 1
}
$ echo 'v: 1 | 2' | aontu
[aontu/disjunct_no_gen]: Cannot resolve value at path $.v
...
$ echo $?
1
```

The preference that changed nothing in step 11 decides the first
output.

## 14. Trial schemas

`not`, `when` and `nof` ask whether a value refuses a document, and a
rule cannot depend on the negation of the relation it defines. Lean
refuses such a definition, since it might have no meaning, so the
sketch defines trials in a layer above `Admits`:

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
inductive Trial where
  | is (v : Val)                          -- a value, tried as a schema
  | not (c : Trial)                       -- JSON Schema's `not`
  | when (c t e : Trial)                  -- `when(c, t, e)`
  | nof (lo hi : Nat) (cs : List Trial)   -- `nof(n, ...c)`, as a range
```

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
mutual
def holds (env : String → Val) (root : Json) : Trial → Json → Prop
  | .is v, j => Admits env root v j
  | .not c, j => ¬ holds env root c j
  | .when c t e, j =>
    (holds env root c j ∧ holds env root t j) ∨ (¬ holds env root c j ∧ holds env root e j)
  | .nof lo hi cs, j => lo ≤ count env root cs j ∧ count env root cs j ≤ hi

def count (env : String → Val) (root : Json) : List Trial → Json → Nat
  | [], _ => 0
  | c :: cs, j => (if holds env root c j then 1 else 0) + count env root cs j
end
```

The definition of `holds` recurses on the trial schema, which is what
lets `¬` appear in it. `nof lo hi cs` holds when the number of branches that
hold is between `lo` and `hi`. The `oneOf` of JSON Schema is
`nof 1 1`, which aontu writes `nof(1, …)`:

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
/-- `oneOf: [integer, minimum 0]` is `nof(1, 1, …)`: it admits `-1`, which
one branch admits. -/
example : holds noAlias .null (.nof 1 1 [.is .integer, .is (.min 0)]) (.num (-1)) := by
```

<!-- test: quote spec/Aontu/Structures.lean -->
```lean
/-- …and refuses `3`, which both admit. -/
example : ¬ holds noAlias .null (.nof 1 1 [.is .integer, .is (.min 0)]) (.num 3) := by
```

Write `nof.aontu`:

<!-- test: scenario nof -->
<!-- test: file nof.aontu -->
```aontu
admitted: nof(1, integer, min(0))
refused: nof(1, integer, min(0))
```

and `nof.json`:

<!-- test: file nof.json -->
```json
{"admitted": -1, "refused": 3}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers nof.aontu nof.json
verdict: invalid

$.refused: nof [conflict]
...
$ echo $?
1
```

`-1` is an integer below zero, so one branch holds. `3` satisfies both,
and `nof(1, …)` asks for exactly one.

## 15. What any `subsume` must answer

`⊑` quantifies over every document, of which there are infinitely
many, so no program computes it in general. The definition states
instead what an answer from `subsume` must respect:

<!-- test: quote spec/Aontu/WhatNotHow.lean -->
```lean
def Le (env : String → Val) (a b : Val) : Prop :=
  ∀ j, Admits env a j → Admits env b j

inductive Verdict
  | yes
  | no
  | undecided

def SubsumeCorrect (env : String → Val) (subsume : Val → Val → Verdict) : Prop :=
  ∀ general specific,
    (subsume general specific = .yes → Le env specific general) ∧
    (subsume general specific = .no → ¬ Le env specific general)
```

A `yes` must be true and a `no` must be true, while `undecided` is
always allowed. The contract names no algorithm, and the file proves
that a `subsume` that never commits meets it:

<!-- test: quote spec/Aontu/WhatNotHow.lean -->
```lean
/-- One implementation: never commit. Correct, and useless. -/
def subsumeNever : Val → Val → Verdict := fun _ _ => .undecided
```

A wrong one fails it, and refuting it needs no engine run:

<!-- test: quote spec/Aontu/WhatNotHow.lean -->
```lean
/-- A wrong one: it says `{k: any}` subsumes `{k?: any}`. -/
def subsumeWrong : Val → Val → Verdict
  | .field _ false _, .field _ true _ => .yes
  | _, _ => .undecided
```

<!-- test: quote spec/Aontu/WhatNotHow.lean -->
```lean
/-- The definition refutes it, with `{}` as the witness, and no engine run. -/
theorem subsumeWrong_incorrect : ¬ SubsumeCorrect (fun _ => .top) subsumeWrong := by
```

The witness is `{}`. `{x?: any}` admits it and `{x: any}` refuses it,
so `{x: any}` is not above `{x?: any}`. The engine spells `yes` as
`subsumes` and `no` as `does_not_subsume`. Write `required.aontu`:

<!-- test: scenario contract -->
<!-- test: file required.aontu -->
```aontu
v: x: any
```

and `optional.aontu`:

<!-- test: file optional.aontu -->
```aontu
v: x?: any
```

Now ask both ways:

<!-- test: run -->
```sh
$ aontu subsume required.aontu optional.aontu
verdict: does_not_subsume

$.v.x: compat_required_added [compat]
  the general value requires this key; the specific value makes it optional, so instances without it are admitted
...
$ echo $?
1
$ aontu subsume optional.aontu required.aontu
verdict: subsumes
```

The engine answers `no` where `subsumeWrong` answered `yes`, and its
finding gives the same reason: `{x?: any}` admits instances without the
key.

## 16. What the definition leaves to the reference

The definition covers what this page walked through. The
[language reference](reference-language.md) states the rest: decimals
and the numeric kinds beyond `integer`, most built-in functions,
generation with `each`, `pack` and `emit`, formats, and marks such as
`hide()` and `type()`. [`aontu vet`](reference-api.md#aontu-vet) states
which refusal is `invalid`, `incomplete` or `error`, and the shared
test suite in [`test/spec/`](../test/spec/) holds both engines to them.

Next, read [unification](unification.md), which explains in prose the
operation these rules define.
