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

The definition is nine Lean modules and one program, which make one
definition: every module reads the same data, the same values, and the
same rule for what a value admits, and none declares its own.

| File | Holds |
|---|---|
| [`spec/Aontu/Data.lean`](../spec/Aontu/Data.lean) | JSON: numbers, strings, arrays and objects, paths into a document, what makes a document data, and the integers `integer` holds |
| [`spec/Aontu/Syntax.lean`](../spec/Aontu/Syntax.lean) | the values, one constructor for each construct |
| [`spec/Aontu/Admits.lean`](../spec/Aontu/Admits.lean) | what each value admits, one rule for each form |
| [`spec/Aontu/Order.lean`](../spec/Aontu/Order.lean) | the order between values, the meet, two declarations of one key, and the contract any `subsume` must meet |
| [`spec/Aontu/Trial.lean`](../spec/Aontu/Trial.lean) | the trial schemas `nof` and `when` |
| [`spec/Aontu/Check.lean`](../spec/Aontu/Check.lean) | a checker, and the theorem that makes its answers the definition's |
| [`spec/Aontu/JsonSchema.lean`](../spec/Aontu/JsonSchema.lean) | a piece of JSON Schema, and the import's two translations |
| [`spec/Aontu/Print.lean`](../spec/Aontu/Print.lean) | the printer that writes a value as aontu text |
| [`spec/Aontu/Tour.lean`](../spec/Aontu/Tour.lean) | the examples this page walks through |
| [`spec/Oracle.lean`](../spec/Oracle.lean) | the program that writes the engines' test rows |

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
exact value. The definition answers for data as written and numbers
read by value, which is what those two flags ask for. Each step's
schema states its value at two keys, `admitted` and `refused`, and the
data gives each key one document. A finding names the key the engine
refused, and the exit code says which kind of refusal it was: `1` for
`invalid`, `3` for `incomplete`, `4` for `error`.

## 2. The data

Everything the definition says, it says about JSON, defined once in
`spec/Aontu/Data.lean`. A number comes first:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- A JSON number. Its value is `coef / 10 ^ scale`, exactly: `1.5` is
`⟨15, 1, true⟩`, `0.25` is `⟨25, 2, true⟩` and `1e3` is
`⟨1000, 0, false⟩`. `point` records that the text has a decimal point,
the one part of a number's spelling the language reads: by default
`1.0` is a float and `1` an integer, while `--exact-numbers` reads the
value alone, so that `1.0`, `1` and `1e0` are one integer. An exponent
changes only the value, and the sign of zero is not kept: `-0.0` is
`0.0`. -/
structure Num where
  coef : Int
  scale : Nat
  point : Bool
  deriving DecidableEq, Repr
```

`structure` declares a record with named fields, and `deriving` asks
Lean for its equality and its printing. A number keeps its exact value
and, of its text, only the point, because that's all either read mode
looks at. Write `point.aontu`:

<!-- test: scenario point -->
<!-- test: file point.aontu -->
```aontu
v: integer
```

and `point.json`:

<!-- test: file point.json -->
```json
{"v": 1.0}
```

Now vet it in each mode:

<!-- test: run -->
```sh
$ aontu vet point.aontu point.json
verdict: invalid

$.v: no_scalar_unify [conflict]
...
$ echo $?
1
$ aontu vet --no-fill --exact-numbers point.aontu point.json
verdict: valid
```

By default the point makes `1.0` a float, which `integer` refuses.
Read by value, it's the integer `1`, and every relation on this page
reads numbers that way.

The values come next:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- A JSON value. A string is a sequence of Unicode scalar values, as a
Lean `String` is, so a text that escapes an unpaired surrogate
(`"\ud800"`), which both engines accept, has no value here. An object
holds its members in the order written. -/
inductive Json where
  | null
  | bool (b : Bool)
  | num (n : Num)
  | str (s : String)
  | arr (xs : List Json)
  | obj (fs : List (String × Json))
```

`inductive` lists every way to build a value of a new type, one
constructor per line. A document is `null`, a boolean, a number, a
string, an array or an object, and `List (String × Json)` reads "a list
of pairs of a string and a document". Two shorthands write the numbers
the examples use:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- An integer written without a point: `3` is `.int 3`. -/
def Json.int (n : Int) : Json := .num (.ofInt n)

/-- A number written with a point: `1.5` is `.dec 15 1`, and `1.0` is
`.dec 1 0`. -/
def Json.dec (coef : Int) (scale : Nat) : Json := .num ⟨coef, scale, true⟩
```

A list of pairs can name a key twice, and data can't, so the file
says which documents are data:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- A document as data: every number in lowest terms, and no object
naming a member twice. Both engines read a text that repeats a name by
unifying the repeated members, so `{"a": 1, "a": 1}` is the document
`{"a": 1}`, and `{"a": 1, "a": 2}` is refused before it is data. -/
inductive Json.WellFormed : Json → Prop
  | null : WellFormed .null
  | bool {b : Bool} : WellFormed (.bool b)
  | num {x : Num} : x.Lowest → WellFormed (.num x)
  | str {s : String} : WellFormed (.str s)
  | arr {xs : List Json} : (∀ x, x ∈ xs → WellFormed x) → WellFormed (.arr xs)
  | obj {fs : List (String × Json)} :
      (fs.map Prod.fst).Nodup → (∀ k x, (k, x) ∈ fs → WellFormed x) → WellFormed (.obj fs)
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{"a": 1}` is data. -/
example : Json.WellFormed (.obj [("a", .int 1)]) := by
  refine .obj (by decide) ?_
  intro k x h
  cases List.mem_singleton.mp h
  exact .num (by decide)

/-- `{"a": 1, "a": 2}` is not: it names `a` twice. -/
example : ¬ Json.WellFormed (.obj [("a", .int 1), ("a", .int 2)]) := by
  intro h
  cases h with
  | obj hn _ => revert hn; decide

/-- `1.50` is `1.5` in lowest terms, so `⟨150, 2, true⟩` is not a number
of the data. -/
example : ¬ (Num.mk 150 2 true).Lowest := by decide
```

`Nodup` says no name appears twice, and `decide` checks it by
computing. Write `names.aontu`:

<!-- test: scenario names -->
<!-- test: file names.aontu -->
```aontu
a: any
```

then `once.json`:

<!-- test: file once.json -->
```json
{"a": 1, "a": 1}
```

and `twice.json`:

<!-- test: file twice.json -->
```json
{"a": 1, "a": 2}
```

Now vet each:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers names.aontu once.json
verdict: valid
$ aontu vet --no-fill --exact-numbers names.aontu twice.json
verdict: invalid

$.a: scalar_value [conflict]
...
$ echo $?
1
```

The engine reads the repeated `a` by unifying its members, so two `1`s
give the document `{"a": 1}`, and `1` and `2` give no document at all,
even against `any`.

