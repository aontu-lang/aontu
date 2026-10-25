import Aontu.Output
import Aontu.Alias
import Aontu.Text

/-!
# The verdicts

What `aontu vet` answers about a schema and a document of data: `valid`,
`invalid`, `incomplete` or `error`, each defined from `Admits` and
`Output`. A schema whose normal form holds a `nil` anywhere but in a
spread, or a preference clash, two preferred arms of one rank that
single out different values, does not stand on its own: `error`,
whatever the data. Otherwise the schema read against the data, the data
filling each hole the schema leaves unfilled, is dead, and the data is
refused outright: `invalid`. Otherwise it singles out a value, the data
filled by the schema's defaults:
`valid` in the default mode, and without the fill only where the data
as written is an instance. What remains, a meet alive that singles out
nothing, or a fill the data lacks, is `incomplete`, which `--partial`
turns to `valid`. `vet` computes the verdict beside `vet_iff`, and the
theorems hold the verdicts to the two relations: without the fill,
`valid` is `Instance`; with it, the filled value is an instance of the
schema; and `invalid` refuses the data as an instance. A document reads
as its expansion under its declarations, and one that refers to a name
it does not declare, or whose names break the alias-cycle rule, is an
`error` before anything else is asked.
-/

namespace Aontu

/-- The four answers of `vet`. -/
inductive Verdict where
  | valid
  | invalid
  | incomplete
  | error
  deriving DecidableEq, Repr

/-- The modes of `vet`: whether the schema fills the data, the default,
and whether what is left unresolved passes, which is `--partial`,
`lax` here since Lean keeps the word. -/
structure Mode where
  fill : Bool := true
  lax : Bool := false

/-! ## The data as a term -/

mutual
/-- A document of data as the term it is: each scalar its literal, an
address the path value that captures it, a map its members as required
keys, open, and a list its elements, open. -/
def Data.term : Data → Val
  | .num x => .lit (.num x)
  | .str s => .lit (.str s)
  | .bool b => .lit (.bool b)
  | .null => .lit .null
  | .map fs => .map (termMembers fs) none false
  | .list xs => .list (termElems xs) none false
  | .addr a => .addr a

def termMembers : List (String × Data) → List (String × Bool × Val)
  | [] => []
  | (k, x) :: fs => (k, false, x.term) :: termMembers fs

def termElems : List Data → List Val
  | [] => []
  | x :: xs => x.term :: termElems xs
end

/-! ## The data as a term can be read -/

mutual
theorem Data.term_checkableA : ∀ j : Data, j.term.CheckableA
  | .num _ => .lit
  | .str _ => .lit
  | .bool _ => .lit
  | .null => .lit
  | .addr _ => .addr
  | .map fs => .map (termMembers_checkableA fs) (fun _ h => nomatch h)
  | .list xs => .list (termElems_checkableA xs) (fun _ h => nomatch h)

theorem termMembers_checkableA : ∀ fs : List (String × Data), ∀ k o v, (k, o, v) ∈ termMembers fs →
    v.CheckableA
  | [], _, _, _, h => absurd h (List.not_mem_nil)
  | (_, x) :: fs, k, o, v, h => by
    rcases List.mem_cons.mp h with h | h
    · simp only [Prod.mk.injEq] at h
      obtain ⟨-, -, rfl⟩ := h
      exact Data.term_checkableA x
    · exact termMembers_checkableA fs k o v h

theorem termElems_checkableA : ∀ xs : List Data, ∀ v, v ∈ termElems xs → v.CheckableA
  | [], _, h => absurd h (List.not_mem_nil)
  | x :: xs, v, h => by
    rcases List.mem_cons.mp h with rfl | h
    · exact Data.term_checkableA x
    · exact termElems_checkableA xs v h
end

/-! ## Selecting: `match` and `filter`

A `match` holds a value to the result of the first arm whose pattern
admits the value its scrutinee generates, and a `filter` to the members
of the container its source generates that its condition admits. Each
selects by a value the document has settled, so each is made once the
document is read, before the meet, and a document reads as its
expansion with its selections made. -/

/-- The result the arms select for the value `x`: the first whose
pattern admits it, the default where none does, and `nil`, which no
value satisfies, where there is no default: no match and no default is
an error of the document, not an empty answer. -/
def selectArm (ds : Decls) (x : Data) : List (Val × Val) → Option Val → Val
  | [], d => d.getD .nil
  | (p, r) :: arms, d => if checkR ds p x then r else selectArm ds x arms d

/-- A lone preference in normal form, `*x | super(x)`, read as `x`. -/
def Val.lonePref : Val → Val
  | .or [(r, x), (0, s)] => if 0 < r && s.beq x.super then x else .or [(r, x), (0, s)]
  | v => v

/-- A term with its riders and a lone `*` read through. -/
def Val.unwrap : Val → Val
  | .ride _ v _ => v.unwrap
  | .pref _ x => x.unwrap
  | v => v

/-- A term as a call reads its argument: its riders and a lone
preference read through, the preference's normal form too, and the
riders inside it. -/
def Val.operand (v : Val) : Val := v.unwrap.lonePref.unwrap

/-- The number a term is, read as a call reads its argument. -/
def Val.number? (v : Val) : Option Number :=
  match v.operand with
  | .lit (.num n) => some n
  | _ => none

/-- The members a fold reads in a bag's normal form, the riders around
it read through: a list's elements in order, and a map's members in key
order, but an optional one whose value generates nothing or an empty map
or list, one that is absence, and a marked one, which is no part of the
output, unless the bag carries a mark itself, which lifts its members'
marks. -/
def Val.members (ds : Decls) (lifted : Bool := false) : Val → Option (List Val)
  | .ride k v _ => v.members ds (lifted || decide (k = .type) || decide (k = .hide))
  | .list items _ _ => some items
  | .map fs _ _ => some ((fs.mergeSort fun a b => decide (a.1 ≤ b.1)).filterMap fun m =>
      if (!lifted && m.2.2.marked) || m.2.2.isAbsent || (m.2.1 && (genD ds m.2.2).all Data.emptyBag) then none
      else some m.2.2)
  | _ => none

/-- What a call that can wait makes of its arguments: the term it is, a
refusal, or arguments it does not take yet, where it waits. -/
inductive Made where
  | made (v : Val)
  | refused
  | waits


/-- The text `+` writes for a scalar beside a string; `null` has none. -/
def Scalar.plusText? : Scalar → Option String
  | .str s => some s
  | .bool b => some (if b then "true" else "false")
  | .num n => some n.text
  | .null => none

/-- What `+` makes of two terms in normal form: two lists one list, the
left's elements then the right's; two booleans either; a string and a
scalar with text the two texts joined; two numbers their sum by `add`,
refused where no leaf holds it; and anything else waits: a kind,
`null`, a map, a list beside a scalar, a boolean beside a number. -/
def plusOf (a b : Val) : Made :=
  match a.operand, b.operand with
  | .list xs _ _, .list ys _ _ => .made (.list (xs ++ ys) none false)
  | .lit (.bool p), .lit (.bool q) => .made (.lit (.bool (p || q)))
  | .lit (.str s), .lit y => (y.plusText?.map fun t => .made (.lit (.str (s ++ t)))).getD .waits
  | .lit x, .lit (.str t) => (x.plusText?.map fun s => .made (.lit (.str (s ++ t)))).getD .waits
  | .lit (.num x), .lit (.num y) => ((Number.binary .add x y).map fun n => .made (.lit (.num n))).getD .refused
  | _, _ => .waits

/-- Two lists concatenate under `+` (ADR-037): the left's elements, then
the right's. -/
theorem plusOf_lists {xs ys : List Val} {s s' : Option Val} {c c' : Bool} :
    plusOf (.list xs s c) (.list ys s' c') = .made (.list (xs ++ ys) none false) := rfl

/-- The empty list adds nothing to a list's elements. -/
theorem plusOf_nil_list {ys : List Val} {s s' : Option Val} {c c' : Bool} :
    plusOf (.list [] s c) (.list ys s' c') = .made (.list ys none false) := rfl

/-- A list beside a scalar is no sum: `+` waits, in either order. -/
theorem plusOf_list_lit {xs : List Val} {s : Option Val} {c : Bool} {x : Scalar} :
    plusOf (.list xs s c) (.lit x) = .waits ∧ plusOf (.lit x) (.list xs s c) = .waits := by
  cases x <;> exact ⟨rfl, rfl⟩

/-- Whether a term in normal form is settled for `join`, its riders and a
lone preference read through: a scalar, a map or a list. -/
def Val.settled (v : Val) : Bool :=
  match v.operand with
  | .lit _ | .map _ _ _ | .list _ _ _ => true
  | _ => false

/-- The text `join` writes for a member: a scalar's as `+` writes it;
`null`, a map and a list have none. -/
def Val.joinText? (v : Val) : Option String :=
  match v.operand with
  | .lit x => x.plusText?
  | _ => none

/-- What `join` makes of its bag and its separator: where the bag is one,
and its separator or a member is not settled, it waits; otherwise it
refuses a separator that is no string, a value that is no bag, and a
member with no text, and joins the members' texts with the separator,
`""` where there is none. -/
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

/-- A term without the riders around it. -/
def Val.unride : Val → Val
  | .ride _ v _ => v.unride
  | v => v

/-- A projector in normal form, its riders read through: a string or an
integer. -/
def Val.projector? (v : Val) : Option (String ⊕ ℤ) :=
  match v.unride with
  | .lit (.str s) => some (.inl s)
  | .lit (.num (.integer i)) => some (.inr i.value)
  | _ => none

/-- The key a projector names in a map member: a string itself, and an
integer its digits, after a `-` where it is negative. -/
def projKey : String ⊕ ℤ → String
  | .inl s => s
  | .inr i => toString i

/-- The index a projector names in a list member: an integer itself, and
a string the integer its digits write, ASCII and at least one, after
one optional sign; `" 0"`, `"0.0"` and `"1e0"` name none. -/
def projIndex? : String ⊕ ℤ → Option ℤ
  | .inl s => match s.toList with
    | '-' :: ds => (String.mk ds).toNat?.map fun n => -(n : ℤ)
    | '+' :: ds => (String.mk ds).toNat?.map fun n => (n : ℤ)
    | _ => s.toNat?.map fun n => (n : ℤ)
  | .inr i => some i

/-- What a projector reads in a member in normal form, its riders read
through: a map's field at the key it names, or a list's item at the
index it names, where the list has one. -/
def Val.project? (m : Val) (p : String ⊕ ℤ) : Option Val :=
  match m.unride with
  | .map fs _ _ => (fs.find? fun f => f.1 = projKey p).map fun f => f.2.2
  | .list items _ _ => match projIndex? p with
    | some i => if 0 ≤ i then items[i.toNat]? else none
    | none => none
  | _ => none

/-- What `pick` makes of its bag and its projector: the list of what the
projector reads in each member, the members read as the folds read
them; a refusal where the bag is none, where the projector is no string
and no integer or is `""`, which names no key, or where a member lacks
what it names. -/
def pickOf (ds : Decls) (b k : Val) : Made :=
  match (normaliseD ds b).members ds, (normaliseD ds k).projector? with
  | _, some (.inl "") => .refused
  | some ms, some p =>
    match (ms.map (normaliseD ds)).mapM (fun m => m.project? p) with
    | some vs => .made (.list vs none false)
    | none => .refused
  | _, _ => .refused

/-- The key `sort` orders a member by: a number or a string, read as a
call reads its argument. -/
def Val.sortKey? (v : Val) : Option Scalar :=
  match v.operand with
  | .lit (.num n) => some (.num n)
  | .lit (.str s) => some (.str s)
  | _ => none

/-- `sort`'s order on keys: numbers by exact value, strings by code point. -/
def sortLt : Scalar → Scalar → Bool
  | .num a, .num b => decide (a.lt b)
  | .str a, .str b => decide (a < b)
  | _, _ => false

/-- Whether keys share one of `sort`'s two orders: all numbers, or all strings. -/
def sortable (ks : List Scalar) : Bool :=
  ks.all (fun k => match k with | .num _ => true | _ => false) ||
    ks.all (fun k => match k with | .str _ => true | _ => false)

/-- `sort`'s order on keyed members, descending or ascending, equal keys
each before the other, so that a stable sort keeps their order. -/
def sortLe (desc : Bool) (x y : Scalar × Val) : Bool :=
  if desc then !(sortLt x.1 y.1) else !(sortLt y.1 x.1)

/-- The projector `sort` reads in its second argument, read as `pick`
reads one: none where there is no argument or it is `""`, which orders
the members themselves. -/
def sortProjector? (ds : Decls) : Option Val → Option (Option (String ⊕ ℤ))
  | none => some none
  | some p => match (normaliseD ds p).projector? with
    | some (.inl "") => some none
    | some q => some (some q)
    | none => none

/-- Whether `sort`'s third argument, its riders read through, orders
descending: `desc` does, and `asc` or no argument does not. -/
def sortDesc? (ds : Decls) : Option Val → Option Bool
  | none => some false
  | some d => match (normaliseD ds d).unride with
    | .lit (.str "asc") => some false
    | .lit (.str "desc") => some true
    | _ => none

/-- What `sort` makes of its bag, its projector and its direction: the
members, read as the folds read them, ordered by the key the projector
reads in each, or by the member itself where `sortProjector?` reads
none, equal keys in their order. A refusal where the bag is none, where
the projector is no string and no integer, where the direction is
neither `asc` nor `desc`, where a member lacks what the projector names
or its key is no number and no string, and where the keys are not all
numbers or all strings. -/
def sortOf (ds : Decls) (b : Val) (p d : Option Val) : Made :=
  match (normaliseD ds b).members ds, sortProjector? ds p, sortDesc? ds d with
  | some ms, some q, some desc =>
    match (ms.map (normaliseD ds)).mapM fun m => (q.elim (some m) m.project?).bind Val.sortKey? with
    | some ks =>
      if sortable ks then
        .made (.list (((ks.zip (ms.map (normaliseD ds))).mergeSort (sortLe desc)).map Prod.snd)
          none false)
      else .refused
    | none => .refused
  | _, _, _ => .refused

/-- The run of code points, from `lo` up to `hi`, a start and a length
select in a string of `n`: from a start of zero or more the run reaches
forward, and from a negative one it ends that far from the end; a
negative length is the whole string, and both ends clamp. -/
def caseSpan (n : ℕ) (start len : ℤ) : ℕ × ℕ :=
  let span := if len < 0 then n else len.toNat
  if 0 ≤ start then (min start.toNat n, min (min start.toNat n + span) n)
  else (((n : ℤ) + start).toNat - span, ((n : ℤ) + start).toNat)

/-- A string with the run of code points a start and a length select
converted by `conv`, the run converted whole, and the rest as it
stands. -/
def caseRun (conv : String → String) (s : String) (start len : ℤ) : String :=
  let (lo, hi) := caseSpan s.length start len
  if hi ≤ lo then s
  else String.mk (s.toList.take lo) ++ conv (String.mk ((s.toList.drop lo).take (hi - lo)))
    ++ String.mk (s.toList.drop hi)

/-- An index in normal form, its riders read through: an integer, or a
big integer that 64 bits hold, as an integer's value does. -/
def Val.index? (v : Val) : Option ℤ :=
  match v.unride with
  | .lit (.num (.integer i)) => some i.value
  | .lit (.num (.biginteger i)) =>
    if -2 ^ 63 ≤ i.value ∧ i.value < 2 ^ 63 then some i.value else none
  | _ => none

/-- A range argument of `upper` and `lower`, an index where it is given,
and `dflt` where it is not. -/
def rangeArg? (ds : Decls) (dflt : ℤ) : Option Val → Option ℤ
  | none => some dflt
  | some a => (normaliseD ds a).index?

/-- What `upper` (`up`) or `lower` makes of its argument and its range,
the argument's riders read through: a string, the run the range selects
converted by the host's case conversion; a number, where no range is
given, rounded up or down in its own leaf; and a refusal for anything
else, a range that is no index among them. -/
def caseOf (ds : Decls) (up : Bool) (s : Val) (start len : Option Val) : Made :=
  match (normaliseD ds s).unride, rangeArg? ds 0 start, rangeArg? ds (-1) len with
  | .lit (.str t), some a, some n =>
    .made (.lit (.str (caseRun (if up then host.upper else host.lower) t a n)))
  | .lit (.num x), _, _ =>
    if start.isNone && len.isNone then ((x.round up).map fun y => .made (.lit (.num y))).getD .refused
    else .refused
  | _, _, _ => .refused

/-- A string in normal form, its riders read through. -/
def Val.string? (v : Val) : Option String :=
  match v.unride with
  | .lit (.str s) => some s
  | _ => none

/-- A pair added to pairs whose keys are distinct: met with the value
its key already has, as a map's repeated key is, or added at the end. -/
def mergeKey (acc : List (String × Val)) (m : String × Val) : List (String × Val) :=
  if acc.any (fun a => a.1 == m.1) then acc.map fun a => if a.1 = m.1 then (a.1, .meet a.2 m.2) else a
  else acc ++ [m]

/-- Pairs with their keys made distinct, in the order each key first
comes, the values a key has met. -/
def mergeKeys (acc : List (String × Val)) : List (String × Val) → List (String × Val)
  | [] => acc
  | m :: ms => mergeKeys (mergeKey acc m) ms

/-- The members `pack` reads, each under the key its instance takes, in a
bag's normal form, the riders around it read through: a map's members
under their keys, in key order, skipped as `Val.members` skips them,
and a list's elements, each under the string it is, riders read
through; none where a list holds anything but a string, or the value is
no bag. -/
def Val.keyedMembers (ds : Decls) (lifted : Bool := false) : Val → Option (List (String × Val))
  | .ride k v _ => v.keyedMembers ds (lifted || decide (k = .type) || decide (k = .hide))
  | .list items _ _ => items.mapM fun (i : Val) => i.string?.map fun s => (s, i)
  | .map fs _ _ => some ((fs.mergeSort fun a b => decide (a.1 ≤ b.1)).filterMap fun m =>
      if (!lifted && m.2.2.marked) || m.2.2.isAbsent || (m.2.1 && (genD ds m.2.2).all Data.emptyBag) then none
      else some (m.1, m.2.2))
  | _ => none

/-- A character set's code points with its ranges expanded, `a-z` every
code point from `a` to `z`, the surrogates' among them where the range
crosses them, and a `-` with no character on one side standing for
itself; none where a range descends. -/
def expandSet : List Char → Option (List ℕ)
  | c :: '-' :: d :: rest =>
    if d.toNat < c.toNat then none
    else (expandSet rest).map fun r => (List.range (d.toNat - c.toNat + 1)).map (c.toNat + ·) ++ r
  | c :: rest => (expandSet rest).map (c.toNat :: ·)
  | [] => some []

/-- The character a code point is, U+FFFD for a surrogate, which is none. -/
def scalar (n : ℕ) : Char := if n.isValidChar then Char.ofNat n else Char.ofNat 0xFFFD

/-- What `translate` writes for a code point: where `fr` names it, the
`to` code point at the position of its last naming, `to`'s last where
`to` is shorter, and nothing where `to` is empty; itself otherwise. -/
def translateChar (fr to : List ℕ) (c : Char) : List Char :=
  match fr.zipIdx.reverse.find? (·.1 == c.toNat) with
  | none => [c]
  | some (_, i) => match to.getLast? with
    | none => []
    | some last => [scalar (to.getD i last)]

/-- What `translate` makes of its source, its `from` set and its `to`
set, each a string in normal form, its riders read through, `to` empty
where it is not given: the source with each code point written as
`translateChar` writes it; a refusal where an argument is no string or
a set's range descends. -/
def translateOf (ds : Decls) (s fr : Val) (to : Option Val) : Made :=
  match (normaliseD ds s).string?, ((normaliseD ds fr).string?).bind (fun t => expandSet t.toList),
      (to.map fun t => ((normaliseD ds t).string?).bind (fun t => expandSet t.toList)).getD (some []) with
  | some src, some f, some t => .made (.lit (.str (String.mk (src.toList.flatMap (translateChar f t)))))
  | _, _, _ => .refused

/-- What `esc` (`enc`) or `usc` makes of its text and its variant, each a
string in normal form, its riders read through, the variant C and JSON
in double quotes where none is given: the text written in the
convention, or read back out of it (`Aontu/Text.lean`); a refusal where
an argument is no string, the variant names no convention, or `usc`'s
text has no original. -/
def escOf (ds : Decls) (enc : Bool) (s : Val) (v : Option Val) : Made :=
  match (normaliseD ds s).string?,
      (v.map fun v => ((normaliseD ds v).string?).bind Escape.ofName?).getD (some .dq) with
  | some t, some e =>
    if enc then .made (.lit (.str (String.mk (e.esc t.toList))))
    else ((e.usc t.toList).map fun cs => .made (.lit (.str (String.mk cs)))).getD .refused
  | _, _ => .refused

/-- The fields `split` cuts a string into at a literal separator, the
empty ones kept: at each occurrence from the left, the occurrences never
overlapping, or between every two code points where the separator is
`""`. -/
def splitText (s sep : String) : List String :=
  if sep = "" then s.toList.map Char.toString else s.splitOn sep

/-- Every match the host finds of a pattern in a text, as a scan reads
them. -/
def Host.matches (h : Host) (p t : String) : List Match :=
  scanMatches (h.find p t) t.length (t.length + 1) 0 none

/-- The fields a pattern's matches cut a text into; a pattern other than
`""` cuts the empty text into one empty field, before it looks for a
match. -/
def Host.cut (h : Host) (p t : String) : List String :=
  if p ≠ "" ∧ t = "" then [""] else (cutFields t.toList 0 0 (h.matches p t)).map String.mk

/-- What `split` makes of its text and its separator, each in normal
form, its riders read through: the list of the fields a string cuts the
text into, literally, or a pattern in the subset cuts it into at its
matches; a refusal where the text is no string, the separator neither
a string nor a pattern, or the pattern outside the subset. -/
def splitOf (ds : Decls) (s sep : Val) : Made :=
  match (normaliseD ds s).string?, (normaliseD ds sep).unride with
  | some t, .lit (.str p) => .made (.list ((splitText t p).map fun f => .lit (.str f)) none false)
  | some t, .re p =>
    if host.portable p then .made (.list ((host.cut p t).map fun f => .lit (.str f)) none false)
    else .refused
  | _, _ => .refused

/-- What `rep` makes of its text, its pattern and its replacement, each
a string in normal form, its riders read through: the text with each
match of a pattern in the subset replaced by what the replacement
writes for it; a refusal where an argument is no string, the pattern
lies outside the subset, or the replacement names something the
pattern's groups lack, read before the text is scanned, so that a text
with no match is refused alike. -/
def repOf (ds : Decls) (s p r : Val) : Made :=
  match (normaliseD ds s).string?, (normaliseD ds p).string?, (normaliseD ds r).string? with
  | some t, some q, some u =>
    if host.portable q && subReads (host.groups q) u.toList then
      ((replaceMatches t.toList u.toList 0 (host.matches q t)).map fun cs =>
        .made (.lit (.str (String.mk cs)))).getD .refused
    else .refused
  | _, _, _ => .refused

/-- The acronyms a list names, each a string in normal form, its riders
read through, and none of them `""`; none where the value is no list
or a member no such string. -/
def acronymsOf? (ds : Decls) (v : Val) : Option (List (List Char)) :=
  match (normaliseD ds v).unride with
  | .list items _ _ => items.mapM fun i => i.string?.bind fun s => if s = "" then none else some s.toList
  | _ => none

/-- What `nom` reads after the name: a style, an acronym list, or a
style and then an acronym list; none where an argument is neither, a
style names no spelling, or an acronym list has a third argument after
it. -/
def nomArgs? (ds : Decls) : Option Val → Option Val → Option (Option NameStyle × List (List Char))
  | none, none => some (none, [])
  | none, some _ => none
  | some a, b =>
    match (normaliseD ds a).unride, b with
    | .list _ _ _, none => (acronymsOf? ds a).map fun acr => (none, acr)
    | .list _ _ _, some _ => none
    | _, none => ((normaliseD ds a).string?.bind NameStyle.ofName?).map fun st => (some st, [])
    | _, some b => ((normaliseD ds a).string?.bind NameStyle.ofName?).bind fun st =>
        (acronymsOf? ds b).map fun acr => (some st, acr)

/-- The member of `nom`'s map for one spelling: its name, and the name
in it. -/
def nomField (acr : List (List Char)) (nm : String) (st : NameStyle) : Option (String × Bool × Val) :=
  (nomName acr st nm.toList).map fun cs => (st.name, false, .lit (.str (String.mk cs)))

/-- What `nom` makes of its name and the rest of its arguments: the
name in the spelling a style names, or, where none is named, the sealed
map of every spelling; a refusal where the name is no string with a
word in it, a style names no spelling, or an acronym list is no list of
strings. -/
def nomOf (ds : Decls) (n : Val) (a b : Option Val) : Made :=
  match (normaliseD ds n).string?, nomArgs? ds a b with
  | some nm, some (some st, acr) =>
    match nomName acr st nm.toList with
    | some cs => .made (.lit (.str (String.mk cs)))
    | none => .refused
  | some nm, some (none, acr) =>
    match NameStyle.all.mapM (nomField acr nm) with
    | some fs => .made (.map fs none true)
    | none => .refused
  | _, _ => .refused

/-! ## The component tree -/

/-- The name a component's node carries. -/
def Cmp.node : Cmp → String
  | .project => "Project" | .folder => "Folder" | .file => "File" | .content => "Content"
  | .line => "Line" | .fragment => "Fragment" | .slot => "Slot" | .inject => "Inject"
  | .copyfiles => "CopyFiles" | .listitems => "ListItems"

/-- Every component. -/
def Cmp.all : List Cmp :=
  [.project, .folder, .file, .content, .line, .fragment, .slot, .inject, .copyfiles, .listitems]

/-- The prop a component's spec fills where the spec is a string;
`listitems` has none. -/
def Cmp.text? : Cmp → Option String
  | .project => some "folder"
  | .folder | .file | .slot | .inject => some "name"
  | .content | .line => some "src"
  | .fragment | .copyfiles => some "from"
  | .listitems => none

/-- Whether that prop must be written: all but `project`'s. -/
def Cmp.required : Cmp → Bool
  | .project => false
  | _ => true

/-- Whether that prop is a span of text, where `""` is a value. -/
def Cmp.span : Cmp → Bool
  | .content | .line => true
  | _ => false

/-- The prop that must hold a list: `listitems`'s `item`. -/
def Cmp.bag? : Cmp → Option String
  | .listitems => some "item"
  | _ => none

/-- The components a component holds as children; none for a leaf. -/
def Cmp.kids : Cmp → List Cmp
  | .project => [.project, .folder, .file, .copyfiles]
  | .folder => [.folder, .file, .copyfiles]
  | .file => [.content, .line, .fragment, .inject, .listitems, .copyfiles]
  | .content | .line | .copyfiles => []
  | .fragment => [.slot, .content, .line, .listitems]
  | .slot => [.content, .line, .fragment, .listitems]
  | .inject => [.content, .line, .listitems]
  | .listitems => [.content, .line, .fragment]

/-- The props a component admits. -/
def Cmp.props : Cmp → List String
  | .project => ["name", "folder"]
  | .folder | .slot => ["name"]
  | .file => ["name", "exclude", "mode"]
  | .content | .line => ["arg", "src", "name", "indent", "extra", "replace", "raw"]
  | .fragment => ["from", "indent", "replace", "eject"]
  | .inject => ["name", "markers", "exclude"]
  | .copyfiles => ["from", "to", "replace", "exclude"]
  | .listitems => ["item", "line", "indent"]

/-- Whether a component's call takes so many arguments: a spec, which
`project` alone may leave out, and children, which a leaf takes none
of. -/
def Cmp.takes (c : Cmp) (n : ℕ) : Bool :=
  (!c.required || 1 ≤ n) && n ≤ (if c.kids.isEmpty then 1 else 2)

/-- Whether a function takes so many arguments, as both ports' shared
signatures give each its count: `neq` one or more, a source's load its
path and the names a destructure takes, a component's call as
`Cmp.takes` reads it, and every other a range. -/
def Fn.takes : Fn → ℕ → Bool
  | .add, n | .sub, n | .mul, n | .div, n | .mod, n | .rem, n | .plus, n | .pick, n
  | .split, n | .each, n | .pack, n | .emit, n => n == 2
  | .neg, n | .sum, n | .least, n | .greatest, n | .super, n | .pref, n | .move, n
  | .abnf, n | .maybe, n | .copy, n => n == 1
  | .join, n | .esc, n | .usc, n | .parse, n => 1 ≤ n && n ≤ 2
  | .sort, n | .upper, n | .lower, n | .nom, n => 1 ≤ n && n ≤ 3
  | .translate, n => 2 ≤ n && n ≤ 3
  | .rep, n => n == 3
  | .refer, n | .rel, n | .path, n => n ≤ 1
  | .cmp c, n => c.takes n
  | .load, n | .bnd .neq, n => 1 ≤ n
  | .bnd _, n => n == 1

/-- A node of the component tree: the sealed map of its component's
name, its props and its children. -/
def cmpNode (c : Cmp) (props : Val) (kids : List Val) : Val :=
  .map [("cmp", false, .lit (.str c.node)), ("props", false, props),
    ("children", false, .list kids none false)] none true

/-- The node a bare string child stands for: a line of that text. -/
def lineNode (s : String) : Val := cmpNode .line (.map [("src", false, .lit (.str s))] none false) []

/-- The component a node is: a map whose `cmp` is a string naming one,
its riders read through. -/
def Val.cmp? (v : Val) : Option Cmp :=
  match v.unride with
  | .map fs _ _ => (fs.find? (·.1 == "cmp")).bind fun f =>
      f.2.2.string?.bind fun s => Cmp.all.find? (·.node == s)
  | _ => none

/-- Whether a component admits its props: every key one it admits; the
prop a string fills, where it is written, a string, and `""` only
where it is a span, and written where it is required; and the bag a
list. -/
def cmpPropsOk (c : Cmp) (fs : List (String × Bool × Val)) : Bool :=
  fs.all (fun f => c.props.contains f.1) &&
  (match c.text? with
    | none => true
    | some k => match fs.find? (·.1 == k) with
      | none => !c.required
      | some f => match f.2.2.string? with
        | some t => t != "" || c.span
        | none => false) &&
  (match c.bag? with
    | none => true
    | some k => match fs.find? (·.1 == k) with
      | some f => match f.2.2.unride with
        | .list _ _ _ => true
        | _ => false
      | none => false)

/-- The props a component's spec writes, in normal form with its riders
kept, which ride into the node as a rider rides any value: none
written, the empty map; a string, the map of the prop it fills, which
holds it; a map, itself; nothing for anything else. -/
def cmpProps? (ds : Decls) (c : Cmp) : Option Val → Option Val
  | none => some (.map [] none false)
  | some s =>
    match (normaliseD ds s).string?, (normaliseD ds s).unride with
    | some _, _ => c.text?.map fun k => .map [(k, false, normaliseD ds s)] none false
    | none, .map _ _ _ => some (normaliseD ds s)
    | none, _ => none

/-- The children a component holds, each nested list spliced into its
place: a string a line, where the component holds lines, and a node of
a component it holds; nothing where a child is anything else. The fuel
bounds the nesting. -/
def cmpKids (c : Cmp) : ℕ → List Val → Option (List Val)
  | 0, _ => none
  | n + 1, ks => (ks.mapM fun (k : Val) => match k.unride with
      | .list items _ _ => cmpKids c n items
      | .lit (.str s) => if c.kids.contains .line then some [lineNode s] else none
      | _ => if (k.cmp?.map c.kids.contains).getD false then some [k] else none).map List.flatten

/-- The children a call writes: none written, no children; a list, in
normal form and its riders read through, those it holds; nothing for
anything else. -/
def cmpChildren (ds : Decls) (c : Cmp) : Option Val → Option (List Val)
  | none => some []
  | some k => match (normaliseD ds k).unride with
    | .list items _ _ => cmpKids c (normaliseD ds k).size items
    | _ => none

/-- What a component's call makes of its spec and its children: its
node, where the component admits its props, read through their riders,
and holds its children; a refusal otherwise. The node holds its props and children open in both
ports, against a `close()` from above, which the definition, holding
no `open()`, leaves unsaid. -/
def cmpOf (ds : Decls) (c : Cmp) (spec kids : Option Val) : Made :=
  match cmpProps? ds c spec, cmpChildren ds c kids with
  | some p, some xs =>
    match p.unride with
    | .map fs _ _ => if cmpPropsOk c fs then .made (cmpNode c p xs) else .refused
    | _ => .refused
  | _, _ => .refused

