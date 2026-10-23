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
whatever the data. Otherwise the meet of the schema with the data as a
term is dead, and the data is refused outright: `invalid`. Otherwise
the meet singles out a value, the data filled by the schema's defaults:
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
the hole `_` or a `key(n)` at any depth, but in the template of an
`each` or a `pack`, which reads its template for each member, so that
the member binds both, or in an `emit`'s table, read for each node. -/
def Val.waits : Val → Bool
  | .hole | .keyUp _ => true
  | .call .each args | .call .pack args | .call .emit args => waitsHead args
  | .call _ args => waitsItems args
  | .ride _ v _ => v.waits
  | .len c => c.waits
  | .map fs spread _ => waitsFields fs || waitsSpread spread
  | .list items spread _ => waitsItems items || waitsSpread spread
  | .or arms => waitsArms arms
  | .pref _ x => x.waits
  | .meet a b => a.waits || b.waits
  | .nof n cs => n.waits || waitsItems cs
  | .must c _ => c.waits
  | .when c t e => c.waits || t.waits || waitsSpread e
  | .contains c n => c.waits || n.waits
  | .rest t cs => t.waits || waitsCovers cs
  | .select s arms d => s.waits || waitsPairs arms || waitsSpread d
  | .filter s c => s.waits || c.waits
  | _ => false

def waitsHead : List Val → Bool
  | [] => false
  | v :: _ => v.waits

def waitsFields : List (String × Bool × Val) → Bool
  | [] => false
  | (_, _, v) :: fs => v.waits || waitsFields fs

def waitsItems : List Val → Bool
  | [] => false
  | v :: vs => v.waits || waitsItems vs

def waitsSpread : Option Val → Bool
  | none => false
  | some s => s.waits

def waitsArms : List (ℕ × Val) → Bool
  | [] => false
  | (_, a) :: arms => a.waits || waitsArms arms

def waitsPairs : List (Val × Val) → Bool
  | [] => false
  | (p, r) :: ps => p.waits || r.waits || waitsPairs ps

def waitsCovers : List Cover → Bool
  | [] => false
  | (c, k, m) :: cs => waitsSpread c || waitsSpread k || waitsSpread m || waitsCovers cs
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
a nested `emit`'s table, a generator's template and a `filter`'s
condition, which read their own nodes and members. -/
def Val.nodePaths : Val → List (List Seg)
  | .path p => if p.head? == some .node then [p] else []
  | .call .emit (s :: _) | .call .each (s :: _) | .call .pack (s :: _) => s.nodePaths
  | .filter s _ => s.nodePaths
  | .call _ args => nodeItems args
  | .len c => c.nodePaths
  | .map fs spread _ => nodeFields fs ++ nodeSpread spread
  | .list items spread _ => nodeItems items ++ nodeSpread spread
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
      if here.isNone && keyItems (resolveItems ds b here args) then .call f (resolveItems ds b here args)
      else if (resolveItems ds b here args).any (fun a => (normaliseD ds a).isAbsent) then .absent
      else if (resolveItems ds b here args).any (·.pending ds) then .call f (resolveItems ds b here args)
      else callTerm ds f (resolveItems ds b here args)
  | .len c =>
    if (normaliseD ds (resolveD ds b here c)).unsized then .nothing else .len (resolveD ds b here c)
  | .map fs spread closed =>
    .map (resolveFields ds b here fs) (resolveSpread ds none (stepped here .spread) spread) closed
  | .list items spread closed =>
    .list ((resolveElems ds b here 0 items).filter fun e => !(normaliseD ds e).isAbsent)
      (resolveSpread ds none (stepped here .spread) spread) closed
  | .or arms => .or (resolveArms ds b here arms)
  | .pref r x => .pref r (resolveD ds b here x)
  | .meet a c => .meet (resolveD ds b here a) (resolveD ds b here c)
  | .nof n cs => .nof (resolveD ds b here n) (resolveItems ds b here cs)
  | .must c m => .must (resolveD ds b here c) m
  | .when c t e => .when (resolveD ds b here c) (resolveD ds b here t) (resolveSpread ds b here e)
  | .contains c n => .contains (resolveD ds b here c) (resolveD ds b here n)
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
  | i, v :: vs => resolveD ds b (stepped here (.seg (.idx i))) v :: resolveElems ds b here (i + 1) vs
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