The last definition of the data says which integers `integer` holds:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The integers the `integer` leaf holds: the values a double holds
exactly, `m · 2 ^ e` with `m < 2 ^ 53`, whose magnitude is below
`2 ^ 63`. So `2 ^ 53 + 2` and `10 ^ 18` are in it, and `2 ^ 53 + 1`
(no double), `2 ^ 63` and `-2 ^ 63` (outside the window) are not. -/
def IntegerLeaf (n : Int) : Prop :=
  (∃ m e : Nat, n.natAbs = m * 2 ^ e ∧ m < 2 ^ 53) ∧ n.natAbs < 2 ^ 63
```

`∃ m e : Nat` reads "there are natural numbers `m` and `e` such that",
and `n.natAbs` is the size of `n`, its sign dropped. A double holds an
integer exactly when the integer is a 53-bit integer times a power of
two, and the window keeps every one of them below `2^63` in size:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- A double holds `2 ^ 53 + 2`, inside the window. -/
example : IntegerLeaf 9007199254740994 := by decide

/-- No double holds `2 ^ 53 + 1`. -/
example : ¬ IntegerLeaf 9007199254740993 := by decide

/-- A double holds `2 ^ 63`, outside the window. -/
example : ¬ IntegerLeaf 9223372036854775808 := by decide
```

Step 4 shows `integer` reading this definition.

## 3. The values

`spec/Aontu/Syntax.lean` holds the values, each constructor beside
its aontu spelling. A literal comes first:

<!-- test: quote spec/Aontu/Syntax.lean -->
```lean
/-- A literal scalar. A number literal is an integer written without a
point and without `0d`: `1.5` and `0d5` are literals of the float,
biginteger, and bigdecimal leaves, which the definition does not yet
hold. -/
inductive Scalar where
  | null
  | bool (b : Bool)
  | int (n : Int)
  | str (s : String)
```

and the values:

<!-- test: quote spec/Aontu/Syntax.lean -->
```lean
/-- A value, each constructor beside its spelling. `close()` seals every
map and list beneath it, and `open()` unseals; a map here carries its
own seal, as `close()` leaves each one, and a list is open. -/
inductive Val where
  | any                                     -- `any`
  | nil                                     -- `nil`
  | boolean                                 -- `boolean`
  | number                                  -- `number`
  | integer                                 -- `integer`
  | string                                  -- `string`, which is never `""`
  | anyString                               -- `string & empty()`
  | lit (s : Scalar)                        -- `null`, `true`, `3`, `"a"`
  | min (n : Num)                           -- `min(n)`
  | max (n : Num)                           -- `max(n)`
  | multiple (d : Num)                      -- `multiple(d)`
  | map (fs : List (String × Bool × Val)) (spread : Option Val) (closed : Bool)
                                            -- `{k: v, k?: v, &: s}`, sealed or not
  | list (items : List Val) (spread : Option Val)  -- `[a, b, &: s]`
  | meet (a b : Val)                        -- `a & b`
  | alias (n : String)                      -- `%n`
  | path (p : List Seg)                     -- `$.a.b`
```

Two of the lines record a choice the language makes. `string` never
holds the empty string, and `anyString` is `string & empty()`, which
holds `""` as well. A map holds its keys as triples: the name, whether
the key is optional, and its value. `Option Val` is either `none` or
`some v`, so a map and a list each have a spread or not, and a map's
`closed` flag is the seal `close()` leaves.

An alias names a value that the document declares:

<!-- test: quote spec/Aontu/Syntax.lean -->
```lean
/-- The alias declarations of a document: `%T = v` is `env "T" = some v`. -/
abbrev Env := String → Option Val

/-- The declarations of a document that declares no alias. -/
def Env.empty : Env := fun _ => none
```

## 4. What a value admits

`spec/Aontu/Admits.lean` says which documents each value admits, one
rule for each form. The rules build one relation:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
inductive Admits (env : Env) (root : Json) : Val → Json → Prop
  | any {j : Json} : Admits env root .any j
```

`Admits env root v j` says the document `j`, found inside the whole
document `root`, is an instance of the value `v`, with the aliases
`env` declares. The result type `Prop` is a statement, true or false,
that Lean establishes by proof and never by running anything. Each
constructor is a rule of inference: when its premises hold, its
conclusion, after the last `→`, holds. A value admits a document when
a finite tree of these rules proves it. An argument in braces, such as
`{j : Json}`, is one Lean works out for itself.

The examples ask about a whole document, which is its own root:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
/-- The document `j` is an instance of `v` under the declarations `env`,
read as a whole: `j` is its own root. This is the question
`aontu vet` answers. -/
abbrev Instance (env : Env) (v : Val) (j : Json) : Prop := Admits env j v j
```

`example : Instance .empty .any .null` claims that `any` admits `null`
in a document that declares no alias, and what follows `:=` is the
proof, which the build checks. A claim that opens with `¬` says the
value refuses the document.

### The two ends: `any` and `nil`

`any` admits every document, by its one rule, and `nil` has no rule,
so it admits none. They are the [top](unification.md) and the
[bottom](unification.md) of the [lattice](unification.md):

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `any` admits `null`. -/
example : Instance .empty .any .null := .any

/-- `any` admits `[1, "a"]`. -/
example : Instance .empty .any (.arr [.int 1, .str "a"]) := .any

/-- `nil` refuses `null`, and everything else. -/
example : ¬ Instance .empty .nil .null := fun h => nomatch h
```

The first two proofs name the rule, `.any`. For `nil`, `fun h => nomatch h`
takes a supposed proof that `nil` admits `null` and finds no rule it
could have come from. Write `ends.aontu`:

<!-- test: scenario ends -->
<!-- test: file ends.aontu -->
```aontu
admitted: any
array: any
refused: nil
```

and `ends.json`:

<!-- test: file ends.json -->
```json
{"admitted": null, "array": [1, "a"], "refused": null}
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

The only finding is at `$.refused`, so `any` admitted its `null` and its
array.

### Kinds

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | boolean {b : Bool} : Admits env root .boolean (.bool b)
  | number {x : Num} : Admits env root .number (.num x)
  | integer {x : Num} {n : Int} :
      x.int? = some n → IntegerLeaf n → Admits env root .integer (.num x)
```

`integer` asks two things of a number: that its value is an integer,
and that the integer is in the leaf of step 2. The first is a
definition of the data:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The integer a number's value is, when it is one: `1.0` and `1e3`
are integers, `1.5` is not. -/
def Num.int? (x : Num) : Option Int :=
  if x.coef % 10 ^ x.scale = 0 then some (x.coef / 10 ^ x.scale) else none
```

`%` is the remainder and `/` the quotient, so a number is an integer
when its digits divide by the power of ten its scale names.

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `integer` admits `3`. -/
example : Instance .empty .integer (.int 3) := .integer rfl (by decide)

/-- `integer` admits `1.0`, whose value is the integer `1`. -/
example : Instance .empty .integer (.dec 1 0) := .integer rfl (by decide)