/-- The number a call computes from its arguments: a fold from the
numbers its one bag's members are, and any other function from the
numbers its arguments are, each read in its normal form. -/
def callValue (ds : Decls) (f : Fn) (args : List Val) : Option Number :=
  if f.folds then
    match args with
    | [b] => ((normaliseD ds b).members ds).bind fun ms =>
        (ms.mapM fun m => (normaliseD ds m).number?).bind (Number.fold f)
    | _ => none
  else (args.mapM fun a => (normaliseD ds a).number?).bind (Number.arith f)

/-- What `path` makes of a string: the address its text spells, text with
no start read from one dot (`Addr.ofText?`), and refused where the text
spells none; of a path value, the value itself; refused for any other
scalar and for a container; and waiting for anything else, a kind, a
disjunction or a preference among them, its riders read through, since
only a string's text converts. -/
def pathOf (ds : Decls) (s : Val) : Made :=
  match (normaliseD ds s).unride with
  | .lit (.str t) =>
    match Addr.ofText? t with
    | some a => .made (.addr a)
    | none => .refused
  | .addr a => .made (.addr a)
  | .lit _ | .map _ _ _ | .list _ _ _ => .refused
  | _ => .waits

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

/-- Whether a bound's end is a number. -/
def Bound.isNum : Bound → Bool
  | .num _ => true
  | .str _ => false

/-- The end of a bound a term in normal form names: a number or a
string. -/
def Val.boundEnd? : Val → Option Bound
  | .lit (.num n) => some (.num n)
  | .lit (.str s) => some (.str s)
  | _ => none

/-- Whether a term in normal form can name no bound's end at all: a
boolean, `null`, a map or a list, a kind or `any`, a bound, a pattern,
a meet, or an atom that admits nothing. -/
def Val.noEnd : Val → Bool
  | .lit (.bool _) | .lit .null | .map _ _ _ | .list _ _ _ => true
  | .integer | .float | .biginteger | .bigdecimal | .number | .string | .anyString | .boolean
  | .mapKind | .listKind | .pathKind | .any => true
  | .min _ | .max _ | .above _ | .beneath _ | .neq _ | .mulof _ | .len _ | .unique _ => true
  | .re _ | .format _ | .grammar _ | .meet _ _ | .nothing => true
  | _ => false

/-- Whether a term in normal form is a choice still to make: a
disjunction or a preference. -/
def Val.isChoice : Val → Bool
  | .or _ | .pref _ _ => true
  | _ => false

/-- What a bound written over terms makes of them: the bound itself,
`min($.lo)` being `min(2)` where `lo` is `2`, once each argument's normal
form, its riders read through, is a number or a string, as both ports
settle such a bound; the atom that admits nothing where an argument is
outside the bound's domain, a boolean, `null`, a container, a kind, a
bound, a pattern or a meet, where `neq` takes both numbers and strings
and where `mulof` takes a string, however the argument is written
(decision 28 of the design note's §7); refused where an argument is a
choice still to make, which both ports refuse as an argument whatever
the bound meets (#413), and where a bound takes another count of
arguments than its own; waiting for anything else. A `neq` over a sole
list that isn't empty reads its elements as its arguments, as both
ports read `neq([1, 3])` as `neq(1, 3)`, a choice among them refused. -/
def bndOf (ds : Decls) (b : Bnd) (args : List Val) : Made :=
  let ns := match b, args.map fun a => (normaliseD ds a).unride with
    | .neq, [.list (x :: xs) _ _] => (x :: xs).map fun e => (normaliseD ds e).unride
    | _, ns => ns
  if ns.any Val.isChoice then .refused else
  if ns.any Val.noEnd then .made .nothing else
  match ns.mapM Val.boundEnd?, b with
  | none, _ => .waits
  | some [e], .min => .made (.min e)
  | some [e], .max => .made (.max e)
  | some [e], .above => .made (.above e)
  | some [e], .below => .made (.beneath e)
  | some [.num d], .mulof => .made (.mulof d)
  | some [.str _], .mulof => .made .nothing
  | some [], .neq => .refused
  | some es, .neq =>
    if es.all Bound.isNum || es.all fun e => !e.isNum then .made (.neq es) else .made .nothing
  | some _, _ => .refused

/-- Whether a term is a scalar literal or an address, the leaves `pref`
makes preferences of. -/
def Val.prefLeaf : Val → Bool
  | .lit _ | .addr _ => true
  | _ => false

/-- A preference's rank and the value it prefers. -/
def Val.prefOf? : Val → Option (ℕ × Val)
  | .pref r x => some (r, x)
  | _ => none

mutual
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
  termination_by structural v => v

def preferFields : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.prefer) :: preferFields fs
  termination_by structural fs => fs

def preferItems : List Val → List Val
  | [] => []
  | v :: vs => v.prefer :: preferItems vs
  termination_by structural vs => vs

def preferArms : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: arms =>
    (if r == 0 && !a.unride.prefLeaf then (0, a.prefer) else (r + 1, a)) :: preferArms arms
  termination_by structural arms => arms
end

mutual
/-- A term with each map and list in it unsealed, at every depth
through members, elements, arms, preferences, meets and riders: what
`copy` makes of its argument, its marks cleared too, as a copy is open
whatever it copies, a literal as a reference (decision 27 of the design
note's §7). -/
def Val.unseal : Val → Val
  | .map fs spread _ => .map (unsealFields fs) spread false
  | .list items spread _ => .list (unsealItems items) spread false
  | .or arms => .or (unsealArms arms)
  | .pref r x => .pref r x.unseal
  | .meet a b => .meet a.unseal b.unseal
  | .ride k v r => .ride k v.unseal r
  | v => v
  termination_by structural v => v

def unsealFields : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.unseal) :: unsealFields fs
  termination_by structural fs => fs

def unsealItems : List Val → List Val
  | [] => []
  | v :: vs => v.unseal :: unsealItems vs
  termination_by structural vs => vs

def unsealArms : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: arms => (r, a.unseal) :: unsealArms arms
  termination_by structural arms => arms
end

/-- The name the relation kind is declared under, which no document
can write, since a name a document writes holds no parenthesis. -/
def relName : String := "rel()"

/-- The relation kind: an address, or a list or a map whose every
element or member is one in turn, so that a relation's value is an
address, or lists and maps of them nested as deep as they go, with
an address at each leaf. -/
def relKind : Val :=
  .or [(0, .pathKind), (0, .list [] (some (.alias relName)) false),
    (0, .map [] (some (.alias relName)) false)]

/-- What a call that can wait is as a term: the term it makes, `nil`
where it refuses its arguments, and itself, its arguments in normal
form, where it waits. -/
def Made.term (ds : Decls) (f : Fn) (args : List Val) : Made → Val
  | .made v => v
  | .refused => .nil
  | .waits => .call f (args.map (normaliseD ds))

/-- The term a call is, its arguments resolved: a `+` what `plusOf` makes
of its operands' normal forms, each read through its riders and a lone
preference first, as `*1 + 1` is `2`; a call on a bag or on text what
its function's own reading makes, `joinOf`, `pickOf`, `sortOf`,
`caseOf`, `translateOf`, `escOf`, `splitOf`, `repOf` and `nomOf`; a
component's call, with the arguments it takes, the node `cmpOf` makes; a `super` its
argument's parent type, `Val.super` read before the normal form, so
that a preference reads as its default, as `super(*1)` is `integer`;
a `pref` what `Val.prefer` makes of its argument read before the normal
form, as `super` reads it, so that a preference stays one, and a `move`
the same, its source hidden where the document is read (`Decls.withMoves`);
a `copy` its argument's normal form with its marks cleared and every
map and list in it unsealed (`Val.unmark`, `Val.unseal`);
a `refer` the path kind, the link's own value, and a `rel` the relation
kind, `relName`, its value's links, their template met into each
target where the document is read (`Decls.withRefers`); a bound
written over terms the bound `bndOf` makes of them; any other call the
number `callValue` computes, where it computes one, and itself
otherwise, which no reading makes. -/
def callTerm (ds : Decls) (f : Fn) (args : List Val) : Val :=
  match f, args with
  | .plus, [a, b] => (plusOf (normaliseD ds a.operand) (normaliseD ds b.operand)).term ds f args
  | .join, [b] => (joinOf ds b none).term ds f args
  | .join, [b, s] => (joinOf ds b (some s)).term ds f args
  | .pick, [b, k] => (pickOf ds b k).term ds f args
  | .sort, [b] => (sortOf ds b none none).term ds f args
  | .sort, [b, p] => (sortOf ds b (some p) none).term ds f args
  | .sort, [b, p, d] => (sortOf ds b (some p) (some d)).term ds f args
  | .upper, [s] => (caseOf ds true s none none).term ds f args
  | .upper, [s, a] => (caseOf ds true s (some a) none).term ds f args
  | .upper, [s, a, n] => (caseOf ds true s (some a) (some n)).term ds f args
  | .lower, [s] => (caseOf ds false s none none).term ds f args
  | .lower, [s, a] => (caseOf ds false s (some a) none).term ds f args
  | .lower, [s, a, n] => (caseOf ds false s (some a) (some n)).term ds f args
  | .translate, [s, fr] => (translateOf ds s fr none).term ds f args
  | .translate, [s, fr, t] => (translateOf ds s fr (some t)).term ds f args
  | .esc, [s] => (escOf ds true s none).term ds f args
  | .esc, [s, v] => (escOf ds true s (some v)).term ds f args
  | .usc, [s] => (escOf ds false s none).term ds f args
  | .usc, [s, v] => (escOf ds false s (some v)).term ds f args
  | .super, [x] => x.super
  | .pref, [x] => x.prefer
  | .move, [x] => x.prefer
  | .copy, [x] => (normaliseD ds x).unmark.unseal
  | .refer, [] => .pathKind
  | .refer, [_] => .pathKind
  | .rel, [] => .alias relName
  | .rel, [_] => .alias relName
  | .split, [s, sep] => (splitOf ds s sep).term ds f args
  | .rep, [s, p, r] => (repOf ds s p r).term ds f args
  | .nom, [n] => (nomOf ds n none none).term ds f args
  | .nom, [n, a] => (nomOf ds n (some a) none).term ds f args
  | .nom, [n, a, b] => (nomOf ds n (some a) (some b)).term ds f args
  | .path, [s] => (pathOf ds s).term ds f args
  | .abnf, [g] => (abnfOf ds g).term ds f args
  | .parse, [g] => (parseOf ds g none).term ds f args
  | .parse, [g, v] => (parseOf ds g (some v)).term ds f args
  | .cmp c, args =>
    if c.takes args.length then (cmpOf ds c args.head? (args.drop 1).head?).term ds f args
    else .call f args
  | .bnd b, args => (bndOf ds b args).term ds f args
  | _, _ =>
    match callValue ds f args with
    | some n => .lit (.num n)
    | none => .call f args

mutual
/-- Whether a term holds a call, at any depth: a `+` or a `join` that
waits, or a call no reading made. -/
def Val.holdsCall : Val → Bool
  | .call _ _ => true
  | .ride _ v _ => v.holdsCall
  | .len c => c.holdsCall
  | .map fs spread _ => callFields fs || callSpread spread
  | .list items spread _ => callItems items || callSpread spread
  | .or arms => callArms arms
  | .pref _ x => x.holdsCall
  | .meet a b => a.holdsCall || b.holdsCall
  | .nof n cs => n.holdsCall || callItems cs
  | .must c _ => c.holdsCall
  | .when c t e => c.holdsCall || t.holdsCall || callSpread e
  | .contains c n => c.holdsCall || n.holdsCall
  | .rest t cs => t.holdsCall || callCovers cs
  | .select s arms d => s.holdsCall || callPairs arms || callSpread d
  | .filter s c => s.holdsCall || c.holdsCall
  | _ => false

def callFields : List (String × Bool × Val) → Bool
  | [] => false
  | (_, _, v) :: fs => v.holdsCall || callFields fs

def callItems : List Val → Bool
  | [] => false
  | v :: vs => v.holdsCall || callItems vs

def callSpread : Option Val → Bool
  | none => false
  | some s => s.holdsCall

def callArms : List (ℕ × Val) → Bool
  | [] => false
  | (_, a) :: arms => a.holdsCall || callArms arms

def callPairs : List (Val × Val) → Bool
  | [] => false
  | (p, r) :: ps => p.holdsCall || r.holdsCall || callPairs ps

def callCovers : List Cover → Bool
  | [] => false
  | (c, k, m) :: cs => callSpread c || callSpread k || callSpread m || callCovers cs
end

mutual
/-- Whether a term holds a `key(n)` no reading has placed, at any depth,
a call's arguments among them: a term whose value waits on the position
it lands at. -/
def Val.holdsKey : Val → Bool
  | .keyUp _ => true
  | .call _ args => keyItems args
  | .ride _ v _ => v.holdsKey
  | .len c => c.holdsKey
  | .map fs spread _ => keyFields fs || keySpread spread
  | .list items spread _ => keyItems items || keySpread spread
  | .or arms => keyArms arms
  | .pref _ x => x.holdsKey
  | .meet a b => a.holdsKey || b.holdsKey
  | .nof n cs => n.holdsKey || keyItems cs
  | .must c _ => c.holdsKey
  | .when c t e => c.holdsKey || t.holdsKey || keySpread e
  | .contains c n => c.holdsKey || n.holdsKey
  | .rest t cs => t.holdsKey || keyCovers cs
  | .select s arms d => s.holdsKey || keyPairs arms || keySpread d
  | .filter s c => s.holdsKey || c.holdsKey
  | _ => false

def keyFields : List (String × Bool × Val) → Bool
  | [] => false
  | (_, _, v) :: fs => v.holdsKey || keyFields fs

def keyItems : List Val → Bool
  | [] => false
  | v :: vs => v.holdsKey || keyItems vs

def keySpread : Option Val → Bool
  | none => false
  | some s => s.holdsKey

def keyArms : List (ℕ × Val) → Bool
  | [] => false
  | (_, a) :: arms => a.holdsKey || keyArms arms

def keyPairs : List (Val × Val) → Bool
  | [] => false
  | (p, r) :: ps => p.holdsKey || r.holdsKey || keyPairs ps

def keyCovers : List Cover → Bool
  | [] => false
  | (c, k, m) :: cs => keySpread c || keySpread k || keySpread m || keyCovers cs
end

mutual
/-- Whether a term waits for the place a use gives it: whether it holds
the hole `_` or a `key(n)` at any depth, or names a declaration `w`
reads as waiting, but in the template of an `each` or a `pack`, which
reads its template for each member, so that the member binds both, or
in an `emit`'s table, read for each node. -/
def Val.waits (w : String → Bool) : Val → Bool
  | .hole | .keyUp _ => true
  | .alias n => w n
  | .call .each args | .call .pack args | .call .emit args => waitsHead w args
  | .call _ args => waitsItems w args
  | .ride _ v _ => v.waits w
  | .len c => c.waits w
  | .map fs spread _ => waitsFields w fs || waitsSpread w spread
  | .list items spread _ => waitsItems w items || waitsSpread w spread
  | .or arms => waitsArms w arms
  | .pref _ x => x.waits w
  | .meet a b => a.waits w || b.waits w
  | .nof n cs => n.waits w || waitsItems w cs
  | .must c _ => c.waits w
  | .when c t e => c.waits w || t.waits w || waitsSpread w e
  | .contains c n => c.waits w || n.waits w
  | .rest t cs => t.waits w || waitsCovers w cs
  | .select s arms d => s.waits w || waitsPairs w arms || waitsSpread w d
  | .filter s c => s.waits w || c.waits w
  | _ => false

def waitsHead (w : String → Bool) : List Val → Bool
  | [] => false
  | v :: _ => v.waits w

def waitsFields (w : String → Bool) : List (String × Bool × Val) → Bool
  | [] => false
  | (_, _, v) :: fs => v.waits w || waitsFields w fs

def waitsItems (w : String → Bool) : List Val → Bool
  | [] => false
  | v :: vs => v.waits w || waitsItems w vs

def waitsSpread (w : String → Bool) : Option Val → Bool
  | none => false
  | some s => s.waits w

def waitsArms (w : String → Bool) : List (ℕ × Val) → Bool
  | [] => false
  | (_, a) :: arms => a.waits w || waitsArms w arms

def waitsPairs (w : String → Bool) : List (Val × Val) → Bool
  | [] => false
  | (p, r) :: ps => p.waits w || r.waits w || waitsPairs w ps

def waitsCovers (w : String → Bool) : List Cover → Bool
  | [] => false
  | (c, k, m) :: cs => waitsSpread w c || waitsSpread w k || waitsSpread w m || waitsCovers w cs
end

/-! ## Absence

`maybe(v)` is `v` where it names something, and absence where all that
is wrong with it is that it doesn't: a reference at the top of `v`, `v`
itself, a side of a meet, an arm of a disjunction or the value under a
rider, names nothing in the document read. Absence admits every value,
generates nothing, and is the unit of the meet, but met with `any` it
stays absence; a map leaves it out of its output at a required key as
at an optional one, a list holds no position for it, and a call that
takes it makes it. -/

mutual
/-- Whether a path not read yet stands at the top of `maybe`'s
argument, as in the root the paths are read from. -/
def Val.pathTop : Val → Bool
  | .path _ => true
  | .meet a b => a.pathTop || b.pathTop
  | .or arms => pathTopArms arms
  | .ride _ v _ => v.pathTop
  | _ => false
  termination_by structural v => v

def pathTopArms : List (ℕ × Val) → Bool
  | [] => false
  | (_, a) :: arms => a.pathTop || pathTopArms arms
  termination_by structural arms => arms
end

mutual
/-- Whether a reference at the top of `maybe`'s argument names nothing. -/
def Val.missingTop (ds : Decls) : Val → Bool
  | .alias n => (ds.bodies n).isEmpty
  | .meet a b => a.missingTop ds || b.missingTop ds
  | .or arms => missingTopArms ds arms
  | .ride _ v _ => v.missingTop ds
  | _ => false
  termination_by structural v => v

def missingTopArms (ds : Decls) : List (ℕ × Val) → Bool
  | [] => false
  | (_, a) :: arms => a.missingTop ds || missingTopArms ds arms
  termination_by structural arms => arms
end

mutual
/-- The top of `maybe`'s argument with each reference that names
nothing read as `w`. -/
def fillTop (ds : Decls) (w : Val) : Val → Val
  | .alias n => if (ds.bodies n).isEmpty then w else .alias n
  | .meet a b => .meet (fillTop ds w a) (fillTop ds w b)
  | .or arms => .or (fillTopArms ds w arms)
  | .ride k v r => .ride k (fillTop ds w v) r
  | v => v
  termination_by structural v => v

def fillTopArms (ds : Decls) (w : Val) : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: arms => (r, fillTop ds w a) :: fillTopArms ds w arms
  termination_by structural arms => arms
end

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

mutual
/-- Whether a term waits on a reference that names nothing yet: a path
not read yet or a name nothing declares, which a later round of the
paths may declare, at its top, through meets, disjunctions and riders,
or as what a call, a selection or a `filter` it is waits on. A call or
a generator handed such a term waits. -/
def Val.pending (ds : Decls) : Val → Bool
  | .path _ => true
  | .alias n => (ds.bodies n).isEmpty
  | .meet a b => a.pending ds || b.pending ds
  | .or arms => pendingArms ds arms
  | .ride _ v _ => v.pending ds
  | .call _ args => pendingItems ds args
  | .select s _ _ => s.pending ds
  | .filter s _ => s.pending ds
  | .hole => true
  | _ => false

def pendingItems (ds : Decls) : List Val → Bool
  | [] => false
  | v :: vs => v.pending ds || pendingItems ds vs

def pendingArms (ds : Decls) : List (ℕ × Val) → Bool
  | [] => false
  | (_, a) :: arms => a.pending ds || pendingArms ds arms
end

/-- The term a reference into an `emit`'s node names, `.p` in a body:
the node's field at each key, its element at each position, the field
a map holds under the position's digits, the riders around each read
through, and nothing for any other step, as both ports read a chain of
names and positions as a field of the node. -/
def Val.fieldAt : Val → List Seg → Option Val
  | v, [] => some v
  | v, .key k :: p =>
    match v.unride with
    | .map fs _ _ =>
      match fs.find? (fun f => f.1 == k) with
      | some f => f.2.2.fieldAt p
      | none => none
    | _ => none
  | v, .idx i :: p =>
    match v.unride with
    | .list items _ _ =>
      match items[i]? with
      | some x => x.fieldAt p
      | none => none
    | .map fs _ _ =>
      match fs.find? (fun f => f.1 == toString i) with
      | some f => f.2.2.fieldAt p
      | none => none
    | _ => none
  | _, _ :: _ => none
termination_by structural _ p => p

/-- A path read for the node `b` a body of `emit` is read for: a
reference into the node, `Seg.node` and the steps after it, is the
node's field there (`Val.fieldAt`), and stays as written where the node
has none or no node is being read, as does any other path. -/
def nodeRef (b : Option Val) : List Seg → Val
  | .node :: p =>
    match b with
    | some m => (m.fieldAt p).getD (.path (.node :: p))
    | none => .path (.node :: p)
  | p => .path p

/-- The meet of the values a map's fields named `k` hold, as a map that
writes a key twice meets them; none where no field is so named. -/
def fieldsMeet (fs : List (String × Bool × Val)) (k : String) : Option Val :=
  match fs.filter (·.1 == k) with
  | [] => none
  | f :: rest => some (rest.foldl (fun acc g => .meet acc g.2.2) f.2.2)

/-- An `emit` template's `match` and `body`, each the meet of the
template's members so named (`fieldsMeet`), so that two `match` fields
meet and two `body` fields make no list; none for a template that lacks
either, or that is no map. -/
def emitRule : Val → Option (Val × Val)
  | .map fs _ _ =>
    match fieldsMeet fs "match", fieldsMeet fs "body" with
    | some m, some b => some (m, b)
    | _, _ => none
  | _ => none

/-- Whether a template is one both ports take before they read a node: a
map whose `match` and `body` are written, the body a list. -/
def emitRuleOk (r : Val) : Bool :=
  match emitRule r with
  | some (_, .list _ _ _) => true
  | _ => false

/-- Whether a template as written is one both ports take: a map's
`match` and `body` written and the body written as a list, not a path
or a call that makes one. Any other template is read once resolved. -/
def emitRawOk : Val → Bool
  | .map fs spread closed => emitRuleOk (.map fs spread closed)
  | _ => true

/-- The templates an `emit`'s table holds: a list's elements, or the
table itself, since a table of one template may be the template. -/
def emitTable : Val → List Val
  | .list items _ _ => items
  | t => [t]

/-- The pieces an element of a body makes, a list's own pieces spliced
in its place to `n` levels and any other element itself, so that
`e.size` levels splice `e` whole. The element is read in normal form,
a rider around it read through, so a meet that makes a list splices
too. -/
def emitSpliceF (ds : Decls) : ℕ → Val → List Val
  | 0, e => [e]
  | n + 1, e =>
    match normaliseD ds e with
    | .list xs _ _ => xs.flatMap (emitSpliceF ds n)
    | .ride _ (.list xs _ _) _ => xs.flatMap (emitSpliceF ds n)
    | _ => [e]

/-- The pieces a body makes: its elements, each list among them spliced
in its place at any depth (`emitSpliceF`). None for a body that is no
list, for one that still holds a reference into the node, one the node
doesn't answer, and for one that holds a `key(n)`, which the ports read
at different positions (#524). -/
def emitBody (ds : Decls) : Val → Option (List Val)
  | .list items _ _ =>
    if items.any (fun e => e.paths.any fun p => p.head? == some .node) then none
    else if items.any Val.holdsKey then none
    else some (items.flatMap fun e => emitSpliceF ds e.size e)
  | _ => none

mutual
/-- A `match` read as both ports read its holes, which no node binds:
a hole that stands at a position, the `match` itself, a member, an
element or a spread, waits for a value that never comes, so admits
nothing, as `nil`, and one a meet or an arm of a disjunction holds is
the value it is met with, as `any`. -/
def Val.matchRead : Val → Val
  | .hole => .nil
  | .meet a b =>
    .meet (match a with | .hole => .any | a => a.matchRead) (match b with | .hole => .any | b => b.matchRead)
  | .or arms => .or (matchArms arms)
  | .map fs spread closed => .map (matchFields fs) (matchSpread spread) closed
  | .list items spread closed => .list (matchItems items) (matchSpread spread) closed
  | .ride k v r => .ride k v.matchRead r
  | v => v

def matchSpread : Option Val → Option Val
  | none => none
  | some s => some s.matchRead

def matchArms : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, .hole) :: arms => (r, .any) :: matchArms arms
  | (r, a) :: arms => (r, a.matchRead) :: matchArms arms

def matchFields : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.matchRead) :: matchFields fs

def matchItems : List Val → List Val
  | [] => []
  | v :: vs => v.matchRead :: matchItems vs
end

/-- A term in normal form read through a disjunction whose arms are one
arm of rank `0` written alike (`Val.beq`), as both ports keep one arm of
such a disjunction. -/
def Val.one : Val → Val
  | .or ((0, a) :: arms) => if arms.all (fun p => p.1 == 0 && p.2.beq a) then a.one else .or ((0, a) :: arms)
  | v => v

/-- A term in normal form with a container kind dropped beside a
container of its kind, which the kind narrows in nothing, so that
`list & [1]` is `[1]` and `map & {k: 1}` is `{k: 1}`. -/
def Val.kindless : Val → Val
  | .meet .listKind (.list items spread closed) => .list items spread closed
  | .meet (.list items spread closed) .listKind => .list items spread closed
  | .meet .mapKind (.map fs spread closed) => .map fs spread closed
  | .meet (.map fs spread closed) .mapKind => .map fs spread closed
  | v => v

/-- Whether a map's field is one of its members as both ports count them
in a dispatch, as `Val.members` reads them: not one that is marked or
absence, nor an optional one whose value generates nothing or an empty
map or list. -/
def memberField (ds : Decls) (f : String × Bool × Val) : Bool :=
  !(f.2.2.marked || f.2.2.isAbsent || (f.2.1 && (genD ds f.2.2).all Data.emptyBag))

/-- A term's conjuncts: a meet's sides, at any depth, and any other
term itself. -/
def Val.conj : Val → List Val
  | .meet a b => a.conj ++ b.conj
  | v => [v]

/-- Whether two terms meet the same conjuncts, each conjunct of either
written alike one of the other's (`Val.beq`), so that a meet that
repeats a conjunct, `min(1) & min(1)`, is alike the conjunct. -/
def conjAlike (a b : Val) : Bool :=
  a.conj.all (fun x => b.conj.any x.beq) && b.conj.all (fun y => a.conj.any y.beq)

mutual
/-- Whether a node and its meet with a `match` are alike, as both ports
compare them: two maps with the same members (`memberField`), each
alike, two lists with the same elements alike, each read through its
riders, a disjunction of one arm (`Val.one`) and a container kind beside
a container of its kind (`Val.kindless`), and any other pair meeting the
same conjuncts (`conjAlike`). -/
def Val.alike (ds : Decls) : Val → Val → Bool
  | .ride _ v _, b => v.alike ds b
  | .map fs _ _, .map gs _ _ =>
    (fs.filter (memberField ds)).length == (gs.filter (memberField ds)).length && alikeIn ds fs gs
  | .list xs _ _, .list ys _ _ => alikeItems ds xs ys
  | a, b => conjAlike a b

def alikeIn (ds : Decls) : List (String × Bool × Val) → List (String × Bool × Val) → Bool
  | [], _ => true
  | (k, o, v) :: fs, gs =>
    (!memberField ds (k, o, v) ||
      match gs.find? (·.1 == k) with
      | some g => v.alike ds g.2.2.unride.one.kindless
      | none => false) && alikeIn ds fs gs

def alikeItems (ds : Decls) : List Val → List Val → Bool
  | [], [] => true
  | x :: xs, y :: ys => x.alike ds y.unride.one.kindless && alikeItems ds xs ys
  | _, _ => false
end

/-- Whether a term in normal form is a disjunction with no preference
among its arms, the riders around it read through, as both ports
dispatch a node under a rider as the node. -/
def Val.freeChoice : Val → Bool
  | .or arms => arms.all (·.1 == 0)
  | .ride _ v _ => v.freeChoice
  | _ => false

/-- Whether a template's `match` takes the node `m`, as both ports
dispatch: the node met with the `match`, its holes read by
`Val.matchRead`, doesn't die and is alike the node (`Val.alike`), so
that the meet narrows nothing; or, where the node is a disjunction with
no preference among its arms, doesn't die. -/
def emitTakes (ds : Decls) (pat m : Val) : Bool :=
  let met := normaliseD ds (meetD ds pat.matchRead m)
  !met.dead && ((normaliseD ds m).freeChoice ||
    (normaliseD ds m).unride.kindless.alike ds met.unride.one.kindless)

mutual
/-- The references into the node a term holds as written, but those in
a map's or a list's spread, which both ports leave unbound, and those in
a nested `emit`'s table, a generator's template and a `filter`'s
condition, which read their own nodes and members. -/
def Val.nodePaths : Val → List (List Seg)
  | .path p => if p.head? == some .node then [p] else []
  | .call .emit (s :: _) | .call .each (s :: _) | .call .pack (s :: _) => s.nodePaths
  | .filter s _ => s.nodePaths
  | .call _ args => nodeItems args
  | .len c => c.nodePaths
  | .map fs _ _ => nodeFields fs
  | .list items _ _ => nodeItems items
  | .or arms => nodeArms arms
  | .pref _ x => x.nodePaths
  | .meet a b => a.nodePaths ++ b.nodePaths
  | .nof n cs => n.nodePaths ++ nodeItems cs
  | .must c _ => c.nodePaths
  | .when c t e => c.nodePaths ++ t.nodePaths ++ nodeSpread e
  | .contains c n => c.nodePaths ++ n.nodePaths
  | .rest t cs => t.nodePaths ++ nodeCovers cs
  | .select s arms d => s.nodePaths ++ nodePairs arms ++ nodeSpread d
  | .ride _ v _ => v.nodePaths
  | _ => []

def nodePairs : List (Val × Val) → List (List Seg)
  | [] => []
  | (p, r) :: ps => p.nodePaths ++ r.nodePaths ++ nodePairs ps

def nodeCovers : List Cover → List (List Seg)
  | [] => []
  | (c, k, m) :: cs => nodeSpread c ++ nodeSpread k ++ nodeSpread m ++ nodeCovers cs

def nodeFields : List (String × Bool × Val) → List (List Seg)
  | [] => []
  | (_, _, v) :: fs => v.nodePaths ++ nodeFields fs

def nodeItems : List Val → List (List Seg)
  | [] => []
  | v :: vs => v.nodePaths ++ nodeItems vs

def nodeSpread : Option Val → List (List Seg)
  | none => []
  | some s => s.nodePaths

def nodeArms : List (ℕ × Val) → List (List Seg)
  | [] => []
  | (_, a) :: arms => a.nodePaths ++ nodeArms arms
end

/-- Whether the node `m` answers every reference into it that a
template's body holds as written (`Val.nodePaths`), even in a part the
reading drops, as both ports bind a body before they read it. -/
def emitBound (m t : Val) : Bool :=
  match emitRule t with
  | some r => r.2.nodePaths.all fun q => (m.fieldAt (q.drop 1)).isSome
  | none => true

/-- The pieces an `emit`'s table makes of the node `m`, its `match`es
read from `tB`, the table read for no node, and its bodies from `tM`,
the table read for `m`: what the body of the first template whose
`match` takes the node (`emitTakes`) makes (`emitBody`). None where no
template takes the node, where the body as written in `tW` holds a
reference the node doesn't answer (`emitBound`), or where the body makes
no pieces, each of which both ports refuse. -/
def emitPieces (ds : Decls) (m tW tB tM : Val) : Option (List Val) :=
  match ((if (emitTable tW).length == (emitTable tB).length then emitTable tW else emitTable tB).zip
      ((emitTable tB).zip (emitTable tM))).find? (fun p =>
      match emitRule p.2.1 with
      | some r => emitTakes ds r.1 m
      | none => false) with
  | some p => if emitBound m p.1 then (emitRule p.2.2).bind fun r => emitBody ds r.2 else none
  | none => none

/-- The members `keep` keeps, in order, each tried at the index it takes
among those kept before it, as a list's `filter` places its trial. -/
def keptAt (keep : ℕ → Data → Bool) : ℕ → List Data → List Data
  | _, [] => []
  | i, x :: xs => if keep i x then x :: keptAt keep (i + 1) xs else keptAt keep i xs

/-- Whether an argument both ports read as they build a trial is a
conflict: dead in normal form, though not written as `nil`, which both
read there as a value that admits nothing. -/
def Decls.clashes (ds : Decls) : Val → Bool
  | .nil => false
  | v => (normaliseD ds v).dead

/-- Whether a list's marked element is a conflict, under the riders it
carries, met with the list's spread `s`: both ports read the element
and meet it with the spread before the list drops it (decision 18). -/
def Decls.markClashes (ds : Decls) (s : Option Val) : Val → Bool
  | .ride _ v _ => ds.markClashes s v
  | v => ds.clashes (match s with | some t => .meet v t | none => v)

