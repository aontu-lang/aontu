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
for a float, and what `mulof` reads one as. -/
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
`number & mulof(1)`, and that's a law of the definition, not only an
example. The tour proves it for every value:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `number & mulof(1)` admits the biginteger `9007199254740993`. -/
example : Instance .empty (.meet .number (.mulof (.integer (.of 1)))) (.num (.biginteger ⟨9007199254740993⟩)) :=
  ⟨by decide, .meet .number (.mulof (by decide) (by decide))⟩

/-- `number & mulof(1)` admits exactly the numbers that show a whole
number, of every leaf. -/
example (env : Env) (root j : Data) :
    Admits env root (.meet .number (.mulof (.integer (.of 1)))) j ↔ ∃ x, j = .num x ∧ x.Whole := by
```

The proof reads `mulof(1)` through a fact about the numbers:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The multiples of one are the numbers that show a whole number. -/
theorem Number.multipleOf_one (x : Number) : x.multipleOf (.integer (.of 1)) ↔ x.Whole := by
```

`↔` reads as *exactly when*. Meet `number & mulof(1)` with a whole
number of each leaf. Write `whole.aontu`:

<!-- test: scenario whole -->
<!-- test: file whole.aontu -->
```aontu
integer: number & mulof(1) & 3
float: number & mulof(1) & 1.0
biginteger: number & mulof(1) & 0d9007199254740993
bigdecimal: number & mulof(1) & 0d3.0
```

and run it:

<!-- test: run -->
```sh
$ aontu -c whole.aontu
{"bigdecimal":0d3.0,"biginteger":0d9007199254740993,"float":1.0,"integer":3}
```

`number & mulof(1)` admits all four, the float `1.0` and the big
decimal `0d3.0` among them, which `integer` refuses: the law reads the
value a number shows, not its leaf. Step 4 covers `mulof`.

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

and `mulof` reads the value a number shows, which differs from its
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
half, and `1.25` is no whole multiple of it. The rule for `mulof`
asks for a positive divisor, so `mulof(0)` admits nothing:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- `mulof` reads the value a number shows, which for a float is
  its shortest decimal; `mulof(0)` and a negative divisor admit
  nothing. -/
  | mulof {d x : Number} :
      d.Positive → x.multipleOf d → Judge env root true (.mulof d) (.num x)
  | mulofNot {d : Number} {j : Data} :
      (∀ x, j = .num x → d.Positive → ¬ x.multipleOf d) → Judge env root false (.mulof d) j
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

/-- `mulof(0.5)` admits one and a half. -/
example : Instance .empty (.mulof (.float (.dyadic 1 (-1)))) (.num (.bigdecimal (.of 15 1))) :=
  ⟨by decide, .mulof (by decide) (by decide)⟩

/-- `mulof(0.5)` refuses `1.25`. -/
example : ¬ Instance .empty (.mulof (.float (.dyadic 1 (-1)))) (.num (.bigdecimal (.of 125 2))) := by
  rintro ⟨-, h⟩
  cases h with
  | mulof _ h => exact absurd h (by decide)

/-- `mulof(0.1)` admits the float `0.3`: it reads the decimal each
float shows, where their exact values are no multiple. -/
example : Instance .empty (.mulof (.float (.dyadic 3602879701896397 (-55))))
    (.num (.float (.dyadic 5404319552844595 (-54)))) :=
  ⟨by decide, .mulof (by decide) (by decide)⟩

/-- `mulof(0)` refuses `0`, and everything else. -/
example : ¬ Instance .empty (.mulof (.integer (.of 0))) (.integer 0) := by
```

Write `bounds.aontu`:

<!-- test: scenario bounds -->
<!-- test: file bounds.aontu -->
```aontu
three: min(3) & 3
fraction: min(3) & 3.5
ceiling: max(2.5) & 0d2.5
half: mulof(0.5) & 1.5
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
`mulof(0.5)` admits it.

A float's exact value is a binary fraction, and the value it shows its
shortest decimal, so on a float the two part. Write `tenths.aontu`:

<!-- test: scenario tenths -->
<!-- test: file tenths.aontu -->
```aontu
tenth: max(0d0.1) & 0d0.1
thirds: mulof(0.1) & 0.3
```

and run it:

<!-- test: run -->
```sh
$ aontu -c tenths.aontu
{"tenth":0d0.1,"thirds":0.3}
```

`mulof(0.1)` admits the float `0.3`, which shows three tenths,
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
  refuses it, as it refuses a size no integer leaf holds. A `c` outside
  `len`'s domain, `any` or a trial (`Val.unsized`), admits no size. -/
  | len {b : Bool} {c : Val} {j : Data} {n : ℕ} (h : IntegerLeaf n) :
      c.unsized = false → j.size = some n → Judge env root b c (.num (.integer ⟨n, h⟩)) →
        Judge env root b (.len c) j
  | lenNone {c : Val} {j : Data} : j.size = none → Judge env root false (.len c) j
  | lenBig {c : Val} {j : Data} {n : ℕ} :
      j.size = some n → ¬ IntegerLeaf n → Judge env root false (.len c) j
  | lenOut {c : Val} {j : Data} : c.unsized = true → Judge env root false (.len c) j
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
or a kind such as `number`. `any` and a trial admit numbers but name no
count, so both engines refuse `len(any)` and `len(must(integer, "m"))`
their argument, and `len` over one admits no size at all. A rider and
a meet are read through, so `len(meta(1, {}))` and `len(any & 1)` are
each `len(1)`:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
def Val.unsized : Val → Bool
  | .any | .nof _ _ | .must _ _ | .when _ _ _ | .contains _ _ | .rest _ _ => true
  | .ride _ v _ => v.unsized
  | .meet a b => a.unsized && b.unsized
  | _ => false
```

Lean's `rfl` proves `c.unsized = false` of each `c` below, and the
examples read:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `len(1)` admits `"𝄞"`, one character in four bytes. -/
example : Instance .empty (.len (.lit (.num (.integer (.of 1))))) (.str "𝄞") :=
  ⟨by decide, .len (n := 1) (by decide) rfl (by decide) .num⟩

/-- `len(0)` admits `""`, which `string` refuses. -/
example : Instance .empty (.len (.lit (.num (.integer (.of 0))))) (.str "") :=
  ⟨by decide, .len (n := 0) (by decide) rfl (by decide) .num⟩

/-- `len(min(2))` admits `{"x": 1, "y": 2}`… -/
example : Instance .empty (.len (.min (.num (.integer (.of 2)))))
    (.map [("x", .integer 1), ("y", .integer 2)]) :=
  ⟨by decide, .len (n := 2) (by decide) rfl (by decide) (.min (by decide))⟩

/-- …and refuses `[1]`. -/
example : ¬ Instance .empty (.len (.min (.num (.integer (.of 2))))) (.list [.integer 1]) :=
  fun ⟨_, h⟩ => absurd ((check_iff (.len .min) _).mpr h) (by decide)

/-- `len(1)` refuses `5`: a number has no size. -/
example : ¬ Instance .empty (.len (.lit (.num (.integer (.of 1))))) (.integer 5) := by
  rintro ⟨-, h⟩
  cases h with
  | len _ _ hs _ => cases hs
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
end, each a predicate on two strings; which patterns lie in the subset
that `rep` and `split` hand to the host's own regex engine, a subset
the reference states on a pattern's syntax, which the definition does
not hold, how many groups such a pattern captures, which the engines
count on its text before any match is read, and where its leftmost
match at or after a code point of a text falls; how a string
changes case, Unicode's default case conversion at the version of each
engine's tables; and which grammars an RFC 5234 compiler compiles, as
`abnf` asks, and the tree its parser builds of a string a grammar reads
whole, as `parse` asks, none where it doesn't. Nothing here says what
any of them holds of, so a theorem about `re`, `format`, `rep`, `split`,
`upper`, `lower`, `abnf` or `parse` holds whatever they are. -/
structure Host where
  pattern : String → String → Prop
  format : String → String → Prop
  portable : String → Bool
  groups : String → ℕ
  find : String → String → ℕ → Option Match
  upper : String → String
  lower : String → String
  compiles : String → Bool
  tree : String → String → Option Data

instance : Inhabited Host :=
  ⟨⟨fun _ _ => True, fun _ _ => True, fun _ => false, fun _ => 0, fun _ _ _ => none, id, id,
    fun _ => false, fun _ _ => none⟩⟩
```

The oracle computes with a host of its own. It converts the case of the
letters `a` to `z` and `A` to `Z` alone, and it reads fixed patterns
alone: text, with groups that capture runs of it, which every engine
reads and counts as the oracle does. Its grammars are each one rule of
one literal, which step 32 reads.

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
def oracleHost : Host :=
  ⟨fun _ _ => True, fun _ _ => True, fun p => (fixedPieces p).isSome,
    fun p => ((fixedPieces p).map fun ps => (ps.filter (·.1)).length).getD 0, fixedFind,
    String.map Char.toUpper, String.map Char.toLower,
    fun g => (oneLiteral g).isSome, oneLiteralTree⟩

/-- The predicates behind `re` and `format`, the subset, the groups and
the matches behind `rep` and `split` at a pattern, the case conversion
behind `upper` and `lower`, and the compiler and parser behind `abnf`
and `parse`: a constant no proof can unfold, so no theorem rests on what
they are, and which the oracle runs as `oracleHost`. -/
@[implemented_by oracleHost]
opaque host : Host
```

`opaque` declares a constant Lean knows the type of and nothing else,
and `@[implemented_by]` gives the compiler `oracleHost` to run in its
place, so the oracle computes with it and no proof can unfold `host`.
The host holds the case conversion `upper` and `lower` use too, which
step 23 reads, and where a pattern matches a text, which step 24's
`split` and `rep` read. The two pattern rules read it:

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
[bottom](unification.md) of the [lattice](unification.md). Absence,
which step 33 reads, admits every value too, and so does the hole `_`,
which step 27 reads, where nothing fills it:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | any {j : Data} : Judge env root true .any j
  /-- Absence admits every value, as `any` does: it differs from `any`
  in what it generates, and nothing else. -/
  | absent {j : Data} : Judge env root true .absent j
  /-- `_`, a hole no generator filled, admits every value, as `any`
  does: the value is the one that fills it. -/
  | hole {j : Data} : Judge env root true .hole j
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
/-- The data: a number, a string, a boolean, null, a map, a list, or an
address. A map is the set of its members: Lean lists them, the order of
the list is no part of the value, and a map gives each key once
(`Data.WellFormed`). JSON writes an address as its text, and no JSON
text reads as one. -/
inductive Data where
  | num (x : Number)
  | str (s : String)
  | bool (b : Bool)
  | null
  | map (fs : List (String × Data))
  | list (xs : List Data)
  | addr (a : Addr)
```

An address is what a path value holds, and step 31 reads it. A map is
the set of its members, and a member is a key with the value
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
  every declaration; the spread holds every member, declared or not,
  read under the member's key (`Val.atKey`); a sealed map holds no key
  it does not declare. It refuses a value that is no map, and a map
  that breaks any one of those. -/
  | map {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool}
      {jfs : List (String × Data)} :
      (∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x → Judge env root true v x) →
      (∀ k o v, (k, o, v) ∈ fs → lookup k jfs = none → o = true) →
      (∀ s, spread = some s → ∀ k x, (k, x) ∈ jfs → Judge env root true (s.atKey k) x) →
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
      spread = some s → (k, x) ∈ jfs → Judge env root false (s.atKey k) x →
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
  whose length is its positions'; the spread holds every element, read
  under the element's position as a string (`namedItems`). It refuses a
  value that is no list, and a list that breaks any one of those. -/
  | list {items : List Val} {spread : Option Val} {closed : Bool} {xs : List Data} :
      items.length ≤ xs.length →
      (closed = true → spread = none → xs.length = items.length) →
      (∀ (i : ℕ) (v : Val) (x : Data), items[i]? = some v → xs[i]? = some x →
        Judge env root true v x) →
      (∀ s, spread = some s → ∀ k x, (k, x) ∈ namedItems 0 xs → Judge env root true (s.atKey k) x) →
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
      {s : Val} {k : String} {x : Data} :
      spread = some s → (k, x) ∈ namedItems 0 xs → Judge env root false (s.atKey k) x →
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

The words `map` and `list` are the kinds of the containers, as `string`
is the kind of the strings: `map` admits every map, and `list` every
list. Each has a rule for what it admits and one for what it refuses:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | mapKind {fs : List (String × Data)} : Judge env root true .mapKind (.map fs)
  | mapKindNot {j : Data} : (∀ fs, j ≠ .map fs) → Judge env root false .mapKind j
  | listKind {xs : List Data} : Judge env root true .listKind (.list xs)
  | listKindNot {j : Data} : (∀ xs, j ≠ .list xs) → Judge env root false .listKind j
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `map` admits every map, `{"x": 1}` among them. -/
example : Instance .empty .mapKind (.map [("x", .integer 1)]) := ⟨by decide, .mapKind⟩

/-- `list` refuses `{}`: it admits lists alone. -/
example : ¬ Instance .empty .listKind (.map []) := fun ⟨_, h⟩ => nomatch h
```

A kind admits what the open `{}` or `[]` admits, and the order of step
10 says so in both directions. What sets the two apart is what
evaluation singles out, in step 13: `{}` is `{}`, and `map` is nothing,
as `boolean` is nothing. Met with a value of its kind, a kind is that
value. Write `kinds.aontu`:

<!-- test: scenario kinds -->
<!-- test: file kinds.aontu -->
```aontu
map: map & { a:1 }
list: list & [1 2]
```

and run it:

<!-- test: run -->
```sh
$ aontu -c kinds.aontu
{"list":[1,2],"map":{"a":1}}
```

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
of its bodies, and an undeclared name has none. A reference copies the
value without the identity a body declares (`Val.unident`) and without
its marks (`Val.unmark`). -/
def env (ds : Decls) : Env := fun n =>
  match ds.bodies n with
  | [] => none
  | v :: vs => some (vs.foldl .meet v).unident.unmark
```

The identity is the one rider with a place. An `ident()` stands on an
alias's value, at its top or on a term of its top meet, and a reference
reads the value without it. `unident` takes off that one layer and keeps
whatever is inside it, so an `ident()` inside another stays behind, and
so does one in a schema or deeper in a body. None of those stand, and
step 14 comes to what doesn't stand.

A reference copies the value without its marks too, the `type()` and
`hide()` of step 13, at every depth: `unmark` clears them through every
form that holds a term, a selection's results among them. So what a
body hides, the place that refers to it asks for, and a mark written at
that place stays. A name whose body carries `type()` is a definition,
and its copy an instance, which admits nothing the definition doesn't
declare, at any depth: the expansion meets the copy with a restriction,
`Val.restrict`, a sealed map declaring the keys the body's maps declare,
each optional and restricted in turn, and a sealed list the same by
position. The seal follows a selection to the result it makes, stops at
a kind, a disjunction, a preference and a name, and a recursive name
takes none, as both engines read it. The identity's one layer comes first:

<!-- test: quote spec/Aontu/Names.lean -->
```lean
def Val.unident : Val → Val
  | .ride .ident v _ => v
  | .meet a b => .meet a.unident b.unident
  | v => v
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
the name's bodies, read the same way and sealed where the name is a
definition, and a reference to a recursive name stays as written, a
residual.

<!-- test: quote spec/Aontu/Alias.lean -->
```lean
/-- The expansion of a term, within `k` turns: a reference to a name
that is not recursive is replaced by the meet of its bodies, expanded in
turn and sealed where the name is a definition; a reference to a
recursive name, or to no name, stays. -/
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
/-- A step of a path: a member's key, a position in a list, a variable
the calling program binds, whose value names the step, the climb a
relative path starts with, a step up for each of its dots, or the step
into the node a body of `emit` is read for, which a relative reference
in a body starts with, since it names a field of the node rather than a
place. -/
inductive Seg where
  | key (k : String)
  | idx (i : ℕ)
  | var (n : String)
  | up (n : ℕ)
  | node
```

Step 30 comes to the variable, the end of this step to the climb, and
step 40 to the step into a node.
A path in a document reads as what the
document holds at that position, the data unified in: `x: $.y` with
`y: integer & 1` makes `x` the value `1`. `spec/Aontu/Paths.lean` reads
it by declaration. Each path a document writes becomes a name, declared
as the term at the path in the root, the normal form of the schema met
with the data, and the document refers to the name in its place, so
that the expansion, the residuals, the checker and the alias-cycle rule
of step 8 carry paths as they carry names. The term at a path is found
through maps by key and lists by index, and through nothing else: not a
disjunction, and not a reference left as a residual. A rider around a
map or a list, which step 19 comes to, changes nothing a path reads, so
`unride` takes it off first:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- The term at a path in a term: through maps by key and lists by
index, the riders around either read through, and through nothing
else. -/
def Val.at : Val → List Seg → Option Val
  | v, [] => some v
  | v, .key k :: p =>
    match v.unride with
    | .map fs _ _ =>
      match fs.find? (fun f => f.1 == k) with
      | some f => f.2.2.at p
      | none => none
    | _ => none
  | v, .idx i :: p =>
    match v.unride with
    | .list items _ _ =>
      match items[i]? with
      | some w => w.at p
      | none => none
    | _ => none
  | _, .var _ :: _ => none
```

A document writes a path as text, though, and both engines read each
step by the container it meets. A map reads the key the text spells, and a list
the index it spells in canonical decimal, `0` or digits that don't
begin with `0`. So `$.q.0` reads a map's key `"0"`, `$.q."1"` reads a
list's index `1`, and `$.q."01"` reads nothing:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- The step a written step takes in the container it meets, the riders
around it read through: in a map, the key its text spells, and in a
list, the index its text spells in canonical decimal. A variable names
no step until it's bound. -/
def Seg.stepIn (s : Seg) (v : Val) : Option Seg :=
  match s, v.unride with
  | .var _, _ | .up _, _ | .node, _ => none
  | s, .map _ _ _ => some (.key s.text)
  | .idx i, .list _ _ _ => some (.idx i)
  | .key k, .list _ _ _ => (indexOf? k).map .idx
  | _, _ => none
```

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- The term at a written path in a term: each step read as text, by
the container it meets (`Seg.stepIn`). -/
def Val.atW : Val → List Seg → Option Val
  | v, [] => some v
  | v, s :: p =>
    match s.stepIn v with
    | some t =>
      match v.at [t] with
      | some w => w.atW p
      | none => none
    | none => none
```

A path's term is then `Val.atW` of the path in a root, its variables
bound first:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- The term a written path names in a root: the path with each
variable bound (`Decls.bindSeg`), read by `Val.atW`. -/
def Decls.pathAt (ds : Decls) (root : Val) (p : List Seg) : Option Val :=
  (p.mapM ds.bindSeg).bind root.atW
```

A path resolves in the schema's own tree, read before any data with
its calls made, so a path into a call's output resolves: `$.b.camel` beside
`b: nom("ab_cd")` reads `"abCd"`. A key the data alone supplies is no
position, and a path to nothing is an `error`, but where `maybe`
forgives it, as step 33 shows:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- Every path of the document that must name something resolves in
the schema's own tree. -/
def Decls.Resolves (ds : Decls) (S : Val) : Prop :=
  ∀ p, p ∈ ds.strictPaths S → (ds.pathIn (ds.rootsS S) p).isSome = true
```