/-- `integer` admits `9007199254740994`, which a double holds. -/
example : Instance .empty .integer (.int 9007199254740994) := .integer rfl (by decide)

/-- `integer` refuses `9007199254740993`, which no double holds. -/
example : ¬ Instance .empty .integer (.int 9007199254740993) := by
  intro h
  cases h with
  | integer hx hl =>
    simp [Num.ofInt, Num.int?] at hx
    subst hx
    exact absurd hl (by decide)

/-- `integer` refuses `9223372036854775808`, outside the window. -/
example : ¬ Instance .empty .integer (.int 9223372036854775808) := by
  intro h
  cases h with
  | integer hx hl =>
    simp [Num.ofInt, Num.int?] at hx
    subst hx
    exact absurd hl (by decide)

/-- `integer` refuses `1.5`. -/
example : ¬ Instance .empty .integer (.dec 15 1) := by
  intro h
  cases h with
  | integer hx _ => simp [Num.int?] at hx

/-- `number & multiple(1)` admits `9007199254740993`. -/
example : Instance .empty (.meet .number (.multiple (.ofInt 1))) (.int 9007199254740993) :=
  .meet .number (.multiple (by decide) (by decide))

/-- `boolean` admits `true`. -/
example : Instance .empty .boolean (.bool true) := .boolean

/-- `boolean` refuses `1`. -/
example : ¬ Instance .empty .boolean (.int 1) := fun h => nomatch h
```

`rfl` proves that a computation gives what it claims, and `by decide`
evaluates a statement that has a yes or no answer. A refusal takes the
supposed proof apart with `cases`, which lists every rule that could
have given it, and shows that each premise fails. Write
`integers.aontu`:

<!-- test: scenario integers -->
<!-- test: file integers.aontu -->
```aontu
admitted: integer
point: integer
double: integer
beyond: integer
window: integer
half: integer
wide: number & multiple(1)
flag: boolean
one: boolean
```

and `integers.json`:

<!-- test: file integers.json -->
```json
{"admitted": 3, "point": 1.0, "double": 9007199254740994, "beyond": 9007199254740993, "window": 9223372036854775808, "half": 1.5, "wide": 9007199254740993, "flag": true, "one": 1}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers integers.aontu integers.json
verdict: invalid

$.beyond: no_scalar_unify [conflict]
...
$.window: no_scalar_unify [conflict]
...
$.half: no_scalar_unify [conflict]
...
$.one: no_scalar_unify [conflict]
...
$ echo $?
1
```

`integer` admits `9007199254740994`, which a double holds, and refuses
`9007199254740993`, which none does, and `9223372036854775808`, which
one does outside the window. `number & multiple(1)` holds every whole
number, so `wide` admits the number `beyond` refused.

### Strings are never empty

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | string {s : String} : s ≠ "" → Admits env root .string (.str s)
  | anyString {s : String} : Admits env root .anyString (.str s)
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `string` admits `"a"`. -/
example : Instance .empty .string (.str "a") := .string (by decide)

/-- `string` refuses `""`. -/
example : ¬ Instance .empty .string (.str "") := by
  intro h
  cases h with
  | string h => exact h rfl

/-- `string & empty()` admits `""`. -/
example : Instance .empty .anyString (.str "") := .anyString
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

### Literals

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | null : Admits env root (.lit .null) .null
  | bool {b : Bool} : Admits env root (.lit (.bool b)) (.bool b)
  /-- An integer literal outside the leaf is a float, or refused as
  lossy, and admits no number read by value. -/
  | int {n : Int} {x : Num} :
      x.int? = some n → IntegerLeaf n → Admits env root (.lit (.int n)) (.num x)
  | str {s : String} : Admits env root (.lit (.str s)) (.str s)
```

A literal admits its own value. An integer literal reads the data by
value, so `3` admits `3.0`, and holds its own text to the leaf of
step 2:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `3` admits `3.0`, whose value is `3`. -/
example : Instance .empty (.lit (.int 3)) (.dec 3 0) := .int rfl (by decide)

/-- `9223372036854775808` refuses itself: a literal outside the leaf is
a float, and no number read by value is one. -/
example : ¬ Instance .empty (.lit (.int 9223372036854775808)) (.int 9223372036854775808) := by
  intro h
  cases h with
  | int _ hl => exact absurd hl (by decide)

/-- `"a"` refuses `"b"`. -/
example : ¬ Instance .empty (.lit (.str "a")) (.str "b") := fun h =>
  absurd ((check_iff .lit _).mpr h) (by decide)
```

The last proof borrows the checker of step 9 to compute the answer.
Write `literals.aontu`:

<!-- test: scenario literals -->
<!-- test: file literals.aontu -->
```aontu
admitted: 3
refused: "a"
window: 9223372036854775808
```

and `literals.json`:

<!-- test: file literals.json -->
```json
{"admitted": 3.0, "refused": "b", "window": 9223372036854775808}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers literals.aontu literals.json
verdict: invalid

$.refused: scalar_value [conflict]
...
$.window: scalar_kind [conflict]
  [aontu/scalar_kind]: Cannot unify values at path $.window
  data: literals.json:1:45 (0d9223372036854775808)
  schema: literals.aontu:3:9 (9223372036854776000.0)
$ echo $?
1
```

The finding at `$.window` shows both sides. The literal outside the
leaf is a float, `9223372036854776000.0`, and the data read by value is
an exact integer, `0d9223372036854775808`. The two are numbers of
different kinds, and the literal admits no number the data can hold.

### Bounds

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | min {n x : Num} : n.le x → Admits env root (.min n) (.num x)
  | max {n x : Num} : x.le n → Admits env root (.max n) (.num x)
  /-- `multiple(0)` and a negative divisor admit nothing. -/
  | multiple {d x : Num} : 0 < d.coef → x.multipleOf d → Admits env root (.multiple d) (.num x)
```

The bounds compare values, whatever their scales:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The value of `x` is at most the value of `y`. -/
def Num.le (x y : Num) : Prop := x.coef * 10 ^ y.scale ≤ y.coef * 10 ^ x.scale
```

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The value of `x` is a whole multiple of the value of `d`, for a
positive `d`: `1.5` is a multiple of `0.5`, and every integer of `1`. -/
def Num.multipleOf (x d : Num) : Prop := (x.coef * 10 ^ d.scale) % (d.coef * 10 ^ x.scale) = 0
```

Multiplying each side by the other's power of ten puts both on one
scale, so `1.5` is three times `0.5` and `1.25` is no whole multiple of
it. The rule for `multiple` asks for a positive divisor, so
`multiple(0)` admits nothing:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `min(3)` admits `3`. -/
example : Instance .empty (.min (.ofInt 3)) (.int 3) := .min (by decide)

/-- `min(3)` refuses `2`. -/
example : ¬ Instance .empty (.min (.ofInt 3)) (.int 2) := by
  intro h
  cases h with
  | min h => exact absurd h (by decide)

