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

The definition is seven Lean modules, which make one definition: every
module reads the same data, the same terms, and the same rule for what
a term admits, and none declares its own.

| File | Holds |
|---|---|
| [`spec/Aontu/Data.lean`](../spec/Aontu/Data.lean) | the data, scalars first: numbers in the four leaves, integers, floats, big integers, and big decimals, then strings, then maps and lists, and paths into a value |
| [`spec/Aontu/Syntax.lean`](../spec/Aontu/Syntax.lean) | the terms of the language, one constructor for each construct |
| [`spec/Aontu/Admits.lean`](../spec/Aontu/Admits.lean) | what each term admits, one rule for each form |
| [`spec/Aontu/Order.lean`](../spec/Aontu/Order.lean) | the order between terms, the meet, the strict bounds under their closed ones, two declarations of one key, and the contract any `subsume` must meet |
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
answer, and `¬` reads *not*. The rule for `integer` admits every number
of the leaf:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | integer {x : Integer} : Admits env root .integer (.num (.integer x))
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

`float` admits every float:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | float {x : Float} : Admits env root .float (.num (.float x))
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
  | biginteger {x : BigInteger} : Admits env root .biginteger (.num (.biginteger x))
  | bigdecimal {x : BigDecimal} : Admits env root .bigdecimal (.num (.bigdecimal x))
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

`number` admits a number of every leaf:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  | number {x : Number} : Admits env root .number (.num x)
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
  | boolean {b : Bool} : Admits env root .boolean (.bool b)
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

The four refusals after the first example borrow the checker of step
14 to compute the answer. Write `literals.aontu`:

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

Each of the four bounds has one rule for each kind of end. `min` and
`max` first:

<!-- test: quote spec/Aontu/Admits.lean -->
```lean
  /-- A bound with a number at its end admits a number, by exact value,
  and one with a string at its end a string, in code-point order; the
  bound's domain is its end's, so `min(0)` admits no string and
  `max("b")` no number. -/
  | min {n x : Number} : n.le x → Admits env root (.min (.num n)) (.num x)
  | minStr {b s : String} : b ≤ s → Admits env root (.min (.str b)) (.str s)
  | max {n x : Number} : x.le n → Admits env root (.max (.num n)) (.num x)
  | maxStr {b s : String} : s ≤ b → Admits env root (.max (.str b)) (.str s)
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
  | multiple {d x : Number} : d.Positive → x.multipleOf d → Admits env root (.multiple d) (.num x)
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
  | above {n x : Number} : n.lt x → Admits env root (.above (.num n)) (.num x)
  | aboveStr {b s : String} : b < s → Admits env root (.above (.str b)) (.str s)
  | beneath {n x : Number} : x.lt n → Admits env root (.beneath (.num n)) (.num x)
  | beneathStr {b s : String} : s < b → Admits env root (.beneath (.str b)) (.str s)
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
  and a list of both nothing. -/
  | neq {vs : List Bound} {x : Number} :
      (∀ v, v ∈ vs → ∃ n, v = .num n ∧ n ≠ x) → Admits env root (.neq vs) (.num x)
  | neqStr {vs : List Bound} {s : String} :
      (∀ v, v ∈ vs → ∃ t, v = .str t ∧ t ≠ s) → Admits env root (.neq vs) (.str s)
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
  /-- `len(c)` admits a string, a list, or a map whose size, an
  integer, `c` admits; `len(0)` admits `""`, and a scalar has no size. -/
  | len {c : Val} {j : Data} {n : ℕ} (h : IntegerLeaf n) :
      j.size = some n → Admits env root c (.num (.integer ⟨n, h⟩)) → Admits env root (.len c) j
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
  lacks the key, is a distinctness the container cannot show. -/
  | unique {k : Option String} {j : Data} {ms : List Data} :
      j.members = some ms →
      (∀ x, x ∈ ms → (x.project k).isSome) →
      ms.Pairwise (fun x y => ∀ x' y', x.project k = some x' → y.project k = some y' →
        ¬ x'.Same y') →
      Admits env root (.unique k) j
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

These examples borrow the checker of step 14, which computes whether
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
  `""` exactly where its predicate holds of it, and admits no other
  kind of value. -/
  | re {p s : String} : host.pattern p s → Admits env root (.re p) (.str s)
  | format {g s : String} : host.format g s → Admits env root (.format g) (.str s)
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
  later elements are allowed; the spread holds every element. -/
  | list {items : List Val} {spread : Option Val} {xs : List Data} :
      items.length ≤ xs.length →
      (∀ (i : ℕ) (v : Val) (x : Data), items[i]? = some v → xs[i]? = some x →
        Admits env root v x) →
      (∀ s, spread = some s → ∀ x, x ∈ xs → Admits env root s x) →
      Admits env root (.list items spread) (.list xs)
```

