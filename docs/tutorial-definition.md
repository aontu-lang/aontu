# Tutorial: read the formal definition

The [language reference](reference-language.md) describes aontu in
prose. Part of the language is also defined in
[Lean 4](https://lean-lang.org/), in the repository's
[`spec/`](../spec/) directory, as statements a proof checker verifies,
and the test suites hold both engines to that definition.

The definition says what aontu values mean: which JSON values each one
admits. It says nothing about text: how to parse an aontu file is the
grammar's business, and how to read a JSON file is each engine's. This
page reads the definition one part at a time, starting from the
scalars. Each rule comes with a value it admits and a value it refuses,
checked twice: as a Lean example the definition's build proves, and as
a transcript of the engine. You need no Lean beforehand, because each
step says what its notation means where it first appears. The page
assumes the [first tutorial](tutorial-config.md).

## 1. Set up

The definition is seven Lean modules, which make one definition: every
module reads the same JSON values, the same terms, and the same rule
for what a term admits, and none declares its own.

| File | Holds |
|---|---|
| [`spec/Aontu/Data.lean`](../spec/Aontu/Data.lean) | JSON values, scalars first: the integers `integer` holds, numbers as rationals, strings, then arrays and objects, and paths into a value |
| [`spec/Aontu/Syntax.lean`](../spec/Aontu/Syntax.lean) | the terms of the language, one constructor for each construct |
| [`spec/Aontu/Admits.lean`](../spec/Aontu/Admits.lean) | what each term admits, one rule for each form |
| [`spec/Aontu/Order.lean`](../spec/Aontu/Order.lean) | the order between terms, the meet, two declarations of one key, and the contract any `subsume` must meet |
| [`spec/Aontu/Trial.lean`](../spec/Aontu/Trial.lean) | the trial schemas `nof` and `when` |
| [`spec/Aontu/Check.lean`](../spec/Aontu/Check.lean) | a checker, and the theorem that makes its answers the definition's |
| [`spec/Aontu/Tour.lean`](../spec/Aontu/Tour.lean) | the examples this page walks through |

Two more files test the engines against the definition and are no part
of it: [`spec/Oracle.lean`](../spec/Oracle.lean), the program that
writes the engines' test rows, and
[`spec/Oracle/Print.lean`](../spec/Oracle/Print.lean), which writes the
values of each row as text.

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
flags. `--exact-numbers` has the engine take each number of the data at
its exact value, which is what a number is in the definition, and
`--no-fill` has it check the data as given rather than as the schema
could complete it. Each step's schema states its terms at named keys,
and the data gives each key one value. Each finding names the key the
engine refused, says why, and points at what it can: where the data
holds the value, where the schema states the term, or both. The exit code
says which kind of refusal it was: `1` for `invalid`, `3` for
`incomplete`, `4` for `error`.

## 2. Scalars

A JSON value is a scalar, an array of values, or an object, and the
scalars come first, here as in the definition. `spec/Aontu/Data.lean`
lists them first among the ways to build a JSON value:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
inductive Json where
  | num (x : Rat)
  | str (s : String)
  | bool (b : Bool)
  | null
```

`inductive` lists every way to build a value of a new type, one
constructor per line. A number holds a `Rat`, a string a `String`, and
a boolean a `Bool`, and `null` holds nothing. The same type goes on to
arrays and objects, which step 6 takes up.

The terms that admit the scalars come first in
`spec/Aontu/Syntax.lean` too, one constructor for each construct,
beside the name the reference gives it:

<!-- test: quote spec/Aontu/Syntax.lean -->
```lean
inductive Val where
  | integer                                 -- `integer`
  | number                                  -- `number`
  | string                                  -- `string`, every string but `""`
  | anyString                               -- `string & empty()`, every string
  | boolean                                 -- `boolean`
```

These five are the kinds of the scalars. Literals, bounds, and the
rest of the terms come with their rules in later steps.

What a term admits is one relation, in `spec/Aontu/Admits.lean`, with
one rule for each form. Its first line:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
inductive Admits (env : Env) (root : Json) : Val → Json → Prop
```

`Admits env root v j` says the JSON value `j`, found inside the whole
value `root`, is an instance of the term `v`, with the aliases `env`
declares. The result type `Prop` is a statement, true or false, that
Lean establishes by proof and never by running anything. Each
constructor is a rule of inference: when its premises hold, its
conclusion, after the last `→`, holds. A term admits a value when a
finite tree of these rules proves it.

The examples ask about a whole value, which is its own root:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
/-- `j` is an instance of `v` under the declarations `env`: `j` is a JSON
value, taken whole, so that it is its own root. This is the question
`aontu vet` answers. A Lean `Json` that is no JSON value, such as an
object that gives one name twice, is no instance of anything, so it is
never a witness. -/
abbrev Instance (env : Env) (v : Val) (j : Json) : Prop := j.WellFormed ∧ Admits env j v j
```

Read `∧` as "and": an instance is a pair, `j` being a JSON value and
`v` admitting it. Step 6 says how a Lean `Json` can fail to be a JSON
value, and every scalar is one.

### Integers

An integer is a Lean `Int`. As a JSON value it's a number, which
`Json.int` builds:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The integer `n`: `Json.int 3` is three. -/
def Json.int (n : Int) : Json := .num (.ofInt n)
```

The `integer` kind holds the integers of one range:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The integers the `integer` kind holds: the values a double holds
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

`example` states a claim, and what follows `:=` is its proof, which the
build checks. `by decide` proves a statement by computing its yes or no
answer, and `¬` reads *not*. The rule for `integer` admits each integer
of the range:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | integer {n : Int} : IntegerLeaf n → Admits env root .integer (.int n)
```

An argument in braces, such as `{n : Int}`, is one Lean works out for
itself, so the rule says that `integer` admits each integer `n` that
`IntegerLeaf` holds. No other rule concludes anything about `integer`,
so it admits nothing else:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `integer` admits `3`. -/
example : Instance .empty .integer (.int 3) := ⟨by decide, .integer (by decide)⟩

/-- `integer` admits `9007199254740994`, which a double holds. -/
example : Instance .empty .integer (.int 9007199254740994) := ⟨by decide, .integer (by decide)⟩

/-- `integer` refuses `9007199254740993`, which no double holds. -/
example : ¬ Instance .empty .integer (.int 9007199254740993) := by
  rintro ⟨-, h⟩
  cases h with
  | integer hl => exact absurd hl (by decide)

/-- `integer` refuses `9223372036854775808`, outside the window. -/
example : ¬ Instance .empty .integer (.int 9223372036854775808) := by
  rintro ⟨-, h⟩
  cases h with
  | integer hl => exact absurd hl (by decide)

/-- `integer` refuses the string `"3"`. -/
example : ¬ Instance .empty .integer (.str "3") := fun ⟨_, h⟩ => nomatch h
```

`Instance .empty .integer (.int 3)` claims that `integer` admits `3`
under no alias declaration. Its proof is a pair: `by decide` shows that
`3` is a JSON value, and `.integer (by decide)` names the rule and
proves its premise. A refusal takes the supposed proof apart with
`cases`, which lists every rule that could have given it, and shows
that each premise fails, and `fun ⟨_, h⟩ => nomatch h` finds no rule
that could have given `h` at all. Write `integers.aontu`:

<!-- test: scenario integers -->
<!-- test: file integers.aontu -->
```aontu
admitted: integer
double: integer
beyond: integer
window: integer
text: integer
```

and `integers.json`:

<!-- test: file integers.json -->
```json
{"admitted": 3, "double": 9007199254740994, "beyond": 9007199254740993, "window": 9223372036854775808, "text": "3"}
```

Now vet the data against the schema:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers integers.aontu integers.json
verdict: invalid

$.beyond: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.beyond
  data: integers.json:1:55 (0d9007199254740993)
  schema: integers.aontu:3:9 (integer)
$.window: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.window
  data: integers.json:1:83 (0d9223372036854775808)
  schema: integers.aontu:4:9 (integer)
$.text: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.text
  data: integers.json:1:112 ("3")
  schema: integers.aontu:5:7 (integer)
$ echo $?
1
```

`integer` admits `3` and `9007199254740994`, which a double holds. It
refuses `9007199254740993`, which no double holds,
`9223372036854775808`, which one does outside the window, and the
string `"3"`. The code of each finding, `no_scalar_unify`, says no
value is both, and its class, `conflict`, says no completion of the
data could change that. The `data:` and `schema:` lines point at the
two sides, each with its file, line, and column, and a `data:` line
shows a number as the engine took it, exactly, in its `0d` notation.

### Numbers

A number is a rational:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- A number: the rational `num / den`, with `den` positive and the two
in lowest terms, so that each number has one `Rat` and two numbers are
equal exactly when their values are. The integers are the numbers
whose `den` is one, and one and a half is `3 / 2`. -/
structure Rat where
  num : Int
  den : Nat
  den_pos : 0 < den
  reduced : Nat.gcd num.natAbs den = 1
```

`structure` declares a record with named fields. `num` and `den` give
the value, `num / den`, and `den_pos` and `reduced` are proofs: that
`den` is positive, and that the two share no factor. So one and a half
is `3 / 2` and never `6 / 4`, and two numbers are equal exactly when
their values are. An integer is a number whose `den` is one:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The integer `n`, as a number. -/
def Rat.ofInt (n : Int) : Rat := ⟨n, 1, Nat.one_pos, Nat.gcd_one_right _⟩

/-- The number `num / den`, given in lowest terms: `Rat.frac 3 2` is one
and a half. -/
def Rat.frac (num : Int) (den : Nat) (h : 0 < den := by decide)
    (r : Nat.gcd num.natAbs den = 1 := by decide) : Rat := ⟨num, den, h, r⟩
```

An argument written with `:= by decide` is a proof that Lean finds for
itself, so `Rat.frac 3 2` builds one and a half, and `Rat.frac 6 4`
doesn't build. `Json.frac` builds the JSON value the same way:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The number `num / den`, given in lowest terms: `Json.frac 3 2` is
one and a half. -/
def Json.frac (num : Int) (den : Nat) (h : 0 < den := by decide)
    (r : Nat.gcd num.natAbs den = 1 := by decide) : Json := .num (.frac num den h r)
```

`number` admits every number:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | number {x : Rat} : Admits env root .number (.num x)
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `number` admits one and a half. -/
example : Instance .empty .number (.frac 3 2) := ⟨by decide, .number⟩

/-- `number` admits `9007199254740993`, which `integer` refuses. -/
example : Instance .empty .number (.int 9007199254740993) := ⟨by decide, .number⟩

/-- `integer` refuses one and a half, which is no integer. -/
example : ¬ Instance .empty .integer (.frac 3 2) := by
```

The rule for `integer` concludes only about an integer, `n / 1`, and
one and a half is `3 / 2`, so `cases` finds no rule that fits. A quote
that ends at `:= by` stops before the proof, which follows in the file
and which the build checks. Write `numbers.aontu`:

<!-- test: scenario numbers -->
<!-- test: file numbers.aontu -->
```aontu
fraction: number
big: number
text: number
half: integer
```

and `numbers.json`:

<!-- test: file numbers.json -->
```json
{"fraction": 1.5, "big": 9007199254740993, "text": "1", "half": 1.5}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers numbers.aontu numbers.json
verdict: invalid

$.text: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.text
  data: numbers.json:1:52 ("1")
  schema: numbers.aontu:3:7 (number)
$.half: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.half
  data: numbers.json:1:65 (0d1.5)
  schema: numbers.aontu:4:7 (integer)
$ echo $?
1
```

`number` admits one and a half and `9007199254740993`, which `integer`
refused, and refuses the string `"1"`. `integer` refuses one and a
half.

The integers of any size are `number & multiple(1)`, and that's a law
of the definition, not only an example. The tour proves it for every
value:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `number & multiple(1)` admits `9007199254740993`. -/
example : Instance .empty (.meet .number (.multiple (.ofInt 1))) (.int 9007199254740993) :=
  ⟨by decide, .meet .number (.multiple (by decide) (by decide))⟩

/-- `number & multiple(1)` admits exactly the integers, of any size. -/
example (env : Env) (root j : Json) :
    Admits env root (.meet .number (.multiple (.ofInt 1))) j ↔ ∃ n, j = .int n := by
```

The proof reads `multiple(1)` through a fact about the numbers, that
the multiples of one are the integers:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The multiples of one are the integers. -/
theorem Rat.multipleOf_one (x : Rat) : x.multipleOf (.ofInt 1) ↔ ∃ n, x = .ofInt n := by
```

`↔` reads as *exactly when*. Write `whole.aontu`:

<!-- test: scenario whole -->
<!-- test: file whole.aontu -->
```aontu
beyond: number & multiple(1)
half: number & multiple(1)
```

and `whole.json`:

<!-- test: file whole.json -->
```json
{"beyond": 9007199254740993, "half": 1.5}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers whole.aontu whole.json
verdict: invalid

$.half: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.half
  expected: multiple(1)
  actual:   0d1.5
  data: whole.json:1:38 (0d1.5)
  schema: whole.aontu:2:16 (multiple(1))
$ echo $?
1
```

`number & multiple(1)` admits the integer `integer` refused, and
refuses one and a half, which is no integer. The code `constraint`
says the number failed a bound, and step 4 covers the bounds.

### Strings

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-! ## Strings

A string is a Lean `String`: its sequence of characters, the Unicode
scalar values. So a string that holds a lone surrogate, as `"\ud800"`
escapes one, is no value here: both engines accept it, and they differ
on what it is (`test/spec/divergent.tsv`). -/
```

`string` admits every string but the empty one, and `string & empty()`
admits that one too:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | string {s : String} : s ≠ "" → Admits env root .string (.str s)
  | anyString {s : String} : Admits env root .anyString (.str s)
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `string` admits `"a"`. -/
example : Instance .empty .string (.str "a") := ⟨by decide, .string (by decide)⟩

/-- `string` refuses `""`. -/
example : ¬ Instance .empty .string (.str "") := by
  rintro ⟨-, h⟩
  cases h with
  | string h => exact h rfl

/-- `string & empty()` admits `""`. -/
example : Instance .empty .anyString (.str "") := ⟨by decide, .anyString⟩

/-- `string` refuses `3`. -/
example : ¬ Instance .empty .string (.int 3) := fun ⟨_, h⟩ => nomatch h
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
  [aontu/string_empty]: Cannot resolve value at path $.refused
  data: strings.json:1:30 (string&"")
$ echo $?
1
```

The engine calls the refusal `string_empty`, and its `data:` line shows
the meet it formed, `string&""`, which admits nothing.

### Booleans

`boolean` admits both booleans, and nothing else:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | boolean {b : Bool} : Admits env root .boolean (.bool b)
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `boolean` admits `true`. -/
example : Instance .empty .boolean (.bool true) := ⟨by decide, .boolean⟩

/-- `boolean` refuses `1`. -/
example : ¬ Instance .empty .boolean (.int 1) := fun ⟨_, h⟩ => nomatch h
```

Write `booleans.aontu`:

<!-- test: scenario booleans -->
<!-- test: file booleans.aontu -->
```aontu
admitted: boolean
refused: boolean
```

and `booleans.json`:

<!-- test: file booleans.json -->
```json
{"admitted": true, "refused": 1}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers booleans.aontu booleans.json
verdict: invalid

$.refused: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.refused
  data: booleans.json:1:31 (1)
  schema: booleans.aontu:2:10 (boolean)
$ echo $?
1
```

The one finding is at `$.refused`: no value is both the number and a
boolean.

## 3. Literals

A literal is one scalar, and admits that scalar alone:

<!-- test: quote spec/Aontu/Syntax.lean -->
```lean
/-- A scalar literal: one integer, string, boolean, or null. A number
literal here is an integer, a value of the `integer` kind; literals of
the other number kinds, floats and the big numbers, wait for those
kinds. -/
inductive Scalar where
  | int (n : Int)
  | str (s : String)
  | bool (b : Bool)
  | null
```

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- An integer literal is a value of the `integer` kind: it admits the
  integer it is, where the kind holds it. -/
  | int {n : Int} : IntegerLeaf n → Admits env root (.lit (.int n)) (.int n)
  | str {s : String} : Admits env root (.lit (.str s)) (.str s)
  | bool {b : Bool} : Admits env root (.lit (.bool b)) (.bool b)
  | null : Admits env root (.lit .null) .null
```

An integer literal is a value of the `integer` kind, so it admits its
integer where the kind holds it. `null` has no kind of its own: the
literal `null` admits it.

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `3` admits `3`. -/
example : Instance .empty (.lit (.int 3)) (.int 3) := ⟨by decide, .int (by decide)⟩

/-- `3` refuses `4`. -/
example : ¬ Instance .empty (.lit (.int 3)) (.int 4) := fun ⟨_, h⟩ => absurd ((check_iff .lit _).mpr h) (by decide)

/-- `"a"` refuses `"b"`. -/
example : ¬ Instance .empty (.lit (.str "a")) (.str "b") := fun ⟨_, h⟩ => absurd ((check_iff .lit _).mpr h) (by decide)

/-- `true` refuses `false`. -/
example : ¬ Instance .empty (.lit (.bool true)) (.bool false) := fun ⟨_, h⟩ => absurd ((check_iff .lit _).mpr h) (by decide)

/-- `null` admits `null`. -/
example : Instance .empty (.lit .null) .null := ⟨by decide, .null⟩

/-- `null` refuses `false`. -/
example : ¬ Instance .empty (.lit .null) (.bool false) := fun ⟨_, h⟩ => nomatch h
```

The three refusals after the first example borrow the checker of step
14 to compute the answer. Write `literals.aontu`:

<!-- test: scenario literals -->
<!-- test: file literals.aontu -->
```aontu
three: 3
four: 3
same: "a"
other: "a"
yes: true
no: true
admitted: null
refused: null
```

and `literals.json`:

<!-- test: file literals.json -->
```json
{"three": 3, "four": 4, "same": "a", "other": "b", "yes": true, "no": false, "admitted": null, "refused": false}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers literals.aontu literals.json
verdict: invalid

$.four: scalar_value [conflict]
  [aontu/scalar_value]: Cannot unify values at path $.four
  data: literals.json:1:22 (4)
  schema: literals.aontu:2:7 (3)
$.other: scalar_value [conflict]
  [aontu/scalar_value]: Cannot unify values at path $.other
  data: literals.json:1:47 ("b")
  schema: literals.aontu:4:8 ("a")
$.no: scalar_value [conflict]
  [aontu/scalar_value]: Cannot unify values at path $.no
  data: literals.json:1:71 (false)
  schema: literals.aontu:6:5 (true)
$.refused: scalar_kind [conflict]
  [aontu/scalar_kind]: Cannot unify values at path $.refused
  data: literals.json:1:107 (false)
  schema: literals.aontu:8:10 (null)
$ echo $?
1
```

Each literal admits its own value alone. The engine calls another value
of the same kind a `scalar_value` refusal, and a value of another kind,
`false` against `null`, a `scalar_kind` one.

## 4. Bounds

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | min {n x : Rat} : n.le x → Admits env root (.min n) (.num x)
  | max {n x : Rat} : x.le n → Admits env root (.max n) (.num x)
  /-- `multiple(0)` and a negative divisor admit nothing. -/
  | multiple {d x : Rat} : 0 < d.num → x.multipleOf d → Admits env root (.multiple d) (.num x)
```

The bounds compare numbers as rationals:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- `x` is at most `y`. -/
def Rat.le (x y : Rat) : Prop := x.num * y.den ≤ y.num * x.den
```

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- `x` is a whole multiple of `d`, for a positive `d`: one and a half
is a multiple of a half, and every integer is one of one. -/
def Rat.multipleOf (x d : Rat) : Prop := (x.num * d.den) % (d.num * x.den) = 0
```

Multiplying each side by the other's `den` puts the two over one
denominator, so one and a half is three times a half, and `1.25` is no
whole multiple of it. The rule for `multiple` asks for a positive
divisor, so `multiple(0)` admits nothing:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `min(3)` admits `3`. -/
example : Instance .empty (.min (.ofInt 3)) (.int 3) := ⟨by decide, .min (by decide)⟩

/-- `min(3)` refuses `2`. -/
example : ¬ Instance .empty (.min (.ofInt 3)) (.int 2) := by
  rintro ⟨-, h⟩
  cases h with
  | min h => exact absurd h (by decide)

/-- `min(3)` admits three and a half. -/
example : Instance .empty (.min (.ofInt 3)) (.frac 7 2) := ⟨by decide, .min (by decide)⟩

/-- `max(2.5)` admits two and a half. -/
example : Instance .empty (.max (.frac 5 2)) (.frac 5 2) := ⟨by decide, .max (by decide)⟩

/-- `max(2.5)` refuses `2.6`. -/
example : ¬ Instance .empty (.max (.frac 5 2)) (.frac 13 5) := by
  rintro ⟨-, h⟩
  cases h with
  | max h => exact absurd h (by decide)

/-- `multiple(0.5)` admits one and a half. -/
example : Instance .empty (.multiple (.frac 1 2)) (.frac 3 2) :=
  ⟨by decide, .multiple (by decide) (by decide)⟩

/-- `multiple(0.5)` refuses `1.25`. -/
example : ¬ Instance .empty (.multiple (.frac 1 2)) (.frac 5 4) := by
  rintro ⟨-, h⟩
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
  [aontu/invalid-arg]: Cannot constrain value at path $.zero
  schema: bounds.aontu:8:7 (constraint())
$.refused: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.refused
  expected: min(3)
  actual:   2
  data: bounds.json:1:28 (2)
  schema: bounds.aontu:2:10 (min(3))
$.above: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.above
  expected: max(2.5)
  actual:   0d2.6
  data: bounds.json:1:73 (0d2.6)
  schema: bounds.aontu:5:8 (max(2.5))
$.quarter: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.quarter
  expected: multiple(0.5)
  actual:   0d1.25
  data: bounds.json:1:102 (0d1.25)
  schema: bounds.aontu:7:10 (multiple(0.5))
$ echo $?
1
```

`min(3)` admits `3` itself, and three and a half. Each failed bound is
a `constraint` finding that names the bound. The engine reports
`multiple(0)` as an argument it can't use, where the definition, which
has no ill-formed terms, has a term that admits nothing.

## 5. The two ends: `any` and `nil`

`any` admits every value, by its one rule, and `nil` has no rule, so it
admits none. They're the [top](unification.md) and the
[bottom](unification.md) of the [lattice](unification.md):

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | any {j : Json} : Admits env root .any j
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `any` admits `null`. -/
example : Instance .empty .any .null := ⟨by decide, .any⟩

/-- `any` admits `[1, "a"]`. -/
example : Instance .empty .any (.arr [.int 1, .str "a"]) := ⟨by decide, .any⟩

/-- `nil` refuses `null`, and everything else. -/
example : ¬ Instance .empty .nil .null := fun ⟨_, h⟩ => nomatch h
```

Write `ends.aontu`:

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

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers ends.aontu ends.json
verdict: invalid

$.refused: literal_nil [conflict]
  [aontu/literal_nil]: Cannot unify values at path $.refused
  data: ends.json:1:50 (null)
  schema: ends.aontu:3:10 (nil)
$ echo $?
1
```

The only finding is at `$.refused`, so `any` admitted its `null` and its
array.

## 6. Arrays and objects

The type of JSON values goes on past the scalars to the two
containers:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- A JSON value: a scalar, an array of values, or an object. An object
is the set of its members: Lean lists them, the order of the list is no
part of the value, and a value gives each name once
(`Json.WellFormed`). -/
inductive Json where
  | num (x : Rat)
  | str (s : String)
  | bool (b : Bool)
  | null
  | arr (xs : List Json)
  | obj (fs : List (String × Json))
```

An array is a list of values, and an object is the set of its members,
each a name and the value it gives that name: `List (String × Json)`
reads as a list of pairs of a string and a JSON value. A list can give
one name twice, which no object does. So the definition says which
Lean `Json` is a JSON value:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- A Lean `Json` is a JSON value when each of its objects gives each
name once. -/
inductive Json.WellFormed : Json → Prop
  | num {x : Rat} : WellFormed (.num x)
  | str {s : String} : WellFormed (.str s)
  | bool {b : Bool} : WellFormed (.bool b)
  | null : WellFormed .null
  | arr {xs : List Json} : (∀ x, x ∈ xs → WellFormed x) → WellFormed (.arr xs)
  | obj {fs : List (String × Json)} :
      (fs.map Prod.fst).Nodup → (∀ k x, (k, x) ∈ fs → WellFormed x) → WellFormed (.obj fs)
```

`Nodup` says no name appears twice, `∀ x, x ∈ xs → …` reads "every `x`
in `xs` is …", and `decide` checks the whole by computing:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{"a": 1}` is a JSON value. -/
example : Json.WellFormed (.obj [("a", .int 1)]) := by decide

/-- A Lean `Json` that gives `a` twice is no JSON value. -/
example : ¬ Json.WellFormed (.obj [("a", .int 1), ("a", .int 2)]) := by decide

/-- …so it is no instance of anything, `any` included. -/
example : ¬ Instance .empty .any (.obj [("a", .int 1), ("a", .int 2)]) :=
  fun ⟨hw, _⟩ => absurd hw (by decide)
```

The order of an object's list is no part of the value. Step 9 compares
two objects that list one set of members in two orders.

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
member of" in the premises, and `lookup` as the value an object gives
the name `k`:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The value an object gives the name `k`. -/
def lookup (k : String) : List (String × Json) → Option Json
  | [] => none
  | (k', v) :: fs => if k = k' then some v else lookup k fs
```

A map holds its keys as triples: the name, whether the key is optional,
and its term. The first premise holds a present key to its term, and the
second lets a key be absent only where every declaration makes it
optional. The last two are the spread and the seal, which follow below.

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x: integer}` admits `{"x": 1}`. -/
example : Instance .empty (.map [("x", false, .integer)] none false) (.obj [("x", .int 1)]) := by
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x: integer}` refuses `{}`: the key is required. -/
example : ¬ Instance .empty (.map [("x", false, .integer)] none false) (.obj []) := by
  rintro ⟨-, h⟩
  cases h with
  | map _ ha _ _ => exact absurd (ha "x" false .integer (List.mem_singleton.mpr rfl) rfl) (by decide)
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x?: integer}` admits `{}`. -/
example : Instance .empty (.map [("x", true, .integer)] none false) (.obj []) :=
  ⟨by decide, .map (fun _ _ _ _ _ hx => nomatch hx)
    (fun _ _ _ hm _ => by cases List.mem_singleton.mp hm; rfl)
    (fun _ h => nomatch h) (fun h => nomatch h)⟩

/-- `{x?: integer}` refuses `{"x": "a"}`. -/
example : ¬ Instance .empty (.map [("x", true, .integer)] none false) (.obj [("x", .str "a")]) := by
  rintro ⟨-, h⟩
  cases h with
  | map hp _ _ _ => nomatch hp "x" true .integer (.str "a") (List.mem_singleton.mpr rfl) rfl

/-- `{x?: integer}` refuses `[]`: an array is not a map. -/
example : ¬ Instance .empty (.map [("x", true, .integer)] none false) (.arr []) :=
  fun ⟨_, h⟩ => nomatch h
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
  [aontu/mapval_no_gen]: Cannot resolve value at path $.refused.x
  schema: keys.aontu:2:13 (integer)
$.wrong.x: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.wrong.x
  data: keys.json:1:70 ("a")
  schema: keys.aontu:4:12 (integer)
$.array: map [conflict]
  [aontu/map]: Cannot unify values at path $.array
  data: keys.json:1:85 ([])
  schema: keys.aontu:5:8 ({"x"?:integer})
$ echo $?
1
```