/-- `min(3)` admits `3.5`. -/
example : Instance .empty (.min (.ofInt 3)) (.dec 35 1) := .min (by decide)

/-- `max(2.5)` admits `2.5`. -/
example : Instance .empty (.max ⟨25, 1, true⟩) (.dec 25 1) := .max (by decide)

/-- `max(2.5)` refuses `2.6`. -/
example : ¬ Instance .empty (.max ⟨25, 1, true⟩) (.dec 26 1) := by
  intro h
  cases h with
  | max h => exact absurd h (by decide)

/-- `multiple(0.5)` admits `1.5`. -/
example : Instance .empty (.multiple ⟨5, 1, true⟩) (.dec 15 1) := .multiple (by decide) (by decide)

/-- `multiple(0.5)` refuses `1.25`. -/
example : ¬ Instance .empty (.multiple ⟨5, 1, true⟩) (.dec 125 2) := by
  intro h
  cases h with
  | multiple _ h => exact absurd h (by decide)

/-- `multiple(0)` refuses `0`, and everything else. -/
example : ¬ Instance .empty (.multiple (.ofInt 0)) (.int 0) := by
```

Write `bounds.aontu`:

<!-- test: scenario bounds -->
<!-- test: file bounds.aontu -->
```aontu
admitted: min(3)
refused: min(3)
fraction: min(3)
ceiling: max(2.5)
above: max(2.5)
half: multiple(0.5)
quarter: multiple(0.5)
zero: multiple(0)
```

and `bounds.json`:

<!-- test: file bounds.json -->
```json
{"admitted": 3, "refused": 2, "fraction": 3.5, "ceiling": 2.5, "above": 2.6, "half": 1.5, "quarter": 1.25, "zero": 0}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers bounds.aontu bounds.json
verdict: invalid

$.zero: invalid-arg [conflict]
...
$.refused: constraint [conflict]
...
$.above: constraint [conflict]
...
$.quarter: constraint [conflict]
...
$ echo $?
1
```

`min(3)` admits `3` itself, and `3.5`. The engine reports `multiple(0)`
as an argument it can't use, and the definition, which has no
ill-formed values, as a value that admits nothing.

### Keys, required and optional

A map's rule has four premises:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- A map: every declared key that is present holds its value, and
  holds every declaration of it; a key that is absent is optional in
  every declaration; the spread holds every member, declared or not;
  a sealed map holds no key it does not declare. -/
  | map {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool}
      {jfs : List (String × Json)} :
      (∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x → Admits env root v x) →
      (∀ k o v, (k, o, v) ∈ fs → lookup k jfs = none → o = true) →
      (∀ s, spread = some s → ∀ k x, (k, x) ∈ jfs → Admits env root s x) →
      (closed = true → ∀ k x, (k, x) ∈ jfs → ∃ o v, (k, o, v) ∈ fs) →
      Admits env root (.map fs spread closed) (.obj jfs)
```

Read `∀ k o v x` as "for all `k`, `o`, `v`, and `x`" and `∈` as "is a
member of" in the premises, and `lookup` as the member a document names
`k`:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The value of the first member named `k`; in a well-formed document,
the only one. -/
def lookup (k : String) : List (String × Json) → Option Json
  | [] => none
  | (k', v) :: fs => if k = k' then some v else lookup k fs
```

The first premise holds a present key to its value, and the second lets
a key be absent only where every declaration makes it optional. The
last two are the spread and the seal, which follow below.

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x: integer}` admits `{"x": 1}`. -/
example : Instance .empty (.map [("x", false, .integer)] none false) (.obj [("x", .int 1)]) := by
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x: integer}` refuses `{}`: the key is required. -/
example : ¬ Instance .empty (.map [("x", false, .integer)] none false) (.obj []) := by
  intro h
  cases h with
  | map _ ha _ _ => exact absurd (ha "x" false .integer (List.mem_singleton.mpr rfl) rfl) (by decide)
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x?: integer}` admits `{}`. -/
example : Instance .empty (.map [("x", true, .integer)] none false) (.obj []) :=
  .map (fun _ _ _ _ _ hx => nomatch hx)
    (fun _ _ _ hm _ => by cases List.mem_singleton.mp hm; rfl)
    (fun _ h => nomatch h) (fun h => nomatch h)

/-- `{x?: integer}` refuses `{"x": "a"}`. -/
example : ¬ Instance .empty (.map [("x", true, .integer)] none false) (.obj [("x", .str "a")]) := by
  intro h
  cases h with
  | map hp _ _ _ => nomatch hp "x" true .integer (.str "a") (List.mem_singleton.mpr rfl) rfl

/-- `{x?: integer}` refuses `[]`: an array is not a map. -/
example : ¬ Instance .empty (.map [("x", true, .integer)] none false) (.arr []) :=
  fun h => nomatch h
```

A quote that ends at `:= by` stops before the proof, which follows in
the file and which the build checks. The formatter writes a map under a
key as a path, so `admitted: x: integer` is `admitted: {x: integer}`.
Write `keys.aontu`:

<!-- test: scenario keys -->
<!-- test: file keys.aontu -->
```aontu
admitted: x: integer
refused: x: integer
optional: x?: integer
wrong: x?: integer
array: x?: integer
```

and `keys.json`:

<!-- test: file keys.json -->
```json
{"admitted": {"x": 1}, "refused": {}, "optional": {}, "wrong": {"x": "a"}, "array": []}
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
$.array: map [conflict]
...
$ echo $?
1
```

The two refusals are of different kinds. At `$.refused.x` nothing
contradicts the schema, but a required key is missing, so the class is
`incomplete`; at `$.wrong.x`, `"a"` can never be an integer, and
`$.array` holds an array, which isn't a map at all. The
definition says only that the value refuses both, and the class is the
engine's.

### Spreads and seals

The third premise is the spread, which holds every member, declared or
not:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{&: integer}` admits `{"a": 1, "b": 2}`: the spread holds every member. -/
example : Instance .empty (.map [] (some .integer) false) (.obj [("a", .int 1), ("b", .int 2)]) := by
  refine .map (fun _ _ _ _ h => nomatch h) (fun _ _ _ h => nomatch h) ?_ (fun h => nomatch h)
  intro s hs k x hm
  cases hs
  simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
  rcases hm with ⟨-, rfl⟩ | ⟨-, rfl⟩ <;> exact .integer rfl (by decide)

/-- `{a: integer, &: string}` refuses `{"a": 1}`: the spread holds the
declared key as well. -/
example : ¬ Instance .empty (.map [("a", false, .integer)] (some .string) false)
    (.obj [("a", .int 1)]) := by
```

Write `spreads.aontu`:

<!-- test: scenario spreads -->
<!-- test: file spreads.aontu -->
```aontu
admitted: { &: integer }
refused: { a:integer &: string }
```

and `spreads.json`:

<!-- test: file spreads.json -->
```json
{"admitted": {"a": 1, "b": 2}, "refused": {"a": 1}}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers spreads.aontu spreads.json
verdict: error