The term a path reads is then taken from the document's roots, data
and all. A call over a path makes its value only once the path reads,
so the definition reads the document in rounds. The first round reads
it with its paths unread. Each round after declares each path as the
term at it in the first root before that reaches it, and reads the
document again. A call or a generator waits while a term it's handed
waits on a reference that names nothing yet: a path not read, a name no
round has declared, or a call that waits on one:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def Val.pending (ds : Decls) : Val → Bool
  | .path _ => true
  | .alias n => (ds.bodies n).isEmpty
  | .meet a b => a.pending ds || b.pending ds
  | .or arms => pendingArms ds arms
  | .ride _ v _ => v.pending ds
  | .call _ args => pendingItems ds args
  | .select s _ _ => s.pending ds
  | .filter s _ => s.pending ds
  | _ => false
```

In `a: "ab_cd", b: nom($.a), c: $.b.camel` the first round holds `b`
as the call itself, which waits on `$.a`. The second reads `$.a` as
`"ab_cd"`, so `b` is the map of spellings, and the third reads
`$.b.camel` as `"abCd"`:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- The term a written path names in the first of the roots it names
something in. -/
def Decls.pathIn (ds : Decls) (roots : List Val) (p : List Seg) : Option Val :=
  roots.findSome? fun root => ds.pathAt root p
```

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- The declarations a document's paths make: each path's name, declared
as the term at the path in the first of the roots it names something
in, with that term's own paths read as names too. A path to nothing
declares nothing. -/
def Decls.ofPaths (ds : Decls) (roots : List Val) (ps : List (List Seg)) : Decls :=
  ps.filterMap fun p => (ds.pathIn roots p).map fun w => (pathName p, w.pathsToAliases)
```

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- The document with its paths read as names from roots: each path is
declared as the term at it in the first root it names something in, and
the bodies and the schema refer to the names. -/
def Decls.withPathsFrom (ds : Decls) (S : Val) (roots : List Val) : Decls × Val :=
  (ds.map (fun d => (d.1, d.2.pathsToAliases)) ++ ds.ofPaths roots (ds.docPaths S), S.pathsToAliases)
```

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def Decls.rounds (ds : Decls) (S : Val) (r : Decls → Val → Val) : ℕ → List Val
  | 0 => [r ds S]
  | n + 1 =>
    let rs := ds.rounds S r n
    let d := ds.withPathsFrom S rs
    rs ++ [r d.1 d.2]
```

A path keeps the term the first round that reaches it holds there,
since a later round has read that term's own paths: a path whose term
holds the path itself, as `"c"?: $.a.b` under `a.b` does, would
otherwise unfold once more each round the data meets it. A round that
reaches no new path then changes nothing after it, and each round
reaches one more step of a chain of paths, so as many rounds as the
document writes paths reach the end of every chain. Two sets of roots serve: the schema alone, for
the error class, and the schema met with the data, for the rest. A
contradiction the data brings, `a: 1` met with `"a": 2` where `b: $.a`
reads it, is the data's fault, invalid, and not an ill-formed schema:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def Decls.rootsS (ds : Decls) (S : Val) : List Val :=
  ds.rounds S (fun d T => normaliseD d (d.readU T)) (ds.docPaths S).length
```

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def Decls.rootsD (ds : Decls) (S : Val) (j : Data) : List Val :=
  ds.rounds S (fun d T => normaliseD d (meetD d (d.readU T) j.term)) (ds.docPaths S).length
```

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- The document with its paths read as names from the schema alone,
from its own tree, which is what the error class is judged on. -/
def Decls.withPathsS (ds : Decls) (S : Val) : Decls × Val :=
  ds.withPathsFrom S (ds.rootsS S)
```

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- The document with its paths read as names from the data too, from
the tree the data reads in, which is what the other classes are judged
on. -/
def Decls.withPaths (ds : Decls) (S : Val) (j : Data) : Decls × Val :=
  ds.withPathsFrom S (ds.rootsD S j)
```

The verdict of a document whose paths are absolute is then the verdict
of step 14 on the document with its paths read as names:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- The verdict of a document whose paths are absolute, its schema `S`
as the schema alone reads it and `S'` as the data does. It is an `error`
where a path of `S` does not resolve in the schema's own tree, or where
the document is an error with its paths read from the schema alone: a
name declared nowhere, a cycle, a `nil` in the schema. Otherwise the
paths of `S'` read from the data too, and the document is `invalid`
where that reading is dead or an error, since the data made it so, and
`valid` or `incomplete` as that reading is. -/
def VetA (m : Mode) (ds : Decls) (S S' : Val) (j : Data) : Verdict → Prop
  | .error => ¬ ds.Resolves S ∨ Vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j .error
  | .invalid =>
    ds.Resolves S ∧ ¬ Vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j .error ∧
      (Vet m (ds.withPaths S' j).1 (ds.withPaths S' j).2 j .invalid ∨
        Vet m (ds.withPaths S' j).1 (ds.withPaths S' j).2 j .error)
  | v =>
    ds.Resolves S ∧ ¬ Vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j .error ∧
      Vet m (ds.withPaths S' j).1 (ds.withPaths S' j).2 j v
```

A path that starts with dots is relative. Its first dot names the map
or list that holds it, and each further dot climbs one step, so in
`z: {x: 1, y: {w: ..x}}` the path `..x` reads `z`'s `x`, and in
`a: [1, .0]` the path `.0` reads `a`'s first element. Both
engines read such a path where it's written, so the definition makes
each absolute where it stands before anything else reads the document.
A map's member stands one key down and a list's element one index down,
as step 29 places a key:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- The term standing at `pos`, each relative path it writes made
absolute where it stands, its dots climbing as many steps: a map's
member stands one key below the map and a list's element one index
below, as `resolveD` places a key. A path that climbs past the top stays
as written, and resolves nowhere. A spread that is a path stands where
its members do (`plBare`). A `filter`'s condition stands where the
member it tries lands, one step below the filter, a step no written
path names (`.up 0`): a path that climbs out of the member names the
same place for every member, and one that stays inside it keeps the
step and names nothing, as both ports read it. Any other spread and a
template keep theirs as written, since each stands at a position the
written document doesn't name. -/
def Val.placed (pos : List Seg) : Val → Val
  | .path (.up n :: p) => if n ≤ pos.length then .path (pos.take (pos.length - n) ++ p) else .path (.up n :: p)
  | .len c => .len (c.placed pos)
  | .map fs spread closed => .map (plFields pos fs) (plBare pos spread) closed
  | .list items spread closed => .list (plElems pos 0 items) (plBare pos spread) closed
```

The definition places a body at its name's own place, `%` and the name
as a key at the top, as both engines place it:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def Decls.placed (ds : Decls) (S : Val) : Decls × Val :=
  (ds.map (fun d => (d.1, d.2.placed [.key ("%" ++ d.1)])) ++ (S.bares []).map fun p => (bareName, .path p),
    S.placedT [])
```

So `%T = {y: .x}` reads `$.%T.x`, which no document holds, and the path
is an error, while `..x` in the same body climbs to the document's own
`x`. The schema's spreads stay as written (`Val.placedT`), since a
spread reads its relative paths at each member it holds, and a spread
that's itself a relative path also reads where it's written, at the
place `Val.bares` collects: step 38 comes to both, and to a generator's
template, which reads its relative paths at each member of its output.
A `filter`'s condition stands where the member it tries lands, as step
29 says of `key()`, and no written path names that step. So a relative
path that climbs out of the member names the same place for every
member: in `a: {lim: 2, l: [1, 2, 3], f: filter(.l, ..lim)}` the
condition reads `a`'s `lim`, and `f` is `[2]`. A path that stays inside
the member names nothing. Both engines try a condition on each member
and keep the members it admits, so a condition that names nothing
refuses each member rather than making the document an error, and the
definition forgives every reference in a condition as it forgives the
one at the top of `maybe`. Rows from fc0 on of
`test/spec/def-path.tsv` hold these readings in the three modes of
`vet`, and both engines answer every one as the definition does. Once it
reads in the sources a document
loads, which step 39 comes to, the verdict of a document with paths
prepares it: it
declares the relation kind, which step 37 comes to, places the
document, hides the sources its moves read, which step 35 comes to,
meets its links' templates into their targets, which step 36 comes to,
and reads its spreads at each member, which step 38 comes to:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- The verdict of a document with paths whose sources are read in: the
document prepared (`Decls.prepared`), the relation kind declared, its
relative paths placed, the sources its moves read hidden, its links'
templates met into their targets and its spreads read at each member,
the verdict of the document whose paths are absolute. The error class
reads a spread at the members the schema's own tree holds, and the
others at those of the tree the data reads in, so that a member the
data alone supplies makes the document `invalid`, never an `error`. -/
def VetL (m : Mode) (ds : Decls) (S : Val) (j : Data) (v : Verdict) : Prop :=
  VetA m (ds.preparedS S).1 (ds.preparedS S).2 (ds.preparedD S j) j v
```

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- `vetL` computes `VetL` on every document whose bodies and schema
read no pattern and no format. -/
theorem vetL_iff {m : Mode} {ds : Decls} {S : Val} {j : Data} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) (v : Verdict) : vetL m ds S j = v ↔ VetL m ds S j v :=
  vetA_iff (ds := (ds.preparedS S).1) (S := (ds.preparedS S).2) (S' := ds.preparedD S j)
    (Decls.placed_bodies_checkableA (S := S) (Decls.withRel_checkableA hb))
    (Decls.prepared_checkableA hb hS _) (Decls.prepared_checkableA hb hS _) v
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
  | .absent, b => absentOr (rec .any b)
  | a, .absent => absentOr (rec a .any)
  | .nothing, b => nothingOr b
  | a, .nothing => nothingOr a
  | .meet a₁ a₂, b => rec a₁ (rec a₂ b)
  | a, .meet b₁ b₂ => meetRight rec a b₁ b₂
  | .ride k v r, b => .ride k (rec v b) r
  | a, .ride k v r => .ride k (rec a v) r
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
zero: it admits nothing, so nor does any meet with it. Absence, step
33's, is the unit, but met with `any` it stays absence. `nothing`,
step 20's atom over an argument outside its domain, stays itself met
with `any` and is `nil` met with anything else. A meet on either
side is met one side at a time, and on the right `meetRight` tries each
atom against each other once: `a` meets `b₁`, and where the two had
nothing to say to each other, such as `min(1)` and `max(9)`, `a` meets
`b₂` instead, and the pair is never taken up in another association,
which the two rows would otherwise do without end. A rider of step 19
carries the meet of its value, so its record rides the result. A
disjunction meets a peer arm by arm,
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
position where the specific side declares a default, the general side
must declare one that singles out the same value. A preference declares
a default, and so does a disjunction with a preferred arm. A rider,
which step 19 comes to, declares what its value declares:

<!-- test: quote spec/Aontu/Subsume.lean -->
```lean
def Val.declaresDefault : Val → Bool
  | .pref _ _ => true
  | .or arms => (pickRank arms).isSome
  | .ride _ v _ => v.declaresDefault
  | _ => false
```

<!-- test: quote spec/Aontu/Subsume.lean -->
```lean
def DefaultsLe (env : Env) (a b : Val) : Prop :=
  a ⊑[env] b ∧
    ∀ (p : List Seg) (wa wb : Val), (normalise a).at p = some wa → wa.declaresDefault = true →
      (normalise b).at p = some wb →
      ∀ (root j : Data), Output env root wa j → wb.declaresDefault = true ∧ Output env root wb j
```

`*2 | number` and `*1 | number` admit the same numbers, so the first
is below the second in the order, and `defaults` tells them apart,
since the first singles out `2` where the second singles out `1`:

<!-- test: quote spec/Aontu/Subsume.lean -->
```lean
theorem defaults_sees_the_default :
```

Wrapping the first in a rider changes nothing: `meta(*2 | number, {})`
isn't below `*1 | number` under `defaults` either.

<!-- test: quote spec/Aontu/Subsume.lean -->
```lean
theorem defaults_sees_through_riders :
```

A literal singles out its own value, and declares no default, so
`defaults` asks nothing more of the general side. `integer` over `1`
holds under `defaults` as it does under `values`, which is how the
reference defines an effective default and how both ports answer:

<!-- test: quote spec/Aontu/Subsume.lean -->
```lean
theorem DefaultsLe.of_lit {s : Scalar} {b : Val} (h : .lit s ⊑[env] b) :
    DefaultsLe env (.lit s) b := by
```

`gen` asks that, and that the marks agree at every position both sides
have, a container's spread among them, since a mark, `type()` or
`hide()`, decides what the output holds, as step 13 shows:

<!-- test: quote spec/Aontu/Subsume.lean -->
```lean
def MarksAgree (a b : Val) : Prop :=
  ∀ (p : List MarkSeg) (wa wb : Val), (normalise a).atM p = some wa → (normalise b).atM p = some wb →
    wa.hasMark .type = wb.hasMark .type ∧ wa.hasMark .hide = wb.hasMark .hide
```

So `hide(integer)` and `integer` are below each other in the order and
not under `gen`, which `hide_not_genLe` proves, and
`hide_spread_not_genLe` proves the same of two maps' spreads.

The order has rows of its own, `test/spec/def-subsume.tsv`: every pair
of fifty-eight values, the general first, with the answers the `values`
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

The definition decides the other two profiles position by position.
`defaultsAt` decides what `defaults` asks at one position, reading each
side's output through `output_iff`:

<!-- test: quote spec/Aontu/Subsume.lean -->
```lean
def defaultsAt (a b : Val) : Bool :=
  !a.declaresDefault ||
    (decide (normalise a).Checkable &&
      match output a with
      | some j => b.declaresDefault && decide (normalise b).Checkable && decide (output b = some j)
      | none => true)
```

`defaultsBelow` asks it at every position both sides have, the keys and
the indexes `Val.at` reads. Where `leDecF` proves the order and the
walk fails nowhere, `defaultsLe_of_walk` proves `DefaultsLe`, and one
position where it fails refutes it. `marksAt` and `marksBelow` do the
same for the marks, a spread included, for `gen`. Their rows are f0 on
under `defaults` and w0 on under `gen`, and both engines answer them as
the contracts allow but one: under `defaults` they compare a default at
a map member and not at a list position, so `[number]` over
`[*1 | number]` subsumes for them, which #424 tracks.

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

A spread on the general side holds every member the specific side can
have. So the specific side's declared values must each be below it,
and its other members must be covered: refused by a seal, or held by
its own spread, which must itself be below the general one. A specific
side that is open with no spread admits any member, so it is below only
a spread that admits any. Neither spread may read the key, step 19's
`key(0)`, since a spread that does is another term under each key, and
`leDecF` proves no such pair:

<!-- test: quote spec/Aontu/Subsume.lean -->
```lean
theorem map_le_spread {fsg fss : List (String × Bool × Val)} {sps : Option Val} {sg : Val}
    {cs cg : Bool}
    (hk : ∀ k og vg, (k, og, vg) ∈ fsg →
      ∃ os vs, (k, os, vs) ∈ fss ∧ vs ⊑[env] vg ∧ (og = false → os = false))
    (hc : cg = true → cs = true ∧ ∀ k os vs, (k, os, vs) ∈ fss → ∃ og vg, (k, og, vg) ∈ fsg)
    (hv : ∀ k os vs, (k, os, vs) ∈ fss → vs ⊑[env] sg)
    (ho : cs = true ∨ ∃ ss, sps = some ss ∧ ss ⊑[env] sg)
    (hkg : sg.keyed = false) (hks : ∀ ss, sps = some ss → ss.keyed = false) :
    .map fss sps cs ⊑[env] .map fsg (some sg) cg := by
```

Its rows found a false negative in both engines: `{&: integer}` is
above `close({"x": integer})`, whose only instances are maps holding
one integer under `x`, and both engines answer `does_not_subsume`,
comparing the sealed side's missing spread as `any`. Those rows sit in
the ledger with the engines as the side that moves.

The constraints have a table of their own in the reference, and its
rows are theorems too: an interval is below another that contains it,
`neq` of fewer values is above `neq` of more, `len` follows its count,
and a concrete number is below exactly the bounds that admit it:

<!-- test: quote spec/Aontu/Subsume.lean -->
```lean
theorem min_le_min_iff (n m : Number) : .min (.num n) ⊑[env] .min (.num m) ↔ m.le n := by
```

`mulof(a)` is below `mulof(b)` where `a` is itself a multiple of
`b`, since every multiple of `a` is then one of `b`:

<!-- test: quote spec/Aontu/Subsume.lean -->
```lean
theorem mulof_le_mulof {a b : Number} (hb : b.Positive) (hab : a.multipleOf b) :
    .mulof a ⊑[env] .mulof b := by
```

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
written `*a`, `2` for `**a`. The rank picks the output, which step 13
reads, and admission ignores it:

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
  whose length is its positions'; the spread holds every element, read
  under the element's position as a string (`namedItems`). It refuses a
  value that is no list, and a list that breaks any one of those. -/
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
  | .number | .string | .anyString | .boolean | .mapKind | .listKind | .pathKind | .any | .absent
  | .nothing => .any
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
out, which the next step reads, and the test rows of step 15 stay where
the two agree.

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
f: { x?: {} y:1 }
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
  ],
  "f": {
    "y": 1
  }
}
```

`a` singles out its preferred arm. `b` singles out `1` too: an arm
that is itself a disjunction of rank `0` brings its own arms, so the
preference inside it counts. `c` writes the optional key whose value
singles out something and leaves out the one whose value does not. `d`
is the fill of the data `{}` by the schema `{x: *1}`, which is how
`vet` reads a default, as the end of step 12 says. `e` meets its
position with the spread. `f` leaves out `x`, an optional key whose
value is an empty map.

`spec/Aontu/Output.lean` states this as `Gen`, a relation by recursion
on the term:

<!-- test: quote spec/Aontu/Output.lean -->
```lean
/-- `v` generates `j`. -/
def Gen (env : Env) (root : Data) : Val → Data → Prop
  | .lit s, j => j = s.data
  | .addr a, j => j = .addr a
  | .map fs spread _, j =>
    keysDistinct fs = true ∧ ∃ ms, genFields env root spread fs ms ∧ j = .map (sortMembers ms)
  | .list items spread _, j => ∃ xs, genItems env root spread 0 items xs ∧ j = .list xs
  | .or arms, j => arms.any (picked arms) = true ∧ genArms env root arms arms j
  | .pref _ x, j => Gen env root x j
  | .ride _ v _, j => Gen env root v j
  | .meet a b, j =>
    (Gen env root a j ∧ Admits env root b j) ∨
      ((∀ j', ¬ Gen env root a j') ∧ Gen env root b j ∧ Admits env root a j)
  | .integer, _ | .float, _ | .biginteger, _ | .bigdecimal, _ | .number, _ | .string, _
  | .anyString, _ | .boolean, _ | .mapKind, _ | .listKind, _ | .pathKind, _ | .min _, _ | .max _, _
  | .above _, _ | .beneath _, _ | .neq _, _ | .mulof _, _ | .len _, _ | .unique _, _
  | .re _, _ | .format _, _ | .grammar _, _
  | .any, _ | .absent, _ | .nil, _ | .nothing, _ | .alias _, _ | .path _, _ | .nof _ _, _ | .must _ _, _
  | .when _ _ _, _ | .contains _ _, _ | .rest _ _, _ | .select _ _ _, _ | .filter _ _, _
  | .key, _ | .keyUp _, _ | .call _ _, _ | .hole, _ => False