The refusals are of two classes. At `$.refused.x` nothing contradicts
the schema, but a required key is missing, so the class is
`incomplete`. At `$.wrong.x`, `"a"` can never be an integer, and
`$.array` holds an array, which is no map at all, so both are
`conflict`. The definition says only that the term refuses each, and
the class is the engine's.

### Spreads and seals

The third premise is the spread, which holds every member, declared or
not:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{&: integer}` admits `{"a": 1, "b": 2}`: the spread holds every member. -/
example : Instance .empty (.map [] (some .integer) false) (.obj [("a", .int 1), ("b", .int 2)]) := by
  refine ⟨by decide, ?_⟩
  refine .map (fun _ _ _ _ h => nomatch h) (fun _ _ _ h => nomatch h) ?_ (fun h => nomatch h)
  intro s hs k x hm
  cases hs
  simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
  rcases hm with ⟨-, rfl⟩ | ⟨-, rfl⟩ <;> exact .integer (by decide)

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
  [aontu/scalar-type]: Cannot unify values at path $.refused.a
  schema: spreads.aontu:2:25 (string)
  schema: spreads.aontu:2:14 (integer)
$ echo $?
4
```

The spread meets the declared `a` as well, and `integer & string`
admits nothing. The engine answers `error`: the schema contradicts
itself at `a`, whatever the data, and the two `schema:` lines point at
the two terms that clash.