$.refused.a: scalar-type [conflict]
...
$ echo $?
4
```

The spread meets the declared `a` as well, and `integer & string`
admits nothing. The engine answers `error`: the schema contradicts
itself at `a`, whatever the data.

The fourth premise is the seal. A sealed map holds no key it doesn't
declare, and leaves an absent optional key alone:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `close({a: integer})` refuses `{"a": 1, "b": 2}`: `b` is not declared. -/
example : ¬ Instance .empty (.map [("a", false, .integer)] none true)
    (.obj [("a", .int 1), ("b", .int 2)]) := by
  intro h
  cases h with
  | map _ _ _ hc =>
    obtain ⟨o, v, hm⟩ := hc rfl "b" (.int 2) (by simp)
    simp at hm

/-- `close({a?: integer})` admits `{}`. -/
example : Instance .empty (.map [("a", true, .integer)] none true) (.obj []) :=
  .map (fun _ _ _ _ _ hx => nomatch hx)
    (fun _ _ _ hm _ => by cases List.mem_singleton.mp hm; rfl)
    (fun _ h => nomatch h) (fun _ _ _ h => nomatch h)
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

`close()` seals every map beneath it as well, and the definition holds
each map's seal in its own `closed` flag.

### Lists

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- A list: every written position is present and holds its value;
  later elements are allowed; the spread holds every element. -/
  | list {items : List Val} {spread : Option Val} {xs : List Json} :
      items.length ≤ xs.length →
      (∀ (i : Nat) (v : Val) (x : Json), items[i]? = some v → xs[i]? = some x →
        Admits env root v x) →
      (∀ s, spread = some s → ∀ x, x ∈ xs → Admits env root s x) →
      Admits env root (.list items spread) (.arr xs)
```

`items[i]?` is the item at position `i`, or `none` past the end. So
`[integer, string]` needs two elements, and allows more:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `[integer, string]` admits `[1, "a", true]`: the list stays open. -/
example : Instance .empty (.list [.integer, .string] none) (.arr [.int 1, .str "a", .bool true]) := by
  refine .list (by decide) ?_ (fun _ h => nomatch h)
  intro i v x hv hx
  rcases i with _ | _ | i
  · cases hv; cases hx; exact .integer rfl (by decide)
  · cases hv; cases hx; exact .string (by decide)
  · simp at hv

/-- `[integer, string]` refuses `[1]`: a written position is missing. -/
example : ¬ Instance .empty (.list [.integer, .string] none) (.arr [.int 1]) := by
  intro h
  cases h with
  | list hlen _ _ => exact absurd hlen (by decide)

/-- `[&: integer]` refuses `[1, "a"]`: the spread holds every element. -/
example : ¬ Instance .empty (.list [] (some .integer)) (.arr [.int 1, .str "a"]) := by
```

The formatter separates list elements with spaces. Write
`lists.aontu`:

<!-- test: scenario lists -->
<!-- test: file lists.aontu -->
```aontu
admitted: [integer string]
refused: [integer string]
spread: [&: integer]
```

and `lists.json`:

<!-- test: file lists.json -->
```json
{"admitted": [1, "a", true], "refused": [1], "spread": [1, "a"]}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers lists.aontu lists.json
verdict: invalid

$.refused.1: listval_no_gen [incomplete]
...
$.spread.1: no_scalar_unify [conflict]
...
$ echo $?
1
```

The list stays open, so it admits `true`, past the written positions.
The missing second element is `incomplete`, the class of a missing
required key.

### Conjunction

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | meet {a b : Val} {j : Json} :
      Admits env root a j → Admits env root b j → Admits env root (.meet a b) j
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `integer & min(3)` admits `7`. -/
example : Instance .empty (.meet .integer (.min (.ofInt 3))) (.int 7) :=
  .meet (.integer rfl (by decide)) (.min (by decide))

/-- `integer & min(3)` refuses `2`. -/
example : ¬ Instance .empty (.meet .integer (.min (.ofInt 3))) (.int 2) := by
  intro h
  cases h with
  | meet _ h => cases h with | min h => exact absurd h (by decide)
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

### Aliases, and recursion

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- An alias admits what its declaration admits; an undeclared one
  admits nothing. -/
  | alias {n : String} {v : Val} {j : Json} :
      env n = some v → Admits env root v j → Admits env root (.alias n) j
```

An alias admits what its value admits, and that is the whole of
recursion. For `%T = {n?: %T, v?: integer}`:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `%T = {n?: %T, v?: integer}`. -/
abbrev T : Val := .map [("n", true, .alias "T"), ("v", true, .integer)] none false

def envT : Env := fun n => if n = "T" then some T else none
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{"n": {"v": 1}}` is a `%T`. The proof is the derivation itself,
and it follows the data down. -/
example : Instance envT T (.obj [("n", .obj [("v", .int 1)])]) := by
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{"v": "x"}` is not: no derivation exists. -/
example : ¬ Instance envT T (.obj [("v", .str "x")]) := by
```

The proof that `{"n": {"v": 1}}` is a `%T` holds a proof that
`{"v": 1}` is one, whose `n` is absent and whose `v` is an integer. A
document is finite, so the derivation stops where the data stops.
Write `tree.aontu`:

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

An alias the document doesn't declare has no value, so no rule
applies:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x: %U}` refuses `{"x": 1}`: `%U` is declared nowhere. -/
example : ¬ Instance .empty (.map [("x", false, .alias "U")] none false) (.obj [("x", .int 1)]) := by
```

Write `undeclared.aontu`:

<!-- test: scenario undeclared -->
<!-- test: file undeclared.aontu -->
```aontu
x: %U
```

and `undeclared.json`:

<!-- test: file undeclared.json -->
```json
{"x": 1}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers undeclared.aontu undeclared.json
verdict: error

$.x: no_path [reference]
...
$ echo $?
4
```

The engine can't resolve `%U`, so it answers `error`, a schema it
can't use, and the definition admits nothing at `x`.

### Path references

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- A path admits the value the document holds there, compared by
  value. -/
  | path {p : List Seg} {j' j : Json} :
      root.at p = some j' → j'.Same j → Admits env root (.path p) j
```

A path reads `root`, the whole document, and compares what it finds by
value:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- Two documents are one value: numbers equal by value, arrays element
by element, and objects member by member, whatever order each writes
them in. -/
inductive Json.Same : Json → Json → Prop
  | null : Same .null .null
  | bool {b : Bool} : Same (.bool b) (.bool b)
  | num {x y : Num} : x.eqv y → Same (.num x) (.num y)
  | str {s : String} : Same (.str s) (.str s)
  | arr {xs ys : List Json} :
      xs.length = ys.length →
      (∀ (i : Nat) (x y : Json), xs[i]? = some x → ys[i]? = some y → Same x y) →
      Same (.arr xs) (.arr ys)
  | obj {fs gs : List (String × Json)} :
      (∀ k, (lookup k fs).isSome = (lookup k gs).isSome) →
      (∀ k x y, lookup k fs = some x → lookup k gs = some y → Same x y) →
      Same (.obj fs) (.obj gs)