/-- How a document reads: its term expanded, with its selections made and
each key placed, the document standing at the top. -/
def Decls.readR (ds : Decls) (S : Val) : Val := resolveD ds none (some []) (ds.read S)

/-- How a document reads with its keys as written: the root its paths
read, so that a key a path reaches reads where the path lands. -/
def Decls.readU (ds : Decls) (S : Val) : Val := resolveD ds none none (ds.read S)

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
    refine .nof (ihn hb) fun c hc => ?_
    obtain ⟨c₀, hc₀, rfl⟩ := mem_resolveItems hc
    exact ihcs c₀ hc₀ hb
  | must _ ih => intro b here hb; simp only [resolveD]; exact .must (ih hb)
  | when _ _ _ ihc iht ihe =>
    intro b here hb
    simp only [resolveD]
    refine .when (ihc hb) (iht hb) fun e he => ?_
    obtain ⟨e₀, he₀, rfl⟩ := resolveSpread_some he
    exact ihe e₀ he₀ hb
  | contains _ _ ihc ihn => intro b here hb; simp only [resolveD]; exact .contains (ihc hb) (ihn hb)
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
      | none => if (normaliseD ds .key).isAbsent then .absent
          else .select .key (resolvePairs ds b here arms) (resolveSpread ds b here d)).CheckableA
    have hg : genD ds .key = none := rfl
    rw [hg]
    dsimp only
    split
    · exact .absent
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
      | none => if (normaliseD ds (.lit sc)).isAbsent then .absent
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
  exact resolveD_checkableA hb (expand_checkableA hb hS) fun _ h => nomatch h

/-- A document whose schema the checker can read reads, with its keys as
written, as a term it can read too. -/
theorem readU_checkableA {ds : Decls} {S : Val} (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hS : S.CheckableA) :
    (ds.readU S).CheckableA := by
  unfold Decls.readU
  exact resolveD_checkableA hb (expand_checkableA hb hS) fun _ h => nomatch h

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

/-- Whether the conjuncts of a meet hold a size their container literal
breaks: a `len(c)` whose upper half refuses the count of the literals,
met. A literal short of its size is no conflict: it is tried at
generation, after the fills (decision 9 of the design note's §7). -/
def sizeClash (cs : List Val) : Bool :=
  match (cs.filter fun v => v.genCount.isSome).foldl meet .any |>.genCount with
  | none => false
  | some n =>
    if h : IntegerLeaf n then
      cs.any fun v => match v with
        | .len c => !check c.upperHalf (.num (.integer ⟨n, h⟩))
        | _ => false
    else false

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

mutual
/-- Whether a term in normal form does not stand: a `nil` anywhere but
in a spread, which the engines read only against a member, a
preference clash, a size the meet's container literal breaks or that
holds a disjunction or a preference, or a call the reading could not
make. A `+` that waits stands where its operands do, and a `pref` that
waits where its argument does. -/
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

/-- A conjunct of a meet read as `illFormed` reads a term, the meet it
stands in having read its sizes once, whole. -/
def illChain : Val → Bool
  | .meet a b => illChain a || illChain b
  | .nil => true
  | .len c => c.sizeIll
  | .map fs _ _ => illFields fs
  | .list items _ _ => illItems items
  | .or arms => clash arms || illArms arms
  | .pref _ x => x.illFormed
  | .ride _ v _ => v.illFormed
  | .call .plus args => args.length != 2 || illItems args
  | .call .join args => (args.length != 1 && args.length != 2) || illItems args
  | .call .pref args => args.length != 1 || illItems args
  | .call _ _ => true
  | .select _ arms _ => illPats arms
  | _ => false

def illFields : List (String × Bool × Val) → Bool
  | [] => false
  | (_, _, v) :: fs => v.illFormed || illFields fs

def illItems : List Val → Bool
  | [] => false
  | v :: vs => v.illFormed || illItems vs

def illArms : List (ℕ × Val) → Bool
  | [] => false
  | (_, a) :: arms => a.illFormed || illArms arms

def illPats : List (Val × Val) → Bool
  | [] => false
  | (p, _) :: ps => p.illFormed || illPats ps
end

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
/-- A term with each part that waits for a place read as `any`: a hole,
a `key(n)`, and a call or a trial that holds either. Such a call reads
as `nil` instead where an argument both ports read as written doesn't
stand by `ill`: any of a call's but the template of an `each` or a
`pack` and an `emit`'s table, a size, the count of `nof` and
`contains`, the condition of `must`, and the scrutinee or source of
`match` and `filter`. -/
def Val.unplaced (ill : Val → Bool) : Val → Val
  | .hole | .keyUp _ => .any
  | .map fs spread closed => .map (unplacedFields ill fs) spread closed
  | .list items spread closed => .list (unplacedItems ill items) spread closed
  | .meet a b => .meet (a.unplaced ill) (b.unplaced ill)
  | .or arms => .or (unplacedArms ill arms)
  | .pref r x => .pref r (x.unplaced ill)
  | .ride k v r => .ride k (v.unplaced ill) r
  | .call f args =>
    if !(Val.call f args).waits then .call f args
    else if (match f with
      | .each | .pack | .emit => headIll ill args
      | _ => argsIll ill args) then .nil else .any
  | .len c => if !c.waits then .len c else if ill (c.unplaced ill) then .nil else .any
  | .must c m => if !c.waits then .must c m else if ill (c.unplaced ill) then .nil else .any
  | .nof n cs =>
    if !(Val.nof n cs).waits then .nof n cs else if ill (n.unplaced ill) then .nil else .any
  | .contains c n =>
    if !(Val.contains c n).waits then .contains c n else if ill (n.unplaced ill) then .nil else .any
  | .select s arms d =>
    if !(Val.select s arms d).waits then .select s arms d
    else if ill (s.unplaced ill) then .nil else .any
  | .filter s c =>
    if !(Val.filter s c).waits then .filter s c else if ill (s.unplaced ill) then .nil else .any
  | v => if v.waits then .any else v

def unplacedFields (ill : Val → Bool) : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.unplaced ill) :: unplacedFields ill fs