The fourth premise is the seal. A sealed map holds no key it doesn't
declare, and leaves an absent optional key alone:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `close({a: integer})` refuses `{"a": 1, "b": 2}`: `b` is not declared. -/
example : ¬ Instance .empty (.map [("a", false, .integer)] none true)
    (.obj [("a", .int 1), ("b", .int 2)]) := by
  rintro ⟨-, h⟩
  cases h with
  | map _ _ _ hc =>
    obtain ⟨o, v, hm⟩ := hc rfl "b" (.int 2) (by simp)
    simp at hm

/-- `close({a?: integer})` admits `{}`. -/
example : Instance .empty (.map [("a", true, .integer)] none true) (.obj []) :=
  ⟨by decide, .map (fun _ _ _ _ _ hx => nomatch hx)
    (fun _ _ _ hm _ => by cases List.mem_singleton.mp hm; rfl)
    (fun _ h => nomatch h) (fun _ _ _ h => nomatch h)⟩
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
  [aontu/closed]: Cannot resolve value at path $.refused.b
  data: closed.json:1:43 (2)
$ echo $?
1
```

`close()` seals the map it wraps and every map beneath it, and the
definition holds each map's seal in its own `closed` flag.

### Lists

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- A list: each of its positions is present and holds its value;
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
  refine ⟨by decide, ?_⟩
  refine .list (by decide) ?_ (fun _ h => nomatch h)
  intro i v x hv hx
  rcases i with _ | _ | i
  · cases hv; cases hx; exact .integer (by decide)
  · cases hv; cases hx; exact .string (by decide)
  · simp at hv

/-- `[integer, string]` refuses `[1]`: its second position is missing. -/
example : ¬ Instance .empty (.list [.integer, .string] none) (.arr [.int 1]) := by
  rintro ⟨-, h⟩
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
  [aontu/listval_no_gen]: Cannot resolve value at path $.refused.1
  schema: lists.aontu:2:19 (string)
$.spread.1: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.spread.1
  data: lists.json:1:60 ("a")
  schema: lists.aontu:3:13 (integer)
$ echo $?
1
```