```

`Same` is a relation of its own, with a rule for each kind of document,
so `1` and `1.0` are one value, and two objects that list one set of
members in two orders are one value too.

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x: $.y, y: integer}`. -/
abbrev refDoc (y : Val) : Val := .map [("x", false, .path [.key "y"]), ("y", false, y)] none false
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- It admits `{"x": 1, "y": 1}`. -/
example : Instance .empty (refDoc .integer) (.obj [("x", .int 1), ("y", .int 1)]) := by
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- It refuses `{"x": 1, "y": 2}`. -/
example : ¬ Instance .empty (refDoc .integer) (.obj [("x", .int 1), ("y", .int 2)]) := by
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x: $.y, y: number}` admits `{"x": 1, "y": 1.0}`: the two are one
value. -/
example : Instance .empty (refDoc .number) (.obj [("x", .int 1), ("y", .dec 1 0)]) := by
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

Then write `values.aontu`:

<!-- test: scenario values -->
<!-- test: file values.aontu -->
```aontu
x: $.y
y: number
```

and `values.json`:

<!-- test: file values.json -->
```json
{"x": 1, "y": 1.0}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers values.aontu values.json
verdict: valid
```

## 5. The order, and the meet

`spec/Aontu/Order.lean` orders values by what they admit:

<!-- test: quote spec/Aontu/Order.lean -->
```lean
/-- Every document `a` admits, `b` admits, each read as a whole. -/
def Le (env : Env) (a b : Val) : Prop := ∀ j, Instance env a j → Instance env b j

notation:50 a:51 " ⊑[" env "] " b:51 => Le env a b
```

`∀ j` reads "for every document `j`" and `→` reads "implies", so
`a ⊑[env] b` says every instance of `a` is an instance of `b`. Three
theorems make `&` the [meet](unification.md) of that order, its
greatest lower bound:

<!-- test: quote spec/Aontu/Order.lean -->
```lean
theorem meet_le_left (env : Env) (a b : Val) : .meet a b ⊑[env] a := by
  intro _ h; cases h with | meet h _ => exact h

theorem meet_le_right (env : Env) (a b : Val) : .meet a b ⊑[env] b := by
  intro _ h; cases h with | meet _ h => exact h

theorem le_meet {env : Env} {a b c : Val} (ha : c ⊑[env] a) (hb : c ⊑[env] b) :
    c ⊑[env] .meet a b :=
  fun j h => .meet (ha j h) (hb j h)
```

The first two put `a & b` below each side, and `le_meet` puts anything
below both sides below `a & b`. The first proof is the whole argument:
only the `meet` rule admits an instance of `a & b`, and its first
premise is that `a` admits it.

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `integer` is above `integer & min(3)`. -/
example : .meet .integer (.min (.ofInt 3)) ⊑[.empty] .integer := meet_le_left _ _ _

/-- `integer & min(3)` is not above `integer`: `2` is the instance that
shows it. -/
example : ¬ (.integer ⊑[.empty] .meet .integer (.min (.ofInt 3))) := by
  intro h
  cases h (.int 2) (.integer rfl (by decide)) with
  | meet _ h => cases h with | min h => exact absurd h (by decide)
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
declarations into one. A theorem states that the merge loses nothing
and adds nothing:

<!-- test: quote spec/Aontu/Order.lean -->
```lean
theorem merge_exact (env : Env) (root : Json) (k : String) (o₁ o₂ : Bool) (v₁ v₂ : Val)
    (j : Json) :
    Admits env root (.map [(k, o₁ && o₂, .meet v₁ v₂)] none false) j ↔
      Admits env root (.meet (.map [(k, o₁, v₁)] none false) (.map [(k, o₂, v₂)] none false))
        j := by
```

`↔` reads "exactly when". The merged key is optional only where both
declarations say so (`o₁ && o₂`), and its value is the meet of the two.

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x?: integer} & {x: integer}` refuses `{}`: the key is required. -/
example : ¬ Instance .empty
    (.meet (.map [("x", true, .integer)] none false) (.map [("x", false, .integer)] none false))
    (.obj []) := by
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

Both engines' test suites run rows the definition generates (step 9
shows how), and on a few of them the engines do not answer as the
definition does. [`spec/ledger.tsv`](../spec/ledger.tsv) lists each such case,
with the answer each side gives, which side changes, and why.

In some, the engines admit what the definition refuses. No meet with
`string` admits `""`:

<!-- test: quote spec/Aontu/Order.lean -->
```lean
/-- `string & empty()` admits `""`, which `string` refuses, so it is no
meet with `string`: no meet with `string` admits `""`. It is a form of
its own. -/
theorem no_meet_with_string_admits_empty (env : Env) (root : Json) (b : Val) :
    ¬ Admits env root (.meet .string b) (.str "") := by
  intro h
  cases h with
  | meet hs _ => cases hs with | string hne => exact hne rfl
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `string & (string & empty())` refuses `""`, which both engines admit. -/
example : ¬ Instance .empty (.meet .string .anyString) (.str "") :=
  no_meet_with_string_admits_empty _ _ _
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
example : Instance .empty
    (.meet (.map [("x", true, .string)] none false) (.map [("x", true, .integer)] none false))
    (.obj []) :=
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

## 8. Trial schemas

`nof` and `when` ask whether a schema refuses a document, and a rule
cannot depend on the negation of the relation it defines. Lean refuses
such a definition, since it might have no meaning, so
`spec/Aontu/Trial.lean` defines trials in a layer above `Admits`:

<!-- test: quote spec/Aontu/Trial.lean -->
```lean
/-- A trial schema. -/
inductive Trial where
  | is (v : Val)                     -- a value, tried
  | when (c t e : Trial)             -- `when(c, t, e)`; `when(c, t)` is `when(c, t, any)`
  | nof (n : Val) (cs : List Trial)  -- `nof(n, c₁, …, cₖ)`

mutual
/-- `Holds env root c j`: the trial `c` passes on `j`. `nof(n, …)`
passes where `n` admits the number of its trials that pass. -/
def Holds (env : Env) (root : Json) : Trial → Json → Prop
  | .is v, j => Admits env root v j
  | .when c t e, j =>
    (Holds env root c j ∧ Holds env root t j) ∨ (¬ Holds env root c j ∧ Holds env root e j)
  | .nof n cs, j => ∃ k, Count env root cs j k ∧ Admits env root n (.int k)

