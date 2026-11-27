import Aontu.Output

/-!
# The output annotation

`gen(r)` says how the value it meets is written where a document is
generated, and nothing of what the value is. It is `any` carrying the
record `r` (`Val.annotation`), so the record rides whatever its value
becomes, and both ports hold it to the standard options of the value's
type, which the bundled model `aontu:gen` lists, once that type is
known.

- A **type** is one of seven (`Shape`): a number, a string, a boolean,
  `null`, an address, a map and a list.
- A type **takes** an option where its standard set holds the name and
  the value is one the name allows (`Shape.takes`).
- A term's type is **known** where the term is a literal, a kind alone,
  a map, a list or an address (`Val.shape?`). A bound, a pattern, and a
  kind beside either leave it open, as both ports read them.
- A value is **held to** a record where the verdict stages the normal
  form (`Val.heldTo`, `Val.held`): a value whose type is known and
  doesn't take the record is a conflict, and one whose type is open
  admits the values of the types that take it (`takers`). Either way it
  admits what the value admits of the types that take the record
  (`admits_heldTo`), and `gen(r)` alone the values of those types
  (`admits_annotation`).
- Two records **unify** as maps (`Record.unify`): the members of both,
  a key both hold unified in turn, two lists element by element, and
  anything else only with itself. Records that don't unify are a
  conflict, found where the verdict stages the normal form too
  (`Val.withRecord` in `Aontu/Verdict.lean`).
- The **argument** is one map of concrete data, or one string, which is
  the `form` (`Val.record?`).

What an option writes is `Aontu/Written.lean`'s, for a number. The
other types' options and `custom`, an expression, wait.
-/

namespace Aontu

/-! ## The types and their options -/

/-- The types `gen` tells apart, each with its own options. -/
inductive Shape where
  | number | string | boolean | null | path | map | list
  deriving DecidableEq

/-- Every type. -/
def Shape.all : List Shape := [.number, .string, .boolean, .null, .path, .map, .list]

theorem Shape.mem_all (s : Shape) : s ∈ Shape.all := by
  cases s <;> simp [Shape.all]

/-- The type a value is of. -/
def Data.shape : Data → Shape
  | .num _ => .number
  | .str _ => .string
  | .bool _ => .boolean
  | .null => .null
  | .addr _ => .path
  | .map _ => .map
  | .list _ => .list

/-- The term that admits the values of a type, and no others: `number`,
`string & empty()`, `boolean`, `null`, `path`, `map` and `list`. -/
def Shape.term : Shape → Val
  | .number => .number
  | .string => .anyString
  | .boolean => .boolean
  | .null => .lit .null
  | .path => .pathKind
  | .map => .mapKind
  | .list => .listKind

/-- Whether data is one of the strings named. -/
def Data.oneOf (names : List String) : Data → Bool
  | .str s => names.contains s
  | _ => false

/-- Whether data is a count an option takes: `"all"`, or a number of
the `integer` leaf from `lo` up, and no more than `hi` where one is
given. -/
def Data.count (lo : ℤ) (hi : Option ℤ) : Data → Bool
  | .str s => s == "all"
  | .num (.integer n) => decide (lo ≤ n.value) && hi.all fun h => decide (n.value ≤ h)
  | _ => false

/-- The styles `keys` writes a map's keys in. -/
def keyStyles : List String :=
  ["verbatim", "camel", "dot", "kebab", "pascal", "path", "snake", "text", "title", "upper"]