The list stays open, so it admits `true`, past its two positions.
The missing second element is `incomplete`, the class of a missing
required key.

## 7. Conjunction

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | meet {a b : Val} {j : Json} :
      Admits env root a j → Admits env root b j → Admits env root (.meet a b) j
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `integer & min(3)` admits `7`. -/
example : Instance .empty (.meet .integer (.min (.ofInt 3))) (.int 7) :=
  ⟨by decide, .meet (.integer (by decide)) (.min (by decide))⟩

/-- `integer & min(3)` refuses `2`. -/
example : ¬ Instance .empty (.meet .integer (.min (.ofInt 3))) (.int 2) := by
  rintro ⟨-, h⟩
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
  [aontu/constraint]: Cannot unify values at path $.refused
  expected: integer&min(3)
  actual:   2
  data: meet.json:1:28 (2)
  schema: meet.aontu:2:20 (integer&min(3))
$ echo $?
1
```

`2` fails `min(3)`, though `integer` alone admits it.

## 8. Aliases, and recursion

An alias names a term the document declares:

<!-- test: quote spec/Aontu/Syntax.lean -->
```lean
/-- The alias declarations of a document: `%T = v` is `env "T" = some v`. -/
abbrev Env := String → Option Val

/-- The declarations of a document that declares no alias. -/
def Env.empty : Env := fun _ => none
```

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- An alias admits what its declaration admits; an undeclared one
  admits nothing. -/
  | alias {n : String} {v : Val} {j : Json} :
      env n = some v → Admits env root v j → Admits env root (.alias n) j
```