`items[i]?` is the item at position `i`, or `none` past the end. So
`[integer, string]` needs two elements, and allows more:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `[integer, string]` admits `[1, "a", true]`: the list stays open. -/
example : Instance .empty (.list [.integer, .string] none) (.list [.integer 1, .str "a", .bool true]) := by
  refine ⟨by decide, ?_⟩
  refine .list (by decide) ?_ (fun _ h => nomatch h)
  intro i v x hv hx
  rcases i with _ | _ | i
  · cases hv; cases hx; exact .integer
  · cases hv; cases hx; exact .string (by decide)
  · simp at hv

/-- `[integer, string]` refuses `[1]`: its second position is missing. -/
example : ¬ Instance .empty (.list [.integer, .string] none) (.list [.integer 1]) := by
  rintro ⟨-, h⟩
  cases h with
  | list hlen _ _ => exact absurd hlen (by decide)

/-- `[&: integer]` refuses `[1, "a"]`: the spread holds every element. -/
example : ¬ Instance .empty (.list [] (some .integer)) (.list [.integer 1, .str "a"]) := by
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
  | meet {a b : Val} {j : Data} :
      Admits env root a j → Admits env root b j → Admits env root (.meet a b) j
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

## 9. Path references

A path names a part of a value, step by step:

<!-- test: quote spec/Aontu/Data.lean -->
```lean
/-- A step of a path: a member's key, or a position in a list. -/
inductive Seg where
  | key (k : String)
  | idx (i : ℕ)
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
      (∀ (i : ℕ) (x y : Data), xs[i]? = some x → ys[i]? = some y → Same x y) →
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
example : Instance .empty (refDoc .integer) (.map [("x", .integer 1), ("y", .integer 1)]) := by
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- It refuses `{"x": 1, "y": 2}`. -/
example : ¬ Instance .empty (refDoc .integer) (.map [("x", .integer 1), ("y", .integer 2)]) := by
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `{x: $.y, y: any}` admits `{"x": {"a": 1, "b": 2}, "y": {"b": 2, "a": 1}}`:
the two objects have the same members, so they are one value. -/
example : Instance .empty (refDoc .any)
    (.map [("x", .map [("a", .integer 1), ("b", .integer 2)]), ("y", .map [("b", .integer 2), ("a", .integer 1)])]) := by
```

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
passes where `n` admits the number of its trials that pass, an
integer. -/
def Holds (env : Env) (root : Data) : Trial → Data → Prop
  | .is v, j => Admits env root v j
  | .when c t e, j =>
    (Holds env root c j ∧ Holds env root t j) ∨ (¬ Holds env root c j ∧ Holds env root e j)
  | .nof n cs, j => ∃ k, Count env root cs j k ∧ ∃ h : IntegerLeaf k, Admits env root n (.integer k h)

