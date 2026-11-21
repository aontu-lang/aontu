import Aontu.Arith

/-!
# Reading a number in the data

How `vet` reads a number the data writes, in each of its two read modes
(decisions 70 and 71 of §7 of `sketch/DEFINITION.0.md`). JSON writes a
number as a sign, digits, a point with more digits after it, and an
exponent. `--exact-numbers` reads the text's exact value, in the first
exact leaf that holds it and within the exactness budget. Otherwise the
text reads as the double nearest it: an `integer` where the text has no
point and that double is a whole number the `integer` leaf holds, and a
`float` elsewhere. A whole number written with no point that no double
holds is refused rather than rounded, and so is a number beyond the
double's range, while a fraction rounds. A schema is text too, but its
numbers are its reader's, as the rest of its text is: only the data is
read here.
-/

namespace Aontu

/-- A number as JSON writes it: its sign, its digits with any point
taken out, how many of them follow the point (none where it has no
point), and its exponent, zero where it has none. `1.50e-3` is
`⟨false, 150, 2, -3⟩`. -/
structure NumText where
  neg : Bool
  digits : ℕ
  places : ℕ
  exp : ℤ
  deriving DecidableEq, Repr

/-- The exact value the text writes, `± digits * 10 ^ (exp - places)`,
as an integer over a positive natural. -/
def NumText.value (t : NumText) : ℤ × ℕ :=
  let n : ℤ := if t.neg then -(t.digits : ℤ) else t.digits
  let s : ℤ := (t.places : ℤ) - t.exp
  if s ≤ 0 then (n * 10 ^ (-s).toNat, 1) else (n, 10 ^ s.toNat)

/-- The default mode, through the double nearest the text, and none
beyond the double's range. Text with no point and no negative exponent
writes a whole number, and is refused where that double is another
number. Text with no point whose double is a whole number the `integer`
leaf holds is an `integer`, and the rest is a `float`. So `1e2`, and
`1e-5000`, whose nearest double is zero, are integers; `1.0` and
`2 ^ 64` are floats; and `2 ^ 53 + 1` and `1e400` are refused. -/
def NumText.readDouble (t : NumText) : Option Number :=
  let (a, d) := t.value
  (Float.nearest a d).bind fun x =>
    let (b, e) := (Number.float x).value
    if t.places = 0 ∧ 0 ≤ t.exp ∧ a * (e : ℤ) ≠ b * (d : ℤ) then none
    else if t.places = 0 ∧ b % (e : ℤ) = 0 then
      some ((Number.ofIntegerLeaf (b / (e : ℤ))).getD (.float x))
    else some (.float x)

/-- The digits `u` with their trailing zeros taken off while the scale
`s` stays positive, at most `fuel` of them. -/
def dropZeros : ℕ → ℕ → ℤ → ℕ × ℤ
  | 0, u, s => (u, s)
  | fuel + 1, u, s =>
    if 0 < s ∧ u ≠ 0 ∧ u % 10 = 0 then dropZeros fuel (u / 10) (s - 1) else (u, s)

/-- `--exact-numbers`, the text's exact value, its trailing zeros
dropped while it has a fraction. Zero is the integer zero. A whole
number is in the `integer` leaf where the leaf holds it, and a
`biginteger` otherwise. A fraction is a `bigdecimal`. Past the
exactness budget it is refused: a whole number whose exponent passes
its fraction digits by more than 4096, or a fraction with a scale above
4096 or more than 4096 digits. So `1.0` and `1e2` are integers,
`2 ^ 63` and `1e400` big integers, and `1e-5000` and `1e4097` are
refused. -/
def NumText.readExact (t : NumText) : Option Number :=
  if t.digits = 0 then some (.integer (.of 0)) else
  let (u, s) := dropZeros (ndigits t.digits) t.digits ((t.places : ℤ) - t.exp)
  let n : ℤ := if t.neg then -(u : ℤ) else u
  if s ≤ 0 then
    if 4096 < -s then none else
    let w := n * 10 ^ (-s).toNat
    some ((Number.ofIntegerLeaf w).getD (.biginteger ⟨w⟩))
  else if 4096 < s ∨ 4096 < ndigits u then none
  else some (.bigdecimal (BigDecimal.normal n s))

/-- A number the data writes, read exactly under `--exact-numbers` and
otherwise through the nearest double; none where the mode reads it as
no number. -/
def NumText.read (exact : Bool) (t : NumText) : Option Number :=
  if exact then t.readExact else t.readDouble

/-- Data as JSON writes it, each number its text, which a read mode
makes a value of (`DataText.read`). -/
inductive DataText where
  | num (t : NumText)
  | str (s : String)
  | bool (b : Bool)
  | null
  | map (fs : List (String × DataText))
  | list (xs : List DataText)

mutual
/-- The data the text writes, each number read in the mode; none where
the mode reads one of them as no number. -/
def DataText.read (exact : Bool) : DataText → Option Data
  | .num t => (t.read exact).map .num
  | .str s => some (.str s)
  | .bool b => some (.bool b)
  | .null => some .null
  | .map fs => (readMembers exact fs).map .map
  | .list xs => (readItems exact xs).map .list

/-- A map's members, each value read. -/
def readMembers (exact : Bool) : List (String × DataText) → Option (List (String × Data))
  | [] => some []
  | (k, x) :: fs => (x.read exact).bind fun j => (readMembers exact fs).map ((k, j) :: ·)

/-- A list's elements, each read. -/
def readItems (exact : Bool) : List DataText → Option (List Data)
  | [] => some []
  | x :: xs => (x.read exact).bind fun j => (readItems exact xs).map (j :: ·)
end

end Aontu