```

Read `Gen env root v j` as *`v` generates `j`*. A literal generates
its value. A map generates a map whose members `genFields` lists, in
declaration order and then in key order: a key whose value generates a
value the spread admits under the key is written with it, an optional key whose value
generates none such is left out, and a required key whose value
generates none such leaves the map with no output at all. An optional
key whose value generates an empty map or list leaves no member either,
so `{a?: {}}` generates `{}`. A list
generates each position, `genItems`. A disjunction generates what the
arms the rank rule picks all generate, `genArms` over `picked`: of the
live arms, those of the lowest positive rank, or every live arm where
none has one. So `*1 | 2` generates `1`, `1 | 1` generates `1`, and
`1 | 2` and `*1 | *2` generate nothing. A preference generates what its
value generates. A meet left as written, two atoms or a container with
a constraint, generates what its left side generates and its right
admits, or the other way about where the left generates nothing. A
kind, a bound, `any`, absence, `nil`, `nothing`, an alias and a path
generate nothing.

`Output` reads `Gen` off the visible part of the normal form of step
10, where every meet is computed and every dead arm dropped. The visible
part, the end of this step's, is the normal form itself for a term with
no mark:

<!-- test: quote spec/Aontu/Output.lean -->
```lean
/-- What evaluation singles out for `v`: what the visible part of the
normal form of `v`, every meet computed and every dead arm dropped,
generates. -/
def Output (env : Env) (root : Data) (v : Val) (j : Data) : Prop :=
  Gen env root (normalise v).visible j
```

Two theorems say what that output is:

<!-- test: quote spec/Aontu/Output.lean -->
```lean
/-- What evaluation singles out is an instance. -/
theorem output_admits (v : Val) (j : Data) (h : Output env root v j) :
    Admits env root (normalise v).visible j :=
  gen_admits _ j h