An alias admits what its term admits, and that's the whole of
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
value is finite, so the derivation stops where the data stops. Write
`tree.aontu`:

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
  [aontu/no_scalar_unify]: Cannot unify values at path $.refused.v
  data: tree.json:1:48 ("x")
  schema: tree.aontu:1:17 (integer)
$ echo $?
1
```

An alias the document doesn't declare has no term, so no rule
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
  [aontu/no_path]: Cannot resolve value at path $.x
  schema: undeclared.aontu:1:4 (%U)
$ echo $?
4
```

The engine can't resolve `%U`, so it answers `error`, a schema it
can't use, and the definition admits nothing at `x`.

## 9. Path references

A path names a part of a value, step by step:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- A step of a path: a member's name, or a position in an array. -/
inductive Seg where
  | key (k : String)
  | idx (i : Nat)
```

`Json.at`, beside it in the file, follows the steps down a value. A
path term admits what the whole value holds at its path:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- A path admits what the whole value holds at the path: the same
  value, compared as values. -/
  | path {p : List Seg} {j' j : Json} :
      root.at p = some j' → j'.Same j → Admits env root (.path p) j
```

The rule compares the two as values:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- `j` and `j'` are one value: the same scalar, arrays alike element by
element, and objects with the same members, in whatever order Lean
lists them. -/
inductive Json.Same : Json → Json → Prop
  | num {x : Rat} : Same (.num x) (.num x)
  | str {s : String} : Same (.str s) (.str s)
  | bool {b : Bool} : Same (.bool b) (.bool b)
  | null : Same .null .null
  | arr {xs ys : List Json} :
      xs.length = ys.length →
      (∀ (i : Nat) (x y : Json), xs[i]? = some x → ys[i]? = some y → Same x y) →
      Same (.arr xs) (.arr ys)
  | obj {fs gs : List (String × Json)} :
      (∀ k, (lookup k fs).isSome = (lookup k gs).isSome) →
      (∀ k x y, lookup k fs = some x → lookup k gs = some y → Same x y) →
      Same (.obj fs) (.obj gs)