/-- Whether a type's standard options take the option `name: d`, as the
bundled model `aontu:gen` lists them: a number's `significant`, a count
from one, its `places`, a count from none to 4096, and its `as`; a
string's `case`; a boolean's `as`; an address's `form`; a map's `keys`;
and `empty` for a string, `null`, a map and a list. Every type takes
`custom`. -/
def Shape.takes : Shape → String → Data → Bool
  | _, "custom", _ => true
  | .number, "significant", d => d.count 1 none
  | .number, "places", d => d.count 0 (some 4096)
  | .number, "as", d => d.oneOf ["number", "string"]
  | .string, "case", d => d.oneOf ["verbatim", "upper", "lower"]
  | .boolean, "as", d => d.oneOf ["boolean", "number", "string"]
  | .path, "form", d => d.oneOf ["verbatim", "absolute", "pointer", "key"]
  | .map, "keys", d => d.oneOf keyStyles
  | .string, "empty", d | .null, "empty", d | .map, "empty", d | .list, "empty", d =>
    d.oneOf ["keep", "omit"]
  | _, _, _ => false

/-- Whether a type takes every option of a record. -/
def Shape.takesAll (s : Shape) (r : Record) : Bool := r.all fun m => s.takes m.1 m.2

/-- The term that admits the values of the types listed: for none of
them `nothing`, which stands and admits nothing, for one its own term,
and for more a disjunction of theirs. -/
def Shape.anyOf : List Shape → Val
  | [] => .nothing
  | [s] => s.term
  | ss => .or (ss.map fun s => (0, s.term))

/-- The term that admits the values of each type whose options take the
record: `any` where every type does, and where none does a term that
stands and admits nothing, so that a record no type takes waits for a
value before it refuses one. -/
def takers (r : Record) : Val :=
  if Shape.all.all (·.takesAll r) then .any else Shape.anyOf (Shape.all.filter (·.takesAll r))

/-- `gen(r)` as a term: `any` carrying the record, so that it leaves
the value it meets as it is and rides what that becomes. An empty
record says nothing, so `gen({})` is `any`. -/
def Val.annotation : Record → Val
  | [] => .any
  | r => .ride .gen .any r

/-- The type of a term's values, where the term makes it known: a
literal's, a kind's, a map's, a list's and an address's. A bound, a
pattern, a trial and a meet of terms leave it open, a kind beside a
bound among them, as both ports hold a record to a type only where the
value is one of these. -/
def Val.shape? : Val → Option Shape
  | .lit s => some s.data.shape
  | .integer | .float | .biginteger | .bigdecimal | .number => some .number
  | .string | .anyString => some .string
  | .boolean => some .boolean
  | .mapKind | .map _ _ _ => some .map
  | .listKind | .list _ _ _ => some .list
  | .pathKind | .addr _ => some .path
  | _ => none

/-- A value held to the record it carries: `nil` where its type is
known and doesn't take the record, the conflict both ports report as
`gen_option`; and where its type is open the value beside the types
that take the record, which is those types alone where the value is
`any`. -/
def Val.heldTo (t : Record) (v : Val) : Val :=
  match v.shape? with
  | some s => if s.takesAll t then .ride .gen v t else .nil
  | none => .ride .gen (if v.isAny then takers t else .meet v (takers t)) t

section
variable {env : Env} {root : Data}

/-- A type's term admits exactly the values of the type. -/
theorem admits_shape_term {s : Shape} {j : Data} : Admits env root s.term j ↔ j.shape = s := by
  constructor
  · intro h
    cases s <;> simp only [Shape.term] at h <;> cases h <;> rfl
  · rintro rfl
    cases j <;> first | exact admits_lit_iff.mpr rfl | constructor

/-- The term for a list of types admits exactly the values of those
types. -/
theorem admits_anyOf {ss : List Shape} {j : Data} :
    Admits env root (Shape.anyOf ss) j ↔ j.shape ∈ ss := by
  match ss with
  | [] => exact ⟨fun h => (nomatch (h : Admits env root .nothing j)), fun h => (nomatch h)⟩
  | [s] =>
    show Admits env root s.term j ↔ _
    rw [admits_shape_term, List.mem_singleton]
  | s :: t :: ss =>
    show Admits env root (.or ((s :: t :: ss).map fun s => (0, s.term))) j ↔ _
    rw [admits_or_iff]
    constructor
    · rintro ⟨r, a, hm, ha⟩
      obtain ⟨s', hs', he⟩ := List.mem_map.mp hm
      cases he
      rw [admits_shape_term.mp ha]
      exact hs'
    · intro h
      exact ⟨0, j.shape.term, List.mem_map.mpr ⟨j.shape, h, rfl⟩, admits_shape_term.mpr rfl⟩