def unplacedItems (ill : Val → Bool) : List Val → List Val
  | [] => []
  | v :: vs => v.unplaced ill :: unplacedItems ill vs

def unplacedArms (ill : Val → Bool) : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: arms => (r, a.unplaced ill) :: unplacedArms ill arms

def argsIll (ill : Val → Bool) : List Val → Bool
  | [] => false
  | v :: vs => ill (v.unplaced ill) || argsIll ill vs

def headIll (ill : Val → Bool) : List Val → Bool
  | [] => false
  | v :: _ => ill (v.unplaced ill)
end

/-- Whether a declaration's body does not stand, read where no place is
yet (`Decls.readU`), as the name and as the body itself, so that a dead
or ill-formed body makes the document an error whether or not anything
reads it, a recursive one among them, as both ports answer (decision 17
of the design note's §7). Each body is read with the parts that wait
for the use that places them, a hole or a `key(n)`, as `any`
(`Val.unplaced`), so that a body that names one waits too and what
stands beside them is read. A waiting call is `nil` where an argument
it reads as written doesn't stand, read against the bodies with each
waiting part as `any` (`d0`). A name a source publishes is read where a
destructure takes it, so not here. -/
def Decls.bodyIll (ds : Decls) : Bool :=
  let d0 : Decls := ds.map fun d => (d.1, d.2.unplaced fun _ => false)
  let ill : Val → Bool := fun t => (normaliseD d0 (d0.readU t)).illFormed
  let du : Decls := ds.map fun d => (d.1, d.2.unplaced ill)
  du.any fun d => d.1.toList.head? != some '!' &&
    ((normaliseD du (du.readU (.alias d.1))).illFormed || (normaliseD du (du.readU d.2)).illFormed)

/-- Whether a document does not stand: an `ident()` out of its place, a
declaration's body that does not stand, or the schema, read, with a
normal form that does not stand. -/
def Decls.illFormedR (ds : Decls) (S : Val) : Bool :=
  ds.identMisplaced S || ds.bodyIll || (normaliseD ds (ds.readR S)).illFormed

/-! ## The value a document gives with its trials unread

Both ports try a container when no member can still arrive, so a trial
or a size refuses a container at generation, after the fills, where a
scalar it refuses at the meet. The definition reads that moment as the
value the normal form would single out with every trial and size unread,
each `nof`, `must`, `len` and `unique` as `any`, and asks whether the
normal form, read whole, refuses it. -/

mutual
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
theorem untried_checkableA {v : Val} (h : v.CheckableA) : v.untried.CheckableA := by
  induction h with
  | len _ _ | unique | nof _ _ _ _ | must _ _ | when _ _ _ _ _ _ | contains _ _ _ _ | rest _ _ _ _ _ _ _ _ =>
    exact .any
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

/-! ## The verdict -/

instance (ds : Decls) (S : Val) : Decidable (ds.Declares S) := decidable_of_iff _ Decls.declaresB_iff

instance (ds : Decls) : Decidable ds.Guarded := decidable_of_iff _ Decls.guardedB_iff

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

/-- The verdict, computed. -/
def vet (m : Mode) (ds : Decls) (S : Val) (j : Data) : Verdict :=
  if !(ds.declaresB S && ds.guardedB) then .error
  else if ds.illFormedR S then .error
  else if (normaliseD ds (meetD ds (ds.readR S) j.term)).dead then .invalid
  else if refusedAt ds (normaliseD ds (meetD ds (ds.readR S) j.term)) then .invalid
  else if m.lax then .valid
  else
    match outputD ds (meetD ds (ds.readR S) j.term) with
    | some _ => if m.fill || checkR ds (normaliseD ds (ds.readR S)).visible j then .valid else .incomplete
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
    have hS' : (normaliseD ds (ds.readR S)).visible.CheckableA := (normaliseD_checkableA hb hS).visible
    have hM' := normaliseD_checkableA hb (meetD_checkableA hb hS (Data.term_checkableA j))
    cases hi : ds.illFormedR S with
    | true => exact .inr (.inr hi)
    | false =>
      rw [if_neg Bool.false_ne_true]
      cases hd : (normaliseD ds (meetD ds (ds.readR S) j.term)).dead with
      | true => exact ⟨hD, hG, hi, .inl hd⟩
      | false =>
        rw [if_neg Bool.false_ne_true]
        cases hr : refusedAt ds (normaliseD ds (meetD ds (ds.readR S) j.term)) with
        | true => exact ⟨hD, hG, hi, .inr ((refusedAt_iff hG hb hM').mp hr)⟩
        | false =>
          rw [if_neg Bool.false_ne_true]
          have hnr : ¬ RefusedAt ds j (normaliseD ds (meetD ds (ds.readR S) j.term)) := fun h => by
            rw [(refusedAt_iff hG hb hM').mpr h] at hr
            exact nomatch hr
          cases hp : m.lax with
          | true => exact ⟨hD, hG, hi, hd, hnr, .inl hp⟩
          | false =>
            rw [if_neg Bool.false_ne_true]
            cases ho : outputD ds (meetD ds (ds.readR S) j.term) with
            | some j' =>
              have hout : OutputD ds j (meetD ds (ds.readR S) j.term) j' :=
                (outputD_iff hG hb hM' j').mp ho
              cases hc : (m.fill || checkR ds (normaliseD ds (ds.readR S)).visible j) with
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
              rw [(outputD_iff hG hb hM' j').mpr hout] at ho
              exact nomatch ho

/-- `vet` computes `Vet`. -/
theorem vet_iff {m : Mode} {ds : Decls} {S : Val} {j : Data} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : (ds.readR S).CheckableA) (v : Verdict) : vet m ds S j = v ↔ Vet m ds S j v :=
  ⟨fun h => h ▸ vet_sound hb hS, fun h => vet_unique (vet_sound hb hS) h⟩

/-! ## What the verdicts say -/

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

/-- `invalid` refuses: the normal form of the schema met with the data
refuses the data as written, or, its trials and sizes unread, the value
it would single out. -/
theorem vet_invalid_refuses {m : Mode} {ds : Decls} {S : Val} {j : Data} (h : Vet m ds S j .invalid) :
    Refuses ds.envE j (normaliseD ds (meetD ds (ds.readR S) j.term)) j ∨
      RefusedAt ds j (normaliseD ds (meetD ds (ds.readR S) j.term)) := by
  obtain ⟨-, -, -, hd | hr⟩ := h
  · exact .inl (dead_refuses _ hd j)
  · exact .inr hr

end

end Aontu