```

`Same` is a relation of its own, with a rule for each kind of value.
A scalar is the same as itself, and two objects are the same when they
give each name the same value, whatever order their lists take:

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
/-- `{x: $.y, y: any}` admits `{"x": {"a": 1, "b": 2}, "y": {"b": 2, "a": 1}}`:
the two objects have the same members, so they are one value. -/
example : Instance .empty (refDoc .any)
    (.obj [("x", .obj [("a", .int 1), ("b", .int 2)]), ("y", .obj [("b", .int 2), ("a", .int 1)])]) := by
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
  [aontu/scalar_value]: Cannot unify values at path $.x
  data: different.json:1:15 (2)
  data: different.json:1:7 (1)
$ echo $?
1
```

The finding at `$.x` points at both numbers in the data: the `2` the
path names and the `1` at `x`. Then write `members.aontu`:

<!-- test: scenario members -->
<!-- test: file members.aontu -->
```aontu
x: $.y
y: any
```

and `members.json`:

<!-- test: file members.json -->
```json
{"x": {"a": 1, "b": 2}, "y": {"b": 2, "a": 1}}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet --no-fill --exact-numbers members.aontu members.json
verdict: valid
```

## 10. The order, and the meet

`spec/Aontu/Order.lean` orders terms by what they admit:

<!-- test: quote spec/Aontu/Order.lean -->
```lean
/-- Every JSON value `a` admits, `b` admits, each taken whole. -/
def Le (env : Env) (a b : Val) : Prop := ∀ j, Instance env a j → Instance env b j

notation:50 a:51 " ⊑[" env "] " b:51 => Le env a b
```

`∀ j` reads as *for every value `j`* and `→` as *implies*, so
`a ⊑[env] b` says every instance of `a` is an instance of `b`. Three
theorems make `&` the [meet](unification.md) of that order, its
greatest lower bound:

<!-- test: quote spec/Aontu/Order.lean -->
```lean
theorem meet_le_left (env : Env) (a b : Val) : .meet a b ⊑[env] a := by
  intro _ ⟨hw, h⟩; cases h with | meet h _ => exact ⟨hw, h⟩

theorem meet_le_right (env : Env) (a b : Val) : .meet a b ⊑[env] b := by
  intro _ ⟨hw, h⟩; cases h with | meet _ h => exact ⟨hw, h⟩

theorem le_meet {env : Env} {a b c : Val} (ha : c ⊑[env] a) (hb : c ⊑[env] b) :
    c ⊑[env] .meet a b :=
  fun j h => ⟨h.1, .meet (ha j h).2 (hb j h).2⟩
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
  cases (h (.int 2) ⟨by decide, .integer (by decide)⟩).2 with
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
  the general residual constrains a domain the specific value is not in
  expected: integer&min(3)
  actual:   integer
  general: narrow.aontu:1:14 (integer&min(3))
  specific: wide.aontu:1:4 (integer)
$ echo $?
1
```

`compat_narrowed` is the engine's way of saying what the second example
proves: `integer` admits a value, such as `2`, that `integer & min(3)`
refuses.

## 11. Two declarations of one key

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

The merged key is optional only where both declarations say so
(`o₁ && o₂`), and its term is the meet of the two.

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
  [aontu/mapval_no_gen]: Cannot resolve value at path $.refused.x
  schema: merge.aontu:2:15 (integer)
$ echo $?
3
```

One side makes `x` optional and the other makes it required, so the
merged key must be present, and `{}` lacks it.

## 12. Where the definition and the engines differ

Both engines' test suites run rows the definition generates, as step
14 shows, and on a few of them the engines don't answer as the
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
  fun ⟨_, h⟩ => no_meet_with_string_admits_empty _ _ _ h
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
which a greatest lower bound can't do. For this kind, the ledger names
the engines as the side that changes.

In others, two optional declarations of one key can't both hold:

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

$.v.x: scalar-type [conflict]
  [aontu/scalar-type]: Cannot unify values at path $.v.x
  schema: contradiction.aontu:1:25 (integer)
  schema: contradiction.aontu:1:9 (string)
$ echo $?
4
```

The definition reads a key that nothing can satisfy as a key that must
be absent, and so admits `{}`. Both engines answer `error`, a schema
they can't use. For this kind the ledger names the definition as
the side that changes, since it has no ill-formed terms, which is what
`error` reports.

## 13. Trial schemas

`nof` and `when` ask whether a schema refuses a value, and a rule
can't depend on the negation of the relation it defines. Lean refuses
such a definition, since it might have no meaning, so
`spec/Aontu/Trial.lean` defines trials in a layer over `Admits`:

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
  [aontu/nof]: Cannot unify values at path $.refused
  expected: nof(1,integer,min(0))
  actual:   3
  data: nof.json:1:29 (3)
  schema: nof.aontu:2:10 (nof(1,integer,min(0)))
$ echo $?
1
```

`-1` is an integer below zero, so one trial passes. `3` passes both.
`when(c, t, e)` holds a value to `t` where `c` admits it, and to `e`
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
  [aontu/when]: Cannot unify values at path $.refused
  expected: when(string,"a",min(0))
  actual:   "b"
  data: when.json:1:28 ("b")
  schema: when.aontu:2:10 (when(string,"a",min(0)))
$ echo $?
1
```

## 14. A checker, admitted by a proof

`Admits` is a statement, so Lean can't run it. Running needs an
algorithm, and `spec/Aontu/Check.lean` holds one, for every term that
reads neither an alias nor a path:

<!-- test: quote spec/Aontu/Check.lean -->
```lean
/-- The values that read neither an alias nor a path, so that what they
admit depends on no declaration and no root. -/
inductive Val.RefFree : Val → Prop
  | integer : RefFree .integer
  | number : RefFree .number
  | string : RefFree .string
  | anyString : RefFree .anyString
  | boolean : RefFree .boolean
  | lit {s : Scalar} : RefFree (.lit s)
  | min {n : Rat} : RefFree (.min n)
  | max {n : Rat} : RefFree (.max n)
  | multiple {d : Rat} : RefFree (.multiple d)
  | any : RefFree .any
  | nil : RefFree .nil
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
  | .integer, j => match j with
    | .num x => decide (x.den = 1) && decide (IntegerLeaf x.num)
    | _ => false
  | .number, j => match j with
    | .num _ => true
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
builds every term of the fragment up to one `&`, and two sets of values
to try each against:

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

/-- The instances of the first 9,600 rows. -/
def jsons : List Json :=
  scalars ++ [.obj []] ++ scalars.map (fun j => .obj [("x", j)]) ++ [.obj [("y", .int 1)]]

/-- The instances of the rows after them, numbered on so that no earlier
row is renamed: two fractions, one either side of three, a whole number
no double holds, and an array, each also under a key. -/
def more : List Json :=
  let xs : List Json := [.frac 3 2, .frac 7 2, .int 9007199254740993, .arr [.int 1]]
  xs ++ xs.map (fun j => .obj [("x", j)])

def instances : List Json := jsons ++ more
```

The oracle numbers the second set's rows after the first's, so adding
it renamed no row. The file proves that every term it builds reads no
reference, and every instance is a JSON value, so each answer is the
definition's:

<!-- test: quote spec/Oracle.lean -->
```lean
/-- Every row's verdict is the definition's: `v` admits `j`, taken
whole, under no alias declaration. -/
theorem verdict_exact {v : Val} (hv : v ∈ vals) {j : Json} (hj : j ∈ instances) :
    check v j = true ↔ Instance Env.empty v j :=
  ⟨fun h => ⟨instances_wellFormed j hj, (check_iff (vals_refFree v hv) j).mp h⟩,
    fun h => (check_iff (vals_refFree v hv) j).mpr h.2⟩
```

It writes one row for each term and value, 14,400 in all, and both
engines' test suites run every row. Two of them, from
[`test/spec/def-fragment.tsv`](../test/spec/def-fragment.tsv):

<!-- test: quote test/spec/def-fragment.tsv -->
```tsv
c69	verdict	v: string	v: ""	{"opts":{"noFill":true,"exactNumbers":true},"verdict":["invalid","incomplete","error"]}
c70	verdict	v: string	v: "a"	{"opts":{"noFill":true,"exactNumbers":true},"verdict":"valid"}
```

A row holds a schema, a value, the two `vet` modes and the verdict
`check` gives. The oracle writes a refusal as the three verdicts it
may be, since the definition answers admit or refuse and no more. The
second set's whole number outside the integer leaf is the first value
to tell `integer` from `number & multiple(1)`:

<!-- test: quote test/spec/def-fragment.tsv -->
```tsv
c9618	verdict	v: integer	v: 9007199254740993	{"opts":{"noFill":true,"exactNumbers":true},"verdict":["invalid","incomplete","error"]}
```

<!-- test: quote test/spec/def-fragment.tsv -->
```tsv
c9626	verdict	v: (number) & (multiple(1))	v: 9007199254740993	{"opts":{"noFill":true,"exactNumbers":true},"verdict":"valid"}
```

The schema and the value are text, which `spec/Oracle/Print.lean`
writes. The printer is the oracle's and no part of the definition, and
no proof checks it: that an engine reads `v: 9007199254740993` as that
number is a claim about the engine's reader, which these rows test.

## 15. What any `subsume` must answer

`⊑` quantifies over every value, of which there are infinitely many,
so no program computes it in general. The definition states instead
what an answer from `subsume` must respect:

<!-- test: quote spec/Aontu/Order.lean -->
```lean
/-- The answers `aontu subsume` gives about two documents that stand. -/
inductive Subsumption where
  | subsumes
  | doesNotSubsume
  | undecided

/-- The contract on an implementation: `subsumes` only where the order
holds, `doesNotSubsume` only where it fails, and `undecided` anywhere.
`Le` quantifies over every JSON value, infinitely many, so the contract
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
so `{x?: any}` isn't below `{x: any}`. Write `required.aontu`:

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
  expected: any
  actual:   any
  general: required.aontu:1:7 (any)
  specific: optional.aontu:1:8 (any)
$ echo $?
1
$ aontu subsume optional.aontu required.aontu
verdict: subsumes
```

The engine answers `does_not_subsume` where `subsumeWrong` answered
`subsumes`, and its finding gives the same reason: `{x?: any}` admits
instances without the key.

## 16. What the definition doesn't say yet

The definition covers what this page walked through, and has no rule
for the rest of the language, so it says nothing about it. The
[language reference](reference-language.md) states the rest: the
numeric kinds beyond `integer` and their literals, what the data means
without `--exact-numbers`, the bounds beyond `min`, `max` and
`multiple`, most built-in functions, generation with
`each`, `pack` and `emit`, formats, and marks such as `hide()` and
`type()`. [`aontu vet`](reference-api.md#aontu-vet) states which
refusal is `invalid`, `incomplete` or `error`, and the shared test
suite in [`test/spec/`](../test/spec/) holds both engines to them.

Nor does the definition say anything about text. The
[grammar](../grammar/aontu.abnf) says how to parse an aontu file, and
each engine how it reads a JSON file: its numbers, its escapes, and a
name it repeats. The shared test suite holds both readers to one
answer.

Nor does it name JSON Schema, which isn't a concept of the language.
The language needs only the power to represent a JSON Schema: what
`aontu jsonschema import` writes is aontu terms, such as
`number & multiple(1)`, and the definition says what those mean.

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
  [aontu/empty]: Cannot unify values at path $.arm
  data: position.json:1:21 ([1,2])
  schema: position.aontu:2:6 ([integer]|[string])
$ echo $?
1
```

A preference alone is a default its type can override, so `*1` admits
`2`, as the [reference](reference-language.md#preference--default-)
says. A list in a disjunction admits only its own length, so the arm
`[integer]` refuses `[1, 2]`, which the same list admits at `$.list`.

Next, read [unification](unification.md), which explains in prose the
operation these rules define.