/-- `takers r` admits exactly the values of the types whose options
take `r`. -/
theorem admits_takers {r : Record} {j : Data} :
    Admits env root (takers r) j ↔ j.shape.takesAll r = true := by
  unfold takers
  split
  · rename_i h
    exact ⟨fun _ => List.all_eq_true.mp h _ (Shape.mem_all _), fun _ => admits_any_iff.mpr trivial⟩
  · rw [admits_anyOf, List.mem_filter]
    exact ⟨fun h => h.2, fun h => ⟨Shape.mem_all _, h⟩⟩

/-- A term whose type is known admits only values of that type. -/
theorem Val.shape?_sound {v : Val} {s : Shape} {j : Data} (hs : v.shape? = some s)
    (h : Admits env root v j) : j.shape = s := by
  cases v <;> simp only [Val.shape?, Option.some.injEq, reduceCtorEq] at hs <;> subst hs <;>
    cases h <;> rfl

/-- **A value held to a record** admits what the value admits, of the
types whose standard options take every option of the record. -/
theorem admits_heldTo {t : Record} {v : Val} {j : Data} :
    Admits env root (v.heldTo t) j ↔ Admits env root v j ∧ j.shape.takesAll t = true := by
  unfold Val.heldTo
  split
  · rename_i s hs
    split
    · rename_i ht
      exact ⟨fun h => ⟨judge_ride_iff.mp h, by rw [Val.shape?_sound hs (judge_ride_iff.mp h)]; exact ht⟩,
        fun h => judge_ride_iff.mpr h.1⟩
    · rename_i ht
      exact ⟨fun h => (nomatch h), fun h => absurd (Val.shape?_sound hs h.1 ▸ h.2) ht⟩
  · refine judge_ride_iff.trans ?_
    split
    · rename_i ha
      rw [isAny_eq ha]
      exact admits_takers.trans ⟨fun h => ⟨admits_any_iff.mpr trivial, h⟩, fun h => h.2⟩
    · exact admits_meet_iff.trans (and_congr Iff.rfl admits_takers)

/-- **What `gen(r)` admits**, held to its record: the values of each
type whose standard options take every option of `r`. It says nothing
else of the value. -/
theorem admits_annotation {r : Record} {j : Data} :
    Admits env root ((Val.any).heldTo r) j ↔ j.shape.takesAll r = true := by
  rw [admits_heldTo]
  exact ⟨fun h => h.2, fun h => ⟨admits_any_iff.mpr trivial, h⟩⟩

end

theorem Shape.term_checkableA (s : Shape) : s.term.CheckableA := by
  cases s <;> constructor

theorem Shape.anyOf_checkableA (ss : List Shape) : (Shape.anyOf ss).CheckableA := by
  match ss with
  | [] => exact .nothing
  | [s] => exact s.term_checkableA
  | s :: t :: ss =>
    refine .or fun r a h => ?_
    obtain ⟨s', _, he⟩ := List.mem_map.mp h
    cases he
    exact s'.term_checkableA

theorem takers_checkableA (r : Record) : (takers r).CheckableA := by
  unfold takers
  split
  · exact .any
  · exact Shape.anyOf_checkableA _

/-- The annotation is a term the checker can read. -/
theorem Val.annotation_checkableA (r : Record) : (Val.annotation r).CheckableA := by
  cases r with
  | nil => exact .any
  | cons m r => exact .ride .any