/-- `Count env root cs j k`: exactly `k` of the trials `cs` pass on `j`. -/
def Count (env : Env) (root : Data) : List Trial → Data → ℕ → Prop
  | [], _, k => k = 0
  | c :: cs, j, k =>
    (Holds env root c j ∧ ∃ k', k = k' + 1 ∧ Count env root cs j k') ∨
      (¬ Holds env root c j ∧ Count env root cs j k)
end
```

`mutual` defines two things that read each other. `Holds` recurses on
the trial schema, which is what lets `¬` appear in it, and `Count` says
how many trials of a list pass. `nof(n, …)` passes where `n` admits that
count, as an integer, so `nof(1, …)` asks for exactly one:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `nof(1, integer, min(0))` admits `-1`, which one trial admits. -/
example : Holds .empty (.integer (-1)) (.nof (.lit (.num (.integer (.of 1)))) [.is .integer, .is (.min (.num (.integer (.of 0))))])
    (.integer (-1)) := by
```

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- …and refuses `3`, which both admit. -/
example : ¬ Holds .empty (.integer 3) (.nof (.lit (.num (.integer (.of 1)))) [.is .integer, .is (.min (.num (.integer (.of 0))))])
    (.integer 3) := by
```

The refusal leans on a theorem of the same file, that a list of trials
has one count at most:

<!-- test: quote spec/Aontu/Trial.lean -->
```lean
/-- A list of trials has one count at most. -/
theorem Count.unique {env : Env} {root : Data} :
    ∀ {cs : List Trial} {j : Data} {k k' : ℕ},
      Count env root cs j k → Count env root cs j k' → k = k'
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
so for each exactly one trial passes. `3` would pass both, and `nof`
refuses it, as the second example proves.

`when(c, t, e)` holds a value to `t` where `c` admits it, and to `e`
where it doesn't:

<!-- test: quote spec/Aontu/Tour.lean -->
```lean
/-- `when(string, "a", min(0))` admits `5`: not a string, and at least 0. -/
example : Holds .empty (.integer 5)
    (.when (.is .string) (.is (.lit (.str "a"))) (.is (.min (.num (.integer (.of 0)))))) (.integer 5) :=
  .inr ⟨(fun h => nomatch h), .min (by decide)⟩

/-- …and refuses `"b"`: a string, and not `"a"`. -/
example : ¬ Holds .empty (.str "b")
    (.when (.is .string) (.is (.lit (.str "a"))) (.is (.min (.num (.integer (.of 0)))))) (.str "b") := by
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

## 14. A checker, admitted by a proof

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
  | list {items : List Val} {spread : Option Val} :
      (∀ v, v ∈ items → Checkable v) → (∀ s, spread = some s → Checkable s) →
      Checkable (.list items spread)
  | meet {a b : Val} : Checkable a → Checkable b → Checkable (.meet a b)
```

A pattern's predicate is opaque, so no algorithm can run it, and `re`
and `format` are outside the checker's reach as an alias is.

`check` returns `true` or `false`, where `Admits` is a statement. Its
first cases:

<!-- test: quote spec/Aontu/Check.lean -->
```lean
/-- Whether `v` admits `j`, computed. -/
def check : Val → Data → Bool
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

The rest of it takes one case for each form in the same way. Nothing in
the code says that `check` and `Admits` agree. One theorem does:

<!-- test: quote spec/Aontu/Check.lean -->
```lean
/-- `check` decides admission for every checkable value. -/
theorem check_iff {v : Val} (h : v.Checkable) : ∀ j, check v j = true ↔ Admits env root v j := by
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

Both engines answer every row of both files as the definition does,
but for the cases step 12 lists.

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

Two constructs the definition leaves out on purpose: `|` and `*`. The
language reads each by where it stands, so a rule for each form alone
would be wrong. Write `position.aontu`:

<!-- test: scenario position -->
<!-- test: file position.aontu -->
```aontu
alone: *1 & 2
list: [integer] & [1 2]
```

and run it:

<!-- test: run -->
```sh
$ aontu -c position.aontu
{"alone":2,"list":[1,2]}
```

A preference alone is a default its type can override, so `*1` admits
`2`, as the [reference](reference-language.md#preference--default-)
says, and `[integer]` admits `[1 2]`, open past its one position. In a
disjunction the same list admits only its own length. Write
`arm.aontu`:

<!-- test: file arm.aontu -->
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
$ aontu vet arm.aontu arm-data.aontu
verdict: invalid

$.v: empty [conflict]
  [aontu/empty]: Cannot unify values at path $.v
  data: arm-data.aontu:1:4 ([1,2])
  schema: arm.aontu:1:4 ([integer]|[string])
$ echo $?
1
```

Neither arm admits two elements, so the disjunction admits nothing,
and the engine reports it `empty`.

Next, read [unification](unification.md), which explains in prose the
operation these rules define.
