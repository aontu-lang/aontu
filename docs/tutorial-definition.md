# Tutorial: read the formal definition

The [language reference](reference-language.md) describes aontu in
prose. Part of the language is also defined in
[Lean 4](https://lean-lang.org/), in the repository's
[`spec/`](../spec/) directory, as statements a proof checker verifies,
and the test suites hold both engines to that definition.

The definition says what aontu values mean: which data each one admits.
It says nothing about text: how to parse an aontu file is the grammar's
business, and how to read a JSON file is each engine's. This page reads
the definition one part at a time, starting from the scalars. Each rule
comes with Lean examples of values it admits and refuses, which the
definition's build proves, and with a transcript of the engine giving
the admitted values back. You need no Lean beforehand, because each
step says what its notation means where it first appears. The page
assumes the [first tutorial](tutorial-config.md).

## 1. Set up

The definition is eight Lean modules, which make one definition: every
module reads the same data, the same terms, and the same rule for what
a term admits, and none declares its own.

| File | Holds |
|---|---|
| [`spec/Aontu/Data.lean`](../spec/Aontu/Data.lean) | the data, scalars first: numbers in the four leaves, integers, floats, big integers, and big decimals, then strings, then maps and lists, and paths into a value |
| [`spec/Aontu/Syntax.lean`](../spec/Aontu/Syntax.lean) | the terms of the language, one constructor for each construct, and `super`, the parent type of a term |
| [`spec/Aontu/Admits.lean`](../spec/Aontu/Admits.lean) | what each term admits, one rule for each form |
| [`spec/Aontu/Order.lean`](../spec/Aontu/Order.lean) | the order between terms, the meet, the strict bounds under their closed ones, two declarations of one key, and the contract any `subsume` must meet |
| [`spec/Aontu/Subsume.lean`](../spec/Aontu/Subsume.lean) | the profiles of `subsume`, one contract each, and the reference's table of rules as theorems |
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

The transcripts run `aontu` on a small aontu file. aontu evaluates a
document by unifying it and prints the result, and `-c` prints it in
aontu's own form, which keeps each number's leaf, `0d1.5` apart from
`1.5`, and shows what's still open. Without `-c` the output is JSON. A
term admits a value exactly when the term met with the value gives the
value back, so each step meets its terms with values they admit, and
the output shows the values. Where a refusal is the point of a step,
the step runs [`aontu vet`](reference-api.md#aontu-vet), which checks
data against a schema and names each key it refuses, why, and where.
Its exit code says which kind of refusal it was: `1` for `invalid`, `3`
for `incomplete`, `4` for `error`.

## 2. Scalars

The data an aontu value admits is a scalar, a map, or a list, and the
scalars come first, here as in the definition. `spec/Aontu/Data.lean`
lists them first among the ways to build the data:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
inductive Data where
  | num (x : Number)
  | str (s : String)
  | bool (b : Bool)
  | null
```

`inductive` lists every way to build a value of a new type, one
constructor per line. A number holds a `Number`, a string a `String`,
and a boolean a `Bool`, and `null` holds nothing. The same type goes
on to maps and lists, which step 6 takes up.

The terms that admit the scalars come first in
`spec/Aontu/Syntax.lean` too, one constructor for each construct,
beside the name the reference gives it:

<!-- test: quote spec/Aontu/Syntax.lean -->
```lean
inductive Val where
  | integer                                 -- `integer`
  | float                                   -- `float`
  | biginteger                              -- `biginteger`
  | bigdecimal                              -- `bigdecimal`
  | number                                  -- `number`, every number of the four leaves
  | string                                  -- `string`, every string but `""`
  | anyString                               -- `string & empty()`, every string
  | boolean                                 -- `boolean`
```

These eight are the kinds of the scalars. Literals, bounds, and the
rest of the terms come with their rules in later steps.

What a term admits, and what it refuses, is one relation, in
`spec/Aontu/Admits.lean`, with one rule for each form and each answer.
Its first line:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
inductive Judge (env : Env) (root : Data) : Bool → Val → Data → Prop
```

`Judge env root b v j` says the trial of the term `v` on the data `j`
comes out `b`, with the aliases `env` declares: `true` where `j` is an
instance of `v`, `false` where `v` rules it out. `root` is the whole
value `j` is found inside, which no rule reads, since a path reads by
declaration, as step 9 shows. The result type `Prop` is a statement,
true or false, that Lean establishes by proof and never by running
anything. Each constructor is a rule of inference: when its premises
hold, its conclusion, after the last `→`, holds. A term admits a value
when a finite tree of these rules proves the trial comes out `true`,
and refuses it when one proves it comes out `false`. The two answers
have their own names:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
/-- `j` is an instance of `v`: the trial comes out `true`. -/
abbrev Admits (env : Env) (root : Data) : Val → Data → Prop := Judge env root true

/-- `v` rules `j` out: the trial comes out `false`. -/
abbrev Refuses (env : Env) (root : Data) : Val → Data → Prop := Judge env root false
```

The two answers are one relation so that a rule can read a refusal
where it needs one: a trial schema, in step 16, counts the branches
that refuse a value as well as those that admit it, which a rule of
admission alone could not say, since Lean refuses a rule that mentions
its own negation. Refusal is the complement of admission, rule for
rule, and one theorem says a term never gives both answers to one
value:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
/-- A value judges a datum one way at most: no value both admits and
refuses it. A judgement that holds is therefore the judgement. -/
theorem judge_unique {env : Env} {root : Data} {b : Bool} {v : Val} {j : Data}
    (h : Judge env root b v j) : ∀ {b' : Bool}, Judge env root b' v j → b = b' := by
```

The examples ask about a whole value, which is its own root:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
/-- `j` is an instance of `v` under the declarations `env`: `j` is a
value, taken whole, so that it is its own root. This is the question
`aontu vet` answers. A Lean `Data` that is no value, a map that gives
one key twice, is no instance of anything, so it is never a witness. -/
abbrev Instance (env : Env) (v : Val) (j : Data) : Prop := j.WellFormed ∧ Admits env j v j
```

Read `∧` as "and": an instance is a pair, `j` being a value and `v`
admitting it. A Lean `Data` that gives one map key twice is no value,
which step 6 covers.

### Numbers, in four leaves

A number is in one of the four leaves the language has, and each leaf
holds a number as the language has it:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- A number, in one of the language's four leaves. The leaves are
disjoint: two numbers of two leaves are two values, however equal they
look, so `1`, `1.0`, `0d1`, and `0d1.0` are four. -/
inductive Number where
  | integer (x : Integer)
  | float (x : Float)
  | biginteger (x : BigInteger)
  | bigdecimal (x : BigDecimal)
```

Each leaf has its own type, named as aontu names it, and each type
holds exactly the numbers of its leaf: an `Integer` is a whole number
of one range, a `Float` a double, a `BigInteger` any whole number, and
a `BigDecimal` an exact decimal. Under them, `ℤ` is the integers of
mathematics and `ℕ` the natural numbers, Lean's `Int` and `Nat` under
the names mathematics gives them. The leaves are disjoint, so the
integer `1` and the big integer `0d1` are two values, which no rule
makes one: each kind admits its own leaf, and each literal its own
number.

### Integers

The `integer` leaf holds the integers of one range:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The whole numbers the `integer` leaf holds: the values a double holds
exactly, `m · 2 ^ e` with `m < 2 ^ 53`, whose magnitude is below
`2 ^ 63`. So `2 ^ 53 + 2` and `10 ^ 18` are in it, and `2 ^ 53 + 1`
(no double), `2 ^ 63` and `-2 ^ 63` (outside the window) are not. -/
def IntegerLeaf (n : ℤ) : Prop :=
  (∃ m e : ℕ, n.natAbs = m * 2 ^ e ∧ m < 2 ^ 53) ∧ n.natAbs < 2 ^ 63
```

`∃ m e : ℕ` reads "there are natural numbers `m` and `e` such that",
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
answer, and `¬` reads *not*. The rules for `integer` admit every number
of the leaf, and refuse every other value:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | integer {x : Integer} : Judge env root true .integer (.num (.integer x))
  | integerNot {j : Data} : (∀ x : Integer, j ≠ .num (.integer x)) → Judge env root false .integer j
```

An argument in braces, such as `{x : Integer}`, is one Lean works out
for itself. The range is the type's to keep: an `Integer` is a whole
number with the proof that the leaf holds it, so no `Integer` lies
outside the leaf. `Integer.of n` builds one, and `decide` finds the
proof:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- An `integer`: a whole number the `integer` leaf holds, which a
double holds exactly and whose magnitude is below `2 ^ 63`. -/
structure Integer where
  value : ℤ
  leaf : IntegerLeaf value
  deriving DecidableEq

/-- The integer `n`, for an `n` the leaf holds: `Integer.of 3` is three. -/
def Integer.of (n : ℤ) (h : IntegerLeaf n := by decide) : Integer := ⟨n, h⟩
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `integer` admits `3`. -/
example : Instance .empty .integer (.integer 3) := ⟨by decide, .integer⟩

/-- `integer` admits `9007199254740994`, which a double holds. -/
example : Instance .empty .integer (.integer 9007199254740994) := ⟨by decide, .integer⟩

/-- No `Integer` is `9007199254740993`: the leaf does not hold it, so
the type has no such value. -/
example : ¬ ∃ x : Integer, x.value = 9007199254740993 := fun ⟨⟨_, h⟩, rfl⟩ => absurd h (by decide)

/-- `integer` refuses the string `"3"`. -/
example : ¬ Instance .empty .integer (.str "3") := fun ⟨_, h⟩ => nomatch h
```

`Instance .empty .integer (.integer 3)` claims that `integer` admits
`3` under no alias declaration, where `.integer 3` builds the data
three through `Data.integer`. Its proof is a pair: `by decide` shows
that `3` is a value, and `.integer` names the rule. A refusal takes
the supposed proof apart: `fun ⟨_, h⟩ => nomatch h` finds no rule that
could have given its second half. Taking an `Integer` apart gives its
proof, which is how the third example shows that none is `2 ^ 53 + 1`.

Meet `integer` with two integers of the leaf, and `float` with a whole
number outside it. Write `integers.aontu`:

<!-- test: scenario integers -->
<!-- test: file integers.aontu -->
```aontu
three: integer & 3
double: integer & 9007199254740994
window: float & 9223372036854775808
```

and run it:

<!-- test: run -->
```sh
$ aontu -c integers.aontu
{"double":9007199254740994,"three":3,"window":9223372036854776000.0}
```

Each meet gives its value back. `9223372036854775808` is `2 ^ 63`, just
outside the window, so aontu reads it as a float, which `-c` writes
with a point. A whole number no double holds, such as
`9007199254740993`, is no float either, and aontu won't round it:
written plainly it's refused, and the big integers below write it
exactly.

### Floats

A float is a double, held as the three fields of its binary64 format.
The type is aontu's `Float`, not Lean's own, whose operations no proof
can compute with:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- A float: a binary64 double, held as its three fields: the sign, the
11-bit biased exponent, and the 52 bits of the fraction. The exponent
`2047` would make an infinity or a NaN, and the sign alone a negative
zero, which aontu takes as zero. -/
structure Float where
  neg : Bool
  exp : ℕ
  frac : ℕ
  exp_lt : exp < 2047
  frac_lt : frac < 2 ^ 52
  no_neg_zero : neg = true → exp ≠ 0 ∨ frac ≠ 0
```

`structure` declares a record with named fields. `neg`, `exp`, and
`frac` are the double's sign bit, its 11-bit exponent, and its 52-bit
fraction, and the last three fields are proofs that keep out what
aontu holds no value for. A float's value is a whole number, `man`,
times a power of two, `2 ^ pow`:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The significand: the fraction with its leading one, which a
subnormal, of exponent `0`, lacks. -/
def Float.man (x : Float) : ℕ := if x.exp = 0 then x.frac else 2 ^ 52 + x.frac

/-- The power of two the significand is scaled by: a float is
`± man * 2 ^ pow`. -/
def Float.pow (x : Float) : ℤ := if x.exp = 0 then -1074 else (x.exp : ℤ) - 1075
```

`Float.dyadic m e` builds the double `m * 2 ^ e`:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The float `m * 2 ^ e`, for a positive `m` the double holds exactly:
`Float.dyadic 3 (-1)` is one and a half, the double `1.5`. -/
def Float.dyadic (m : ℕ) (e : ℤ)
    (h₁ : (Float.fieldsOf m e).1 < 2047 := by decide)
    (h₂ : (Float.fieldsOf m e).2 < 2 ^ 52 := by decide) : Float :=
```

`float` admits every float, and refuses the rest:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | float {x : Float} : Judge env root true .float (.num (.float x))
  | floatNot {j : Data} : (∀ x : Float, j ≠ .num (.float x)) → Judge env root false .float j
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- The double `1.5` is `3 * 2 ^ -1`: the sign clear, the exponent
`1023`, and the top bit of the fraction set. -/
example : Float.dyadic 3 (-1) = ⟨false, 1023, 2 ^ 51, by decide, by decide, fun h => nomatch h⟩ :=
  rfl

/-- `float` admits the float `1.5`. -/
example : Instance .empty .float (.num (.float (.dyadic 3 (-1)))) := ⟨by decide, .float⟩

/-- `integer` refuses the float `1.0`: the leaves are disjoint. -/
example : ¬ Instance .empty .integer (.num (.float (.dyadic 1 0))) := fun ⟨_, h⟩ => nomatch h

/-- The float `0.1` shows one tenth, its shortest decimal… -/
example : (Number.float (.dyadic 3602879701896397 (-55))).shown = (1, 10) := by decide

/-- …though its exact value is a little above one tenth. -/
example : ¬ (Number.float (.dyadic 3602879701896397 (-55))).le (.bigdecimal (.of 1 1)) := by decide
```

`rfl` proves that a computation gives what it claims, here the three
fields of `1.5`. The last two claims are about the float nearest one
tenth, which shows `0.1` though its exact value is a little more.
What a float shows is its shortest decimal, which step 4 needs:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The decimal a float shows, as `c * 10 ^ k`: the shortest decimal
that rounds to the float, the closest to it of those, and of two that
close the one with the even last digit. It is the text both ports write
for a float, and what `multiple` reads one as. -/
def Float.shortest (x : Float) : ℤ × ℤ :=
```

Write `floats.aontu`:

<!-- test: scenario floats -->
<!-- test: file floats.aontu -->
```aontu
fraction: float & 1.5
point: float & 1.0
```

and run it:

<!-- test: run -->
```sh
$ aontu -c floats.aontu
{"fraction":1.5,"point":1.0}
```

A number written with a point is a float, whole or not, so `float`
admits both, and `-c` keeps the point of `1.0`, which is no integer.

A data file can be JSON too, and JSON has no `0d`: its numbers name no
leaf. Write the same numbers as `floats.json`:

<!-- test: file floats.json -->
```json
{"fraction": 1.5, "point": 1.0}
```

and run it plainly, then with `--exact-numbers`:

<!-- test: run -->
```sh
$ aontu -c floats.json
{"fraction":1.5,"point":1.0}
$ aontu -c --exact-numbers floats.json
{"fraction":0d1.5,"point":1}
```

Plainly, aontu reads a JSON number as it reads the same literal in an
aontu file, so both are floats. `--exact-numbers` reads each number by
its value instead: a whole number the `integer` leaf holds as an
integer, any other whole number as a big integer, and a fraction as a
big decimal, so `1.5` is `0d1.5` and `1.0` the integer `1`. The
definition says what each kind admits, and which leaf a number lands in
is the reader's business, which the flag changes. No other transcript
on this page reads JSON.

### Big integers and big decimals

A big integer is any whole number, and a big decimal an exact decimal:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- A `biginteger`: a whole number, exact and unbounded. -/
structure BigInteger where
  value : ℤ
  deriving DecidableEq

/-! ### Big decimals -/

/-- A `bigdecimal`: the exact value `coef * 10 ^ (-scale)`, the
coefficient with no zero trailing it. Scale is presentation, not
identity, so each value has one `BigDecimal`: `0d0.10` and `0d0.1` are
both `⟨1, 1, _⟩`. -/
structure BigDecimal where
  coef : ℤ
  scale : ℤ
  canon : coef % 10 ≠ 0 ∨ (coef = 0 ∧ scale = 0)
```

The coefficient carries no trailing zero, so `0d0.10` and `0d0.1` are
one value: scale is presentation, not identity. Each leaf has its kind:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | biginteger {x : BigInteger} : Judge env root true .biginteger (.num (.biginteger x))
  | bigintegerNot {j : Data} :
      (∀ x : BigInteger, j ≠ .num (.biginteger x)) → Judge env root false .biginteger j
  | bigdecimal {x : BigDecimal} : Judge env root true .bigdecimal (.num (.bigdecimal x))
  | bigdecimalNot {j : Data} :
      (∀ x : BigDecimal, j ≠ .num (.bigdecimal x)) → Judge env root false .bigdecimal j
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `biginteger` admits `9007199254740993`, exactly. -/
example : Instance .empty .biginteger (.num (.biginteger ⟨9007199254740993⟩)) := ⟨by decide, .biginteger⟩

/-- `bigdecimal` admits one and a half. -/
example : Instance .empty .bigdecimal (.num (.bigdecimal (.of 15 1))) := ⟨by decide, .bigdecimal⟩

/-- `integer` refuses the biginteger `5`, however equal they look. -/
example : ¬ Instance .empty .integer (.num (.biginteger ⟨5⟩)) := fun ⟨_, h⟩ => nomatch h
```

Write `bigs.aontu`:

<!-- test: scenario bigs -->
<!-- test: file bigs.aontu -->
```aontu
big: biginteger & 0d9007199254740993
half: bigdecimal & 0d1.5
whole: bigdecimal & 0d3.0
```

and run it:

<!-- test: run -->
```sh
$ aontu -c bigs.aontu
{"big":0d9007199254740993,"half":0d1.5,"whole":0d3.0}
```

`0d` marks an exact number. `0d9007199254740993` is the big integer no
double holds, kept to its last digit, and `0d3.0` is a big decimal,
though whole, where `0d3` would be a big integer.

### The `number` kind

`number` admits a number of every leaf, and refuses what is no number:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | number {x : Number} : Judge env root true .number (.num x)
  | numberNot {j : Data} : (∀ x : Number, j ≠ .num x) → Judge env root false .number j
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `number` admits a number of every leaf. -/
example : Instance .empty .number (.integer 3) ∧
    Instance .empty .number (.num (.float (.dyadic 3 (-1)))) ∧
    Instance .empty .number (.num (.biginteger ⟨9007199254740993⟩)) ∧
    Instance .empty .number (.num (.bigdecimal (.of 15 1))) :=
  ⟨⟨by decide, .number⟩, ⟨by decide, .number⟩, ⟨by decide, .number⟩, ⟨by decide, .number⟩⟩

/-- `number` refuses the string `"1"`. -/
example : ¬ Instance .empty .number (.str "1") := fun ⟨_, h⟩ => nomatch h
```

Write `numbers.aontu`, a number of each leaf:

<!-- test: scenario numbers -->
<!-- test: file numbers.aontu -->
```aontu
integer: number & 3
float: number & 1.5
biginteger: number & 0d9007199254740993
bigdecimal: number & 0d1.5
```

and run it:

<!-- test: run -->
```sh
$ aontu -c numbers.aontu
{"bigdecimal":0d1.5,"biginteger":0d9007199254740993,"float":1.5,"integer":3}
```

`number` admits each, and each keeps its leaf.

The numbers that show a whole number, of every leaf, are
`number & multiple(1)`, and that's a law of the definition, not only an
example. The tour proves it for every value:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `number & multiple(1)` admits the biginteger `9007199254740993`. -/
example : Instance .empty (.meet .number (.multiple (.integer (.of 1)))) (.num (.biginteger ⟨9007199254740993⟩)) :=
  ⟨by decide, .meet .number (.multiple (by decide) (by decide))⟩

/-- `number & multiple(1)` admits exactly the numbers that show a whole
number, of every leaf. -/
example (env : Env) (root j : Data) :
    Admits env root (.meet .number (.multiple (.integer (.of 1)))) j ↔ ∃ x, j = .num x ∧ x.Whole := by
```

The proof reads `multiple(1)` through a fact about the numbers:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The multiples of one are the numbers that show a whole number. -/
theorem Number.multipleOf_one (x : Number) : x.multipleOf (.integer (.of 1)) ↔ x.Whole := by
```

`↔` reads as *exactly when*. Meet `number & multiple(1)` with a whole
number of each leaf. Write `whole.aontu`:

<!-- test: scenario whole -->
<!-- test: file whole.aontu -->
```aontu
integer: number & multiple(1) & 3
float: number & multiple(1) & 1.0
biginteger: number & multiple(1) & 0d9007199254740993
bigdecimal: number & multiple(1) & 0d3.0
```

and run it:

<!-- test: run -->
```sh
$ aontu -c whole.aontu
{"bigdecimal":0d3.0,"biginteger":0d9007199254740993,"float":1.0,"integer":3}
```

`number & multiple(1)` admits all four, the float `1.0` and the big
decimal `0d3.0` among them, which `integer` refuses: the law reads the
value a number shows, not its leaf. Step 4 covers `multiple`.

### Strings

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-! ## Strings

A string is a Lean `String`: its sequence of characters, the Unicode
scalar values. So a string that holds a lone surrogate, as `"\ud800"`
escapes one, is no value here: both engines accept it, and they differ
on what it is (`test/spec/divergent.tsv`). Two strings are ordered as
Lean orders them, character by character by code point, and a string
is below any longer string it begins: `"b" < "ba"`. -/
```

`string` admits every string but the empty one, and `string & empty()`
admits that one too:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | string {s : String} : s ≠ "" → Judge env root true .string (.str s)
  | stringNot {j : Data} : (∀ s, j = .str s → s = "") → Judge env root false .string j
  | anyString {s : String} : Judge env root true .anyString (.str s)
  | anyStringNot {j : Data} : (∀ s, j ≠ .str s) → Judge env root false .anyString j
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
example : ¬ Instance .empty .string (.integer 3) := fun ⟨_, h⟩ => nomatch h
```

Write `strings.aontu`:

<!-- test: scenario strings -->
<!-- test: file strings.aontu -->
```aontu
text: string & "a"
empty: string & empty() & ""
```

and run it:

<!-- test: run -->
```sh
$ aontu -c strings.aontu
{"empty":"","text":"a"}
```

`string` alone refuses the empty string, and that refusal is worth
seeing. `aontu vet` checks data against a schema, and names each key it
refuses. Write `nonempty.aontu`, the schema:

<!-- test: file nonempty.aontu -->
```aontu
text: string
```

and `nonempty-data.aontu`:

<!-- test: file nonempty-data.aontu -->
```aontu
text: ""
```

Now vet the data against the schema:

<!-- test: run -->
```sh
$ aontu vet nonempty.aontu nonempty-data.aontu
verdict: invalid

$.text: string_empty [conflict]
  [aontu/string_empty]: Cannot resolve value at path $.text
  data: nonempty-data.aontu:1:7 (string&"")
$ echo $?
1
```

The finding names the key, `$.text`, and the reason, `string_empty`.
Its `data:` line shows the meet that formed, `string&""`, which admits
nothing, and its class, `conflict`, says no more data could change
that.

### Booleans

`boolean` admits both booleans, and nothing else:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | boolean {b : Bool} : Judge env root true .boolean (.bool b)
  | booleanNot {j : Data} : (∀ b, j ≠ .bool b) → Judge env root false .boolean j
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `boolean` admits `true`. -/
example : Instance .empty .boolean (.bool true) := ⟨by decide, .boolean⟩

/-- `boolean` refuses `1`. -/
example : ¬ Instance .empty .boolean (.integer 1) := fun ⟨_, h⟩ => nomatch h
```

Write `booleans.aontu`:

<!-- test: scenario booleans -->
<!-- test: file booleans.aontu -->
```aontu
yes: boolean & true
no: boolean & false
```

and run it:

<!-- test: run -->
```sh
$ aontu -c booleans.aontu
{"no":false,"yes":true}
```

## 3. Literals

A literal is one scalar, and admits that scalar alone:

<!-- test: quote spec/Aontu/Syntax.lean -->
```lean
/-- A scalar literal: one number, of any of the four leaves, or one
string, boolean, or null. -/
inductive Scalar where
  | num (x : Number)
  | str (s : String)
  | bool (b : Bool)
  | null
```

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- A literal admits its own value alone, of its own leaf, and refuses
  every other. -/
  | num {x : Number} : Judge env root true (.lit (.num x)) (.num x)
  | str {s : String} : Judge env root true (.lit (.str s)) (.str s)
  | bool {b : Bool} : Judge env root true (.lit (.bool b)) (.bool b)
  | null : Judge env root true (.lit .null) .null
  | litNot {s : Scalar} {j : Data} : j ≠ s.data → Judge env root false (.lit s) j
```

A number literal admits its own number in its own leaf: `3` the integer
three, and `0d3` the big integer. `null` has no kind of its own: the
literal `null` admits it.

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `3` admits `3`. -/
example : Instance .empty (.lit (.num (.integer (.of 3)))) (.integer 3) := ⟨by decide, .num⟩

/-- `3` refuses `4`. -/
example : ¬ Instance .empty (.lit (.num (.integer (.of 3)))) (.integer 4) := fun ⟨_, h⟩ => absurd ((check_iff .lit _).mpr h) (by decide)

/-- `3` refuses `0d3`, the biginteger three. -/
example : ¬ Instance .empty (.lit (.num (.integer (.of 3)))) (.num (.biginteger ⟨3⟩)) := fun ⟨_, h⟩ => absurd ((check_iff .lit _).mpr h) (by decide)

/-- `"a"` refuses `"b"`. -/
example : ¬ Instance .empty (.lit (.str "a")) (.str "b") := fun ⟨_, h⟩ => absurd ((check_iff .lit _).mpr h) (by decide)

/-- `true` refuses `false`. -/
example : ¬ Instance .empty (.lit (.bool true)) (.bool false) := fun ⟨_, h⟩ => absurd ((check_iff .lit _).mpr h) (by decide)

/-- `null` admits `null`. -/
example : Instance .empty (.lit .null) .null := ⟨by decide, .null⟩

/-- `null` refuses `false`. -/
example : ¬ Instance .empty (.lit .null) (.bool false) := fun ⟨_, h⟩ => nomatch h
```

The four refusals after the first example borrow the checker of step 17 to compute the answer. Write `literals.aontu`:

<!-- test: scenario literals -->
<!-- test: file literals.aontu -->
```aontu
three: 3 & 3
exact: 0d3 & 0d3
same: "a" & "a"
yes: true & true
nothing: null & null
```

and run it:

<!-- test: run -->
```sh
$ aontu -c literals.aontu
{"exact":0d3,"nothing":null,"same":"a","three":3,"yes":true}
```

A literal meets its own value and gives it back, leaf and all: `0d3`
and `3` look alike, but one is a big integer and the other an integer.
Write `exact.aontu`, the schema:

<!-- test: file exact.aontu -->
```aontu
v: 0d3
```

and `exact-data.aontu`:

<!-- test: file exact-data.aontu -->
```aontu
v: 3
```

Now vet the data against the schema:

<!-- test: run -->
```sh
$ aontu vet exact.aontu exact-data.aontu
verdict: invalid

$.v: scalar_kind [conflict]
  [aontu/scalar_kind]: Cannot unify values at path $.v
  data: exact-data.aontu:1:4 (3)
  schema: exact.aontu:1:4 (0d3)
$ echo $?
1
```

The engine calls a value of another leaf than the literal's a
`scalar_kind` refusal.

## 4. Bounds

A bound holds a value to one side of an end, and the end decides the
domain: a number at the end bounds numbers, and a string bounds
strings.

<!-- test: quote spec/Aontu/Syntax.lean -->
```lean
/-- The end of a bound: a number, which bounds numbers by exact value,
or a string, which bounds strings in code-point order. -/
inductive Bound where
  | num (n : Number)
  | str (s : String)
```

Each of the four bounds has one rule for each kind of end, and one
refusal for both. `min` and `max` first:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- A bound with a number at its end admits a number, by exact value,
  and one with a string at its end a string, in code-point order; the
  bound's domain is its end's, so `min(0)` admits no string and
  `max("b")` no number. It refuses a value of its domain that falls
  outside it, and every value outside its domain. -/
  | min {n x : Number} : n.le x → Judge env root true (.min (.num n)) (.num x)
  | minStr {b s : String} : b ≤ s → Judge env root true (.min (.str b)) (.str s)
  | minNot {b : Bound} {j : Data} :
      (∀ n x, b = .num n → j = .num x → ¬ n.le x) → (∀ t s, b = .str t → j = .str s → ¬ t ≤ s) →
      Judge env root false (.min b) j
  | max {n x : Number} : x.le n → Judge env root true (.max (.num n)) (.num x)
  | maxStr {b s : String} : s ≤ b → Judge env root true (.max (.str b)) (.str s)
  | maxNot {b : Bound} {j : Data} :
      (∀ n x, b = .num n → j = .num x → ¬ x.le n) → (∀ t s, b = .str t → j = .str s → ¬ s ≤ t) →
      Judge env root false (.max b) j
```

### Numbers

A bound compares numbers of any leaf by their exact values:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- A number's exact value, as an integer over a positive natural. -/
def Number.value : Number → ℤ × ℕ
  | .integer x => (x.value, 1)
  | .float x =>
    let m : ℤ := if x.neg then -(x.man : ℤ) else x.man
    if 0 ≤ x.pow then (m * 2 ^ x.pow.toNat, 1) else (m, 2 ^ (-x.pow).toNat)
  | .biginteger x => (x.value, 1)
  | .bigdecimal x =>
    if 0 ≤ x.scale then (x.coef, 10 ^ x.scale.toNat) else (x.coef * 10 ^ (-x.scale).toNat, 1)
```

and `multiple` reads the value a number shows, which differs from its
exact value only for a float:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The value a number shows: its exact value, but for a float the
decimal it shows, so that `0.3` shows three tenths where its exact
value is a little below. -/
def Number.shown : Number → ℤ × ℕ
  | .float x =>
    let (c, k) := x.shortest
    if 0 ≤ k then (c * 10 ^ k.toNat, 1) else (c, 10 ^ (-k).toNat)
  | x => x.value

/-- `x` is at most `y`, by exact value. -/
def Number.le (x y : Number) : Prop := x.value.1 * y.value.2 ≤ y.value.1 * x.value.2

/-- `x` is below `y`, by exact value. -/
def Number.lt (x y : Number) : Prop := x.value.1 * y.value.2 < y.value.1 * x.value.2

/-- `d` shows a positive number. -/
def Number.Positive (d : Number) : Prop := 0 < d.shown.1

/-- What `x` shows is a whole multiple of what `d` shows, for a `d`
that shows a positive number. -/
def Number.multipleOf (x d : Number) : Prop :=
  (x.shown.1 * d.shown.2) % (d.shown.1 * x.shown.2) = 0
```

Each comparison multiplies each side by the other's denominator, which
puts the two over one denominator: one and a half is three times a
half, and `1.25` is no whole multiple of it. The rule for `multiple`
asks for a positive divisor, so `multiple(0)` admits nothing:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- `multiple` reads the value a number shows, which for a float is
  its shortest decimal; `multiple(0)` and a negative divisor admit
  nothing. -/
  | multiple {d x : Number} :
      d.Positive → x.multipleOf d → Judge env root true (.multiple d) (.num x)
  | multipleNot {d : Number} {j : Data} :
      (∀ x, j = .num x → d.Positive → ¬ x.multipleOf d) → Judge env root false (.multiple d) j
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `min(3)` admits `3`. -/
example : Instance .empty (.min (.num (.integer (.of 3)))) (.integer 3) := ⟨by decide, .min (by decide)⟩

/-- `min(3)` refuses `2`. -/
example : ¬ Instance .empty (.min (.num (.integer (.of 3)))) (.integer 2) := by
  rintro ⟨-, h⟩
  cases h with
  | min h => exact absurd h (by decide)

/-- `min(3)` admits the bigdecimal three and a half. -/
example : Instance .empty (.min (.num (.integer (.of 3)))) (.num (.bigdecimal (.of 35 1))) := ⟨by decide, .min (by decide)⟩

/-- `max(2.5)`, whose bound is a float, admits the bigdecimal `2.5`: a
bound compares exact values, whatever their leaves. -/
example : Instance .empty (.max (.num (.float (.dyadic 5 (-1))))) (.num (.bigdecimal (.of 25 1))) :=
  ⟨by decide, .max (by decide)⟩

/-- `max(2.5)` refuses `2.6`. -/
example : ¬ Instance .empty (.max (.num (.float (.dyadic 5 (-1))))) (.num (.bigdecimal (.of 26 1))) := by
  rintro ⟨-, h⟩
  cases h with
  | max h => exact absurd h (by decide)

/-- `max(0d0.1)` refuses the float `0.1`, whose exact value is above
one tenth. -/
example : ¬ Instance .empty (.max (.num (.bigdecimal (.of 1 1))))
    (.num (.float (.dyadic 3602879701896397 (-55)))) := by
  rintro ⟨-, h⟩
  cases h with
  | max h => exact absurd h (by decide)

/-- `multiple(0.5)` admits one and a half. -/
example : Instance .empty (.multiple (.float (.dyadic 1 (-1)))) (.num (.bigdecimal (.of 15 1))) :=
  ⟨by decide, .multiple (by decide) (by decide)⟩

/-- `multiple(0.5)` refuses `1.25`. -/
example : ¬ Instance .empty (.multiple (.float (.dyadic 1 (-1)))) (.num (.bigdecimal (.of 125 2))) := by
  rintro ⟨-, h⟩
  cases h with
  | multiple _ h => exact absurd h (by decide)

/-- `multiple(0.1)` admits the float `0.3`: it reads the decimal each
float shows, where their exact values are no multiple. -/
example : Instance .empty (.multiple (.float (.dyadic 3602879701896397 (-55))))
    (.num (.float (.dyadic 5404319552844595 (-54)))) :=
  ⟨by decide, .multiple (by decide) (by decide)⟩

/-- `multiple(0)` refuses `0`, and everything else. -/
example : ¬ Instance .empty (.multiple (.integer (.of 0))) (.integer 0) := by
```

Write `bounds.aontu`:

<!-- test: scenario bounds -->
<!-- test: file bounds.aontu -->
```aontu
three: min(3) & 3
fraction: min(3) & 3.5
ceiling: max(2.5) & 0d2.5
half: multiple(0.5) & 1.5
```

and run it:

<!-- test: run -->
```sh
$ aontu -c bounds.aontu
{"ceiling":0d2.5,"fraction":3.5,"half":1.5,"three":3}
```

`min(3)` admits `3` itself and the float three and a half. The bound of
`max(2.5)` is a float and `0d2.5` a big decimal, and the bound admits
it, as their exact values are equal. `1.5` is three halves, so
`multiple(0.5)` admits it.

A float's exact value is a binary fraction, and the value it shows its
shortest decimal, so on a float the two part. Write `tenths.aontu`:

<!-- test: scenario tenths -->
<!-- test: file tenths.aontu -->
```aontu
tenth: max(0d0.1) & 0d0.1
thirds: multiple(0.1) & 0.3
```

and run it:

<!-- test: run -->
```sh
$ aontu -c tenths.aontu
{"tenth":0d0.1,"thirds":0.3}
```

`multiple(0.1)` admits the float `0.3`, which shows three tenths,
though no exact multiple of the double nearest one tenth is the double
nearest three tenths. A bound reads the exact value instead, and the
float `0.1` is a little more than one tenth. Write `tenth.aontu`:

<!-- test: file tenth.aontu -->
```aontu
v: max(0d0.1)
```

and `tenth-data.aontu`:

<!-- test: file tenth-data.aontu -->
```aontu
v: 0.1
```

Now vet the data against the schema:

<!-- test: run -->
```sh
$ aontu vet tenth.aontu tenth-data.aontu
verdict: invalid

$.v: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.v
  expected: max(0d0.1)
  actual:   0.1
  data: tenth-data.aontu:1:4 (0.1)
  schema: tenth.aontu:1:4 (max(0d0.1))
$ echo $?
1
```

`max(0d0.1)` admits the big decimal `0d0.1`, and refuses the float
`0.1`, whose exact value exceeds it.

### Strict bounds

`above(n)` and `below(n)` leave the end out:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | above {n x : Number} : n.lt x → Judge env root true (.above (.num n)) (.num x)
  | aboveStr {b s : String} : b < s → Judge env root true (.above (.str b)) (.str s)
  | aboveNot {b : Bound} {j : Data} :
      (∀ n x, b = .num n → j = .num x → ¬ n.lt x) → (∀ t s, b = .str t → j = .str s → ¬ t < s) →
      Judge env root false (.above b) j
  | beneath {n x : Number} : x.lt n → Judge env root true (.beneath (.num n)) (.num x)
  | beneathStr {b s : String} : s < b → Judge env root true (.beneath (.str b)) (.str s)
  | beneathNot {b : Bound} {j : Data} :
      (∀ n x, b = .num n → j = .num x → ¬ x.lt n) → (∀ t s, b = .str t → j = .str s → ¬ s < t) →
      Judge env root false (.beneath b) j
```

`below(n)` is the constructor `beneath`, since Lean keeps the name
`below` for every inductive type's own use. The term means what the
function means:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `above(1)` refuses `1`… -/
example : ¬ Instance .empty (.above (.num (.integer (.of 1)))) (.integer 1) := by
  rintro ⟨-, h⟩
  cases h with
  | above h => exact absurd h (by decide)

/-- …and admits the bigdecimal `1.5`. -/
example : Instance .empty (.above (.num (.integer (.of 1)))) (.num (.bigdecimal (.of 15 1))) :=
  ⟨by decide, .above (by decide)⟩

/-- `below(1)` admits `0`. -/
example : Instance .empty (.beneath (.num (.integer (.of 1)))) (.integer 0) :=
  ⟨by decide, .beneath (by decide)⟩
```

Whatever is above an end is at least that end, for a number and for a
string alike. `spec/Aontu/Order.lean` proves it as a law of the order
step 10 defines:

<!-- test: quote spec/Aontu/Order.lean -->
```lean
/-- Whatever is above `b` is at least `b`: a strict bound is below its
closed one, for numbers and for strings. -/
theorem above_le_min (env : Env) (b : Bound) : .above b ⊑[env] .min b := by
```

Write `strict.aontu`:

<!-- test: scenario strict -->
<!-- test: file strict.aontu -->
```aontu
above: above(1) & 0d1.5
below: below(1) & 0
```

and run it:

<!-- test: run -->
```sh
$ aontu -c strict.aontu
{"above":0d1.5,"below":0}
```

`above(1)` admits the big decimal `0d1.5`, and `below(1)` admits `0`.
Neither admits its own end. Write `strict-schema.aontu`:

<!-- test: file strict-schema.aontu -->
```aontu
v: above(1)
```

and `strict-data.aontu`:

<!-- test: file strict-data.aontu -->
```aontu
v: 1
```

Now vet the data against the schema:

<!-- test: run -->
```sh
$ aontu vet strict-schema.aontu strict-data.aontu
verdict: invalid

$.v: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.v
  expected: above(1)
  actual:   1
  data: strict-data.aontu:1:4 (1)
  schema: strict-schema.aontu:1:4 (above(1))
$ echo $?
1
```

The engine reports a bound's refusal as `constraint`, whichever bound
it is.

### Strings

A bound with a string at its end orders strings character by
character, by code point, and a string comes before every longer
string it begins:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `min("b")` admits `"ba"`: a string comes before every longer string
it begins. -/
example : Instance .empty (.min (.str "b")) (.str "ba") := ⟨by decide, .minStr (by decide)⟩

/-- `min("b")` refuses `""`, which comes before every other string. -/
example : ¬ Instance .empty (.min (.str "b")) (.str "") := by
  rintro ⟨-, h⟩
  cases h with
  | minStr h => exact absurd h (by decide)

/-- `max("b")` admits `""`: a string bound says nothing about emptiness. -/
example : Instance .empty (.max (.str "b")) (.str "") := ⟨by decide, .maxStr (by decide)⟩

/-- `max("b")` refuses `1`: a bound's domain is its end's. -/
example : ¬ Instance .empty (.max (.str "b")) (.integer 1) := fun ⟨_, h⟩ => nomatch h
```

Write `strbounds.aontu`:

<!-- test: scenario strbounds -->
<!-- test: file strbounds.aontu -->
```aontu
longer: min("b") & "ba"
empty: max("b") & ""
```

and run it:

<!-- test: run -->
```sh
$ aontu -c strbounds.aontu
{"empty":"","longer":"ba"}
```

`max("b")` admits the empty string, which `string` alone refuses: a
bound is a claim about order, and says nothing about emptiness.

### Exclusions

`neq` lists the values it refuses:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- `neq` excludes each of its ends by identity, a number by leaf and
  value, so `neq(1)` admits the float `1.0`; its domain is its ends',
  so a list of numbers admits no string, a list of strings no number,
  and a list of both nothing. It refuses a value that is one of its
  ends, or outside its domain. -/
  | neq {vs : List Bound} {x : Number} :
      (∀ v, v ∈ vs → ∃ n, v = .num n ∧ n ≠ x) → Judge env root true (.neq vs) (.num x)
  | neqStr {vs : List Bound} {s : String} :
      (∀ v, v ∈ vs → ∃ t, v = .str t ∧ t ≠ s) → Judge env root true (.neq vs) (.str s)
  | neqNot {vs : List Bound} {j : Data} :
      (∀ x, j = .num x → ∃ v, v ∈ vs ∧ ∀ n, v = .num n → n = x) →
      (∀ s, j = .str s → ∃ v, v ∈ vs ∧ ∀ t, v = .str t → t = s) →
      Judge env root false (.neq vs) j
```

The first rule admits a number when every listed end is a number other
than it, and the second admits a string the same way. A list that mixes
the two satisfies neither rule, so it admits nothing:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `neq(1)` refuses the integer `1`… -/
example : ¬ Instance .empty (.neq [.num (.integer (.of 1))]) (.integer 1) := by
  rintro ⟨-, h⟩
  cases h with
  | neq h =>
    obtain ⟨_, he, hne⟩ := h _ (List.mem_singleton.mpr rfl)
    cases he
    exact hne rfl

/-- …and admits the float `1.0`, a value of another leaf. -/
example : Instance .empty (.neq [.num (.integer (.of 1))]) (.num (.float (.dyadic 1 0))) :=
  ⟨by decide, .neq fun _ hv => by cases List.mem_singleton.mp hv; exact ⟨_, rfl, by decide⟩⟩

/-- `neq(1)` refuses `"a"`: its domain is the numbers. -/
example : ¬ Instance .empty (.neq [.num (.integer (.of 1))]) (.str "a") := by
  rintro ⟨-, h⟩
  cases h with
  | neqStr h =>
    obtain ⟨_, he, -⟩ := h _ (List.mem_singleton.mpr rfl)
    cases he

/-- `neq(1, "a")` admits nothing: no value is in both domains. -/
example (j : Data) : ¬ Instance .empty (.neq [.num (.integer (.of 1)), .str "a"]) j := by
```

Write `neq.aontu`:

<!-- test: scenario neq -->
<!-- test: file neq.aontu -->
```aontu
float: neq(1) & 1.0
other: neq(1) & 2
```

and run it:

<!-- test: run -->
```sh
$ aontu -c neq.aontu
{"float":1.0,"other":2}
```

`neq(1)` excludes the integer `1` and nothing else, so the float `1.0`
passes: the leaves are disjoint, and the two are two values. A string
is outside its domain. Write `neq-schema.aontu`:

<!-- test: file neq-schema.aontu -->
```aontu
v: neq(1)
```

and `neq-data.aontu`:

<!-- test: file neq-data.aontu -->
```aontu
v: "a"
```

Now vet the data against the schema:

<!-- test: run -->
```sh
$ aontu vet neq-schema.aontu neq-data.aontu
verdict: invalid

$.v: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.v
  expected: neq(1)
  actual:   "a"
  data: neq-data.aontu:1:4 ("a")
  schema: neq-schema.aontu:1:4 (neq(1))
$ echo $?
1
```

### Sizes

`len(c)` holds a size to the term `c`:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- `len(c)` judges a string, a list, or a map as `c` judges its size,
  an integer; `len(0)` admits `""`, and a scalar has no size, so `len`
  refuses it, as it refuses a size no integer leaf holds. -/
  | len {b : Bool} {c : Val} {j : Data} {n : ℕ} (h : IntegerLeaf n) :
      j.size = some n → Judge env root b c (.num (.integer ⟨n, h⟩)) → Judge env root b (.len c) j
  | lenNone {c : Val} {j : Data} : j.size = none → Judge env root false (.len c) j
  | lenBig {c : Val} {j : Data} {n : ℕ} :
      j.size = some n → ¬ IntegerLeaf n → Judge env root false (.len c) j
```

The size is the value's own:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The size `len` counts: a string's characters, a list's elements,
a map's members. A scalar has no size. -/
def Data.size : Data → Option ℕ
  | .str s => some s.length
  | .list xs => some xs.length
  | .map fs => some fs.length
  | _ => none
```

A string's size is its characters, not its bytes, so `len(1)` admits
`"𝄞"`, one character in four bytes. The rule hands the size to `c` as
an integer, so `c` is any term over the integers: a literal, a bound,
or a kind such as `number`:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `len(1)` admits `"𝄞"`, one character in four bytes. -/
example : Instance .empty (.len (.lit (.num (.integer (.of 1))))) (.str "𝄞") :=
  ⟨by decide, .len (n := 1) (by decide) (by decide) .num⟩

/-- `len(0)` admits `""`, which `string` refuses. -/
example : Instance .empty (.len (.lit (.num (.integer (.of 0))))) (.str "") :=
  ⟨by decide, .len (n := 0) (by decide) (by decide) .num⟩

/-- `len(min(2))` admits `{"x": 1, "y": 2}`… -/
example : Instance .empty (.len (.min (.num (.integer (.of 2)))))
    (.map [("x", .integer 1), ("y", .integer 2)]) :=
  ⟨by decide, .len (n := 2) (by decide) (by decide) (.min (by decide))⟩

/-- …and refuses `[1]`. -/
example : ¬ Instance .empty (.len (.min (.num (.integer (.of 2))))) (.list [.integer 1]) :=
  fun ⟨_, h⟩ => absurd ((check_iff (.len .min) _).mpr h) (by decide)

/-- `len(1)` refuses `5`: a number has no size. -/
example : ¬ Instance .empty (.len (.lit (.num (.integer (.of 1))))) (.integer 5) := by
  rintro ⟨-, h⟩
  cases h with
  | len _ hs _ => cases hs
```

`(n := 1)` names the size for Lean, which the rule otherwise reads off
the data. Write `len.aontu`:

<!-- test: scenario len -->
<!-- test: file len.aontu -->
```aontu
clef: len(1) & "𝄞"
empty: len(0) & ""
pair: len(min(2)) & { x:1 y:2 }
```

and run it:

<!-- test: run -->
```sh
$ aontu -c len.aontu
{"clef":"𝄞","empty":"","pair":{"x":1,"y":2}}
```

Each size passes, the one character of `"𝄞"` among them. Write
`len-schema.aontu`:

<!-- test: file len-schema.aontu -->
```aontu
v: len(min(2))
```

and `len-data.aontu`:

<!-- test: file len-data.aontu -->
```aontu
v: [1]
```

Now vet the data against the schema:

<!-- test: run -->
```sh
$ aontu vet len-schema.aontu len-data.aontu
verdict: invalid

$.v: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.v
  expected: len(integer&min(2))
  actual:   [1]
  data: len-data.aontu:1:4 ([1])
  schema: len-schema.aontu:1:4 (len(integer&min(2)))
$ echo $?
1
```

The engine writes the count's term in full, `integer&min(2)`: a size is
an integer, which the rule's `IntegerLeaf n` says too.

### Distinct members

`unique()` holds the members of a list or a map apart:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- `unique()` admits a list or a map whose members are pairwise
  distinct as values, and `unique("k")` one whose members each give
  `k` a value and whose values at `k` are; a member that is no map, or
  lacks the key, is a distinctness the container cannot show, so
  `unique` refuses it, as it refuses a scalar and two members alike. -/
  | unique {k : Option String} {j : Data} {ms : List Data} :
      j.members = some ms →
      (∀ x, x ∈ ms → (x.project k).isSome) →
      ms.Pairwise (fun x y => ∀ x' y', x.project k = some x' → y.project k = some y' →
        ¬ x'.Same y') →
      Judge env root true (.unique k) j
  | uniqueNone {k : Option String} {j : Data} : j.members = none → Judge env root false (.unique k) j
  | uniqueBare {k : Option String} {j : Data} {ms : List Data} {x : Data} :
      j.members = some ms → x ∈ ms → x.project k = none → Judge env root false (.unique k) j
  | uniqueDup {k : Option String} {j : Data} {ms : List Data} :
      j.members = some ms →
      ¬ ms.Pairwise (fun x y => ∀ x' y', x.project k = some x' → y.project k = some y' →
        ¬ x'.Same y') →
      Judge env root false (.unique k) j
```

`Pairwise` says the relation holds between every two members, and the
relation is that they aren't one value, compared as step 9 compares
two values, after a projection:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The members `unique` compares: a list's elements, or a map's
values. A scalar has no members. -/
def Data.members : Data → Option (List Data)
  | .list xs => some xs
  | .map fs => some (fs.map Prod.snd)
  | _ => none

/-- What `unique` compares of a member: the member itself, or under a
key, the value the member gives that key, which a member that is no
map, or lacks the key, has not. -/
def Data.project (k : Option String) (x : Data) : Option Data :=
  match k with
  | none => some x
  | some k => match x with
    | .map fs => lookup k fs
    | _ => none
```

With no key, each member is compared whole. With one, the value each
member gives the key is compared, and a member that gives it none
fails the second premise:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `unique()` admits `[1, 1.0]`: two values, of two leaves. -/
example : Instance .empty (.unique none) (.list [.integer 1, .num (.float (.dyadic 1 0))]) :=
  ⟨by decide, (check_iff .unique _).mp (by decide)⟩

/-- `unique()` refuses `[{"x": 1, "y": 2}, {"y": 2, "x": 1}]`: two maps
with the same members are one value. -/
example : ¬ Instance .empty (.unique none)
    (.list [.map [("x", .integer 1), ("y", .integer 2)], .map [("y", .integer 2), ("x", .integer 1)]]) :=
  fun ⟨_, h⟩ => absurd ((check_iff .unique _).mpr h) (by decide)
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `unique("p")` admits `[{"p": 1}, {"p": 2}]`… -/
example : Instance .empty (.unique (some "p"))
    (.list [.map [("p", .integer 1)], .map [("p", .integer 2)]]) :=
  ⟨by decide, (check_iff .unique _).mp (by decide)⟩

/-- …and refuses `[{"p": 1}, {"q": 1}]`: a member without the key is a
distinctness the list cannot show. -/
example : ¬ Instance .empty (.unique (some "p"))
    (.list [.map [("p", .integer 1)], .map [("q", .integer 1)]]) :=
  fun ⟨_, h⟩ => absurd ((check_iff .unique _).mpr h) (by decide)
```

These examples borrow the checker of step 17, which computes whether
two values are one. Write `unique.aontu`:

<!-- test: scenario unique -->
<!-- test: file unique.aontu -->
```aontu
leaves: unique() & [1 1.0]
keyed: unique("p") & [p:1 p:2]
```

and run it:

<!-- test: run -->
```sh
$ aontu -c unique.aontu
{"keyed":[{"p":1},{"p":2}]&unique("p"),"leaves":[1,1.0]&unique()}
```

Both lists pass, and `-c` shows each atom still on its list: a member
could arrive later, so the engine keeps the claim until nothing more
can. `[1 1.0]` is two values, as the first example proves. Two maps
with the same members are one value, in whatever order they list them.
Write `unique-schema.aontu`:

<!-- test: file unique-schema.aontu -->
```aontu
v: unique()
```

and `unique-data.aontu`:

<!-- test: file unique-data.aontu -->
```aontu
v: [{ x:1 y:2 } { y:2 x:1 }]
```

Now vet the data against the schema:

<!-- test: run -->
```sh
$ aontu vet unique-schema.aontu unique-data.aontu
verdict: invalid

$.v: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.v
  expected: unique()
  actual:   [{"x":1,"y":2},{"x":1,"y":2}]
  data: unique-data.aontu:1:4 ([{"x":1,"y":2},{"x":1,"y":2}])
  schema: unique-schema.aontu:1:4 (unique())
$ echo $?
1
```

The engine prints both members with their keys in one order, which is
what makes them one value.

### Patterns and formats

`re(p)` admits the strings the pattern `p` matches, and `format(g)`
the strings the format `g` reads. Which strings those are, the
definition leaves to the engines: each is a predicate it names and
never defines.

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
/-- What the definition leaves to the engines: which strings a pattern
matches, and which strings a format, a name or a grammar, reads to its
end. Each is a predicate on two strings, and nothing here says what
either holds of, so a theorem about `re` or `format` holds whatever they
are. -/
structure Host where
  pattern : String → String → Prop
  format : String → String → Prop

instance : Inhabited Host := ⟨⟨fun _ _ => True, fun _ _ => True⟩⟩

/-- The predicates behind `re` and `format`: a constant no proof can
unfold, so they are read and never computed. -/
opaque host : Host
```

`opaque` declares a constant Lean knows the type of and nothing else.
The two rules read it:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- `re(p)` admits the strings the pattern matches, and `format(g)`
  the strings the format reads, by the host's predicates; each admits
  `""` exactly where its predicate holds of it, admits no other kind of
  value, and refuses whatever it does not admit. -/
  | re {p s : String} : host.pattern p s → Judge env root true (.re p) (.str s)
  | reNot {p : String} {j : Data} :
      (∀ s, j = .str s → ¬ host.pattern p s) → Judge env root false (.re p) j
  | format {g s : String} : host.format g s → Judge env root true (.format g) (.str s)
  | formatNot {g : String} {j : Data} :
      (∀ s, j = .str s → ¬ host.format g s) → Judge env root false (.format g) j
```

So the definition says what the rules say and no more: a pattern
admits strings alone, two patterns met admit the strings both match,
and nothing about any one pattern.

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `re(p)` admits no number, whatever the pattern. -/
example (p : String) : ¬ Instance .empty (.re p) (.integer 1) := fun ⟨_, h⟩ => nomatch h

/-- `re(p) & re(q)` admits a string exactly when each pattern matches
it, whatever matching is. -/
example (env : Env) (root : Data) (p q s : String) :
    Admits env root (.meet (.re p) (.re q)) (.str s) ↔ host.pattern p s ∧ host.pattern q s := by
```

The [language reference](reference-language.md#re-and-the-pattern-language)
states which strings a pattern matches and
[which a format reads](reference-language.md#formats-format), and the
shared test suite holds both engines to them. Write `patterns.aontu`:

<!-- test: scenario patterns -->
<!-- test: file patterns.aontu -->
```aontu
letters: re("^a+$") & "aaa"
anywhere: re("a") & "ba"
date: format("date") & "2024-02-29"
digits: format("v = *DIGIT") & ""
```

and run it:

<!-- test: run -->
```sh
$ aontu -c patterns.aontu
{"anywhere":"ba","date":"2024-02-29","digits":"","letters":"aaa"}
```

A pattern matches anywhere in the string unless anchored, so `re("a")`
admits `"ba"`. A format is a name, such as `date`, or a grammar, and
`format("v = *DIGIT")` admits `""`, which its grammar reads: the rule
says nothing about emptiness, and the predicate decides. Write
`patterns-schema.aontu`:

<!-- test: file patterns-schema.aontu -->
```aontu
v: re("^a+$")
```

and `patterns-data.aontu`:

<!-- test: file patterns-data.aontu -->
```aontu
v: "b"
```

Now vet the data against the schema:

<!-- test: run -->
```sh
$ aontu vet patterns-schema.aontu patterns-data.aontu
verdict: invalid

$.v: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.v
  expected: re("^a+$")
  actual:   "b"
  data: patterns-data.aontu:1:4 ("b")
  schema: patterns-schema.aontu:1:4 (re("^a+$"))
$ echo $?
1
```

## 5. The two ends: `any` and `nil`

`any` admits every value and refuses none, and `nil` refuses every
value and admits none, each by its one rule. They're the [top](unification.md) and the
[bottom](unification.md) of the [lattice](unification.md):

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | any {j : Data} : Judge env root true .any j
  | nil {j : Data} : Judge env root false .nil j
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `any` admits `null`. -/
example : Instance .empty .any .null := ⟨by decide, .any⟩

/-- `any` admits `[1, "a"]`. -/
example : Instance .empty .any (.list [.integer 1, .str "a"]) := ⟨by decide, .any⟩

/-- `nil` refuses `null`, and everything else. -/
example : ¬ Instance .empty .nil .null := fun ⟨_, h⟩ => nomatch h
```

Write `ends.aontu`:

<!-- test: scenario ends -->
<!-- test: file ends.aontu -->
```aontu
nothing: any & null
list: any & [1 "a"]
map: any & { x:1 }
```

and run it:

<!-- test: run -->
```sh
$ aontu -c ends.aontu
{"list":[1,"a"],"map":{"x":1},"nothing":null}
```

`any` gives each value back, whatever its shape. `nil` gives back
nothing, which is what makes it the bottom.

## 6. Maps and lists

The data goes on past the scalars to the two containers:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The data: a number, a string, a boolean, null, a map, or a list. A
map is the set of its members: Lean lists them, the order of the list
is no part of the value, and a map gives each key once
(`Data.WellFormed`). -/
inductive Data where
  | num (x : Number)
  | str (s : String)
  | bool (b : Bool)
  | null
  | map (fs : List (String × Data))
  | list (xs : List Data)
```

A map is the set of its members, and a member is a key with the value
the map gives it: `List (String × Data)` reads as a list of pairs of a
string and a value. A Lean list can give one key twice, which no map
does, so the definition says which Lean `Data` is a value:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- A Lean `Data` is a value when each of its maps gives each key once.
Every number is one already: each leaf's type holds only its own. -/
inductive Data.WellFormed : Data → Prop
  | num {x : Number} : WellFormed (.num x)
  | str {s : String} : WellFormed (.str s)
  | bool {b : Bool} : WellFormed (.bool b)
  | null : WellFormed .null
  | map {fs : List (String × Data)} :
      (fs.map Prod.fst).Nodup → (∀ k x, (k, x) ∈ fs → WellFormed x) → WellFormed (.map fs)
  | list {xs : List Data} : (∀ x, x ∈ xs → WellFormed x) → WellFormed (.list xs)
```

`Nodup` says no key appears twice, `∀ x, x ∈ xs → …` reads "every `x`
in `xs` is …", and `decide` checks the whole by computing:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{"a": 1}` is a value. -/
example : Data.WellFormed (.map [("a", .integer 1)]) := by decide

/-- A Lean `Data` that gives `a` twice is no value. -/
example : ¬ Data.WellFormed (.map [("a", .integer 1), ("a", .integer 2)]) := by decide

/-- …so it is no instance of anything, `any` included. -/
example : ¬ Instance .empty .any (.map [("a", .integer 1), ("a", .integer 2)]) :=
  fun ⟨hw, _⟩ => absurd hw (by decide)
```

A refusal can take apart the first half of an instance too:
`fun ⟨hw, _⟩ => absurd hw (by decide)` shows that the map giving `a`
twice is no value, so it's an instance of nothing, `any` included.

The order of a map's list is no part of the value. Step 9 compares two
maps that list one set of members in two orders.

### Keys, required and optional

A map's rule has four premises:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- A map: every declared key that is present holds its value, and
  holds every declaration of it; a key that is absent is optional in
  every declaration; the spread holds every member, declared or not;
  a sealed map holds no key it does not declare. It refuses a value
  that is no map, and a map that breaks any one of those. -/
  | map {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool}
      {jfs : List (String × Data)} :
      (∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x → Judge env root true v x) →
      (∀ k o v, (k, o, v) ∈ fs → lookup k jfs = none → o = true) →
      (∀ s, spread = some s → ∀ k x, (k, x) ∈ jfs → Judge env root true s x) →
      (closed = true → ∀ k x, (k, x) ∈ jfs → ∃ o v, (k, o, v) ∈ fs) →
      Judge env root true (.map fs spread closed) (.map jfs)
```

Read `∀ k o v x` as "for all `k`, `o`, `v`, and `x`" and `∈` as "is a
member of" in the premises, and `lookup` as the value a map gives the
key `k`:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The value a map gives the key `k`. -/
def lookup (k : String) : List (String × Data) → Option Data
  | [] => none
  | (k', v) :: fs => if k = k' then some v else lookup k fs
```

A map holds its keys as triples: the name, whether the key is optional,
and its term. The first premise holds a present key to its term, and the
second lets a key be absent only where every declaration makes it
optional. The last two are the spread and the seal, which follow below.
A map refuses a value that is no map, and a map that breaks any one of
the four:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | mapNot {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool} {j : Data} :
      (∀ jfs, j ≠ .map jfs) → Judge env root false (.map fs spread closed) j
  | mapField {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool}
      {jfs : List (String × Data)} {k : String} {o : Bool} {v : Val} {x : Data} :
      (k, o, v) ∈ fs → lookup k jfs = some x → Judge env root false v x →
      Judge env root false (.map fs spread closed) (.map jfs)
  | mapMissing {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool}
      {jfs : List (String × Data)} {k : String} {o : Bool} {v : Val} :
      (k, o, v) ∈ fs → lookup k jfs = none → o = false →
      Judge env root false (.map fs spread closed) (.map jfs)
  | mapSpread {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool}
      {jfs : List (String × Data)} {s : Val} {k : String} {x : Data} :
      spread = some s → (k, x) ∈ jfs → Judge env root false s x →
      Judge env root false (.map fs spread closed) (.map jfs)
  | mapClosed {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool}
      {jfs : List (String × Data)} {k : String} {x : Data} :
      closed = true → (k, x) ∈ jfs → (∀ o v, (k, o, v) ∉ fs) →
      Judge env root false (.map fs spread closed) (.map jfs)
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x: integer}` admits `{"x": 1}`. -/
example : Instance .empty (.map [("x", false, .integer)] none false) (.map [("x", .integer 1)]) := by
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x: integer}` refuses `{}`: the key is required. -/
example : ¬ Instance .empty (.map [("x", false, .integer)] none false) (.map []) := by
  rintro ⟨-, h⟩
  cases h with
  | map _ ha _ _ => exact absurd (ha "x" false .integer (List.mem_singleton.mpr rfl) rfl) (by decide)
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x?: integer}` admits `{}`. -/
example : Instance .empty (.map [("x", true, .integer)] none false) (.map []) :=
  ⟨by decide, .map (fun _ _ _ _ _ hx => nomatch hx)
    (fun _ _ _ hm _ => by cases List.mem_singleton.mp hm; rfl)
    (fun _ h => nomatch h) (fun h => nomatch h)⟩

/-- `{x?: integer}` refuses `{"x": "a"}`. -/
example : ¬ Instance .empty (.map [("x", true, .integer)] none false) (.map [("x", .str "a")]) := by
  rintro ⟨-, h⟩
  cases h with
  | map hp _ _ _ => nomatch hp "x" true .integer (.str "a") (List.mem_singleton.mpr rfl) rfl

/-- `{x?: integer}` refuses `[]`: a list is not a map. -/
example : ¬ Instance .empty (.map [("x", true, .integer)] none false) (.list []) :=
  fun ⟨_, h⟩ => nomatch h
```

Write `keys.aontu`:

<!-- test: scenario keys -->
<!-- test: file keys.aontu -->
```aontu
given: { x:integer } & { x:1 }
optional: { x?:integer } & {}
```

and run it:

<!-- test: run -->
```sh
$ aontu -c keys.aontu
{"given":{"x":1},"optional":{"x"?:integer}}
```

The given key holds its integer. The optional key may stay absent, and
`-c` shows it still declared, with no value: the map is `{}`, and more
data could still give `x` an integer. A required key can't be absent.
Write `missing.aontu`:

<!-- test: file missing.aontu -->
```aontu
v: { x:integer } & {}
```

and run it:

<!-- test: run -->
```sh
$ aontu -c missing.aontu
{"v":{"x":integer}}
```

The key stays, waiting for an integer, so the result isn't a value yet:
`aontu vet` calls such data `incomplete`, the class of a refusal that
more data could still meet.

### Spreads and seals

The third premise is the spread, which holds every member, declared or
not:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{&: integer}` admits `{"a": 1, "b": 2}`: the spread holds every member. -/
example : Instance .empty (.map [] (some .integer) false) (.map [("a", .integer 1), ("b", .integer 2)]) := by
  refine ⟨by decide, ?_⟩
  refine .map (fun _ _ _ _ h => nomatch h) (fun _ _ _ h => nomatch h) ?_ (fun h => nomatch h)
  intro s hs k x hm
  cases hs
  simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
  rcases hm with ⟨-, rfl⟩ | ⟨-, rfl⟩ <;> exact .integer

/-- `{a: integer, &: string}` refuses `{"a": 1}`: the spread holds the
declared key as well. -/
example : ¬ Instance .empty (.map [("a", false, .integer)] (some .string) false)
    (.map [("a", .integer 1)]) := by
```

Write `spreads.aontu`:

<!-- test: scenario spreads -->
<!-- test: file spreads.aontu -->
```aontu
every: { &: integer } & { a:1 b:2 }
declared: { a:number &: integer }
```

and run it:

<!-- test: run -->
```sh
$ aontu -c spreads.aontu
{"declared":{&:integer,"a":integer},"every":{&:integer,"a":1,"b":2}}
```

The spread holds every member, `a` and `b` alike, and stays, so a
member that comes later must be an integer too. It holds a declared key
as well: at `declared`, `a` is `number & integer`, which is `integer`.

The fourth premise is the seal. A sealed map holds no key it doesn't
declare, and leaves an absent optional key alone:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `close({a: integer})` refuses `{"a": 1, "b": 2}`: `b` is not declared. -/
example : ¬ Instance .empty (.map [("a", false, .integer)] none true)
    (.map [("a", .integer 1), ("b", .integer 2)]) := by
  rintro ⟨-, h⟩
  cases h with
  | map _ _ _ hc =>
    obtain ⟨o, v, hm⟩ := hc rfl "b" (.integer 2) (by simp)
    simp at hm

/-- `close({a?: integer})` admits `{}`. -/
example : Instance .empty (.map [("a", true, .integer)] none true) (.map []) :=
  ⟨by decide, .map (fun _ _ _ _ _ hx => nomatch hx)
    (fun _ _ _ hm _ => by cases List.mem_singleton.mp hm; rfl)
    (fun _ h => nomatch h) (fun _ _ _ h => nomatch h)⟩
```

Write `closed.aontu`:

<!-- test: scenario closed -->
<!-- test: file closed.aontu -->
```aontu
given: close({ a?:integer }) & { a:1 }
absent: close({ a?:integer }) & {}
```

and run it:

<!-- test: run -->
```sh
$ aontu -c closed.aontu
{"absent":{"a"?:integer},"given":{"a":1}}
```

A sealed map admits the keys it declares whether the data gives them
or not. What it refuses is a key it doesn't declare, which is the
point of a seal. Write `sealed.aontu`:

<!-- test: file sealed.aontu -->
```aontu
v: close({ a:integer })
```

and `sealed-data.aontu`:

<!-- test: file sealed-data.aontu -->
```aontu
v: { a:1 b:2 }
```

Now vet the data against the schema:

<!-- test: run -->
```sh
$ aontu vet sealed.aontu sealed-data.aontu
verdict: invalid

$.v.b: closed [conflict]
  [aontu/closed]: Cannot resolve value at path $.v.b
  data: sealed-data.aontu:1:12 (2)
$ echo $?
1
```

The finding is at `$.v.b`, the key the seal doesn't declare. `close()`
seals the map it wraps and every map beneath it, and the definition
holds each map's seal in its own `closed` flag.

### Lists

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- A list: each of its positions is present and holds its value;
  later elements are allowed, but in a sealed list without a spread,
  whose length is its positions'; the spread holds every element. It
  refuses a value that is no list, and a list that breaks any one of
  those. -/
  | list {items : List Val} {spread : Option Val} {closed : Bool} {xs : List Data} :
      items.length ≤ xs.length →
      (closed = true → spread = none → xs.length = items.length) →
      (∀ (i : ℕ) (v : Val) (x : Data), items[i]? = some v → xs[i]? = some x →
        Judge env root true v x) →
      (∀ s, spread = some s → ∀ x, x ∈ xs → Judge env root true s x) →
      Judge env root true (.list items spread closed) (.list xs)
```

`items[i]?` is the item at position `i`, or `none` past the end, and
`closed` is the list's seal, which step 12 takes up. A list refuses a
value that is no list, and a list that breaks any one of the four:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | listNot {items : List Val} {spread : Option Val} {closed : Bool} {j : Data} :
      (∀ xs, j ≠ .list xs) → Judge env root false (.list items spread closed) j
  | listShort {items : List Val} {spread : Option Val} {closed : Bool} {xs : List Data} :
      xs.length < items.length → Judge env root false (.list items spread closed) (.list xs)
  | listLong {items : List Val} {spread : Option Val} {closed : Bool} {xs : List Data} :
      closed = true → spread = none → xs.length ≠ items.length →
      Judge env root false (.list items spread closed) (.list xs)
  | listItem {items : List Val} {spread : Option Val} {closed : Bool} {xs : List Data}
      {i : ℕ} {v : Val} {x : Data} :
      items[i]? = some v → xs[i]? = some x → Judge env root false v x →
      Judge env root false (.list items spread closed) (.list xs)
  | listSpread {items : List Val} {spread : Option Val} {closed : Bool} {xs : List Data}
      {s : Val} {x : Data} :
      spread = some s → x ∈ xs → Judge env root false s x →
      Judge env root false (.list items spread closed) (.list xs)
```

So `[integer, string]`, unsealed, needs two elements and allows more:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `[integer, string]` admits `[1, "a", true]`: the list stays open. -/
example : Instance .empty (.list [.integer, .string] none false) (.list [.integer 1, .str "a", .bool true]) := by
  refine ⟨by decide, ?_⟩
  refine .list (by decide) (fun h => nomatch h) ?_ (fun _ h => nomatch h)
  intro i v x hv hx
  rcases i with _ | _ | i
  · cases hv; cases hx; exact .integer
  · cases hv; cases hx; exact .string (by decide)
  · simp at hv

/-- `[integer, string]` refuses `[1]`: its second position is missing. -/
example : ¬ Instance .empty (.list [.integer, .string] none false) (.list [.integer 1]) := by
  rintro ⟨-, h⟩
  cases h with
  | list hlen _ _ _ => exact absurd hlen (by decide)

/-- `[&: integer]` refuses `[1, "a"]`: the spread holds every element. -/
example : ¬ Instance .empty (.list [] (some .integer) false) (.list [.integer 1, .str "a"]) := by
```

The formatter separates list elements with spaces. Write
`lists.aontu`:

<!-- test: scenario lists -->
<!-- test: file lists.aontu -->
```aontu
open: [integer string] & [1 "a" true]
every: [&: integer] & [1 2 3]
```

and run it:

<!-- test: run -->
```sh
$ aontu -c lists.aontu
{"every":[&:integer,1,2,3],"open":[1,"a",true]}
```

The list stays open, so it admits `true`, past its two positions. The
spread holds every element, and stays, as a map's does.

## 7. Conjunction

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- A meet admits what both sides admit, and refuses what either
  refuses. -/
  | meet {a b : Val} {j : Data} :
      Judge env root true a j → Judge env root true b j → Judge env root true (.meet a b) j
  | meetLeft {a b : Val} {j : Data} : Judge env root false a j → Judge env root false (.meet a b) j
  | meetRight {a b : Val} {j : Data} : Judge env root false b j → Judge env root false (.meet a b) j
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `integer & min(3)` admits `7`. -/
example : Instance .empty (.meet .integer (.min (.num (.integer (.of 3))))) (.integer 7) :=
  ⟨by decide, .meet (.integer) (.min (by decide))⟩

/-- `integer & min(3)` refuses `2`. -/
example : ¬ Instance .empty (.meet .integer (.min (.num (.integer (.of 3))))) (.integer 2) := by
  rintro ⟨-, h⟩
  cases h with
  | meet _ h => cases h with | min h => exact absurd h (by decide)
```

Write `meet.aontu`:

<!-- test: scenario meet -->
<!-- test: file meet.aontu -->
```aontu
seven: integer & min(3) & 7
bounds: min(3) & min(5)
```

and run it:

<!-- test: run -->
```sh
$ aontu -c meet.aontu
{"bounds":min(5),"seven":7}
```

`7` meets both sides, and comes back. Two bounds meet in the tighter:
whatever is at least five is at least three, so `min(3) & min(5)` is
`min(5)`.

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
  /-- An alias judges as its declaration judges. A name with no
  declaration, and a path left unread, refuse every value: the answer
  for a reading the definition was not given, which no verdict reaches,
  since `Vet` refuses a document with an undeclared name as an `error`
  and `VetP` reads every path, in `spec/Aontu/Paths.lean`, before it
  judges. -/
  | alias {b : Bool} {n : String} {v : Val} {j : Data} :
      env n = some v → Judge env root b v j → Judge env root b (.alias n) j
  | aliasNone {n : String} {j : Data} : env n = none → Judge env root false (.alias n) j
  | path {p : List Seg} {j : Data} : Judge env root false (.path p) j
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
example : Instance envT T (.map [("n", .map [("v", .integer 1)])]) := by
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{"v": "x"}` is not: no derivation exists. -/
example : ¬ Instance envT T (.map [("v", .str "x")]) := by
```

The proof that `{"n": {"v": 1}}` is a `%T` holds a proof that
`{"v": 1}` is one, whose `n` is absent and whose `v` is an integer. A
value is finite, so the derivation stops where the data stops. Write
`tree.aontu`:

<!-- test: scenario tree -->
<!-- test: file tree.aontu -->
```aontu
%T = { n?:%T v?:integer }
tree: %T & { n:v:1 }
```

and run it:

<!-- test: run -->
```sh
$ aontu -c tree.aontu
{"tree":{"n":{"n"?:%T,"v":1},"v"?:integer}}
```

The meet gives the tree back, `v` holding its `1` inside `n`, and `-c`
shows the optional keys still declared at each level: the alias reaches
only as far as the data goes.

An alias the document doesn't declare has no term, so no rule
applies:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x: %U}` refuses `{"x": 1}`: `%U` is declared nowhere. -/
example : ¬ Instance .empty (.map [("x", false, .alias "U")] none false) (.map [("x", .integer 1)]) := by
```

The engine can't resolve such an alias at all, and refuses the whole
document as a schema it can't use.

### The graph of names

A document declares its aliases in the order written, and
`spec/Aontu/Names.lean` reads the declarations as a list whose
environment is the `env` the rules take:

<!-- test: quote spec/Aontu/Names.lean -->
```lean
/-- The declarations of a document: `%T = v` is the pair `("T", v)`, in
the order written. A name declared twice is declared as the meet of its
declarations. -/
abbrev Decls := List (String × Val)
```

<!-- test: quote spec/Aontu/Names.lean -->
```lean
/-- The environment the declarations make: a name's value is the meet
of its bodies, and an undeclared name has none. -/
def env (ds : Decls) : Env := fun n =>
  match ds.bodies n with
  | [] => none
  | v :: vs => some (vs.foldl .meet v)
```

The declarations make a graph, where a name refers to every name in
its bodies, and a recursive name is one that refers to itself through
any number of declarations:

<!-- test: quote spec/Aontu/Names.lean -->
```lean
/-- `a` refers to `b`: `b` stands somewhere in a body declared for `a`. -/
def Refers (ds : Decls) (a b : String) : Prop := ∃ v, v ∈ ds.bodies a ∧ b ∈ v.refs
```

<!-- test: quote spec/Aontu/Names.lean -->
```lean
/-- A recursive name refers to itself, through any number of
declarations: `%N = {n: integer, next?: %N}` declares one, and so do
`%A = {b?: %B}` and `%B = {a?: %A}` each other. -/
def Recursive (ds : Decls) (n : String) : Prop := Relation.TransGen ds.Refers n n
```

`%T` above is recursive through the key `n`, so every turn of the
recursion consumes a level of the data, which is why its derivations
stop where the data stops. A name can also refer to itself with
nothing between: `%U = %U` does, and so do `%T = %T & integer` through
`&` and `%T = %T | 1` through `|`. The alias-cycle rule refuses these.
It reads the names a value reaches without passing through a key or an
element:

<!-- test: quote spec/Aontu/Names.lean -->
```lean
/-- The names a value refers to with no key and no element between:
through `&`, `|`, `*` and `len`, and through the count and the
branches of a trial, which hold the whole of a value, and never through
a container's members or spread, nor through the term `contains` tries
on each member, nor through a cover's `keys` or `members` or the term
`rest` holds the rest to, though through a cover's `if`, tried on the
whole, and through every argument of `match` and `filter`, which select
by a value. -/
def Val.unguardedRefs : Val → List String
```

and asks that no name reach itself that way:

<!-- test: quote spec/Aontu/Names.lean -->
```lean
/-- The alias-cycle rule: no name refers to itself with no key and no
element between, so that every recursion consumes data. `%U = %U`,
`%T = %T & integer` and `%T = %T | 1` break it; `%N = {n: integer,
next?: %N}` keeps it. -/
def Guarded (ds : Decls) : Prop := ∀ n, ¬ Relation.TransGen ds.RefersUnguarded n n
```

Both relations are transitive closures, and `close` computes them by
rounds, each round adding every name reached from a name it holds,
until a round adds nothing:

<!-- test: quote spec/Aontu/Names.lean -->
```lean
/-- The closure of `seen` under `succ`, in at most `k` rounds. -/
def close (succ : String → List String) : ℕ → List String → List String
  | 0, seen => seen
  | k + 1, seen =>
    if closeStep succ seen = seen then seen else close succ k (closeStep succ seen)
```

With more rounds than there are names, a round that adds nothing must
come, since a list of distinct names is no longer than the list of all
names, which is the pigeonhole `length_le_of_nodup` proves. So the
computed answers are the relations' own:

<!-- test: quote spec/Aontu/Names.lean -->
```lean
theorem recursiveB_iff {ds : Decls} {n : String} : ds.recursiveB n = true ↔ ds.Recursive n := by
```

<!-- test: quote spec/Aontu/Names.lean -->
```lean
theorem guardedB_iff {ds : Decls} : ds.guardedB = true ↔ ds.Guarded := by
```

The tour decides the examples with them. `%N = {n: integer, next?:
%N}` is recursive and keeps the rule:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `%N = {n: integer, next?: %N}`, as a document declares it. -/
abbrev declsN : Decls := [("N", .map [("n", false, .integer), ("next", true, .alias "N")] none false)]

/-- `N` refers to itself, so it is recursive… -/
example : declsN.Recursive "N" := Decls.recursiveB_iff.mp (by decide)

/-- …through the key `next`, so the declarations keep the alias-cycle
rule: every cycle of names passes through a key or an element. -/
example : declsN.Guarded := Decls.guardedB_iff.mp (by decide)
```

`%U = %U` breaks it, and admits nothing:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `%U = %U` refers to itself with nothing between, which the rule
refuses… -/
example : ¬ Decls.Guarded [("U", .alias "U")] := fun h =>
  nomatch (by decide : Decls.guardedB [("U", .alias "U")] = false).symm.trans (Decls.guardedB_iff.mpr h)

/-- …and it admits nothing: a derivation would have to begin with
another. -/
example : ¬ Admits (Decls.env [("U", .alias "U")]) .null (.alias "U") (.integer 1) :=
  Decls.alias_self_admits_nothing
```

The second is a theorem about any environment, not a computation: a
derivation of what `%U` admits, or of what it refuses, would have to
begin with a derivation of the same, so none is finite.

<!-- test: quote spec/Aontu/Names.lean -->
```lean
/-- A name declared as itself alone judges nothing, so it admits nothing
and refuses nothing: a derivation of either would have to begin with
another, so none is finite. -/
theorem alias_self_judges_nothing {env : Env} {root : Data} {b : Bool} {n : String} {j : Data}
    (h : env n = some (.alias n)) : ¬ Judge env root b (.alias n) j := by
```

`%T = %T | 1` breaks the rule too, though its second arm admits `1`:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `%T = %T | 1` breaks the rule too, through `|`… -/
abbrev declsT : Decls := [("T", .or [(0, .alias "T"), (0, .lit (.num (.integer (.of 1))))])]

example : ¬ declsT.Guarded := fun h =>
  nomatch (by decide : declsT.guardedB = false).symm.trans (Decls.guardedB_iff.mpr h)

/-- …though it admits `1`, by its second arm: the engines run it, and
the rule refuses it. -/
example : Admits declsT.env .null (.alias "T") (.integer 1) :=
  .alias rfl (.or (List.mem_cons_of_mem _ (List.mem_singleton.mpr rfl)) .num)
```

Now the engines. Write `list-schema.aontu`:

<!-- test: scenario names -->
<!-- test: file list-schema.aontu -->
```aontu
%N = { n:integer next?:%N }
v: %N
```

with `list-data.aontu`, three levels deep:

<!-- test: file list-data.aontu -->
```aontu
v: { n:1 next: { n:2 next:n:3 } }
```

and `list-bad.aontu`, wrong at the second:

<!-- test: file list-bad.aontu -->
```aontu
v: { n:1 next:n:"x" }
```

Then one document for each way of breaking the rule, `self-schema.aontu`:

<!-- test: file self-schema.aontu -->
```aontu
%U = %U
v: %U
```

`pair-schema.aontu`:

<!-- test: file pair-schema.aontu -->
```aontu
%A = %B
%B = %A
v: %A
```

and `arm-schema.aontu`:

<!-- test: file arm-schema.aontu -->
```aontu
%T = %T|1
v: %T
```

with `one.aontu` to vet them against:

<!-- test: file one.aontu -->
```aontu
v: 1
```

Run them:

<!-- test: run -->
```sh
$ aontu vet list-schema.aontu list-data.aontu
verdict: valid
$ aontu vet list-schema.aontu list-bad.aontu
verdict: invalid

$.v.next.n: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.v.next.n
  data: list-bad.aontu:1:17 ("x")
  schema: list-schema.aontu:1:10 (integer)
$ echo $?
1
$ aontu vet self-schema.aontu one.aontu
verdict: invalid

$.v: unify_cycle [budget]
  [aontu/unify_cycle]: Cannot unify values at path $.v
  data: one.aontu:1:4 (1)
  schema: self-schema.aontu:1:6 (%U)
$ echo $?
1
$ aontu vet pair-schema.aontu one.aontu
verdict: error

$.%A: path_cycle [reference]
  [aontu/path_cycle]: Cannot resolve value at path $.%A
  schema: pair-schema.aontu:1:6 (nil)
$ echo $?
4
$ aontu vet arm-schema.aontu one.aontu
verdict: valid
```

Both engines check the recursive list at every level. `%U = %U` they
refuse by running out of steps, and the pair as a cycle of references,
where the rule reads both as the same ill-formed document. `%T = %T |
1` they run, and `1` passes by its second arm, where the rule refuses
the document. Step 14's `vet` answers `error` for all three, and the
ledger of step 15 carries `%U = %U`, where the engines move.

### How a document reads

A document reads as its expansion, in `spec/Aontu/Alias.lean`: a
reference to a name that is not recursive is replaced by the meet of
the name's bodies, read the same way, and a reference to a recursive
name stays as written, a residual.

<!-- test: quote spec/Aontu/Alias.lean -->
```lean
/-- The expansion of a term, within `k` turns: a reference to a name
that is not recursive is replaced by the meet of its bodies, expanded in
turn; a reference to a recursive name, or to no name, stays. -/
def expandF (ds : Decls) : ℕ → Val → Val
```

A residual is where the data decides. The meet of step 10 gains one
rule: a residual met with concrete structure, a scalar, a kind, a
bound, a literal, a map or a list, expands by one level, and met with
`any`, another reference or a connective it stays. So a recursion
unfolds as far as the data goes and no further, and a residual no data
reaches generates nothing, as step 13 says of an alias.

<!-- test: quote spec/Aontu/Alias.lean -->
```lean
/-- Whether a term is concrete structure, which a residual expands
against: everything but `any`, `nil`, a reference and a connective. -/
def Val.concrete : Val → Bool
```

<!-- test: quote spec/Aontu/Alias.lean -->
```lean
/-- A step of the meet with the declarations: a residual against
concrete structure expands by one level, and every other pair takes a
step of the meet. -/
def meetStepA (ds : Decls) (rec : Val → Val → Val) (a b : Val) : Val :=
```

The meet so built admits what both of its sides admit, under the
environment of expanded bodies, which is what admits it:

<!-- test: quote spec/Aontu/Alias.lean -->
```lean
theorem admits_meetD {ds : Decls} {root : Data} (a b : Val) (j : Data) :
    Admits ds.envE root (meetD ds a b) j ↔ Admits ds.envE root a j ∧ Admits ds.envE root b j :=
  admits_meetA _ a b j
```

Step 14's `vet` reads a document this way, and the sixth generated
fragment, [`test/spec/def-alias.tsv`](../test/spec/def-alias.tsv),
runs documents with declarations in the three modes, recursive names
among them. Both engines agree with the definition on every row but
`%U = %U` and `%T = %T | 1`, which the ledger carries. A recursive
name met with data has its rows because the checker of step 17 reads a
residual.

## 9. Path references

A path names a part of a value, step by step:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- A step of a path: a member's key, or a position in a list. -/
inductive Seg where
  | key (k : String)
  | idx (i : ℕ)
```

A path in a document reads as what the document holds at that position,
the data unified in: `x: $.y` with `y: integer & 1` makes `x` the value
`1`. `spec/Aontu/Paths.lean` reads it by declaration. Each path a
document writes becomes a name, declared as the term at the path in the
root, the normal form of the schema met with the data, and the document
refers to the name in its place, so that the expansion, the residuals,
the checker and the alias-cycle rule of step 8 carry paths as they
carry names. The term at a path is found through maps by key and lists
by index, and through nothing else: not a disjunction, and not a
reference left as a residual.

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- The term at a path in a term: through maps by key and lists by
index, and through nothing else. -/
def Val.at : Val → List Seg → Option Val
  | v, [] => some v
  | .map fs _ _, .key k :: p =>
    match fs.find? (fun f => f.1 == k) with
    | some f => f.2.2.at p
    | none => none
  | .list items _ _, .idx i :: p =>
    match items[i]? with
    | some w => w.at p
    | none => none
  | _, _ => none
```

A path resolves in the schema's own tree, before any data: a key the
data alone supplies is no position, and a path to nothing is an
`error`. The term it reads is then taken from the root, data and all:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- Every path of the document resolves in the schema's own tree. -/
def Decls.Resolves (ds : Decls) (S : Val) : Prop :=
  ∀ p, p ∈ ds.docPaths S → ((normaliseD ds (ds.read S)).at p).isSome = true
```

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- The declarations a document's paths make: each path's name, declared
as the term at the path in the root, with that term's own paths read as
names too. A path to nothing declares nothing. -/
def Decls.ofPaths (root : Val) (ps : List (List Seg)) : Decls :=
  ps.filterMap fun p => (root.at p).map fun w => (pathName p, w.pathsToAliases)
```

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- The document with its paths read as names from a root: each path is
declared as the term at it, and the bodies and the schema refer to the
names. -/
def Decls.withPathsFrom (ds : Decls) (S : Val) (root : Val) : Decls × Val :=
  (ds.map (fun d => (d.1, d.2.pathsToAliases)) ++ Decls.ofPaths root (ds.docPaths S), S.pathsToAliases)
```

Two roots serve: the schema alone, for the error class, and the schema
met with the data, for the rest. A contradiction the data brings, `a: 1`
met with `"a": 2` where `b: $.a` reads it, is the data's fault, invalid,
and not an ill-formed schema:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- The document with its paths read as names from the schema alone:
the root is the normal form of the schema as read, before any data,
which is what the error class is judged on. -/
def Decls.withPathsS (ds : Decls) (S : Val) : Decls × Val :=
  ds.withPathsFrom S (normaliseD ds (ds.readR S))
```

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- The document with its paths read as names from the data too: the
root is the normal form of the schema met with the data, which is what
the other classes are judged on. -/
def Decls.withPaths (ds : Decls) (S : Val) (j : Data) : Decls × Val :=
  ds.withPathsFrom S (normaliseD ds (meetD ds (ds.readR S) j.term))
```

The verdict of a document with paths is then the verdict of step 14 on
the document with its paths read as names:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- The verdict of a document with paths. It is an `error` where a path
does not resolve in the schema's own tree, or where the document is an
error with its paths read from the schema alone: a name declared
nowhere, a cycle, a `nil` in the schema. Otherwise the paths read from
the data too, and the document is `invalid` where that reading is dead
or an error, since the data made it so, and `valid` or `incomplete` as
that reading is. -/
def VetP (m : Mode) (ds : Decls) (S : Val) (j : Data) : Verdict → Prop
  | .error => ¬ ds.Resolves S ∨ Vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j .error
  | .invalid =>
    ds.Resolves S ∧ ¬ Vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j .error ∧
      (Vet m (ds.withPaths S j).1 (ds.withPaths S j).2 j .invalid ∨
        Vet m (ds.withPaths S j).1 (ds.withPaths S j).2 j .error)
  | v =>
    ds.Resolves S ∧ ¬ Vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j .error ∧
      Vet m (ds.withPaths S j).1 (ds.withPaths S j).2 j v
```

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- `vetP` computes `VetP` on every document whose bodies and schema
read no pattern and no format. -/
theorem vetP_iff {m : Mode} {ds : Decls} {S : Val} {j : Data} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) (v : Verdict) : vetP m ds S j = v ↔ VetP m ds S j v := by
```

A recursive position, `then?: $.schema.Step` inside `Step`, is a name
that refers to itself through a key, a residual that expands against
the data as far as the data goes, exactly as a recursive alias does. A
document that refers only to itself through its paths, `{a: $.b, b: $.a}`,
breaks the alias-cycle rule and is an `error`.

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x: $.y, y: integer}`. -/
abbrev refDoc (y : Val) : Val := .map [("x", false, .path [.key "y"]), ("y", false, y)] none false
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `$.y` is declared as what the document holds at `y`: under
`{"x": 1, "y": 1}` that is `integer & 1`, and the document is valid. -/
example : vetP {} [] (refDoc .integer) (.map [("x", .integer 1), ("y", .integer 1)]) = .valid := by decide
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- Under `{"x": 1, "y": 2}` it is `2`, which `x: 1` refuses. -/
example : vetP {} [] (refDoc .integer) (.map [("x", .integer 1), ("y", .integer 2)]) = .invalid := by decide
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x: $.y, y: any}` admits `{"x": {"a": 1, "b": 2}, "y": {"b": 2, "a": 1}}`:
the two maps have the same members. -/
example : vetP {} [] (refDoc .any)
    (.map [("x", .map [("a", .integer 1), ("b", .integer 2)]), ("y", .map [("b", .integer 2), ("a", .integer 1)])]) =
      .valid := by decide
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- A path to nothing is an error: `{x: $.z, y: integer}`. -/
example : vetP {} [] (.map [("x", false, .path [.key "z"]), ("y", false, .integer)] none false)
    (.map [("x", .integer 1), ("y", .integer 1)]) = .error := by decide
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- A document that reads only by its own paths is an error: `{a: $.b, b: $.a}`. -/
example : vetP {} [] (.map [("a", false, .path [.key "b"]), ("b", false, .path [.key "a"])] none false)
    (.map [("a", .integer 1), ("b", .integer 1)]) = .error := by decide
```

The seventh generated fragment,
[`test/spec/def-path.tsv`](../test/spec/def-path.tsv), runs documents
with paths in the three modes, a path into a list, through an alias,
against a default, a spread of a path, a recursive position and its
cycles among them.

Write `refs.aontu`:

<!-- test: scenario refs -->
<!-- test: file refs.aontu -->
```aontu
x: $.y
y: integer & 1
```

and run it:

<!-- test: run -->
```sh
$ aontu -c refs.aontu
{"x":1,"y":1}
```

`x` holds what the whole value holds at `y`. Two maps are one value
whatever order their members come in. Write `members.aontu`:

<!-- test: scenario members -->
<!-- test: file members.aontu -->
```aontu
x: $.y & { a:1 b:2 }
y: { b:2 a:1 }
```

and run it:

<!-- test: run -->
```sh
$ aontu -c members.aontu
{"x":{"a":1,"b":2},"y":{"a":1,"b":2}}
```

`x` meets the map at `y` with a map listing the same members in the
other order, and the meet gives one value back.

## 10. The order, and the meet

`spec/Aontu/Order.lean` orders terms by what they admit:

<!-- test: quote spec/Aontu/Order.lean -->
```lean
/-- Every value `a` admits, `b` admits, each taken whole. -/
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
example : .meet .integer (.min (.num (.integer (.of 3)))) ⊑[.empty] .integer := meet_le_left _ _ _

/-- `integer & min(3)` is not above `integer`: `2` is the instance that
shows it. -/
example : ¬ (.integer ⊑[.empty] .meet .integer (.min (.num (.integer (.of 3))))) := by
  intro h
  cases (h (.integer 2) ⟨by decide, .integer⟩).2 with
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

### The meet, computed

The three theorems say what `a & b` admits and nothing about its
shape, and the engines give a shape back: `{x: 1} & {y: 2}` comes back
as `{x: 1, y: 2}`, and `(min(5) & max(3)) | 1` as `1`.
`spec/Aontu/Meet.lean` computes that shape too, one step at a time,
with `rec` the meet of the smaller terms and `lm` the meet of a literal
with a term:

<!-- test: quote spec/Aontu/Meet.lean -->
```lean
def meetStep (lm : Scalar → Val → Val) (rec : Val → Val → Val) (a b : Val) : Val :=
  match a, b with
  | .nil, _ | _, .nil => .nil
  | .meet a₁ a₂, b => rec a₁ (rec a₂ b)
  | a, .meet b₁ b₂ => meetRight rec a b₁ b₂
  | .or arms, b => mkOr (arms.map fun p => (p.1, rec p.2 b))
  | a, .or arms => mkOr (arms.map fun p => (p.1, rec a p.2))
  | .pref r x, b => mkOr [(r, rec x b), (0, rec x.super b)]
  | a, .pref r y => mkOr [(r, rec a y), (0, rec a y.super)]
  | .map fs₁ s₁ c₁, .map fs₂ s₂ c₂ => meetMap rec fs₁ s₁ c₁ fs₂ s₂ c₂
  | .any, .map fs s c => meetMap rec [] none false fs s c
  | .map fs s c, .any => meetMap rec fs s c [] none false
  | .list is₁ s₁ c₁, .list is₂ s₂ c₂ => meetList rec is₁ s₁ c₁ is₂ s₂ c₂
  | .any, .list items s c => meetList rec [] none false items s c
  | .list items s c, .any => meetList rec items s c [] none false
  | a, b => meetBase lm a b
```

Read each row as *these two shapes meet in this one*. `nil` is the
zero: it admits nothing, so nor does any meet with it. A meet on either
side is met one side at a time, and on the right `meetRight` tries each
atom against each other once: `a` meets `b₁`, and where the two had
nothing to say to each other, such as `min(1)` and `max(9)`, `a` meets
`b₂` instead, and the pair is never taken up in another association,
which the two rows would otherwise do without end. A disjunction meets
a peer arm by arm,
and `mkOr` keeps the arms that are live: an arm that admits nothing on
its face, such as `min(5) & max(3)` once computed to `nil`, drops, and
a disjunction with no live arm is `nil`. A preference alone is
`x | super(x)`, as step 12 reads it, so `*8080 & min(1024)` is
`*8080 | (integer & min(1024))`. Two maps merge key by key in
`meetMap`: a key both declare holds the meet of the two values and is
optional only where both say so; a key one side declares alone is met
with the other side's spread; and where the other side is sealed the
key cannot appear, so an optional one drops and a required one holds
`nil`. Two lists merge position by position in `meetList`, and a side
sealed without a spread fixes the length. `any` is the unit of each
container, and what remains, two scalars or constraints, is
`meetBase`: a literal met with a term that admits it is the literal,
and with one that refuses it `nil`, which is `lm`'s to decide, so that
under the declarations of step 8 the checker of step 17 decides it,
names and all; two kinds meet in the lower; two references to one name
are that name; two atoms that can share no value, by their domains or
because their bounds enclose nothing, meet in `nil`; and anything else
stays as written.

A theorem admits the function into the definition:

<!-- test: quote spec/Aontu/Meet.lean -->
```lean
/-- The meet admits what both of its sides admit, which is what admits
`meet` into the definition. -/
theorem admits_meet {env : Env} {root : Data} (a b : Val) (j : Data) :
    Admits env root (meet a b) j ↔ Admits env root a j ∧ Admits env root b j :=
  admits_meetF _ a b j
```

So whatever shape `meet` computes, it admits exactly what the three
theorems settle. The shape is for generation to read, which a later
step states, and admission never depends on it. The proof is by
induction on the budget of steps, one case for each row of `meetStep`,
and the two containers' rows are the long ones.

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x: 1} & {y: 2}` is `{x: 1, y: 2}`. -/
example : meet (.map [("x", false, .lit (.num (.integer (.of 1))))] none false)
    (.map [("y", false, .lit (.num (.integer (.of 2))))] none false) =
    .map [("x", false, .lit (.num (.integer (.of 1)))), ("y", false, .lit (.num (.integer (.of 2))))]
      none false := rfl

/-- `(min(5) & max(3)) | 1` is `1`: the first arm admits nothing, so it
drops. -/
example : meet (.or [(0, .meet (.min (.num (.integer (.of 5)))) (.max (.num (.integer (.of 3))))),
    (0, .lit (.num (.integer (.of 1))))]) .any = .or [(0, .lit (.num (.integer (.of 1))))] := rfl

/-- `*8080 & min(1024)` is `*8080 | (integer & min(1024))`: the preference
widens to its parent type, and each arm meets the bound. -/
example : meet (.pref 1 (.lit (.num (.integer (.of 8080))))) (.min (.num (.integer (.of 1024)))) =
    .or [(1, .lit (.num (.integer (.of 8080)))),
      (0, .meet .integer (.min (.num (.integer (.of 1024)))))] := rfl

/-- `close([1, 2]) & [&: integer]` is `close([1, 2])`: the seal fixes the
length, and each position takes the spread. -/
example : meet (.list [.lit (.num (.integer (.of 1))), .lit (.num (.integer (.of 2)))] none true)
    (.list [] (some .integer) false) =
    .list [.lit (.num (.integer (.of 1))), .lit (.num (.integer (.of 2)))] none true := rfl

/-- `min(5) & max(3)` is `nil`, and so is `min("b") & max("a")`: no value
lies in either interval. -/
example : meet (.min (.num (.integer (.of 5)))) (.max (.num (.integer (.of 3)))) = .nil ∧
    meet (.min (.str "b")) (.max (.str "a")) = .nil := ⟨rfl, rfl⟩

/-- `string & (string & empty())` is `string`: the lower of the two kinds. -/
example : meet .string .anyString = .string := rfl

/-- The computed meet admits what the written one admits, `admits_meet`:
`*8080 & min(1024)`, computed, still admits `2048` and refuses `80`. -/
example : Instance .empty (meet (.pref 1 (.lit (.num (.integer (.of 8080)))))
      (.min (.num (.integer (.of 1024))))) (.integer 2048) ∧
    ¬ Instance .empty (meet (.pref 1 (.lit (.num (.integer (.of 8080)))))
      (.min (.num (.integer (.of 1024))))) (.integer 80) :=
  ⟨⟨by decide, (admits_meet _ _ _).mpr ⟨.prefSuper .integer, .min (by decide)⟩⟩,
    fun ⟨_, h⟩ => by
      cases ((admits_meet _ _ _).mp h).2 with
      | min h => exact absurd h (by decide)⟩
```

Write `meets.aontu`:

<!-- test: scenario meet -->
<!-- test: file meets.aontu -->
```aontu
a: { x:1 } & { y:2 }
b: (min(5) & max(3))|1
c: *8080 & min(1024)
e: { &: { x: *1 } } & { k:y:2 }
```

and run it:

<!-- test: run -->
```sh
$ aontu -c meets.aontu
{"a":{"x":1,"y":2},"b":1,"c":*8080,"e":{&:{"x":*1},"k":{"x":*1,"y":2}}}
```

Each key comes back as the meet computes it: `b` as `1`, its dead arm
dropped, and `e` with the spread's default `{x: *1}` met into `k`. The
engines keep `c` as written, `*8080`, where the definition writes its
two arms out; both single out `8080`, as step 12's `port` says. A meet
that is `nil` outright, such as `min(5) & max(3)` alone, comes back as
an error, a schema with no value, of the kind step 15 shows.

### The table, and the profiles

The reference's table of subsumption rules, "Rules, by value former",
is a set of theorems in `spec/Aontu/Subsume.lean`, each a fact of the
order. Two kinds are below each other only when they are one kind:

<!-- test: quote spec/Aontu/Subsume.lean -->
```lean
theorem leaf_le_leaf_iff (l m : Leaf) : l.kind ⊑[env] m.kind ↔ l = m := by
```

A disjunction on the specific side is below a value exactly when every
arm is, which is the table's "every specific alternative must be
admitted":

<!-- test: quote spec/Aontu/Subsume.lean -->
```lean
theorem or_le_iff {arms : List (ℕ × Val)} {b : Val} :
    .or arms ⊑[env] b ↔ ∀ r a, (r, a) ∈ arms → a ⊑[env] b := by
```

And one row the table overstates. `string` does not cover every
pattern, since a pattern may match `""`, which `string` refuses:

<!-- test: quote spec/Aontu/Subsume.lean -->
```lean
theorem re_not_le_string {p : String} (h : host.pattern p "") : ¬ (.re p ⊑[env] .string) := by
```

`aontu subsume` answers under one of three profiles, and each is a
contract on the order. `values` is `Le`. `defaults` asks more: at every
position where the specific side singles out a value, the general side
must single out the same one.

<!-- test: quote spec/Aontu/Subsume.lean -->
```lean
def DefaultsLe (env : Env) (a b : Val) : Prop :=
  a ⊑[env] b ∧
    ∀ (p : List Seg) (wa wb : Val), (normalise a).at p = some wa → (normalise b).at p = some wb →
      ∀ (root j : Data), Output env root wa j → Output env root wb j
```

`*2 | number` and `*1 | number` admit the same numbers, so the first
is below the second in the order, and `defaults` tells them apart,
since the first singles out `2` where the second singles out `1`:

<!-- test: quote spec/Aontu/Subsume.lean -->
```lean
theorem defaults_sees_the_default :
```

`gen` asks that, and that the marks agree. The marks are not terms of
the definition yet, so they enter its contract as a predicate, as the
patterns enter `Admits` through `host`.

The order has rows of its own, `test/spec/def-subsume.tsv`: every pair
of fifty values, the general first, with the answers the `values`
contract allows. `leDecF` decides the order with its proof where the
scalars and the connectives decide it, so its answer is the
definition's own, and an instance that one value admits and the other
refuses refutes it:

<!-- test: quote spec/Aontu/Subsume.lean -->
```lean
theorem not_le_of_witness {s g : Val} {j : Data} (hs : s.Checkable) (hg : g.Checkable)
    (hj : j.WellFormed) (h1 : check s j = true) (h2 : check g j = false) : ¬ s ⊑[env] g := by
```

A pair neither decides has no row, and since an engine may answer
`undecided` anywhere, a row allows it beside the answer the definition
gives.

The containers follow the members. A map on the general side is above
a map on the specific side when each key it declares, the specific side
declares too, with a value below it and required where the general
side requires it; a sealed general side asks the specific side to be
sealed and to declare no key it does not:

<!-- test: quote spec/Aontu/Subsume.lean -->
```lean
theorem map_le {fsg fss : List (String × Bool × Val)} {sps : Option Val} {cs cg : Bool}
    (hk : ∀ k og vg, (k, og, vg) ∈ fsg →
      ∃ os vs, (k, os, vs) ∈ fss ∧ vs ⊑[env] vg ∧ (og = false → os = false))
    (hc : cg = true → cs = true ∧ ∀ k os vs, (k, os, vs) ∈ fss → ∃ og vg, (k, og, vg) ∈ fsg) :
    .map fss sps cs ⊑[env] .map fsg none cg := by
```

The members are judged under the root of the whole document, and
`Le` speaks of instances, each its own root, so the proof rests on
`judge_root` in `spec/Aontu/Admits.lean`: no rule reads the root, and
a judgement under one root is a judgement under any. `list_le` does the
same for lists, position by position, and `leDecF` decides both.

## 11. Two declarations of one key

When a document declares one key twice, the engine merges the two
declarations into one. A theorem states that the merge loses nothing
and adds nothing:

<!-- test: quote spec/Aontu/Order.lean -->
```lean
theorem merge_exact (env : Env) (root : Data) (k : String) (o₁ o₂ : Bool) (v₁ v₂ : Val)
    (j : Data) :
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
    (.map []) := by
```

Write `merge.aontu`:

<!-- test: scenario merge -->
<!-- test: file merge.aontu -->
```aontu
v: { x?:integer } & { x:integer }
```

and run it:

<!-- test: run -->
```sh
$ aontu -c merge.aontu
{"v":{"x":integer}}
```

One side makes `x` optional and the other required, and the required
one wins: `-c` writes the merged key with no `?`.

## 12. Disjunction and preference

`a | b` admits what either arm admits, and `*x` marks a default:

<!-- test: quote spec/Aontu/Syntax.lean -->
```lean
  | or (arms : List (ℕ × Val))              -- `a | *b | **c`: each arm with its rank, `0` for none
  | pref (r : ℕ) (x : Val)                  -- `*x` alone, which is `x | super(x)`; `**x` has rank 2
```

An arm carries a rank: `0` for an arm written plainly, `1` for one
written `*a`, `2` for `**a`. The rank picks the output, which step 19
leaves to a later phase, and admission ignores it:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- A disjunction admits what any arm admits, whatever the arm's
  rank: a rank picks the output, which is no part of admission. It
  refuses what every arm refuses. -/
  | or {arms : List (ℕ × Val)} {r : ℕ} {a : Val} {j : Data} :
      (r, a) ∈ arms → Judge env root true a j → Judge env root true (.or arms) j
  | orNone {arms : List (ℕ × Val)} {j : Data} :
      (∀ r a, (r, a) ∈ arms → Judge env root false a j) → Judge env root false (.or arms) j
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `1 | 2`, as a term: two arms, neither preferred. -/
abbrev oneOrTwo : Val := .or [(0, .lit (.num (.integer (.of 1)))), (0, .lit (.num (.integer (.of 2))))]

/-- `1 | 2` admits `2`, by its second arm. -/
example : Instance .empty oneOrTwo (.integer 2) := ⟨by decide, .or (r := 0) (by simp [Integer.of]) .num⟩

/-- `1 | 2` refuses `3`. -/
example : ¬ Instance .empty oneOrTwo (.integer 3) :=
  fun ⟨_, h⟩ => absurd ((check_iff (checkable_or₂ .lit .lit) _).mpr h) (by decide)

/-- `*1 | 2`: the first arm preferred, which admission ignores. -/
abbrev prefOneOrTwo : Val := .or [(1, .lit (.num (.integer (.of 1)))), (0, .lit (.num (.integer (.of 2))))]

/-- `*1 | 2` admits `2`, and refuses `3`: a preferred arm admits its own
value, as any arm does. -/
example : Instance .empty prefOneOrTwo (.integer 2) ∧ ¬ Instance .empty prefOneOrTwo (.integer 3) :=
  ⟨⟨by decide, .or (r := 0) (by simp [Integer.of]) .num⟩,
    fun ⟨_, h⟩ => absurd ((check_iff (checkable_or₂ .lit .lit) _).mpr h) (by decide)⟩
```

`abbrev` names a term for the examples that follow. Write
`choice.aontu`:

<!-- test: scenario choice -->
<!-- test: file choice.aontu -->
```aontu
enum: ("a"|"b"|"c") & "b"
kind: (integer|string) & "a"
override: (*1|integer) & 3
```

and run it:

<!-- test: run -->
```sh
$ aontu -c choice.aontu
{"enum":"b","kind":"a","override":3}
```

Each meet selects the arm that admits the value. At `override`, `3` is
no `1`, and the `integer` arm admits it. A value no arm admits is
refused. Write `choice-schema.aontu`:

<!-- test: file choice-schema.aontu -->
```aontu
v: *1|2
```

and `choice-data.aontu`:

<!-- test: file choice-data.aontu -->
```aontu
v: 3
```

Now vet the data against the schema:

<!-- test: run -->
```sh
$ aontu vet choice-schema.aontu choice-data.aontu
verdict: invalid

$.v: empty [conflict]
  [aontu/empty]: Cannot unify values at path $.v
  data: choice-data.aontu:1:4 (3)
  schema: choice-schema.aontu:1:4 (*1|2)
$.v: pref_not_instance [compat]
  the default 1 is not an instance of any remaining alternative of *1|2
  schema: choice-schema.aontu:1:5 (1)
$ echo $?
1
```

The first finding is the refusal: no arm is left. The second is a note
on the default, which admission doesn't read.

### How a disjunction reads its arms

The language reads `|` and `*` by position, and the reader carries the
reading into the terms:

<!-- test: quote spec/Aontu/Syntax.lean -->
```lean
/-! The language reads `|` and `*` by position, and the reader, not a
rule, carries the reading into the terms: an arm of a disjunction, and
the value of a `*` alone, which is a disjunction too, reads every list
literal beneath it as its own length, a sealed list, and `*x` as an arm
reads as the arm `x` of rank one. So `*1 | 2` is
`or [(1, lit 1), (0, lit 2)]`, and `*[1]` is `pref 1 (list [lit 1] none true)`. -/
```

A list is sealed by its third field, which `close()` sets too, and a
sealed list without a spread has its positions' length:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- A list: each of its positions is present and holds its value;
  later elements are allowed, but in a sealed list without a spread,
  whose length is its positions'; the spread holds every element. It
  refuses a value that is no list, and a list that breaks any one of
  those. -/
  | list {items : List Val} {spread : Option Val} {closed : Bool} {xs : List Data} :
      items.length ≤ xs.length →
      (closed = true → spread = none → xs.length = items.length) →
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `[integer] | [string]`: the arms sealed, as a disjunction reads a list. -/
abbrev listArms : Val := .or [(0, .list [.integer] none true), (0, .list [.string] none true)]
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `[integer] | [string]` admits `[1]`… -/
example : Instance .empty listArms (.list [.integer 1]) :=
  ⟨by decide, (check_iff listArms_checkable _).mp (by decide)⟩

/-- …and refuses `[1, 2]`: neither arm has a second position. -/
example : ¬ Instance .empty listArms (.list [.integer 1, .integer 2]) :=
  fun ⟨_, h⟩ => absurd ((check_iff listArms_checkable _).mpr h) (by decide)

/-- A sealed list without a spread has its positions' length:
`close([integer])` refuses `[1, 2]`. -/
example : ¬ Instance .empty (.list [.integer] none true) (.list [.integer 1, .integer 2]) := by
  rintro ⟨-, h⟩
  cases h with
  | list _ hseal _ _ => exact absurd (hseal rfl rfl) (by decide)
```

So `[integer]` alone admits `[1 2]`, open past its one position, as
step 6 showed, and the same list as an arm admits one element and no
more. Write `arm-schema.aontu`:

<!-- test: file arm-schema.aontu -->
```aontu
v: [integer]|[string]
```

and `arm-data.aontu`:

<!-- test: file arm-data.aontu -->
```aontu
v: [1 2]
```

Now vet the data against the schema:

<!-- test: run -->
```sh
$ aontu vet arm-schema.aontu arm-data.aontu
verdict: invalid

$.v: empty [conflict]
  [aontu/empty]: Cannot unify values at path $.v
  data: arm-data.aontu:1:4 ([1,2])
  schema: arm-schema.aontu:1:4 ([integer]|[string])
$ echo $?
1
```

### A preference alone

`*x` outside a disjunction is a default its type can override: it
admits what `x` admits, and what the parent type of `x` admits:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- A preference alone admits its value, and what its value's parent
  type admits: `*1` admits `2`, and refuses `1.5` and `"a"`, which
  both refuse. -/
  | pref {r : ℕ} {x : Val} {j : Data} : Judge env root true x j → Judge env root true (.pref r x) j
  | prefSuper {r : ℕ} {x : Val} {j : Data} :
      Judge env root true x.super j → Judge env root true (.pref r x) j
  | prefNone {r : ℕ} {x : Val} {j : Data} :
      Judge env root false x j → Judge env root false x.super j → Judge env root false (.pref r x) j
```

`super` is a function on terms, in `spec/Aontu/Syntax.lean`: a
scalar's kind, a kind's parent, a container of its members' parents,
and a constraint's domain. Its first cases:

<!-- test: quote spec/Aontu/Syntax.lean -->
```lean
/-- The immediate parent type. A meet that holds a kind has that kind
for its parent, as `integer & min(3)` is a constraint on integers; a
meet of two kinds has the lower kind's parent; any other meet lifts
each side. A reference lifts as itself, a residual the engines keep
symbolic too. -/
def Val.super : Val → Val
  | .integer | .float | .biginteger | .bigdecimal => .number
  | .number | .string | .anyString | .boolean | .any => .any
  | .nil => .nil
  | .lit (.num x) => x.leaf.kind
  | .lit (.str s) => if s = "" then .anyString else .string
  | .lit (.bool _) => .boolean
  | .lit .null => .lit .null
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- The parent type of `1` is `integer`, of `integer` is `number`, and of
`{x: 1}` is `{x: integer}`. -/
example : Val.super (.lit (.num (.integer (.of 1)))) = .integer ∧ Val.super .integer = .number ∧
    Val.super (.map [("x", false, .lit (.num (.integer (.of 1))))] none false) =
      .map [("x", false, .integer)] none false :=
  ⟨rfl, rfl, rfl⟩

/-- The parent type of `integer & min(3)` is `integer`, the kind the
constraint holds. -/
example : Val.super (.meet .integer (.min (.num (.integer (.of 3))))) = .integer := rfl

/-- `*1` admits `1`, and `2`, which its parent type `integer` admits… -/
example : Instance .empty (.pref 1 (.lit (.num (.integer (.of 1))))) (.integer 1) ∧
    Instance .empty (.pref 1 (.lit (.num (.integer (.of 1))))) (.integer 2) :=
  ⟨⟨by decide, .pref .num⟩, ⟨by decide, .prefSuper .integer⟩⟩

/-- …and refuses the float `1.5`, which `integer` refuses. -/
example : ¬ Instance .empty (.pref 1 (.lit (.num (.integer (.of 1))))) (.num (.float (.dyadic 3 (-1)))) :=
  fun ⟨_, h⟩ => absurd ((check_iff (.pref .lit) _).mpr h) (by decide)
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `*8080 & min(1024)` admits `2048`, and refuses `80`: the preference
widens to `integer`, and the bound still holds. -/
example : Instance .empty port (.integer 2048) ∧ ¬ Instance .empty port (.integer 80) :=
  ⟨⟨by decide, .meet (.prefSuper .integer) (.min (by decide))⟩,
    fun ⟨_, h⟩ => absurd ((check_iff (.meet (.pref .lit) .min) _).mpr h) (by decide)⟩
```

Write `pref.aontu`:

<!-- test: scenario pref -->
<!-- test: file pref.aontu -->
```aontu
default: *1
override: *1 & 2
list: *[1] & [2]
port: *8080 & min(1024) & 2048
```

and run it:

<!-- test: run -->
```sh
$ aontu -c pref.aontu
{"default":*1,"list":[2],"override":2,"port":2048}
```

`-c` keeps the default at `default`, a claim about the value when
nothing else arrives, and the three overrides stand: `2` is an integer,
`[2]` a one-element list of integers, and `2048` an integer of at least
`1024`. A float is no integer. Write `pref-schema.aontu`:

<!-- test: file pref-schema.aontu -->
```aontu
v: *1
```

and `pref-data.aontu`:

<!-- test: file pref-data.aontu -->
```aontu
v: 1.5
```

Now vet the data against the schema:

<!-- test: run -->
```sh
$ aontu vet pref-schema.aontu pref-data.aontu
verdict: invalid

$.v: empty [conflict]
  [aontu/empty]: Cannot unify values at path $.v
  data: pref-data.aontu:1:4 (1.5)
  schema: pref-schema.aontu:1:4 (*1)
$ echo $?
1
```

### The question the engines ask

Two maps in two arms admit a map that one of them admits, by the rule
above, and the engines answer `incomplete`. Write `open-schema.aontu`:

<!-- test: file open-schema.aontu -->
```aontu
v: { x:1 }|{ y:2 }
```

and `open-data.aontu`:

<!-- test: file open-data.aontu -->
```aontu
v: x: 1
```

Now vet the data against the schema:

<!-- test: run -->
```sh
$ aontu vet open-schema.aontu open-data.aontu
verdict: incomplete

$.v: disjunct_no_gen [incomplete]
  [aontu/disjunct_no_gen]: Cannot resolve value at path $.v
  schema: open-schema.aontu:1:4 ({"x":1}|{"x":1,"y":2})
$ echo $?
3
```

The engine asks the evaluator's question: met with the data, each arm
is still consistent with it, since a map is open and `{y: 2}` could
gain `x`, so two alternatives remain and no value is settled. The same
question fills a default the data lacks: `{x: *1}` met with `{}` is
valid, by the default `1`. Admission asks whether the data, as it
stands, is an instance, and `{x: 1}` is one. Both questions are the
definition's to state. The second is `Output`, what evaluation singles
out, which step 19 leaves to a later phase, and the test rows of step
15 stay where the two agree.

## 13. What evaluation singles out

Admission says which values a term admits. Evaluation picks one of
them, or none, and that one is what the engines write out and what
`vet` fills a default from. Write `singles.aontu`:

<!-- test: scenario output -->
<!-- test: file singles.aontu -->
```aontu
a: *1|2
b: (*1|2)|3
c: { x?: *1 y?:integer }
d: { x: *1 } & {}
e: [&: integer *1]
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu singles.aontu
{
  "a": 1,
  "b": 1,
  "c": {
    "x": 1
  },
  "d": {
    "x": 1
  },
  "e": [
    1
  ]
}
```

`a` singles out its preferred arm. `b` singles out `1` too: an arm
that is itself a disjunction of rank `0` brings its own arms, so the
preference inside it counts. `c` writes the optional key whose value
singles out something and leaves out the one whose value does not. `d`
is the fill of the data `{}` by the schema `{x: *1}`, which is how
`vet` reads a default, as the end of step 12 says. `e` meets its
position with the spread.

`spec/Aontu/Output.lean` states this as `Gen`, a relation by recursion
on the term:

<!-- test: quote spec/Aontu/Output.lean -->
```lean
/-- `v` generates `j`. -/
def Gen (env : Env) (root : Data) : Val → Data → Prop
  | .lit s, j => j = s.data
  | .map fs spread _, j =>
    keysDistinct fs = true ∧ ∃ ms, genFields env root spread fs ms ∧ j = .map (sortMembers ms)
  | .list items spread _, j => ∃ xs, genItems env root spread items xs ∧ j = .list xs
  | .or arms, j => arms.any (picked arms) = true ∧ genArms env root arms arms j
  | .pref _ x, j => Gen env root x j
  | .meet a b, j =>
    (Gen env root a j ∧ Admits env root b j) ∨
      ((∀ j', ¬ Gen env root a j') ∧ Gen env root b j ∧ Admits env root a j)
  | .integer, _ | .float, _ | .biginteger, _ | .bigdecimal, _ | .number, _ | .string, _
  | .anyString, _ | .boolean, _ | .min _, _ | .max _, _ | .above _, _ | .beneath _, _
  | .neq _, _ | .multiple _, _ | .len _, _ | .unique _, _ | .re _, _ | .format _, _
  | .any, _ | .nil, _ | .alias _, _ | .path _, _ | .nof _ _, _ | .must _ _, _
  | .when _ _ _, _ | .contains _ _, _ | .rest _ _, _ | .select _ _ _, _ | .filter _ _, _ => False
```

Read `Gen env root v j` as *`v` generates `j`*. A literal generates
its value. A map generates a map whose members `genFields` lists, in
declaration order and then in key order: a key whose value generates a
value the spread admits is written with it, an optional key whose value
generates none such is left out, and a required key whose value
generates none such leaves the map with no output at all. A list
generates each position, `genItems`. A disjunction generates what the
arms the rank rule picks all generate, `genArms` over `picked`: of the
live arms, those of the lowest positive rank, or every live arm where
none has one. So `*1 | 2` generates `1`, `1 | 1` generates `1`, and
`1 | 2` and `*1 | *2` generate nothing. A preference generates what its
value generates. A meet left as written, two atoms or a container with
a constraint, generates what its left side generates and its right
admits, or the other way about where the left generates nothing. A
kind, a bound, `any`, `nil`, an alias and a path generate nothing.

`Output` reads `Gen` off the normal form of step 10, where every meet
is computed and every dead arm dropped:

<!-- test: quote spec/Aontu/Output.lean -->
```lean
/-- What evaluation singles out for `v`: what the normal form of `v`,
every meet computed and every dead arm dropped, generates. -/
def Output (env : Env) (root : Data) (v : Val) (j : Data) : Prop := Gen env root (normalise v) j
```

Two theorems say what that output is:

<!-- test: quote spec/Aontu/Output.lean -->
```lean
/-- What evaluation singles out is an instance. -/
theorem output_admits (v : Val) (j : Data) (h : Output env root v j) : Admits env root v j :=
  (admits_normalise v j).mp (gen_admits _ j h)
```

<!-- test: quote spec/Aontu/Output.lean -->
```lean
/-- Evaluation singles out one value. -/
theorem output_unique (v : Val) (j j' : Data) (h : Output env root v j) (h' : Output env root v j') :
    j = j' :=
  gen_unique _ j j' h h'
```

`output_admits` says what evaluation singles out is an instance of
the term, so a filled default never writes a value the schema refuses. `output_unique` says there is at most one. A
function `gen` computes it, and `gen_iff` admits the function on every
checkable value, as `check_iff` admits `check` in step 17:

<!-- test: quote spec/Aontu/Output.lean -->
```lean
/-- `gen` computes `Gen` on every checkable value. -/
theorem gen_iff {v : Val} (h : v.Checkable) : ∀ j, gen v = some j ↔ Gen env root v j :=
```

Each example of `singles.aontu` is a theorem of the tour, by `rfl`,
which runs `output` inside the proof:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `*1 | 2` singles out `1`: the arm of the lowest positive rank. -/
example : output (.or [(1, .lit (.num (.integer (.of 1)))), (0, .lit (.num (.integer (.of 2))))]) =
    some (.integer 1) := rfl

/-- `1 | 2` singles out nothing: two arms, neither preferred, that
generate differently. `1 | 1` singles out `1`. -/
example : output (.or [(0, .lit (.num (.integer (.of 1)))), (0, .lit (.num (.integer (.of 2))))]) = none ∧
    output (.or [(0, .lit (.num (.integer (.of 1)))), (0, .lit (.num (.integer (.of 1))))]) =
      some (.integer 1) := ⟨rfl, rfl⟩

/-- `(*1 | 2) | 3` singles out `1`: an arm that is itself a disjunction
of rank `0` brings its arms, so the preference counts. -/
example : output (.or [(0, .or [(1, .lit (.num (.integer (.of 1)))), (0, .lit (.num (.integer (.of 2))))]),
    (0, .lit (.num (.integer (.of 3))))]) = some (.integer 1) := rfl

/-- `*8080 & min(1024)` singles out `8080`. -/
example : output port = some (.integer 8080) := rfl

/-- `{x?: *1}` singles out `{x: 1}`, and `{x?: integer}` singles out `{}`:
an optional key is written where its value generates. -/
example : output (.map [("x", true, .pref 1 (.lit (.num (.integer (.of 1)))))] none false) =
      some (.map [("x", .integer 1)]) ∧
    output (.map [("x", true, .integer)] none false) = some (.map []) := ⟨rfl, rfl⟩

/-- `{x: integer}` singles out nothing: a required key whose value
generates nothing. -/
example : output (.map [("x", false, .integer)] none false) = none := rfl

/-- `{x: *1} & {}` singles out `{x: 1}`: the fill of the data `{}` by the
schema `{x: *1}`, which is how `vet` reads a default. -/
example : output (.meet (.map [("x", false, .pref 1 (.lit (.num (.integer (.of 1)))))] none false)
    (.map [] none false)) = some (.map [("x", .integer 1)]) := rfl

/-- `({x: 1} | {y: 2}) & {x: 1}` singles out nothing, where `{x: 1}` is
an instance of it: each arm, met with the data, is still consistent
with it, so two alternatives remain, which is the engines' `incomplete`
at the end of step 12. -/
example : output (.meet (.or [(0, .map [("x", false, .lit (.num (.integer (.of 1))))] none false),
      (0, .map [("y", false, .lit (.num (.integer (.of 2))))] none false)])
    (.map [("x", false, .lit (.num (.integer (.of 1))))] none false)) = none := rfl

/-- What is singled out is an instance, `output_admits`: `*8080 & min(1024)`
admits `8080`, and the output of `{x?: *1}` is one of its instances. -/
example : Instance .empty port (.integer 8080) :=
  ⟨by decide, output_admits port _ ((output_iff (by decide) _).mp rfl)⟩
```

The last example is `output_admits` at work: `8080` is what
`*8080 & min(1024)` singles out, so it is an instance.

The fourth generated fragment, `test/spec/def-gen.tsv`, holds `gens`
rows for the values of `genVals` in `spec/Oracle.lean`: each value
under the key `v` that singles out something, with the JSON both
engines must write for it, which `output` gives and `gen_iff` makes
the definition's own. A value that singles out nothing has no row
until the verdict classes name what the engines report for it.

That question is the one `vet` asks in its default mode. Write
`fill-schema.aontu`:

<!-- test: file fill-schema.aontu -->
```aontu
v: x: *1
```

and `fill-data.aontu`:

<!-- test: file fill-data.aontu -->
```aontu
v: {}
```

Now vet the data, with and without the fill:

<!-- test: run -->
```sh
$ aontu vet fill-schema.aontu fill-data.aontu
verdict: valid
$ aontu vet --no-fill fill-schema.aontu fill-data.aontu
verdict: incomplete

$.v.x: vet_filled [incomplete]
  The schema supplies this member, and the data does not carry it.
  schema: fill-schema.aontu:1:7 (*1)
$ echo $?
3
```

`{}` is no instance of `{x: *1}`, since `x` is required, and
`--no-fill` says so. The default mode asks what `{x: *1} & {}`
singles out, which the tour shows is `{x: 1}`, and answers `valid`.
The classes `valid`, `invalid`, `incomplete` and `error`, defined from
`Admits` and `Output` together, are the next phase's.

## 14. The verdicts

`aontu vet` answers one of four words, and each is now defined from
`Admits` and `Output`. Write `required-schema.aontu`:

<!-- test: scenario verdicts -->
<!-- test: file required-schema.aontu -->
```aontu
v: x: integer
```

and `required-data.aontu`:

<!-- test: file required-data.aontu -->
```aontu
v: {}
```

and `dead-schema.aontu`:

<!-- test: file dead-schema.aontu -->
```aontu
v: min(5) & max(3)
```

Now vet, three ways:

<!-- test: run -->
```sh
$ aontu vet required-schema.aontu required-data.aontu
verdict: incomplete

$.v.x: mapval_no_gen [incomplete]
  [aontu/mapval_no_gen]: Cannot resolve value at path $.v.x
  schema: required-schema.aontu:1:7 (integer)
$ echo $?
3
$ aontu vet --partial required-schema.aontu required-data.aontu
verdict: valid

$.v.x: mapval_no_gen [incomplete]
  [aontu/mapval_no_gen]: Cannot resolve value at path $.v.x
  schema: required-schema.aontu:1:7 (integer)
$ aontu vet dead-schema.aontu required-data.aontu
verdict: error

$.v: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.v
  expected: min(5)
  actual:   max(3)
  schema: dead-schema.aontu:1:13 (max(3))
  schema: dead-schema.aontu:1:4 (min(5))
$ echo $?
4
```

The first run is `incomplete`: `{}` meets `{x: integer}` in a map
that is alive, `x` could still be any integer, and singles out
nothing. `--partial` lets that pass. The third is `error`: the schema
does not stand on its own, so the data is never blamed for it.
`spec/Aontu/Verdict.lean` reads the modes as two switches:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- The modes of `vet`: whether the schema fills the data, the default,
and whether what is left unresolved passes, which is `--partial`,
`lax` here since Lean keeps the word. -/
structure Mode where
  fill : Bool := true
  lax : Bool := false
```

and the verdict as a relation on the four answers, under the
declarations of step 8, where the schema reads as its expansion:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- The verdict `vet` gives the data `j` against the schema `S` under
the declarations `ds` and the mode `m`, the schema read as its
expansion with its selections made: `error` where the document refers to a name it does not
declare, where its names break the alias-cycle rule, or where the
schema's normal form does not stand; `invalid` where the meet of the
schema with the data as a term is dead, or refuses, read whole, the
value it gives with its trials and sizes unread; `valid` where the meet
singles out a value, and without the fill where the data as written is
an instance too, or where `--partial` lets the unresolved pass; and
`incomplete` otherwise. -/
def Vet (m : Mode) (ds : Decls) (S : Val) (j : Data) : Verdict → Prop
  | .error => ¬ ds.Declares S ∨ ¬ ds.Guarded ∨ (normaliseD ds (ds.readR S)).illFormed = true
  | .invalid =>
    ds.Declares S ∧ ds.Guarded ∧ (normaliseD ds (ds.readR S)).illFormed = false ∧
      ((normaliseD ds (meetD ds (ds.readR S) j.term)).dead = true ∨
        RefusedAt ds j (normaliseD ds (meetD ds (ds.readR S) j.term)))
  | .valid =>
    ds.Declares S ∧ ds.Guarded ∧ (normaliseD ds (ds.readR S)).illFormed = false ∧
      (normaliseD ds (meetD ds (ds.readR S) j.term)).dead = false ∧
      ¬ RefusedAt ds j (normaliseD ds (meetD ds (ds.readR S) j.term)) ∧
      (m.lax = true ∨
        ∃ j', OutputD ds j (meetD ds (ds.readR S) j.term) j' ∧
          (m.fill = true ∨ Admits ds.envE j (ds.readR S) j))
  | .incomplete =>
    ds.Declares S ∧ ds.Guarded ∧ (normaliseD ds (ds.readR S)).illFormed = false ∧
      (normaliseD ds (meetD ds (ds.readR S) j.term)).dead = false ∧
      ¬ RefusedAt ds j (normaliseD ds (meetD ds (ds.readR S) j.term)) ∧
      m.lax = false ∧
      ¬ ∃ j', OutputD ds j (meetD ds (ds.readR S) j.term) j' ∧
        (m.fill = true ∨ Admits ds.envE j (ds.readR S) j)
```

Read the four in order. `error` is a document that refers to a name it
does not declare, one whose names break the alias-cycle rule, or a
schema whose normal form does not stand, `illFormed`: a `nil` anywhere
but in a spread, which the engines read only against a member, or a
preference clash:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- Whether the arms the rank rule picks single out two different
values: a preference clash, where a positive rank is picked. -/
def clash (arms : List (ℕ × Val)) : Bool :=
  match pickRank arms with
  | none => false
  | some _ =>
    match (arms.filter (picked arms)).filterMap fun p => gen p.2 with
    | [] => false
    | x :: rest => rest.any fun y => decide (y ≠ x)

mutual
/-- Whether a term in normal form does not stand: a `nil` anywhere but
in a spread, which the engines read only against a member, or a
preference clash. -/
def Val.illFormed : Val → Bool
  | .nil => true
  | .map fs _ _ => illFields fs
  | .list items _ _ => illItems items
  | .or arms => clash arms || illArms arms
  | .pref _ x => x.illFormed
  | .meet a b => a.illFormed || b.illFormed
  | _ => false
```

The schema is read, `Decls.readR`, as its expansion with its
selections made, which step 16 comes to. `invalid` is a schema that
stands met with the data as a term,
`Data.term`, in a meet that is dead, so that nothing could be the data,
or in a meet alive that refuses, read whole, the value it gives with
its trials and sizes unread. Both engines try a container once its
members have all arrived, after the fills, where a scalar they try at
the meet, and the definition reads that moment as the value the meet
would single out with each `nof`, `must`, `len` and `unique` as `any`:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- A term with its trials and sizes unread: each `nof`, `must`, `len`
and `unique` as `any`. -/
def Val.untried : Val → Val
  | .nof _ _ | .must _ _ | .when _ _ _ | .contains _ _ | .rest _ _ | .select _ _ _ | .filter _ _ | .len _
  | .unique _ => .any
  | .map fs spread closed => .map (untriedFields fs) (untriedSpread spread) closed
  | .list items spread closed => .list (untriedItems items) (untriedSpread spread) closed
  | .or arms => .or (untriedArms arms)
  | .pref r x => .pref r x.untried
  | .meet a b => .meet a.untried b.untried
  | v => v
```

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- A refusal at generation: with its trials and sizes unread, the term
singles out a value that it, read whole, refuses. -/
def RefusedAt (ds : Decls) (root : Data) (v : Val) : Prop :=
  ∃ c, Gen ds.envE root v.untried c ∧ Refuses ds.envE root v c
```

`valid` is a meet alive that singles out a value, step 13's `Output`,
and without the fill only where the data as written is an instance of
the schema too; `--partial` makes any live meet `valid`. `incomplete`
is what remains: a live meet that singles out nothing, or a fill the
data lacks. `vet` computes the verdict, and `vet_iff` admits it on
checkable terms, as `check_iff` and `gen_iff` do for theirs.

Three theorems say what the words mean:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- Without the fill, `valid` is `Instance`: the data as written is an
instance of the schema as read. -/
theorem vet_strict_valid_instance {m : Mode} {ds : Decls} {S : Val} {j : Data} (hf : m.fill = false)
    (hp : m.lax = false) (hj : j.WellFormed) (h : Vet m ds S j .valid) :
    Instance ds.envE (ds.readR S) j := by
  obtain ⟨-, -, -, -, -, hp' | ⟨_, -, hf' | hA⟩⟩ := h
  · rw [hp] at hp'
    exact nomatch hp'
  · rw [hf] at hf'
    exact nomatch hf'
  · exact ⟨hj, hA⟩
```

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- With the fill, `valid` singles out a value, the data filled, which
is an instance of the schema as read. -/
theorem vet_valid_filled {m : Mode} {ds : Decls} {S : Val} {j : Data} (hp : m.lax = false)
    (h : Vet m ds S j .valid) :
    ∃ j', OutputD ds j (meetD ds (ds.readR S) j.term) j' ∧ Admits ds.envE j (ds.readR S) j' := by
  obtain ⟨-, -, -, -, -, hp' | ⟨j', hout, -⟩⟩ := h
  · rw [hp] at hp'
    exact nomatch hp'
  · exact ⟨j', hout, ((admits_meetD _ _ _).mp (outputD_admits _ _ hout)).1⟩
```

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- `invalid` refuses: the normal form of the schema met with the data
refuses the data as written, or, its trials and sizes unread, the value
it would single out. -/
theorem vet_invalid_refuses {m : Mode} {ds : Decls} {S : Val} {j : Data} (h : Vet m ds S j .invalid) :
    Refuses ds.envE j (normaliseD ds (meetD ds (ds.readR S) j.term)) j ∨
      RefusedAt ds j (normaliseD ds (meetD ds (ds.readR S) j.term)) := by
  obtain ⟨-, -, -, hd | hr⟩ := h
  · exact .inl (dead_refuses _ hd j)
  · exact .inr hr
```

So `vet --no-fill` answers `valid` exactly for an instance, step 2's
question; `vet` answers it for a filled value that is an instance of
the schema; and `invalid` refuses the data as written or as filled,
where a fill a trial refuses is `invalid` though the data as written
may be an instance, as `{a?: 1} & nof(0, {a: 1})` against `{}` shows.
The tour runs the
verdicts of this step and the last by `decide`, under no declaration,
where a document reads as itself:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x: *1}` against `{}`: `valid` with the fill, the default `1`
supplied, and `incomplete` without it, since `{}` is no instance as
written. -/
example : vet {} [] (.map [("x", false, .pref 1 (.lit (.num (.integer (.of 1)))))] none false) (.map []) =
      .valid ∧
    vet { fill := false } [] (.map [("x", false, .pref 1 (.lit (.num (.integer (.of 1)))))] none false)
      (.map []) = .incomplete := by decide

/-- `{x?: *1}` against `{}` is `valid` either way: `{}` is an instance
as written. -/
example : vet { fill := false } [] (.map [("x", true, .pref 1 (.lit (.num (.integer (.of 1)))))] none false)
    (.map []) = .valid := by decide

/-- `{x: 1} | {y: 2}` against `{x: 1}` is `incomplete`: the meet is
alive and singles out nothing, step 12's question. -/
example : vet {} [] (.or [(0, .map [("x", false, .lit (.num (.integer (.of 1))))] none false),
      (0, .map [("y", false, .lit (.num (.integer (.of 2))))] none false)])
    (.map [("x", .integer 1)]) = .incomplete := by decide

/-- `integer` against `"a"` is `invalid`: the meet is dead. -/
example : vet {} [] .integer (.str "a") = .invalid := by decide

/-- `min(5) & max(3)` is `error` against anything: the schema does not
stand. So is `*1 | *2`, two preferred arms of one rank that single out
different values, where `*1 | *integer` stands. -/
example : vet {} [] (.meet (.min (.num (.integer (.of 5)))) (.max (.num (.integer (.of 3))))) (.integer 1) =
      .error ∧
    vet {} [] (.or [(1, .lit (.num (.integer (.of 1)))), (1, .lit (.num (.integer (.of 2))))]) (.integer 1) =
      .error ∧
    vet {} [] (.or [(1, .lit (.num (.integer (.of 1)))), (1, .integer)]) (.integer 1) = .valid := by decide

/-- `{x: integer}` against `{}` is `incomplete`, and `valid` under
`--partial`. -/
example : vet {} [] (.map [("x", false, .integer)] none false) (.map []) = .incomplete ∧
    vet { lax := true } [] (.map [("x", false, .integer)] none false) (.map []) = .valid := by decide

/-- Without the fill, `valid` is `Instance`: `[*1]` against `[2]`, under
no declaration, where a document reads as itself. -/
example : Instance (Decls.envE []) (Decls.readR [] (.list [.pref 1 (.lit (.num (.integer (.of 1))))] none false))
    (.list [.integer 2]) :=
  vet_strict_valid_instance (m := { fill := false }) (ds := []) rfl rfl (by decide)
    ((vet_iff (m := { fill := false }) (ds := []) (by decide) (by decide) .valid).mp (by decide))
```

The fifth generated fragment, `test/spec/def-verdict.tsv`, runs the
cases of `vetCases` in `spec/Oracle.lean` in all three modes, each
with the one class `vet` gives, which `vet_iff` makes the definition's
own. Both engines agree with the definition on every row but three,
which the ledger names. The rows keep away from two corners. The next
step records the three rows and the two corners: a seal met with a
spread, a `nil` written in a schema, and a contradiction under an
optional key.

## 15. Where the definition and the engines differ

Both engines' test suites run rows the definition generates, as step 17 shows, and on a few of them the engines don't answer as the
definition does. [`spec/ledger.tsv`](../spec/ledger.tsv) lists each such case,
with the answer each side gives, which side changes, and why.

In some, the engines admit what the definition refuses. No meet with
`string` admits `""`:

<!-- test: quote spec/Aontu/Order.lean -->
```lean
/-- `string & empty()` admits `""`, which `string` refuses, so it is no
meet with `string`: no meet with `string` admits `""`. It is a form of
its own. -/
theorem no_meet_with_string_admits_empty (env : Env) (root : Data) (b : Val) :
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
v: string & (string & empty()) & ""
```

and run it:

<!-- test: run -->
```sh
$ aontu -c waiver.aontu
{"v":""}
```

Both engines give `""` back: they let the `empty()` beside `string`
widen the conjunction, which a greatest lower bound can't do. For this
kind, the ledger names the engines as the side that changes.

Where the two engines differ from each other, the definition decides
which changes. `[*1] | [1]` has two arms that single out `[1]`, and
neither is preferred, so the disjunction singles out `[1]`:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `[*1] | [1]` singles out `[1]`, as Go answers and TypeScript does not:
both arms generate `[1]`, and neither is preferred. -/
example : output (.or [(0, .list [.pref 1 (.lit (.num (.integer (.of 1))))] none true),
    (0, .list [.lit (.num (.integer (.of 1)))] none true)]) = some (.list [.integer 1]) := rfl
```

Go answers so, and TypeScript answers `disjunct_no_gen`, collapsing
arms alike as written and not arms alike in what they single out.
`genVals` keeps such a value out of the rows until the ports agree.

The definition cannot tell a `nil` written from a `nil` computed, and
the engines answer them apart. A schema `{x: nil}` is `invalid` in both
engines and a schema `{x: 1 & 2}` is `error`, where step 14's
`illFormed` finds a `nil` in each and answers `error` for both. Under
an optional key, `{x?: 1 & 2}` is `error` in both engines, a
contradiction, where the definition reads a key that nothing can
satisfy as a key that must be absent, so `{x?: 1 & 2}` against `{}` is
`valid`, as `{x?: nil}` against `{}` is in both engines. The ledger's
cause for the second kind is that a contradictory value is an error,
and no generated row carries either corner.

A seal survives a meet, which the engines lose. `close([1, 2])` refuses
`[1, 2, 3]`, so no meet with it admits `[1, 2, 3]`:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `close([1, 2]) & [&: integer]` refuses `[1, 2, 3]`, which both engines
admit: a seal fixes the length, and no meet admits what a side refuses. -/
example : ¬ Instance .empty
    (.meet (.list [.lit (.num (.integer (.of 1))), .lit (.num (.integer (.of 2)))] none true)
      (.list [] (some .integer) false))
    (.list [.integer 1, .integer 2, .integer 3]) := by
  rintro ⟨-, h⟩
  cases h with
  | meet h _ => cases h with | list _ hseal _ _ => exact absurd (hseal rfl rfl) (by decide)
```

Write `sealed.aontu`:

<!-- test: file sealed.aontu -->
```aontu
v: close([1 2]) & [&: integer]
```

and `three.aontu`:

<!-- test: file three.aontu -->
```aontu
v: [1 2 3]
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet sealed.aontu three.aontu
verdict: valid
$ echo $?
0
```

Both engines admit it: the open side's spread joins the sealed list,
and a sealed list with a spread has no fixed length, so the meet admits
what one of its sides refuses, which no meet can. Step 10's `meetList`
keeps the length and takes the spread into each position instead. The
engines are the side that changes, and the last three rows of
[`test/spec/def-verdict.tsv`](../test/spec/def-verdict.tsv) carry the
case, `invalid` in every mode, and the ledger names them, so the run
fails the day an engine comes to agree and the rows still stand there.

A name declared as itself alone, `%U = %U`, is an `error` in the
definition, a schema that admits nothing, as step 8 proves, where both
engines answer `invalid` by running out of steps and blame the data.
`%T = %T | 1` breaks the alias-cycle rule through `|` and is an `error`
too, where both engines run it and its second arm admits `1`. Six rows
of [`test/spec/def-alias.tsv`](../test/spec/def-alias.tsv) carry the
two cases, and the ledger names the engines as the side that changes.

In others, two optional declarations of one key can't both hold:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x?: string} & {x?: integer}` admits `{}`, where both engines answer
`error`. -/
example : Instance .empty
    (.meet (.map [("x", true, .string)] none false) (.map [("x", true, .integer)] none false))
    (.map []) :=
```

Write `contradiction.aontu`:

<!-- test: file contradiction.aontu -->
```aontu
v: { x?:string } & { x?:integer }
```

and `contradiction-data.aontu`:

<!-- test: file contradiction-data.aontu -->
```aontu
v: {}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet contradiction.aontu contradiction-data.aontu
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

A name that refers to itself through a trial alone, `%T = nof(0, %T)`,
breaks the alias-cycle rule and is an `error`, as `%T = %T` is: nothing
between the name and itself consumes data. Both engines decide the
trial by running out of steps, and answer `valid` or `invalid` as the
count falls. Twenty-one rows of
[`test/spec/def-trial.tsv`](../test/spec/def-trial.tsv) carry seven such
documents, `%T = when(%T, 1)` and `%T = when(string, %T)` among them,
and the ledger names the engines as the side that changes.
In the same file, `must(1 & 2, "m")` refuses `1` as `nof(1, 1 & 2)`
does, a branch that admits nothing counting as none, where both
engines answer `error`: six rows, the engines the side that changes.
And a default a trial refuses, `nof(1, 1, 2) & (*3 | 2)`, is a dead
arm, so the disjunction falls to `2` and the document is `valid`, where
both engines leave the disjunction generating nothing, `incomplete`:
two rows, the engines the side that changes.

## 16. Trial schemas

A trial schema tries a term on a value and reads the answer either
way. `nof(n, c₁, …)` counts the branches that admit the value and holds
the count to `n`; `must(c, m)` holds the value to `c`; and
`when(c, t, e)` holds it to `t` where `c` admits it and to `e` where `c`
refuses it, an `e` not written passing; `contains(c, n)` counts the
members of a container `c` admits and holds the count to `n`,
`contains(c)` asking for at least one; and `rest(t, c₁, …)` holds each
member no cover evaluates to `t`. Each is a form of the syntax:

<!-- test: quote spec/Aontu/Syntax.lean -->
```lean
  | nof (n : Val) (cs : List Val)           -- `nof(n, c₁, …, cₖ)`, the branches that admit counted by `n`
  | must (c : Val) (msg : String)           -- `must(c, "msg")`, which asks what `nof(1, c)` asks
  | when (c t : Val) (e : Option Val)       -- `when(c, t)` or `when(c, t, e)`: `t` where `c` admits, else `e`, or nothing
  | contains (c n : Val)                    -- `contains(c, n)`, the members `c` admits counted by `n`; `contains(c)` is `n = min(1)`
  | rest (t : Val) (cs : List (Option Val × Option Val × Option Val))  -- `rest(t, c₁, …)`: each member no cover evaluates held to `t`
```

A cover is a record of three trials, each written or not:

<!-- test: quote spec/Aontu/Syntax.lean -->
```lean
/-- A cover of `rest`: its `if`, tried on the whole value, its `keys`,
tried on a member's key, and its `members`, tried on a member, each
written or not. -/
abbrev Cover := Option Val × Option Val × Option Val
```

and each has its rules in `Judge`:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- A trial schema tries each branch on the value, as a term is tried,
  and counts those that admit it: `nof(n, c₁, …)` judges as `n` judges
  the count, an integer, and `must(c, m)` as `c` judges the value, which
  is what `nof(1, c)` asks. Each branch judges the value one way or the
  other, so a branch that judges it neither way, a name declared as
  itself alone, leaves the trial unjudged; a count no integer leaf holds
  is refused. -/
  | nof {b : Bool} {n : Val} {cs : List Val} {j : Data} {f : Val → Bool} {k : ℕ} (h : IntegerLeaf k) :
      (∀ c, c ∈ cs → Judge env root (f c) c j) → cs.countP f = k →
      Judge env root b n (.num (.integer ⟨k, h⟩)) → Judge env root b (.nof n cs) j
  | nofBig {n : Val} {cs : List Val} {j : Data} {f : Val → Bool} {k : ℕ} :
      (∀ c, c ∈ cs → Judge env root (f c) c j) → cs.countP f = k → ¬ IntegerLeaf k →
      Judge env root false (.nof n cs) j
  | must {b : Bool} {c : Val} {m : String} {j : Data} :
      Judge env root b c j → Judge env root b (.must c m) j
```

The rule reads each branch's own answer, `f c`, and counts the branches
whose answer is `true`. This is what step 2's second answer is for: a
rule of admission alone could not say that a branch refuses the value,
and Lean refuses a rule that mentions its own negation. A branch that
neither admits nor refuses the value, a name declared as itself alone,
leaves the trial without an answer, and a count no integer leaf holds is
refused. A conditional reads its condition's answer the same way, and
holds the value to the branch that answer picks:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- A conditional holds the value to the branch its condition picks:
  where `c` admits the value, `when(c, t, e)` judges it as `t` does;
  where `c` refuses it, as `e` does; and an `e` not written admits it. -/
  | whenThen {b : Bool} {c t : Val} {e : Option Val} {j : Data} :
      Judge env root true c j → Judge env root b t j → Judge env root b (.when c t e) j
  | whenElse {b : Bool} {c t e : Val} {j : Data} :
      Judge env root false c j → Judge env root b e j → Judge env root b (.when c t (some e)) j
  | whenPass {c t : Val} {j : Data} :
      Judge env root false c j → Judge env root true (.when c t none) j
```

`contains(c, n)` counts as `nof` does, over the members of the value
rather than over branches: each member is tried alone by `c`, and `n`
judges the number admitted, an integer. A scalar has no members and is
refused:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- `contains(c, n)` judges a list or a map as `n` judges the number of
  its members `c` admits, an integer, each member tried alone. A scalar
  has no members, so `contains` refuses it, as it refuses a count no
  integer leaf holds. -/
  | contains {b : Bool} {c n : Val} {j : Data} {ms : List Data} {f : Data → Bool} {k : ℕ} (h : IntegerLeaf k) :
      j.members = some ms → (∀ x, x ∈ ms → Judge env root (f x) c x) → ms.countP f = k →
      Judge env root b n (.num (.integer ⟨k, h⟩)) → Judge env root b (.contains c n) j
  | containsNone {c n : Val} {j : Data} : j.members = none → Judge env root false (.contains c n) j
```

`rest(t, c₁, …)` reads the members no cover evaluates and holds each to
`t`. A cover applies where its `if`, tried on the whole value, admits
it, or where it has none; an applying cover evaluates a member its
`keys` admits by key, or its `members` admits. The rule takes each
trial's answer as a function of the cover, as `nof` takes a branch's,
and reads the covers through them:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
/-- Whether some cover evaluates the member `x` under the key `k`, the
covers' trials answered by `gc`, `gk` and `gm`. -/
def evaluatedBy (cs : List Cover) (gc : Cover → Bool) (gk : Cover → String → Bool) (gm : Cover → Data → Bool)
    (k : String) (x : Data) : Bool :=
  cs.any fun c => coverApplies c (gc c) && (coverHolds c.2.1 (gk c k) || coverHolds c.2.2 (gm c x))
```

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- `rest(t, c₁, …)` holds each member no cover evaluates to `t`. A
  cover applies where its `if`, tried on the whole value, admits it, or
  where it has none, and evaluates a member its `keys` admits by key or
  its `members` admits; each trial answers one way or the other. A
  scalar has no members, so `rest` admits it. -/
  | rest {b : Bool} {t : Val} {cs : List Cover} {j : Data} {ns : List (String × Data)}
      {gc : Cover → Bool} {gk : Cover → String → Bool} {gm : Cover → Data → Bool} {ft : Data → Bool} :
      j.named = some ns →
      (∀ c, c ∈ cs → ∀ v, c.1 = some v → Judge env root (gc c) v j) →
      (∀ c, c ∈ cs → ∀ v, c.2.1 = some v → ∀ k x, (k, x) ∈ ns → Judge env root (gk c k) v (.str k)) →
      (∀ c, c ∈ cs → ∀ v, c.2.2 = some v → ∀ k x, (k, x) ∈ ns → Judge env root (gm c x) v x) →
      (∀ k x, (k, x) ∈ ns → Judge env root (ft x) t x) →
      ns.all (fun m => evaluatedBy cs gc gk gm m.1 m.2 || ft m.2) = b →
      Judge env root b (.rest t cs) j
  | restNone {t : Val} {cs : List Cover} {j : Data} : j.named = none → Judge env root true (.rest t cs) j
```

A scalar has no members, and `rest` admits it where `contains` refuses
it: nothing is left over, where nothing is counted.

Eight theorems of `spec/Aontu/Trial.lean` say what the language's
decisions say of the trials. `must(c, m)` asks what `nof(1, c)` asks:

<!-- test: quote spec/Aontu/Trial.lean -->
```lean
/-- `must(c, m)` asks what `nof(1, c)` asks, whichever way the trial
comes out. -/
theorem judge_must_iff_nof {b : Bool} {c : Val} {m : String} {j : Data} :
    Judge env root b (.must c m) j ↔ Judge env root b (.nof (.lit (.num (.integer (.of 1)))) [c]) j := by
```

and `nof(0, c)` is the complement of `c`, which is how the `not` of JSON
Schema reads:

<!-- test: quote spec/Aontu/Trial.lean -->
```lean
/-- `nof(0, c)` is the complement of `c`, which is how JSON Schema's
`not` reads: it admits what `c` refuses and refuses what `c` admits. -/
theorem judge_nof_zero {b : Bool} {c : Val} {j : Data} :
    Judge env root b (.nof (.lit (.num (.integer (.of 0)))) [c]) j ↔ Judge env root (!b) c j := by
```

A conditional holds the value to the branch its condition picks, an
`else` not written reading as `any`:

<!-- test: quote spec/Aontu/Trial.lean -->
```lean
/-- A conditional holds the value to the branch its condition picks:
where `c` admits it, `when(c, t, e)` judges it as `t` does; where `c`
refuses it, as `e` does, an `e` not written reading as `any`. -/
theorem judge_when_iff {b : Bool} {c t : Val} {e : Option Val} {j : Data} :
    Judge env root b (.when c t e) j ↔
      (Admits env root c j ∧ Judge env root b t j) ∨
        (Refuses env root c j ∧ Judge env root b (e.getD .any) j) := by
```

and `when(c, nil)` refuses every value `c` admits, `nil` being the
false schema in a branch:

<!-- test: quote spec/Aontu/Trial.lean -->
```lean
/-- `when(c, nil)` refuses every value `c` admits: `nil` is the false
schema in a branch. -/
theorem when_nil_refuses {c : Val} {e : Option Val} {j : Data} (h : Admits env root c j) :
    Refuses env root (.when c .nil e) j :=
  .whenThen h .nil
```

A count over a container with no members is a count of none, and a
scalar, which has no members, is refused:

<!-- test: quote spec/Aontu/Trial.lean -->
```lean
/-- `contains(c, n)` over a list with no members judges as `n` judges
`0`: nothing is admitted where nothing is tried. -/
theorem judge_contains_empty {b : Bool} {c n : Val} :
    Judge env root b (.contains c n) (.list []) ↔ Judge env root b n (.num (.integer (.of 0))) := by
```

<!-- test: quote spec/Aontu/Trial.lean -->
```lean
/-- A scalar has no members, so `contains` refuses it. -/
theorem contains_refuses_scalar {c n : Val} (s : Scalar) : Refuses env root (.contains c n) s.data :=
  .containsNone (by cases s <;> rfl)
```

And `rest` admits a scalar, where with `nil` and no cover it admits a
container only where it has no members:

<!-- test: quote spec/Aontu/Trial.lean -->
```lean
/-- A scalar has no members, so `rest` admits it: nothing is left over. -/
theorem rest_admits_scalar {t : Val} {cs : List Cover} (s : Scalar) : Admits env root (.rest t cs) s.data :=
  .restNone (by cases s <;> rfl)
```

<!-- test: quote spec/Aontu/Trial.lean -->
```lean
/-- `rest(nil)` with no cover admits a container exactly where it has no
members: nothing evaluates any, and `nil` holds none. -/
theorem rest_nil_closes {j : Data} {ns : List (String × Data)} (hm : j.named = some ns) :
    Admits env root (.rest .nil []) j ↔ ns = [] := by
```

The checker counts the branches it answers `true`, and holds the count
to `n` as it holds a size to `len`'s term; a conditional it decides by
its condition's answer, an `else` not written answering `true` as a
spread not written does; `contains` it decides by counting the members
its term admits, as `nof` counts branches; and `rest` by asking of each
member whether some cover evaluates it, else whether `t` admits it:

<!-- test: quote spec/Aontu/Check.lean -->
```lean
  | .nof n cs, j =>
    if h : IntegerLeaf (countWith u cs j) then checkWith u n (.num (.integer ⟨countWith u cs j, h⟩))
    else false
  | .must c _, j => checkWith u c j
  | .when c t e, j => if checkWith u c j then checkWith u t j else checkSpreadWith u e j
  | .contains c n, j => match j.members with
    | some ms =>
      if h : IntegerLeaf (ms.countP fun x => checkWith u c x) then
        checkWith u n (.num (.integer ⟨ms.countP fun x => checkWith u c x, h⟩))
      else false
    | none => false
  | .rest t cs, j => match j.named with
    | some ns => ns.all fun m => restEvaluatedWith u cs j m.1 m.2 || checkWith u t m.2
    | none => true

/-- The branches of a trial that admit the datum, counted. -/
def countWith (u : String → Data → Bool) : List Val → Data → ℕ
  | [], _ => 0
  | c :: cs, j => (if checkWith u c j then 1 else 0) + countWith u cs j
```

So `vet` decides a document with a trial inside a value:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{a: nof(1, integer, min(0))}`: a trial inside a value. -/
abbrev oneOf : Val :=
  .map [("a", false, .nof (.lit (.num (.integer (.of 1)))) [.integer, .min (.num (.integer (.of 0)))])] none false

set_option maxRecDepth 8192 in
/-- `-1` is an integer and not at least `0`: one branch admits it, and the
document is valid. -/
example : vet {} [] oneOf (.map [("a", .integer (-1))]) = .valid := by decide

set_option maxRecDepth 8192 in
/-- `3` is both, so two branches admit it, and the document is invalid. -/
example : vet {} [] oneOf (.map [("a", .integer 3)]) = .invalid := by decide
```

Write `nof.aontu`:

<!-- test: scenario nof -->
<!-- test: file nof.aontu -->
```aontu
negative: nof(1, integer, min(0)) & -1
half: nof(1, integer, min(0)) & 0.5
```

and run it:

<!-- test: run -->
```sh
$ aontu -c nof.aontu
{"half":0.5,"negative":-1}
```

`-1` is an integer below zero, and `0.5` at least zero but no integer,
so one branch admits each. `3` would be admitted by both, and `nof`
refuses it, as the second example proves.

A conditional `vet` decides the same way:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{a: when(string, "a")}`: a conditional inside a value. -/
abbrev ifThen : Val := .map [("a", false, .when .string (.lit (.str "a")) none)] none false

set_option maxRecDepth 8192 in
/-- `5` is no string, so the conditional, with no `else`, passes it. -/
example : vet {} [] ifThen (.map [("a", .integer 5)]) = .valid := by decide

set_option maxRecDepth 8192 in
/-- `"b"` is a string, and the `then` branch refuses it. -/
example : vet {} [] ifThen (.map [("a", .str "b")]) = .invalid := by decide

/-- The condition refuses `5`, and an `else` not written reads as `any`. -/
example : Admits .empty .null (.when .string (.lit (.str "a")) none) (.integer 5) :=
  judge_when_iff.mpr (.inr ⟨.stringNot (fun _ h => nomatch h), .any⟩)
```

and a count over members:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{a: contains(number)}`: a count over the members of a value. -/
abbrev someNumber : Val :=
  .map [("a", false, .contains .number (.min (.num (.integer (.of 1)))))] none false

set_option maxRecDepth 8192 in
/-- One member is a number, and the document is valid. -/
example : vet {} [] someNumber (.map [("a", .list [.integer 1, .str "x"])]) = .valid := by decide

set_option maxRecDepth 8192 in
/-- No member is, and the document is invalid. -/
example : vet {} [] someNumber (.map [("a", .list [.str "x"])]) = .invalid := by decide
```

and the members no cover evaluates:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{a: rest(nil, {keys: "a"})}`: the members no cover evaluates, held
to `nil`. -/
abbrev onlyA : Val :=
  .map [("a", false, .rest .nil [(none, some (.lit (.str "a")), none)])] none false

set_option maxRecDepth 8192 in
/-- The one member is under the key the cover evaluates, and the document
is valid. -/
example : vet {} [] onlyA (.map [("a", .map [("a", .integer 1)])]) = .valid := by decide

set_option maxRecDepth 8192 in
/-- A second member is evaluated by nothing, and `nil` refuses it. -/
example : vet {} [] onlyA (.map [("a", .map [("a", .integer 1), ("b", .integer 2)])]) = .invalid := by decide
```

Write `when.aontu`:

<!-- test: scenario when -->
<!-- test: file when.aontu -->
```aontu
text: when(string, "a", min(0)) & "a"
number: when(string, "a", min(0)) & 5
```

and run it:

<!-- test: run -->
```sh
$ aontu -c when.aontu
{"number":5,"text":"a"}
```

`"a"` is a string, so it must be `"a"`, and `5` isn't, so it must be at
least zero.

Two forms select by a value rather than try one. `match(s, p₁, r₁, …,
d?)` is the first result whose pattern admits the value the scrutinee
`s` generates, the default `d` where none does, and an error where
there is no default; `filter(s, c)` is the members of the container `s`
generates that `c` admits. Each is a form of the syntax, `match` under
the name `select`, since Lean keeps `match`:

<!-- test: quote spec/Aontu/Syntax.lean -->
```lean
  | select (s : Val) (arms : List (Val × Val)) (d : Option Val)  -- `match(s, p₁, r₁, …, d?)`, the first `rᵢ` whose `pᵢ` admits the value of `s`, else `d`; Lean keeps `match`
  | filter (s c : Val)                      -- `filter(s, c)`, the members of the value of `s` that `c` admits
```

Neither is tried on a value: each is made once the document is read,
before the meet, by the value its scrutinee or source has settled. The
arms select as the language says, the first pattern the value
satisfies, the default, and `nil`, which no value satisfies, where there
is no default, so that no match and no default is an error of the
document:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- The result the arms select for the value `x`: the first whose
pattern admits it, the default where none does, and `nil`, which no
value satisfies, where there is no default: no match and no default is
an error of the document, not an empty answer. -/
def selectArm (ds : Decls) (x : Data) : List (Val × Val) → Option Val → Val
  | [], d => d.getD .nil
  | (p, r) :: arms, d => if checkR ds p x then r else selectArm ds x arms d
```

and a term reads with its selections made, where one whose scrutinee
generates nothing stays, and generates nothing, as a `match` on an
unfilled hole does:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- A term with its selections made: each `match` whose scrutinee
generates a value is the result its arms select for it, and each
`filter` whose source generates a container is the members its
condition admits, as a term, or `nil` where the source generates a
scalar, which has no members. One whose scrutinee or source generates
nothing stays, and generates nothing. -/
def resolveD (ds : Decls) : Val → Val
  | .select s arms d =>
    let s' := resolveD ds s
    let arms' := resolvePairs ds arms
    let d' := resolveSpread ds d
    match genD ds s' with
    | some x => selectArm ds x arms' d'
    | none => .select s' arms' d'
  | .filter s c =>
    let s' := resolveD ds s
    let c' := resolveD ds c
    match genD ds s' with
    | some (.map fs) => (Data.map (fs.filter fun m => checkR ds c' m.2)).term
    | some (.list xs) => (Data.list (xs.filter fun x => checkR ds c' x)).term
    | some _ => .nil
    | none => .filter s' c'
```

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- How a document reads: its term expanded, with its selections made. -/
def Decls.readR (ds : Decls) (S : Val) : Val := resolveD ds (ds.read S)
```

Step 14's `Vet` reads the schema so, and three theorems say what the
language says of the selection:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- The first pattern the scrutinee's value satisfies selects its result. -/
theorem selectArm_first {ds : Decls} {x : Data} {p r : Val} {arms : List (Val × Val)} {d : Option Val}
    (h : checkR ds p x = true) : selectArm ds x ((p, r) :: arms) d = r := by
  simp [selectArm, h]
```

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- The default answers where no pattern is satisfied, and where there is
none the selection is `nil`: an error, not an empty answer. -/
theorem selectArm_default {ds : Decls} {x : Data} {d : Option Val} : selectArm ds x [] d = d.getD .nil := rfl
```

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- A `filter` over a list keeps the elements its condition admits, in
their order. -/
theorem resolveD_filter_list {ds : Decls} {s c : Val} {xs : List Data}
    (h : genD ds (resolveD ds s) = some (.list xs)) :
    resolveD ds (.filter s c) = (Data.list (xs.filter fun x => checkR ds (resolveD ds c) x)).term := by
  simp [resolveD, h]
```

So `vet` decides a document that selects:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{z: match(1, integer, "small", string, "big")}`: a selection by the
value its scrutinee generates, made as the document is read. -/
abbrev sized : Val :=
  .map [("z", false, .select (.lit (.num (.integer (.of 1))))
    [(.integer, .lit (.str "small")), (.string, .lit (.str "big"))] none)] none false

set_option maxRecDepth 8192 in
/-- `1` is an integer, so the first arm is selected, and `"small"` is
what `z` must be. -/
example : vet {} [] sized (.map [("z", .str "small")]) = .valid := by decide
```

An eighth generated fragment, `lake exe oracle trials`, runs 266
documents with trials and selections inside values in the three modes: `nof` with each
kind of count, over kinds, literals, maps, lists and names, beside
literals, defaults and disjunctions, nested, through a recursive name;
`must`; and `when`, with and without an `else`, over scalars, maps and
lists, nested, beside the other forms, and through a name; and
`contains`, with each kind of count, over lists, maps and scalars,
nested, beside the other forms, and through a name; and `rest`, with
no cover and with covers of each field, over maps, lists and scalars,
beside the other forms, and through a name; and `match` and `filter`
over a literal scrutinee or source, each arm, the default, no default,
results that generate nothing or a map, beside the other forms, and
nested. Its 798 rows are
[`test/spec/def-trial.tsv`](../test/spec/def-trial.tsv), and two of
them:

<!-- test: quote test/spec/def-trial.tsv -->
```tsv
t0	verdict	"a": nof(1, string, number)	{"a": "x"}	{"verdict":"valid"}
```

<!-- test: quote test/spec/def-trial.tsv -->
```tsv
t6	verdict	"a": nof(1, string, number)	{"a": true}	{"verdict":"invalid"}
```

Both engines answer every row as the definition does, but for the
cases step 15 lists.

## 17. A checker, admitted by a proof

`Admits` is a statement, so Lean can't run it. Running needs an
algorithm, and `spec/Aontu/Check.lean` holds one, for every term that
reads no alias, no path, no pattern and no format:

<!-- test: quote spec/Aontu/Check.lean -->
```lean
/-- The values `check` decides: those that read no alias, no path, no
pattern and no format, so that what they admit depends on no
declaration, no root, and no predicate of the host's. -/
inductive Val.Checkable : Val → Prop
  | integer : Checkable .integer
  | float : Checkable .float
  | biginteger : Checkable .biginteger
  | bigdecimal : Checkable .bigdecimal
  | number : Checkable .number
  | string : Checkable .string
  | anyString : Checkable .anyString
  | boolean : Checkable .boolean
  | lit {s : Scalar} : Checkable (.lit s)
  | min {b : Bound} : Checkable (.min b)
  | max {b : Bound} : Checkable (.max b)
  | above {b : Bound} : Checkable (.above b)
  | beneath {b : Bound} : Checkable (.beneath b)
  | neq {vs : List Bound} : Checkable (.neq vs)
  | multiple {d : Number} : Checkable (.multiple d)
  | len {c : Val} : Checkable c → Checkable (.len c)
  | unique {k : Option String} : Checkable (.unique k)
  | any : Checkable .any
  | nil : Checkable .nil
  | map {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool} :
      (∀ k o v, (k, o, v) ∈ fs → Checkable v) → (∀ s, spread = some s → Checkable s) →
      Checkable (.map fs spread closed)
  | list {items : List Val} {spread : Option Val} {closed : Bool} :
      (∀ v, v ∈ items → Checkable v) → (∀ s, spread = some s → Checkable s) →
      Checkable (.list items spread closed)
  | or {arms : List (ℕ × Val)} : (∀ r a, (r, a) ∈ arms → Checkable a) → Checkable (.or arms)
  | pref {r : ℕ} {x : Val} : Checkable x → Checkable (.pref r x)
  | meet {a b : Val} : Checkable a → Checkable b → Checkable (.meet a b)
```

A pattern's predicate is opaque, so no algorithm can run it, and `re`
and `format` are outside the checker's reach as an alias is.

`check` returns `true` or `false`, where `Judge` is a statement. It
is `checkWith` with a hook that answers `false` for every name, whose
first cases are:

<!-- test: quote spec/Aontu/Check.lean -->
```lean
/-- Whether `v` admits `j`, computed. -/
def checkWith (u : String → Data → Bool) : Val → Data → Bool
  | .integer, j => match j with
    | .num (.integer _) => true
    | _ => false
  | .float, j => match j with
    | .num (.float _) => true
    | _ => false
  | .biginteger, j => match j with
    | .num (.biginteger _) => true
    | _ => false
  | .bigdecimal, j => match j with
    | .num (.bigdecimal _) => true
    | _ => false
  | .number, j => match j with
    | .num _ => true
    | _ => false
  | .string, j => match j with
    | .str s => decide (s ≠ "")
```

The rest of it takes one case for each form in the same way, and a
name goes to the hook. Nothing in the code says that `check` and
`Judge` agree. One theorem does: the `Bool` the checker computes is the
judgement, so its `true` is admission and its `false` refusal, for
either `b`:

<!-- test: quote spec/Aontu/Check.lean -->
```lean
/-- `check` decides admission, and refusal, for every checkable value. -/
theorem check_iff {v : Val} (h : v.Checkable) (j : Data) {b : Bool} :
    check v j = b ↔ Judge env root b v j :=
```

`unique` asks whether two members are one value, which `Same` states
and `check` has to compute. `Data.same` computes it, beside its own
theorem:

<!-- test: quote spec/Aontu/Check.lean -->
```lean
theorem Data.same_iff : ∀ j j' : Data, j.same j' = true ↔ j.Same j'
```

With `check_iff` proved, an answer `check` computes is the definition's
answer:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `check` computes: `integer & min(3)` admits `7`. -/
example : check (.meet .integer (.min (.num (.integer (.of 3))))) (.integer 7) = true := by decide

/-- …and `{x: integer}` refuses `{}`. -/
example : check (.map [("x", false, .integer)] none false) (.map []) = false := by decide
```

`spec/Oracle.lean` uses `check` to write the engines' test rows. It
builds every term of the fragment up to one `&`, and two sets of values
to try each against:

<!-- test: quote spec/Oracle.lean -->
```lean
def bases : List Val :=
  [.any, .nil, .integer, .meet .number (.multiple (.integer (.of 1))), .string, .anyString,
    .min (.num (.integer (.of 0))), .min (.num (.integer (.of 3)))]

/-- `{"x": v}`, or `{"x"?: v}`. -/
def field (opt : Bool) (v : Val) : Val := .map [("x", opt, v)] none false

def level1 : List Val := bases ++ bases.flatMap fun v => [field true v, field false v]

def vals : List Val := level1 ++ level1.flatMap fun a => level1.map (.meet a)

def scalars : List Data :=
  [.null, .bool true, .integer 0, .integer 3, .integer (-1), .str "", .str "a"]

/-- The instances of the first 9,600 rows. -/
def first : List Data :=
  scalars ++ [.map []] ++ scalars.map (fun j => .map [("x", j)]) ++ [.map [("y", .integer 1)]]

/-- The instances of the rows after them, numbered on so that no earlier
row is renamed: two big decimals, one either side of three, a big
integer no double holds, and a list, each also under a key, written
`0d1.5`, `0d3.5`, `0d9007199254740993`, and `[1]`. -/
def more : List Data :=
  let xs : List Data :=
    [.num (.bigdecimal (.of 15 1)), .num (.bigdecimal (.of 35 1)),
      .num (.biginteger ⟨9007199254740993⟩), .list [.integer 1]]
  xs ++ xs.map (fun j => .map [("x", j)])

def instances : List Data := first ++ more
```

The oracle numbers the second set's rows after the first's, so adding
it renamed no row. The file proves that every term it builds is
checkable, and every instance is a value, so each answer is the
definition's:

<!-- test: quote spec/Oracle.lean -->
```lean
/-- Every row's verdict is the definition's: `v` admits `j`, taken
whole, under no alias declaration. -/
theorem verdict_exact {v : Val} (hv : v ∈ vals) {j : Data} (hj : j ∈ instances) :
    check v j = true ↔ Instance Env.empty v j :=
  ⟨fun h => ⟨instances_wellFormed j hj, (check_iff (vals_checkable v hv) j).mp h⟩,
    fun h => (check_iff (vals_checkable v hv) j).mpr h.2⟩
```

It writes one row for each term and value, 14,400 in all, and both
engines' test suites run every row. Two of them, from
[`test/spec/def-fragment.tsv`](../test/spec/def-fragment.tsv):

<!-- test: quote test/spec/def-fragment.tsv -->
```tsv
c69	verdict	v: string	v: ""	{"verdict":["invalid","incomplete","error"]}
c70	verdict	v: string	v: "a"	{"verdict":"valid"}
```

A row holds a schema, a value, and the verdict `check` gives, and each
engine answers it with a plain `aontu vet`. The oracle writes a refusal
as the three verdicts it may be, since the definition answers admit or
refuse and no more. The second set's big integer is the first value to
tell `integer` from `number & multiple(1)`:

<!-- test: quote test/spec/def-fragment.tsv -->
```tsv
c9618	verdict	v: integer	v: 0d9007199254740993	{"verdict":["invalid","incomplete","error"]}
```

<!-- test: quote test/spec/def-fragment.tsv -->
```tsv
c9626	verdict	v: (number) & (multiple(1))	v: 0d9007199254740993	{"verdict":"valid"}
```

A second fragment, written by `lake exe oracle bounds`, takes the
bounds of step 4: each alone, each under a key, and eight of them met
pairwise, 115 terms against 30 values, as the 3,450 rows of
[`test/spec/def-bounds.tsv`](../test/spec/def-bounds.tsv):

<!-- test: quote spec/Oracle.lean -->
```lean
def boundBases : List Val :=
  [.above (.num one), .beneath (.num (.integer (.of 3))),
    .min (.str "b"), .max (.str "b"), .above (.str "b"), .beneath (.str "b"),
    .neq [.num one], .neq [.num one, .num (.integer (.of 3))], .neq [.num (.float (.dyadic 1 0))],
    .neq [.str "a"],
    .len (.lit (.num one)), .len (.min (.num one)), .len (.max (.num one)), .len .number,
    .len .float,
    .unique none, .unique (some "p")]
```

Two of its rows tell `neq(1.0)`, which excludes a float, from `neq(1)`:

<!-- test: quote test/spec/def-bounds.tsv -->
```tsv
b243	verdict	v: neq(1.0)	v: 1	{"verdict":"valid"}
```

<!-- test: quote test/spec/def-bounds.tsv -->
```tsv
b246	verdict	v: neq(1.0)	v: 1.0	{"verdict":["invalid","incomplete","error"]}
```

A third, `lake exe oracle choice`, takes the disjunctions and
preferences of step 12 over scalars, kinds, bounds, and sealed lists,
each alone and under an optional key: 52 terms against 22 values, the
1,144 rows of [`test/spec/def-choice.tsv`](../test/spec/def-choice.tsv).
Two of them:

<!-- test: quote test/spec/def-choice.tsv -->
```tsv
d48	verdict	v: *(1) | (2)	v: 2	{"verdict":"valid"}
d49	verdict	v: *(1) | (2)	v: 3	{"verdict":["invalid","incomplete","error"]}
```

The oracle writes each arm in parentheses, behind its stars, and a
sealed list as `close([…])`, which both engines read as the term.

Both engines answer every row of the three files as the definition
does, but for the cases step 15 lists.

The schema and the value are text, which `spec/Oracle/Print.lean`
writes. The printer is the oracle's and no part of the definition, and
no proof checks it: that an engine reads `v: 0d9007199254740993` as that
big integer is a claim about the engine's reader, which these rows
test.

### Names in the checker

The hook is answerable for a name at a datum no heavier than the one in
hand, and at one as heavy only where the name stands with no key and
no element between, which is where the checker asks:

<!-- test: quote spec/Aontu/Check.lean -->
```lean
/-- What the hook answers rightly, at a term and a datum: for a name it
is asked about, its answer is the judgement. -/
def HookOk (unfold : String → Data → Bool) (env : Env) (root : Data) (v : Val) (j : Data) : Prop :=
  ∀ k j', ((j'.weight < j.weight ∧ k ∈ v.refs) ∨ (j'.weight = j.weight ∧ k ∈ v.unguardedRefs)) →
    Judge env root (unfold k j') (.alias k) j'
```

With such a hook the checker judges every value that reads no path,
no pattern and no format, names included, as the definition does, and
`check_iff` is the case of the hook that answers `false` for every
name:

<!-- test: quote spec/Aontu/Check.lean -->
```lean
/-- The values the checker decides, given a hook for the names: those
that read no path, no pattern and no format. -/
inductive Val.CheckableA : Val → Prop
```

<!-- test: quote spec/Aontu/Check.lean -->
```lean
/-- The checker judges every value it can check as the definition does,
given a hook that is right where it is asked: its `true` is admission
and its `false` refusal. -/
theorem checkWith_judge {v : Val} (h : v.CheckableA) :
    ∀ j, HookOk u env root v j → Judge env root (checkWith u v j) v j := by
```

<!-- test: quote spec/Aontu/Check.lean -->
```lean
/-- The checker decides admission, and refusal, for every value it can
check, given a hook that is right where it is asked. -/
theorem checkWith_iff {v : Val} (h : v.CheckableA) (j : Data) (hu : HookOk u env root v j) {b : Bool} :
    checkWith u v j = b ↔ Judge env root b v j :=
  (checkWith_judge h j hu).toIff
```

Under the declarations of step 8 the hook unfolds a name to its
expanded body: against a lighter datum afresh, and against one as
heavy only while the name is not already being unfolded at that datum,
which a stack records.

<!-- test: quote spec/Aontu/Alias.lean -->
```lean
/-- The checker under the declarations, within `n` turns of unfolding. -/
def checkD (ds : Decls) : ℕ → List String → Val → Data → Bool
  | 0, _, _, _ => false
  | n + 1, stack, v, j =>
    checkWith (fun k j' =>
      match ds.env k with
      | some b =>
        if j'.weight < j.weight then checkD ds n [] (expand ds b) j'
        else if stack.contains k then false
        else checkD ds n (k :: stack) (expand ds b) j'
      | none => false) v j
```

A name met again at the same datum with no key and no element between
would be a cycle the alias-cycle rule refuses, so under the rule the
stack holds each declared name at most once, and the turns a datum
needs can be counted:

<!-- test: quote spec/Aontu/Alias.lean -->
```lean
/-- The turns a datum needs under a stack: one for each name a chain
with no key and no element between can hold, at each level of the
datum, and the names the stack has not yet taken. -/
def Decls.budget (ds : Decls) (j : Data) (stack : List String) : ℕ :=
  (j.weight + 1) * (ds.length + 1) + (ds.length - stack.length)
```

<!-- test: quote spec/Aontu/Alias.lean -->
```lean
/-- The checker under the declarations decides admission, and refusal,
for every value it can check, wherever the names keep the alias-cycle
rule. -/
theorem checkR_iff {ds : Decls} {root : Data} (hg : ds.Guarded) (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    {v : Val} (hv : v.CheckableA) (j : Data) {b : Bool} : checkR ds v j = b ↔ Judge ds.envE root b v j :=
```

The meet keeps a term the checker can read, since it builds its answer
from the pieces of its sides and the bodies it unfolds:

<!-- test: quote spec/Aontu/Alias.lean -->
```lean
/-- The normal form of a term the checker can read is one it can read. -/
theorem normaliseD_checkableA {ds : Decls} (hb : ∀ d, d ∈ ds → d.2.CheckableA) {v : Val}
    (hv : v.CheckableA) : (normaliseD ds v).CheckableA :=
```

So `vet_iff`, the theorem behind every verdict row, asks only that the
bodies and the schema read no path, no pattern and no format, which
`decide` settles from their text:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- `vet` computes `Vet`. -/
theorem vet_iff {m : Mode} {ds : Decls} {S : Val} {j : Data} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : (ds.readR S).CheckableA) (v : Verdict) : vet m ds S j = v ↔ Vet m ds S j v :=
```

## 18. What any `subsume` must answer

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
`Le` quantifies over every value, infinitely many, so the contract
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

## 19. What the definition doesn't say yet

The definition covers what this page walked through, and has no rule
for the rest of the language, so it says nothing about it. The
[language reference](reference-language.md) states the rest: the
two readings of a number that `--exact-numbers` switches between,
which strings a pattern or a format admits, most built-in functions,
generation with `each`, `pack` and `emit`, and marks such as `hide()`
and `type()`. [`aontu vet`](reference-api.md#aontu-vet) states which
refusal is `invalid`, `incomplete` or `error`, and the shared test
suite in [`test/spec/`](../test/spec/) holds both engines to them.

Nor does the definition say anything about text. The
[grammar](../grammar/aontu.abnf) says how to parse an aontu file, and
each engine how it reads a JSON file into aontu's values: the leaf of
each number, its escapes, and a key it repeats. The shared test suite holds both readers to one
answer.

Nor does it name JSON Schema, which isn't a concept of the language.
The language needs only the power to represent a JSON Schema: what
`aontu jsonschema import` writes is aontu terms, such as
`number & multiple(1)`, and the definition says what those mean.

Nor does it hold the subsumption table as theorems, nor a contract
for each profile of `subsume` beyond `values`, which step 18 states;
nor a path of step 9 read against the document as filled. Those are
later phases.

Next, read [unification](unification.md), which explains in prose the
operation these rules define.