/-- Holding a value to a record keeps a term the checker reads one it
reads. -/
theorem Val.heldTo_checkableA {t : Record} {v : Val} (h : v.CheckableA) : (v.heldTo t).CheckableA := by
  unfold Val.heldTo
  split
  · split
    · exact .ride h
    · exact .nil
  · split
    · exact .ride (takers_checkableA _)
    · exact .ride (.meet h (takers_checkableA _))

/-! ## Two records unify -/

mutual
/-- Two pieces of data unified, as two records meet: two maps are the
members of both, a key both hold unified in turn; two lists of one
length unify element by element; and anything else unifies only with
itself, so a number only with the same number of the same leaf. -/
def Data.unify : Data → Data → Option Data
  | .map fs, .map gs => (unifyMembers fs gs).map .map
  | .list xs, .list ys => (unifyElems xs ys).map .list
  | x, y => if x = y then some x else none

/-- The members of two maps unified: each member of the first with the
second's member of its key, where it has one, then the second's other
members. -/
def unifyMembers : List (String × Data) → List (String × Data) → Option (List (String × Data))
  | [], gs => some gs
  | (k, x) :: fs, gs =>
    match lookup k gs with
    | some y =>
      match x.unify y, unifyMembers fs (gs.filter fun m => m.1 != k) with
      | some z, some rest => some ((k, z) :: rest)
      | _, _ => none
    | none =>
      match unifyMembers fs gs with
      | some rest => some ((k, x) :: rest)
      | none => none

/-- The elements of two lists unified, each with the other's at its
position; none where the lengths differ. -/
def unifyElems : List Data → List Data → Option (List Data)
  | [], [] => some []
  | x :: xs, y :: ys =>
    match x.unify y, unifyElems xs ys with
    | some z, some rest => some (z :: rest)
    | _, _ => none
  | _, _ => none
end

mutual
/-- Data with the members of each map in it in key order, so that one
record is one term whatever order it is written in. -/
def Data.sorted : Data → Data
  | .map fs => .map (sortMembers (sortedMembers fs))
  | .list xs => .list (sortedElems xs)
  | x => x

def sortedMembers : List (String × Data) → List (String × Data)
  | [] => []
  | (k, x) :: fs => (k, x.sorted) :: sortedMembers fs

def sortedElems : List Data → List Data
  | [] => []
  | x :: xs => x.sorted :: sortedElems xs
end

/-- Two records unified as maps, the result in key order; none where
they disagree. -/
def Record.unify (r s : Record) : Option Record :=
  (unifyMembers r s).map fun fs => sortMembers (sortedMembers fs)

/-! ## The argument -/

mutual
/-- A term as the data it spells out, read through the riders around
it: a literal, an address, a map whose members are each required and
such data, and a list of such data, neither with a spread. Anything
else spells out none: a kind, a preference, an optional member. -/
def Val.spelt? : Val → Option Data
  | .lit s => some s.data
  | .addr a => some (.addr a)
  | .map fs none _ => (speltFields? fs).map .map
  | .list items none _ => (speltItems? items).map .list
  | .ride _ v _ => v.spelt?
  | _ => none

def speltFields? : List (String × Bool × Val) → Option (List (String × Data))
  | [] => some []
  | (k, false, v) :: fs =>
    match v.spelt?, speltFields? fs with
    | some x, some rest => some ((k, x) :: rest)
    | _, _ => none
  | (_, true, _) :: _ => none

def speltItems? : List Val → Option (List Data)
  | [] => some []
  | v :: vs =>
    match v.spelt?, speltItems? vs with
    | some x, some rest => some (x :: rest)
    | _, _ => none
end

/-- The record `gen` reads from its argument in normal form: the
members of one map of concrete data, in key order, or `form` alone
where the argument is one string. -/
def Val.record? (v : Val) : Option Record :=
  match v.spelt? with
  | some (.map fs) => some (sortMembers (sortedMembers fs))
  | some (.str s) => some [("form", .str s)]
  | _ => none

end Aontu
