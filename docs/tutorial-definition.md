# Tutorial: read the formal definition

The [language reference](reference-language.md) describes aontu in
prose. Part of the language is also defined in
[Lean 4](https://lean-lang.org/), in the repository's
[`spec/`](../spec/) directory, as statements a proof checker verifies,
and the test suites hold both engines to that definition.

The definition says what aontu values mean: which data each one
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
module reads the same data, the same terms, and the same rule for what
a term admits, and none declares its own.

| File | Holds |
|---|---|
| [`spec/Aontu/Data.lean`](../spec/Aontu/Data.lean) | the data, scalars first: numbers in the four leaves, integers, floats, big integers, and big decimals, then strings, then maps and lists, and paths into a value |
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

The transcripts run [`aontu vet`](reference-api.md#aontu-vet), with no
flags, on two aontu files: a schema, which states its terms at named
keys, and the data, which gives each key one value. Written in aontu,
the data says which leaf each number is in: `3` is an integer, `1.5` a
float, and `0d1.5` a big decimal. Each finding names the key the engine
refused, says why, and points at what it can: where the data holds the
value, where the schema states the term, or both. The exit code says
which kind of refusal it was: `1` for `invalid`, `3` for `incomplete`,
`4` for `error`.

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

What a term admits is one relation, in `spec/Aontu/Admits.lean`, with
one rule for each form. Its first line:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
inductive Admits (env : Env) (root : Data) : Val → Data → Prop
```

`Admits env root v j` says the data `j`, found inside the whole value
`root`, is an instance of the term `v`, with the aliases `env`
declares. The result type `Prop` is a statement, true or false, that
Lean establishes by proof and never by running anything. Each
constructor is a rule of inference: when its premises hold, its
conclusion, after the last `→`, holds. A term admits a value when a
finite tree of these rules proves it.

The examples ask about a whole value, which is its own root:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
/-- `j` is an instance of `v` under the declarations `env`: `j` is a
value, taken whole, so that it is its own root. This is the question
`aontu vet` answers. A Lean `Data` that is no value, such as a map that
gives one key twice or an integer no double holds, is no instance of
anything, so it is never a witness. -/
abbrev Instance (env : Env) (v : Val) (j : Data) : Prop := j.WellFormed ∧ Admits env j v j
```

Read `∧` as "and": an instance is a pair, `j` being a value and `v`
admitting it. A Lean `Data` that holds an integer no double holds is no
value, and neither is a map that gives one key twice, which step 6
covers.

### Numbers, in four leaves

A number is in one of the four leaves the language has, and each leaf
holds a number as the language has it:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- A number, in one of the language's four leaves. The leaves are
disjoint: two numbers of two leaves are two values, however equal they
look, so `1`, `1.0`, `0d1`, and `0d1.0` are four. -/
inductive Number where
  | int (n : Int)          -- `integer`: a double, whole, in the window
  | float (x : Float64)    -- `float`: a double
  | bigint (n : Int)       -- `biginteger`: exact and whole
  | bigdec (x : Decimal)   -- `bigdecimal`: exact
```

An integer and a big integer are each a Lean `Int`, a float is a
double, and a big decimal an exact decimal. The leaves are disjoint, so
the integer `1` and the big integer `0d1` are two values, which no rule
makes one: each kind admits its own leaf, and each literal its own
number.

### Integers

The `integer` leaf holds the integers of one range:

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

`example` states a claim, and what follows `:=` is its proof, which the
build checks. `by decide` proves a statement by computing its yes or no
answer, and `¬` reads *not*. The rule for `integer` admits every number
of the leaf:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | integer {n : Int} : Admits env root .integer (.num (.int n))
```

An argument in braces, such as `{n : Int}`, is one Lean works out for
itself. The range is the data's to keep: a Lean `Data` that holds an
integer no double holds is no value, so it's an instance of nothing.
`Data.int n` builds the integer `n`:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The integer `n`: `Data.int 3` is the `integer` three. -/
def Data.int (n : Int) : Data := .num (.int n)
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `integer` admits `3`. -/
example : Instance .empty .integer (.int 3) := ⟨by decide, .integer⟩

/-- `integer` admits `9007199254740994`, which a double holds. -/
example : Instance .empty .integer (.int 9007199254740994) := ⟨by decide, .integer⟩

/-- No integer is `9007199254740993`: a Lean `Data` that says so is no
value, and no instance of anything, `any` included. -/
example : ¬ Instance .empty .any (.int 9007199254740993) := fun ⟨hw, _⟩ => absurd hw (by decide)

/-- `integer` refuses the string `"3"`. -/
example : ¬ Instance .empty .integer (.str "3") := fun ⟨_, h⟩ => nomatch h
```

`Instance .empty .integer (.int 3)` claims that `integer` admits `3`
under no alias declaration. Its proof is a pair: `by decide` shows that
`3` is a value, and `.integer` names the rule. A refusal takes the
supposed proof apart: `fun ⟨hw, _⟩ => absurd hw (by decide)` shows its
first half can't hold, and `fun ⟨_, h⟩ => nomatch h` finds no rule that
could have given its second. Write `integers.aontu`:

<!-- test: scenario integers -->
<!-- test: file integers.aontu -->
```aontu
admitted: integer
double: integer
plain: integer
beyond: integer
window: integer
text: integer
```

and `integers-data.aontu`:

<!-- test: file integers-data.aontu -->
```aontu
admitted: 3
double: 9007199254740994
plain: 9007199254740993
beyond: 0d9007199254740993
window: 9223372036854775808
text: "3"
```

Now vet the data against the schema:

<!-- test: run -->
```sh
$ aontu vet integers.aontu integers-data.aontu
verdict: invalid

$.plain: lossy_integer_literal [conflict]
  [aontu/lossy_integer_literal]: Cannot resolve value at path $.plain
  data: integers-data.aontu:3:8 (nil)
$.beyond: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.beyond
  data: integers-data.aontu:4:9 (0d9007199254740993)
  schema: integers.aontu:4:9 (integer)
$.window: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.window
  data: integers-data.aontu:5:9 (9223372036854776000.0)
  schema: integers.aontu:5:9 (integer)
$.text: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.text
  data: integers-data.aontu:6:7 ("3")
  schema: integers.aontu:6:7 (integer)
$ echo $?
1
```

`integer` admits `3` and `9007199254740994`, which a double holds.
Written plainly, `9007199254740993` is a literal no double holds, and
the engine refuses it rather than round it: `lossy_integer_literal`.
Written `0d9007199254740993`, it's a big integer, which `integer`
refuses. `9223372036854775808`, outside the window, is a double, so the
engine reads it as a float, which its `data:` line shows as
`9223372036854776000.0`, and `integer` refuses it, as it refuses the
string `"3"`. The code of those three findings, `no_scalar_unify`, says
no value is both, and their class, `conflict`, says no completion of
the data could change that. The `data:` and `schema:` lines point at
the two sides, each with its file, line, and column.

### Floats

A float is a double, held as the three fields of its binary64 format:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- A float: a binary64 double, held as its three fields: the sign, the
11-bit biased exponent, and the 52 bits of the fraction. The exponent
`2047` would make an infinity or a NaN, and the sign alone a negative
zero, which aontu takes as zero. -/
structure Float64 where
  neg : Bool
  exp : Nat
  frac : Nat
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
def Float64.man (x : Float64) : Nat := if x.exp = 0 then x.frac else 2 ^ 52 + x.frac

/-- The power of two the significand is scaled by: a float is
`± man * 2 ^ pow`. -/
def Float64.pow (x : Float64) : Int := if x.exp = 0 then -1074 else (x.exp : Int) - 1075
```

`Float64.dyadic m e` builds the double `m * 2 ^ e`:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The float `m * 2 ^ e`, for a positive `m` the double holds exactly:
`Float64.dyadic 3 (-1)` is one and a half, the double `1.5`. -/
def Float64.dyadic (m : Nat) (e : Int)
    (h₁ : (Float64.fieldsOf m e).1 < 2047 := by decide)
    (h₂ : (Float64.fieldsOf m e).2 < 2 ^ 52 := by decide) : Float64 :=
```

`float` admits every float:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | float {x : Float64} : Admits env root .float (.num (.float x))
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- The double `1.5` is `3 * 2 ^ -1`: the sign clear, the exponent
`1023`, and the top bit of the fraction set. -/
example : Float64.dyadic 3 (-1) = ⟨false, 1023, 2 ^ 51, by decide, by decide, fun h => nomatch h⟩ :=
  rfl

/-- `float` admits the float `1.5`. -/
example : Instance .empty .float (.num (.float (.dyadic 3 (-1)))) := ⟨by decide, .float⟩

/-- `integer` refuses the float `1.0`: the leaves are disjoint. -/
example : ¬ Instance .empty .integer (.num (.float (.dyadic 1 0))) := fun ⟨_, h⟩ => nomatch h

/-- The float `0.1` shows one tenth, its shortest decimal… -/
example : (Number.float (.dyadic 3602879701896397 (-55))).shown = (1, 10) := by decide

/-- …though its exact value is a little above one tenth. -/
example : ¬ (Number.float (.dyadic 3602879701896397 (-55))).le (.bigdec (.of 1 1)) := by decide
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
def Float64.shortest (x : Float64) : Int × Int :=
```

Write `floats.aontu`:

<!-- test: scenario floats -->
<!-- test: file floats.aontu -->
```aontu
fraction: float
point: integer
```

and `floats-data.aontu`, the data:

<!-- test: file floats-data.aontu -->
```aontu
fraction: 1.5
point: 1.0
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet floats.aontu floats-data.aontu
verdict: invalid

$.point: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.point
  data: floats-data.aontu:2:8 (1.0)
  schema: floats.aontu:2:8 (integer)
$ echo $?
1
```

`1.5` and `1.0` each have a point, so both are floats: `float` admits
the first, and `integer` refuses the second, a float though it's
whole.

A data file can be JSON too, and JSON has no `0d`: its numbers name no
leaf. Write the same data as `floats.json`:

<!-- test: file floats.json -->
```json
{"fraction": 1.5, "point": 1.0}
```

and vet it plainly, then with `--exact-numbers`:

<!-- test: run -->
```sh
$ aontu vet floats.aontu floats.json
verdict: invalid

$.point: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.point
  data: floats.json:1:28 (1.0)
  schema: floats.aontu:2:8 (integer)
$ echo $?
1
$ aontu vet --exact-numbers floats.aontu floats.json
verdict: invalid

$.fraction: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.fraction
  data: floats.json:1:14 (0d1.5)
  schema: floats.aontu:1:11 (float)
$ echo $?
1
```

Plainly, the engine reads a JSON number as it reads the same literal in
aontu, and answers as it did for `floats-data.aontu`. `--exact-numbers`
reads each number of the data by its value, in a JSON file or an aontu
one: a whole number the `integer` leaf holds as an integer, any other
whole number as a big integer, and a fraction as a big decimal. Then
`1.5` is a big decimal and `1.0` the integer `1`, and the two answers
swap. The definition says what each kind admits, and which leaf a
number of the data lands in is the reader's business, which the flag
changes. No other transcript on this page reads JSON or passes a flag.

### Big integers and big decimals

A big integer is an `Int`, and a big decimal is exact:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- A big decimal: the exact value `coef * 10 ^ (-scale)`, the
coefficient with no zero trailing it. Scale is presentation, not
identity, so each value has one `Decimal`: `0d0.10` and `0d0.1` are
both `⟨1, 1, _⟩`. -/
structure Decimal where
  coef : Int
  scale : Int
  canon : coef % 10 ≠ 0 ∨ (coef = 0 ∧ scale = 0)
```

The coefficient carries no trailing zero, so `0d0.10` and `0d0.1` are
one value: scale is presentation, not identity. Each leaf has its kind:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | biginteger {n : Int} : Admits env root .biginteger (.num (.bigint n))
  | bigdecimal {x : Decimal} : Admits env root .bigdecimal (.num (.bigdec x))
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `biginteger` admits `9007199254740993`, exactly. -/
example : Instance .empty .biginteger (.num (.bigint 9007199254740993)) := ⟨by decide, .biginteger⟩

/-- `bigdecimal` admits one and a half. -/
example : Instance .empty .bigdecimal (.num (.bigdec (.of 15 1))) := ⟨by decide, .bigdecimal⟩

/-- `integer` refuses the biginteger `5`, however equal they look. -/
example : ¬ Instance .empty .integer (.num (.bigint 5)) := fun ⟨_, h⟩ => nomatch h
```

Write `bigs.aontu`:

<!-- test: scenario bigs -->
<!-- test: file bigs.aontu -->
```aontu
big: biginteger
half: bigdecimal
whole: bigdecimal
```

and `bigs-data.aontu`:

<!-- test: file bigs-data.aontu -->
```aontu
big: 0d9007199254740993
half: 0d1.5
whole: 3
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet bigs.aontu bigs-data.aontu
verdict: invalid

$.whole: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.whole
  data: bigs-data.aontu:3:8 (3)
  schema: bigs.aontu:3:8 (bigdecimal)
$ echo $?
1
```

`biginteger` admits the big integer, and `bigdecimal` the big decimal.
`bigdecimal` refuses `3`, an integer, though the big decimal `0d3.0`
has the same value: each kind admits its own leaf.

### The `number` kind

`number` admits a number of every leaf:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | number {x : Number} : Admits env root .number (.num x)
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `number` admits a number of every leaf. -/
example : Instance .empty .number (.int 3) ∧
    Instance .empty .number (.num (.float (.dyadic 3 (-1)))) ∧
    Instance .empty .number (.num (.bigint 9007199254740993)) ∧
    Instance .empty .number (.num (.bigdec (.of 15 1))) :=
  ⟨⟨by decide, .number⟩, ⟨by decide, .number⟩, ⟨by decide, .number⟩, ⟨by decide, .number⟩⟩

/-- `number` refuses the string `"1"`. -/
example : ¬ Instance .empty .number (.str "1") := fun ⟨_, h⟩ => nomatch h
```

Write `numbers.aontu`:

<!-- test: scenario numbers -->
<!-- test: file numbers.aontu -->
```aontu
fraction: number
big: number
text: number
half: integer
```

and `numbers-data.aontu`:

<!-- test: file numbers-data.aontu -->
```aontu
fraction: 1.5
big: 0d9007199254740993
text: "1"
half: 1.5
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet numbers.aontu numbers-data.aontu
verdict: invalid

$.text: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.text
  data: numbers-data.aontu:3:7 ("1")
  schema: numbers.aontu:3:7 (number)
$.half: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.half
  data: numbers-data.aontu:4:7 (1.5)
  schema: numbers.aontu:4:7 (integer)
$ echo $?
1
```

`number` admits the float `1.5` and the big integer
`0d9007199254740993`, which `integer` refused, and refuses the string
`"1"`. `integer` refuses the float.

The numbers that show a whole number, of every leaf, are
`number & multiple(1)`, and that's a law of the definition, not only an
example. The tour proves it for every value:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `number & multiple(1)` admits the biginteger `9007199254740993`. -/
example : Instance .empty (.meet .number (.multiple (.int 1))) (.num (.bigint 9007199254740993)) :=
  ⟨by decide, .meet .number (.multiple (by decide) (by decide))⟩

/-- `number & multiple(1)` admits exactly the numbers that show a whole
number, of every leaf. -/
example (env : Env) (root j : Data) :
    Admits env root (.meet .number (.multiple (.int 1))) j ↔ ∃ x, j = .num x ∧ x.Whole := by
```

The proof reads `multiple(1)` through a fact about the numbers:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The multiples of one are the numbers that show a whole number. -/
theorem Number.multipleOf_one (x : Number) : x.multipleOf (.int 1) ↔ x.Whole := by
```

`↔` reads as *exactly when*. Write `whole.aontu`:

<!-- test: scenario whole -->
<!-- test: file whole.aontu -->
```aontu
beyond: number & multiple(1)
half: number & multiple(1)
```

and `whole-data.aontu`:

<!-- test: file whole-data.aontu -->
```aontu
beyond: 0d9007199254740993
half: 1.5
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet whole.aontu whole-data.aontu
verdict: invalid

$.half: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.half
  expected: multiple(1)
  actual:   1.5
  data: whole-data.aontu:2:7 (1.5)
  schema: whole.aontu:2:16 (multiple(1))
$ echo $?
1
```

`number & multiple(1)` admits the big integer `integer` refused, and
refuses one and a half, which is no whole number. The code `constraint`
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

and `strings-data.aontu`:

<!-- test: file strings-data.aontu -->
```aontu
admitted: "a"
refused: ""
empty: ""
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet strings.aontu strings-data.aontu
verdict: invalid

$.refused: string_empty [conflict]
  [aontu/string_empty]: Cannot resolve value at path $.refused
  data: strings-data.aontu:2:10 (string&"")
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

and `booleans-data.aontu`:

<!-- test: file booleans-data.aontu -->
```aontu
admitted: true
refused: 1
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet booleans.aontu booleans-data.aontu
verdict: invalid

$.refused: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.refused
  data: booleans-data.aontu:2:10 (1)
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
  /-- A literal admits its own value alone, of its own leaf. -/
  | num {x : Number} : Admits env root (.lit (.num x)) (.num x)
  | str {s : String} : Admits env root (.lit (.str s)) (.str s)
  | bool {b : Bool} : Admits env root (.lit (.bool b)) (.bool b)
  | null : Admits env root (.lit .null) .null
```

A number literal admits its own number in its own leaf: `3` the integer
three, and `0d3` the big integer. `null` has no kind of its own: the
literal `null` admits it.

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `3` admits `3`. -/
example : Instance .empty (.lit (.num (.int 3))) (.int 3) := ⟨by decide, .num⟩

/-- `3` refuses `4`. -/
example : ¬ Instance .empty (.lit (.num (.int 3))) (.int 4) := fun ⟨_, h⟩ => absurd ((check_iff .lit _).mpr h) (by decide)

/-- `3` refuses `0d3`, the biginteger three. -/
example : ¬ Instance .empty (.lit (.num (.int 3))) (.num (.bigint 3)) := fun ⟨_, h⟩ => absurd ((check_iff .lit _).mpr h) (by decide)

/-- `"a"` refuses `"b"`. -/
example : ¬ Instance .empty (.lit (.str "a")) (.str "b") := fun ⟨_, h⟩ => absurd ((check_iff .lit _).mpr h) (by decide)

/-- `true` refuses `false`. -/
example : ¬ Instance .empty (.lit (.bool true)) (.bool false) := fun ⟨_, h⟩ => absurd ((check_iff .lit _).mpr h) (by decide)

/-- `null` admits `null`. -/
example : Instance .empty (.lit .null) .null := ⟨by decide, .null⟩

/-- `null` refuses `false`. -/
example : ¬ Instance .empty (.lit .null) (.bool false) := fun ⟨_, h⟩ => nomatch h
```

The four refusals after the first example borrow the checker of step
14 to compute the answer. Write `literals.aontu`:

<!-- test: scenario literals -->
<!-- test: file literals.aontu -->
```aontu
three: 3
four: 3
exact: 0d3
same: "a"
other: "a"
yes: true
no: true
admitted: null
refused: null
```

and `literals-data.aontu`:

<!-- test: file literals-data.aontu -->
```aontu
three: 3
four: 4
exact: 3
same: "a"
other: "b"
yes: true
no: false
admitted: null
refused: false
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet literals.aontu literals-data.aontu
verdict: invalid

$.four: scalar_value [conflict]
  [aontu/scalar_value]: Cannot unify values at path $.four
  data: literals-data.aontu:2:7 (4)
  schema: literals.aontu:2:7 (3)
$.exact: scalar_kind [conflict]
  [aontu/scalar_kind]: Cannot unify values at path $.exact
  data: literals-data.aontu:3:8 (3)
  schema: literals.aontu:3:8 (0d3)
$.other: scalar_value [conflict]
  [aontu/scalar_value]: Cannot unify values at path $.other
  data: literals-data.aontu:5:8 ("b")
  schema: literals.aontu:5:8 ("a")
$.no: scalar_value [conflict]
  [aontu/scalar_value]: Cannot unify values at path $.no
  data: literals-data.aontu:7:5 (false)
  schema: literals.aontu:7:5 (true)
$.refused: scalar_kind [conflict]
  [aontu/scalar_kind]: Cannot unify values at path $.refused
  data: literals-data.aontu:9:10 (false)
  schema: literals.aontu:9:10 (null)
$ echo $?
1
```

Each literal admits its own value alone, so `0d3` refuses the integer
`3`. The engine calls another value of the same kind a `scalar_value`
refusal, and a value of another kind a `scalar_kind` one.

## 4. Bounds

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- The bounds read a number's exact value, and `multiple` the value
  it shows, which for a float is its shortest decimal. -/
  | min {n x : Number} : n.le x → Admits env root (.min n) (.num x)
  | max {n x : Number} : x.le n → Admits env root (.max n) (.num x)
  /-- `multiple(0)` and a negative divisor admit nothing. -/
  | multiple {d x : Number} : d.Positive → x.multipleOf d → Admits env root (.multiple d) (.num x)
```

A bound compares numbers of any leaf by their exact values:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- A number's exact value, as an integer over a positive natural. -/
def Number.value : Number → Int × Nat
  | .int n => (n, 1)
  | .float x =>
    let m : Int := if x.neg then -(x.man : Int) else x.man
    if 0 ≤ x.pow then (m * 2 ^ x.pow.toNat, 1) else (m, 2 ^ (-x.pow).toNat)
  | .bigint n => (n, 1)
  | .bigdec x =>
    if 0 ≤ x.scale then (x.coef, 10 ^ x.scale.toNat) else (x.coef * 10 ^ (-x.scale).toNat, 1)
```

and `multiple` reads the value a number shows, which differs from its
exact value only for a float:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- The value a number shows: its exact value, but for a float the
decimal it shows, so that `0.3` shows three tenths where its exact
value is a little below. -/
def Number.shown : Number → Int × Nat
  | .float x =>
    let (c, k) := x.shortest
    if 0 ≤ k then (c * 10 ^ k.toNat, 1) else (c, 10 ^ (-k).toNat)
  | x => x.value

/-- `x` is at most `y`, by exact value. -/
def Number.le (x y : Number) : Prop := x.value.1 * y.value.2 ≤ y.value.1 * x.value.2

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

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `min(3)` admits `3`. -/
example : Instance .empty (.min (.int 3)) (.int 3) := ⟨by decide, .min (by decide)⟩

/-- `min(3)` refuses `2`. -/
example : ¬ Instance .empty (.min (.int 3)) (.int 2) := by
  rintro ⟨-, h⟩
  cases h with
  | min h => exact absurd h (by decide)

/-- `min(3)` admits the bigdecimal three and a half. -/
example : Instance .empty (.min (.int 3)) (.num (.bigdec (.of 35 1))) := ⟨by decide, .min (by decide)⟩

/-- `max(2.5)`, whose bound is a float, admits the bigdecimal `2.5`: a
bound compares exact values, whatever their leaves. -/
example : Instance .empty (.max (.float (.dyadic 5 (-1)))) (.num (.bigdec (.of 25 1))) :=
  ⟨by decide, .max (by decide)⟩

/-- `max(2.5)` refuses `2.6`. -/
example : ¬ Instance .empty (.max (.float (.dyadic 5 (-1)))) (.num (.bigdec (.of 26 1))) := by
  rintro ⟨-, h⟩
  cases h with
  | max h => exact absurd h (by decide)

/-- `max(0d0.1)` refuses the float `0.1`, whose exact value is above
one tenth. -/
example : ¬ Instance .empty (.max (.bigdec (.of 1 1)))
    (.num (.float (.dyadic 3602879701896397 (-55)))) := by
  rintro ⟨-, h⟩
  cases h with
  | max h => exact absurd h (by decide)

/-- `multiple(0.5)` admits one and a half. -/
example : Instance .empty (.multiple (.float (.dyadic 1 (-1)))) (.num (.bigdec (.of 15 1))) :=
  ⟨by decide, .multiple (by decide) (by decide)⟩

/-- `multiple(0.5)` refuses `1.25`. -/
example : ¬ Instance .empty (.multiple (.float (.dyadic 1 (-1)))) (.num (.bigdec (.of 125 2))) := by
  rintro ⟨-, h⟩
  cases h with
  | multiple _ h => exact absurd h (by decide)

/-- `multiple(0.1)` admits the float `0.3`: it reads the decimal each
float shows, where their exact values are no multiple. -/
example : Instance .empty (.multiple (.float (.dyadic 3602879701896397 (-55))))
    (.num (.float (.dyadic 5404319552844595 (-54)))) :=
  ⟨by decide, .multiple (by decide) (by decide)⟩

/-- `multiple(0)` refuses `0`, and everything else. -/
example : ¬ Instance .empty (.multiple (.int 0)) (.int 0) := by
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

and `bounds-data.aontu`:

<!-- test: file bounds-data.aontu -->
```aontu
admitted: 3
refused: 2
fraction: 3.5
ceiling: 0d2.5
above: 2.6
half: 1.5
quarter: 1.25
zero: 0
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet bounds.aontu bounds-data.aontu
verdict: invalid

$.refused: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.refused
  expected: min(3)
  actual:   2
  data: bounds-data.aontu:2:10 (2)
  schema: bounds.aontu:2:10 (min(3))
$.above: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.above
  expected: max(2.5)
  actual:   2.6
  data: bounds-data.aontu:5:8 (2.6)
  schema: bounds.aontu:5:8 (max(2.5))
$.quarter: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.quarter
  expected: multiple(0.5)
  actual:   1.25
  data: bounds-data.aontu:7:10 (1.25)
  schema: bounds.aontu:7:10 (multiple(0.5))
$.zero: invalid-arg [conflict]
  [aontu/invalid-arg]: Cannot constrain value at path $.zero
  schema: bounds.aontu:8:7 (constraint())
$ echo $?
1
```

`min(3)` admits `3` itself, and the float three and a half. The bound
of `max(2.5)` is a float and the data's `0d2.5` a big decimal, and the
bound admits it, as their exact values are equal. Each failed bound
is a `constraint` finding that names the bound. The engine reports
`multiple(0)` as an argument it can't use, where the definition, which
has no ill-formed terms, has a term that admits nothing.

A float's exact value is a binary fraction, and the value it shows its
shortest decimal, so on a float the two part. Write `tenths.aontu`:

<!-- test: scenario tenths -->
<!-- test: file tenths.aontu -->
```aontu
below: max(0d0.1)
thirds: multiple(0.1)
```

and `tenths-data.aontu`:

<!-- test: file tenths-data.aontu -->
```aontu
below: 0.1
thirds: 0.3
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet tenths.aontu tenths-data.aontu
verdict: invalid

$.below: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.below
  expected: max(0d0.1)
  actual:   0.1
  data: tenths-data.aontu:1:8 (0.1)
  schema: tenths.aontu:1:8 (max(0d0.1))
$ echo $?
1
```

`max(0d0.1)` refuses the float `0.1`, whose exact value is more than
one tenth, and `multiple(0.1)` admits the float `0.3`, which shows three
tenths, though no exact multiple of the double nearest one tenth is the
double nearest three tenths.

## 5. The two ends: `any` and `nil`

`any` admits every value, by its one rule, and `nil` has no rule, so it
admits none. They're the [top](unification.md) and the
[bottom](unification.md) of the [lattice](unification.md):

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | any {j : Data} : Admits env root .any j
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `any` admits `null`. -/
example : Instance .empty .any .null := ⟨by decide, .any⟩

/-- `any` admits `[1, "a"]`. -/
example : Instance .empty .any (.list [.int 1, .str "a"]) := ⟨by decide, .any⟩

/-- `nil` refuses `null`, and everything else. -/
example : ¬ Instance .empty .nil .null := fun ⟨_, h⟩ => nomatch h
```

Write `ends.aontu`:

<!-- test: scenario ends -->
<!-- test: file ends.aontu -->
```aontu
admitted: any
list: any
refused: nil
```

and `ends-data.aontu`:

<!-- test: file ends-data.aontu -->
```aontu
admitted: null
list: [1 "a"]
refused: null
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet ends.aontu ends-data.aontu
verdict: invalid

$.refused: literal_nil [conflict]
  [aontu/literal_nil]: Cannot unify values at path $.refused
  data: ends-data.aontu:3:10 (null)
  schema: ends.aontu:3:10 (nil)
$ echo $?
1
```

The only finding is at `$.refused`, so `any` admitted its `null` and its
list.

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
string and a value. A Lean list can give one key twice, which no map does, and an
integer can be one no double holds. So the definition says which Lean
`Data` is a value:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- A Lean `Data` is a value when each of its integers is one the
`integer` leaf holds and each of its maps gives each key once. -/
inductive Data.WellFormed : Data → Prop
  | int {n : Int} : IntegerLeaf n → WellFormed (.num (.int n))
  | float {x : Float64} : WellFormed (.num (.float x))
  | bigint {n : Int} : WellFormed (.num (.bigint n))
  | bigdec {x : Decimal} : WellFormed (.num (.bigdec x))
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
example : Data.WellFormed (.map [("a", .int 1)]) := by decide

/-- A Lean `Data` that gives `a` twice is no value. -/
example : ¬ Data.WellFormed (.map [("a", .int 1), ("a", .int 2)]) := by decide

/-- …so it is no instance of anything, `any` included. -/
example : ¬ Instance .empty .any (.map [("a", .int 1), ("a", .int 2)]) :=
  fun ⟨hw, _⟩ => absurd hw (by decide)
```

The order of a map's list is no part of the value. Step 9 compares two
maps that list one set of members in two orders.

### Keys, required and optional

A map's rule has four premises:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- A map: every declared key that is present holds its value, and
  holds every declaration of it; a key that is absent is optional in
  every declaration; the spread holds every member, declared or not;
  a sealed map holds no key it does not declare. -/
  | map {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool}
      {jfs : List (String × Data)} :
      (∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x → Admits env root v x) →
      (∀ k o v, (k, o, v) ∈ fs → lookup k jfs = none → o = true) →
      (∀ s, spread = some s → ∀ k x, (k, x) ∈ jfs → Admits env root s x) →
      (closed = true → ∀ k x, (k, x) ∈ jfs → ∃ o v, (k, o, v) ∈ fs) →
      Admits env root (.map fs spread closed) (.map jfs)
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

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x: integer}` admits `{"x": 1}`. -/
example : Instance .empty (.map [("x", false, .integer)] none false) (.map [("x", .int 1)]) := by
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

The formatter writes a map under a key as a path, so
`admitted: x: integer` is `admitted: {x: integer}`. Write `keys.aontu`:

<!-- test: scenario keys -->
<!-- test: file keys.aontu -->
```aontu
admitted: x: integer
refused: x: integer
optional: x?: integer
wrong: x?: integer
list: x?: integer
```

and `keys-data.aontu`:

<!-- test: file keys-data.aontu -->
```aontu
admitted: x: 1
refused: {}
optional: {}
wrong: x: "a"
list: []
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet keys.aontu keys-data.aontu
verdict: invalid

$.wrong.x: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.wrong.x
  data: keys-data.aontu:4:11 ("a")
  schema: keys.aontu:4:12 (integer)
$.list: map [conflict]
  [aontu/map]: Cannot unify values at path $.list
  data: keys-data.aontu:5:7 ([])
  schema: keys.aontu:5:7 ({"x"?:integer})
$.refused.x: mapval_no_gen [incomplete]
  [aontu/mapval_no_gen]: Cannot resolve value at path $.refused.x
  schema: keys.aontu:2:13 (integer)
$ echo $?
1
```

The refusals are of two classes. At `$.refused.x` nothing contradicts
the schema, but a required key is missing, so the class is
`incomplete`. At `$.wrong.x`, `"a"` can never be an integer, and
`$.list` holds a list, which is no map at all, so both are
`conflict`. The definition says only that the term refuses each, and
the class is the engine's.

### Spreads and seals

The third premise is the spread, which holds every member, declared or
not:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{&: integer}` admits `{"a": 1, "b": 2}`: the spread holds every member. -/
example : Instance .empty (.map [] (some .integer) false) (.map [("a", .int 1), ("b", .int 2)]) := by
  refine ⟨by decide, ?_⟩
  refine .map (fun _ _ _ _ h => nomatch h) (fun _ _ _ h => nomatch h) ?_ (fun h => nomatch h)
  intro s hs k x hm
  cases hs
  simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
  rcases hm with ⟨-, rfl⟩ | ⟨-, rfl⟩ <;> exact .integer

/-- `{a: integer, &: string}` refuses `{"a": 1}`: the spread holds the
declared key as well. -/
example : ¬ Instance .empty (.map [("a", false, .integer)] (some .string) false)
    (.map [("a", .int 1)]) := by
```

Write `spreads.aontu`:

<!-- test: scenario spreads -->
<!-- test: file spreads.aontu -->
```aontu
admitted: { &: integer }
refused: { a:integer &: string }
```

and `spreads-data.aontu`:

<!-- test: file spreads-data.aontu -->
```aontu
admitted: { a:1 b:2 }
refused: a: 1
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet spreads.aontu spreads-data.aontu
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
    (.map [("a", .int 1), ("b", .int 2)]) := by
  rintro ⟨-, h⟩
  cases h with
  | map _ _ _ hc =>
    obtain ⟨o, v, hm⟩ := hc rfl "b" (.int 2) (by simp)
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
admitted: close({ a?:integer })
refused: close({ a:integer })
```

and `closed-data.aontu`:

<!-- test: file closed-data.aontu -->
```aontu
admitted: {}
refused: { a:1 b:2 }
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet closed.aontu closed-data.aontu
verdict: invalid

$.refused.b: closed [conflict]
  [aontu/closed]: Cannot resolve value at path $.refused.b
  data: closed-data.aontu:2:18 (2)
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
  | list {items : List Val} {spread : Option Val} {xs : List Data} :
      items.length ≤ xs.length →
      (∀ (i : Nat) (v : Val) (x : Data), items[i]? = some v → xs[i]? = some x →
        Admits env root v x) →
      (∀ s, spread = some s → ∀ x, x ∈ xs → Admits env root s x) →
      Admits env root (.list items spread) (.list xs)
```

`items[i]?` is the item at position `i`, or `none` past the end. So
`[integer, string]` needs two elements, and allows more:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `[integer, string]` admits `[1, "a", true]`: the list stays open. -/
example : Instance .empty (.list [.integer, .string] none) (.list [.int 1, .str "a", .bool true]) := by
  refine ⟨by decide, ?_⟩
  refine .list (by decide) ?_ (fun _ h => nomatch h)
  intro i v x hv hx
  rcases i with _ | _ | i
  · cases hv; cases hx; exact .integer
  · cases hv; cases hx; exact .string (by decide)
  · simp at hv

/-- `[integer, string]` refuses `[1]`: its second position is missing. -/
example : ¬ Instance .empty (.list [.integer, .string] none) (.list [.int 1]) := by
  rintro ⟨-, h⟩
  cases h with
  | list hlen _ _ => exact absurd hlen (by decide)

/-- `[&: integer]` refuses `[1, "a"]`: the spread holds every element. -/
example : ¬ Instance .empty (.list [] (some .integer)) (.list [.int 1, .str "a"]) := by
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

and `lists-data.aontu`:

<!-- test: file lists-data.aontu -->
```aontu
admitted: [1 "a" true]
refused: [1]
spread: [1 "a"]
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet lists.aontu lists-data.aontu
verdict: invalid

$.spread.1: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.spread.1
  data: lists-data.aontu:3:12 ("a")
  schema: lists.aontu:3:13 (integer)
$.refused.1: listval_no_gen [incomplete]
  [aontu/listval_no_gen]: Cannot resolve value at path $.refused.1
  schema: lists.aontu:2:19 (string)
$ echo $?
1
```

The list stays open, so it admits `true`, past its two positions.
The missing second element is `incomplete`, the class of a missing
required key.

## 7. Conjunction

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | meet {a b : Val} {j : Data} :
      Admits env root a j → Admits env root b j → Admits env root (.meet a b) j
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `integer & min(3)` admits `7`. -/
example : Instance .empty (.meet .integer (.min (.int 3))) (.int 7) :=
  ⟨by decide, .meet (.integer) (.min (by decide))⟩

/-- `integer & min(3)` refuses `2`. -/
example : ¬ Instance .empty (.meet .integer (.min (.int 3))) (.int 2) := by
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

and `meet-data.aontu`:

<!-- test: file meet-data.aontu -->
```aontu
admitted: 7
refused: 2
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet meet.aontu meet-data.aontu
verdict: invalid

$.refused: constraint [conflict]
  [aontu/constraint]: Cannot unify values at path $.refused
  expected: integer&min(3)
  actual:   2
  data: meet-data.aontu:2:10 (2)
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
  | alias {n : String} {v : Val} {j : Data} :
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
example : Instance envT T (.map [("n", .map [("v", .int 1)])]) := by
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
admitted: %T
refused: %T
```

and `tree-data.aontu`:

<!-- test: file tree-data.aontu -->
```aontu
admitted: n: v: 1
refused: v: "x"
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet tree.aontu tree-data.aontu
verdict: invalid

$.refused.v: no_scalar_unify [conflict]
  [aontu/no_scalar_unify]: Cannot unify values at path $.refused.v
  data: tree-data.aontu:2:13 ("x")
  schema: tree.aontu:1:17 (integer)
$ echo $?
1
```

An alias the document doesn't declare has no term, so no rule
applies:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x: %U}` refuses `{"x": 1}`: `%U` is declared nowhere. -/
example : ¬ Instance .empty (.map [("x", false, .alias "U")] none false) (.map [("x", .int 1)]) := by
```

Write `undeclared.aontu`:

<!-- test: scenario undeclared -->
<!-- test: file undeclared.aontu -->
```aontu
x: %U
```

and `undeclared-data.aontu`:

<!-- test: file undeclared-data.aontu -->
```aontu
x: 1
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet undeclared.aontu undeclared-data.aontu
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
/-- A step of a path: a member's key, or a position in a list. -/
inductive Seg where
  | key (k : String)
  | idx (i : Nat)
```

`Data.at`, beside it in the file, follows the steps down a value. A
path term admits what the whole value holds at its path:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- A path admits what the whole value holds at the path: the same
  value, compared as values. -/
  | path {p : List Seg} {j' j : Data} :
      root.at p = some j' → j'.Same j → Admits env root (.path p) j
```

The rule compares the two as values:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- `j` and `j'` are one value: the same scalar, lists alike element by
element, and maps with the same members, in whatever order Lean lists
them. -/
inductive Data.Same : Data → Data → Prop
  | num {x : Number} : Same (.num x) (.num x)
  | str {s : String} : Same (.str s) (.str s)
  | bool {b : Bool} : Same (.bool b) (.bool b)
  | null : Same .null .null
  | map {fs gs : List (String × Data)} :
      (∀ k, (lookup k fs).isSome = (lookup k gs).isSome) →
      (∀ k x y, lookup k fs = some x → lookup k gs = some y → Same x y) →
      Same (.map fs) (.map gs)
  | list {xs ys : List Data} :
      xs.length = ys.length →
      (∀ (i : Nat) (x y : Data), xs[i]? = some x → ys[i]? = some y → Same x y) →
      Same (.list xs) (.list ys)
```

`Same` is a relation of its own, with a rule for each kind of value.
A scalar is the same as itself, and two maps are the same when they
give each key the same value, whatever order their lists take:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x: $.y, y: integer}`. -/
abbrev refDoc (y : Val) : Val := .map [("x", false, .path [.key "y"]), ("y", false, y)] none false
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- It admits `{"x": 1, "y": 1}`. -/
example : Instance .empty (refDoc .integer) (.map [("x", .int 1), ("y", .int 1)]) := by
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- It refuses `{"x": 1, "y": 2}`. -/
example : ¬ Instance .empty (refDoc .integer) (.map [("x", .int 1), ("y", .int 2)]) := by
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x: $.y, y: any}` admits `{"x": {"a": 1, "b": 2}, "y": {"b": 2, "a": 1}}`:
the two objects have the same members, so they are one value. -/
example : Instance .empty (refDoc .any)
    (.map [("x", .map [("a", .int 1), ("b", .int 2)]), ("y", .map [("b", .int 2), ("a", .int 1)])]) := by
```

Here the schema is the whole document, so there are no `admitted` and
`refused` keys. Write `refs.aontu`:

<!-- test: scenario refs -->
<!-- test: file refs.aontu -->
```aontu
x: $.y
y: integer
```

then `same.aontu`:

<!-- test: file same.aontu -->
```aontu
x: 1
y: 1
```

and `different.aontu`:

<!-- test: file different.aontu -->
```aontu
x: 1
y: 2
```

Now vet each:

<!-- test: run -->
```sh
$ aontu vet refs.aontu same.aontu
verdict: valid
$ aontu vet refs.aontu different.aontu
verdict: invalid

$.x: scalar_value [conflict]
  [aontu/scalar_value]: Cannot unify values at path $.x
  data: different.aontu:2:4 (2)
  data: different.aontu:1:4 (1)
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

and `members-data.aontu`:

<!-- test: file members-data.aontu -->
```aontu
x: { a:1 b:2 }
y: { b:2 a:1 }
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet members.aontu members-data.aontu
verdict: valid
```

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
example : .meet .integer (.min (.int 3)) ⊑[.empty] .integer := meet_le_left _ _ _

/-- `integer & min(3)` is not above `integer`: `2` is the instance that
shows it. -/
example : ¬ (.integer ⊑[.empty] .meet .integer (.min (.int 3))) := by
  intro h
  cases (h (.int 2) ⟨by decide, .integer⟩).2 with
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
admitted: { x?:integer } & { x:integer }
refused: { x?:integer } & { x:integer }
```

and `merge-data.aontu`:

<!-- test: file merge-data.aontu -->
```aontu
admitted: x: 1
refused: {}
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet merge.aontu merge-data.aontu
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
v: string & (string & empty())
```

and `waiver-data.aontu`:

<!-- test: file waiver-data.aontu -->
```aontu
v: ""
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet waiver.aontu waiver-data.aontu
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
def Holds (env : Env) (root : Data) : Trial → Data → Prop
  | .is v, j => Admits env root v j
  | .when c t e, j =>
    (Holds env root c j ∧ Holds env root t j) ∨ (¬ Holds env root c j ∧ Holds env root e j)
  | .nof n cs, j => ∃ k, Count env root cs j k ∧ Admits env root n (.int k)

/-- `Count env root cs j k`: exactly `k` of the trials `cs` pass on `j`. -/
def Count (env : Env) (root : Data) : List Trial → Data → Nat → Prop
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
example : Holds .empty (.int (-1)) (.nof (.lit (.num (.int 1))) [.is .integer, .is (.min (.int 0))])
    (.int (-1)) := by
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- …and refuses `3`, which both admit. -/
example : ¬ Holds .empty (.int 3) (.nof (.lit (.num (.int 1))) [.is .integer, .is (.min (.int 0))])
    (.int 3) := by
```

The refusal leans on a theorem of the same file, that a list of trials
has one count at most:

<!-- test: quote spec/Aontu/Trial.lean -->
```lean
/-- A list of trials has one count at most. -/
theorem Count.unique {env : Env} {root : Data} :
    ∀ {cs : List Trial} {j : Data} {k k' : Nat},
      Count env root cs j k → Count env root cs j k' → k = k'
```

Write `nof.aontu`:

<!-- test: scenario nof -->
<!-- test: file nof.aontu -->
```aontu
admitted: nof(1, integer, min(0))
refused: nof(1, integer, min(0))
```

and `nof-data.aontu`:

<!-- test: file nof-data.aontu -->
```aontu
admitted: -1
refused: 3
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet nof.aontu nof-data.aontu
verdict: invalid

$.refused: nof [conflict]
  [aontu/nof]: Cannot unify values at path $.refused
  expected: nof(1,integer,min(0))
  actual:   3
  data: nof-data.aontu:2:10 (3)
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
    (.when (.is .string) (.is (.lit (.str "a"))) (.is (.min (.int 0)))) (.int 5) :=
  .inr ⟨(fun h => nomatch h), .min (by decide)⟩

/-- …and refuses `"b"`: a string, and not `"a"`. -/
example : ¬ Holds .empty (.str "b")
    (.when (.is .string) (.is (.lit (.str "a"))) (.is (.min (.int 0)))) (.str "b") := by
```

Write `when.aontu`:

<!-- test: scenario when -->
<!-- test: file when.aontu -->
```aontu
admitted: when(string, "a", min(0))
refused: when(string, "a", min(0))
```

and `when-data.aontu`:

<!-- test: file when-data.aontu -->
```aontu
admitted: 5
refused: "b"
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet when.aontu when-data.aontu
verdict: invalid

$.refused: when [conflict]
  [aontu/when]: Cannot unify values at path $.refused
  expected: when(string,"a",min(0))
  actual:   "b"
  data: when-data.aontu:2:10 ("b")
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
  | float : RefFree .float
  | biginteger : RefFree .biginteger
  | bigdecimal : RefFree .bigdecimal
  | number : RefFree .number
  | string : RefFree .string
  | anyString : RefFree .anyString
  | boolean : RefFree .boolean
  | lit {s : Scalar} : RefFree (.lit s)
  | min {n : Number} : RefFree (.min n)
  | max {n : Number} : RefFree (.max n)
  | multiple {d : Number} : RefFree (.multiple d)
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
def check : Val → Data → Bool
  | .integer, j => match j with
    | .num (.int _) => true
    | _ => false
  | .float, j => match j with
    | .num (.float _) => true
    | _ => false
  | .biginteger, j => match j with
    | .num (.bigint _) => true
    | _ => false
  | .bigdecimal, j => match j with
    | .num (.bigdec _) => true
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
example : check (.meet .integer (.min (.int 3))) (.int 7) = true := by decide

/-- …and `{x: integer}` refuses `{}`. -/
example : check (.map [("x", false, .integer)] none false) (.map []) = false := by decide
```

`spec/Oracle.lean` uses `check` to write the engines' test rows. It
builds every term of the fragment up to one `&`, and two sets of values
to try each against:

<!-- test: quote spec/Oracle.lean -->
```lean
def bases : List Val :=
  [.any, .nil, .integer, .meet .number (.multiple (.int 1)), .string, .anyString,
    .min (.int 0), .min (.int 3)]

/-- `{"x": v}`, or `{"x"?: v}`. -/
def field (opt : Bool) (v : Val) : Val := .map [("x", opt, v)] none false

def level1 : List Val := bases ++ bases.flatMap fun v => [field true v, field false v]

def vals : List Val := level1 ++ level1.flatMap fun a => level1.map (.meet a)

def scalars : List Data := [.null, .bool true, .int 0, .int 3, .int (-1), .str "", .str "a"]

/-- The instances of the first 9,600 rows. -/
def first : List Data :=
  scalars ++ [.map []] ++ scalars.map (fun j => .map [("x", j)]) ++ [.map [("y", .int 1)]]

/-- The instances of the rows after them, numbered on so that no earlier
row is renamed: two big decimals, one either side of three, a big
integer no double holds, and a list, each also under a key, written
`0d1.5`, `0d3.5`, `0d9007199254740993`, and `[1]`. -/
def more : List Data :=
  let xs : List Data :=
    [.num (.bigdec (.of 15 1)), .num (.bigdec (.of 35 1)), .num (.bigint 9007199254740993),
      .list [.int 1]]
  xs ++ xs.map (fun j => .map [("x", j)])

def instances : List Data := first ++ more
```

The oracle numbers the second set's rows after the first's, so adding
it renamed no row. The file proves that every term it builds reads no
reference, and every instance is a value, so each answer is the
definition's:

<!-- test: quote spec/Oracle.lean -->
```lean
/-- Every row's verdict is the definition's: `v` admits `j`, taken
whole, under no alias declaration. -/
theorem verdict_exact {v : Val} (hv : v ∈ vals) {j : Data} (hj : j ∈ instances) :
    check v j = true ↔ Instance Env.empty v j :=
  ⟨fun h => ⟨instances_wellFormed j hj, (check_iff (vals_refFree v hv) j).mp h⟩,
    fun h => (check_iff (vals_refFree v hv) j).mpr h.2⟩
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

The schema and the value are text, which `spec/Oracle/Print.lean`
writes. The printer is the oracle's and no part of the definition, and
no proof checks it: that an engine reads `v: 0d9007199254740993` as that
big integer is a claim about the engine's reader, which these rows
test.

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

## 16. What the definition doesn't say yet

The definition covers what this page walked through, and has no rule
for the rest of the language, so it says nothing about it. The
[language reference](reference-language.md) states the rest: the
two readings of a number that `--exact-numbers` switches between, the
bounds beyond `min`, `max` and `multiple`, most built-in functions, generation with
`each`, `pack` and `emit`, formats, and marks such as `hide()` and
`type()`. [`aontu vet`](reference-api.md#aontu-vet) states which
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

and `position-data.aontu`:

<!-- test: file position-data.aontu -->
```aontu
alone: 2
arm: [1 2]
list: [1 2]
```

Now vet it:

<!-- test: run -->
```sh
$ aontu vet position.aontu position-data.aontu
verdict: invalid

$.arm: empty [conflict]
  [aontu/empty]: Cannot unify values at path $.arm
  data: position-data.aontu:2:6 ([1,2])
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