/-- `Count env root cs j k`: exactly `k` of the trials `cs` pass on `j`. -/
def Count (env : Env) (root : Json) : List Trial → Json → Nat → Prop
  | [], _, k => k = 0
  | c :: cs, j, k =>
    (Holds env root c j ∧ ∃ k', k = k' + 1 ∧ Count env root cs j k') ∨
      (¬ Holds env root c j ∧ Count env root cs j k)
end
```

`mutual` defines two things that read each other. `Holds` recurses on
the trial schema, which is what lets `¬` appear in it, and `Count` says
how many trials of a list pass. `nof(n, …)` passes where `n` admits that
count, so `nof(1, …)` asks for exactly one:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `nof(1, integer, min(0))` admits `-1`, which one trial admits. -/
example : Holds .empty (.int (-1)) (.nof (.lit (.int 1)) [.is .integer, .is (.min (.ofInt 0))])
    (.int (-1)) := by
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- …and refuses `3`, which both admit. -/
example : ¬ Holds .empty (.int 3) (.nof (.lit (.int 1)) [.is .integer, .is (.min (.ofInt 0))])
    (.int 3) := by
```

The refusal leans on a theorem of the same file, that a list of trials
has one count at most:

<!-- test: quote spec/Aontu/Trial.lean -->
```lean
/-- A list of trials has one count at most. -/
theorem Count.unique {env : Env} {root : Json} :
    ∀ {cs : List Trial} {j : Json} {k k' : Nat},
      Count env root cs j k → Count env root cs j k' → k = k'
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

`-1` is an integer below zero, so one trial passes. `3` passes both.
`when(c, t, e)` holds a document to `t` where `c` admits it, and to `e`
where it doesn't:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `when(string, "a", min(0))` admits `5`: not a string, and at least 0. -/
example : Holds .empty (.int 5)
    (.when (.is .string) (.is (.lit (.str "a"))) (.is (.min (.ofInt 0)))) (.int 5) :=
  .inr ⟨(fun h => nomatch h), .min (by decide)⟩

/-- …and refuses `"b"`: a string, and not `"a"`. -/
example : ¬ Holds .empty (.str "b")
    (.when (.is .string) (.is (.lit (.str "a"))) (.is (.min (.ofInt 0)))) (.str "b") := by
```

Write `when.aontu`:

<!-- test: scenario when -->
<!-- test: file when.aontu -->
```aontu
admitted: when(string, "a", min(0))
refused: when(string, "a", min(0))
```

and `when.json`:

<!-- test: file when.json -->
```json
{"admitted": 5, "refused": "b"}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers when.aontu when.json
verdict: invalid

$.refused: when [conflict]
...
$ echo $?
1
```

## 9. A checker, admitted by a proof

`Admits` is a statement, so Lean cannot run it. Running needs an
algorithm, and `spec/Aontu/Check.lean` holds one, for every value that
reads neither an alias nor a path:

<!-- test: quote spec/Aontu/Check.lean -->
```lean
/-- The values that read neither an alias nor a path, so that what they
admit depends on no declaration and no document root. -/
inductive Val.RefFree : Val → Prop
  | any : RefFree .any
  | nil : RefFree .nil
  | boolean : RefFree .boolean
  | number : RefFree .number
  | integer : RefFree .integer
  | string : RefFree .string
  | anyString : RefFree .anyString
  | lit {s : Scalar} : RefFree (.lit s)
  | min {n : Num} : RefFree (.min n)
  | max {n : Num} : RefFree (.max n)
  | multiple {d : Num} : RefFree (.multiple d)
  | map {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool} :
      (∀ k o v, (k, o, v) ∈ fs → RefFree v) → (∀ s, spread = some s → RefFree s) →
      RefFree (.map fs spread closed)
  | list {items : List Val} {spread : Option Val} :
      (∀ v, v ∈ items → RefFree v) → (∀ s, spread = some s → RefFree s) →
      RefFree (.list items spread)
  | meet {a b : Val} : RefFree a → RefFree b → RefFree (.meet a b)
```

`check` returns `true` or `false`, where `Admits` is a statement. Its
first cases:

<!-- test: quote spec/Aontu/Check.lean -->
```lean
/-- Whether `v` admits `j`, computed. -/
def check : Val → Json → Bool
  | .any, _ => true
  | .nil, _ => false
  | .boolean, j => match j with
    | .bool _ => true
    | _ => false
  | .number, j => match j with
    | .num _ => true
    | _ => false
  | .integer, j => match j with
    | .num x => match x.int? with
      | some n => decide (IntegerLeaf n)
      | none => false
    | _ => false
  | .string, j => match j with
    | .str s => decide (s ≠ "")
```

The rest of it takes one case for each form in the same way. Nothing in
the code says that `check` and `Admits` agree. One theorem does:

<!-- test: quote spec/Aontu/Check.lean -->
```lean
/-- `check` decides admission for every value that reads no reference. -/
theorem check_iff {v : Val} (h : v.RefFree) : ∀ j, check v j = true ↔ Admits env root v j := by
```

With `check_iff` proved, an answer `check` computes is the definition's
answer:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `check` computes: `integer & min(3)` admits `7`. -/
example : check (.meet .integer (.min (.ofInt 3))) (.int 7) = true := by decide

/-- …and `{x: integer}` refuses `{}`. -/
example : check (.map [("x", false, .integer)] none false) (.obj []) = false := by decide
```

`spec/Oracle.lean` uses `check` to write the engines' test rows. It
builds every value of the fragment up to one `&`, and a set of
documents to try each against:

<!-- test: quote spec/Oracle.lean -->
```lean
def bases : List Val :=
  [.any, .nil, .integer, .meet .number (.multiple (.ofInt 1)), .string, .anyString,
    .min (.ofInt 0), .min (.ofInt 3)]

/-- `{"x": v}`, or `{"x"?: v}`. -/
def field (opt : Bool) (v : Val) : Val := .map [("x", opt, v)] none false

def level1 : List Val := bases ++ bases.flatMap fun v => [field true v, field false v]

def vals : List Val := level1 ++ level1.flatMap fun a => level1.map (.meet a)

def scalars : List Json := [.null, .bool true, .int 0, .int 3, .int (-1), .str "", .str "a"]

def jsons : List Json :=
  scalars ++ [.obj []] ++ scalars.map (fun j => .obj [("x", j)]) ++ [.obj [("y", .int 1)]]
```

The file proves that every value it builds reads no reference, and
every document is data, so each answer is the definition's:

<!-- test: quote spec/Oracle.lean -->
```lean
/-- Every row's verdict is the definition's: `v` admits `j`, read as a
whole document that declares no alias. -/
theorem verdict_exact {v : Val} (hv : v ∈ vals) (j : Json) :
    check v j = true ↔ Instance Env.empty v j :=
  check_iff (vals_refFree v hv) j
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

The schema is aontu text, written by `spec/Aontu/Print.lean`:

<!-- test: quote spec/Aontu/Print.lean -->
```lean
  | .map fs spread false => do
    let entries ← fieldsSrc fs
    let rest ← spreadSrc spread
    pure ("{" ++ ", ".intercalate (entries ++ rest) ++ "}")
  | .map _ _ true => none
  | .list _ _ => none
  | .meet a b => do pure s!"({← a.src}) & ({← b.src})"
```

The printer quotes every key, as the published grammar does, and
writes a meet with each side in brackets. It's the one part of the
definition no proof checks, since what an engine reads a text as is
outside Lean, so it prints only what the oracle needs, and answers
`none` for a sealed map, a list, an alias, and a path.

## 10. The JSON Schema translations

`spec/Aontu/JsonSchema.lean` holds a small piece of JSON Schema, and
what a 2020-12 validator answers for it:

<!-- test: quote spec/Aontu/JsonSchema.lean -->
```lean
/-- A JSON Schema fragment. -/
inductive Schema where
  | typeString               -- `{"type": "string"}`
  | typeInteger              -- `{"type": "integer"}`
  | allOf (a b : Schema)     -- `{"allOf": [a, b]}`

/-- What a 2020-12 validator answers, where an integer is a number
whose value is whole, `1.0` included. -/
def Schema.valid : Schema → Json → Prop
  | .typeString, j => ∃ s, j = .str s
  | .typeInteger, j => ∃ n, j.int? = some n
  | .allOf a b, j => a.valid j ∧ b.valid j
```

and two translations into aontu values:

<!-- test: quote spec/Aontu/JsonSchema.lean -->
```lean
/-- `--faithful`: the spellings that admit what a validator admits. -/
def importFaithful : Schema → Val
  | .typeString => .anyString
  | .typeInteger => .meet .number (.multiple (.ofInt 1))
  | .allOf a b => .meet (importFaithful a) (importFaithful b)

/-- The default: the natural aontu equivalent of each keyword. -/
def importNatural : Schema → Val
  | .typeString => .string
  | .typeInteger => .integer
  | .allOf a b => .meet (importNatural a) (importNatural b)
```

The first spells each keyword by what a validator admits, so
`type: string` holds `""` and `type: integer` holds every whole number,
`1.0` among them. The second uses the aontu kind of the same name. A
theorem states what each gives:

<!-- test: quote spec/Aontu/JsonSchema.lean -->
```lean
theorem faithful_exact (s : Schema) (env : Env) (root j : Json) :
    Admits env root (importFaithful s) j ↔ s.valid j := by
```

<!-- test: quote spec/Aontu/JsonSchema.lean -->
```lean
theorem natural_sound (s : Schema) (env : Env) (root j : Json) :
    Admits env root (importNatural s) j → s.valid j := by
```

The first admits exactly what a validator admits. The second never
admits what a validator refuses and may refuse more, and two theorems
name what it refuses:

<!-- test: quote spec/Aontu/JsonSchema.lean -->
```lean
/-- A validator admits `""` as a string; `string` refuses it. -/
theorem natural_refuses_empty_string (env : Env) (root : Json) :
    Schema.typeString.valid (.str "") ∧ ¬ Admits env root (importNatural .typeString) (.str "") :=
  ⟨⟨_, rfl⟩, fun h => by cases h with | string h => exact h rfl⟩

/-- A validator admits `9007199254740993` as an integer; `integer`
refuses it, since no double holds it. -/
theorem natural_refuses_outside_integer_leaf (env : Env) (root : Json) :
    Schema.typeInteger.valid (.int 9007199254740993) ∧
      ¬ Admits env root (importNatural .typeInteger) (.int 9007199254740993) := by
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

## 11. What any `subsume` must answer

`⊑` quantifies over every document, of which there are infinitely
many, so no program computes it in general. The definition states
instead what an answer from `subsume` must respect:

<!-- test: quote spec/Aontu/Order.lean -->
```lean
/-- The answers `aontu subsume` gives about two documents that stand. -/
inductive Subsumption where
  | subsumes
  | doesNotSubsume
  | undecided

/-- The contract on an implementation: `subsumes` only where the order
holds, `doesNotSubsume` only where it fails, and `undecided` anywhere.
`Le` quantifies over every document, infinitely many, so the contract
says what a correct answer is and leaves how to reach one open. -/
def SubsumeCorrect (env : Env) (subsume : Val → Val → Subsumption) : Prop :=
  ∀ general specific,
    (subsume general specific = .subsumes → specific ⊑[env] general) ∧
    (subsume general specific = .doesNotSubsume → ¬ specific ⊑[env] general)
```

A `subsumes` must be true and a `doesNotSubsume` must be true, while
`undecided` is always allowed. The contract names no algorithm, and the
tour proves that a `subsume` that never commits meets it:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- One implementation: never commit. Correct, and useless. -/
def subsumeNever : Val → Val → Subsumption := fun _ _ => .undecided

example (env : Env) : SubsumeCorrect env subsumeNever := by
  intro _ _; simp [subsumeNever]
```

A wrong one fails it, and refuting it needs no engine run:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- A wrong one: it says `{x: any}` subsumes `{x?: any}`. -/
def subsumeWrong : Val → Val → Subsumption
  | .map [(_, false, _)] none false, .map [(_, true, _)] none false => .subsumes
  | _, _ => .undecided

/-- The definition refutes it, with `{}` as the witness, and no engine
run. -/
example : ¬ SubsumeCorrect .empty subsumeWrong := by
```

The witness is `{}`. `{x?: any}` admits it and `{x: any}` refuses it,
so `{x: any}` is not above `{x?: any}`. Write `required.aontu`:

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

The engine answers `does_not_subsume` where `subsumeWrong` answered
`subsumes`, and its finding gives the same reason: `{x?: any}` admits
instances without the key.

## 12. What the definition doesn't say yet

The definition covers what this page walked through, and has no rule
for the rest of the language, so it says nothing about it. The
[language reference](reference-language.md) states the rest: the
default read mode and the numeric kinds beyond `integer`, the bounds
beyond `min`, `max` and `multiple`, most built-in functions,
generation with `each`, `pack` and `emit`, formats, and marks such as
`hide()` and `type()`. [`aontu vet`](reference-api.md#aontu-vet) states
which refusal is `invalid`, `incomplete` or `error`, and the shared
test suite in [`test/spec/`](../test/spec/) holds both engines to them.

Two constructs the definition leaves out on purpose: `|` and `*`. The
language reads each by where it stands, so a rule for each form alone
would be wrong. Write `position.aontu`:

<!-- test: scenario position -->
<!-- test: file position.aontu -->
```aontu
alone: *1
arm: [integer]|[string]
list: [integer]
```

and `position.json`:

<!-- test: file position.json -->
```json
{"alone": 2, "arm": [1, 2], "list": [1, 2]}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers position.aontu position.json
verdict: invalid

$.arm: empty [conflict]
...
$ echo $?
1
```

A preference alone is a default its type can override, so `*1` admits
`2`, as the [reference](reference-language.md#preference--default-)
says. A list in a disjunction admits only its own length, so the arm
`[integer]` refuses `[1, 2]`, which the same list admits at `$.list`.

Next, read [unification](unification.md), which explains in prose the
operation these rules define.