```

<!-- test: quote spec/Aontu/Output.lean -->
```lean
/-- Evaluation singles out one value. -/
theorem output_unique (v : Val) (j j' : Data) (h : Output env root v j) (h' : Output env root v j') :
    j = j' :=
  gen_unique _ j j' h h'
```

`output_admits` says what evaluation singles out is an instance of
the term's visible part, which for a term with no mark is the term, so
a filled default never writes a value the schema refuses. `output_unique` says there is at most one. A
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

/-- What is singled out is an instance of the visible part of the normal
form, `output_admits`, which for `*8080 & min(1024)`, holding no mark, is
the normal form itself: the term admits `8080`. -/
example : Instance .empty port (.integer 8080) :=
  ⟨by decide, (admits_normalise port _).mp
    ((show (normalise port).visible = normalise port from rfl) ▸
      output_admits port _ ((output_iff (by decide) _).mp rfl))⟩
```

The last example is `output_admits` at work: `8080` is what
`*8080 & min(1024)` singles out, so it is an instance, since a term
with no mark is its own visible part.

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

### The marks

`type()` and `hide()` mark a value. Neither changes what the value
admits, and both change what evaluation writes: evaluation leaves a
member of a map whose value carries a mark out of the output, though
the member still meets what the data holds at its key. A mark belongs
to the place it's written at, so a reference, which step 8 reads, copies
a body without its marks. Write `marks.aontu`:

<!-- test: scenario marks -->
<!-- test: file marks.aontu -->
```aontu
v: { a:hide(1) b:2 c:type({ d:integer }) }
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu marks.aontu
{
  "v": {
    "b": 2
  }
}
```

A mark is a rider, `ride` with the call `type` or `hide` and no record,
so it judges every datum as its value does, as the riders of step 19
do, and it rides every meet: `{a: integer} & {a: hide(1)}` leaves `a`
out too. Evaluation generates what it singles out from the term's
visible part, in which a member left out of the output, `leftOut`, is
optional and holds anything: a marked member, and an absent member,
step 33's:

<!-- test: quote spec/Aontu/Output.lean -->
```lean
def visibleFields : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (if v.leftOut then (k, true, .any) else (k, o, v.visible)) :: visibleFields fs
```

A map's marked spread holds anything the same way. A mark on a list's
element changes nothing. Both engines leave a marked element out of the
output too, which no reading by position admits, and the definition has
no rule for it yet. Both also drop a mark that a key's
second declaration carries where the first declaration's value is the
meet's answer, which #420 records, so `{a: integer} & {a: hide(integer)}`
against `{}` is `incomplete` in both, and the ledger names the engines
as the side that changes.

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
declare, where its names break the alias-cycle rule, where an
`ident()` stands out of its place, or where the schema's normal form
does not stand; `invalid` where the meet of the schema with the data as
a term is dead, or refuses, read whole, the value it gives with its
trials and sizes unread; `valid` where the meet singles out a value,
and without the fill where the data as written is an instance of the
visible part of the schema's normal form too, or where `--partial` lets
the unresolved pass; and `incomplete` otherwise. -/
def Vet (m : Mode) (ds : Decls) (S : Val) (j : Data) : Verdict → Prop
  | .error => ¬ ds.Declares S ∨ ¬ ds.Guarded ∨ ds.illFormedR S = true
  | .invalid =>
    ds.Declares S ∧ ds.Guarded ∧ ds.illFormedR S = false ∧
      ((normaliseD ds (meetD ds (ds.readR S) j.term)).dead = true ∨
        RefusedAt ds j (normaliseD ds (meetD ds (ds.readR S) j.term)))
  | .valid =>
    ds.Declares S ∧ ds.Guarded ∧ ds.illFormedR S = false ∧
      (normaliseD ds (meetD ds (ds.readR S) j.term)).dead = false ∧
      ¬ RefusedAt ds j (normaliseD ds (meetD ds (ds.readR S) j.term)) ∧
      (m.lax = true ∨
        ∃ j', OutputD ds j (meetD ds (ds.readR S) j.term) j' ∧
          (m.fill = true ∨ Admits ds.envE j (normaliseD ds (ds.readR S)).visible j))
  | .incomplete =>
    ds.Declares S ∧ ds.Guarded ∧ ds.illFormedR S = false ∧
      (normaliseD ds (meetD ds (ds.readR S) j.term)).dead = false ∧
      ¬ RefusedAt ds j (normaliseD ds (meetD ds (ds.readR S) j.term)) ∧
      m.lax = false ∧
      ¬ ∃ j', OutputD ds j (meetD ds (ds.readR S) j.term) j' ∧
        (m.fill = true ∨ Admits ds.envE j (normaliseD ds (ds.readR S)).visible j)
```

Read the four in order. `error` is a document that refers to a name it
doesn't declare, one whose names break the alias-cycle rule, one with
an `ident()` out of the place step 8 gives it, or a schema or a
declaration's body whose normal form doesn't stand. The clauses that
aren't about names are one check:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def Decls.illFormedR (ds : Decls) (S : Val) : Bool :=
  ds.identMisplaced S || ds.bodyIll || (normaliseD ds (ds.readR S)).illFormed
```

An `ident()`'s place belongs to the text, so the check reads the
document as written: the schema, and every declaration's body with the
layer `unident` takes off. It holds a body no reference reads to the
place too, as both ports answer, so `%T = {x: ident(integer, {})}`
beside `v: 1` is an `error`:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def Decls.identMisplaced (ds : Decls) (S : Val) : Bool :=
  S.idents || ds.any fun d => d.2.unident.idents
```

Every declaration's body is read too, whether or not a reference
reaches it, so `%T = 1 & 2` beside `v: 1` is an `error`, as both
engines answer (decision 17 of the design note's §7). The body is read
where no place is yet, as the roots that paths read are
(`Decls.readU`, which step 29 comes to), as the name and as the body
itself, so that a recursive body is read too. A hole or a `key(n)`
waits for the use that places it, so the check reads each part that
holds one as what any place could make of it (`Val.unplaced`), in every
body at once: a hole as `any`, and a `key(n)` as any string, since a
key is text wherever it lands. So `%T = upper(_) & (1 & 2)` is still an
`error` for the conflict beside the hole, and so is `%T = key(1) & 1`,
while `%T = key(1) & ""` stands, as both engines answer. A body that
names a waiting body waits too, through a call or another name, so
`%T = %U` and `%T = add(%U, 1)` beside `%U = upper(_)` stand, while
`%T = add(%U, 1 & 2)` is an `error`, as both engines answer.
`Decls.waitNames` finds those names to a fixed point. Both engines read a
waiting `key(n)` at the declaration's own name, though, which #528
tracks, and the definition reads it as waiting. And both skip a
conflict met with a call that waits through a name, so they answer
`valid` for `%T = add(%U, 1) & (1 & 2)`, which the definition reads as
an `error` and #530 tracks.

A call or a trial that waits for its hole still reads the arguments
both engines read as written: a call's own, a size, the count of `nof`
and `contains`, the condition of `must`, and the data, selection,
scrutinee or source of `each`, `emit`, `match` and `filter`. Where one
of them doesn't stand, read against the bodies with each waiting part
read so, the call is `nil`, and so is a call with another count of
arguments than its function takes (`Fn.takes`). So the definition
reads `%T = add(_)` as an `error`, as it reads `v: add(1)`, where both
engines answer `invalid`, the split #426 tracks. So `%T = contains(upper(_), 1 & 2)` is an `error`, and
`add(upper(_), 1 & 2) | 3` holds an arm that dies. A trial's branches
and a template wait with the call, since the engines read them later,
so `%T = when(upper(_), 1 & 2)` stands. A template's hole and `key(n)`
are its member's (`Val.waits`), so the check reads
`%T = each(["a"], upper(_) & (1 & 2))` whole, an `error`, and an
`emit`'s table is its node's, so the check reads an `emit` over a
selection written in place whole too. A name a
source publishes is read where a destructure takes it, so not here:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def Decls.bodyIll (ds : Decls) : Bool :=
  let ws := ds.waitNames
  let w : String → Bool := fun n => ws.contains n
  let d0 : Decls := ds.map fun d => (d.1, d.2.unplaced w fun _ => false)
  let ill : Val → Bool := fun t => (normaliseD d0 (d0.readU t)).illFormed
  let du : Decls := ds.map fun d => (d.1, d.2.unplaced w ill)
  du.any fun d => d.1.toList.head? != some '!' &&
    ((normaliseD du (du.readU (.alias d.1))).illFormed || (normaliseD du (du.readU d.2)).illFormed)
```

A normal form doesn't stand, `illFormed`, where it holds a `nil`
anywhere but in a spread, which the engines read only against a member,
a preference clash, or a size its container literal breaks. A
preference clash is two picked arms that single out different values:

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
```

A size breaks a container literal where its upper half refuses the
literal's count. Members only accumulate, so a literal longer than its
size allows can never meet it, and both engines refuse the schema at
the meet: `len(max(1)) & {x: 1, y: 2}` is an `error`. A literal short
of its size may still grow, by the data or by another literal, so the
size's lower end waits for generation: `len(2) & [1]` is `invalid`
against `[1]` and `valid` against `[1, 2]`. The upper half reads an
exact size as its upper end:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def Val.upperHalf : Val → Val
  | .min _ | .above _ => .any
  | .lit (.num x) => .max (.num x)
  | .meet a b => .meet a.upperHalf b.upperHalf
  | .or arms => .or (upperArms arms)
  | v => v
```

The count is what generates, so `{x: 1, y?: integer}` counts one, and
the size counts a meet's literals after meeting them, so
`len(neq(2)) & {x: 1, y: 2} & {z: 3}` counts three:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def sizeClash (cs : List Val) : Bool :=
  match (cs.filter fun v => v.genCount.isSome).foldl meet .any |>.genCount with
  | none => false
  | some n =>
    if h : IntegerLeaf n then
      cs.any fun v => match v with
        | .len c => !check c.upperHalf (.num (.integer ⟨n, h⟩))
        | _ => false
    else false
```

Only the lower end waits. The meet decides an exclusion or a multiple
with the upper end, so `len(neq(2)) & {x: 1, y: 2}` is an `error`
though the data `{"x": 1, "y": 2, "z": 3}` would meet it, as both
engines answer. A size is a conjunction of integers, bounds, exclusions
and multiples, so one that still holds a choice once in normal form,
`len(1 | 3)`, `len(*1)` or `len(type(1 | 3))`, is ill-formed whatever
it meets, as both engines answer too (decision 16 of the design note's
§7). A choice the meet or a dead arm settles to one arm is that arm,
and two arms written alike are one, so `len(1 & (1 | 3))` and
`len(1 | 1)` are each `len(1)`:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def Val.choiceLeft : Val → Bool
  | .or ((0, a) :: arms) => arms.any fun p => p.1 != 0 || !a.sameArm p.2
  | .or _ => true
  | .pref _ _ => true
  | .meet a b => a.choiceLeft || b.choiceLeft
  | .ride _ v _ => v.choiceLeft
  | _ => false
```

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def Val.sizeIll (c : Val) : Bool := (normalise c).choiceLeft
```

`illFormed` reads each size, the sizes of a meet once, whole, and each
of the meet's conjuncts as it reads a term:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def Val.illFormed : Val → Bool
  | .nil => true
  | .len c => c.sizeIll
  | .map fs _ _ => illFields fs
  | .list items _ _ => illItems items
  | .or arms => clash arms || illArms arms
  | .pref _ x => x.illFormed
  | .meet a b => illChain a || illChain b || sizeClash (a.conjuncts ++ b.conjuncts)
  | .ride _ v _ => v.illFormed
  | .call .plus args => args.length != 2 || illItems args
  | .call .join args => (args.length != 1 && args.length != 2) || illItems args
  | .call .pref args => args.length != 1 || illItems args
  | .call _ _ => true
  | .select _ arms _ => illPats arms
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
  | .ride k v r => .ride k v.untried r
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
the schema's visible part too, so a marked member asks nothing of the
data but that it meet the member; `--partial` makes any live meet
`valid`. `incomplete`
is what remains: a live meet that singles out nothing, or a fill the
data lacks. `vet` computes the verdict, and `vet_iff` admits it on
checkable terms, as `check_iff` and `gen_iff` do for theirs.

Three theorems say what the words mean:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- Without the fill, `valid` is `Instance`: the data as written is an
instance of the visible part of the schema as read. -/
theorem vet_strict_valid_instance {m : Mode} {ds : Decls} {S : Val} {j : Data} (hf : m.fill = false)
    (hp : m.lax = false) (hj : j.WellFormed) (h : Vet m ds S j .valid) :
    Instance ds.envE (normaliseD ds (ds.readR S)).visible j := by
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
is an instance of the visible part of the schema met with the data. -/
theorem vet_valid_filled {m : Mode} {ds : Decls} {S : Val} {j : Data} (hp : m.lax = false)
    (h : Vet m ds S j .valid) :
    ∃ j', OutputD ds j (meetD ds (ds.readR S) j.term) j' ∧
      Admits ds.envE j (normaliseD ds (meetD ds (ds.readR S) j.term)).visible j' := by
  obtain ⟨-, -, -, -, -, hp' | ⟨j', hout, -⟩⟩ := h
  · rw [hp] at hp'
    exact nomatch hp'
  · exact ⟨j', hout, outputD_admits _ _ hout⟩
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

So `vet --no-fill` answers `valid` exactly for an instance of the
schema's visible part, step 2's question where the schema holds no
mark; `vet` answers it for a filled value that is an instance of the
visible part of the schema met with the data; and `invalid` refuses the data as written or as filled,
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
no declaration, where a document reads as itself, its visible part the
normal form of `[*1]`. -/
example : Instance (Decls.envE [])
    (normaliseD [] (Decls.readR [] (.list [.pref 1 (.lit (.num (.integer (.of 1))))] none false))).visible
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
optional key. The sizes met with container literals follow in rows
`l0` on, the cases of `lenCases`, and both engines answer every one as
the definition does.

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
    if h : IntegerLeaf (countWith u cs j) then checkWith u none n (.num (.integer ⟨countWith u cs j, h⟩))
    else false
  | .must c _, j => checkWith u none c j
  | .when c t e, j => if checkWith u none c j then checkWith u none t j else checkSpreadWith u e j
  | .contains c n, j => match j.members with
    | some ms =>
      if h : IntegerLeaf (ms.countP fun x => checkWith u none c x) then
        checkWith u none n (.num (.integer ⟨ms.countP fun x => checkWith u none c x, h⟩))
      else false
    | none => false
  | .rest t cs, j => match j.named with
    | some ns => ns.all fun m => restEvaluatedWith u cs j m.1 m.2 || checkWith u none t m.2
    | none => true

/-- The branches of a trial that admit the datum, counted. -/
def countWith (u : String → Data → Bool) : List Val → Data → ℕ
  | [], _ => 0
  | c :: cs, j => (if checkWith u none c j then 1 else 0) + countWith u cs j
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
unfilled hole does. The reading carries `b`, the member a hole in a
template reads as, which step 27 covers, and `here`, the position a
term stands at, which step 29 covers:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- A term with its selections made, `b` the member a generator's
template is read for, which each hole in the template stands for, and
`here` the position the term stands at, where one is placed: each
`match` whose scrutinee generates a value is the result its arms select
for it, and each `filter` whose source generates a container is the
members its condition admits, as a term, or `nil` where the source
generates a scalar, which has no members. One whose scrutinee or source
generates nothing stays, and generates nothing. An `each` is the list of
its template read for each member of its data, in the order `Val.members`
reads them, less each reading that is absence, and `nil` where the data
is no bag. A `pack` is the open map
of its template read for each member `Val.keyedMembers` reads, under the
member's key, the instances of a repeated key met, and `nil` where the
data is no bag or a list holds anything but a string. An `emit` is the
list of the pieces its table makes of each member of its selection, in
the order `Val.members` reads them, its `match`es read for no member and
its bodies for the member, each hole and each reference into the node
bound to it (`nodeRef`), and stays as written, a call no reading makes,
where a template lacks its `match` or a list for its `body`, the selection is no
bag, or a member makes no pieces (`emitPieces`). A `maybe` is
what `maybeOf` makes of its argument, and a call, a generator, a
selection or a `filter` that takes absence is absence, as a list holds
no position for an element that is absence. A call or a generator
handed a reference that names nothing yet (`Val.pending`) waits, as a
later round of the paths may declare it. Any other call, its
arguments resolved, is the term `callTerm` makes of it. A spread has no
hole, and a `filter`'s condition and a template are read for their own
members, so none of them is read for `b`. Each `key(n)` reads `here`, by
`keyUpAt`: a template stands at the position its instance lands at, the
member's index or key below the call, and a `filter`'s condition where
the member it tries lands, under its key or at the index it takes among
those kept. A term read with no position keeps its keys as written, and
a selection whose arms hold a key, a call or a generator whose arguments
hold one, and a `filter` whose condition does stay as written too, so
that a path copies them to be read where it lands. A size over a term
outside `len`'s domain (`Val.unsized`) is the atom that admits nothing,
as a bound over one is (`bndOf`), so that both refuse at the meet. -/
def resolveD (ds : Decls) (b : Option Val) (here : Option (List Step)) : Val → Val
  | .select s arms d =>
    let s' := resolveD ds b here s
    let arms' := resolvePairs ds b here arms
    let d' := resolveSpread ds b here d
    match genD ds s' with
    | some x => if callPairs arms' || here.isNone && keyPairs arms' then .select s' arms' d' else selectArm ds x arms' d'
    | none => if (normaliseD ds s').isAbsent then .absent else .select s' arms' d'
  | .filter s c =>
    let s' := resolveD ds b here s
    if here.isNone && c.holdsKey then .filter s' c else
    match genD ds s' with
    | some (.map fs) => (Data.map (fs.filter fun m =>
        checkR ds (resolveD ds (some m.2.term) (stepped here (.seg (.key m.1))) c) m.2)).term
    | some (.list xs) => (Data.list (keptAt (fun i x =>
        checkR ds (resolveD ds (some x.term) (stepped here (.seg (.idx i))) c) x) 0 xs)).term
    | some _ => .nil
    | none => if (normaliseD ds s').isAbsent then .absent else .filter s' (resolveD ds none none c)
```

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- How a document reads: its term expanded, with its selections made and
each key placed, the document standing at the top. -/
def Decls.readR (ds : Decls) (S : Val) : Val := resolveD ds none (some []) (ds.read S)
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
/-- A `filter` read at a position over a list keeps the elements its
condition admits, in their order, the condition read for each element
it tries, at the index the element takes among those kept. -/
theorem resolveD_filter_list {ds : Decls} {b : Option Val} {pos : List Step} {s c : Val}
    {xs : List Data} (h : genD ds (resolveD ds b (some pos) s) = some (.list xs)) :
    resolveD ds b (some pos) (.filter s c) =
      (Data.list (keptAt (fun i x =>
        checkR ds (resolveD ds (some x.term) (stepped (some pos) (.seg (.idx i))) c) x) 0 xs)).term := by
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
  | mapKind : Checkable .mapKind
  | listKind : Checkable .listKind
  | pathKind : Checkable .pathKind
  | lit {s : Scalar} : Checkable (.lit s)
  | addr {a : Addr} : Checkable (.addr a)
  | min {b : Bound} : Checkable (.min b)
  | max {b : Bound} : Checkable (.max b)
  | above {b : Bound} : Checkable (.above b)
  | beneath {b : Bound} : Checkable (.beneath b)
  | neq {vs : List Bound} : Checkable (.neq vs)
  | mulof {d : Number} : Checkable (.mulof d)
  | len {c : Val} : Checkable c → Checkable (.len c)
  | unique {k : Option String} : Checkable (.unique k)
  | grammar {g : String} : Checkable (.grammar g)
  | any : Checkable .any
  | absent : Checkable .absent
  | hole : Checkable .hole
  | nil : Checkable .nil
  | nothing : Checkable .nothing
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
is `checkWith` with a hook that answers `false` for every name, and no
key, whose first cases are:

<!-- test: quote spec/Aontu/Check.lean -->
```lean
/-- Whether `v` admits `j`, computed: `v.atKeyO k` judged, with `k` the key a
spread is tried under, which the forms `atKey` reads through carry. -/
def checkWith (u : String → Data → Bool) (k : Option String) : Val → Data → Bool
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
```

The rest of it takes one case for each form in the same way, and a
name goes to the hook. The key is the one a spread is tried under, which
step 19 reads; a spread passes it down, and `key`, `&`, a rider and a
`match` on `key` read it. Nothing in the code says that `check` and
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
  [.any, .nil, .integer, .meet .number (.mulof (.integer (.of 1))), .string, .anyString,
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
tell `integer` from `number & mulof(1)`:

<!-- test: quote test/spec/def-fragment.tsv -->
```tsv
c9618	verdict	v: integer	v: 0d9007199254740993	{"verdict":["invalid","incomplete","error"]}
```

<!-- test: quote test/spec/def-fragment.tsv -->
```tsv
c9626	verdict	v: (number) & (mulof(1))	v: 0d9007199254740993	{"verdict":"valid"}
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
    ∀ j, HookOk u env root v j → Judge env root (checkWith u none v j) v j :=
```

<!-- test: quote spec/Aontu/Check.lean -->
```lean
/-- The checker decides admission, and refusal, for every value it can
check, given a hook that is right where it is asked. -/
theorem checkWith_iff {v : Val} (h : v.CheckableA) (j : Data) (hu : HookOk u env root v j) {b : Bool} :
    checkWith u none v j = b ↔ Judge env root b v j :=
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
      | none => false) none v j
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

`aontu subsume` compares two documents, each with its own declarations,
so the order on documents reads each side as `vet` does, its term
expanded under the environment of its expanded bodies:

<!-- test: quote spec/Aontu/Subsume.lean -->
```lean
def InstanceD (ds : Decls) (S : Val) (j : Data) : Prop := Instance ds.envE (ds.readR S) j

/-- The order on documents: every instance of the specific document is
one of the general document, each read under its own declarations. -/
def LeD (dg : Decls) (g : Val) (ds : Decls) (s : Val) : Prop :=
  ∀ j, InstanceD ds s j → InstanceD dg g j
```

A recursion and its unrolling are below each other, which is the
reference's row for recursive positions. A reference to a name admits
what the expansion of its body admits, so each is below the other:

<!-- test: quote spec/Aontu/Subsume.lean -->
```lean
theorem alias_le_unroll {ds : Decls} {n : String} {body : Val} (h : ds.env n = some body) :
    .alias n ⊑[ds.envE] expand ds body :=
```

Two documents whose readings read no name are ordered as their readings
are under the empty environment, so `leDecD` decides them with
`leDecF`, and the checker that reads the names, `checkR` of step 17,
refutes a pair with one instance. The tenth fragment,
`test/spec/def-subsume-docs.tsv`, compares twenty documents pairwise,
a recursive list of nodes, its unrolling, the plain nodes and two names
recursive through each other among them, and both engines answer as the
contract allows but for nine rows: a recursive general side with an
optional key against an open specific side, where both answer
`subsumes` and `{"n": 1, "next": 5}`, or `{"b": 5}` for the mutual
recursion, is an instance of the specific side alone, the same cause as
the false positive above.

## 19. The forms the importer writes

The definition names no JSON Schema keyword. What `aontu jsonschema
import` writes is an aontu document, so the question is whether every
form it writes is one the definition reads. The oracle answers the
first half: `lake exe oracle forms` lists every constructor of `Val`
with the spelling the printer gives it, into `spec/forms.tsv`:

<!-- test: quote spec/forms.tsv -->
```tsv
min	call	min
max	call	max
above	call	above
beneath	call	below
neq	call	neq
```

A row is the constructor, whether it is spelled as a word, as a call
or as a mark of the grammar, and the spelling; `beneath` prints as
`below`, since Lean keeps `below` for its own use. Before it prints the
rows, the oracle holds each call's spelling to the printer, so the file
cannot drift from the text the engines read.

A test in each port, `ts/test/jsonschema-forms.test.ts` and
`go/jsonschema_forms_test.go`, answers the second half. Each imports
every schema of the JSON Schema test suite in its five dialects, of
the Ajv extra tests and of the SchemaStore subset, with and without
defaults, removes the strings from the output, and reads every call and
every word left. Each must be a row of `spec/forms.tsv`, or of a second
file, `spec/forms-outside.tsv`, which holds a form the importer writes
that the definition lacks. The test
requires each such form still written, so a form that enters the
definition leaves the file. Six began there: `map` and `list` left it
when they became the kinds of step 6, `meta`, `deprecate` and `ident`
when they became the riders, and `key` when it became the term below.
The file is empty now, and its bound is zero. One schema writes all
six. Write `shape.json`:

<!-- test: scenario forms -->
<!-- test: file shape.json -->
```json
{
  "$id": "https://example.com/shape.json",
  "title": "Shape",
  "type": "object",
  "properties": {
    "kind": {"type": "string", "deprecated": true},
    "sides": {"type": "array"},
    "style": {"$ref": "#/$defs/style"}
  },
  "propertyNames": {"pattern": "^[a-z]+$"},
  "$defs": {
    "style": {"$anchor": "style", "type": "object"}
  }
}
```

and import it:

<!-- test: run -->
```sh
$ aontu jsonschema import shape.json
meta(
  {
    %a_style = ident(map, { anchor:"style" defs:"style" })
    kind?: deprecate(empty())
    sides?: list
    style?: %a_style
    &: match(key(0), empty() & re("^[a-z]+$"), any, nil)
  },
  { title:"Shape" }
)
```

`meta`, `deprecate` and `ident` ride a value and change nothing it
admits. They're one form, `ride`, which carries its record, the members
of a map of data, as both ports take no other, and judges every datum
as its value does:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | ride {b : Bool} {k : Rider} {v : Val} {r : Record} {j : Data} :
      Judge env root b v j → Judge env root b (.ride k v r) j
```

so a rider and its value are below each other in the order:

<!-- test: quote spec/Aontu/Subsume.lean -->
```lean
theorem ride_le_iff {k : Rider} {v : Val} {r : Record} {b : Val} :
    .ride k v r ⊑[env] b ↔ v ⊑[env] b :=
```

What reads a term reads through a rider too: a path, step 9's, a
default, step 10's, and the kind that gives a meet its parent, so
`meta(integer, {}) & min(3)` has the parent `integer`, as
`integer & min(3)` has.

The identity alone has a place, the alias's value, as step 8 reads it,
and the import writes it there.

`key(0)` is the key of the member the spread applies to. It's the term
`key`, and a spread is what reads it: the map rule tries the spread on
each member with the key written in,

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
      (∀ s, spread = some s → ∀ k x, (k, x) ∈ jfs → Judge env root true (s.atKey k) x) →
```

and the list rule tries it on each element with the element's position,
`"0"` first. The key goes in at the spread's own position, and through
`&`, the riders and the scrutinee of a `match` to theirs, which is
where the importer writes it:

<!-- test: quote spec/Aontu/Syntax.lean -->
```lean
def Val.atKey (k : String) : Val → Val
  | .key => .lit (.str k)
  | .meet a b => .meet (a.atKey k) (b.atKey k)
  | .select s arms d => .select (s.atKey k) arms d
  | .ride t v r => .ride t (v.atKey k) r
  | v => v
```

Read so, `match(key(0), p, any, nil)` admits a member whose key `p`
admits and refuses the rest, which is what `propertyNames` asks. A
member the schema declares meets the spread read under its key, with
the selection made, so `{a: string, &: match(key(0), "a", integer,
nil)}` is a conflict. Two spreads that read the key meet as written,
since no one term stands for both until a member gives the key. A `key` no
spread has read refuses every value, as a path left unread does. Step
29 reads `key()` at any other position, with its levels. Both engines answer the rows `y0` on of
`test/spec/def-trial.tsv` as the definition does.

Everything else the import wrote, the kinds `map` and `list`,
`empty()`, `re`, `match`, `any`, `nil`, the optional keys, and the
spread, is a row of `spec/forms.tsv`, and so is everything the importer
writes over the three corpora.

## 20. Calls on numbers

The language spells arithmetic with functions, `add`, `sub`, `mul`,
`div`, `mod` and `rem`, and a unary `-`, and each is a term of the
definition, `call` in `spec/Aontu/Syntax.lean`. Write `calls.aontu`:

<!-- test: scenario calls -->
<!-- test: file calls.aontu -->
```aontu
a: add(1, 2)
b: div(-7, 2)
c: mod(-7, 2)
d: add(0.1, 0.2)
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu calls.aontu
{
  "a": 3,
  "b": -3,
  "c": 1,
  "d": 0.30000000000000004
}
```

Division truncates toward zero, so `b` is `-3`, and `mod` takes the
divisor's sign, so `c` is `1` where `rem` gives `-1`. What a call
computes is in `spec/Aontu/Arith.lean`, by the tower's rules. An integer
with an integer is an integer, exact. Anything with a float is the
double nearest the exact answer, which is why `d` isn't `0.3`, and a
float with an exact big number is no value. Anything else takes the
widest exact leaf:

<!-- test: quote spec/Aontu/Arith.lean -->
```lean
def Number.binary (f : Fn) (x y : Number) : Option Number :=
  match x, y with
  | .integer a, .integer b => (f.onInts a.value b.value).bind Number.ofIntegerLeaf
  | .float _, .biginteger _ | .float _, .bigdecimal _
  | .biginteger _, .float _ | .bigdecimal _, .float _ => none
  | .float _, _ | _, .float _ =>
    (f.onFracs x.value y.value).bind fun r => (Float.nearest r.1 r.2).map .float
  | .bigdecimal _, _ | _, .bigdecimal _ =>
    (f.onDecimals x.toDecimal y.toDecimal).map .bigdecimal
  | _, _ => (f.onInts x.value.1 y.value.1).map fun n => .biginteger ⟨n⟩
```

An integer answer the leaf doesn't hold, such as `2^53 + 1`, is no value
either, nor is a zero divisor in any leaf, nor a big decimal divided.
The definition makes a call once it reads the document, as it makes a
selection in step 16: `resolveD` puts the term `callTerm` makes in the
call's place, which for arithmetic is the number `callValue` computes,
where it computes one. That's where the normal form of every argument,
the riders read through, is a number:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def callValue (ds : Decls) (f : Fn) (args : List Val) : Option Number :=
  if f.folds then
    match args with
    | [b] => ((normaliseD ds b).members ds).bind fun ms =>
        (ms.mapM fun m => (normaliseD ds m).number?).bind (Number.fold f)
    | _ => none
  else (args.mapM fun a => (normaliseD ds a).number?).bind (Number.arith f)
```

So `add(1 & integer, 1)`, `add(meta(3, {}), 1)`, `add(*3, 1)` and a
name that holds a number all make their calls: `Val.number?` reads a
lone preference by its normal form, `*3 | integer`. A kind, a string or
any other disjunction, even one with a default, leaves the call unmade,
and so does the wrong number of arguments. A call left unmade is
ill-formed, so `vet` reads its document as an error.

The folds `sum`, `least` and `greatest` take one bag, a list or a map,
and read its members, the first branch of `callValue`. Write
`folds.aontu`:

<!-- test: scenario folds -->
<!-- test: file folds.aontu -->
```aontu
a: sum([1 2 3])
b: sum([0.3 0.2 0.1])
c: sum([0.1 0.2 0.3])
d: least({ y:2 x:1.5 })
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu folds.aontu
{
  "a": 6,
  "b": 0.6,
  "c": 0.6000000000000001,
  "d": 1.5
}
```

`sum` adds the members from the left, from the integer zero, one `add`
at a time, so the order of the floats shows in `b` and `c`. A step no
leaf holds leaves the whole sum without a value, which is why
`sum([9007199254740992, 1, -1])` is an error and
`sum([1, -1, 9007199254740992])` isn't. `least` answers the first
member no other is below, and `greatest` the first no other exceeds,
by exact value, so `least([1, 1.0])` is the integer and
`least([1.0, 1])` the float:

<!-- test: quote spec/Aontu/Arith.lean -->
```lean
def Number.sum (xs : List Number) : Option Number :=
  xs.foldlM (fun acc x => Number.binary .add acc x) (.integer ⟨0, by decide⟩)

/-- `least`: the first member no other is below; an empty bag has none. -/
def Number.least : List Number → Option Number
  | [] => none
  | x :: xs => some (xs.foldl (fun acc y => if y.lt acc then y else acc) x)
```

An empty bag sums to the integer zero and has no least member, so
`least([])` is an error. `Number.least_mem` and `Number.least_lowest`,
in `spec/Aontu/Verdict.lean`, prove that `least` answers a member and
that no member is below it.

The members are the ones the output would hold: a list's elements in
order, and a map's members in key order, but neither an optional member
whose value generates nothing, nor an absent one, step 33's, nor
a marked one, unless the bag carries
a mark itself, which lifts its members' marks, so
`sum(type({a: hide(1), b: 2}))` is `3`. An optional member whose value
generates an empty map or list counts as one that generates nothing, as
the output reads it, so `sum({a?: {}, b: 2})` is `2`:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def Val.members (ds : Decls) (lifted : Bool := false) : Val → Option (List Val)
  | .ride k v _ => v.members ds (lifted || decide (k = .type) || decide (k = .hide))
  | .list items _ _ => some items
  | .map fs _ _ => some ((fs.mergeSort fun a b => decide (a.1 ≤ b.1)).filterMap fun m =>
      if (!lifted && m.2.2.marked) || m.2.2.isAbsent || (m.2.1 && (genD ds m.2.2).all Data.emptyBag) then none
      else some m.2.2)
  | _ => none
```

Each member has to be a number in its normal form, as each argument of
`add` does, so `sum([*1 | number, 2])` is an error, though the default
would give a number. A bag met with a size, `[1, 2] & len(2)`, isn't a
bag in normal form, and the engines refuse it too.

The calls have rows of their own, `test/spec/def-call.tsv`, and both
engines answer them as the definition does but twelve. A call the
schema can't build, `add(1)`, `add(1, 2, 3)`, `sum([1], [2])` or
`-(integer)`, is one both engines read as `invalid`, where the
definition reads an error, which #426 tracks.

### A bound over a path

A bound's end can be a path or a call where step 4 wrote a number or
a string, as in `lo: 2, t: min($.lo)`. The definition reads such a
bound as a call, `Fn.bnd`, that makes the bound itself once each
argument's normal form is a number or a string, so that `min($.lo)`
there is `min(2)`:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def bndOf (ds : Decls) (b : Bnd) (args : List Val) : Made :=
  let ns := match b, args.map fun a => (normaliseD ds a).unride with
    | .neq, [.list (x :: xs) _ _] => (x :: xs).map fun e => (normaliseD ds e).unride
    | _, ns => ns
  if ns.any Val.isChoice then .refused else
  if ns.any Val.noEnd then .made .nothing else
  match ns.mapM Val.boundEnd?, b with
  | none, _ => .waits
```

A `neq` over a sole list that isn't empty reads the list's elements as
its arguments, as both engines read `neq([1, 3])` as `neq(1, 3)`, so
`x: [1, 3], t: neq($.x)` refuses `1` and `3`. A choice among the
elements is no argument either, so `x: [1 | 3], t: neq($.x)` is an
error, as `neq([1 | 3])` is, whatever the data makes of `x`. A list
among them, and an empty list, name no end.

A boolean, `null`, a container, a kind, a bound, a pattern or a meet
names no end, and neither do a number and a string together under
`neq`, so a bound over one is outside its domain and admits nothing,
however its argument is written, as both engines answer (decision 28
of the design note's §7). A choice still to make, a disjunction or a
preference, is no argument at all: the bound is refused, and the
document is an error whatever the bound meets, as a size that holds
one is (decision 16). The atom that admits nothing is `Val.nothing`. It
stands, so a schema that holds one is no error, but it refuses every
value and generates nothing, and the meet makes it `nil` against
anything but `any`:

<!-- test: quote spec/Aontu/Meet.lean -->
```lean
def nothingOr (v : Val) : Val := if v.isAny then .nothing else .nil
```

So `lo: true, t: min($.lo)` refuses whatever data meets it, an
`invalid`, though `min($.lo) & integer` there is an error, as
`min(true) & integer` is, and in a `filter`'s condition such a bound refuses each
member the condition tries. The schema's own tree reads a kind as it
stands, but the tree the data reads in holds what the data gives it,
so `lo: number, t: min($.lo)` against `{"lo": 2, "t": 3}` is `valid`.
An argument that never settles leaves the call waiting, and a call no
reading makes is an error, as a bound over a path that only the data
supplies is, since the schema's own tree names nothing there. A size
needs no call: `len` takes a term already, so `n: 2, t: len($.n)`
reads as `len(2)`, and one over a path to a string admits nothing, as
`mulof` over a path to zero or a negative number does, and so does one
over a path to `any`, which `Val.unsized` reads as it reads
`len(any)`. `resolveD` makes such a size `Val.nothing`, as `bndOf` makes
a bound, so that both engines' refusal at the meet holds beside a field
that generates nothing: `n: any, t: len($.n)` is `invalid`, not
`incomplete`. Rows from bd0
on of `test/spec/def-path.tsv` hold these readings in the three modes
of `vet`, and both engines answer every one as the definition does.

A bound in a generator's template or in a `filter`'s condition reads
a relative path where its instance lands, as step 27 reads a template
and step 9 a condition, so
`each([{lim: 1, v: 1}, {lim: 2, v: 2}], _ & {v: min(.lim)})` reads
each member's own `lim`. Rows from bg0 on hold these, and both engines
answer them as the definition does.

## 21. Sums with `+`

`+` adds numbers and joins text, and two lists it concatenates. The
definition holds it as one more call, `plus`. Write `plus.aontu`:

<!-- test: scenario plus -->
<!-- test: file plus.aontu -->
```aontu
a: 1 + 2
b: "port " + 8080
c: [1] + [2 3]
d: "x" + 1e21
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu plus.aontu
{
  "a": 3,
  "b": "port 8080",
  "c": [
    1,
    2,
    3
  ],
  "d": "x1e+21"
}
```

`plusOf`, in `spec/Aontu/Verdict.lean`, reads the two operands' normal
forms, each through its riders and a lone preference first, so
`*1 + 1` is `2`, where `(*1 | number) + 1` waits, as both engines
answer:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def plusOf (a b : Val) : Made :=
  match a.operand, b.operand with
  | .list xs _ _, .list ys _ _ => .made (.list (xs ++ ys) none false)
  | .lit (.bool p), .lit (.bool q) => .made (.lit (.bool (p || q)))
  | .lit (.str s), .lit y => (y.plusText?.map fun t => .made (.lit (.str (s ++ t)))).getD .waits
  | .lit x, .lit (.str t) => (x.plusText?.map fun s => .made (.lit (.str (s ++ t)))).getD .waits
  | .lit (.num x), .lit (.num y) => ((Number.binary .add x y).map fun n => .made (.lit (.num n))).getD .refused
  | _, _ => .waits
```

Two numbers add as `add` does, so `1 + 2.0` is a float and `1.0 + 0d2`
is an error. A string beside a number joins the two texts, the number
written as `Number.text` in `spec/Aontu/Arith.lean` writes it: an
integer's digits, a big decimal with its point, and a float as
JavaScript writes a number, which is why `d` reads `x1e+21`. Two lists
concatenate, the left's elements then the right's: `plusOf_lists` and
`plusOf_nil_list` say so, the empty list adding nothing, and
`plusOf_list_lit` says that a list beside a scalar is no sum.

Anything else waits: a kind, `null`, a map, a list beside a scalar, a
boolean beside a number. A `+` that waits isn't an error. It generates
nothing and refuses nothing, so `vet` reads `integer + 1` as
incomplete, whatever the data, and `--partial` lets it pass. For that
a literal has to meet it as a pair, since the checker would refuse
every value at a call:

<!-- test: quote spec/Aontu/Syntax.lean -->
```lean
def Val.callAt : Val → Bool
  | .call _ _ | .keyUp _ => true
  | .meet a b => a.callAt || b.callAt
  | .ride _ v _ => v.callAt
  | _ => false
```

A sum no leaf holds, `9007199254740992 + 1`, is `nil`, so `vet` reads
it as an error, as it reads `add(9007199254740992, 1)`.

Inside a trial the definition doesn't wait yet. A `match` whose pattern
is a waiting `+` passes over the pattern, since `Judge` refuses every
value at a call, where both engines wait on the pattern, which #432
tracks. A pattern that holds a call keeps the `match` unmade, so
`match(1, add(integer, 1), "yes", "no")` is an error, as both engines
answer.

`join` folds a bag into one string with the texts `+` writes, the
separator between them, `""` where there's none, so
`join([1, 2.0, true], "|")` is `"1|2|true"`. Its members are the ones
the folds read, and like `+` it waits rather than refuse: where the bag
is one and its separator or a member isn't settled yet,
`join([string], ",")` leaves the document incomplete. A settled member
with no text, `null`, a map or a list, is an error, and so is a
separator that's no string:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def joinOf (ds : Decls) (b : Val) (sep : Option Val) : Made :=
  let sep' := sep.map (normaliseD ds)
  match (normaliseD ds b).members ds with
  | none => .refused
  | some ms =>
    let ms' := ms.map (normaliseD ds)
    if sep'.any (fun s => !s.settled) || ms'.any (fun m => !m.settled) then .waits
    else
      let t? : Option String := match sep' with
        | none => some ""
        | some s => match s.operand with
          | .lit (.str t) => some t
          | _ => none
      match t?, ms'.mapM Val.joinText? with
      | some t, some ps => .made (.lit (.str (t.intercalate ps)))
      | _, _ => .refused
```

The sums have rows of their own, x300 on in `test/spec/def-call.tsv`,
and the joins x507 on. Both engines answer every one as the definition
does, but for a `join` with three arguments, which #426 tracks. The
language's other rule for `+`, that a sum of an absence is absent,
waits on `maybe`, which the definition doesn't hold yet.

## 22. Picking and sorting

`pick` takes one field or index from every member of a bag, into a list,
and `sort` puts a bag's members in order. Both read the members the
folds read, and neither waits: each call is the list it makes or an
error. Write `pick.aontu`:

<!-- test: scenario pick -->
<!-- test: file pick.aontu -->
```aontu
a: pick([{ n:"b" k:2 } { n:"a" k:1 }], n)
b: pick([[9 8] [7 6]], "1")
c: sort(["b" "a" "B"])
d: sort([{ n:"x" k:1 } { n:"y" k:0 } { n:"z" k:1 }], k, desc)
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu pick.aontu
{
  "a": [
    "b",
    "a"
  ],
  "b": [
    8,
    6
  ],
  "c": [
    "B",
    "a",
    "b"
  ],
  "d": [
    {
      "k": 1,
      "n": "x"
    },
    {
      "k": 1,
      "n": "z"
    },
    {
      "k": 0,
      "n": "y"
    }
  ]
}
```

A projector is a string or an integer, read through its riders. It
names a key in a map member, an integer by its digits, so
`pick([{"0": 5}], 0)` is `[5]`. It names an index in a list member, a
string by its digits after one optional sign, which is why `b` reads
index 1:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def Val.project? (m : Val) (p : String ⊕ ℤ) : Option Val :=
  match m.unride with
  | .map fs _ _ => (fs.find? fun f => f.1 = projKey p).map fun f => f.2.2
  | .list items _ _ => match projIndex? p with
    | some i => if 0 ≤ i then items[i.toNat]? else none
    | none => none
  | _ => none
```

`pickOf` refuses a member that lacks what the projector names, rather
than skip it, since a shorter list would be a different answer. It
refuses a value that's no bag, a projector that's no string and no
integer, and `""`, which names no key.

`sort` orders the members by the key the projector names in each, or by
the member itself where there's no projector or it's `""`, which is how
you write a descending sort with no key: `sort([1, 3, 2], "", desc)`.
A key is a number or a string, read as a call reads its argument. A
bag's keys are all numbers, compared by exact value, or all strings,
compared by code point, so `c` puts `"B"` first, and any other bag has
no order: `sort([1, "a"])` is an error. Equal keys keep their order in
both directions, as `d` shows, since `List.mergeSort` is stable and
`sortLe` lets two equal keys stand either way round:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def sortLe (desc : Bool) (x y : Scalar × Val) : Bool :=
  if desc then !(sortLt x.1 y.1) else !(sortLt y.1 x.1)
```

The picks and sorts have rows of their own, x597 on in
`test/spec/def-call.tsv`. A projector or a direction through a rider
or a mark reads as its value, rows from x1995 on, as one through a name does
in rows from z30 on. A string names an index by its digits alone, so
`" 0"` and `"1e0"` name none, and `""` names no key in `pick`, rows
x2025 on. Both engines answer every row as the definition does, but
for three calls with the wrong number of arguments, which #426
tracks.

## 23. Changing case and characters

`upper` and `lower` change the case of a string, or of a run of it, and
round a number up or down. Write `case.aontu`:

<!-- test: scenario case -->
<!-- test: file case.aontu -->
```aontu
a: upper("foo")
b: upper("foo", 1)
c: lower("FOOBAR", -3)
d: upper(1.1)
e: lower(0d1.9)
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu case.aontu
{
  "a": "FOO",
  "b": "fOO",
  "c": "fooBAR",
  "d": 2,
  "e": 1.0
}
```

The run is of code points. A start of zero or more reaches forward, and
a negative one ends the run that far from the end, so `c` lowers the
first three. A length counts code points, and a negative one, the
default, is the whole string. Both ends clamp, so `upper("foo", 5)` is
`"foo"`:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def caseSpan (n : ℕ) (start len : ℤ) : ℕ × ℕ :=
  let span := if len < 0 then n else len.toNat
  if 0 ≤ start then (min start.toNat n, min (min start.toNat n + span) n)
  else (((n : ℤ) + start).toNat - span, ((n : ℤ) + start).toNat)
```

`caseRun` converts the run whole and keeps the rest, and the conversion
itself is the host's, `host.upper` and `host.lower`, as patterns are.
Both engines apply Unicode's default case conversion, `ß` to `SS`
among its rules, and the version of their tables can differ, so the
rows convert the letters `a` to `z` and `A` to `Z` alone.

A number takes no range. `upper(1.1)` is the float `2`, and
`lower(0d1.9)` is the big decimal `1.0`, each rounded exactly in its own
leaf:

<!-- test: quote spec/Aontu/Arith.lean -->
```lean
def Number.round (up : Bool) (x : Number) : Option Number :=
  let k : ℤ :=
    if up then -((-x.value.1).fdiv x.value.2) else x.value.1.fdiv x.value.2
  match x with
  | .integer _ | .biginteger _ => some x
  | .float _ => (Float.nearest k 1).map .float
  | .bigdecimal _ => some (.bigdecimal (BigDecimal.normal k 0))
```

A range argument is an integer, or a big integer that 64 bits hold,
read through its riders, and anything else is an error, as is any
argument but a string or a number: a boolean, a kind, or a lone
preference such as `*"a"`, which `upper` doesn't read through as
arithmetic does.

The rows are x816 on in `test/spec/def-call.tsv`. Both engines answer
every one as the definition does, but for two calls with the wrong
number of arguments, which #426 tracks. TypeScript refuses a big integer
index from 2^53 on, where Go reads it, so no row holds one, which #439
tracks.

`translate` maps a string's code points from one set to another, so
`translate("a-b-c", "-", "_")` is `"a_b_c"`. A set reads left to right,
and a character, a `-` and a character form a range, so `"a-y"` names
twenty-five letters and `translate("hello", "a-y", "b-z")` is
`"ifmmp"`. A `-` with nothing on one side stands for itself, and a range
that runs down, `"z-a"`, is an error. Each code point takes the mapping
of its last naming:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def translateChar (fr to : List ℕ) (c : Char) : List Char :=
  match fr.zipIdx.reverse.find? (·.1 == c.toNat) with
  | none => [c]
  | some (_, i) => match to.getLast? with
    | none => []
    | some last => [scalar (to.getD i last)]
```

A `to` shorter than the set pads with its last character, so
`translate("hello", "elo", "x")` is `"hxxxx"`, and an empty `to`, or
none, deletes, so `translate("hello", "lo")` is `"he"`. A range counts
every code point it crosses, the surrogates too, which is why the set
holds code point numbers, and `scalar` writes `U+FFFD` for a surrogate,
which is no character. Its rows are x966 on, and x2055 on for a
surrogate written from `to`. Both engines answer every one as the
definition does, but for two calls with the wrong number of arguments,
which #426 tracks.

### Spelling a name

`nom` spells a name in one of nine spellings, or, where its call names
no style, in all nine as a map. Write `nom.aontu`:

<!-- test: scenario nom -->
<!-- test: file nom.aontu -->
```aontu
a: nom("planet_body", pascal)
b: nom("HTTPServer", snake)
c: nom("user_id", camel, ["ID"])
d: nom("user_id")
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu nom.aontu
{
  "a": "PlanetBody",
  "b": "http_server",
  "c": "userID",
  "d": {
    "camel": "userId",
    "dot": "user.id",
    "kebab": "user-id",
    "pascal": "UserId",
    "path": "user/id",
    "snake": "user_id",
    "text": "User id",
    "title": "User Id",
    "upper": "USER_ID"
  }
}
```

A name's words are the runs between `_`, `-` and spaces, each cut
again where a new word starts:

<!-- test: quote spec/Aontu/Text.lean -->
```lean
def wordStarts (prev c : Char) (next : Option Char) : Bool :=
  c.toNat < 128 && prev.toNat < 128 &&
    ((c.isUpper && (prev.isLower || prev.isDigit)) || c.isDigit != prev.isDigit ||
      (c.isUpper && prev.isUpper && (next.map Char.isLower).getD false))
```

So `HTTPServer` is the words `HTTP` and `Server`, and `v2Api` is `v`,
`2` and `Api`. A spelling writes the words, and `capitalise` writes a
word that matches an acronym in the acronym's own letters, so `["ID"]`
turns the `id` of `user_id` into `ID` wherever a spelling capitalises
a word. `camel` never capitalises the first word. `Char.toUpper` and
`Char.toLower` change the letters `a` to `z` and `A` to `Z` alone, so
any other letter keeps its case and starts no word, and nothing here
is the host's.

The rows are x1521 on. Both engines answer every one as the definition
does, but for two calls with the wrong number of arguments, which #426
tracks. Go reads a style written as `""` as no style and answers the
map, where TypeScript refuses it, so no row holds one, which #451
tracks.

## 24. Escaping and splitting text

`esc` writes a string so that it can stand inside a literal of some
convention, and `usc` reads it back out. Write `esc.aontu`:

<!-- test: scenario esc -->
<!-- test: file esc.aontu -->
```aontu
a: esc("it's", sq)
b: esc("o'brien", sql)
c: esc("x < y & z", xml)
d: esc("a b/é", uri)
e: usc("%C3%A9", uri)
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu esc.aontu
{
  "a": "it\\'s",
  "b": "o''brien",
  "c": "x &lt; y &amp; z",
  "d": "a%20b%2F%C3%A9",
  "e": "é"
}
```

The seven conventions are in `spec/Aontu/Text.lean`, each a function
on a string's code points. With no variant, `esc` writes C and JSON in
double quotes:

<!-- test: quote spec/Aontu/Text.lean -->
```lean
def Escape.esc : Escape → List Char → List Char
  | .dq => escC '"'
  | .sq => escC '\''
  | .sql => escSql
  | .shell => escShell
  | .xml => escXml
  | .uri => escUri
  | .regex => escRegex
```

`usc` reads text back out of a convention, and refuses text that no
text escapes to, where `Escape.usc` answers none. That covers a lone
quote where `sql` doubles it, an `&` that opens none of the five
entities, and a `\u` escape that names half a surrogate pair. It also
covers percent-encoded bytes that aren't strict UTF-8, such as the
overlong `%E0%80%80`:

<!-- test: quote spec/Aontu/Text.lean -->
```lean
def uscSql : List Char → Option (List Char)
  | [] => some []
  | '\'' :: '\'' :: rest => ('\'' :: ·) <$> uscSql rest
  | '\'' :: _ => none
  | c :: rest => (c :: ·) <$> uscSql rest
```

An unknown variant is an error, and so is any argument but a string,
read through its riders. The rows are x1068 on, and both engines answer
every one as the definition does, but for two calls with the wrong
number of arguments, which #426 tracks.

`split` cuts a string into fields at a separator and keeps the empty
ones, so `split("a,,b", ",")` is `["a", "", "b"]` and
`join(split(s, sep), sep)` is `s`. A string separator is a literal,
cut at each occurrence from the left, and `""` cuts between every two
code points:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def splitText (s sep : String) : List String :=
  if sep = "" then s.toList.map Char.toString else s.splitOn sep
```

The rows are x1332 on, and both engines answer every one as the
definition does, but for two calls with the wrong number of arguments,
which #426 tracks.

### Matches of a pattern

Where its separator is `re(p)`, `split` cuts at the pattern's matches.
`rep(s, p, sub)` replaces every match of the pattern `p` in `s`. Write
`rep.aontu`:

<!-- test: scenario rep -->
<!-- test: file rep.aontu -->
```aontu
day: rep("2026-09-04", "([0-9]+)-([0-9]+)-([0-9]+)", "$3/$2/$1")
dashes: rep("aa", "a*", "-")
runs: split("a1b22c", re("[0-9]+"))
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu rep.aontu
{
  "dashes": "-",
  "day": "04/09/2026",
  "runs": [
    "a",
    "b",
    "c"
  ]
}
```

Where a match falls is the host's pattern engine's to say, as which
strings a pattern admits is, so `Host` holds `find`, the leftmost match
at or after a code point. Which matches a call reads is the
definition's. A scan resumes where the last match stopped, and an
empty match that starts there counts for nothing, so `rep("aa", "a*",
"-")` replaces `aa` and leaves the empty match after it alone:

<!-- test: quote spec/Aontu/Text.lean -->
```lean
def scanMatches (find : ℕ → Option Match) (len : ℕ) : ℕ → ℕ → Option ℕ → List Match
  | 0, _, _ => []
  | fuel + 1, pos, last =>
    if len < pos then [] else
    match find pos with
    | none => []
    | some m =>
      let empty := m.stop == pos
      let rest := scanMatches find len fuel (if empty then pos + 1 else m.stop) (some m.stop)
      if empty && last == some m.start then rest else m :: rest
```

A replacement writes `$1` to `$9` as the groups captured them, `$&` as
the whole match and `$$` as one `$`. Any other `$`, or a group the
pattern hasn't got, makes the call an error, and `subReads` reads the
replacement for that before the call scans the text, so
`rep("abc", "x", "$9")` is an error though nothing matches:

<!-- test: quote spec/Aontu/Text.lean -->
```lean
def subReads (n : ℕ) : List Char → Bool
  | [] => true
  | '$' :: '$' :: rest | '$' :: '&' :: rest => subReads n rest
  | '$' :: d :: rest => decide ('1' ≤ d ∧ d ≤ '9' ∧ d.toNat - 48 ≤ n) && subReads n rest
  | ['$'] => false
  | _ :: rest => subReads n rest
```

So is a pattern outside the subset that both engines' pattern engines
read alike. The reference states that subset on a pattern's syntax,
which the definition doesn't hold, so `Host` holds `portable` as well,
and `groups`, how many groups such a pattern captures.

The oracle's host reads fixed patterns alone, so the rows hold no
other pattern but four that the subset excludes. The rows are x1404 on
for `rep` and v0 on for `split` at a pattern, and x1959 on for a
replacement over a text with no match. Both engines answer every one as
the definition does, but for two calls with the wrong number of
arguments, which #426 tracks.

## 25. The parent type

`super` answers the immediate parent type of its argument: a scalar's
kind, a kind's parent, and a container of its members' parents. Write
`parent.aontu`:

<!-- test: scenario parent -->
<!-- test: file parent.aontu -->
```aontu
a: super(1)
b: super("")
c: super({ n: *1 })
d: super(integer & min(3))
```

and `parent-data.aontu`:

<!-- test: file parent-data.aontu -->
```aontu
a: 7
b: "x"
c: n: 2
d: 4
```

Now vet the data against the schema:

<!-- test: run -->
```sh
$ aontu vet parent.aontu parent-data.aontu
verdict: valid
```

`super("")` is every string, where `super("a")` is the non-empty ones,
and a meet that holds a kind has that kind for its parent, so `d` is
an integer. The call is `Val.super` in `spec/Aontu/Syntax.lean`, the
same parent a lone preference's normal form, `*x | super(x)`, already
reads. The definition applies it to the argument before its normal
form, so a preference reads as its default at any depth:
`super({ n: *1 })` is `{ n: integer }`, and `n: 1.5` is invalid.

The rows are x1221 on, and both engines answer every one as the
definition does, but for two calls with the wrong number of arguments,
which #426 tracks. `copy` isn't held yet. The reference says it clears
the marks, but neither engine clears a mark on a literal argument, and
#445 asks which reading stands.

## 26. The component tree

The ten component functions build the nodes of a component tree, each
the sealed map of its component's name, its `props` and its `children`.
Write `tree.aontu`:

<!-- test: scenario tree -->
<!-- test: file tree.aontu -->
```aontu
page: file("index.ts", ["export {}"])
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu tree.aontu
{
  "page": {
    "children": [
      {
        "children": [],
        "cmp": "Line",
        "props": {
          "src": "export {}"
        }
      }
    ],
    "cmp": "File",
    "props": {
      "name": "index.ts"
    }
  }
}
```

A string spec fills the component's main prop, a `file`'s `name` here,
riders and all, so `folder(meta("src", {title: "x"}))` keeps its
`meta` on the `name` it fills, in both engines. A bare string child
stands for a line, so `"export {}"` is a `Line` node. One table says
which components each holds:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def Cmp.kids : Cmp → List Cmp
  | .project => [.project, .folder, .file, .copyfiles]
  | .folder => [.folder, .file, .copyfiles]
  | .file => [.content, .line, .fragment, .inject, .listitems, .copyfiles]
  | .content | .line | .copyfiles => []
  | .fragment => [.slot, .content, .line, .listitems]
  | .slot => [.content, .line, .fragment, .listitems]
  | .inject => [.content, .line, .listitems]
  | .listitems => [.content, .line, .fragment]
```

A prop the component doesn't admit is an error, and so is a child it
doesn't hold, a `line` under a `folder` among them. A name that the
component requires can't be `""`, but a span of text can, so `line("")` is a
blank line, and `listitems` must hold a list at `item`. A node is any
map whose `cmp` names a component, so a node written out by hand is a
child too.

The node's seal makes data with another key beside `cmp`, `props` and
`children` invalid, and its props and children are open. Both engines
also hold them open against an enclosing `close()`, which needs
`open()`, and the definition doesn't hold `open()` yet, so no row
closes a node. The rows are x1677 on, and both engines answer every one
as the definition does, but for three calls with the wrong number of
arguments, which #426 tracks.

## 27. A list from a template

`each(d, t)` makes one list element for each member of `d`, the
template `t` read for that member, with the hole `_` standing for it.
Write `each.aontu`:

<!-- test: scenario each -->
<!-- test: file each.aontu -->
```aontu
names: each(["web" "auth"], upper(_))
files: each(["web" "auth"], { path:_ + ".ts" })
ports: each([port:80], _ & { tcp:true })
values: each({ b:2 a:1 }, _)
loud: filter(["WEB" "auth"], upper(_))
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu each.aontu
{
  "files": [
    {
      "path": "web.ts"
    },
    {
      "path": "auth.ts"
    }
  ],
  "loud": [
    "WEB"
  ],
  "names": [
    "WEB",
    "AUTH"
  ],
  "ports": [
    {
      "port": 80,
      "tcp": true
    }
  ],
  "values": [
    1,
    2
  ]
}
```

`resolveD` reads every term for a member, `b`, which a hole reads as,
and an `each` reads its template once for each member of its data:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
    | .each, [d, t] =>
      if here.isNone && (resolveD ds b here d).holdsKey then .call .each [resolveD ds b here d, t] else
      match (normaliseD ds (resolveD ds b here d)).members ds with
      | some ms =>
        .list ((ms.zipIdx.map fun m => resolveD ds (some m.1) (stepped here (.seg (.idx m.2))) t).filter
          fun e => !(normaliseD ds e).isAbsent) none false
      | none =>
        if (normaliseD ds (resolveD ds b here d)).isAbsent then .absent
        else if (resolveD ds b here d).pending ds then .call .each [resolveD ds b here d, t]
        else .nil
```

So the template replaces the member, unless the template names the
hole: `files` builds new maps, and `ports` meets each member with
`{ tcp:true }`. A map's members come in key order, as `values`
shows. A nested `each` binds its own hole, and an `each` over a string
or a number is an error. A spread has no hole. A `filter` binds its
own: it reads its condition once for each member it tries, so `loud`
keeps `"WEB"`, which `upper(_)` doesn't change.

Outside a template, a hole no generator fills admits every value, as
`any` does. Both engines also let a call's peer fill a hole in the
call, so `upper(_) & "a"` is `"A"`. That isn't a meet, since `"a"`
alone is no `"A"`, and the definition doesn't read it yet. Step 29
reads `key()` in a template. The rows are x1809 on, and
both engines answer every one as the definition does, but for two
calls with the wrong number of arguments, which #426 tracks.

## 28. A map from a template

`pack(d, t)` makes one map member for each member of `d`, under the
member's key: a map's own keys, or each string of a list, which is its
own key. Write `pack.aontu`:

<!-- test: scenario pack -->
<!-- test: file pack.aontu -->
```aontu
deploy: pack(["web" "auth"], { image:"acme/" + _ })
totals: pack({ b: [1 2] a: [3] }, sum(_))
loud: pack(["web"], upper(_))
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu pack.aontu
{
  "deploy": {
    "auth": {
      "image": "acme/auth"
    },
    "web": {
      "image": "acme/web"
    }
  },
  "loud": {
    "web": "WEB"
  },
  "totals": {
    "a": 3,
    "b": 3
  }
}
```

`resolveD` reads a `pack` as it reads an `each`, its template once for
each member, but into an open map:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
    | .pack, [d, t] =>
      if here.isNone && (resolveD ds b here d).holdsKey then .call .pack [resolveD ds b here d, t] else
      match (normaliseD ds (resolveD ds b here d)).keyedMembers ds with
      | some ms =>
        .map ((mergeKeys [] (ms.map fun m => (m.1, resolveD ds (some m.2) (stepped here (.seg (.key m.1))) t))).map
          fun m => (m.1, false, m.2)) none false
      | none =>
        if (normaliseD ds (resolveD ds b here d)).isAbsent then .absent
        else if (resolveD ds b here d).pending ds then .call .pack [resolveD ds b here d, t]
        else .nil
```

`Val.keyedMembers` pairs each member with its key. It reads a map's
members in key order and leaves out a marked member or an optional one
that generates nothing, as a fold does. A list's members are its
strings, each its own key. A key the list names twice makes one
member, its instances met by `mergeKeys`, as a map's repeated key is. A list holding anything
but a string is an error, `pack([1], {})`, and so is data that isn't a
bag. The map is open, so `pack(["a"], {x: 1}) & {b: 2}` holds `b` too.

The templates here don't use `key()`, which step 29 reads. The rows
are x2064 on, and both engines answer every one as the definition does.

## 29. A key where it stands

`key(n)` reads the key `n` levels up from the place it stands: `key(0)`
its own key, `key()` its parent's, and `""` past the top. A list's
index reads as its digits. Write `key.aontu`:

<!-- test: scenario key -->
<!-- test: file key.aontu -->
```aontu
a: b: { c:key() d:key(0) e:key(2) }
l: [key(0) x:key(1)]
deploy: pack(["web" "auth"], { image:"acme/" + key() })
order: each(["p" "q"], { slot:key() })
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu key.aontu
{
  "a": {
    "b": {
      "c": "b",
      "d": "d",
      "e": "a"
    }
  },
  "deploy": {
    "auth": {
      "image": "acme/auth"
    },
    "web": {
      "image": "acme/web"
    }
  },
  "l": [
    "0",
    {
      "x": "1"
    }
  ],
  "order": [
    {
      "slot": "0"
    },
    {
      "slot": "1"
    }
  ]
}
```

The term `keyUp n` is `key(n)` as written. `keyUpAt` reads it at a
position, the steps from the top:

<!-- test: quote spec/Aontu/Syntax.lean -->
```lean
/-- `key(n)` read at the position `pos`, outermost step first: the text of
the step `n` levels up, `""` where there is none, and, where that step is
the member a spread holds, the `key` the spread reads at its own position,
or `key(n)` still beneath it. -/
def keyUpAt (pos : List Step) (n : ℤ) : Val :=
  if n < 0 then .lit (.str "") else
  match pos.reverse[n.toNat]? with
  | some (.seg s) => .lit (.str s.text)
  | some .spread => if n = 0 then .key else .keyUp n
  | none => .lit (.str "")
```

`resolveD` carries the position each term stands at. A map's member
stands one key below the map, and a list's element one index below:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
  | .map fs spread closed =>
    .map (resolveFields ds b here fs) (resolveSpread ds none (stepped here .spread) spread) closed
  | .list items spread closed =>
    .list ((resolveElems ds b here 0 items).filter fun e => !(normaliseD ds e).isAbsent)
      (resolveSpread ds none (stepped here .spread) spread) closed
```

and a key reads the position it stands at:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
  | .keyUp n =>
    match here with
    | some pos => keyUpAt pos n
    | none => .keyUp n
```

A template stands where its instance lands, under the member's key in
a `pack` and at its index in an `each`, so `deploy` names each image
and `order` numbers each slot. A `filter`'s condition stands where the
member it tries lands, under its key, or at the index a list's member
takes among those kept. So `filter(["x", "0", "1"], key(0))` keeps
`"0"` and `"1"`, each tried at index `0` and then `1`. At a spread's own
position, `key(0)` is the term `key` that step 18 reads under each
member's key, and `key(1)` the key of the spread's container.

A path copies its target's term with the keys in it unread, and they
read where the path lands. Write `ref.aontu`:

<!-- test: scenario ref -->
<!-- test: file ref.aontu -->
```aontu
a: x: key()
b: $.a
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu ref.aontu
{
  "a": {
    "x": "a"
  },
  "b": {
    "x": "b"
  }
}
```

The root a path reads is the document read with its keys as written,
and the verdict reads the document with each key placed:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- How a document reads: its term expanded, with its selections made and
each key placed, the document standing at the top. -/
def Decls.readR (ds : Decls) (S : Val) : Val := resolveD ds none (some []) (ds.read S)

/-- How a document reads with its keys as written: the root its paths
read, so that a key a path reaches reads where the path lands. -/
def Decls.readU (ds : Decls) (S : Val) : Val := resolveD ds none none (ds.read S)
```

A literal meets an unplaced key as a pair, as it meets a call the
reading hasn't made, so the data a path's target holds stays beside
the key. Against `{"a": {"x": "a"}, "b": {"x": "b"}}`, then, `ref.aontu`
is invalid in both engines, since `b` copies `x: key() & "a"` and its
key reads `"b"`.

In the root a path reads, a computation over a key waits for the key's
place too: each `match` whose arms hold a key stays as written, and so
does each call and each generator whose arguments hold one, and each
`filter` whose condition does. A path copies the computation, and it's
made where the path lands.
Write `calc.aontu`:

<!-- test: scenario calc -->
<!-- test: file calc.aontu -->
```aontu
a: "q" + key()
b: c: $.a
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu calc.aontu
{
  "a": "q",
  "b": {
    "c": "qb"
  }
}
```

At `a`, `key()` reads past the top, so `a` is `"q"`, and the copy at
`b.c` reads `"b"`. Had the root made the sum where it stands, at `a`,
the copy would hold `"q"`, which refuses the data `{"b": {"c": "qb"}}`.

The rows are x2121 on and r0 on, and both engines answer every one as
the definition does. Six shapes have no row:

- A key deeper in a spread than its own position, `&: {name: key()}`,
  which both engines read as the member's key, has no rule yet.
- A path into a generator's output finds the keys the generator wrote
  in both engines, where a path to the generator itself rereads them
  where it lands. The definition rereads both, and has no rule for the
  difference yet.
- A path shallower than its target leaves a stale level in both
  engines, which #463 records.
- A preference on a key, `*key() | "x"`, which neither engine
  resolves, as #465 records.
- A path to a generator whose list argument holds a key,
  `each([key()], _)`, changes the generator's own value at its target
  in both engines, and a path to `upper(key())` does in the Go engine,
  which #468 records.
- A path to a `filter` whose condition holds a key leaves the `filter`
  in the path's declaration, which the checker can't read. The
  definition generates the copy both engines do, but a literal that
  meets a term under that declaration stays undecided.

## 30. Variables

A variable, `$foo`, takes its value from the program that runs the
document rather than from the document. The API binds it, as
[the API reference](reference-api.md#variables) shows, and `aontu`
itself binds none. The definition reads a variable as a name that the program
declares, beside the aliases the document declares:

<!-- test: quote spec/Aontu/Names.lean -->
```lean
/-! ## Variables

A variable, `$name`, is a name the calling program declares where the
document declares an alias: the reading is the document's with the
program's declarations beside its own, each under `$` and the name,
which no alias can be written as, since an alias begins with a letter.
A variable no program declares is a name declared nowhere, an error. -/

/-- The variable `$n`: the name the calling program declares it under. -/
def Val.var (n : String) : Val := .alias ("$" ++ n)

/-- The declarations a document reads under the bindings `vs` the
calling program makes: its own, and each variable's value under its
name, as `Val.var` reads it. A binding is any value the program builds,
a kind as well as data. -/
def Decls.withVars (ds : Decls) (vs : List (String × Val)) : Decls :=
  ds ++ vs.map fun v => ("$" ++ v.1, v.2)
```

So a variable reads as an alias does. It meets like any value, so
`$foo & integer` is `11` where the program binds `foo` to `11`. A
binding can be a kind as well, so `$kint & $foo` is `11` too where the
program binds `kint` to `integer`. A variable stands anywhere a value
can: in a list, in a call's argument, as a default, and as the data a
generator reads. A variable the program doesn't bind is a name
declared nowhere, which is an error.

A variable can stand as a path's step too, as in `$.q.$foo`. The step
is the text of the scalar the program binds, which then reads a map or
a list as any written step does in step 9:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- A variable's step: the text of the scalar the calling program binds
it to, a string as itself, a number as `Number.text` writes it and a
boolean as `true` or `false`, as both ports take a step only from a
scalar. A variable bound to nothing, to `null`, to a container or to
any other term, one that generates text among them, names no step. -/
def Decls.bindSeg (ds : Decls) : Seg → Option Seg
  | .var n =>
    match ds.filter (·.1 == "$" ++ n) with
    | [(_, .lit (.str s))] => some (.key s)
    | [(_, .lit (.num x))] => some (.key x.text)
    | [(_, .lit (.bool b))] => some (.key (if b then "true" else "false"))
    | _ => none
  | s => some s
```

So where the program binds `foo` to `11`, `$.q.$foo` reads the key
`"11"` of a map and the index `11` of a list. A variable bound to a
kind, to `null`, to a map, or to a term that only generates text, such
as `*"a" | string`, names no step, as in both engines, so its path is an
error.
What a document with paths generates is the output of its reading with
the paths read as names from the schema alone, once `OutputP` has made
its relative paths absolute, as `VetP` does in step 9:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
/-- What a document whose paths are absolute generates, where every
path resolves: the output of the document with its paths read as names
from the schema alone. -/
def OutputA (ds : Decls) (root : Data) (S : Val) (j : Data) : Prop :=
  ds.Resolves S ∧ OutputD (ds.withPathsS S).1 root ((ds.withPathsS S).1.readR (ds.withPathsS S).2) j
```

The shared test suite binds one set of variables for every row, and
the rows i0 to i33 of `test/spec/def-gen.tsv` read them, the oracle
binding the same set. Rows from i22 on stand a variable as a path's step,
each kind of scalar the runners bind among them, as the first step and
twice in one path. Both engines answer every one as the definition
does. A float, a big integer and a big decimal bind too and have no
row of their own, since the rows write no number but an integer as
JSON, though each names a step.

## 31. Path values

`path(p)` holds the address `p` spells, as data: where it points, not
what's there. So `cap: path($.a.b)` generates `"$.a.b"`, whatever
`$.a.b` holds, if anything. The definition holds an address as data of
its own:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- An address, what a path value is (`path(p)`): where it starts, `0`
for the document's root `$` and `n` for the `n` dots a relative path
starts with, and its steps, each the text it's written with. -/
structure Addr where
  up : ℕ
  steps : List String
  deriving DecidableEq

/-- An address as text: `$` with each step after a dot from the root,
and from a relative start its dots, then its steps between dots, so
`.b` from the map or list that holds the path and `..b` a step up. -/
def Addr.text (a : Addr) : String :=
  match a.up with
  | 0 => "$" ++ String.join (a.steps.map ("." ++ ·))
  | n => String.mk (List.replicate n '.') ++ ".".intercalate a.steps
```

An address is a datum, `Data.addr` among the data of step 6. JSON
writes it as its text, and no JSON text reads as one, so `vet` refuses
the string that data writes for a path value, as both engines do: the
data `{"v": "$.a"}` against the schema `v: path($.a)` is `invalid`.
Data that holds addresses has to be an aontu document.

A path value isn't a literal, since two of them meet without being
equal: `path($.a) & path($.a.b)` is `path($.a.b)` in both engines. An
address that opens another names the same place, less precisely. So a
path value admits each address its own opens:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- `a` opens `b`: they start alike, and `a`'s steps begin `b`'s, so
`b` is `a` told as precisely or more. -/
def Addr.Opens (a b : Addr) : Prop := a.up = b.up ∧ a.steps <+: b.steps
```

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- A path value admits each address its own opens: itself, and every
  address that adds steps to it, so that two paths meet by the prefix
  rule. It refuses every other value. -/
  | addr {a b : Addr} : a.Opens b → Judge env root true (.addr a) (.addr b)
  | addrNot {a : Addr} {j : Data} :
      (∀ b, j = .addr b → ¬ a.Opens b) → Judge env root false (.addr a) j
```

The prefix rule then needs no rule of its own. What two path values
both admit is what the longer admits, where one opens the other, and
nothing where neither does, since of two addresses that both open a
third, one opens the other. The meet of step 10 computes it:

<!-- test: quote spec/Aontu/Meet.lean -->
```lean
/-- The meet of two path values, by the prefix rule: the one the other
opens, so the longer, and `nil` where neither opens the other. -/
def addrMeet (a b : Addr) : Val :=
  if a.Opens b then .addr b else if b.Opens a then .addr a else .nil
```

The order follows as well: a prefix subsumes its extensions, so
`path($.a)` subsumes `path($.a.b)` and not the other way round. Two
addresses that start apart open nothing of each other, so `path(.a)`
and `path($.a)` meet in `nil`. A path value generates its own address,
as a literal generates its value, by the clause of `Gen` that step 13
lists:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `path($.a)` and `path($.a.b)`, the second's address one step past
the first's. -/
abbrev pathA : Val := .addr ⟨0, ["a"]⟩
abbrev pathAB : Val := .addr ⟨0, ["a", "b"]⟩

/-- `path($.a)` admits `$.a.b`, an address its own opens… -/
example : Instance .empty pathA (.addr ⟨0, ["a", "b"]⟩) := ⟨by decide, .addr ⟨rfl, by decide⟩⟩

/-- …and refuses the string `"$.a"`, which no address is. -/
example : ¬ Instance .empty pathA (.str "$.a") := fun ⟨_, h⟩ => nomatch h

/-- The two meet in the longer, which generates its own address. -/
example : output (.meet pathA pathAB) = some (.addr ⟨0, ["a", "b"]⟩) := by decide

/-- A prefix subsumes its extensions. -/
example : pathAB ⊑[.empty] pathA := addr_le_addr ⟨rfl, by decide⟩
```

`path` alone admits every address and generates none. No other kind
shares a value with it, `string` among them, so `string & path($.a)`
is `nil`, as in both engines.

`path` handed a string converts the string's text to an address, as
both engines do, so `path("$.a")` is `path($.a)`. Text with no start
reads from one dot, so `path("a.b")` is `path(.a.b)`:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- Address text read as an address. -/
def Addr.ofText? (t : String) : Option Addr :=
  match t.toList with
  | '$' :: '.' :: cs => (addrSteps [] cs).map (Addr.mk 0)
  | '$' :: _ => none
  | '.' :: cs => (addrSteps [] (leadDots cs).2).map (Addr.mk ((leadDots cs).1 + 1))
  | cs => (addrSteps [] cs).map (Addr.mk 1)
```

Each step is one or more letters, digits, `_` or `-`, which
`addrSteps` reads. Text that spells no address, such as `""`, `"$"`,
`"a..b"` or `"a b"`, is an error, as is any other scalar and a
container. A string a call computes converts once it's settled, so
`path("$." + "a")` is `path($.a)`, and a path value comes back as it
is. Rows k0 to k104 of `test/spec/def-call.tsv` hold each, and both
engines answer every one as the definition does.

Rows from k0 on of three files hold this: `test/spec/def-gen.tsv` what path
values generate, `test/spec/def-verdict.tsv` how `vet` judges data
against them, and `test/spec/def-subsume.tsv` which one subsumes
which. Both engines answer every row as the definition does.

The definition doesn't read a string constraint on a path value yet.
Both engines read a path value's spelling where `min`, `max`, `above`,
`below`, `neq`, `len`, `re`, or `format` meets it, so
`len(3) & path($.a)` is `"$.a"`. They read the one address the value
spells, when the two meet, where the prefix rule has the value stand
for every address it opens, and the answer depends on the order of the
meets: `above("$.a") & path($.a) & path($.a.b)` refuses, while
`path($.a.b) & path($.a) & above("$.a")` is `"$.a.b"`, which #474
tracks. No
reading by what each side admits gives both answers, so no string
constraint admits an address in the definition yet, and no row meets a
path value with one. Nor does the definition read the links `refer`
and `rel`. It holds `path($."a.b")` as one step, a key with a dot in
it, where both engines split it into two, which #475 tracks.

## 32. Grammars

`abnf(g)` compiles a grammar in Augmented Backus–Naur Form (ABNF) and
answers its source, and `parse` runs one: handed a string it answers
the syntax tree as maps and lists, and alone it's the constraint of
the strings the grammar parses whole. The definition leaves compiling and parsing to the host,
as it leaves patterns: step 4's `Host` says which grammars compile,
`compiles`, and the tree a grammar's parse of a string builds, `tree`,
none where it fails. The two calls read them:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- What `abnf` makes of a string: the string itself, a grammar's
source, where the host's compiler compiles it, and refused where it
doesn't, as for any other scalar and a container; waiting for anything
else. -/
def abnfOf (ds : Decls) (g : Val) : Made :=
  match (normaliseD ds g).unride with
  | .lit (.str t) => if host.compiles t then .made (.lit (.str t)) else .refused
  | .lit _ | .map _ _ _ | .list _ _ _ => .refused
  | _ => .waits

/-- What `parse` makes of a grammar's text: alone, the constraint of the
strings it parses whole, which admits none where it doesn't compile;
with a string, the tree the host's parser builds, as data, and refused
where the string is empty or the grammar doesn't read it. A scalar that
isn't a string and a container are refused, and anything else waits. -/
def parseOf (ds : Decls) (g : Val) (v : Option Val) : Made :=
  match (normaliseD ds g).unride with
  | .lit (.str t) =>
    match v.map fun v => (normaliseD ds v).unride with
    | none => .made (.grammar t)
    | some (.lit (.str s)) =>
      if s = "" then .refused else
        match host.tree t s with
        | some d => .made d.term
        | none => .refused
    | some (.lit _) | some (.map _ _ _) | some (.list _ _ _) => .refused
    | some _ => .waits
  | .lit _ | .map _ _ _ | .list _ _ _ => .refused
  | _ => .waits
```

A failure to parse is a refusal, so `parse(g, "x")` is an error where
the grammar doesn't read `"x"`, and the empty string parses under no
grammar. Alone, `parse(g)` is a constraint as `re` is, `Val.grammar`,
which admits a string the grammar parses whole:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- `parse(g)` admits the strings the host's parser reads whole under
  the grammar `g`, the empty string under none, and refuses every other
  value: a grammar that doesn't compile reads no string, so it admits
  nothing. -/
  | grammar {g s : String} :
      s ≠ "" → (host.tree g s).isSome = true → Judge env root true (.grammar g) (.str s)
  | grammarNot {g : String} {j : Data} :
      (∀ s, j = .str s → s ≠ "" → (host.tree g s).isSome = false) →
      Judge env root false (.grammar g) j
```

So `parse(g)` of a grammar that doesn't compile admits nothing, and
generates nothing either, where `abnf` and `parse(g, v)` of it are
errors, as in both engines. Unlike `re`, whose predicate on two strings
no checker can run, the host's `tree` is a function, so step 17's
checker reads `parse(g)`.

The oracle's host reads a grammar of one rule whose body is one quoted
literal, which ABNF matches without regard to case, or exactly after
`%s`, and builds its tree: the rule, the text it matched, and no
children. Rows g0 to g83 of `test/spec/def-call.tsv` hold `abnf`,
`parse` with a string, and `parse` alone over such grammars, and over
two texts that compile in no engine. Both engines answer every row as
the definition does.

## 33. Optional input

A path that names nothing is an error, as it should be: a typo should
be loud. `maybe(v)` is how a document reads input that may not be
there. Write `optional.aontu`:

<!-- test: file optional.aontu -->
```aontu
name: "web"
port: maybe($.config.port)
tags: ["a" maybe($.config.tag)]
```

<!-- test: run -->
```sh
$ aontu optional.aontu
{
  "name": "web",
  "tags": [
    "a"
  ]
}
```

Nothing names `config`, so `port` and the second tag are **absence**,
`Val.absent`, which the definition reads this way:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-! ## Absence

`maybe(v)` is `v` where it names something, and absence where all that
is wrong with it is that it doesn't: a reference at the top of `v`, `v`
itself, a side of a meet, an arm of a disjunction or the value under a
rider, names nothing in the document read. Absence admits every value,
generates nothing, and is the unit of the meet, but met with `any` it
stays absence; a map leaves it out of its output at a required key as
at an optional one, a list holds no position for it, and a call that
takes it makes it. -/
```

`maybeOf` says what's wrong with the argument by reading it twice,
with each reference at its top that names nothing read as `nil` and
then as `any`:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- What `maybe` makes of its argument, read: absence where a reference
at its top names nothing and that is all that is wrong with it, so that
the argument is dead with each such reference read as `nil` and live
with each read as `any`; otherwise the argument with each such
reference read as `nil`, which drops an arm that holds one and leaves a
conflict for the document to answer. Where a path at its top is not
read yet, the call waits. -/
def maybeOf (ds : Decls) (v : Val) : Val :=
  if v.pathTop then .call .maybe [v]
  else if v.missingTop ds then
    if (normaliseD ds (fillTop ds .nil v)).dead && !(normaliseD ds (fillTop ds .any v)).dead then .absent
    else fillTop ds .nil v
  else v
```

So `maybe($.gone & 1)` is absence too, since `1` alone is live, and
`maybe($.gone | 1)` is `1`, the arm the missing path kills dropped.
`maybe(1 & 2)` is the conflict, an error, as `1 & 2` is anywhere, and a
path under a call isn't at the top, so `maybe(upper($.gone))` is an
error as `upper($.gone)` is. `vet` reads paths from the data as well,
so against `{"gone": 5}`, `b: maybe($.gone)` asks for `5` at `b`.

Absence is the unit of the meet, so `1 & maybe($.gone)` is `1`:

<!-- test: quote spec/Aontu/Meet.lean -->
```lean
/-- A meet with absence: what the other side's normal form is, but
absence where that is `any`, which absence is below. -/
def absentOr (v : Val) : Val := if v.isAny then .absent else v
```

Absence admits every value, as `any` does, so where the two differ is
generation. An absent member of a map is optional in the visible part
of step 13, `leftOut`, so `vet` reads `port` as a key the data may
leave out and the output leaves it out. A list holds no position for
an absent element: `resolveD` drops it as it reads the list, so the
second tag never meets anything. A call that takes
absence makes it, so `upper(maybe($.gone))` is absence too, and so do
`each`, `pack`, `match` and `filter`. Where a template reads as
absence for a member, that instance holds no position either, so
`each([1], maybe($.gone))` is `[]`, and `pack` leaves the member out of
its map.

Rows from mb0 on of `test/spec/def-path.tsv` hold these readings in the
three modes of `vet`, and both engines answer every row as the
definition does. Where the engines read absence otherwise, no row
holds the case, which #479 tracks: they forgive a conflict beside a
missing path, they keep a list's absent element at its position while
the list meets another, so that their output can fail their own `vet`,
and decision 24 of the design note asks which reading is right.

## 34. A preference as a call

`pref(v)` is the function form of `*v`, read member by member. Write
`pref.aontu`:

<!-- test: scenario pref -->
<!-- test: file pref.aontu -->
```aontu
port: pref(8080)
limits: pref({ cpu:2 mem:512 })
mode: pref(*"fast"|"safe")
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu pref.aontu
{
  "limits": {
    "cpu": 2,
    "mem": 512
  },
  "mode": "safe",
  "port": 8080
}
```

`pref` makes each scalar literal of its argument a preference, and each
preference a rank weaker:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
/-- What `pref` makes of its argument, read before the normal form, as
both ports walk it: each scalar literal and each address a preference
of rank one, and each preference and each preferred arm of a
disjunction a rank weaker, a plain arm that is a leaf preferred, and a
leaf or a preference under a rider preferred whole, rider and all, as
both ports carry a rider on the value it rides; each member of a map
and of a list, each side of a meet and the value under any other rider
read so too, a spread left as written; a path not read yet and a call
that waits read as `pref` of themselves, which waits; and a kind, a
bound and any other constraint left as they are. -/
def Val.prefer : Val → Val
  | .lit s => .pref 1 (.lit s)
  | .addr a => .pref 1 (.addr a)
  | .pref r x => .pref (r + 1) x
  | .map fs spread closed => .map (preferFields fs) spread closed
  | .list items spread closed => .list (preferItems items) spread closed
  | .or arms => .or (preferArms arms)
  | .meet a b => .meet a.prefer b.prefer
  | .ride k v r =>
    if v.unride.prefLeaf then .pref 1 (.ride k v r)
    else match v.prefOf? with
      | some (s, x) => .pref (s + 1) (.ride k x r)
      | none => .ride k v.prefer r
  | .path p => .call .pref [.path p]
  | .call f args => .call .pref [.call f args]
  | v => v
```

So `limits` is `{ cpu: *2, mem: *512 }`, not `*{ cpu: 2, mem: 512 }`,
and data may override each member on its own. In `mode`, `*"fast"`
becomes `**"fast"` and `"safe"` becomes `*"safe"`, and the rank rule of
step 13 picks the lowest rank, `"safe"`. Write `pref-data.aontu`:

<!-- test: file pref-data.aontu -->
```aontu
port: 9090
limits: cpu: 4
```

and vet it:

<!-- test: run -->
```sh
$ aontu vet pref.aontu pref-data.aontu
verdict: valid
```

The data overrides `port` and `cpu`, and `mem` fills from its default.
A rider rides the value it's written on, so `pref(meta(1, r))` is
`*meta(1, r)`, the scalar preferred whole. A mark under a preference
marks no member, so `pref(hide(1))` is visible, as `*hide(1)` is, where
`pref(hide({ x:1 }))` keeps its map hidden.
A kind and a bound stay as written, so `pref(integer)` is `integer`.
`pref` reads a path first, so `pref($.a)` is the preference of what
`$.a` names, and a `pref` that waits on one stands where its argument does.
A path into its output reads the preference, so `$.b.x` beside
`b: pref({ x:1 })` is `*1`.
`pref(1 | 2)` is `*1 | *2`, two defaults of one rank that disagree, a
clash as step 14 reads it: an `error`, as `*1 | *2` written so is.

Rows from pf0 on of `test/spec/def-path.tsv` hold these readings in the
three modes of `vet`, rows from pc0 on hold paths into a call's output, and
both engines answer every one as the definition does. They answer
`pref(1 | 2)` `invalid` where they answer
`*1 | *2` an `error`, and no row holds that case, which #482 tracks.

## 35. Moving a value

`move(p)` reads the value at the path `p` as a preference where the
call stands, and hides the source, so the document generates the value
once, at its new place. Write `move.aontu`:

<!-- test: scenario move -->
<!-- test: file move.aontu -->
```aontu
draft: { title:"Notes" year:2026 }
title: move($.draft.title)
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu move.aontu
{
  "draft": {
    "year": 2026
  },
  "title": "Notes"
}
```

The call reads as `pref` does, `Val.prefer` of the value the path
reads, so `title` is `*"Notes"`, which data may override. The hiding
belongs to the document: before the definition reads it, the schema
meets an open map that holds the source's key as optional, down to
`hide(any)`, where the source names something:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def hideAt : List Seg → Val
  | [] => .ride .hide .any []
  | .key k :: p => .map [(k, true, hideAt p)] none false
  | _ :: _ => .any
```

The definition reads the steps of the source's path in the first of
the schema's roots that names it, each by the container it meets and
each variable bound first, as it reads the term a path names, so
`move($.q.$name)` hides the member the variable's value spells. A
`move` in a declaration's body hides its source as one in the schema
does, whether a reference reads the body or not, since both engines
read a body where it's declared:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def Decls.withMoves (ds : Decls) (S : Val) : Val :=
  ((S.moved ++ ds.foldl (fun acc (d : String × Val) => acc ++ d.2.moved) []).filterMap fun p =>
      (p.mapM ds.bindSeg).bind fun q => (ds.rootsS S).findSome? fun root => root.stepsW q).foldl
    (fun acc p => .meet acc (hideAt p)) S
```

A hidden member is optional in the visible part of step 13, so the
output leaves `draft.title` out and `--no-fill` doesn't ask the data
for it. The source still holds its value, and a reference clears the
mark, so `move` reads `"Notes"`. Data that refuses the source is still
refused. Write `move-data.aontu`:

<!-- test: file move-data.aontu -->
```aontu
draft: title: "Other"
```

and vet it:

<!-- test: run -->
```sh
$ aontu vet move.aontu move-data.aontu
verdict: invalid

$.draft.title: scalar_value [conflict]
  [aontu/scalar_value]: Cannot unify values at path $.draft.title
  data: move-data.aontu:1:15 ("Other")
  schema: move.aontu:1:16 ("Notes")
$ echo $?
1
```

A `move` of a value written in place, `move({ x:1 })`, hides nothing
and reads as `pref`, and a path that names nothing is an `error`, as
any path is. The definition reads a rider around the path through, so
`move(meta($.x, r))` hides `x` and reads as `*meta(1, r)`. Rows from mv0 on
of `test/spec/def-path.tsv` hold these readings in the three modes of
`vet`, and both engines answer every one as the definition does. Data
that sets the copy of a path under a rider splits the engines, and
no row holds it, which #486 tracks.

## 36. Checked links

`refer(t)` constrains a link: a path value that keeps its address in the
output, whose target must exist, and into whose target `t` flows. Write
`refer.aontu`:

<!-- test: scenario refer -->
<!-- test: file refer.aontu -->
```aontu
services: auth: port: 8080
billing: dep: refer({ kind:"service" }) & path($.services.auth)
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu refer.aontu
{
  "billing": {
    "dep": "$.services.auth"
  },
  "services": {
    "auth": {
      "kind": "service",
      "port": 8080
    }
  }
}
```

The call reads as the path kind, `path`, so the link's own value is the
address `path($.services.auth)` gives it. A string where an address
must be, `refer() & "$.a"`, is an `error`, as `path & "$.a"` is. The
rest belongs to the document, as a `move`'s hiding does: before the
definition reads it, the schema meets each link's template at the
link's target, from where the link stands, as a relative path climbs:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def Addr.from (a : Addr) (pos : List Seg) : Option (List Seg) :=
  if a.up = 0 then some (a.steps.map .key)
  else if a.up ≤ pos.length then some (pos.take (pos.length - a.up) ++ a.steps.map .key)
  else none
```

So `..auth` written at `s.billing.dep` names `s.auth`, and `...a`
written at `b` climbs past the top, an `error`. The template meets the
target with its marks cleared, as a reference copies a value, so
`refer(type({ k:1 }))` makes the target `{ k:1 }`, not a type.

A link reads where it lands, not where it's written: a `type()` that
holds a link reaches each place that uses it through a path reference,
a spread's template reaches each member, and a generator's template
each member of its output. So at each position the schema's normal
form holds, the definition reads the terms the schema writes there,
through meets, riders, a map's member and its spread, a list's element
and its spread, a generator's template, and a path reference's target:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def landStep (S : Val) (i : Val × List Seg) : List Val × List (Val × List Seg) :=
  match i.1 with
  | .meet a b => ([], [(a, i.2), (b, i.2)])
  | .ride _ v _ => ([], [(v, i.2)])
  | .path q => ([], [(S, q ++ i.2)])
  | _ => landLeaf i.1 i.2
```

Each `refer` among them is a link at that position, its relative
address read from there, so that each place a spread or a reference
puts it reads its own. The definition reads a link written in a body
at the body's own place, `%` and the name as a key at the top, whether
a reference reads the body or not:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def Decls.referPass (ds : Decls) (S : Val) (roots : List Val) (miss : Val) : Val :=
  ds.foldl (fun acc d => (d.2.refers []).foldl
      (referStep roots miss [.key ("%" ++ d.1)] (normaliseD ds (ds.readU d.2))) acc)
    ((S.landedLinks ((ds.rootsS S).getLast?.getD .any)).foldl
      (referStep roots miss [] ((ds.rootsS S).getLast?.getD .any)) S)
```

One link's template can make another link's target:
`y: refer({ z:{} }) & path($.h)` makes `h.z` for
`x: refer({ p:1 }) & path($.h.z)`, whichever the document writes
first. So the definition reads the targets in passes, each meeting the
templates of the links whose targets the last pass's schema holds, as
many passes as the links hold addresses:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def Decls.referPasses (ds : Decls) (S : Val) : ℕ → Val
  | 0 => S
  | n + 1 => ds.referPass S (ds.rootsS (ds.referPasses S n)) .any
```

A last pass reads each target in the roots those passes make, and a
target that names nothing there is an `error`, even where the data
supplies it, as a path to nothing is:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def Decls.withRefers (ds : Decls) (S : Val) : Val :=
  ds.referPass S (ds.rootsS (ds.referPasses S (ds.referCount S))) .nil
```

The template meets the target, so the target refuses the data the
template refuses. Write `refer-data.aontu`:

<!-- test: file refer-data.aontu -->
```aontu
services: auth: kind: "client"
```

and vet it:

<!-- test: run -->
```sh
$ aontu vet refer.aontu refer-data.aontu
verdict: invalid

$.billing.dep.kind: scalar_value [conflict]
  [aontu/scalar_value]: Cannot unify values at path $.billing.dep.kind
  data: refer-data.aontu:1:23 ("client")
  schema: refer.aontu:2:28 ("service")
$ echo $?
1
```

Rows from rf0 on of `test/spec/def-path.tsv` hold these readings in the
three modes of `vet`, rows from ld0 on hold links that land through a
spread or a path reference, and rows from lg0 on links in a generator's
template. Both engines answer every one as the definition does. With data, both engines read a body's relative link a
second time, from each place that uses the body, which #488 tracks, and
no row holds such a link.

## 37. Relations

`rel(t)` declares a relation at its field: the field's value is an
address, or a list or a map of addresses nested as deep as it goes,
and `t` flows into the target of each. Write `rel.aontu`:

<!-- test: scenario rel -->
<!-- test: file rel.aontu -->
```aontu
services: { auth: {} billing: {} }

gateway: routes: rel({ kind:"service" }) & [
  path($.services.auth)
  path($.services.billing)
]
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu rel.aontu
{
  "gateway": {
    "routes": [
      "$.services.auth",
      "$.services.billing"
    ]
  },
  "services": {
    "auth": {
      "kind": "service"
    },
    "billing": {
      "kind": "service"
    }
  }
}
```

The call reads as the relation kind, which the definition declares for
every document under a name no document can write, since a name a
document writes holds no parenthesis:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def relKind : Val :=
  .or [(0, .pathKind), (0, .list [] (some (.alias relName)) false),
    (0, .map [] (some (.alias relName)) false)]
```

So a string, a number or `true` where an address must be is an
`error`, as `rel() & "x"` is, and data that writes the addresses as
strings is `invalid`, as data that writes a path value as a string
is. Each leaf of the relation's value is a link, as a `refer` is, read
from the relation's own position:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def linkAddrs (src : Val) (e : List Seg × Val × Bool) : List Addr :=
  ((src.at e.1).map fun v => if e.2.2 then v.addrs else v.addrOf?.toList).getD []
```

So each leaf's target must exist, and the template meets each target,
in the passes step 36 walked through. Rows from rl0 on of
`test/spec/def-path.tsv` hold these readings in the three modes of
`vet`, and both engines answer every one as the definition does. The
engines read a relative address at a leaf from different places: the
two disagree once one container nests in another, which #492 tracks,
and `eval` and `vet` disagree even with one, which #493 tracks, so no
row holds a relative leaf.

## 38. A spread read at each member

A spread's template holds every member of its map or list, and a path
or a `key()` in it reads the member it's tried on. Write
`spread.aontu`:

<!-- test: scenario spread -->
<!-- test: file spread.aontu -->
```aontu
hosts: { &: { name:string url:"https://" + .name } api:name:"api.example" }
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu spread.aontu
{
  "hosts": {
    "api": {
      "name": "api.example",
      "url": "https://api.example"
    }
  }
}
```

The path `.name` reads `api`'s own `name`: the template stands where
its member does, not where it's written. Both engines try a template
only on the members there are, so the definition reads one at each
member there is, wherever it lands, where it reads its member's place:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def Val.perMember : Val → Bool
  | .path (.up _ :: _) => true
  | .path _ => false
  | s => !s.paths.isEmpty || s.holdsKey
```

At each position of the tree, each such spread that lands there, as
step 36 reads a link, whether written there, in a template that holds
the position or where a path reference copies it from, meets its
template at each member the tree holds there, placed at the member,
and the spread itself admits any member:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def Val.spreadInst (root s : Val) (p : List Seg) (t : Seg) : Option Val :=
  root.putW (p ++ [t]) ((s.atKey t.text).placed (p ++ [t])).neutral
```

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def Val.membersRead (P root : Val) : Val :=
  if P.perMembers then (root.positions.flatMap (P.instancesAt root)).foldl .meet P.neutral else P
```

The tree is the schema's own for the error class, and the one the data
reads in for the others, as step 9's `VetP` reads them. The definition
reads each with the document's links read first, so that it holds the
members a link's template makes, and with each template blanked, its
relative paths and `key()`s read as `any`, so that it holds what an
absolute path in a template names, the same at every member:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def Decls.prepared (ds : Decls) (S : Val) (root : Val) : Decls × Val :=
  ((ds.linked S).1, (ds.linked S).2.membersRead root)
```

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def Decls.preparedD (ds : Decls) (S : Val) (j : Data) : Val :=
  (ds.prepared S (ds.spreadRoot S fun d T => d.rootsD T j)).2
```

So a template whose path names nothing is no error until a member reads
it: an `error` where the schema writes the member, even where the data
supplies what the path names, and `invalid` where the data alone
supplies the member. A spread that's itself a relative path, `&: ..x`,
reads at each member too, so a path reference's copy reads it from
where the copy stands. Both engines read it where it's written as well,
so one that names nothing there is an `error` with no member at all:
step 9's `Decls.placed` declares each such place under a name no term
refers to, so that the path must name something. A member the data
supplies reads the template too.
Write `spread-data.aontu`:

<!-- test: file spread-data.aontu -->
```aontu
hosts: web: { name:"web.example" url:"http://web.example" }
```

and vet it:

<!-- test: run -->
```sh
$ aontu vet spread.aontu spread-data.aontu
verdict: invalid

$.hosts.web.url: scalar_kind [conflict]
  [aontu/scalar_kind]: Cannot unify values at path $.hosts.web.url
  data: spread-data.aontu:1:38 ("http://web.example")
  schema: spread.aontu:1:31 ("https://"+.name)
$ echo $?
1
```

A generator's template reads its relative paths at each member of its
output the same way. Write `each.aontu`:

<!-- test: file each.aontu -->
```aontu
names: ["api.example" "web.example"]
hosts: each($.names, { name:_ url:"https://" + .name })
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu each.aontu
{
  "hosts": [
    {
      "name": "api.example",
      "url": "https://api.example"
    },
    {
      "name": "web.example",
      "url": "https://web.example"
    }
  ],
  "names": [
    "api.example",
    "web.example"
  ]
}
```

The generator's own instance reads each term of its template that holds
a relative path as `any` (`Val.relBlank`). The part of the template
that holds one (`Val.relPart`) meets each member of the output, placed
at the member, as a spread's template does:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def Val.genInst (root u : Val) (p : List Seg) (t : Seg) : Option Val :=
  root.putW (p ++ [t]) (u.placed (p ++ [t])).neutral
```

So `.name` reads each instance's own `name`, a path that climbs out of
the instance reads from where the instance stands, and a spread or a
generator inside the template reads at its own members in turn.

Rows from sp0 on and from gt0 on of `test/spec/def-path.tsv` hold these
readings in the three modes of `vet`, and both engines answer every one
as the definition does.

## 39. Loading a source

`@"p"` loads another source and reads it in place: an aontu source's
value, a data file's, or a text file's text, at the place the document
writes the load. Write `parts.aontu`:

<!-- test: scenario load -->
<!-- test: file parts.aontu -->
```aontu
port: integer & 8080
```

and `main.aontu`, which loads it:

<!-- test: file main.aontu -->
```aontu
server: @"./parts.aontu"
server: host: "example.com"
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu main.aontu
{
  "server": {
    "host": "example.com",
    "port": 8080
  }
}
```

The definition reads no file. A document declares each source it can
load as a term, under `@` and the source's name, which no document can
write, since a name a document writes begins with a letter. A load
names its source from the source it's written in: read from that
source's directory, each `.` dropped and each `..` taking back a step,
and `.aontu` supplied where the name has no extension. A bare name whose
first step holds a dot names a module, which the definition doesn't
read yet, so it names no source. Both engines refuse one whose last
step names an extension, as a file written without `./`:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def loadPath (src p : String) : Option String :=
  let q := "/".intercalate
    (normSteps [] ((if p.startsWith "/" then [] else (src.splitOn "/").dropLast) ++ p.splitOn "/"))
  if moduleRef p then none else
  match ((q.splitOn "/").getLast?.getD "").splitOn "." with
  | [_] => some (q ++ ".aontu")
  | parts => if parts.getLast?.getD "" ∈ loadExts then some q else none
```

Before anything else reads the document, each load reads in its
source's term, whose own loads read in from there, `seen` holding the
chain of sources the load stands in:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def Decls.loadIn (ds : Decls) : ℕ → List String → String → Val → Val
  | 0, _, _, v => v
  | n + 1, seen, src, v => v.mapLoads fun p => (loadPath src p).bind fun q =>
    if q ∈ seen then none else (ds.source? q).map (ds.loadIn n (q :: seen) q)
```

A source the document declares no term for, one whose extension no
source may have, and one the chain already holds, a cycle, each leave
the load as written, a load the reading can't make. The verdict reads
the document with its sources read in, and is an `error` wherever a
load remains, even in an arm a selection leaves out, since both engines
read every load before anything else:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def VetP (m : Mode) (ds : Decls) (S : Val) (j : Data) (v : Verdict) : Prop :=
  if ds.loadsLeft S then v = .error else VetL m (ds.loaded S).1 (ds.loaded S).2 j v
```

A source refuses data as anything the document writes does. Write
`main-data.aontu`:

<!-- test: file main-data.aontu -->
```aontu
server: port: 80
```

and vet it:

<!-- test: run -->
```sh
$ aontu vet main.aontu main-data.aontu
verdict: invalid

$.server.port: scalar_value [conflict]
  [aontu/scalar_value]: Cannot unify values at path $.server.port
  data: main-data.aontu:1:15 (80)
  schema: parts.aontu:1:17 (8080)
$ echo $?
1
```

Rows from lf0 on of `test/spec/def-path.tsv` load the files of
`test/spec/files`, which each case declares as the term the file holds,
in the three modes of `vet`, and both engines answer every one as the
definition does.

### A source's own names

A source may declare names of its own, and a name belongs to the
source that declares it: the source reads its own declarations and
none of the document's, the document reads none of the source's, and
two sources that declare one name hold two names. The definition reads
each name a source declares, and each name the source uses, under a
name of the source's own, `%`, the source's name, `%` and the name,
which no document can write and no other source shares:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def Decls.ofSource (q : String) (own : Decls) (t : Val) (exports : List String := []) : Decls :=
  ("@" ++ q, t.scoped q) :: own.map (fun d => (scopedName q d.1, d.2.scoped q)) ++
    exports.map fun n => (exportName q n, if own.any (·.1 == n) then .alias (scopedName q n) else .nil)
```

So a source that declares `%u` and writes `y: 1` gives `{"y": 1}`
wherever it's loaded, and a document that loads it and writes `z: %u`
names a `%u` it never declared, an error. A variable belongs to the
calling program and reads the same in every source.

A name a source declares reads its loads from the source's own
directory, as the source's term does, and a load of the source itself
is a cycle. A source the document never loads, not even through
another source, adds none of its names, so a name it declares over
nothing makes an error only of a document that loads it. Rows from ls0
on hold these readings, and both engines answer every one as the
definition does. Both engines refuse a source that
declares a name when a document loads it under a key, which the
definition reads as it reads one at the root. When a document declares
a name and loads such a source at the root, Go keeps the document's
declaration in its output, which #514 tracks. No row holds either.

The last argument of `Decls.ofSource` holds the names a source
publishes, `export({ %a })`. The definition declares each under a third
name of the source's own, `!`, the source's name, `%` and the name,
naming the source's declaration. A name the source exports and doesn't
declare, such as one that arrived through a load, it publishes as
`nil`, which no destructure can take. A
document takes a published name with a destructure,
`{ %a } = @"./f.aontu"`, which loads the source as `@"./f.aontu"` does
and binds each name it takes in the document's scope:

<!-- test: quote spec/Aontu/Paths.lean -->
```lean
def Decls.takeBinds (ds : Decls) (S : Val) : Decls :=
  S.takes.flatMap fun t => match loadPath "" t.1 with
    | none => []
    | some q => ((ds.takeNames q t.2).getD []).map fun n => (n.1, .alias (exportName q n.2))
```

`{ %b: %a }` takes `a` as `b`, and `{ % }` takes every name the source
publishes. A name taken this way meets a declaration the document makes
of the same name, and a destructure under a key, a rider or a
preference, or in a spread, lands the source's values there while the
names stay the document's. A destructure that asks for a name its
source doesn't publish, or publishes as `nil`, makes the document an
error, whether or not anything reads the name (`Decls.takesLeft`), and
`{ % }` asks for every name the source publishes. Rows from lx0 on hold
these readings, and both engines answer every one as the definition
does. A destructure in a list's element binds no name in the
definition, since the engines read it differently, which #518 tracks.
Under a key, both engines class a take of a name the source doesn't
publish as `invalid` rather than `error`, as they class a call the
schema can't build, which #426 tracks, so the rows take such a name
only at the top.

The definition doesn't yet read a destructure that a source or a body
writes, one over a term that isn't a load, a module, or an extension the
calling program adds to those read as text, as `--text-ext` does.

## 40. Rules over nodes

`emit(s, t)` applies a table of rules to the nodes of a selection. For
each node, in order, it takes the first template whose `match` takes
the node and reads that template's `body` for the node, and the answer
is one flat list. Write `emit.aontu`:

<!-- test: scenario emit -->
<!-- test: file emit.aontu -->
```aontu
lines: emit([{ kind:"sqs" pin:"srv:a" } { kind:"http" path:"/a" }], [
  { match:kind:"sqs" body: ["listen(" + .pin + ")"] }
  { match:kind:"http" body: ["serve(" + .path + ")"] }
])

start: emit([{ name:"web" logs: [level:"debug"] }], {
  match: name: string
  body: ["start " + .name emit(.logs, { match:level:string body: [.level] })]
})
```

and evaluate it:

<!-- test: run -->
```sh
$ aontu emit.aontu
{
  "lines": [
    "listen(srv:a)",
    "serve(/a)"
  ],
  "start": [
    "start web",
    "debug"
  ]
}
```

`resolveD` checks the table first, each template a map with its `match`
and a list for its `body` (`emitRuleOk`), so that a bad table is an
error even over an empty selection. It then reads the table once for
each node of the selection, as it reads an `each`'s template once for
each member: its `match`es for no node, and its bodies for the node:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
    | .emit, [s, t] =>
      if here.isNone && (resolveD ds b here s).holdsKey then .call .emit [resolveD ds b here s, t] else
      if (emitTable (resolveD ds none none t)).any (fun r => !emitRuleOk r) then
        .call .emit [resolveD ds b here s, t] else
      match (normaliseD ds (resolveD ds b here s)).members ds with
      | some ms =>
        let pss := ms.map fun m => emitPieces ds m (resolveD ds none none t) (resolveD ds (some m) none t)
        if pss.all Option.isSome then .list (pss.filterMap id).flatten none false
        else .call .emit [resolveD ds b here s, t]
      | none =>
        if (normaliseD ds (resolveD ds b here s)).isAbsent then .absent
        else .call .emit [resolveD ds b here s, t]
```

`emitPieces` takes the first template whose `match` takes the node, and
a `match` takes a node the way both engines dispatch. The node, met with
the `match`, must not die, and must be alike the node: the meet narrows
nothing. So `{k: 1}` takes the node `{"k": 1}`, and so do `{}`, `map`
and `close({k: 1})`. `{k: 1, j: 2}` doesn't take it, and neither does
`{k: 1, j?: 2}`, whose meet holds a key the node lacks. But
`{k: 1, j?: integer}` takes it: an optional key whose value generates
nothing, or an empty map or list, is no member, as `Val.members` reads
it (`memberField`). Where the node is a kind, `integer`, the `match`
`integer` takes it and `1` refuses it. A disjunction with no preference
among its arms takes the node where any arm meets it, under a rider
too, as in `meta(1 | 2, {})`:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def emitTakes (ds : Decls) (pat m : Val) : Bool :=
  let met := normaliseD ds (meetD ds pat.matchRead m)
  !met.dead && ((normaliseD ds m).freeChoice || (normaliseD ds m).kindless.alike ds met.one.kindless)
```

No node binds a hole in a `match`, so `Val.matchRead` reads one as
both engines do. A hole that stands at a position, the whole `match`,
a member or an element, waits for a value that never comes and matches
nothing. One in a meet or a disjunction's arm is the value it meets, so
`_ & integer` takes `1` where `_` alone doesn't. A template that writes
`match` twice meets the two, and one that writes `body` twice makes no
list.

The answer splices in each list in the body, at any depth, so a
nested `emit` adds its pieces where it stands. A table of one template
may be the template itself. In a body, `_` is the node, and a relative
reference such as `.pin` names a field of the node rather than a place,
at any depth of the body. `.0` names a list node's first element, or a
map's member under the key `"0"`. The definition writes such a
reference with the step `Seg.node`, which no other path holds, so that
placing a document leaves it as written, and `resolveD` reads it for
the node:

<!-- test: quote spec/Aontu/Verdict.lean -->
```lean
def nodeRef (b : Option Val) : List Seg → Val
  | .node :: p =>
    match b with
    | some m => (m.fieldAt p).getD (.path (.node :: p))
    | none => .path (.node :: p)
  | p => .path p
```

A nested `emit` reads its selection, `.logs`, for the outer node, and
its own table for each of its own nodes. An empty selection emits
nothing, but both engines check its table all the same. Both refuse a
selection that isn't a bag, a template without its `match` or its
`body`, a body that isn't a list, a node no template takes, and a
reference the node doesn't answer. A step up is such a reference, and
so is a position past the end. Each leaves the call unmade, which is an
error. The
rows are et0 on, over selections written in place, and em0 on, where a
path names the selection. Both engines answer every one as the
definition does.

The definition doesn't yet read a table named apart from its call,
`emit(_, t)`, which is how a rule set recurses, `replace` and `esc` in
a body, or a reference into the node inside an `each`, a `pack` or a
`filter`'s condition in a body. It leaves a body that holds a `key(n)`
unmade too, since the engines read it at different positions, as #524
records.

## 41. What the definition doesn't say yet

The definition covers what this page walked through, and has no rule
for the rest of the language, so it says nothing about it. The
[language reference](reference-language.md) states the rest: the
two readings of a number that `--exact-numbers` switches between,
which strings a pattern, a format or a grammar admits, the tree a
grammar's parse builds, the built-in functions
steps 20 to 26 and 33 to 37 don't walk through, the named tables and
recursion of step 40, a string
constraint met with a path value, and the graph atoms `inverse(k)` and
`acyclic()`. [`aontu vet`](reference-api.md#aontu-vet) states which
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
`number & mulof(1)`, and the definition says what those mean. Step
19 checks that it does.

Nor does it order two recursions of one shape under different names,
or read a selection inside a recursive name's body, which the checker
of step 17 reads unmade. Neither has a rule yet.

Nor does it say which of a document's moves the reading makes. A
`move` in an arm no selection takes, or in a template no member
instantiates, still hides its source, where both engines keep it.

Nor does it read a link or a spread everywhere one can land. A `refer`
or a `rel` inside a disjunction or a selection is no link the
definition reads, so its template flows nowhere and its target needn't
exist, where both engines read it in the arm the selection takes. A
link inside another link's template is a call's argument, which no
landing enters, and an address the data supplies flows nowhere, since
the definition reads a link's address from the schema's own tree, where
both engines read each. A
link in a generator's template reads the template as written, not as
each member instantiates it: a hole or a `key()` in the link's own
template doesn't read the member, and the template lands at each
member the generator's place holds, one another term writes there
among them. The definition reads no link in a generator inside a
declaration's body. A spread whose template reads its member's place,
inside a disjunction, a selection or an alias's body, keeps its
template as written, so a relative path in it resolves nowhere, and so
does a generator's template there.

Nor does it say where a copy reads a relative path the copy holds. The
definition reads one where it's written, so a use of an alias, or a
path reference's copy, holds what the path reads there. Both engines
read it where the copy stands or where it's written by the order the
document writes the two: with `x: 1` at the top, `a: {x: 2, b: %T}`
and `%T = {v: ..x}`, they set `a.b.v` to 1, the top's `x`, where the
alias comes first, as the definition does, and to 2, `a`'s, where it
comes after, and `aontu vet` reads 2 in either order. The engines split
on a path in a call's argument. TypeScript reads it where it's written
in either order, and Go reads it as it reads any other. #504 tracks
both.

Next, read [unification](unification.md), which explains in prose the
operation these rules define.