mutual
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
no position for an element that is absence, nor for one a mark of its
own, `hide()` or `type()`, leaves out, each element after
it read at the index it takes, though a list whose marked element is a
conflict, alone or met with the list's spread, is `nil` where it stands
(`Decls.markClashes`). A call or a generator
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
that a path copies them to be read where it lands, but a `refer` or a
`rel`, whose value no argument decides. A size over a term
outside `len`'s domain (`Val.unsized`) is the atom that admits nothing,
as a bound over one is (`bndOf`), so that both refuse at the meet. A
trial both ports build as they read it is `nil` where an argument they
read then is a conflict (`Decls.clashes`): a size, `must`'s condition
and the count of `nof` and of `contains`; and so is a `filter` whose
source and a selection whose scrutinee are dead, written `nil` or not.
So such a trial is an error where it stands, an arm holding it drops,
and a spread holding it refuses each member it's tried on. -/
def resolveD (ds : Decls) (b : Option Val) (here : Option (List Step)) : Val → Val
  | .select s arms d =>
    let s' := resolveD ds b here s
    let arms' := resolvePairs ds b here arms
    let d' := resolveSpread ds b here d
    match genD ds s' with
    | some x => if callPairs arms' || here.isNone && keyPairs arms' then .select s' arms' d' else selectArm ds x arms' d'
    | none =>
      if (normaliseD ds s').isAbsent then .absent else if (normaliseD ds s').dead then .nil else .select s' arms' d'
  | .filter s c =>
    let s' := resolveD ds b here s
    if here.isNone && c.holdsKey then .filter s' c else
    match genD ds s' with
    | some (.map fs) => (Data.map (fs.filter fun m =>
        checkR ds (resolveD ds (some m.2.term) (stepped here (.seg (.key m.1))) c) m.2)).term
    | some (.list xs) => (Data.list (keptAt (fun i x =>
        checkR ds (resolveD ds (some x.term) (stepped here (.seg (.idx i))) c) x) 0 xs)).term
    | some _ => .nil
    | none =>
      if (normaliseD ds s').isAbsent then .absent else if (normaliseD ds s').dead then .nil
      else .filter s' (resolveD ds none none c)
  | .call f args =>
    match f, args with
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
    | .maybe, [v] => maybeOf ds (resolveD ds b here v)
    | .maybe, args => .call .maybe (resolveItems ds b here args)
    | .emit, [s, t] =>
      if here.isNone && (resolveD ds b here s).holdsKey then .call .emit [resolveD ds b here s, t] else
      if (emitTable t).any (fun r => !emitRawOk r) ||
        (emitTable (resolveD ds none none t)).any (fun r => !emitRuleOk r) then
        .call .emit [resolveD ds b here s, t] else
      match (normaliseD ds (resolveD ds b here s)).members ds with
      | some ms =>
        let pss := ms.map fun m => emitPieces ds m t (resolveD ds none none t) (resolveD ds (some m) none t)
        if pss.all Option.isSome then .list (pss.filterMap id).flatten none false
        else .call .emit [resolveD ds b here s, t]
      | none =>
        if (normaliseD ds (resolveD ds b here s)).isAbsent then .absent
        else .call .emit [resolveD ds b here s, t]
    | f, args =>
      if here.isNone && keyItems (resolveItems ds b here args) && f != .refer && f != .rel then
        .call f (resolveItems ds b here args)
      else if (resolveItems ds b here args).any (fun a => (normaliseD ds a).isAbsent) then .absent
      else if (resolveItems ds b here args).any (·.pending ds) then .call f (resolveItems ds b here args)
      else callTerm ds f (resolveItems ds b here args)
  | .len c =>
    if (normaliseD ds (resolveD ds b here c)).unsized then .nothing
    else if ds.clashes (resolveD ds b here c) then .nil else .len (resolveD ds b here c)
  | .map fs spread closed =>
    .map (resolveFields ds b here fs) (resolveSpread ds none (stepped here .spread) spread) closed
  | .list items spread closed =>
    if (resolveElems ds b here 0 items).any (fun e => (normaliseD ds e).marked &&
        ds.markClashes (resolveSpread ds none (stepped here .spread) spread) e) then .nil else
    .list ((resolveElems ds b here 0 items).filter fun e =>
        !(normaliseD ds e).isAbsent && !(normaliseD ds e).marked)
      (resolveSpread ds none (stepped here .spread) spread) closed
  | .or arms => .or (resolveArms ds b here arms)
  | .pref r x => .pref r (resolveD ds b here x)
  | .meet a c => .meet (resolveD ds b here a) (resolveD ds b here c)
  | .nof n cs =>
    if ds.clashes (resolveD ds b here n) then .nil else .nof (resolveD ds b here n) (resolveItems ds b here cs)
  | .must c m => if ds.clashes (resolveD ds b here c) then .nil else .must (resolveD ds b here c) m
  | .when c t e => .when (resolveD ds b here c) (resolveD ds b here t) (resolveSpread ds b here e)
  | .contains c n =>
    if ds.clashes (resolveD ds b here n) then .nil else .contains (resolveD ds b here c) (resolveD ds b here n)
  | .rest t cs => .rest (resolveD ds b here t) (resolveCovers ds b here cs)
  | .ride k v r => .ride k (resolveD ds b here v) r
  | .keyUp n =>
    match here with
    | some pos => keyUpAt pos n
    | none => .keyUp n
  | .hole => b.getD .hole
  | .path p => nodeRef b p
  | v => v
  termination_by structural v => v

def resolveFields (ds : Decls) (b : Option Val) (here : Option (List Step)) :
    List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, resolveD ds b (stepped here (.seg (.key k))) v) :: resolveFields ds b here fs
  termination_by structural fs => fs

def resolveElems (ds : Decls) (b : Option Val) (here : Option (List Step)) : ℕ → List Val → List Val
  | _, [] => []
  | i, v :: vs =>
    resolveD ds b (stepped here (.seg (.idx i))) v :: resolveElems ds b here
      (if (normaliseD ds (resolveD ds b (stepped here (.seg (.idx i))) v)).isAbsent ||
        (normaliseD ds (resolveD ds b (stepped here (.seg (.idx i))) v)).marked then i else i + 1) vs
  termination_by structural _ vs => vs

def resolveItems (ds : Decls) (b : Option Val) (here : Option (List Step)) : List Val → List Val
  | [] => []
  | v :: vs => resolveD ds b here v :: resolveItems ds b here vs
  termination_by structural vs => vs

def resolveSpread (ds : Decls) (b : Option Val) (here : Option (List Step)) : Option Val → Option Val
  | none => none
  | some s => some (resolveD ds b here s)
  termination_by structural sp => sp

def resolveArms (ds : Decls) (b : Option Val) (here : Option (List Step)) : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: arms => (r, resolveD ds b here a) :: resolveArms ds b here arms
  termination_by structural arms => arms

def resolvePairs (ds : Decls) (b : Option Val) (here : Option (List Step)) : List (Val × Val) → List (Val × Val)
  | [] => []
  | (p, r) :: ps => (resolveD ds b here p, resolveD ds b here r) :: resolvePairs ds b here ps
  termination_by structural ps => ps

def resolveCovers (ds : Decls) (b : Option Val) (here : Option (List Step)) : List Cover → List Cover
  | [] => []
  | (c, k, m) :: cs =>
    (resolveSpread ds b here c, resolveSpread ds b here k, resolveSpread ds b here m) :: resolveCovers ds b here cs
  termination_by structural cs => cs
end

/-! ## A hole its call's peer fills

Decision 21 of the design note's §7: a meet with a hole, or a call that
waits on one, on one side and nothing waiting on the other reads as that
side with the hole bound to the other, in the order the document groups
its meets, before any meet means anything, so `upper(_) & "a"` reads as
`upper("a")` and `&` stays a meet. A container waits on no hole of its
members, but two containers meet member by member, so that a member's
hole is filled from the member it meets, and a generator's template
binds its holes to each member. -/

mutual
/-- Whether a term waits on a hole its peer fills: the hole, or a call
over one through its arguments, a generator's data but not its template,
and through a rider, but never through a container. -/
def Val.fillable : Val → Bool
  | .hole => true
  | .call .each args | .call .pack args | .call .emit args => fillableHead args
  | .call _ args => fillableItems args
  | .ride _ v _ => v.fillable
  | _ => false

def fillableHead : List Val → Bool
  | [] => false
  | d :: _ => d.fillable

def fillableItems : List Val → Bool
  | [] => false
  | v :: vs => v.fillable || fillableItems vs
end

mutual
/-- The term with each hole `fillable` finds bound to `p`. -/
def Val.bindHole : Val → Val → Val
  | .hole, p => p
  | .call .each args, p => .call .each (bindHead args p)
  | .call .pack args, p => .call .pack (bindHead args p)
  | .call .emit args, p => .call .emit (bindHead args p)
  | .call f args, p => .call f (bindItems args p)
  | .ride k v r, p => .ride k (v.bindHole p) r
  | v, _ => v

def bindHead : List Val → Val → List Val
  | [], _ => []
  | d :: ts, p => d.bindHole p :: ts

def bindItems : List Val → Val → List Val
  | [], _ => []
  | v :: vs, p => v.bindHole p :: bindItems vs p
end

/-- The meet of a key's declarations, in the order they're written. -/
def declsAt (k : String) : List (String × Bool × Val) → Option Val
  | [] => none
  | (k', _, x) :: fs =>
    match declsAt k fs with
    | none => if k' == k then some x else none
    | some q => if k' == k then some (.meet x q) else some q

/-- A map's fields with a key's first declaration written `p` and each
later one `any`. -/
def putField (k : String) : Val → List (String × Bool × Val) → List (String × Bool × Val)
  | _, [] => []
  | p, (k', o, x) :: fs => if k' == k then (k', o, p) :: putField k .any fs else (k', o, x) :: putField k p fs

/-- The element at a position among a list's elements that stand: not
one that is marked or absence, which holds no position. -/
def standingAt : List Val → ℕ → Option Val
  | [], _ => none
  | x :: xs, i =>
    if x.marked || x.isAbsent then standingAt xs i
    else match i with
      | 0 => some x
      | i + 1 => standingAt xs i

/-- A list with its element at a position among those that stand written `p`. -/
def setStanding : List Val → ℕ → Val → List Val
  | [], _, _ => []
  | x :: xs, i, p =>
    if x.marked || x.isAbsent then x :: setStanding xs i p
    else match i with
      | 0 => p :: xs
      | i + 1 => x :: setStanding xs i p

/-- The member a term holds under a key, read through meets and riders:
the meet of a map's declarations of it, or the meet of the members a
meet's two sides hold. -/
def Val.memberAt : Val → String → Option Val
  | .map fs _ _, k => declsAt k fs
  | .meet u v, k =>
    match u.memberAt k, v.memberAt k with
    | some p, some q => some (.meet p q)
    | some p, none => some p
    | none, q => q
  | .ride _ v _, k => v.memberAt k
  | _, _ => none

/-- The term with its member under a key written: the first declaration,
or the first side of a meet, that holds the key takes `p`, and each later
one `any`. -/
def Val.putMember : Val → String → Val → Val
  | .map fs sa ca, k, p => .map (putField k p fs) sa ca
  | .meet u v, k, p =>
    match u.memberAt k with
    | some _ => .meet (u.putMember k p) (v.putMember k .any)
    | none => .meet u (v.putMember k p)
  | .ride r v rec, k, p => .ride r (v.putMember k p) rec
  | v, _, _ => v

/-- The element a term holds at a position among those that stand, read
through meets and riders. -/
def Val.elemAt : Val → ℕ → Option Val
  | .list xs _ _, i => standingAt xs i
  | .meet u v, i =>
    match u.elemAt i, v.elemAt i with
    | some p, some q => some (.meet p q)
    | some p, none => some p
    | none, q => q
  | .ride _ v _, i => v.elemAt i
  | _, _ => none

/-- The term with its element at a position written, as `putMember` writes a member. -/
def Val.putElem : Val → ℕ → Val → Val
  | .list xs sa ca, i, p => .list (setStanding xs i p) sa ca
  | .meet u v, i, p =>
    match u.elemAt i with
    | some _ => .meet (u.putElem i p) (v.putElem i .any)
    | none => .meet u (v.putElem i p)
  | .ride r v rec, i, p => .ride r (v.putElem i p) rec
  | v, _, _ => v

/-- Whether a selection's arm reads a key the spread has filled: a key's
literal, read as `any`. -/
def Val.filledArm : Val × Val → Bool
  | (.lit (.str _), .any) => true
  | _ => false

/-- A spread's template that waits on a hole, with the arms that read the
keys it has already filled as `any`: one read under its key whose every
arm is a filled key's and whose default waits, or one that waits. -/
def Val.waitingSpread : Val → Option (List (Val × Val) × Val)
  | .select .key arms (some t) => if t.fillable && arms.all Val.filledArm then some (arms, t) else none
  | t => if t.fillable then some ([], t) else none

/-- The keys a spread's arms read, which it has filled. -/
def filledKeys : List (Val × Val) → List String
  | [] => []
  | (.lit (.str k), _) :: arms => k :: filledKeys arms
  | _ :: arms => filledKeys arms

/-- A spread that waits on a hole, with one more key read as `any`. -/
def spreadWith (arms : List (Val × Val)) (t : Val) (k : String) : Val :=
  .select .key ((.lit (.str k), .any) :: arms) (some t)

/-- A spread's template met with a member: the template with its hole
bound to the member, or, where the member waits too, the two met. -/
def Val.spreadMeet (t p : Val) : Val := if p.fillable then .meet t p else t.bindHole p

/-- Fields met with a spread that waits on a hole, each once: where the
spread hasn't filled a field's key, the field is the template met with
it, and the spread then reads the key as `any`. -/
def spreadFields : List (String × Bool × Val) → Option Val → List (String × Bool × Val) × Option Val
  | [], sp => ([], sp)
  | (k, o, x) :: fs, sp =>
    match sp.bind Val.waitingSpread with
    | some (arms, t) =>
      if (filledKeys arms).contains k then ((k, o, x) :: (spreadFields fs sp).1, (spreadFields fs sp).2)
      else ((k, o, t.spreadMeet x) :: (spreadFields fs (some (spreadWith arms t k))).1,
        (spreadFields fs (some (spreadWith arms t k))).2)
    | none => ((k, o, x) :: fs, sp)

/-- Elements met with a spread that waits on a hole, each once, under
the position it holds among the elements that stand. -/
def spreadItems : ℕ → List Val → Option Val → List Val × Option Val
  | _, [], sp => ([], sp)
  | i, x :: xs, sp =>
    if x.marked || x.isAbsent then (x :: (spreadItems i xs sp).1, (spreadItems i xs sp).2) else
    match sp.bind Val.waitingSpread with
    | some (arms, t) =>
      if (filledKeys arms).contains (toString i) then
        (x :: (spreadItems (i + 1) xs sp).1, (spreadItems (i + 1) xs sp).2)
      else (t.spreadMeet x :: (spreadItems (i + 1) xs (some (spreadWith arms t (toString i)))).1,
        (spreadItems (i + 1) xs (some (spreadWith arms t (toString i)))).2)
    | none => (x :: xs, sp)

/-- The keys a term declares, read through meets and riders. -/
def Val.keysAt : Val → List String
  | .map fs _ _ => fs.map (·.1)
  | .meet u v => u.keysAt ++ v.keysAt
  | .ride _ v _ => v.keysAt
  | _ => []

/-- The positions a term holds, read through meets and riders. -/
def Val.posAt : Val → ℕ
  | .list xs _ _ => (xs.filter fun x => !(x.marked || x.isAbsent)).length
  | .meet u v => Nat.max u.posAt v.posAt
  | .ride _ v _ => v.posAt
  | _ => 0

/-- A spread that waits on a hole met with a peer's member under each key
given that it hasn't filled, once, at the member's first declaration. -/
def spreadOnto : Option Val → List String → Val → Option Val × Val
  | sp, [], b => (sp, b)
  | sp, k :: ks, b =>
    match sp.bind Val.waitingSpread, b.memberAt k with
    | some (arms, t), some p =>
      if (filledKeys arms).contains k then spreadOnto sp ks b
      else spreadOnto (some (spreadWith arms t k)) ks (b.putMember k (t.spreadMeet p))
    | _, _ => spreadOnto sp ks b

/-- The same at each position given. -/
def spreadOntoAt : Option Val → List ℕ → Val → Option Val × Val
  | sp, [], b => (sp, b)
  | sp, i :: is, b =>
    match sp.bind Val.waitingSpread, b.elemAt i with
    | some (arms, t), some p =>
      if (filledKeys arms).contains (toString i) then spreadOntoAt sp is b
      else spreadOntoAt (some (spreadWith arms t (toString i))) is (b.putElem i (t.spreadMeet p))
    | _, _ => spreadOntoAt sp is b

/-- Fields met with each spread of a peer that waits on a hole, read
through its meets and riders. -/
def spreadFrom : List (String × Bool × Val) → Val → List (String × Bool × Val) × Val
  | fs, .map gs sb cb => ((spreadFields fs sb).1, .map gs (spreadFields fs sb).2 cb)
  | fs, .meet u v =>
    ((spreadFrom (spreadFrom fs u).1 v).1, .meet (spreadFrom fs u).2 (spreadFrom (spreadFrom fs u).1 v).2)
  | fs, .ride k v r => ((spreadFrom fs v).1, .ride k (spreadFrom fs v).2 r)
  | fs, b => (fs, b)

/-- The same with elements. -/
def spreadFromAt : List Val → Val → List Val × Val
  | xs, .list ys sb cb => ((spreadItems 0 xs sb).1, .list ys (spreadItems 0 xs sb).2 cb)
  | xs, .meet u v =>
    ((spreadFromAt (spreadFromAt xs u).1 v).1, .meet (spreadFromAt xs u).2 (spreadFromAt (spreadFromAt xs u).1 v).2)
  | xs, .ride k v r => ((spreadFromAt xs v).1, .ride k (spreadFromAt xs v).2 r)
  | xs, b => (xs, b)

/-- A term that waits on no hole met with each arm of a disjunction: an
arm that waits on one with its hole bound to the term, and any other
met with it. -/
def leafArms (a : Val) : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, y) :: ys => (r, if y.fillable then y.bindHole a else .meet a y) :: leafArms a ys

mutual
/-- Two terms met at one position, each with its own fills made: where
one waits on a hole and the other doesn't, the hole bound to the other,
which the call spends, so that it reads as `any`; and a map or a list,
read through its meets and riders, met with the other's members by key
or by position (`Val.memberAt`, `Val.elemAt`), and each spread that
waits on a hole with the other side's members, each side kept whole;
a disjunction met arm by arm, the other side met into each arm; and a
lone preference met as the two arms the meet reads it as, its
preferred arm filled and its parent arm (`Val.super`) met. -/
def Val.fillMeet (a b : Val) : Val × Val :=
  if a.fillable && !b.fillable then (a.bindHole b, .any)
  else if b.fillable && !a.fillable then (.any, b.bindHole a)
  else match a with
    | .map fs sa ca =>
      let r := fillFields fs b
      let s := spreadOnto sa r.2.keysAt r.2
      let u := spreadFrom r.1 s.2
      (.map u.1 s.1 ca, u.2)
    | .list xs sa ca =>
      let r := fillElems 0 xs b
      let s := spreadOntoAt sa (List.range r.2.posAt) r.2
      let u := spreadFromAt r.1 s.2
      (.list u.1 s.1 ca, u.2)
    | .meet x y => (.meet (x.fillMeet b).1 (y.fillMeet (x.fillMeet b).2).1, (y.fillMeet (x.fillMeet b).2).2)
    | .ride k v r => (.ride k (v.fillMeet b).1 r, (v.fillMeet b).2)
    | .pref r x => (.or [(r, .meet (x.fillMeet b).1 (x.fillMeet b).2), (0, .meet x.super b)], .any)
    | .or arms => (.or (fillArms arms b), .any)
    | _ =>
      match b with
      | .or arms => (.or (leafArms a arms), .any)
      | .pref r y => (.or (leafArms a [(r, y), (0, y.super)]), .any)
      | _ => (a, b)
termination_by structural a

def fillFields : List (String × Bool × Val) → Val → List (String × Bool × Val) × Val
  | [], b => ([], b)
  | (k, o, x) :: fs, b =>
    match b.memberAt k with
    | some p =>
      ((k, o, (x.fillMeet p).1) :: (fillFields fs (b.putMember k (x.fillMeet p).2)).1,
        (fillFields fs (b.putMember k (x.fillMeet p).2)).2)
    | none => ((k, o, x) :: (fillFields fs b).1, (fillFields fs b).2)

def fillElems : ℕ → List Val → Val → List Val × Val
  | _, [], b => ([], b)
  | i, x :: xs, b =>
    if x.marked || x.isAbsent then (x :: (fillElems i xs b).1, (fillElems i xs b).2) else
    match b.elemAt i with
    | some p =>
      ((x.fillMeet p).1 :: (fillElems (i + 1) xs (b.putElem i (x.fillMeet p).2)).1,
        (fillElems (i + 1) xs (b.putElem i (x.fillMeet p).2)).2)
    | none => (x :: (fillElems (i + 1) xs b).1, (fillElems (i + 1) xs b).2)

def fillArms : List (ℕ × Val) → Val → List (ℕ × Val)
  | [], _ => []
  | (r, x) :: as, b => (r, .meet (x.fillMeet b).1 (x.fillMeet b).2) :: fillArms as b
termination_by structural as => as
end

/-- Two terms, each with its own fills made, met: where one waits on a
hole and the other doesn't, the waiting one with the hole bound to the
other, and otherwise the two met with each other's members. -/
def Val.meetFilled (a b : Val) : Val :=
  if a.fillable && !b.fillable then a.bindHole b
  else if b.fillable && !a.fillable then b.bindHole a
  else .meet (a.fillMeet b).1 (a.fillMeet b).2

/-- A key's first declaration met with each later one, in the order
they're written, and its flag, optional only where each declaration is. -/
def joinAt (k : String) : Val × Bool → List (String × Bool × Val) → Val × Bool
  | x, [] => x
  | x, (k', o', y) :: fs => joinAt k (if k' == k then (x.1.meetFilled y, x.2 && o') else x) fs

/-- A map's fields with each key declared more than once read as one
declaration at its first, as the engines merge them: its declarations
met in the order they're written, optional only where each is. -/
def joinFields (seen : List String) : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, x) :: fs =>
    if seen.contains k then joinFields seen fs
    else (k, (joinAt k (x, o) fs).2, (joinAt k (x, o) fs).1) :: joinFields (k :: seen) fs

mutual
/-- The term with each meet that waits on a hole on one side and on none
on the other read as that side with the hole bound to the other, the
meets beneath it first, a map's declarations of a key among them,
through every form but where a hole is bound: a generator's template,
an `emit`'s table and a `filter`'s condition. -/
def Val.filled : Val → Val
  | .meet a b => a.filled.meetFilled b.filled
  | .map fs spread closed =>
    .map (spreadFields (joinFields [] (filledFields fs)) (filledSpread spread)).1
      (spreadFields (joinFields [] (filledFields fs)) (filledSpread spread)).2 closed
  | .list items spread closed =>
    .list (spreadItems 0 (filledItems items) (filledSpread spread)).1
      (spreadItems 0 (filledItems items) (filledSpread spread)).2 closed
  | .or arms => .or (filledArms arms)
  | .pref r x => .pref r x.filled
  | .ride k v r => .ride k v.filled r
  | .len c => .len c.filled
  | .nof n cs => .nof n.filled (filledItems cs)
  | .must c m => .must c.filled m
  | .when c t e => .when c.filled t.filled (filledSpread e)
  | .contains c n => .contains c.filled n.filled
  | .rest t cs => .rest t.filled (filledCovers cs)
  | .select s arms d => .select s.filled (filledPairs arms) (filledSpread d)
  | .filter s c => .filter s.filled c
  | .call .each args => .call .each (filledHead args)
  | .call .pack args => .call .pack (filledHead args)
  | .call .emit args => .call .emit (filledHead args)
  | .call f args => .call f (filledItems args)
  | v => v

def filledHead : List Val → List Val
  | [] => []
  | d :: ts => d.filled :: ts

def filledFields : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.filled) :: filledFields fs

def filledItems : List Val → List Val
  | [] => []
  | v :: vs => v.filled :: filledItems vs

def filledSpread : Option Val → Option Val
  | none => none
  | some s => some s.filled

def filledArms : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: as => (r, a.filled) :: filledArms as

def filledPairs : List (Val × Val) → List (Val × Val)
  | [] => []
  | (p, r) :: as => (p.filled, r.filled) :: filledPairs as

def filledCovers : List Cover → List Cover
  | [] => []
  | (a, b, c) :: cs => (filledSpread a, filledSpread b, filledSpread c) :: filledCovers cs
end


theorem mem_bindItems {p : Val} : ∀ {vs : List Val} {w : Val}, w ∈ bindItems vs p → ∃ v, v ∈ vs ∧ w = v.bindHole p
  | [], _, h => nomatch h
  | v :: vs, w, h => by
    simp only [bindItems, List.mem_cons] at h
    rcases h with rfl | h
    · exact ⟨v, List.mem_cons_self, rfl⟩
    · obtain ⟨u, hu, rfl⟩ := mem_bindItems h
      exact ⟨u, List.mem_cons_of_mem _ hu, rfl⟩

theorem mem_bindHead {p : Val} : ∀ {vs : List Val} {w : Val}, w ∈ bindHead vs p →
    w ∈ vs ∨ ∃ v, v ∈ vs ∧ w = v.bindHole p
  | [], _, h => nomatch h
  | v :: vs, w, h => by
    simp only [bindHead, List.mem_cons] at h
    rcases h with rfl | h
    · exact .inr ⟨v, List.mem_cons_self, rfl⟩
    · exact .inl (List.mem_cons_of_mem _ h)

/-- Binding a hole to a term the checker can read leaves a term it can
read. -/
theorem bindHole_checkableA {p : Val} (hp : p.CheckableA) {v : Val} (h : v.CheckableA) :
    (v.bindHole p).CheckableA := by
  induction h with
  | hole => exact hp
  | @call f args h ih =>
    have hi : ∀ a, a ∈ bindItems args p → a.CheckableA := fun a ha => by
      obtain ⟨u, hu, rfl⟩ := mem_bindItems ha
      exact ih u hu
    have hh : ∀ a, a ∈ bindHead args p → a.CheckableA := fun a ha => by
      rcases mem_bindHead ha with ha | ⟨u, hu, rfl⟩
      · exact h a ha
      · exact ih u hu
    cases f <;> first | exact .call hh | exact .call hi
  | ride _ ih => exact .ride ih
  | _ => simp only [Val.bindHole]; constructor <;> assumption

theorem mem_filledItems : ∀ {vs : List Val} {w : Val}, w ∈ filledItems vs → ∃ v, v ∈ vs ∧ w = v.filled
  | [], _, h => nomatch h
  | v :: vs, w, h => by
    simp only [filledItems, List.mem_cons] at h
    rcases h with rfl | h
    · exact ⟨v, List.mem_cons_self, rfl⟩
    · obtain ⟨u, hu, rfl⟩ := mem_filledItems h
      exact ⟨u, List.mem_cons_of_mem _ hu, rfl⟩

theorem mem_filledHead : ∀ {vs : List Val} {w : Val}, w ∈ filledHead vs → w ∈ vs ∨ ∃ v, v ∈ vs ∧ w = v.filled
  | [], _, h => nomatch h
  | v :: vs, w, h => by
    simp only [filledHead, List.mem_cons] at h
    rcases h with rfl | h
    · exact .inr ⟨v, List.mem_cons_self, rfl⟩
    · exact .inl (List.mem_cons_of_mem _ h)

theorem mem_filledFields : ∀ {fs : List (String × Bool × Val)} {k : String} {o : Bool} {w : Val},
    (k, o, w) ∈ filledFields fs → ∃ v, (k, o, v) ∈ fs ∧ w = v.filled
  | [], _, _, _, h => nomatch h
  | (k', o', v') :: fs, k, o, w, h => by
    simp only [filledFields, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨rfl, rfl, rfl⟩ | h
    · exact ⟨v', List.mem_cons_self, rfl⟩
    · obtain ⟨u, hu, rfl⟩ := mem_filledFields h
      exact ⟨u, List.mem_cons_of_mem _ hu, rfl⟩

theorem filledSpread_some : ∀ {sp : Option Val} {t : Val}, filledSpread sp = some t → ∃ s, sp = some s ∧ t = s.filled
  | none, _, h => nomatch h
  | some s, t, h => by simp only [filledSpread, Option.some.injEq] at h; exact ⟨s, rfl, h.symm⟩

theorem mem_filledArms : ∀ {arms : List (ℕ × Val)} {r : ℕ} {b : Val},
    (r, b) ∈ filledArms arms → ∃ a, (r, a) ∈ arms ∧ b = a.filled
  | [], _, _, h => nomatch h
  | (r', a') :: arms, r, b, h => by
    simp only [filledArms, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨rfl, rfl⟩ | h
    · exact ⟨a', List.mem_cons_self, rfl⟩
    · obtain ⟨u, hu, rfl⟩ := mem_filledArms h
      exact ⟨u, List.mem_cons_of_mem _ hu, rfl⟩

theorem mem_filledPairs : ∀ {arms : List (Val × Val)} {p r : Val},
    (p, r) ∈ filledPairs arms → ∃ p₀ r₀, (p₀, r₀) ∈ arms ∧ p = p₀.filled ∧ r = r₀.filled
  | [], _, _, h => nomatch h
  | (p', r') :: arms, p, r, h => by
    simp only [filledPairs, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨rfl, rfl⟩ | h
    · exact ⟨p', r', List.mem_cons_self, rfl, rfl⟩
    · obtain ⟨p₀, r₀, hm, rfl, rfl⟩ := mem_filledPairs h
      exact ⟨p₀, r₀, List.mem_cons_of_mem _ hm, rfl, rfl⟩

theorem mem_filledCovers : ∀ {cs : List Cover} {c : Cover}, c ∈ filledCovers cs →
    ∃ c₀, c₀ ∈ cs ∧ c = (filledSpread c₀.1, filledSpread c₀.2.1, filledSpread c₀.2.2)
  | [], _, h => nomatch h
  | (a, b, d) :: cs, c, h => by
    simp only [filledCovers, List.mem_cons] at h
    rcases h with rfl | h
    · exact ⟨(a, b, d), List.mem_cons_self, rfl⟩
    · obtain ⟨c₀, hm, rfl⟩ := mem_filledCovers h
      exact ⟨c₀, List.mem_cons_of_mem _ hm, rfl⟩

theorem declsAt_checkableA {k : String} : ∀ {fs : List (String × Bool × Val)} {p : Val},
    (∀ k o x, (k, o, x) ∈ fs → x.CheckableA) → declsAt k fs = some p → p.CheckableA
  | [], _, _, h => by simp [declsAt] at h
  | (k', o', x) :: fs, p, hf, h => by
    have hf' : ∀ k o x, (k, o, x) ∈ fs → x.CheckableA := fun k o x h => hf k o x (List.mem_cons_of_mem _ h)
    have hx : x.CheckableA := hf k' o' x List.mem_cons_self
    simp only [declsAt] at h
    split at h
    · split at h
      · simp only [Option.some.injEq] at h
        subst h
        exact hx
      · exact absurd h (by simp)
    · rename_i q hq
      split at h
      · simp only [Option.some.injEq] at h
        subst h
        exact .meet hx (declsAt_checkableA hf' hq)
      · simp only [Option.some.injEq] at h
        subst h
        exact declsAt_checkableA hf' hq

theorem putField_checkableA {k : String} : ∀ {fs : List (String × Bool × Val)} {p : Val},
    p.CheckableA → (∀ k o x, (k, o, x) ∈ fs → x.CheckableA) →
    ∀ k' o w, (k', o, w) ∈ putField k p fs → w.CheckableA
  | [], _, _, _, _, _, _, h => by simp [putField] at h
  | (k₁, o₁, x) :: fs, p, hp, hf, k', o, w, h => by
    have hf' : ∀ k o x, (k, o, x) ∈ fs → x.CheckableA := fun k o x h => hf k o x (List.mem_cons_of_mem _ h)
    simp only [putField] at h
    split at h
    · rcases List.mem_cons.mp h with h | h
      · simp only [Prod.mk.injEq] at h
        obtain ⟨-, -, rfl⟩ := h
        exact hp
      · exact putField_checkableA .any hf' _ _ _ h
    · rcases List.mem_cons.mp h with h | h
      · simp only [Prod.mk.injEq] at h
        obtain ⟨-, -, rfl⟩ := h
        exact hf _ _ _ List.mem_cons_self
      · exact putField_checkableA hp hf' _ _ _ h

theorem standingAt_mem : ∀ {xs : List Val} {i : ℕ} {p : Val}, standingAt xs i = some p → p ∈ xs
  | [], _, _, h => by simp [standingAt] at h
  | x :: xs, i, p, h => by
    simp only [standingAt] at h
    split at h
    · exact List.mem_cons_of_mem _ (standingAt_mem h)
    · split at h
      · simp only [Option.some.injEq] at h
        subst h
        exact List.mem_cons_self
      · exact List.mem_cons_of_mem _ (standingAt_mem h)

theorem mem_setStanding {p : Val} : ∀ {xs : List Val} {i : ℕ} {v : Val}, v ∈ setStanding xs i p → v ∈ xs ∨ v = p
  | [], _, _, h => by simp [setStanding] at h
  | x :: xs, i, v, h => by
    simp only [setStanding] at h
    split at h
    · rcases List.mem_cons.mp h with rfl | h
      · exact .inl List.mem_cons_self
      · exact (mem_setStanding h).imp (List.mem_cons_of_mem _) id
    · split at h
      · rcases List.mem_cons.mp h with rfl | h
        · exact .inr rfl
        · exact .inl (List.mem_cons_of_mem _ h)
      · rcases List.mem_cons.mp h with rfl | h
        · exact .inl List.mem_cons_self
        · exact (mem_setStanding h).imp (List.mem_cons_of_mem _) id

theorem memberAt_checkableA {b : Val} (hb : b.CheckableA) : ∀ {k : String} {p : Val},
    b.memberAt k = some p → p.CheckableA := by
  induction hb with
  | @map fs sa ca hf _ _ _ =>
    intro k p h
    simp only [Val.memberAt] at h
    exact declsAt_checkableA hf h
  | @meet u v _ _ ihu ihv =>
    intro k p h
    simp only [Val.memberAt] at h
    split at h
    · rename_i p₁ q₁ h₁ h₂
      simp only [Option.some.injEq] at h
      subst h
      exact .meet (ihu h₁) (ihv h₂)
    · rename_i p₁ h₁ _
      simp only [Option.some.injEq] at h
      subst h
      exact ihu h₁
    · exact ihv h
  | ride _ ih => intro k p h; exact ih h
  | _ => intro k p h; simp [Val.memberAt] at h

theorem putMember_checkableA {b : Val} (hb : b.CheckableA) : ∀ {k : String} {p : Val},
    p.CheckableA → (b.putMember k p).CheckableA := by
  induction hb with
  | @map fs sa ca hf hs _ _ =>
    intro k p hp
    simp only [Val.putMember]
    exact .map (putField_checkableA hp hf) hs
  | @meet u v hu hv ihu ihv =>
    intro k p hp
    simp only [Val.putMember]
    split
    · exact .meet (ihu hp) (ihv .any)
    · exact .meet hu (ihv hp)
  | ride _ ih => intro k p hp; exact .ride (ih hp)
  | _ => intro k p hp; simp only [Val.putMember]; constructor <;> assumption

theorem elemAt_checkableA {b : Val} (hb : b.CheckableA) : ∀ {i : ℕ} {p : Val},
    b.elemAt i = some p → p.CheckableA := by
  induction hb with
  | @list xs sa ca hx _ _ _ =>
    intro i p h
    simp only [Val.elemAt] at h
    exact hx p (standingAt_mem h)
  | @meet u v _ _ ihu ihv =>
    intro i p h
    simp only [Val.elemAt] at h
    split at h
    · rename_i p₁ q₁ h₁ h₂
      simp only [Option.some.injEq] at h
      subst h
      exact .meet (ihu h₁) (ihv h₂)
    · rename_i p₁ h₁ _
      simp only [Option.some.injEq] at h
      subst h
      exact ihu h₁
    · exact ihv h
  | ride _ ih => intro i p h; exact ih h
  | _ => intro i p h; simp [Val.elemAt] at h

theorem putElem_checkableA {b : Val} (hb : b.CheckableA) : ∀ {i : ℕ} {p : Val},
    p.CheckableA → (b.putElem i p).CheckableA := by
  induction hb with
  | @list xs sa ca hx hs _ _ =>
    intro i p hp
    simp only [Val.putElem]
    refine .list (fun v h => ?_) hs
    rcases mem_setStanding h with h | rfl
    · exact hx v h
    · exact hp
  | @meet u v hu hv ihu ihv =>
    intro i p hp
    simp only [Val.putElem]
    split
    · exact .meet (ihu hp) (ihv .any)
    · exact .meet hu (ihv hp)
  | ride _ ih => intro i p hp; exact .ride (ih hp)
  | _ => intro i p hp; simp only [Val.putElem]; constructor <;> assumption

theorem waitingSpread_checkableA {s : Val} (hs : s.CheckableA) {arms : List (Val × Val)} {t : Val}
    (h : s.waitingSpread = some (arms, t)) :
    t.CheckableA ∧ ∀ p r, (p, r) ∈ arms → p.CheckableA ∧ r.CheckableA := by
  unfold Val.waitingSpread at h
  split at h
  · split at h
    · simp only [Option.some.injEq, Prod.mk.injEq] at h
      obtain ⟨rfl, rfl⟩ := h
      cases hs with
      | selectKey hp hr hd => exact ⟨hd _ rfl, fun p r hm => ⟨hp p r hm, hr p r hm⟩⟩
    · exact absurd h (by simp)
  · split at h
    · simp only [Option.some.injEq, Prod.mk.injEq] at h
      obtain ⟨rfl, rfl⟩ := h
      exact ⟨hs, fun _ _ hm => absurd hm List.not_mem_nil⟩
    · exact absurd h (by simp)

theorem spreadWith_checkableA {arms : List (Val × Val)} {t : Val} {k : String}
    (ha : ∀ p r, (p, r) ∈ arms → p.CheckableA ∧ r.CheckableA) (ht : t.CheckableA) :
    (spreadWith arms t k).CheckableA := by
  unfold spreadWith
  refine .selectKey (fun p r hm => ?_) (fun p r hm => ?_) (fun e he => ?_)
  · rcases List.mem_cons.mp hm with h | h
    · simp only [Prod.mk.injEq] at h
      obtain ⟨rfl, -⟩ := h
      exact .lit
    · exact (ha p r h).1
  · rcases List.mem_cons.mp hm with h | h
    · simp only [Prod.mk.injEq] at h
      obtain ⟨-, rfl⟩ := h
      exact .any
    · exact (ha p r h).2
  · simp only [Option.some.injEq] at he
    subst he
    exact ht

theorem spreadMeet_checkableA {t p : Val} (ht : t.CheckableA) (hp : p.CheckableA) :
    (t.spreadMeet p).CheckableA := by
  unfold Val.spreadMeet
  split
  · exact .meet ht hp
  · exact bindHole_checkableA hp ht

theorem bind_waitingSpread {sp : Option Val} (hsp : ∀ s, sp = some s → s.CheckableA)
    {arms : List (Val × Val)} {t : Val} (h : sp.bind Val.waitingSpread = some (arms, t)) :
    t.CheckableA ∧ ∀ k, (spreadWith arms t k).CheckableA := by
  cases sp with
  | none => exact absurd h (by simp)
  | some s =>
    have r := waitingSpread_checkableA (hsp s rfl) h
    exact ⟨r.1, fun _ => spreadWith_checkableA r.2 r.1⟩

theorem spreadFields_checkableA : ∀ {fs : List (String × Bool × Val)} {sp : Option Val},
    (∀ k o x, (k, o, x) ∈ fs → x.CheckableA) → (∀ s, sp = some s → s.CheckableA) →
    (∀ k o w, (k, o, w) ∈ (spreadFields fs sp).1 → w.CheckableA) ∧
      ∀ s, (spreadFields fs sp).2 = some s → s.CheckableA
  | [], _, _, hsp => ⟨fun _ _ _ h => by simp [spreadFields] at h, by simpa [spreadFields] using hsp⟩
  | (k, o, x) :: fs, sp, hf, hsp => by
    have hf' : ∀ k o x, (k, o, x) ∈ fs → x.CheckableA := fun k o x h => hf k o x (List.mem_cons_of_mem _ h)
    have hx : x.CheckableA := hf k o x List.mem_cons_self
    cases hw : sp.bind Val.waitingSpread with
    | none =>
      simp only [spreadFields, hw]
      exact ⟨hf, hsp⟩
    | some at' =>
      obtain ⟨arms, t⟩ := at'
      have r := bind_waitingSpread hsp hw
      simp only [spreadFields, hw]
      split
      · have q := spreadFields_checkableA hf' hsp
        refine ⟨fun k' o' w h => ?_, q.2⟩
        rcases List.mem_cons.mp h with h | h
        · simp only [Prod.mk.injEq] at h
          obtain ⟨-, -, rfl⟩ := h
          exact hx
        · exact q.1 _ _ _ h
      · have q := spreadFields_checkableA (sp := some (spreadWith arms t k)) hf'
          (fun s hs => by simp only [Option.some.injEq] at hs; subst hs; exact r.2 k)
        refine ⟨fun k' o' w h => ?_, q.2⟩
        rcases List.mem_cons.mp h with h | h
        · simp only [Prod.mk.injEq] at h
          obtain ⟨-, -, rfl⟩ := h
          exact spreadMeet_checkableA r.1 hx
        · exact q.1 _ _ _ h

theorem spreadItems_checkableA : ∀ {xs : List Val} {i : ℕ} {sp : Option Val},
    (∀ x, x ∈ xs → x.CheckableA) → (∀ s, sp = some s → s.CheckableA) →
    (∀ w, w ∈ (spreadItems i xs sp).1 → w.CheckableA) ∧ ∀ s, (spreadItems i xs sp).2 = some s → s.CheckableA
  | [], _, _, _, hsp => ⟨fun _ h => by simp [spreadItems] at h, by simpa [spreadItems] using hsp⟩
  | x :: xs, i, sp, hx, hsp => by
    have hx' : ∀ v, v ∈ xs → v.CheckableA := fun v h => hx v (List.mem_cons_of_mem _ h)
    have h0 : x.CheckableA := hx x List.mem_cons_self
    cases hk : (x.marked || x.isAbsent) with
    | true =>
      simp only [spreadItems, hk, ↓reduceIte]
      have q := spreadItems_checkableA (i := i) hx' hsp
      refine ⟨fun w h => ?_, q.2⟩
      rcases List.mem_cons.mp h with rfl | h
      · exact h0
      · exact q.1 _ h
    | false =>
      cases hw : sp.bind Val.waitingSpread with
      | none =>
        simp only [spreadItems, hk, Bool.false_eq_true, ↓reduceIte, hw]
        exact ⟨hx, hsp⟩
      | some at' =>
        obtain ⟨arms, t⟩ := at'
        have r := bind_waitingSpread hsp hw
        simp only [spreadItems, hk, Bool.false_eq_true, ↓reduceIte, hw]
        split
        · have q := spreadItems_checkableA (i := i + 1) hx' hsp
          refine ⟨fun w h => ?_, q.2⟩
          rcases List.mem_cons.mp h with rfl | h
          · exact h0
          · exact q.1 _ h
        · have q := spreadItems_checkableA (i := i + 1) (sp := some (spreadWith arms t (toString i))) hx'
            (fun s hs => by simp only [Option.some.injEq] at hs; subst hs; exact r.2 _)
          refine ⟨fun w h => ?_, q.2⟩
          rcases List.mem_cons.mp h with rfl | h
          · exact spreadMeet_checkableA r.1 h0
          · exact q.1 _ h

theorem spreadOnto_checkableA : ∀ {ks : List String} {sp : Option Val} {b : Val},
    (∀ s, sp = some s → s.CheckableA) → b.CheckableA →
    (∀ s, (spreadOnto sp ks b).1 = some s → s.CheckableA) ∧ (spreadOnto sp ks b).2.CheckableA
  | [], _, _, hsp, hb => ⟨by simpa [spreadOnto] using hsp, by simpa [spreadOnto] using hb⟩
  | k :: ks, sp, b, hsp, hb => by
    cases hw : sp.bind Val.waitingSpread with
    | none => simp only [spreadOnto, hw]; exact spreadOnto_checkableA hsp hb
    | some at' =>
      obtain ⟨arms, t⟩ := at'
      cases hm : b.memberAt k with
      | none => simp only [spreadOnto, hw, hm]; exact spreadOnto_checkableA hsp hb
      | some p =>
        have r := bind_waitingSpread hsp hw
        simp only [spreadOnto, hw, hm]
        split
        · exact spreadOnto_checkableA hsp hb
        · exact spreadOnto_checkableA (fun s hs => by simp only [Option.some.injEq] at hs; subst hs; exact r.2 k)
            (putMember_checkableA hb (spreadMeet_checkableA r.1 (memberAt_checkableA hb hm)))

theorem spreadOntoAt_checkableA : ∀ {is : List ℕ} {sp : Option Val} {b : Val},
    (∀ s, sp = some s → s.CheckableA) → b.CheckableA →
    (∀ s, (spreadOntoAt sp is b).1 = some s → s.CheckableA) ∧ (spreadOntoAt sp is b).2.CheckableA
  | [], _, _, hsp, hb => ⟨by simpa [spreadOntoAt] using hsp, by simpa [spreadOntoAt] using hb⟩
  | i :: is, sp, b, hsp, hb => by
    cases hw : sp.bind Val.waitingSpread with
    | none => simp only [spreadOntoAt, hw]; exact spreadOntoAt_checkableA hsp hb
    | some at' =>
      obtain ⟨arms, t⟩ := at'
      cases hm : b.elemAt i with
      | none => simp only [spreadOntoAt, hw, hm]; exact spreadOntoAt_checkableA hsp hb
      | some p =>
        have r := bind_waitingSpread hsp hw
        simp only [spreadOntoAt, hw, hm]
        split
        · exact spreadOntoAt_checkableA hsp hb
        · exact spreadOntoAt_checkableA (fun s hs => by simp only [Option.some.injEq] at hs; subst hs; exact r.2 _)
            (putElem_checkableA hb (spreadMeet_checkableA r.1 (elemAt_checkableA hb hm)))

theorem spreadFrom_checkableA {b : Val} (hb : b.CheckableA) : ∀ {fs : List (String × Bool × Val)},
    (∀ k o x, (k, o, x) ∈ fs → x.CheckableA) →
    (∀ k o w, (k, o, w) ∈ (spreadFrom fs b).1 → w.CheckableA) ∧ (spreadFrom fs b).2.CheckableA := by
  induction hb with
  | @map gs sb cb hg hs _ _ =>
    intro fs hf
    have q := spreadFields_checkableA hf hs
    exact ⟨q.1, .map hg q.2⟩
  | @meet u v hu hv ihu ihv =>
    intro fs hf
    have q₁ := ihu hf
    have q₂ := ihv q₁.1
    exact ⟨q₂.1, .meet q₁.2 q₂.2⟩
  | ride _ ih =>
    intro fs hf
    have q := ih hf
    exact ⟨q.1, .ride q.2⟩
  | _ => intro fs hf; simp only [spreadFrom]; exact ⟨hf, by constructor <;> assumption⟩

theorem spreadFromAt_checkableA {b : Val} (hb : b.CheckableA) : ∀ {xs : List Val},
    (∀ x, x ∈ xs → x.CheckableA) →
    (∀ w, w ∈ (spreadFromAt xs b).1 → w.CheckableA) ∧ (spreadFromAt xs b).2.CheckableA := by
  induction hb with
  | @list ys sb cb hy hs _ _ =>
    intro xs hx
    have q := spreadItems_checkableA (i := 0) hx hs
    exact ⟨q.1, .list hy q.2⟩
  | @meet u v hu hv ihu ihv =>
    intro xs hx
    have q₁ := ihu hx
    have q₂ := ihv q₁.1
    exact ⟨q₂.1, .meet q₁.2 q₂.2⟩
  | ride _ ih =>
    intro xs hx
    have q := ih hx
    exact ⟨q.1, .ride q.2⟩
  | _ => intro xs hx; simp only [spreadFromAt]; exact ⟨hx, by constructor <;> assumption⟩

abbrev FillsReadably (x : Val) : Prop :=
  ∀ {b : Val}, b.CheckableA → (x.fillMeet b).1.CheckableA ∧ (x.fillMeet b).2.CheckableA

theorem leafArms_checkableA {a : Val} (ha : a.CheckableA) : ∀ {ys : List (ℕ × Val)},
    (∀ r y, (r, y) ∈ ys → y.CheckableA) → ∀ r w, (r, w) ∈ leafArms a ys → w.CheckableA
  | [], _, _, _, h => by simp [leafArms] at h
  | (r, y) :: ys, hy, r', w, h => by
    simp only [leafArms, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨-, rfl⟩ | h
    · have hy0 := hy r y List.mem_cons_self
      split
      · exact bindHole_checkableA ha hy0
      · exact .meet ha hy0
    · exact leafArms_checkableA ha (fun r y h => hy r y (List.mem_cons_of_mem _ h)) r' w h

theorem fillArms_checkableA : ∀ {arms : List (ℕ × Val)} {b : Val},
    (∀ r x, (r, x) ∈ arms → FillsReadably x) → b.CheckableA →
    ∀ r w, (r, w) ∈ fillArms arms b → w.CheckableA
  | [], _, _, _, _, _, h => by simp [fillArms] at h
  | (r, x) :: as, b, ih, hb, r', w, h => by
    simp only [fillArms, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨-, rfl⟩ | h
    · have q := ih r x List.mem_cons_self hb
      exact .meet q.1 q.2
    · exact fillArms_checkableA (fun r x h => ih r x (List.mem_cons_of_mem _ h)) hb r' w h

theorem fillFields_checkableA : ∀ {fs : List (String × Bool × Val)} {b : Val},
    (∀ k o x, (k, o, x) ∈ fs → x.CheckableA) → (∀ k o x, (k, o, x) ∈ fs → FillsReadably x) →
    b.CheckableA →
    (∀ k o v, (k, o, v) ∈ (fillFields fs b).1 → v.CheckableA) ∧ (fillFields fs b).2.CheckableA
  | [], b, _, _, hb => ⟨fun _ _ _ h => by simp [fillFields] at h, by simpa [fillFields] using hb⟩
  | (k, o, x) :: fs, b, hf, ih, hb => by
    have hf' : ∀ k o x, (k, o, x) ∈ fs → x.CheckableA := fun k o x h => hf k o x (List.mem_cons_of_mem _ h)
    have ih' : ∀ k o x, (k, o, x) ∈ fs → FillsReadably x := fun k o x h => ih k o x (List.mem_cons_of_mem _ h)
    have hx : x.CheckableA := hf k o x List.mem_cons_self
    cases hm : b.memberAt k with
    | none =>
      simp only [fillFields, hm]
      have r := fillFields_checkableA hf' ih' hb
      refine ⟨fun k₁ o₁ v h => ?_, r.2⟩
      rcases List.mem_cons.mp h with h | h
      · simp only [Prod.mk.injEq] at h
        obtain ⟨-, -, rfl⟩ := h
        exact hx
      · exact r.1 _ _ _ h
    | some p =>
      have hxp := ih k o x List.mem_cons_self (memberAt_checkableA hb hm)
      have r := fillFields_checkableA hf' ih' (putMember_checkableA (k := k) hb hxp.2)
      simp only [fillFields, hm]
      refine ⟨fun k₁ o₁ v h => ?_, r.2⟩
      rcases List.mem_cons.mp h with h | h
      · simp only [Prod.mk.injEq] at h
        obtain ⟨-, -, rfl⟩ := h
        exact hxp.1
      · exact r.1 _ _ _ h

theorem fillElems_checkableA : ∀ {xs : List Val} {i : ℕ} {b : Val},
    (∀ x, x ∈ xs → x.CheckableA) → (∀ x, x ∈ xs → FillsReadably x) → b.CheckableA →
    (∀ v, v ∈ (fillElems i xs b).1 → v.CheckableA) ∧ (fillElems i xs b).2.CheckableA
  | [], i, b, _, _, hb => ⟨fun _ h => by simp [fillElems] at h, by simpa [fillElems] using hb⟩
  | x :: xs, i, b, hx, ih, hb => by
    have hx' : ∀ v, v ∈ xs → v.CheckableA := fun v h => hx v (List.mem_cons_of_mem _ h)
    have ih' : ∀ v, v ∈ xs → FillsReadably v := fun v h => ih v (List.mem_cons_of_mem _ h)
    cases hk : (x.marked || x.isAbsent) with
    | true =>
      simp only [fillElems, hk, ↓reduceIte]
      have r := fillElems_checkableA (i := i) hx' ih' hb
      refine ⟨fun v h => ?_, r.2⟩
      rcases List.mem_cons.mp h with rfl | h
      · exact hx _ List.mem_cons_self
      · exact r.1 _ h
    | false =>
    cases hm : b.elemAt i with
    | none =>
      simp only [fillElems, hk, Bool.false_eq_true, ↓reduceIte, hm]
      have r := fillElems_checkableA (i := i + 1) hx' ih' hb
      refine ⟨fun v h => ?_, r.2⟩
      rcases List.mem_cons.mp h with rfl | h
      · exact hx _ List.mem_cons_self
      · exact r.1 _ h
    | some p =>
      have hxp := ih x List.mem_cons_self (elemAt_checkableA hb hm)
      have r := fillElems_checkableA (i := i + 1) hx' ih' (putElem_checkableA (i := i) hb hxp.2)
      simp only [fillElems, hk, Bool.false_eq_true, ↓reduceIte, hm]
      refine ⟨fun v h => ?_, r.2⟩
      rcases List.mem_cons.mp h with rfl | h
      · exact hxp.1
      · exact r.1 _ h

theorem fillMeet_checkableA {a : Val} (ha : a.CheckableA) : FillsReadably a := by
  induction ha with
  | @map fs sa ca hf hs ihf _ =>
    intro b hb
    unfold Val.fillMeet
    split
    · exact ⟨bindHole_checkableA hb (.map hf hs), .any⟩
    split
    · exact ⟨.any, bindHole_checkableA (.map hf hs) hb⟩
    · have r := fillFields_checkableA hf ihf hb
      have s := spreadOnto_checkableA (ks := (fillFields fs b).2.keysAt) hs r.2
      have u := spreadFrom_checkableA s.2 r.1
      exact ⟨.map u.1 s.1, u.2⟩
  | @list xs sa ca hx hs ihx _ =>
    intro b hb
    unfold Val.fillMeet
    split
    · exact ⟨bindHole_checkableA hb (.list hx hs), .any⟩
    split
    · exact ⟨.any, bindHole_checkableA (.list hx hs) hb⟩
    · have r := fillElems_checkableA (i := 0) hx ihx hb
      have s := spreadOntoAt_checkableA (is := List.range (fillElems 0 xs b).2.posAt) hs r.2
      have u := spreadFromAt_checkableA s.2 r.1
      exact ⟨.list u.1 s.1, u.2⟩
  | @meet x y hx hy ihx ihy =>
    intro b hb
    unfold Val.fillMeet
    split
    · exact ⟨bindHole_checkableA hb (.meet hx hy), .any⟩
    split
    · exact ⟨.any, bindHole_checkableA (.meet hx hy) hb⟩
    · have h₁ := ihx hb
      have h₂ := ihy h₁.2
      exact ⟨.meet h₁.1 h₂.1, h₂.2⟩
  | @ride k v r hv ihv =>
    intro b hb
    unfold Val.fillMeet
    split
    · exact ⟨bindHole_checkableA hb (.ride hv), .any⟩
    split
    · exact ⟨.any, bindHole_checkableA (.ride hv) hb⟩
    · have h := ihv hb
      exact ⟨.ride h.1, h.2⟩
  | @or arms ha iha =>
    intro b hb
    unfold Val.fillMeet
    split
    · exact ⟨bindHole_checkableA hb (.or ha), .any⟩
    split
    · exact ⟨.any, bindHole_checkableA (.or ha) hb⟩
    · exact ⟨.or (fillArms_checkableA iha hb), .any⟩
  | @pref r x hx ihx =>
    intro b hb
    unfold Val.fillMeet
    split
    · exact ⟨bindHole_checkableA hb (.pref hx), .any⟩
    split
    · exact ⟨.any, bindHole_checkableA (.pref hx) hb⟩
    · have h := ihx hb
      refine ⟨.or fun r' w hm => ?_, .any⟩
      simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
      rcases hm with ⟨-, rfl⟩ | ⟨-, rfl⟩
      · exact .meet h.1 h.2
      · exact .meet hx.super hb
  | _ =>
    intro b hb
    unfold Val.fillMeet
    split
    · exact ⟨bindHole_checkableA hb (by constructor <;> assumption), .any⟩
    split
    · exact ⟨.any, bindHole_checkableA (by constructor <;> assumption) hb⟩
    · dsimp only
      split
      · cases hb with
        | or hy => exact ⟨.or (leafArms_checkableA (by constructor <;> assumption) hy), .any⟩
      · cases hb with
        | pref hy =>
          refine ⟨.or (leafArms_checkableA (by constructor <;> assumption) fun r' y' hm => ?_), .any⟩
          simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
          rcases hm with ⟨-, rfl⟩ | ⟨-, rfl⟩
          · exact hy
          · exact hy.super
      · exact ⟨by constructor <;> assumption, hb⟩

theorem meetFilled_checkableA {a b : Val} (ha : a.CheckableA) (hb : b.CheckableA) :
    (a.meetFilled b).CheckableA := by
  unfold Val.meetFilled
  split
  · exact bindHole_checkableA hb ha
  split
  · exact bindHole_checkableA ha hb
  · exact .meet (fillMeet_checkableA ha hb).1 (fillMeet_checkableA ha hb).2

theorem joinAt_checkableA {k : String} : ∀ {fs : List (String × Bool × Val)} {x : Val × Bool},
    x.1.CheckableA → (∀ k o y, (k, o, y) ∈ fs → y.CheckableA) → (joinAt k x fs).1.CheckableA
  | [], _, hx, _ => hx
  | (k', o', y) :: fs, x, hx, hf => by
    have hf' : ∀ k o y, (k, o, y) ∈ fs → y.CheckableA := fun k o y h => hf k o y (List.mem_cons_of_mem _ h)
    simp only [joinAt]
    split
    · exact joinAt_checkableA (x := (_, _)) (meetFilled_checkableA hx (hf k' o' y List.mem_cons_self)) hf'
    · exact joinAt_checkableA hx hf'

theorem joinFields_checkableA : ∀ {seen : List String} {fs : List (String × Bool × Val)},
    (∀ k o x, (k, o, x) ∈ fs → x.CheckableA) → ∀ k o w, (k, o, w) ∈ joinFields seen fs → w.CheckableA
  | _, [], _, _, _, _, h => by simp [joinFields] at h
  | seen, (k₁, o₁, x) :: fs, hf, k, o, w, h => by
    have hf' : ∀ k o x, (k, o, x) ∈ fs → x.CheckableA := fun k o x h => hf k o x (List.mem_cons_of_mem _ h)
    have hx : x.CheckableA := hf k₁ o₁ x List.mem_cons_self
    simp only [joinFields] at h
    split at h
    · exact joinFields_checkableA hf' _ _ _ h
    · rcases List.mem_cons.mp h with h | h
      · simp only [Prod.mk.injEq] at h
        obtain ⟨-, -, rfl⟩ := h
        exact joinAt_checkableA (x := (x, o₁)) hx hf'
      · exact joinFields_checkableA hf' _ _ _ h

/-- The fill leaves a term the checker can read as one it can read. -/
theorem filled_checkableA {v : Val} (h : v.CheckableA) : v.filled.CheckableA := by
  induction h with
  | meet _ _ iha ihb =>
    simp only [Val.filled]
    exact meetFilled_checkableA iha ihb
  | @map fs spread closed _ _ ihf ihs =>
    have hj : ∀ k o x, (k, o, x) ∈ joinFields [] (filledFields fs) → x.CheckableA :=
      joinFields_checkableA fun k o x hm => by
        obtain ⟨v, hv, rfl⟩ := mem_filledFields hm
        exact ihf k o v hv
    have hsp : ∀ t, filledSpread spread = some t → t.CheckableA := fun t ht => by
      obtain ⟨s, hs, rfl⟩ := filledSpread_some ht
      exact ihs s hs
    have q := spreadFields_checkableA hj hsp
    exact .map q.1 q.2
  | @list items spread closed _ _ ihi ihs =>
    have hi : ∀ x, x ∈ filledItems items → x.CheckableA := fun w hm => by
      obtain ⟨v, hv, rfl⟩ := mem_filledItems hm
      exact ihi v hv
    have hsp : ∀ t, filledSpread spread = some t → t.CheckableA := fun t ht => by
      obtain ⟨s, hs, rfl⟩ := filledSpread_some ht
      exact ihs s hs
    have q := spreadItems_checkableA (i := 0) hi hsp
    exact .list q.1 q.2
  | @or arms _ ih =>
    refine .or fun r b hm => ?_
    obtain ⟨a, ha, rfl⟩ := mem_filledArms hm
    exact ih r a ha
  | pref _ ih => exact .pref ih
  | ride _ ih => exact .ride ih
  | len _ ih => exact .len ih
  | must _ ih => exact .must ih
  | contains _ _ ihc ihn => exact .contains ihc ihn
  | @nof n cs _ _ ihn ihc =>
    refine .nof ihn fun c hc => ?_
    obtain ⟨u, hu, rfl⟩ := mem_filledItems hc
    exact ihc u hu
  | @when c t e _ _ _ ihc iht ihe =>
    refine .when ihc iht fun e' he => ?_
    obtain ⟨s, hs, rfl⟩ := filledSpread_some he
    exact ihe s hs
  | @rest t cs _ _ _ _ iht ih₁ ih₂ ih₃ =>
    refine .rest iht ?_ ?_ ?_ <;> intro c hc v hv <;>
      obtain ⟨c₀, hm₀, rfl⟩ := mem_filledCovers hc <;>
      obtain ⟨s, hs, rfl⟩ := filledSpread_some hv
    · exact ih₁ c₀ hm₀ s hs
    · exact ih₂ c₀ hm₀ s hs
    · exact ih₃ c₀ hm₀ s hs
  | @selectKey arms d _ _ _ ihp ihr ihd =>
    refine .selectKey ?_ ?_ ?_
    · intro p r hm
      obtain ⟨p₀, r₀, hm₀, rfl, rfl⟩ := mem_filledPairs hm
      exact ihp p₀ r₀ hm₀
    · intro p r hm
      obtain ⟨p₀, r₀, hm₀, rfl, rfl⟩ := mem_filledPairs hm
      exact ihr p₀ r₀ hm₀
    · intro e he
      obtain ⟨s, hs, rfl⟩ := filledSpread_some he
      exact ihd s hs
  | @selectLit sc arms d _ _ _ ihp ihr ihd =>
    refine .selectLit ?_ ?_ ?_
    · intro p r hm
      obtain ⟨p₀, r₀, hm₀, rfl, rfl⟩ := mem_filledPairs hm
      exact ihp p₀ r₀ hm₀
    · intro p r hm
      obtain ⟨p₀, r₀, hm₀, rfl, rfl⟩ := mem_filledPairs hm
      exact ihr p₀ r₀ hm₀
    · intro e he
      obtain ⟨s, hs, rfl⟩ := filledSpread_some he
      exact ihd s hs
  | @call f args h ih =>
    have hi : ∀ a, a ∈ filledItems args → a.CheckableA := fun a ha => by
      obtain ⟨u, hu, rfl⟩ := mem_filledItems ha
      exact ih u hu
    have hh : ∀ a, a ∈ filledHead args → a.CheckableA := fun a ha => by
      rcases mem_filledHead ha with ha | ⟨u, hu, rfl⟩
      · exact h a ha
      · exact ih u hu
    cases f <;> first | exact .call hh | exact .call hi
  | _ => simp only [Val.filled]; constructor <;> assumption

theorem joinAt_absent {k : String} : ∀ {fs : List (String × Bool × Val)} {x : Val × Bool},
    declared k fs = false → joinAt k x fs = x
  | [], _, _ => rfl
  | (k', o', y) :: fs, x, h => by
    simp only [declared, List.any_cons, Bool.or_eq_false_iff] at h
    simp only [joinAt, h.1, Bool.false_eq_true, ↓reduceIte]
    exact joinAt_absent h.2

/-- A map that declares each key once is joined as it stands. -/
theorem joinFields_distinct : ∀ {seen : List String} {fs : List (String × Bool × Val)},
    keysDistinct fs = true → (∀ k, seen.contains k = true → declared k fs = false) → joinFields seen fs = fs
  | _, [], _, _ => rfl
  | seen, (k, o, x) :: fs, hd, hs => by
    simp only [keysDistinct, Bool.and_eq_true, Bool.not_eq_true'] at hd
    have hk : seen.contains k = false := by
      cases hc : seen.contains k with
      | false => rfl
      | true => have := hs k hc; simp [declared] at this
    have hs' : ∀ k', (k :: seen).contains k' = true → declared k' fs = false := by
      intro k' hc
      rcases List.mem_cons.mp (List.contains_iff_mem.mp hc) with rfl | hm
      · exact hd.1
      · have := hs k' (List.contains_iff_mem.mpr hm)
        simp only [declared, List.any_cons, Bool.or_eq_false_iff] at this
        exact this.2
    simp only [joinFields, hk, Bool.false_eq_true, ↓reduceIte, joinAt_absent hd.1, joinFields_distinct hd.2 hs']

theorem joinFields_single {k : String} {o : Bool} {x : Val} : joinFields [] [(k, o, x)] = [(k, o, x)] := by
  simp [joinFields, joinAt]

theorem termMembers_declared {k : String} : ∀ {fs : List (String × Data)},
    declared k (termMembers fs) = true → k ∈ fs.map Prod.fst
  | [], h => by simp [termMembers, declared] at h
  | (k', x) :: fs, h => by
    simp only [termMembers, declared, List.any_cons, Bool.or_eq_true, beq_iff_eq] at h
    rcases h with rfl | h
    · exact List.mem_cons_self
    · exact List.mem_cons_of_mem _ (termMembers_declared h)

theorem termMembers_distinct : ∀ {fs : List (String × Data)}, (fs.map Prod.fst).Nodup →
    keysDistinct (termMembers fs) = true
  | [], _ => rfl
  | (k, x) :: fs, h => by
    rw [List.map_cons, List.nodup_cons] at h
    have hk : declared k (termMembers fs) = false := by
      cases hc : declared k (termMembers fs) with
      | false => rfl
      | true => exact absurd (termMembers_declared hc) h.1
    simp only [termMembers, keysDistinct, hk, Bool.not_false, Bool.true_and]
    exact termMembers_distinct h.2

theorem spreadFields_none : ∀ fs : List (String × Bool × Val), spreadFields fs none = (fs, none)
  | [] => rfl
  | (_, _, _) :: _ => rfl

theorem spreadItems_none : ∀ (i : ℕ) (xs : List Val), spreadItems i xs none = (xs, none)
  | _, [] => rfl
  | i, x :: xs => by
    cases hk : (x.marked || x.isAbsent) with
    | true => simp only [spreadItems, hk, ↓reduceIte, spreadItems_none i xs]
    | false => simp only [spreadItems, hk, Bool.false_eq_true, ↓reduceIte]; rfl

mutual
/-- A value as a term holds no meet and no key twice, so the fill
leaves it as it is. -/
theorem Data.term_filled : ∀ j : Data, j.wf = true → j.term.filled = j.term
  | .num _, _ => rfl
  | .str _, _ => rfl
  | .bool _, _ => rfl
  | .null, _ => rfl
  | .addr _, _ => rfl
  | .map fs, h => by
    simp only [Data.wf, Bool.and_eq_true, decide_eq_true_eq] at h
    simp only [Data.term, Val.filled, filledSpread, termMembers_filled fs h.2,
      joinFields_distinct (seen := []) (termMembers_distinct h.1) (fun _ hc => by simp at hc), spreadFields_none]
  | .list xs, h => by
    simp only [Data.wf] at h
    simp only [Data.term, Val.filled, filledSpread, termElems_filled xs h, spreadItems_none]

theorem termMembers_filled : ∀ fs : List (String × Data), Data.wfMembers fs = true →
    filledFields (termMembers fs) = termMembers fs
  | [], _ => rfl
  | (_, x) :: fs, h => by
    simp only [Data.wfMembers, Bool.and_eq_true] at h
    simp only [termMembers, filledFields, Data.term_filled x h.1, termMembers_filled fs h.2]

theorem termElems_filled : ∀ xs : List Data, Data.wfAll xs = true → filledItems (termElems xs) = termElems xs
  | [], _ => rfl
  | x :: xs, h => by
    simp only [Data.wfAll, Bool.and_eq_true] at h
    simp only [termElems, filledItems, Data.term_filled x h.1, termElems_filled xs h.2]
end

/-- How a document reads: its term expanded and filled, with its
selections made and each key placed, the document standing at the top. -/
def Decls.readR (ds : Decls) (S : Val) : Val := resolveD ds none (some []) (ds.read S).filled

/-- How a document reads with its keys as written: the root its paths
read, so that a key a path reaches reads where the path lands. -/
def Decls.readU (ds : Decls) (S : Val) : Val := resolveD ds none none (ds.read S).filled

/-- How a document reads against data: the schema as read, met with the
data through the fill, the data last, so that the data fills a hole the
schema leaves unfilled, and read again, so that a call the data fills
is made. -/
def Decls.readJ (ds : Decls) (S : Val) (j : Data) : Val :=
  resolveD ds none (some []) ((ds.readR S).meetFilled j.term)

theorem mem_resolveFields {ds : Decls} {b : Option Val} {here : Option (List Step)} :
    ∀ {fs : List (String × Bool × Val)} {k : String} {o : Bool} {w : Val},
    (k, o, w) ∈ resolveFields ds b here fs → ∃ v, (k, o, v) ∈ fs ∧ w = resolveD ds b (stepped here (.seg (.key k))) v
  | [], _, _, _, h => nomatch h
  | (k', o', v') :: fs, k, o, w, h => by
    simp only [resolveFields, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨rfl, rfl, rfl⟩ | h
    · exact ⟨v', List.mem_cons_self, rfl⟩
    · obtain ⟨v, hv, rfl⟩ := mem_resolveFields h
      exact ⟨v, List.mem_cons_of_mem _ hv, rfl⟩

theorem mem_resolveElems {ds : Decls} {b : Option Val} {here : Option (List Step)} :
    ∀ {i : ℕ} {vs : List Val} {w : Val},
    w ∈ resolveElems ds b here i vs → ∃ v, v ∈ vs ∧ ∃ i', w = resolveD ds b (stepped here (.seg (.idx i'))) v
  | _, [], _, h => nomatch h
  | i, v' :: vs, w, h => by
    simp only [resolveElems, List.mem_cons] at h
    rcases h with rfl | h
    · exact ⟨v', List.mem_cons_self, i, rfl⟩
    · obtain ⟨v, hv, i', rfl⟩ := mem_resolveElems h
      exact ⟨v, List.mem_cons_of_mem _ hv, i', rfl⟩

theorem mem_resolveItems {ds : Decls} {b : Option Val} {here : Option (List Step)} : ∀ {vs : List Val} {w : Val},
    w ∈ resolveItems ds b here vs → ∃ v, v ∈ vs ∧ w = resolveD ds b here v
  | [], _, h => nomatch h
  | v' :: vs, w, h => by
    simp only [resolveItems, List.mem_cons] at h
    rcases h with rfl | h
    · exact ⟨v', List.mem_cons_self, rfl⟩
    · obtain ⟨v, hv, rfl⟩ := mem_resolveItems h
      exact ⟨v, List.mem_cons_of_mem _ hv, rfl⟩

theorem resolveSpread_some {ds : Decls} {b : Option Val} {here : Option (List Step)} : ∀ {sp : Option Val} {w : Val},
    resolveSpread ds b here sp = some w → ∃ s, sp = some s ∧ w = resolveD ds b here s
  | none, _, h => nomatch h
  | some s, _, h => by simp only [resolveSpread, Option.some.injEq] at h; exact ⟨s, rfl, h.symm⟩

theorem mem_resolveArms {ds : Decls} {b : Option Val} {here : Option (List Step)} :
    ∀ {arms : List (ℕ × Val)} {r : ℕ} {w : Val},
    (r, w) ∈ resolveArms ds b here arms → ∃ a, (r, a) ∈ arms ∧ w = resolveD ds b here a
  | [], _, _, h => nomatch h
  | (r', a') :: arms, r, w, h => by
    simp only [resolveArms, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨rfl, rfl⟩ | h
    · exact ⟨a', List.mem_cons_self, rfl⟩
    · obtain ⟨a, ha, rfl⟩ := mem_resolveArms h
      exact ⟨a, List.mem_cons_of_mem _ ha, rfl⟩

theorem mem_resolvePairs {ds : Decls} {b : Option Val} {here : Option (List Step)} :
    ∀ {ps : List (Val × Val)} {p r : Val},
    (p, r) ∈ resolvePairs ds b here ps → ∃ p₀ r₀, (p₀, r₀) ∈ ps ∧ p = resolveD ds b here p₀ ∧ r = resolveD ds b here r₀
  | [], _, _, h => nomatch h
  | (p', r') :: ps, p, r, h => by
    simp only [resolvePairs, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨rfl, rfl⟩ | h
    · exact ⟨p', r', List.mem_cons_self, rfl, rfl⟩
    · obtain ⟨p₀, r₀, hm, rfl, rfl⟩ := mem_resolvePairs h
      exact ⟨p₀, r₀, List.mem_cons_of_mem _ hm, rfl, rfl⟩

theorem mem_resolveCovers {ds : Decls} {b : Option Val} {here : Option (List Step)} : ∀ {cs : List Cover} {c : Cover},
    c ∈ resolveCovers ds b here cs → ∃ c₀, c₀ ∈ cs ∧ c.1 = resolveSpread ds b here c₀.1 ∧
      c.2.1 = resolveSpread ds b here c₀.2.1 ∧ c.2.2 = resolveSpread ds b here c₀.2.2
  | [], _, h => nomatch h
  | (c₁, k₁, m₁) :: cs, c, h => by
    simp only [resolveCovers, List.mem_cons] at h
    rcases h with rfl | h
    · exact ⟨(c₁, k₁, m₁), List.mem_cons_self, rfl, rfl, rfl⟩
    · obtain ⟨c₀, hc, h1, h2, h3⟩ := mem_resolveCovers h
      exact ⟨c₀, List.mem_cons_of_mem _ hc, h1, h2, h3⟩

/-- A key placed at a position is one the checker can read. -/
theorem keyUpAt_checkableA (pos : List Step) (n : ℤ) : (keyUpAt pos n).CheckableA := by
  unfold keyUpAt
  split
  · exact .lit
  · split
    · exact .lit
    · split
      · exact .key
      · exact .keyUp
    · exact .lit

/-- The selection a literal makes is one of its arms' results, its
default, or `nil`, each of which the checker can read. -/
theorem selectArm_checkableA {ds : Decls} {x : Data} {d : Option Val} :
    ∀ {arms : List (Val × Val)}, (∀ p r, (p, r) ∈ arms → r.CheckableA) →
      (∀ e, d = some e → e.CheckableA) → (selectArm ds x arms d).CheckableA
  | [], _, hd => by
    simp only [selectArm]
    cases d with
    | none => exact .nil
    | some e => exact hd e rfl
  | (p, r) :: arms, hr, hd => by
    simp only [selectArm]
    split
    · exact hr p r List.mem_cons_self
    · exact selectArm_checkableA (fun p' r' hm => hr p' r' (List.mem_cons_of_mem _ hm)) hd

/-- Making a term's selections keeps it a term the checker can read: a
`match` on a literal is the arm it selects, and one on a key, which no
value settles, stays. -/
theorem Val.lonePref_checkableA {v : Val} (h : v.CheckableA) : v.lonePref.CheckableA := by
  unfold Val.lonePref
  split
  · rename_i r x s
    split
    · cases h with
      | or ha => exact ha r x (by simp)
    · exact h
  · exact h

theorem Val.unwrap_checkableA : ∀ {v : Val}, v.CheckableA → v.unwrap.CheckableA
  | .ride _ v _, .ride h => show v.unwrap.CheckableA from Val.unwrap_checkableA h
  | .pref _ x, .pref h => show x.unwrap.CheckableA from Val.unwrap_checkableA h
  | .integer, h | .float, h | .biginteger, h | .bigdecimal, h | .number, h | .string, h
  | .anyString, h | .boolean, h | .mapKind, h | .listKind, h | .pathKind, h | .lit _, h
  | .addr _, h | .min _, h
  | .max _, h | .above _, h | .beneath _, h | .neq _, h | .mulof _, h | .len _, h
  | .unique _, h | .re _, h | .format _, h | .grammar _, h | .any, h | .absent, h | .nil, h
  | .nothing, h
  | .map _ _ _, h | .list _ _ _, h | .or _, h | .meet _ _, h | .alias _, h | .path _, h | .nof _ _, h
  | .must _ _, h | .when _ _ _, h | .contains _ _, h | .rest _ _, h | .select _ _ _, h
  | .filter _ _, h | .key, h | .keyUp _, h | .call _ _, h | .hole, h => h

theorem Val.operand_checkableA {v : Val} (h : v.CheckableA) : v.operand.CheckableA :=
  Val.unwrap_checkableA (Val.lonePref_checkableA (Val.unwrap_checkableA h))

theorem Val.checkableA_unride {v : Val} (h : v.CheckableA) : v.unride.CheckableA := by
  induction v using Val.unride.induct with
  | case1 k v r ih => cases h with | ride h => exact ih h
  | case2 v h1 => rw [Val.unride.eq_2 v h1]; exact h

/-- What an `Option` `mapM` makes holds what each of its results holds. -/
theorem mapM_some_forall {α β : Type} {f : α → Option β} {P : β → Prop} :
    ∀ {l : List α} {ys : List β}, (∀ x, x ∈ l → ∀ y, f x = some y → P y) →
      l.mapM f = some ys → ∀ y, y ∈ ys → P y
  | [], ys, _, h => by
    simp only [List.mapM_nil] at h
    cases h
    simp
  | x :: l, ys, hf, h => by
    simp only [List.mapM_cons] at h
    cases hx : f x with
    | none => simp [hx] at h
    | some y =>
      cases hl : l.mapM f with
      | none => simp [hx, hl] at h
      | some ys' =>
        simp [hx, hl] at h
        subst h
        intro z hz
        rcases List.mem_cons.mp hz with rfl | hz
        · exact hf x List.mem_cons_self z hx
        · exact mapM_some_forall (fun x' hx' => hf x' (List.mem_cons_of_mem _ hx')) hl z hz

/-- The members a fold reads in a bag the checker can read are ones it
can read. -/
theorem Val.members_checkableA {ds : Decls} :
    ∀ {lifted : Bool} {v : Val} {ms : List Val}, v.CheckableA → v.members ds lifted = some ms →
      ∀ m, m ∈ ms → m.CheckableA
  | _, .ride _ _ _, _, .ride h, hm => Val.members_checkableA h hm
  | _, .list _ _ _, _, .list hi _, hm => by
    simp only [Val.members, Option.some.injEq] at hm
    exact hm ▸ hi
  | _, .map _ _ _, _, .map hf _, hm => by
    simp only [Val.members, Option.some.injEq] at hm
    subst hm
    intro m hm
    obtain ⟨x, hx, hxm⟩ := List.mem_filterMap.mp hm
    split at hxm
    · cases hxm
    · obtain rfl := Option.some.inj hxm
      exact hf x.1 x.2.1 x.2.2 (List.mem_mergeSort.mp hx)
  | _, .integer, _, _, hm | _, .float, _, _, hm | _, .biginteger, _, _, hm
  | _, .bigdecimal, _, _, hm | _, .number, _, _, hm | _, .string, _, _, hm
  | _, .anyString, _, _, hm | _, .boolean, _, _, hm | _, .mapKind, _, _, hm
  | _, .listKind, _, _, hm | _, .pathKind, _, _, hm | _, .lit _, _, _, hm | _, .addr _, _, _, hm
  | _, .min _, _, _, hm | _, .max _, _, _, hm
  | _, .above _, _, _, hm | _, .beneath _, _, _, hm | _, .neq _, _, _, hm
  | _, .mulof _, _, _, hm | _, .len _, _, _, hm | _, .unique _, _, _, hm | _, .re _, _, _, hm
  | _, .format _, _, _, hm | _, .grammar _, _, _, hm | _, .any, _, _, hm | _, .nil, _, _, hm
  | _, .or _, _, _, hm
  | _, .pref _ _, _, _, hm | _, .meet _ _, _, _, hm | _, .alias _, _, _, hm
  | _, .path _, _, _, hm | _, .nof _ _, _, _, hm | _, .must _ _, _, _, hm
  | _, .when _ _ _, _, _, hm | _, .contains _ _, _, _, hm | _, .rest _ _, _, _, hm
  | _, .select _ _ _, _, _, hm | _, .filter _ _, _, _, hm | _, .key, _, _, hm
  | _, .keyUp _, _, _, hm | _, .call _ _, _, _, hm => by simp [Val.members] at hm

/-- The term at a reference into a node the checker can read is one it
can read. -/
theorem Val.fieldAt_checkableA : ∀ (p : List Seg) {v w : Val}, v.CheckableA → v.fieldAt p = some w →
    w.CheckableA
  | [], _, _, hv, h => by
    simp only [Val.fieldAt, Option.some.injEq] at h
    exact h ▸ hv
  | .key k :: p, v, w, hv, h => by
    have hu := Val.checkableA_unride hv
    simp only [Val.fieldAt] at h
    split at h
    · rename_i fs _ _ hm
      rw [hm] at hu
      cases hu with
      | map hf _ =>
        split at h
        · rename_i f hfind
          exact Val.fieldAt_checkableA p (hf f.1 f.2.1 f.2.2 (List.mem_of_find?_eq_some hfind)) h
        · exact absurd h (by simp)
    · exact absurd h (by simp)
  | .idx i :: p, v, w, hv, h => by
    have hu := Val.checkableA_unride hv
    simp only [Val.fieldAt] at h
    split at h
    · rename_i items _ _ hm
      rw [hm] at hu
      cases hu with
      | list hi _ =>
        split at h
        · rename_i x hx
          exact Val.fieldAt_checkableA p (hi x (List.mem_of_getElem? hx)) h
        · exact absurd h (by simp)
    · rename_i fs _ _ hm
      rw [hm] at hu
      cases hu with
      | map hf _ =>
        split at h
        · rename_i f hfind
          exact Val.fieldAt_checkableA p (hf f.1 f.2.1 f.2.2 (List.mem_of_find?_eq_some hfind)) h
        · exact absurd h (by simp)
    · exact absurd h (by simp)
  | .var _ :: _, _, _, _, h => by simp [Val.fieldAt] at h
  | .up _ :: _, _, _, _, h => by simp [Val.fieldAt] at h
  | .node :: _, _, _, _, h => by simp [Val.fieldAt] at h

/-- A path read for a node the checker can read is a term it can read. -/
theorem nodeRef_checkableA {b : Option Val} (hb : ∀ m, b = some m → m.CheckableA) :
    ∀ p, (nodeRef b p).CheckableA
  | .node :: p => by
    cases b with
    | none => exact .path
    | some m =>
      show ((m.fieldAt p).getD (.path (.node :: p))).CheckableA
      cases h : m.fieldAt p with
      | none => exact .path
      | some w => exact Val.fieldAt_checkableA p (hb m rfl) h
  | [] => by exact .path
  | .key _ :: _ => by exact .path
  | .idx _ :: _ => by exact .path
  | .var _ :: _ => by exact .path
  | .up _ :: _ => by exact .path

/-- The meet of fields the checker can read is a term it can read. -/
theorem fieldsMeet_checkableA {fs : List (String × Bool × Val)} {k : String} {v : Val}
    (hf : ∀ k o v, (k, o, v) ∈ fs → v.CheckableA) (h : fieldsMeet fs k = some v) : v.CheckableA := by
  unfold fieldsMeet at h
  split at h
  · exact absurd h (by simp)
  · rename_i f rest hfr
    simp only [Option.some.injEq] at h
    subst h
    have hmem : ∀ g, g ∈ f :: rest → g.2.2.CheckableA := fun g hg => by
      rw [← hfr] at hg
      exact hf g.1 g.2.1 g.2.2 (List.mem_filter.mp hg).1
    have hfold : ∀ (l : List (String × Bool × Val)) (acc : Val), acc.CheckableA →
        (∀ g, g ∈ l → g.2.2.CheckableA) → (l.foldl (fun acc g => .meet acc g.2.2) acc).CheckableA := by
      intro l
      induction l with
      | nil => intro acc ha _; exact ha
      | cons g l ih =>
        intro acc ha hl
        exact ih _ (.meet ha (hl g List.mem_cons_self)) fun g' hg' => hl g' (List.mem_cons_of_mem _ hg')
    exact hfold rest f.2.2 (hmem f List.mem_cons_self) fun g hg => hmem g (List.mem_cons_of_mem _ hg)

/-- A template the checker can read has a body it can read. -/
theorem emitRule_checkableA {t : Val} {r : Val × Val} (ht : t.CheckableA) (h : emitRule t = some r) :
    r.2.CheckableA := by
  unfold emitRule at h
  split at h
  · rename_i fs spread closed
    cases ht with
    | map hf _ =>
      cases hm : fieldsMeet fs "match" with
      | none => simp [hm] at h
      | some mt =>
        cases hb : fieldsMeet fs "body" with
        | none => simp [hm, hb] at h
        | some bd =>
          simp only [hm, hb, Option.some.injEq] at h
          subst h
          exact fieldsMeet_checkableA hf hb
  · exact absurd h (by simp)

/-- The templates of a table the checker can read are terms it can read. -/
theorem emitTable_checkableA {T : Val} (hT : T.CheckableA) : ∀ t, t ∈ emitTable T → t.CheckableA := by
  intro t ht
  cases T with
  | list items spread closed =>
    cases hT with
    | list hi _ => exact hi t ht
  | _ => exact (List.mem_singleton.mp ht) ▸ hT

/-- The pieces an element the checker can read makes are terms it can
read. -/
theorem emitSpliceF_checkableA {ds : Decls} (hd : ∀ d, d ∈ ds → d.2.CheckableA) :
    ∀ (n : ℕ) (e : Val), e.CheckableA → ∀ w, w ∈ emitSpliceF ds n e → w.CheckableA
  | 0, e, he, w, hw => by
    simp only [emitSpliceF, List.mem_cons, List.mem_nil_iff, or_false] at hw
    exact hw ▸ he
  | n + 1, e, he, w, hw => by
    have hn := normaliseD_checkableA hd he
    simp only [emitSpliceF] at hw
    split at hw
    · rename_i heq
      rw [heq] at hn
      cases hn with
      | list hi _ =>
        obtain ⟨x, hx, hwx⟩ := List.mem_flatMap.mp hw
        exact emitSpliceF_checkableA hd n x (hi x hx) w hwx
    · rename_i heq
      rw [heq] at hn
      cases hn with
      | ride hv =>
        cases hv with
        | list hi _ =>
          obtain ⟨x, hx, hwx⟩ := List.mem_flatMap.mp hw
          exact emitSpliceF_checkableA hd n x (hi x hx) w hwx
    · simp only [List.mem_cons, List.mem_nil_iff, or_false] at hw
      exact hw ▸ he

/-- The pieces a body the checker can read makes are terms it can read. -/
theorem emitBody_checkableA {ds : Decls} (hd : ∀ d, d ∈ ds → d.2.CheckableA) {b : Val} {ps : List Val}
    (hb : b.CheckableA) (h : emitBody ds b = some ps) : ∀ w, w ∈ ps → w.CheckableA := by
  cases b with
  | list items spread closed =>
    cases hb with
    | list hi _ =>
      simp only [emitBody] at h
      split at h
      · exact absurd h (by simp)
      split at h
      · exact absurd h (by simp)
      simp only [Option.some.injEq] at h
      subst h
      intro w hw
      obtain ⟨e, he, hwe⟩ := List.mem_flatMap.mp hw
      exact emitSpliceF_checkableA hd _ e (hi e he) w hwe
  | _ => simp [emitBody] at h

/-- The pieces a table the checker can read, its bodies read for a node,
makes of the node are terms it can read. -/
theorem emitPieces_checkableA {ds : Decls} (hd : ∀ d, d ∈ ds → d.2.CheckableA) {m tW tB tM : Val}
    {ps : List Val} (hT : tM.CheckableA) (h : emitPieces ds m tW tB tM = some ps) :
    ∀ w, w ∈ ps → w.CheckableA := by
  unfold emitPieces at h
  split at h
  · rename_i p hp
    split at h
    · cases hr : emitRule p.2.2 with
      | none => rw [hr] at h; exact absurd h (by simp)
      | some r =>
        rw [hr] at h
        simp only [Option.bind] at h
        have hmem := List.of_mem_zip (List.of_mem_zip (List.mem_of_find?_eq_some hp)).2
        exact emitBody_checkableA hd (emitRule_checkableA (emitTable_checkableA hT p.2.2 hmem.2) hr) h
    · exact absurd h (by simp)
  · exact absurd h (by simp)

/-- The members `pack` reads in a bag the checker can read are ones it
can read. -/
theorem Val.keyedMembers_checkableA {ds : Decls} :
    ∀ {lifted : Bool} {v : Val} {ms : List (String × Val)}, v.CheckableA →
      v.keyedMembers ds lifted = some ms → ∀ m, m ∈ ms → m.2.CheckableA
  | _, .ride _ _ _, _, .ride h, hm => Val.keyedMembers_checkableA h hm
  | _, .list _ _ _, _, .list hi _, hm => by
    simp only [Val.keyedMembers] at hm
    intro m hm'
    refine mapM_some_forall (P := fun p : String × Val => p.2.CheckableA)
      (fun x hx y hy => ?_) hm m hm'
    simp only [Option.map_eq_some_iff] at hy
    obtain ⟨_, -, rfl⟩ := hy
    exact hi x hx
  | _, .map _ _ _, _, .map hf _, hm => by
    simp only [Val.keyedMembers, Option.some.injEq] at hm
    subst hm
    intro m hm
    obtain ⟨x, hx, hxm⟩ := List.mem_filterMap.mp hm
    split at hxm
    · cases hxm
    · obtain rfl := Option.some.inj hxm
      exact hf x.1 x.2.1 x.2.2 (List.mem_mergeSort.mp hx)
  | _, .integer, _, _, hm | _, .float, _, _, hm | _, .biginteger, _, _, hm
  | _, .bigdecimal, _, _, hm | _, .number, _, _, hm | _, .string, _, _, hm
  | _, .anyString, _, _, hm | _, .boolean, _, _, hm | _, .mapKind, _, _, hm
  | _, .listKind, _, _, hm | _, .pathKind, _, _, hm | _, .lit _, _, _, hm | _, .addr _, _, _, hm
  | _, .min _, _, _, hm | _, .max _, _, _, hm
  | _, .above _, _, _, hm | _, .beneath _, _, _, hm | _, .neq _, _, _, hm
  | _, .mulof _, _, _, hm | _, .len _, _, _, hm | _, .unique _, _, _, hm | _, .re _, _, _, hm
  | _, .format _, _, _, hm | _, .grammar _, _, _, hm | _, .any, _, _, hm | _, .nil, _, _, hm
  | _, .or _, _, _, hm
  | _, .pref _ _, _, _, hm | _, .meet _ _, _, _, hm | _, .alias _, _, _, hm
  | _, .path _, _, _, hm | _, .nof _ _, _, _, hm | _, .must _ _, _, _, hm
  | _, .when _ _ _, _, _, hm | _, .contains _ _, _, _, hm | _, .rest _ _, _, _, hm
  | _, .select _ _ _, _, _, hm | _, .filter _ _, _, _, hm | _, .key, _, _, hm
  | _, .keyUp _, _, _, hm | _, .call _ _, _, _, hm => by simp [Val.keyedMembers] at hm

/-- Pairs whose values the checker can read keep values it can read when
a repeated key's values are met. -/
theorem mergeKey_checkableA {acc : List (String × Val)} {m : String × Val}
    (ha : ∀ a ∈ acc, a.2.CheckableA) (hm : m.2.CheckableA) : ∀ x ∈ mergeKey acc m, x.2.CheckableA := by
  intro x hx
  unfold mergeKey at hx
  split at hx
  · obtain ⟨a, ha', rfl⟩ := List.mem_map.mp hx
    split
    · exact .meet (ha a ha') hm
    · exact ha a ha'
  · rcases List.mem_append.mp hx with h | h
    · exact ha x h
    · rw [List.mem_singleton.mp h]; exact hm

theorem mergeKeys_checkableA : ∀ {acc ms : List (String × Val)}, (∀ a ∈ acc, a.2.CheckableA) →
    (∀ m ∈ ms, m.2.CheckableA) → ∀ x ∈ mergeKeys acc ms, x.2.CheckableA
  | _, [], ha, _ => ha
  | acc, m :: ms, ha, hm => mergeKeys_checkableA (acc := mergeKey acc m) (ms := ms)
      (mergeKey_checkableA ha (hm m List.mem_cons_self)) (fun m' h => hm m' (List.mem_cons_of_mem _ h))

/-- What a projector reads in a member the checker can read is one it
can read. -/
theorem Val.project?_checkableA {m w : Val} {p : String ⊕ ℤ} (h : m.CheckableA)
    (hp : m.project? p = some w) : w.CheckableA := by
  have hu := Val.checkableA_unride h
  unfold Val.project? at hp
  split at hp
  · rename_i fs _ _ hm
    rw [hm] at hu
    cases hu with
    | map hf _ =>
      obtain ⟨f, hf', rfl⟩ := Option.map_eq_some_iff.mp hp
      exact hf f.1 f.2.1 f.2.2 (List.mem_of_find?_eq_some hf')
  · rename_i items _ _ hm
    rw [hm] at hu
    split at hp
    · split at hp
      · cases hu with
        | list hi _ => exact hi w (List.mem_of_getElem? hp)
      · cases hp
    · cases hp
  · cases hp

theorem pickOf_checkableA {ds : Decls} (hd : ∀ d, d ∈ ds → d.2.CheckableA) {b k v : Val}
    (hb : b.CheckableA) (h : pickOf ds b k = .made v) : v.CheckableA := by
  unfold pickOf at h
  split at h
  · cases h
  · rename_i ms p _ hms _
    split at h
    · rename_i vs hvs
      obtain rfl := (Made.made.injEq _ _).mp h
      refine .list (fun w hw => ?_) (fun _ hs => absurd hs (by simp))
      refine mapM_some_forall (fun m hm w' hw' => ?_) hvs w hw
      obtain ⟨m₀, hm₀, rfl⟩ := List.mem_map.mp hm
      exact Val.project?_checkableA (normaliseD_checkableA hd
        (Val.members_checkableA (normaliseD_checkableA hd hb) hms m₀ hm₀)) hw'
    · cases h
  · cases h

theorem caseOf_checkableA {ds : Decls} {up : Bool} {s v : Val} {start len : Option Val}
    (h : caseOf ds up s start len = .made v) : v.CheckableA := by
  unfold caseOf at h
  split at h
  · obtain rfl := (Made.made.injEq _ _).mp h
    exact .lit
  · split at h
    · simp only [Option.map] at h
      split at h <;> simp at h
      subst h
      exact .lit
    · cases h
  · cases h

theorem translateOf_checkableA {ds : Decls} {s fr v : Val} {to : Option Val}
    (h : translateOf ds s fr to = .made v) : v.CheckableA := by
  unfold translateOf at h
  split at h
  · obtain rfl := (Made.made.injEq _ _).mp h
    exact .lit
  · cases h

theorem escOf_checkableA {ds : Decls} {enc : Bool} {s v : Val} {var : Option Val}
    (h : escOf ds enc s var = .made v) : v.CheckableA := by
  unfold escOf at h
  split at h
  · split at h
    · obtain rfl := (Made.made.injEq _ _).mp h
      exact .lit
    · simp only [Option.map] at h
      split at h <;> simp at h
      subst h
      exact .lit
  · cases h

theorem splitOf_checkableA {ds : Decls} {s sep v : Val}
    (h : splitOf ds s sep = .made v) : v.CheckableA := by
  unfold splitOf at h
  split at h
  all_goals try split at h
  all_goals first
    | (cases h; done)
    | (obtain rfl := (Made.made.injEq _ _).mp h
       refine .list (fun w hw => ?_) (fun _ hs => absurd hs (by simp))
       obtain ⟨_, _, rfl⟩ := List.mem_map.mp hw
       exact .lit)

theorem nomOf_checkableA {ds : Decls} {n v : Val} {a b : Option Val}
    (h : nomOf ds n a b = .made v) : v.CheckableA := by
  unfold nomOf at h
  split at h
  · split at h
    · cases h
      exact .lit
    · cases h
  · split at h
    · rename_i fs hm
      cases h
      refine .map (fun k o w hw => ?_) (fun _ hs => by cases hs)
      exact mapM_some_forall (P := fun y : String × Bool × Val => y.2.2.CheckableA)
        (fun _ _ y hy => by
          unfold nomField at hy
          simp only [Option.map] at hy
          split at hy <;> simp at hy
          subst hy
          exact .lit) hm (k, o, w) hw
    · cases h
  · cases h

theorem cmpNode_checkableA {c : Cmp} {props : Val} {xs : List Val} (hp : props.CheckableA)
    (hx : ∀ x, x ∈ xs → x.CheckableA) : (cmpNode c props xs).CheckableA := by
  refine .map (fun k o w hw => ?_) (fun _ hs => by cases hs)
  simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hw
  rcases hw with ⟨-, -, rfl⟩ | ⟨-, -, rfl⟩ | ⟨-, -, rfl⟩
  · exact .lit
  · exact hp
  · exact .list hx (fun _ hs => by cases hs)

theorem lineNode_checkableA {s : String} : (lineNode s).CheckableA :=
  cmpNode_checkableA
    (.map (fun _ _ w hw => by simp at hw; obtain ⟨-, -, rfl⟩ := hw; exact .lit) (fun _ hs => by cases hs))
    (fun _ hx => by cases hx)

theorem cmpProps?_checkableA {ds : Decls} (hd : ∀ d, d ∈ ds → d.2.CheckableA) {c : Cmp}
    {spec : Option Val} {p : Val} (hs : ∀ s, spec = some s → s.CheckableA)
    (h : cmpProps? ds c spec = some p) : p.CheckableA := by
  unfold cmpProps? at h
  split at h
  · cases h
    exact .map (fun _ _ _ hw => by cases hw) (fun _ hs => by cases hs)
  · rename_i s
    have hn := normaliseD_checkableA hd (hs s rfl)
    split at h
    · simp only [Option.map] at h
      split at h <;> simp at h
      subst h
      exact .map (fun _ _ w hw => by simp at hw; obtain ⟨-, -, rfl⟩ := hw; exact hn)
        (fun _ hs => by cases hs)
    · cases h
      exact hn
    · cases h

theorem cmpKids_checkableA {c : Cmp} : ∀ {n : ℕ} {ks xs : List Val},
    (∀ k, k ∈ ks → k.CheckableA) → cmpKids c n ks = some xs → ∀ x, x ∈ xs → x.CheckableA
  | 0, _, _, _, h => by simp [cmpKids] at h
  | n + 1, ks, xs, hk, h => by
    unfold cmpKids at h
    obtain ⟨yss, hm, rfl⟩ := Option.map_eq_some_iff.mp h
    have hy := mapM_some_forall (P := fun ys : List Val => ∀ x, x ∈ ys → x.CheckableA)
      (fun k hkm ys hys => by
        split at hys
        · rename_i items _ _ hu
          have hl := Val.checkableA_unride (hk k hkm)
          rw [hu] at hl
          cases hl with
          | list hi _ => exact cmpKids_checkableA hi hys
        · split at hys
          · cases hys
            intro x hx
            simp only [List.mem_singleton] at hx
            subst hx
            exact lineNode_checkableA
          · cases hys
        · split at hys
          · cases hys
            intro x hx
            simp only [List.mem_singleton] at hx
            subst hx
            exact hk _ hkm
          · cases hys) hm
    intro x hx
    obtain ⟨ys, hys, hx⟩ := List.mem_flatten.mp hx
    exact hy ys hys x hx

theorem cmpChildren_checkableA {ds : Decls} (hd : ∀ d, d ∈ ds → d.2.CheckableA) {c : Cmp}
    {kids : Option Val} {xs : List Val} (hk : ∀ k, kids = some k → k.CheckableA)
    (h : cmpChildren ds c kids = some xs) : ∀ x, x ∈ xs → x.CheckableA := by
  unfold cmpChildren at h
  split at h
  · cases h
    intro x hx
    cases hx
  · rename_i k
    split at h
    · rename_i items _ _ hu
      have hl := Val.checkableA_unride (normaliseD_checkableA hd (hk k rfl))
      rw [hu] at hl
      cases hl with
      | list hi _ => exact cmpKids_checkableA hi h
    · cases h

theorem cmpOf_checkableA {ds : Decls} (hd : ∀ d, d ∈ ds → d.2.CheckableA) {c : Cmp}
    {spec kids : Option Val} {v : Val} (hs : ∀ s, spec = some s → s.CheckableA)
    (hk : ∀ k, kids = some k → k.CheckableA) (h : cmpOf ds c spec kids = .made v) :
    v.CheckableA := by
  unfold cmpOf at h
  split at h
  · rename_i p xs hp hx
    split at h
    · split at h
      · cases h
        exact cmpNode_checkableA (cmpProps?_checkableA hd hs hp) (cmpChildren_checkableA hd hk hx)
      · cases h
    · cases h
  · cases h

theorem repOf_checkableA {ds : Decls} {s p r v : Val}
    (h : repOf ds s p r = .made v) : v.CheckableA := by
  unfold repOf at h
  split at h
  · split at h
    · simp only [Option.map] at h
      split at h <;> simp at h
      subst h
      exact .lit
    · cases h
  · cases h

theorem sortOf_checkableA {ds : Decls} (hd : ∀ d, d ∈ ds → d.2.CheckableA) {b v : Val}
    {p d : Option Val} (hb : b.CheckableA) (h : sortOf ds b p d = .made v) : v.CheckableA := by
  unfold sortOf at h
  split at h
  · rename_i ms q desc hms _ _
    split at h
    · split at h
      · obtain rfl := (Made.made.injEq _ _).mp h
        refine .list (fun w hw => ?_) (fun _ hs => absurd hs (by simp))
        obtain ⟨⟨kw, mw⟩, hx, rfl⟩ := List.mem_map.mp hw
        obtain ⟨m₀, hm₀, rfl⟩ := List.mem_map.mp (List.of_mem_zip (List.mem_mergeSort.mp hx)).2
        exact normaliseD_checkableA hd
          (Val.members_checkableA (normaliseD_checkableA hd hb) hms m₀ hm₀)
      · cases h
    · cases h
  · cases h

theorem plusOf_checkableA {a b v : Val} (ha : a.CheckableA) (hb : b.CheckableA)
    (h : plusOf a b = .made v) : v.CheckableA := by
  have ha' := Val.operand_checkableA ha
  have hb' := Val.operand_checkableA hb
  unfold plusOf at h
  split at h
  · rename_i xs _ _ ys _ _ hxa hyb
    obtain rfl := (Made.made.injEq _ _).mp h
    rw [hxa] at ha'
    rw [hyb] at hb'
    cases ha' with
    | list hi _ =>
      cases hb' with
      | list hj _ =>
        refine .list (fun w hw => ?_) (fun _ hs => absurd hs (by simp))
        rcases List.mem_append.mp hw with hw | hw
        · exact hi w hw
        · exact hj w hw
  all_goals
    first
    | (obtain rfl := (Made.made.injEq _ _).mp h; exact .lit)
    | (cases h)
    | skip
  all_goals
    simp only [Option.map] at h
    split at h <;> simp at h
    subst h
    exact .lit

/-- A call's outcome, as a term, is one the checker can read where its
arguments are and what it makes is. -/
theorem Made.term_checkableA {ds : Decls} (hd : ∀ d, d ∈ ds → d.2.CheckableA) {f : Fn}
    {args : List Val} (h : ∀ a, a ∈ args → a.CheckableA) {m : Made}
    (hm : ∀ v, m = .made v → v.CheckableA) : (m.term ds f args).CheckableA := by
  cases m with
  | made v => exact hm v rfl
  | refused => exact .nil
  | waits =>
    refine .call fun w hw => ?_
    obtain ⟨a, ha, rfl⟩ := List.mem_map.mp hw
    exact normaliseD_checkableA hd (h a ha)

theorem abnfOf_checkableA {ds : Decls} {g v : Val} (h : abnfOf ds g = .made v) : v.CheckableA := by
  unfold abnfOf at h
  repeat' split at h
  all_goals first
    | (cases h; done)
    | (obtain rfl := (Made.made.injEq _ _).mp h; exact .lit)

theorem parseOf_checkableA {ds : Decls} {g : Val} {w : Option Val} {v : Val}
    (h : parseOf ds g w = .made v) : v.CheckableA := by
  unfold parseOf at h
  repeat' split at h
  all_goals first
    | (cases h; done)
    | (obtain rfl := (Made.made.injEq _ _).mp h; first | exact .grammar | exact Data.term_checkableA _)

theorem bndOf_checkableA {ds : Decls} {b : Bnd} {args : List Val} {v : Val} (h : bndOf ds b args = .made v) :
    v.CheckableA := by
  unfold bndOf at h
  simp only at h
  repeat' split at h
  all_goals first
    | (cases h; done)
    | (obtain rfl := (Made.made.injEq _ _).mp h; constructor)

theorem pathOf_checkableA {ds : Decls} {s v : Val} (h : pathOf ds s = .made v) : v.CheckableA := by
  unfold pathOf at h
  repeat' split at h
  all_goals first
    | (cases h; done)
    | (obtain rfl := (Made.made.injEq _ _).mp h; exact .addr)

theorem joinOf_checkableA {ds : Decls} {b : Val} {sep : Option Val} {v : Val}
    (h : joinOf ds b sep = .made v) : v.CheckableA := by
  unfold joinOf at h
  simp only at h
  repeat' split at h
  all_goals first
    | (cases h; done)
    | (obtain rfl := (Made.made.injEq _ _).mp h; exact .lit)

/-- `split` never waits: it makes its fields or refuses its arguments. -/
theorem splitOf_ne_waits {ds : Decls} {s sep : Val} : splitOf ds s sep ≠ .waits := by
  unfold splitOf
  split <;> (try split) <;> simp

/-- `rep` never waits: it makes its text or refuses its arguments. -/
theorem repOf_ne_waits {ds : Decls} {s p r : Val} : repOf ds s p r ≠ .waits := by
  unfold repOf
  split
  · split
    · cases replaceMatches _ _ _ _ <;> simp
    · simp
  · simp

theorem callTerm_split_checkableA {ds : Decls} {a b : Val} :
    (callTerm ds .split [a, b]).CheckableA := by
  show ((splitOf ds a b).term ds .split [a, b]).CheckableA
  cases h : splitOf ds a b with
  | made v => exact splitOf_checkableA h
  | refused => exact .nil
  | waits => exact absurd h splitOf_ne_waits

theorem callTerm_rep_checkableA {ds : Decls} {a b c : Val} :
    (callTerm ds .rep [a, b, c]).CheckableA := by
  show ((repOf ds a b c).term ds .rep [a, b, c]).CheckableA
  cases h : repOf ds a b c with
  | made v => exact repOf_checkableA h
  | refused => exact .nil
  | waits => exact absurd h repOf_ne_waits

/-- A `split` call read at a position reads to a term the checker can
read whatever its arguments are, a pattern among them, which the checker
cannot read, where neither waits on a reference that names nothing yet,
since `split` itself never waits. -/
theorem resolveD_expandF_split {ds : Decls} {bd : Option Val} {pos : List Step} {a b : Val} (k : ℕ)
    (hp : ∀ j, ∀ x, x ∈ [a, b] → (resolveD ds bd (some pos) (expandF ds j x)).pending ds = false) :
    (resolveD ds bd (some pos) (expandF ds k (.call .split [a, b]))).CheckableA := by
  cases k with
  | zero =>
    have ha := hp 0 a (by simp)
    have hb := hp 0 b (by simp)
    simp only [expandF] at ha hb
    simp only [expandF, resolveD, resolveItems, Option.isNone_some, Bool.false_and, Bool.false_eq_true,
      ite_false, List.any_cons, List.any_nil, ha, hb, Bool.or_false]
    split
    · exact .absent
    · exact callTerm_split_checkableA
  | succ k =>
    have ha := hp k a (by simp)
    have hb := hp k b (by simp)
    simp only [expandF, List.map, resolveD, resolveItems, Option.isNone_some, Bool.false_and,
      Bool.false_eq_true, ite_false, List.any_cons, List.any_nil, ha, hb, Bool.or_false]
    split
    · exact .absent
    · exact callTerm_split_checkableA

/-- A `rep` call read at a position reads to a term the checker can read
whatever its arguments are, where none waits on a reference that names
nothing yet, since `rep` itself never waits. -/
theorem resolveD_expandF_rep {ds : Decls} {bd : Option Val} {pos : List Step} {a b c : Val} (k : ℕ)
    (hp : ∀ j, ∀ x, x ∈ [a, b, c] → (resolveD ds bd (some pos) (expandF ds j x)).pending ds = false) :
    (resolveD ds bd (some pos) (expandF ds k (.call .rep [a, b, c]))).CheckableA := by
  cases k with
  | zero =>
    have ha := hp 0 a (by simp)
    have hb := hp 0 b (by simp)
    have hc := hp 0 c (by simp)
    simp only [expandF] at ha hb hc
    simp only [expandF, resolveD, resolveItems, Option.isNone_some, Bool.false_and, Bool.false_eq_true,
      ite_false, List.any_cons, List.any_nil, ha, hb, hc, Bool.or_false]
    split
    · exact .absent
    · exact callTerm_rep_checkableA
  | succ k =>
    have ha := hp k a (by simp)
    have hb := hp k b (by simp)
    have hc := hp k c (by simp)
    simp only [expandF, List.map, resolveD, resolveItems, Option.isNone_some, Bool.false_and,
      Bool.false_eq_true, ite_false, List.any_cons, List.any_nil, ha, hb, hc, Bool.or_false]
    split
    · exact .absent
    · exact callTerm_rep_checkableA

/-- A call's term is one the checker can read where its arguments are. -/
theorem mem_preferFields :
    ∀ {fs : List (String × Bool × Val)} {k : String} {o : Bool} {w : Val},
      (k, o, w) ∈ preferFields fs → ∃ v, (k, o, v) ∈ fs ∧ w = v.prefer
  | [], _, _, _, h => nomatch h
  | (k', o', v') :: fs, k, o, w, h => by
    simp only [preferFields, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨rfl, rfl, rfl⟩ | h
    · exact ⟨v', List.mem_cons_self, rfl⟩
    · obtain ⟨v, hv, rfl⟩ := mem_preferFields h
      exact ⟨v, List.mem_cons_of_mem _ hv, rfl⟩

theorem mem_preferItems : ∀ {vs : List Val} {w : Val}, w ∈ preferItems vs → ∃ v, v ∈ vs ∧ w = v.prefer
  | [], _, h => nomatch h
  | v :: vs, w, h => by
    simp only [preferItems, List.mem_cons] at h
    rcases h with rfl | h
    · exact ⟨v, List.mem_cons_self, rfl⟩
    · obtain ⟨u, hu, rfl⟩ := mem_preferItems h
      exact ⟨u, List.mem_cons_of_mem _ hu, rfl⟩

theorem mem_preferArms : ∀ {arms : List (ℕ × Val)} {r : ℕ} {x : Val},
    (r, x) ∈ preferArms arms → ∃ r' a, (r', a) ∈ arms ∧ (x = a ∨ x = a.prefer)
  | [], _, _, h => nomatch h
  | (r', a) :: arms, r, x, h => by
    simp only [preferArms, List.mem_cons] at h
    rcases h with h | h
    · split at h
      · exact ⟨r', a, List.mem_cons_self, .inr (Prod.mk.inj h).2⟩
      · exact ⟨r', a, List.mem_cons_self, .inl (Prod.mk.inj h).2⟩
    · obtain ⟨r'', b, hb, hx⟩ := mem_preferArms h
      exact ⟨r'', b, List.mem_cons_of_mem _ hb, hx⟩

theorem Val.prefOf?_checkableA {v x : Val} {s : ℕ} (h : v.CheckableA) (hp : v.prefOf? = some (s, x)) :
    x.CheckableA := by
  cases h <;> simp only [Val.prefOf?, reduceCtorEq, Option.some.injEq, Prod.mk.injEq] at hp
  obtain ⟨-, rfl⟩ := hp
  assumption

/-- `pref` of a term the checker can read is a term it can read. -/
theorem prefer_checkableA {v : Val} (h : v.CheckableA) : v.prefer.CheckableA := by
  induction h with
  | lit => simp only [Val.prefer]; exact .pref .lit
  | addr => simp only [Val.prefer]; exact .pref .addr
  | pref h _ => simp only [Val.prefer]; exact .pref h
  | @map fs spread closed _ hs ihf _ =>
    simp only [Val.prefer]
    refine .map (fun k o w hw => ?_) hs
    obtain ⟨v, hv, rfl⟩ := mem_preferFields hw
    exact ihf k o v hv
  | @list items spread closed _ hs ihi _ =>
    simp only [Val.prefer]
    refine .list (fun w hw => ?_) hs
    obtain ⟨v, hv, rfl⟩ := mem_preferItems hw
    exact ihi v hv
  | @or arms ha iha =>
    simp only [Val.prefer]
    refine .or fun r w hw => ?_
    obtain ⟨r', a, hm, hx | hx⟩ := mem_preferArms hw
    · rw [hx]; exact ha r' a hm
    · rw [hx]; exact iha r' a hm
  | meet _ _ iha ihb => simp only [Val.prefer]; exact .meet iha ihb
  | ride h ih =>
    simp only [Val.prefer]
    split
    · exact .pref (.ride h)
    · split
      · rename_i s x hp
        exact .pref (.ride (Val.prefOf?_checkableA h hp))
      · exact .ride ih
  | path =>
    simp only [Val.prefer]
    refine .call fun a ha => ?_
    simp only [List.mem_cons, List.mem_nil_iff, or_false] at ha
    rw [ha]; exact .path
  | call hargs _ =>
    simp only [Val.prefer]
    refine .call fun a ha => ?_
    simp only [List.mem_cons, List.mem_nil_iff, or_false] at ha
    rw [ha]; exact .call hargs
  | len h _ => simp only [Val.prefer]; exact .len h
  | nof hn hcs _ _ => simp only [Val.prefer]; exact .nof hn hcs
  | must h _ => simp only [Val.prefer]; exact .must h
  | when hc ht he _ _ _ => simp only [Val.prefer]; exact .when hc ht he
  | contains hc hn _ _ => simp only [Val.prefer]; exact .contains hc hn
  | rest ht h1 h2 h3 _ _ _ _ => simp only [Val.prefer]; exact .rest ht h1 h2 h3
  | selectKey hp hr hd _ _ _ => simp only [Val.prefer]; exact .selectKey hp hr hd
  | selectLit hp hr hd _ _ _ => simp only [Val.prefer]; exact .selectLit hp hr hd
  | _ => simp only [Val.prefer]; constructor


theorem mem_unsealFields :
    ∀ {fs : List (String × Bool × Val)} {k : String} {o : Bool} {w : Val},
      (k, o, w) ∈ unsealFields fs → ∃ v, (k, o, v) ∈ fs ∧ w = v.unseal
  | [], _, _, _, h => nomatch h
  | (k', o', v') :: fs, k, o, w, h => by
    simp only [unsealFields, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨rfl, rfl, rfl⟩ | h
    · exact ⟨v', List.mem_cons_self, rfl⟩
    · obtain ⟨v, hv, rfl⟩ := mem_unsealFields h
      exact ⟨v, List.mem_cons_of_mem _ hv, rfl⟩

theorem mem_unsealItems : ∀ {vs : List Val} {w : Val}, w ∈ unsealItems vs → ∃ v, v ∈ vs ∧ w = v.unseal
  | [], _, h => nomatch h
  | v :: vs, w, h => by
    simp only [unsealItems, List.mem_cons] at h
    rcases h with rfl | h
    · exact ⟨v, List.mem_cons_self, rfl⟩
    · obtain ⟨u, hu, rfl⟩ := mem_unsealItems h
      exact ⟨u, List.mem_cons_of_mem _ hu, rfl⟩

theorem mem_unsealArms : ∀ {arms : List (ℕ × Val)} {r : ℕ} {x : Val},
    (r, x) ∈ unsealArms arms → ∃ a, (r, a) ∈ arms ∧ x = a.unseal
  | [], _, _, h => nomatch h
  | (r', a) :: arms, r, x, h => by
    simp only [unsealArms, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨rfl, rfl⟩ | h
    · exact ⟨a, List.mem_cons_self, rfl⟩
    · obtain ⟨b, hb, rfl⟩ := mem_unsealArms h
      exact ⟨b, List.mem_cons_of_mem _ hb, rfl⟩

/-- Unsealing a term the checker can read gives a term it can read. -/
theorem Val.CheckableA.unseal {v : Val} (h : v.CheckableA) : v.unseal.CheckableA := by
  induction h with
  | @map fs spread closed _ hs ihf _ =>
    simp only [Val.unseal]
    refine .map (fun k o w hw => ?_) hs
    obtain ⟨v, hv, rfl⟩ := mem_unsealFields hw
    exact ihf k o v hv
  | @list items spread closed _ hs ihi _ =>
    simp only [Val.unseal]
    refine .list (fun w hw => ?_) hs
    obtain ⟨v, hv, rfl⟩ := mem_unsealItems hw
    exact ihi v hv
  | @or arms _ iha =>
    simp only [Val.unseal]
    refine .or fun r w hw => ?_
    obtain ⟨a, hm, rfl⟩ := mem_unsealArms hw
    exact iha r a hm
  | pref _ ih => simp only [Val.unseal]; exact .pref ih
  | meet _ _ iha ihb => simp only [Val.unseal]; exact .meet iha ihb
  | ride _ ih => simp only [Val.unseal]; exact .ride ih
  | call hargs _ => simp only [Val.unseal]; exact .call hargs
  | len h _ => simp only [Val.unseal]; exact .len h
  | nof hn hcs _ _ => simp only [Val.unseal]; exact .nof hn hcs
  | must h _ => simp only [Val.unseal]; exact .must h
  | when hc ht he _ _ _ => simp only [Val.unseal]; exact .when hc ht he
  | contains hc hn _ _ => simp only [Val.unseal]; exact .contains hc hn
  | rest ht h1 h2 h3 _ _ _ _ => simp only [Val.unseal]; exact .rest ht h1 h2 h3
  | selectKey hp hr hd _ _ _ => simp only [Val.unseal]; exact .selectKey hp hr hd
  | selectLit hp hr hd _ _ _ => simp only [Val.unseal]; exact .selectLit hp hr hd
  | _ => simp only [Val.unseal]; constructor

theorem callTerm_checkableA {ds : Decls} (hd : ∀ d, d ∈ ds → d.2.CheckableA) {f : Fn}
    {args : List Val} (h : ∀ a, a ∈ args → a.CheckableA) : (callTerm ds f args).CheckableA := by
  unfold callTerm
  split
  · rename_i a b
    have ha' := normaliseD_checkableA (ds := ds) hd (Val.operand_checkableA (h a (by simp)))
    have hb' := normaliseD_checkableA (ds := ds) hd (Val.operand_checkableA (h b (by simp)))
    exact Made.term_checkableA hd h fun v hv => plusOf_checkableA ha' hb' hv
  · exact Made.term_checkableA hd h fun v hv => joinOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => joinOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => pickOf_checkableA hd (h _ (by simp)) hv
  · exact Made.term_checkableA hd h fun v hv => sortOf_checkableA hd (h _ (by simp)) hv
  · exact Made.term_checkableA hd h fun v hv => sortOf_checkableA hd (h _ (by simp)) hv
  · exact Made.term_checkableA hd h fun v hv => sortOf_checkableA hd (h _ (by simp)) hv
  · exact Made.term_checkableA hd h fun v hv => caseOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => caseOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => caseOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => caseOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => caseOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => caseOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => translateOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => translateOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => escOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => escOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => escOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => escOf_checkableA hv
  · exact (h _ (by simp)).super
  · exact prefer_checkableA (h _ (by simp))
  · exact prefer_checkableA (h _ (by simp))
  · exact (normaliseD_checkableA (ds := ds) hd (h _ (by simp))).unmark.unseal
  · exact .pathKind
  · exact .pathKind
  · exact .alias
  · exact .alias
  · exact Made.term_checkableA hd h fun v hv => splitOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => repOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => nomOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => nomOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => nomOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => pathOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => abnfOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => parseOf_checkableA hv
  · exact Made.term_checkableA hd h fun v hv => parseOf_checkableA hv
  · split
    · exact Made.term_checkableA hd h fun v hv => cmpOf_checkableA hd
        (fun s hs => h s (List.mem_of_mem_head? hs))
        (fun k hk => h k (List.mem_of_mem_drop (List.mem_of_mem_head? hk))) hv
    · exact .call h
  · exact Made.term_checkableA hd h fun v hv => bndOf_checkableA hv
  · split
    · exact .lit
    · exact .call h

theorem mem_fillTopArms {ds : Decls} {w : Val} :
    ∀ {arms : List (ℕ × Val)} {r : ℕ} {x : Val},
      (r, x) ∈ fillTopArms ds w arms → ∃ a, (r, a) ∈ arms ∧ x = fillTop ds w a
  | [], _, _, h => nomatch h
  | (r', a) :: arms, r, x, h => by
    simp only [fillTopArms, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨rfl, rfl⟩ | h
    · exact ⟨a, List.mem_cons_self, rfl⟩
    · obtain ⟨b, hb, rfl⟩ := mem_fillTopArms h
      exact ⟨b, List.mem_cons_of_mem _ hb, rfl⟩

/-- The top of `maybe`'s argument with its missing references read as a
term the checker can read is a term it can read. -/
theorem fillTop_checkableA {ds : Decls} {w : Val} (hw : w.CheckableA) {v : Val} (h : v.CheckableA) :
    (fillTop ds w v).CheckableA := by
  induction h with
  | alias =>
    unfold fillTop
    split
    · exact hw
    · exact .alias
  | meet _ _ iha ihb => simp only [fillTop]; exact .meet iha ihb
  | or _ ih =>
    simp only [fillTop]
    refine .or fun r x hx => ?_
    obtain ⟨a, ha, rfl⟩ := mem_fillTopArms hx
    exact ih r a ha
  | ride _ ih => simp only [fillTop]; exact .ride ih
  | _ => simp only [fillTop]; constructor <;> assumption

/-- What `maybe` makes of a term the checker can read is one it can read. -/
theorem maybeOf_checkableA {ds : Decls} {v : Val} (h : v.CheckableA) : (maybeOf ds v).CheckableA := by
  unfold maybeOf
  split
  · exact .call fun a ha => by
      simp only [List.mem_singleton] at ha
      exact ha ▸ h
  · split
    · split
      · exact .absent
      · exact fillTop_checkableA .nil h
    · exact h

theorem resolveD_checkableA {ds : Decls} (hd : ∀ d, d ∈ ds → d.2.CheckableA) {v : Val}
    (h : v.CheckableA) : ∀ {b : Option Val} {here : Option (List Step)}, (∀ m, b = some m → m.CheckableA) →
      (resolveD ds b here v).CheckableA := by
  induction h with
  | len _ ih =>
    intro b here hb; simp only [resolveD]; split
    · exact .nothing
    split
    · exact .nil
    · exact .len (ih hb)
  | @map fs spread closed _ _ ihf ihs =>
    intro b here hb
    simp only [resolveD]
    refine .map (fun k o w hw => ?_) (fun s hs' => ?_)
    · obtain ⟨v, hv, rfl⟩ := mem_resolveFields hw
      exact ihf k o v hv hb
    · obtain ⟨s, hs, rfl⟩ := resolveSpread_some hs'
      exact ihs s hs fun _ h => nomatch h
  | @list items spread closed _ _ ihi ihs =>
    intro b here hb
    simp only [resolveD]
    split
    · exact .nil
    refine .list (fun w hw => ?_) (fun s hs' => ?_)
    · obtain ⟨v, hv, i, rfl⟩ := mem_resolveElems (List.mem_filter.mp hw).1
      exact ihi v hv hb
    · obtain ⟨s, hs, rfl⟩ := resolveSpread_some hs'
      exact ihs s hs fun _ h => nomatch h
  | or _ ih =>
    intro b here hb
    simp only [resolveD]
    refine .or fun r w hw => ?_
    obtain ⟨a, ha, rfl⟩ := mem_resolveArms hw
    exact ih r a ha hb
  | pref _ ih => intro b here hb; simp only [resolveD]; exact .pref (ih hb)
  | ride _ ih => intro b here hb; simp only [resolveD]; exact .ride (ih hb)
  | meet _ _ iha ihb => intro b here hb; simp only [resolveD]; exact .meet (iha hb) (ihb hb)
  | nof _ _ ihn ihcs =>
    intro b here hb
    simp only [resolveD]
    split
    · exact .nil
    refine .nof (ihn hb) fun c hc => ?_
    obtain ⟨c₀, hc₀, rfl⟩ := mem_resolveItems hc
    exact ihcs c₀ hc₀ hb
  | must _ ih =>
    intro b here hb; simp only [resolveD]; split
    · exact .nil
    · exact .must (ih hb)
  | when _ _ _ ihc iht ihe =>
    intro b here hb
    simp only [resolveD]
    refine .when (ihc hb) (iht hb) fun e he => ?_
    obtain ⟨e₀, he₀, rfl⟩ := resolveSpread_some he
    exact ihe e₀ he₀ hb
  | contains _ _ ihc ihn =>
    intro b here hb; simp only [resolveD]; split
    · exact .nil
    · exact .contains (ihc hb) (ihn hb)
  | rest _ _ _ _ iht ih1 ih2 ih3 =>
    intro b here hb
    simp only [resolveD]
    refine .rest (iht hb) (fun c hc v hv => ?_) (fun c hc v hv => ?_) (fun c hc v hv => ?_)
    · obtain ⟨c₀, hc₀, h1, -, -⟩ := mem_resolveCovers hc
      rw [h1] at hv
      obtain ⟨w, hw, rfl⟩ := resolveSpread_some hv
      exact ih1 c₀ hc₀ w hw hb
    · obtain ⟨c₀, hc₀, -, h2, -⟩ := mem_resolveCovers hc
      rw [h2] at hv
      obtain ⟨w, hw, rfl⟩ := resolveSpread_some hv
      exact ih2 c₀ hc₀ w hw hb
    · obtain ⟨c₀, hc₀, -, -, h3⟩ := mem_resolveCovers hc
      rw [h3] at hv
      obtain ⟨w, hw, rfl⟩ := resolveSpread_some hv
      exact ih3 c₀ hc₀ w hw hb
  | @selectKey arms d _ _ _ ihp ihr ihd =>
    intro b here hb
    simp only [resolveD]
    show (match genD ds .key with
      | some x => if callPairs (resolvePairs ds b here arms) || here.isNone && keyPairs (resolvePairs ds b here arms)
          then Val.select .key (resolvePairs ds b here arms)
          (resolveSpread ds b here d) else selectArm ds x (resolvePairs ds b here arms) (resolveSpread ds b here d)
      | none => if (normaliseD ds .key).isAbsent then .absent else if (normaliseD ds .key).dead then .nil
          else .select .key (resolvePairs ds b here arms) (resolveSpread ds b here d)).CheckableA
    have hg : genD ds .key = none := rfl
    rw [hg]
    dsimp only
    split
    · exact .absent
    split
    · exact .nil
    refine .selectKey (fun p r hm => ?_) (fun p r hm => ?_) (fun e he => ?_)
    · obtain ⟨p₀, r₀, hm₀, rfl, -⟩ := mem_resolvePairs hm
      exact ihp p₀ r₀ hm₀ hb
    · obtain ⟨p₀, r₀, hm₀, -, rfl⟩ := mem_resolvePairs hm
      exact ihr p₀ r₀ hm₀ hb
    · obtain ⟨e₀, he₀, rfl⟩ := resolveSpread_some he
      exact ihd e₀ he₀ hb
  | @selectLit sc arms d _ _ _ ihp ihr ihd =>
    intro b here hb
    simp only [resolveD]
    show (match genD ds (.lit sc) with
      | some x => if callPairs (resolvePairs ds b here arms) || here.isNone && keyPairs (resolvePairs ds b here arms)
          then Val.select (.lit sc) (resolvePairs ds b here arms)
          (resolveSpread ds b here d) else selectArm ds x (resolvePairs ds b here arms) (resolveSpread ds b here d)
      | none => if (normaliseD ds (.lit sc)).isAbsent then .absent else if (normaliseD ds (.lit sc)).dead then .nil
          else .select (.lit sc) (resolvePairs ds b here arms) (resolveSpread ds b here d)).CheckableA
    have hg : genD ds (.lit sc) = some sc.data := rfl
    rw [hg]
    dsimp only
    split
    · refine .selectLit (fun p r hm => ?_) (fun p r hm => ?_) (fun e he => ?_)
      · obtain ⟨p₀, r₀, hm₀, rfl, -⟩ := mem_resolvePairs hm
        exact ihp p₀ r₀ hm₀ hb
      · obtain ⟨p₀, r₀, hm₀, -, rfl⟩ := mem_resolvePairs hm
        exact ihr p₀ r₀ hm₀ hb
      · obtain ⟨e₀, he₀, rfl⟩ := resolveSpread_some he
        exact ihd e₀ he₀ hb
    · refine selectArm_checkableA (fun p r hm => ?_) (fun e he => ?_)
      · obtain ⟨p₀, r₀, hm₀, -, rfl⟩ := mem_resolvePairs hm
        exact ihr p₀ r₀ hm₀ hb
      · obtain ⟨e₀, he₀, rfl⟩ := resolveSpread_some he
        exact ihd e₀ he₀ hb
  | @call f args hargs ih =>
    intro b here hb
    rw [resolveD.eq_def]
    dsimp only
    split
    · rename_i d t
      split
      · refine .call fun a ha => ?_
        simp only [List.mem_cons, List.mem_nil_iff, or_false] at ha
        rcases ha with h | h
        · rw [h]; exact ih d (by simp) hb
        · rw [h]; exact hargs t (by simp)
      split
      · rename_i ms hms
        refine .list (fun w hw => ?_) (fun _ hs => by cases hs)
        obtain ⟨m, hm, rfl⟩ := List.mem_map.mp (List.mem_filter.mp hw).1
        have hn := normaliseD_checkableA hd (ih d (by simp) (here := here) hb)
        have hmc : m.1.CheckableA := Val.members_checkableA hn hms _ (List.fst_mem_of_mem_zipIdx hm)
        exact ih t (by simp) (b := some m.1) fun m' hm' => by
          obtain rfl := Option.some.inj hm'
          exact hmc
      · split
        · exact .absent
        split
        · refine .call fun a ha => ?_
          simp only [List.mem_cons, List.mem_nil_iff, or_false] at ha
          rcases ha with h | h
          · rw [h]; exact ih d (by simp) hb
          · rw [h]; exact hargs t (by simp)
        · exact .nil
    · rename_i d t
      split
      · refine .call fun a ha => ?_
        simp only [List.mem_cons, List.mem_nil_iff, or_false] at ha
        rcases ha with h | h
        · rw [h]; exact ih d (by simp) hb
        · rw [h]; exact hargs t (by simp)
      split
      · rename_i ms hms
        refine .map (fun k o w hw => ?_) (fun _ hs => by cases hs)
        obtain ⟨m, hm, hmw⟩ := List.mem_map.mp hw
        simp only [Prod.mk.injEq] at hmw
        obtain ⟨-, -, rfl⟩ := hmw
        have hn := normaliseD_checkableA hd (ih d (by simp) (here := here) hb)
        refine mergeKeys_checkableA (fun _ h => absurd h List.not_mem_nil) (fun p hp => ?_) m hm
        obtain ⟨m', hm', rfl⟩ := List.mem_map.mp hp
        have hmc : m'.2.CheckableA := Val.keyedMembers_checkableA hn hms m' hm'
        exact ih t (by simp) (b := some m'.2) fun m'' hm'' => by
          obtain rfl := Option.some.inj hm''
          exact hmc
      · split
        · exact .absent
        split
        · refine .call fun a ha => ?_
          simp only [List.mem_cons, List.mem_nil_iff, or_false] at ha
          rcases ha with h | h
          · rw [h]; exact ih d (by simp) hb
          · rw [h]; exact hargs t (by simp)
        · exact .nil
    · rename_i v
      exact maybeOf_checkableA (ih v (by simp) hb)
    · refine .call fun a ha => ?_
      obtain ⟨a₀, ha₀, rfl⟩ := mem_resolveItems ha
      exact ih a₀ ha₀ hb
    · rename_i s t
      have hcall : (Val.call .emit [resolveD ds b here s, t]).CheckableA := by
        refine .call fun a ha => ?_
        simp only [List.mem_cons, List.mem_nil_iff, or_false] at ha
        rcases ha with h | h
        · rw [h]; exact ih s (by simp) hb
        · rw [h]; exact hargs t (by simp)
      split
      · exact hcall
      split
      · exact hcall
      split
      · rename_i ms hms
        have hn := normaliseD_checkableA hd (ih s (by simp) (here := here) hb)
        split
        · refine .list (fun w hw => ?_) (fun _ hs => by cases hs)
          obtain ⟨ps, hps, hw⟩ := List.mem_flatten.mp hw
          obtain ⟨o, ho, hop⟩ := List.mem_filterMap.mp hps
          obtain ⟨m, hm, rfl⟩ := List.mem_map.mp ho
          have hmc : m.CheckableA := Val.members_checkableA hn hms m hm
          have hT := ih t (by simp) (b := some m) (here := none) fun m' hm' => by
            obtain rfl := Option.some.inj hm'
            exact hmc
          exact emitPieces_checkableA hd hT hop w hw
        · exact hcall
      · split
        · exact .absent
        · exact hcall
    · split
      · refine .call fun a ha => ?_
        obtain ⟨a₀, ha₀, rfl⟩ := mem_resolveItems ha
        exact ih a₀ ha₀ hb
      split
      · exact .absent
      split
      · refine .call fun a ha => ?_
        obtain ⟨a₀, ha₀, rfl⟩ := mem_resolveItems ha
        exact ih a₀ ha₀ hb
      · refine callTerm_checkableA hd fun a ha => ?_
        obtain ⟨a₀, ha₀, rfl⟩ := mem_resolveItems ha
        exact ih a₀ ha₀ hb
  | hole =>
    intro b here hb
    simp only [resolveD]
    cases b with
    | none => exact .hole
    | some m => exact hb m rfl
  | keyUp =>
    intro b here hb
    simp only [resolveD]
    cases here with
    | none => exact .keyUp
    | some pos => exact keyUpAt_checkableA pos _
  | @path p => intro b here hb; simp only [resolveD]; exact nodeRef_checkableA hb p
  | _ => intro b here hb; simp only [resolveD]; constructor

/-- A document whose schema the checker can read reads as its expansion. -/
theorem readR_checkableA {ds : Decls} {S : Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hS : S.CheckableA) :
    (ds.readR S).CheckableA := by
  unfold Decls.readR
  exact resolveD_checkableA hb (filled_checkableA (expand_checkableA hb hS)) fun _ h => nomatch h

/-- A document read against data reads to a term the checker can read
wherever the document alone does. -/
theorem readJ_checkableA {ds : Decls} {S : Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : (ds.readR S).CheckableA) (j : Data) : (ds.readJ S j).CheckableA :=
  resolveD_checkableA hb (meetFilled_checkableA hS (Data.term_checkableA j)) fun _ h => nomatch h

/-- A document whose schema the checker can read reads, with its keys as
written, as a term it can read too. -/
theorem readU_checkableA {ds : Decls} {S : Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hS : S.CheckableA) :
    (ds.readU S).CheckableA := by
  unfold Decls.readU
  exact resolveD_checkableA hb (filled_checkableA (expand_checkableA hb hS)) fun _ h => nomatch h

/-- The first pattern the scrutinee's value satisfies selects its result. -/
theorem selectArm_first {ds : Decls} {x : Data} {p r : Val} {arms : List (Val × Val)} {d : Option Val}
    (h : checkR ds p x = true) : selectArm ds x ((p, r) :: arms) d = r := by
  simp [selectArm, h]

/-- A pattern the value does not satisfy is passed over. -/
theorem selectArm_next {ds : Decls} {x : Data} {p r : Val} {arms : List (Val × Val)} {d : Option Val}
    (h : checkR ds p x = false) : selectArm ds x ((p, r) :: arms) d = selectArm ds x arms d := by
  simp [selectArm, h]

/-- The default answers where no pattern is satisfied, and where there is
none the selection is `nil`: an error, not an empty answer. -/
theorem selectArm_default {ds : Decls} {x : Data} {d : Option Val} : selectArm ds x [] d = d.getD .nil := rfl

/-- A `filter` read at a position over a list keeps the elements its
condition admits, in their order, the condition read for each element
it tries, at the index the element takes among those kept. -/
theorem resolveD_filter_list {ds : Decls} {b : Option Val} {pos : List Step} {s c : Val}
    {xs : List Data} (h : genD ds (resolveD ds b (some pos) s) = some (.list xs)) :
    resolveD ds b (some pos) (.filter s c) =
      (Data.list (keptAt (fun i x =>
        checkR ds (resolveD ds (some x.term) (stepped (some pos) (.seg (.idx i))) c) x) 0 xs)).term := by
  simp [resolveD, h]

/-- A `filter` read at a position over a scalar, which has no members, is
`nil`: an error. -/
theorem resolveD_filter_scalar {ds : Decls} {b : Option Val} {pos : List Step} {s c : Val}
    {x : Scalar} (h : genD ds (resolveD ds b (some pos) s) = some x.data) :
    resolveD ds b (some pos) (.filter s c) = .nil := by
  cases x <;> simp [resolveD, h, Scalar.data]

/-! ## The folds

`sum` of an empty bag is the integer zero, and an empty bag has no
least member and no greatest. `least` answers a member no other is
below, and `greatest` one no other is above, by exact value. -/

theorem Number.sum_nil : Number.sum [] = some (.integer ⟨0, by decide⟩) := rfl

theorem Number.least_nil : Number.least [] = none := rfl

theorem Number.greatest_nil : Number.greatest [] = none := rfl

theorem Number.not_lt_iff {a b : Number} : ¬ a.lt b ↔ b.le a := Int.not_lt

theorem foldl_least_mem : ∀ (xs : List Number) (acc : Number),
    xs.foldl (fun acc y => if y.lt acc then y else acc) acc = acc ∨
      xs.foldl (fun acc y => if y.lt acc then y else acc) acc ∈ xs
  | [], _ => .inl rfl
  | y :: ys, acc => by
    simp only [List.foldl_cons]
    rcases foldl_least_mem ys (if y.lt acc then y else acc) with h | h
    · rw [h]; split
      · exact .inr List.mem_cons_self
      · exact .inl rfl
    · exact .inr (List.mem_cons_of_mem y h)

theorem foldl_least_le : ∀ (xs : List Number) (acc : Number),
    (xs.foldl (fun acc y => if y.lt acc then y else acc) acc).le acc ∧
      ∀ z ∈ xs, (xs.foldl (fun acc y => if y.lt acc then y else acc) acc).le z
  | [], acc => ⟨Int.le_refl _, fun _ h => absurd h List.not_mem_nil⟩
  | y :: ys, acc => by
    simp only [List.foldl_cons]
    obtain ⟨h₁, h₂⟩ := foldl_least_le ys (if y.lt acc then y else acc)
    by_cases hy : y.lt acc
    · simp only [hy, ↓reduceIte] at h₁ h₂ ⊢
      refine ⟨Number.le_trans h₁ (Number.le_of_lt hy), fun z hz => ?_⟩
      rcases List.mem_cons.mp hz with rfl | hz
      · exact h₁
      · exact h₂ z hz
    · simp only [hy, ↓reduceIte] at h₁ h₂ ⊢
      refine ⟨h₁, fun z hz => ?_⟩
      rcases List.mem_cons.mp hz with rfl | hz
      · exact Number.le_trans h₁ (Number.not_lt_iff.mp hy)
      · exact h₂ z hz

theorem foldl_greatest_mem : ∀ (xs : List Number) (acc : Number),
    xs.foldl (fun acc y => if acc.lt y then y else acc) acc = acc ∨
      xs.foldl (fun acc y => if acc.lt y then y else acc) acc ∈ xs
  | [], _ => .inl rfl
  | y :: ys, acc => by
    simp only [List.foldl_cons]
    rcases foldl_greatest_mem ys (if acc.lt y then y else acc) with h | h
    · rw [h]; split
      · exact .inr List.mem_cons_self
      · exact .inl rfl
    · exact .inr (List.mem_cons_of_mem y h)

theorem foldl_greatest_ge : ∀ (xs : List Number) (acc : Number),
    acc.le (xs.foldl (fun acc y => if acc.lt y then y else acc) acc) ∧
      ∀ z ∈ xs, z.le (xs.foldl (fun acc y => if acc.lt y then y else acc) acc)
  | [], acc => ⟨Int.le_refl _, fun _ h => absurd h List.not_mem_nil⟩
  | y :: ys, acc => by
    simp only [List.foldl_cons]
    obtain ⟨h₁, h₂⟩ := foldl_greatest_ge ys (if acc.lt y then y else acc)
    by_cases hy : acc.lt y
    · simp only [hy, ↓reduceIte] at h₁ h₂ ⊢
      refine ⟨Number.le_trans (Number.le_of_lt hy) h₁, fun z hz => ?_⟩
      rcases List.mem_cons.mp hz with rfl | hz
      · exact h₁
      · exact h₂ z hz
    · simp only [hy, ↓reduceIte] at h₁ h₂ ⊢
      refine ⟨h₁, fun z hz => ?_⟩
      rcases List.mem_cons.mp hz with rfl | hz
      · exact Number.le_trans (Number.not_lt_iff.mp hy) h₁
      · exact h₂ z hz

/-- `least` answers one of the members. -/
theorem Number.least_mem {xs : List Number} {x : Number} (h : Number.least xs = some x) : x ∈ xs := by
  cases xs with
  | nil => exact absurd h (by simp [Number.least])
  | cons y ys =>
    simp only [Number.least, Option.some.injEq] at h
    subst h
    rcases foldl_least_mem ys y with h | h
    · rw [h]; exact List.mem_cons_self
    · exact List.mem_cons_of_mem y h

/-- No member is below what `least` answers. -/
theorem Number.least_lowest {xs : List Number} {x y : Number} (h : Number.least xs = some x)
    (hy : y ∈ xs) : ¬ y.lt x := by
  cases xs with
  | nil => exact absurd hy List.not_mem_nil
  | cons z zs =>
    simp only [Number.least, Option.some.injEq] at h
    subst h
    obtain ⟨h₁, h₂⟩ := foldl_least_le zs z
    apply Number.not_lt_iff.mpr
    rcases List.mem_cons.mp hy with rfl | hy
    · exact h₁
    · exact h₂ y hy

/-- `greatest` answers one of the members. -/
theorem Number.greatest_mem {xs : List Number} {x : Number} (h : Number.greatest xs = some x) :
    x ∈ xs := by
  cases xs with
  | nil => exact absurd h (by simp [Number.greatest])
  | cons y ys =>
    simp only [Number.greatest, Option.some.injEq] at h
    subst h
    rcases foldl_greatest_mem ys y with h | h
    · rw [h]; exact List.mem_cons_self
    · exact List.mem_cons_of_mem y h

/-- No member is above what `greatest` answers. -/
theorem Number.greatest_highest {xs : List Number} {x y : Number} (h : Number.greatest xs = some x)
    (hy : y ∈ xs) : ¬ x.lt y := by
  cases xs with
  | nil => exact absurd hy List.not_mem_nil
  | cons z zs =>
    simp only [Number.greatest, Option.some.injEq] at h
    subst h
    obtain ⟨h₁, h₂⟩ := foldl_greatest_ge zs z
    apply Number.not_lt_iff.mpr
    rcases List.mem_cons.mp hy with rfl | hy
    · exact h₁
    · exact h₂ y hy

/-! ## Ill-formed terms -/

/-- Whether the arms the rank rule picks single out two different
values: a preference clash, where a positive rank is picked. -/
def clash (arms : List (ℕ × Val)) : Bool :=
  match pickRank arms with
  | none => false
  | some _ =>
    match (arms.filter (picked arms)).filterMap fun p => gen p.2 with
    | [] => false
    | x :: rest => rest.any fun y => decide (y ≠ x)

/-- The terms a meet is written of, in order. -/
def Val.conjuncts : Val → List Val
  | .meet a b => a.conjuncts ++ b.conjuncts
  | v => [v]

/-- The members a container literal generates: each position of a list,
each required key of a map, and each optional key whose value generates
something but an empty map or list, as the reference's `len` counts what
generates. -/
def Val.genCount : Val → Option ℕ
  | .list items _ _ => some items.length
  | .map fs _ _ => some (fs.countP fun f => !f.2.1 || (gen f.2.2).any fun x => !x.emptyBag)
  | _ => none

mutual
/-- A size with its lower ends dropped and an exact size read as its
upper end: the half the meet decides against a literal's count, since
members only accumulate. -/
def Val.upperHalf : Val → Val
  | .min _ | .above _ => .any
  | .lit (.num x) => .max (.num x)
  | .meet a b => .meet a.upperHalf b.upperHalf
  | .or arms => .or (upperArms arms)
  | v => v

def upperArms : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: arms => (r, a.upperHalf) :: upperArms arms
end

/-- Whether a term is a map or a list, through its riders: a member the
meet counts whatever it holds, as both ports count a container. -/
def Val.bagLike : Val → Bool
  | .map _ _ _ | .list _ _ _ => true
  | .ride _ v _ => v.bagLike
  | _ => false

/-- The members a container literal holds where the meet reads it, as
both ports read them there: each position of a list and each key of a
map but a marked one, and an optional key only where its value
generates something but an empty map or list, each read under the
declarations `ds`. None where a member it requires is no container and
generates nothing yet, whose reading waits for it. -/
def Val.meetMembers (ds : Decls) : Val → Option (List Val)
  | .list items _ _ =>
    (items.filter fun v => !v.marked).mapM fun v => if v.bagLike || (genD ds v).isSome then some v else none
  | .map fs _ _ =>
    ((fs.filter fun f => !f.2.2.marked && (!f.2.1 || (genD ds f.2.2).any fun x => !x.emptyBag)).map
      (·.2.2)).mapM fun v => if v.bagLike || (genD ds v).isSome then some v else none
  | _ => none

/-- Whether two of the members are written alike (`Val.beq`). -/
def dupAlike : List Val → Bool
  | [] => false
  | x :: xs => xs.any x.beq || dupAlike xs

/-- A map's member at the key `k`, through its riders. -/
def Val.keyVal (k : String) : Val → Option Val
  | .map fs _ _ => (fs.find? (·.1 == k)).map (·.2.2)
  | .ride _ v _ => v.keyVal k
  | _ => none

/-- Whether an atom refuses, where the meet reads them, the members of a
container literal: a size whose upper half refuses their count,
`unique()` where two are written alike, `unique("k")` where one is no
map holding `k` or two hold it alike, and `contains(c, n)` where `n`'s
upper half refuses the count of those that generate a value `c` admits,
each read under the declarations `ds`, so that a name `c` holds reads
as its body. -/
def Val.refusesAtMeet (ds : Decls) (ms : List Val) : Val → Bool
  | .len c => if h : IntegerLeaf ms.length then !checkR ds c.upperHalf (.num (.integer ⟨ms.length, h⟩)) else false
  | .unique none => dupAlike ms
  | .unique (some k) => ms.any (fun m => (m.keyVal k).isNone) || dupAlike (ms.filterMap (·.keyVal k))
  | .contains c n =>
    if h : IntegerLeaf (ms.countP fun m => (genD ds m).any (checkR ds c)) then
      !checkR ds n.upperHalf (.num (.integer ⟨ms.countP fun m => (genD ds m).any (checkR ds c), h⟩))
    else false
  | _ => false

/-- Whether the conjuncts of a meet hold an atom that refuses the members
of their container literals, met, where the meet reads them
(`Val.meetMembers`), as both ports refuse at the meet: a literal too
long for its size (decision 9 of the design note's §7), two members
alike under `unique`, and more members than `contains` counts. A literal
short of its size is tried at generation, after the fills. -/
def meetClash (ds : Decls) (cs : List Val) : Bool :=
  match ((cs.filter fun v => v.genCount.isSome).foldl meet .any).meetMembers ds with
  | none => false
  | some ms => cs.any (·.refusesAtMeet ds ms)

/-- Whether two arms are written alike: the same literal, the same
numeric kind or the same bound, which both ports read as one arm, so
that `1 | 1` and `min(1) | min(1)` are each one size. -/
def Val.sameArm : Val → Val → Bool
  | .lit a, .lit b => decide (a = b)
  | .integer, .integer | .float, .float | .biginteger, .biginteger | .bigdecimal, .bigdecimal
  | .number, .number => true
  | .min a, .min b | .max a, .max b | .above a, .above b | .beneath a, .beneath b => decide (a = b)
  | .neq a, .neq b => decide (a = b)
  | .mulof a, .mulof b => decide (a = b)
  | _, _ => false

/-- Whether a term in normal form still holds a choice: a disjunction
whose arms aren't one arm of rank `0` written alike, or a preference,
through `&` and the riders. -/
def Val.choiceLeft : Val → Bool
  | .or ((0, a) :: arms) => arms.any fun p => p.1 != 0 || !a.sameArm p.2
  | .or _ => true
  | .pref _ _ => true
  | .meet a b => a.choiceLeft || b.choiceLeft
  | .ride _ v _ => v.choiceLeft
  | _ => false

/-- Whether a size, the argument of `len`, holds a choice once in normal
form: `len` takes a conjunction of integers, bounds, exclusions and
multiples, as both ports read it, so that `len(1 | 3)`, `len(*1)` and
`len(type(1 | 3))` are ill-formed, and a choice the meet or a dead arm
settles to one arm, `len(1 & (1 | 3))` or `len(1 | (1 & 2))`, is that
arm's size (decision 16 of the design note's §7). -/
def Val.sizeIll (c : Val) : Bool := (normalise c).choiceLeft

/-- Whether a term is the hole itself. -/
def Val.isHole : Val → Bool
  | .hole => true
  | _ => false

mutual
/-- Whether a term in normal form does not stand: a `nil` anywhere but
in a spread, which the engines read only against a member, a
preference clash, a size that holds a disjunction or a preference, a call the reading
could not make, or two sides met that both wait on a hole, one of them
more than the hole, which neither fills, as `upper(_) & _`. A call
that waits on a hole stands, for the data to fill, where it has as
many arguments as its function takes (`Fn.takes`), a generator read by
its data alone, since its template is read at each member, a `+` that waits
where its operands do, and a `pref` where its argument does. The
verdict reads it of a term staged (`Val.staged`), so that a conflict
the meet finds is a `nil`. -/
def Val.illFormed : Val → Bool
  | .nil => true
  | .len c => c.sizeIll
  | .map fs _ _ => illFields fs
  | .list items _ _ => illItems items
  | .or arms => clash arms || illArms arms
  | .pref _ x => x.illFormed
  | .meet a b => (a.fillable && b.fillable && !(a.isHole && b.isHole)) || a.illFormed || b.illFormed
  | .ride _ v _ => v.illFormed
  | .call .plus args => args.length != 2 || illItems args
  | .call .join args => (args.length != 1 && args.length != 2) || illItems args
  | .call .pref args => args.length != 1 || illItems args
  | .call .each args | .call .pack args | .call .emit args =>
    if fillableHead args && args.length == 2 then illHead args else true
  | .call f args => if (Val.call f args).fillable && f.takes args.length then illItems args else true
  | .select _ arms _ => illPats arms
  | _ => false

def illFields : List (String × Bool × Val) → Bool
  | [] => false
  | (_, _, v) :: fs => v.illFormed || illFields fs

def illItems : List Val → Bool
  | [] => false
  | v :: vs => v.illFormed || illItems vs

def illHead : List Val → Bool
  | [] => false
  | d :: _ => d.illFormed

def illArms : List (ℕ × Val) → Bool
  | [] => false
  | (_, a) :: arms => a.illFormed || illArms arms

def illPats : List (Val × Val) → Bool
  | [] => false
  | (p, _) :: ps => p.illFormed || illPats ps
end

mutual
/-- A term in normal form with each meet whose conjuncts clash
(`meetClash`) read as `nil`, and each arm so read dropped (`mkOr`), as
is each arm that does not stand (`Val.illFormed`): the conflicts both
ports find at the meet, an arm's the arm's alone, and a member's its
container's, and an arm that does not stand the arm's alone too, as
both ports drop it. An arm is read with the arms it stands for
flattened in (`flattenArm`), so that a preference clash between them
stays the disjunction's. -/
def Val.staged (ds : Decls) : Val → Val
  | .meet a b => if meetClash ds (a.conjuncts ++ b.conjuncts) then .nil else .meet (a.staged ds) (b.staged ds)
  | .map fs spread closed => .map (stagedFields ds fs) spread closed
  | .list items spread closed => .list (stagedItems ds items) spread closed
  | .or arms => mkOr (((stagedArms ds arms).flatMap flattenArm).filter fun p => !p.2.illFormed)
  | .pref r x => .pref r (x.staged ds)
  | .ride k v r => .ride k (v.staged ds) r
  | v => v

def stagedFields (ds : Decls) : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.staged ds) :: stagedFields ds fs

def stagedItems (ds : Decls) : List Val → List Val
  | [] => []
  | v :: vs => v.staged ds :: stagedItems ds vs

def stagedArms (ds : Decls) : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: arms => (r, a.staged ds) :: stagedArms ds arms
end

theorem mem_stagedFields {ds : Decls} {fs : List (String × Bool × Val)} {k : String} {o : Bool} {w : Val}
    (h : (k, o, w) ∈ stagedFields ds fs) : ∃ v, (k, o, v) ∈ fs ∧ w = v.staged ds := by
  induction fs with
  | nil => simp [stagedFields] at h
  | cons f fs ih =>
    obtain ⟨k', o', v'⟩ := f
    simp only [stagedFields, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨rfl, rfl, rfl⟩ | h
    · exact ⟨v', .head _, rfl⟩
    · obtain ⟨v, hv, rfl⟩ := ih h
      exact ⟨v, .tail _ hv, rfl⟩

theorem mem_stagedItems {ds : Decls} {items : List Val} {w : Val} (h : w ∈ stagedItems ds items) :
    ∃ v, v ∈ items ∧ w = v.staged ds := by
  induction items with
  | nil => simp [stagedItems] at h
  | cons v vs ih =>
    simp only [stagedItems, List.mem_cons] at h
    rcases h with rfl | h
    · exact ⟨v, .head _, rfl⟩
    · obtain ⟨u, hu, rfl⟩ := ih h
      exact ⟨u, .tail _ hu, rfl⟩

theorem mem_stagedArms {ds : Decls} {arms : List (ℕ × Val)} {p : ℕ × Val} (h : p ∈ stagedArms ds arms) :
    ∃ a, (p.1, a) ∈ arms ∧ p.2 = a.staged ds := by
  induction arms with
  | nil => simp [stagedArms] at h
  | cons q arms ih =>
    obtain ⟨r, a⟩ := q
    simp only [stagedArms, List.mem_cons] at h
    rcases h with rfl | h
    · exact ⟨a, .head _, rfl⟩
    · obtain ⟨b, hb, he⟩ := ih h
      exact ⟨b, .tail _ hb, he⟩

/-- Staging keeps a term the checker reads one it reads. -/
theorem staged_checkableA {ds : Decls} {v : Val} (h : v.CheckableA) : (v.staged ds).CheckableA := by
  induction h with
  | meet _ _ iha ihb =>
    simp only [Val.staged]
    split
    · exact .nil
    · exact .meet iha ihb
  | @map fs spread closed _ hs ihf _ =>
    simp only [Val.staged]
    refine .map (fun k o w hw => ?_) hs
    obtain ⟨v, hv, rfl⟩ := mem_stagedFields hw
    exact ihf k o v hv
  | @list items spread closed _ hs ihi _ =>
    simp only [Val.staged]
    refine .list (fun w hw => ?_) hs
    obtain ⟨v, hv, rfl⟩ := mem_stagedItems hw
    exact ihi v hv
  | @or arms _ ih =>
    simp only [Val.staged]
    refine mkOr_checkableA fun p hp => ?_
    obtain ⟨q, hq, hpq⟩ := List.mem_flatMap.mp (List.mem_filter.mp hp).1
    obtain ⟨a, ha, he⟩ := mem_stagedArms hq
    have hq' : q.2.CheckableA := by rw [he]; exact ih q.1 a ha
    exact flattenArm_checkableA hq' p hpq
  | pref _ ih => simp only [Val.staged]; exact .pref ih
  | ride _ ih => simp only [Val.staged]; exact .ride ih
  | _ => simp only [Val.staged]; constructor <;> assumption

mutual
/-- Whether a term holds an `ident()`, at any depth. -/
def Val.idents : Val → Bool
  | .ride .ident _ _ => true
  | .ride _ v _ => v.idents
  | .len c => c.idents
  | .map fs spread _ => identsFields fs || identsSpread spread
  | .list items spread _ => identsItems items || identsSpread spread
  | .or arms => identsArms arms
  | .pref _ x => x.idents
  | .meet a b => a.idents || b.idents
  | .nof n cs => n.idents || identsItems cs
  | .must c _ => c.idents
  | .when c t e => c.idents || t.idents || identsSpread e
  | .contains c n => c.idents || n.idents
  | .rest t cs => t.idents || identsCovers cs
  | .select s arms d => s.idents || identsPairs arms || identsSpread d
  | .filter s c => s.idents || c.idents
  | .call _ args => identsItems args
  | _ => false

def identsPairs : List (Val × Val) → Bool
  | [] => false
  | (p, r) :: ps => p.idents || r.idents || identsPairs ps

def identsCovers : List Cover → Bool
  | [] => false
  | (c, k, m) :: cs => identsSpread c || identsSpread k || identsSpread m || identsCovers cs

def identsFields : List (String × Bool × Val) → Bool
  | [] => false
  | (_, _, v) :: fs => v.idents || identsFields fs

def identsItems : List Val → Bool
  | [] => false
  | v :: vs => v.idents || identsItems vs

def identsSpread : Option Val → Bool
  | none => false
  | some s => s.idents

def identsArms : List (ℕ × Val) → Bool
  | [] => false
  | (_, a) :: arms => a.idents || identsArms arms
end

/-- Whether an `ident()` stands where none may: anywhere in the
document's term, or in a declaration's body but at its top or on a term
of its top meet (`Val.unident`). The place is the text's, so a
declaration no reference reads is held to it as well, as both ports
refuse it with `ident_place` (decision 14 of the design note's §7). -/
def Decls.identMisplaced (ds : Decls) (S : Val) : Bool :=
  S.idents || ds.any fun d => d.2.unident.idents

mutual
/-- A term with each part that waits for a place read as what any place
could make of it: a hole as `any`, a `key(n)` as any string, since a
key is text wherever it lands, and a call or a trial that holds either,
or a name `w` reads as waiting, as `any`. A name itself stays, so that
it reads its own body so read, what that body fixes kept. Such a call
reads as `nil` instead where it takes another count of arguments
(`Fn.takes`), or where an argument both ports read as written doesn't
stand by `ill`: any of a call's but the template of an `each` or a
`pack` and an `emit`'s table, a size, the count of `nof` and
`contains`, the condition of `must`, and the scrutinee or source of
`match` and `filter`. -/
def Val.unplaced (w : String → Bool) (ill : Val → Bool) : Val → Val
  | .hole => .any
  | .keyUp _ => .anyString
  | .map fs spread closed => .map (unplacedFields w ill fs) spread closed
  | .list items spread closed => .list (unplacedItems w ill items) spread closed
  | .meet a b => .meet (a.unplaced w ill) (b.unplaced w ill)
  | .or arms => .or (unplacedArms w ill arms)
  | .pref r x => .pref r (x.unplaced w ill)
  | .ride k v r => .ride k (v.unplaced w ill) r
  | .call f args =>
    if !(Val.call f args).waits w then .call f args
    else if !f.takes args.length || (match f with
      | .each | .pack | .emit => headIll w ill args
      | _ => argsIll w ill args) then .nil else .any
  | .len c => if !c.waits w then .len c else if ill (c.unplaced w ill) then .nil else .any
  | .must c m => if !c.waits w then .must c m else if ill (c.unplaced w ill) then .nil else .any
  | .nof n cs =>
    if !(Val.nof n cs).waits w then .nof n cs else if ill (n.unplaced w ill) then .nil else .any
  | .contains c n =>
    if !(Val.contains c n).waits w then .contains c n else if ill (n.unplaced w ill) then .nil else .any
  | .select s arms d =>
    if !(Val.select s arms d).waits w then .select s arms d
    else if ill (s.unplaced w ill) then .nil else .any
  | .filter s c =>
    if !(Val.filter s c).waits w then .filter s c else if ill (s.unplaced w ill) then .nil else .any
  | .alias n => .alias n
  | v => if v.waits w then .any else v

def unplacedFields (w : String → Bool) (ill : Val → Bool) :
    List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.unplaced w ill) :: unplacedFields w ill fs

def unplacedItems (w : String → Bool) (ill : Val → Bool) : List Val → List Val
  | [] => []
  | v :: vs => v.unplaced w ill :: unplacedItems w ill vs

def unplacedArms (w : String → Bool) (ill : Val → Bool) : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: arms => (r, a.unplaced w ill) :: unplacedArms w ill arms

def argsIll (w : String → Bool) (ill : Val → Bool) : List Val → Bool
  | [] => false
  | v :: vs => ill (v.unplaced w ill) || argsIll w ill vs

def headIll (w : String → Bool) (ill : Val → Bool) : List Val → Bool
  | [] => false
  | v :: _ => ill (v.unplaced w ill)
end

/-- The names whose bodies wait for the place a use gives them, a body
that names one of them waiting too, read to a fixed point: each round
adds the names whose bodies wait given the names found so far. -/
def Decls.waitNames (ds : Decls) : List String :=
  (List.range ds.length).foldl
    (fun ws _ => (ds.filter fun d => d.2.waits fun n => ws.contains n).map (·.1)) []

/-- Whether a declaration's body does not stand, read where no place is
yet (`Decls.readU`), as the name and as the body itself, so that a dead
or ill-formed body makes the document an error whether or not anything
reads it, a recursive one among them, as both ports answer (decision 17
of the design note's §7). Each body is read with the parts that wait
for the use that places them, a hole or a `key(n)`, read as what any
place could make of them (`Val.unplaced`), and so is a name whose body
waits (`Decls.waitNames`), so that what stands beside them is read. A
waiting call is `nil` where it takes another count of arguments or an
argument it reads as written doesn't stand, read against the bodies
with each waiting part so read (`d0`). A name a source publishes is
read where a destructure takes it, so not here. -/
def Decls.bodyIll (ds : Decls) : Bool :=
  let ws := ds.waitNames
  let w : String → Bool := fun n => ws.contains n
  let d0 : Decls := ds.map fun d => (d.1, d.2.unplaced w fun _ => false)
  let ill : Val → Bool := fun t => ((normaliseD d0 (d0.readU t)).staged d0).illFormed
  let du : Decls := ds.map fun d => (d.1, d.2.unplaced w ill)
  du.any fun d => d.1.toList.head? != some '!' &&
    (((normaliseD du (du.readU (.alias d.1))).staged du).illFormed || ((normaliseD du (du.readU d.2)).staged du).illFormed)

/-- Whether a document does not stand: an `ident()` out of its place, a
declaration's body that does not stand, or the schema, read, with a
normal form that does not stand. -/
def Decls.illFormedR (ds : Decls) (S : Val) : Bool :=
  ds.identMisplaced S || ds.bodyIll || ((normaliseD ds (ds.readR S)).staged ds).illFormed

/-! ## The value a document gives with its trials unread

Both ports try a container when no member can still arrive, so a trial
or a size refuses a container at generation, after the fills, where a
scalar it refuses at the meet. The definition reads that moment as the
value the normal form would single out with every trial and size unread
on a map or a list, and asks whether the normal form, read whole,
refuses it. A trial or a size still reads a leaf, so an address it
refuses leaves nothing to single out, which reads `incomplete`
(decision 23 of the design note's §7). -/

/-- What reads a leaf and leaves a map or a list unread: any map, any
list, or what `v` admits. -/
def Val.onLeaves (v : Val) : Val := .or [(0, .mapKind), (0, .listKind), (0, v)]

mutual
/-- A term with its trials and sizes unread on a map or a list: each
`contains`, `rest` and `unique`, a selection and a `filter` as `any`,
and each `len`, `nof`, `must` and `when` read on a leaf alone. -/
def Val.untried : Val → Val
  | .contains _ _ | .rest _ _ | .select _ _ _ | .filter _ _ | .unique _ => .any
  | .len c => (Val.len c).onLeaves
  | .nof n cs => (Val.nof n cs).onLeaves
  | .must c m => (Val.must c m).onLeaves
  | .when c y n => (Val.when c y n).onLeaves
  | .map fs spread closed => .map (untriedFields fs) (untriedSpread spread) closed
  | .list items spread closed => .list (untriedItems items) (untriedSpread spread) closed
  | .or arms => .or (untriedArms arms)
  | .pref r x => .pref r x.untried
  | .meet a b => .meet a.untried b.untried
  | .ride k v r => .ride k v.untried r
  | v => v

def untriedFields : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.untried) :: untriedFields fs

def untriedItems : List Val → List Val
  | [] => []
  | v :: vs => v.untried :: untriedItems vs

def untriedSpread : Option Val → Option Val
  | none => none
  | some s => some s.untried

def untriedArms : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: as => (r, a.untried) :: untriedArms as
end

theorem mem_untriedFields {fs : List (String × Bool × Val)} {k : String} {o : Bool} {w : Val} :
    (k, o, w) ∈ untriedFields fs ↔ ∃ v, (k, o, v) ∈ fs ∧ w = v.untried := by
  induction fs with
  | nil => simp [untriedFields]
  | cons f fs ih =>
    obtain ⟨k', o', v'⟩ := f
    simp only [untriedFields, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl, rfl⟩ | ⟨v, hm, rfl⟩)
      · exact ⟨v', Or.inl ⟨rfl, rfl, rfl⟩, rfl⟩
      · exact ⟨v, Or.inr hm, rfl⟩
    · rintro ⟨v, ⟨rfl, rfl, rfl⟩ | hm, rfl⟩
      · exact Or.inl ⟨rfl, rfl, rfl⟩
      · exact Or.inr ⟨v, hm, rfl⟩

theorem mem_untriedItems {items : List Val} {w : Val} :
    w ∈ untriedItems items ↔ ∃ v, v ∈ items ∧ w = v.untried := by
  induction items with
  | nil => simp [untriedItems]
  | cons v vs ih =>
    simp only [untriedItems, List.mem_cons, ih]
    constructor
    · rintro (rfl | ⟨v', hm, rfl⟩)
      · exact ⟨v, Or.inl rfl, rfl⟩
      · exact ⟨v', Or.inr hm, rfl⟩
    · rintro ⟨v', rfl | hm, rfl⟩
      · exact Or.inl rfl
      · exact Or.inr ⟨v', hm, rfl⟩

theorem untriedSpread_eq {spread : Option Val} {t : Val} :
    untriedSpread spread = some t ↔ ∃ s, spread = some s ∧ t = s.untried := by
  cases spread <;> simp [untriedSpread, eq_comm]

theorem mem_untriedArms {arms : List (ℕ × Val)} {r : ℕ} {b : Val} :
    (r, b) ∈ untriedArms arms ↔ ∃ a, (r, a) ∈ arms ∧ b = a.untried := by
  induction arms with
  | nil => simp [untriedArms]
  | cons p arms ih =>
    obtain ⟨r', a'⟩ := p
    simp only [untriedArms, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl⟩ | ⟨a, hm, rfl⟩)
      · exact ⟨a', Or.inl ⟨rfl, rfl⟩, rfl⟩
      · exact ⟨a, Or.inr hm, rfl⟩
    · rintro ⟨a, ⟨rfl, rfl⟩ | hm, rfl⟩
      · exact Or.inl ⟨rfl, rfl⟩
      · exact Or.inr ⟨a, hm, rfl⟩

/-- A term the checker can read stays one with its trials unread. -/
theorem onLeaves_checkableA {v : Val} (h : v.CheckableA) : v.onLeaves.CheckableA := by
  refine .or fun r b hm => ?_
  simp only [List.mem_cons, Prod.mk.injEq, List.mem_nil_iff, or_false] at hm
  rcases hm with ⟨-, rfl⟩ | ⟨-, rfl⟩ | ⟨-, rfl⟩
  · exact .mapKind
  · exact .listKind
  · exact h

theorem untried_checkableA {v : Val} (h : v.CheckableA) : v.untried.CheckableA := by
  induction h with
  | unique | contains _ _ _ _ | rest _ _ _ _ _ _ _ _ => exact .any
  | len hc _ => exact onLeaves_checkableA (.len hc)
  | nof hn hcs _ _ => exact onLeaves_checkableA (.nof hn hcs)
  | must hc _ => exact onLeaves_checkableA (.must hc)
  | when hc ht he _ _ _ => exact onLeaves_checkableA (.when hc ht he)
  | @map fs spread closed _ _ ihf ihs =>
    refine .map ?_ ?_
    · intro k o w hm
      obtain ⟨v, hv, rfl⟩ := mem_untriedFields.mp hm
      exact ihf k o v hv
    · intro t ht
      obtain ⟨s, hs, rfl⟩ := untriedSpread_eq.mp ht
      exact ihs s hs
  | @list items spread closed _ _ ihi ihs =>
    refine .list ?_ ?_
    · intro w hm
      obtain ⟨v, hv, rfl⟩ := mem_untriedItems.mp hm
      exact ihi v hv
    · intro t ht
      obtain ⟨s, hs, rfl⟩ := untriedSpread_eq.mp ht
      exact ihs s hs
  | @or arms _ ih =>
    refine .or fun r b hm => ?_
    obtain ⟨a, ha, rfl⟩ := mem_untriedArms.mp hm
    exact ih r a ha
  | pref _ ih => exact .pref ih
  | meet _ _ iha ihb => exact .meet iha ihb
  | ride _ ih => exact .ride ih
  | call h _ => simp only [Val.untried]; exact .call h
  | _ => simp only [Val.untried]; constructor

/-- A refusal at generation: with its trials and sizes unread, the term
singles out a value that it, read whole, refuses. -/
def RefusedAt (ds : Decls) (root : Data) (v : Val) : Prop :=
  ∃ c, Gen ds.envE root v.untried c ∧ Refuses ds.envE root v c

/-- Whether a term refuses the value it gives with its trials unread,
computed. -/
def refusedAt (ds : Decls) (v : Val) : Bool :=
  match genD ds v.untried with
  | some c => !checkR ds v c
  | none => false

theorem refusedAt_iff {ds : Decls} {root : Data} (hg : ds.Guarded) (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    {v : Val} (hv : v.CheckableA) : refusedAt ds v = true ↔ RefusedAt ds root v := by
  have hgen : ∀ c, genD ds v.untried = some c ↔ Gen ds.envE root v.untried c :=
    fun c => genWith_iff (untried_checkableA hv) (fun _ j hw _ => checkR_iff hg hb hw j) c
  unfold refusedAt
  constructor
  · intro h
    split at h
    · rename_i c hc
      exact ⟨c, (hgen c).mp hc, (checkR_iff hg hb hv c).mp (by simpa using h)⟩
    · exact nomatch h
  · rintro ⟨c, hc, hr⟩
    rw [(hgen c).mpr hc]
    simp only
    rw [(checkR_iff hg hb hv c).mpr hr]
    rfl

/-! ## Waiting parts read as `any` -/

mutual
/-- The term with each part that waits on a hole read as `any`, as the
check without the fill reads it: the data fills the hole, so the part
admits what it takes. -/
def Val.waitAny : Val → Val
  | .map fs sp c => .map (waitFields fs) (waitSpread sp) c
  | .list xs sp c => .list (waitItems xs) (waitSpread sp) c
  | .meet a b => .meet a.waitAny b.waitAny
  | .ride k v r => .ride k v.waitAny r
  | .or arms => .or (waitArms arms)
  | .select s arms d => .select s arms (waitSpread d)
  | v => if v.fillable then .any else v

def waitFields : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.waitAny) :: waitFields fs

def waitItems : List Val → List Val
  | [] => []
  | v :: vs => v.waitAny :: waitItems vs

def waitSpread : Option Val → Option Val
  | none => none
  | some s => some s.waitAny

def waitArms : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: as => (r, a.waitAny) :: waitArms as
end

theorem mem_waitFields : ∀ {fs : List (String × Bool × Val)} {k : String} {o : Bool} {w : Val},
    (k, o, w) ∈ waitFields fs → ∃ v, (k, o, v) ∈ fs ∧ w = v.waitAny
  | [], _, _, _, h => nomatch h
  | (k', o', v') :: fs, k, o, w, h => by
    simp only [waitFields, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨rfl, rfl, rfl⟩ | h
    · exact ⟨v', List.mem_cons_self, rfl⟩
    · obtain ⟨v, hv, rfl⟩ := mem_waitFields h
      exact ⟨v, List.mem_cons_of_mem _ hv, rfl⟩

theorem mem_waitItems : ∀ {vs : List Val} {w : Val}, w ∈ waitItems vs → ∃ v, v ∈ vs ∧ w = v.waitAny
  | [], _, h => nomatch h
  | v :: vs, w, h => by
    simp only [waitItems, List.mem_cons] at h
    rcases h with rfl | h
    · exact ⟨v, List.mem_cons_self, rfl⟩
    · obtain ⟨u, hu, rfl⟩ := mem_waitItems h
      exact ⟨u, List.mem_cons_of_mem _ hu, rfl⟩

theorem waitSpread_some : ∀ {sp : Option Val} {t : Val}, waitSpread sp = some t → ∃ s, sp = some s ∧ t = s.waitAny
  | none, _, h => nomatch h
  | some s, _, h => ⟨s, rfl, (Option.some.inj h).symm⟩

theorem mem_waitArms : ∀ {arms : List (ℕ × Val)} {r : ℕ} {a : Val},
    (r, a) ∈ waitArms arms → ∃ b, (r, b) ∈ arms ∧ a = b.waitAny
  | [], _, _, h => nomatch h
  | (r', b') :: arms, r, a, h => by
    simp only [waitArms, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨rfl, rfl⟩ | h
    · exact ⟨b', List.mem_cons_self, rfl⟩
    · obtain ⟨b, hb, rfl⟩ := mem_waitArms h
      exact ⟨b, List.mem_cons_of_mem _ hb, rfl⟩

/-- Reading the waiting parts as `any` leaves a term the checker can read. -/
theorem waitAny_checkableA {v : Val} (h : v.CheckableA) : v.waitAny.CheckableA := by
  induction h with
  | @map fs sp c _ _ ihf ihs =>
    refine .map (fun k o w hm => ?_) (fun t ht => ?_)
    · obtain ⟨v, hv, rfl⟩ := mem_waitFields hm
      exact ihf k o v hv
    · obtain ⟨s, hs, rfl⟩ := waitSpread_some ht
      exact ihs s hs
  | @list xs sp c _ _ ihx ihs =>
    refine .list (fun w hm => ?_) (fun t ht => ?_)
    · obtain ⟨v, hv, rfl⟩ := mem_waitItems hm
      exact ihx v hv
    · obtain ⟨s, hs, rfl⟩ := waitSpread_some ht
      exact ihs s hs
  | meet _ _ iha ihb => exact .meet iha ihb
  | ride _ ih => exact .ride ih
  | @or arms _ ih =>
    refine .or fun r a hm => ?_
    obtain ⟨b, hb, rfl⟩ := mem_waitArms hm
    exact ih r b hb
  | @selectKey arms d hp hr _ _ _ ihd =>
    refine .selectKey hp hr fun e he => ?_
    obtain ⟨s, hs, rfl⟩ := waitSpread_some he
    exact ihd s hs
  | @selectLit sc arms d hp hr _ _ _ ihd =>
    refine .selectLit hp hr fun e he => ?_
    obtain ⟨s, hs, rfl⟩ := waitSpread_some he
    exact ihd s hs
  | _ =>
    simp only [Val.waitAny]
    split
    · exact .any
    · constructor <;> assumption

/-! ## The verdict -/

/-- Whether the schema read against the data fails: dead, or holding a
call the reading could not make, where the data's value lies outside
the call's domain, as `add(_, 1)` against `"a"`, which the data's own
refusal is. -/
def Val.fails (v : Val) : Bool := v.dead || v.illFormed

instance (ds : Decls) (S : Val) : Decidable (ds.Declares S) := decidable_of_iff _ Decls.declaresB_iff

instance (ds : Decls) : Decidable ds.Guarded := decidable_of_iff _ Decls.guardedB_iff

/-- The verdict `vet` gives the data `j` against the schema `S` under
the declarations `ds` and the mode `m`, the schema read as its
expansion with its selections made: `error` where the document refers to a name it does not
declare, where its names break the alias-cycle rule, where an
`ident()` stands out of its place, or where the schema's normal form,
staged, does not stand; `invalid` where the schema read against the data
(`Decls.readJ`), the data filling each hole the schema leaves unfilled,
staged (`Val.staged`) so that a conflict the meet finds is `nil` and an
arm holding one drops, fails, dead or holding a call the data leaves it
unable to make (`Val.fails`), or refuses, read whole, the value it gives
with its trials and sizes unread; `valid` where it singles out a
value, and without the fill where the data as written is an instance of
the visible part of the schema's normal form, staged, each part that
waits on a hole read as `any`, too, or where `--partial` lets the
unresolved pass; and `incomplete` otherwise. -/
def Vet (m : Mode) (ds : Decls) (S : Val) (j : Data) : Verdict → Prop
  | .error => ¬ ds.Declares S ∨ ¬ ds.Guarded ∨ ds.illFormedR S = true
  | .invalid =>
    ds.Declares S ∧ ds.Guarded ∧ ds.illFormedR S = false ∧
      (((normaliseD ds (ds.readJ S j)).staged ds).fails = true ∨
        RefusedAt ds j ((normaliseD ds (ds.readJ S j)).staged ds))
  | .valid =>
    ds.Declares S ∧ ds.Guarded ∧ ds.illFormedR S = false ∧
      ((normaliseD ds (ds.readJ S j)).staged ds).fails = false ∧
      ¬ RefusedAt ds j ((normaliseD ds (ds.readJ S j)).staged ds) ∧
      (m.lax = true ∨
        ∃ j', Gen ds.envE j ((normaliseD ds (ds.readJ S j)).staged ds).visible j' ∧
          (m.fill = true ∨ Admits ds.envE j ((normaliseD ds (ds.readR S)).staged ds).visible.waitAny j))
  | .incomplete =>
    ds.Declares S ∧ ds.Guarded ∧ ds.illFormedR S = false ∧
      ((normaliseD ds (ds.readJ S j)).staged ds).fails = false ∧
      ¬ RefusedAt ds j ((normaliseD ds (ds.readJ S j)).staged ds) ∧
      m.lax = false ∧
      ¬ ∃ j', Gen ds.envE j ((normaliseD ds (ds.readJ S j)).staged ds).visible j' ∧
        (m.fill = true ∨ Admits ds.envE j ((normaliseD ds (ds.readR S)).staged ds).visible.waitAny j)

/-- The verdict, computed. -/
def vet (m : Mode) (ds : Decls) (S : Val) (j : Data) : Verdict :=
  if !(ds.declaresB S && ds.guardedB) then .error
  else if ds.illFormedR S then .error
  else if ((normaliseD ds (ds.readJ S j)).staged ds).fails then .invalid
  else if refusedAt ds ((normaliseD ds (ds.readJ S j)).staged ds) then .invalid
  else if m.lax then .valid
  else
    match genD ds ((normaliseD ds (ds.readJ S j)).staged ds).visible with
    | some _ => if m.fill || checkR ds ((normaliseD ds (ds.readR S)).staged ds).visible.waitAny j then .valid else .incomplete
    | none => .incomplete

section
variable {env : Env} {root : Data}

/-! ## The data is an instance of its own term -/

theorem termMembers_mem {fs : List (String × Data)} {k : String} {o : Bool} {v : Val} :
    (k, o, v) ∈ termMembers fs ↔ ∃ x, (k, x) ∈ fs ∧ o = false ∧ v = x.term := by
  induction fs with
  | nil => simp [termMembers]
  | cons f fs ih =>
    obtain ⟨k', x'⟩ := f
    rw [termMembers, List.mem_cons, ih]
    constructor
    · rintro (h | ⟨x, hm, rfl, rfl⟩)
      · simp only [Prod.mk.injEq] at h
        obtain ⟨rfl, rfl, rfl⟩ := h
        exact ⟨x', List.mem_cons_self, rfl, rfl⟩
      · exact ⟨x, List.mem_cons_of_mem _ hm, rfl, rfl⟩
    · rintro ⟨x, hm, rfl, rfl⟩
      rcases List.mem_cons.mp hm with h | hm'
      · simp only [Prod.mk.injEq] at h
        obtain ⟨rfl, rfl⟩ := h
        exact .inl rfl
      · exact .inr ⟨x, hm', rfl, rfl⟩

theorem termElems_length : ∀ xs : List Data, (termElems xs).length = xs.length
  | [] => rfl
  | _ :: xs => by rw [termElems, List.length_cons, List.length_cons, termElems_length xs]

theorem termElems_getElem? : ∀ (xs : List Data) (i : ℕ), (termElems xs)[i]? = xs[i]?.map Data.term
  | [], _ => by simp [termElems]
  | x :: xs, 0 => by simp [termElems]
  | x :: xs, i + 1 => by
    rw [termElems, List.getElem?_cons_succ, List.getElem?_cons_succ]
    exact termElems_getElem? xs i

mutual
theorem term_admits_self : ∀ j : Data, j.WellFormed → Admits env root j.term j
  | .num _, _ => .num
  | .str _, _ => .str
  | .bool _, _ => .bool
  | .null, _ => .null
  | .addr a, _ => .addr (Addr.opens_refl a)
  | .map fs, h => by
    cases h with
    | map hn hw =>
      refine .map ?_ ?_ (fun _ h => nomatch h) (fun h => nomatch h)
      · intro k o v x hm hl
        obtain ⟨y, hmem, -, rfl⟩ := termMembers_mem.mp hm
        rw [lookup_eq_some_of_nodup hn hmem] at hl
        obtain rfl := Option.some.inj hl
        exact members_admit_self fs hw k y hmem
      · intro k o v hm hl
        obtain ⟨y, hmem, -, -⟩ := termMembers_mem.mp hm
        rw [lookup_eq_some_of_nodup hn hmem] at hl
        exact nomatch hl
  | .list xs, h => by
    cases h with
    | list hw =>
      refine .list (by rw [termElems_length]; exact Nat.le_refl _) (fun h => nomatch h) ?_
        (fun _ h => nomatch h)
      intro i v x hv hx
      rw [termElems_getElem?, hx] at hv
      obtain rfl := Option.some.inj hv
      exact elems_admit_self xs hw x (List.mem_of_getElem? hx)

theorem members_admit_self : ∀ fs : List (String × Data), (∀ k x, (k, x) ∈ fs → x.WellFormed) →
    ∀ k x, (k, x) ∈ fs → Admits env root x.term x
  | [], _, _, _, hm => absurd hm (List.not_mem_nil)
  | (k', y) :: fs, hw, k, x, hm => by
    rcases List.mem_cons.mp hm with h | hm'
    · simp only [Prod.mk.injEq] at h
      obtain ⟨rfl, rfl⟩ := h
      exact term_admits_self _ (hw _ _ (List.mem_cons_self))
    · exact members_admit_self fs (fun k x hm => hw k x (List.mem_cons_of_mem _ hm)) k x hm'

theorem elems_admit_self : ∀ xs : List Data, (∀ x, x ∈ xs → x.WellFormed) →
    ∀ x, x ∈ xs → Admits env root x.term x
  | [], _, _, hm => absurd hm (List.not_mem_nil)
  | y :: xs, hw, x, hm => by
    rcases List.mem_cons.mp hm with rfl | hm'
    · exact term_admits_self _ (hw _ (List.mem_cons_self))
    · exact elems_admit_self xs (fun x hm => hw x (List.mem_cons_of_mem _ hm)) x hm'
end


mutual
/-- A term made of data expands to itself: it names nothing. -/
theorem expandF_term {ds : Decls} : ∀ (k : ℕ) (j : Data), expandF ds k j.term = j.term
  | 0, _ => rfl
  | _ + 1, .num _ | _ + 1, .str _ | _ + 1, .bool _ | _ + 1, .null | _ + 1, .addr _ => rfl
  | k + 1, .map fs => by
    simp only [Data.term, expandF, Option.map, expandF_termMembers k fs]
  | k + 1, .list xs => by
    simp only [Data.term, expandF, Option.map, expandF_termElems k xs]

theorem expandF_termMembers {ds : Decls} (k : ℕ) : ∀ fs : List (String × Data),
    (termMembers fs).map (fun f => (f.1, f.2.1, expandF ds k f.2.2)) = termMembers fs
  | [] => rfl
  | (_, x) :: fs => by
    simp only [termMembers, List.map_cons, expandF_term k x, expandF_termMembers k fs]

theorem expandF_termElems {ds : Decls} (k : ℕ) : ∀ xs : List Data,
    (termElems xs).map (expandF ds k) = termElems xs
  | [] => rfl
  | x :: xs => by
    simp only [termElems, List.map_cons, expandF_term k x, expandF_termElems k xs]
end

/-- A `filter` whose source generates a value reads to a term the
checker can read, whatever its condition holds: the members it admits,
or `nil`. -/
theorem resolveD_filter_checkableA {ds : Decls} {b : Option Val} {pos : List Step} {s c : Val}
    (h : (genD ds (resolveD ds b (some pos) s)).isSome) : (resolveD ds b (some pos) (.filter s c)).CheckableA := by
  obtain ⟨x, hx⟩ := Option.isSome_iff_exists.mp h
  rw [resolveD.eq_def]
  simp only [Option.isNone_some, Bool.false_and, Bool.false_eq_true, ite_false]
  rw [hx]
  cases x <;> first | exact Data.term_checkableA _ | exact .nil

/-! ## One verdict, and the computed one -/

/-- The four answers exclude one another. -/
theorem vet_unique {m : Mode} {ds : Decls} {S : Val} {j : Data} {v v' : Verdict}
    (h : Vet m ds S j v) (h' : Vet m ds S j v') : v = v' := by
  cases v <;> cases v' <;> simp only [Vet] at h h'
  case valid.valid | invalid.invalid | incomplete.incomplete | error.error => rfl
  case error.valid | error.invalid | error.incomplete =>
    rcases h with hD | hG | hi
    · exact absurd h'.1 hD
    · exact absurd h'.2.1 hG
    · exact absurd (h'.2.2.1.symm.trans hi) Bool.false_ne_true
  case valid.error | invalid.error | incomplete.error =>
    rcases h' with hD | hG | hi
    · exact absurd h.1 hD
    · exact absurd h.2.1 hG
    · exact absurd (h.2.2.1.symm.trans hi) Bool.false_ne_true
  case invalid.valid | invalid.incomplete =>
    rcases h.2.2.2 with hd | hr
    · exact absurd (h'.2.2.2.1.symm.trans hd) Bool.false_ne_true
    · exact absurd hr h'.2.2.2.2.1
  case valid.invalid | incomplete.invalid =>
    rcases h'.2.2.2 with hd | hr
    · exact absurd (h.2.2.2.1.symm.trans hd) Bool.false_ne_true
    · exact absurd hr h.2.2.2.2.1
  case valid.incomplete =>
    rcases h.2.2.2.2.2 with hp | hex
    · exact absurd (h'.2.2.2.2.2.1.symm.trans hp) Bool.false_ne_true
    · exact absurd hex h'.2.2.2.2.2.2
  case incomplete.valid =>
    rcases h'.2.2.2.2.2 with hp | hex
    · exact absurd (h.2.2.2.2.2.1.symm.trans hp) Bool.false_ne_true
    · exact absurd hex h.2.2.2.2.2.2

/-- The computed verdict is a verdict: `vet` answers as `Vet` says,
wherever the bodies, and the schema as read with its selections made,
hold no path, no pattern, no format and no selection a value has not
settled, which `decide` settles for any closed document. -/
theorem vet_sound {m : Mode} {ds : Decls} {S : Val} {j : Data} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : (ds.readR S).CheckableA) : Vet m ds S j (vet m ds S j) := by
  unfold vet
  cases hok : (ds.declaresB S && ds.guardedB) with
  | false =>
    simp only [Bool.not_false, ↓reduceIte]
    rcases Bool.and_eq_false_iff.mp hok with hd | hg
    · exact .inl fun h => Bool.false_ne_true (hd.symm.trans (Decls.declaresB_iff.mpr h))
    · exact .inr (.inl fun h => Bool.false_ne_true (hg.symm.trans (Decls.guardedB_iff.mpr h)))
  | true =>
    simp only [Bool.not_true, Bool.false_eq_true, ↓reduceIte]
    rw [Bool.and_eq_true] at hok
    obtain ⟨hdB, hgB⟩ := hok
    have hD := Decls.declaresB_iff.mp hdB
    have hG := Decls.guardedB_iff.mp hgB
    have hS' : ((normaliseD ds (ds.readR S)).staged ds).visible.waitAny.CheckableA :=
      waitAny_checkableA (staged_checkableA (ds := ds) (normaliseD_checkableA hb hS)).visible
    have hM' := staged_checkableA (ds := ds) (normaliseD_checkableA hb (readJ_checkableA hb hS j))
    cases hi : ds.illFormedR S with
    | true => exact .inr (.inr hi)
    | false =>
      rw [if_neg Bool.false_ne_true]
      cases hd : ((normaliseD ds (ds.readJ S j)).staged ds).fails with
      | true => exact ⟨hD, hG, hi, .inl hd⟩
      | false =>
        rw [if_neg Bool.false_ne_true]
        cases hr : refusedAt ds ((normaliseD ds (ds.readJ S j)).staged ds) with
        | true => exact ⟨hD, hG, hi, .inr ((refusedAt_iff hG hb hM').mp hr)⟩
        | false =>
          rw [if_neg Bool.false_ne_true]
          have hnr : ¬ RefusedAt ds j ((normaliseD ds (ds.readJ S j)).staged ds) := fun h => by
            rw [(refusedAt_iff hG hb hM').mpr h] at hr
            exact nomatch hr
          cases hp : m.lax with
          | true => exact ⟨hD, hG, hi, hd, hnr, .inl hp⟩
          | false =>
            rw [if_neg Bool.false_ne_true]
            cases ho : genD ds ((normaliseD ds (ds.readJ S j)).staged ds).visible with
            | some j' =>
              have hout : Gen ds.envE j ((normaliseD ds (ds.readJ S j)).staged ds).visible j' :=
                (genWith_iff hM'.visible (fun _ j hw _ => checkR_iff hG hb hw j) j').mp ho
              cases hc : (m.fill || checkR ds ((normaliseD ds (ds.readR S)).staged ds).visible.waitAny j) with
              | true =>
                rw [if_pos rfl]
                refine ⟨hD, hG, hi, hd, hnr, .inr ⟨j', hout, ?_⟩⟩
                rcases Bool.or_eq_true_iff.mp hc with hf | hk
                · exact .inl hf
                · exact .inr ((checkR_iff hG hb hS' j).mp hk)
              | false =>
                rw [if_neg Bool.false_ne_true]
                refine ⟨hD, hG, hi, hd, hnr, hp, ?_⟩
                rintro ⟨j'', -, hf | hA⟩
                · rw [hf] at hc
                  exact nomatch hc
                · rw [(checkR_iff hG hb hS' j).mpr hA, Bool.or_true] at hc
                  exact nomatch hc
            | none =>
              refine ⟨hD, hG, hi, hd, hnr, hp, ?_⟩
              rintro ⟨j', hout, -⟩
              have hg' : genD ds ((normaliseD ds (ds.readJ S j)).staged ds).visible = some j' :=
                (genWith_iff hM'.visible (fun _ j hw _ => checkR_iff hG hb hw j) j').mpr hout
              rw [hg'] at ho
              exact nomatch ho

/-- `vet` computes `Vet`. -/
theorem vet_iff {m : Mode} {ds : Decls} {S : Val} {j : Data} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : (ds.readR S).CheckableA) (v : Verdict) : vet m ds S j = v ↔ Vet m ds S j v :=
  ⟨fun h => h ▸ vet_sound hb hS, fun h => vet_unique (vet_sound hb hS) h⟩

/-! ## What the verdicts say -/

/-- Without the fill, `valid` is `Instance`: the data as written is an
instance of the visible part of the schema as read, each part that
waits on a hole read as `any`, since the data fills it. -/
theorem vet_strict_valid_instance {m : Mode} {ds : Decls} {S : Val} {j : Data} (hf : m.fill = false)
    (hp : m.lax = false) (hj : j.WellFormed) (h : Vet m ds S j .valid) :
    Instance ds.envE ((normaliseD ds (ds.readR S)).staged ds).visible.waitAny j := by
  obtain ⟨-, -, -, -, -, hp' | ⟨_, -, hf' | hA⟩⟩ := h
  · rw [hp] at hp'
    exact nomatch hp'
  · rw [hf] at hf'
    exact nomatch hf'
  · exact ⟨hj, hA⟩

/-- With the fill, `valid` singles out a value, the data filled, which
is an instance of the visible part of the schema met with the data. -/
theorem vet_valid_filled {m : Mode} {ds : Decls} {S : Val} {j : Data} (hp : m.lax = false)
    (h : Vet m ds S j .valid) :
    ∃ j', Gen ds.envE j ((normaliseD ds (ds.readJ S j)).staged ds).visible j' ∧ Admits ds.envE j ((normaliseD ds (ds.readJ S j)).staged ds).visible j' := by
  obtain ⟨-, -, -, -, -, hp' | ⟨j', hout, -⟩⟩ := h
  · rw [hp] at hp'
    exact nomatch hp'
  · exact ⟨j', hout, gen_admits _ _ hout⟩

/-- `invalid` refuses: the normal form of the schema read against the
data, the conflicts the meet finds read (`Val.staged`), refuses the data
as written, or, its trials and sizes unread, the value it would single
out, or holds a call the data leaves the reading unable to make. -/
theorem vet_invalid_refuses {m : Mode} {ds : Decls} {S : Val} {j : Data} (h : Vet m ds S j .invalid) :
    Refuses ds.envE j ((normaliseD ds (ds.readJ S j)).staged ds) j ∨
      RefusedAt ds j ((normaliseD ds (ds.readJ S j)).staged ds) ∨
      ((normaliseD ds (ds.readJ S j)).staged ds).illFormed = true := by
  obtain ⟨-, -, -, hd | hr⟩ := h
  · rcases Bool.or_eq_true_iff.mp hd with hd | hi
    · exact .inl (dead_refuses _ hd j)
    · exact .inr (.inr hi)
  · exact .inr (.inl hr)

end

end Aontu
