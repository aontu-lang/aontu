import Oracle.Base

/-! The oracle's cases: Verdicts, split out of `Oracle.lean` so that each area builds on its own. -/

open Aontu
open Case

/-- The cases of decision 9 of the design note's §7: a size met with a
container literal, the size's upper half refusing the literal's count or
admitting it, a literal short of its size, and members that arrive by
the data or by a second literal, and an optional member whose value
generates an empty map or list, which isn't counted (decision 19); and
a size that holds a disjunction or a preference, alone, met with a
literal and under a rider, ill-formed (decision 16), beside a choice
the meet, a dead arm or arms written alike settle to one arm, which
is that arm's size; and, beside a member that generates nothing, what
the meet refuses where it reads a container (#529): the data's
container too long for a size, two members alike under `unique()` or
at `unique("k")`'s key, and more than `contains` counts, each refused
at the meet, while a literal short of its size waits; a literal whose
member generates nothing yet, which waits, a nested container, which
counts, a clashing arm, which drops, and a clashing optional member. -/
def lenCases : List (Val × Data) :=
  let mp (fs : List (String × Bool × Val)) : Val := .map fs none false
  let xy : Val := mp [("x", false, int 1), ("y", false, int 2)]
  let dxy : Data := .map [("x", j 1), ("y", j 2)]
  let dxyz : Data := .map [("x", j 1), ("y", j 2), ("z", j 3)]
  let nt (t : Val) : Val := mp [("n", false, .any), ("t", false, t)]
  let dt (x : Data) : Data := .map [("t", x)]
  let d0 : Data := .map []
  [(.meet (.len (.max (nb 1))) xy, dxy),
    (.meet (.len (.max (nb 1))) (mp [("x", true, int 1), ("y", true, int 2)]), .map []),
    (.meet (.len (.max (nb 1))) (mp [("x", false, int 1), ("y", true, .integer)]), .map [("x", j 1)]),
    (.meet (.len (.max (nb 1))) (ls [int 1, int 2]), .list [j 1, j 2]),
    (.meet (.len (int 2)) (ls [int 1, int 2, int 3]), .list [j 1, j 2, j 3]),
    (.meet (.len (int 2)) (ls [int 1]), .list [j 1]),
    (.meet (.len (int 2)) (ls [int 1]), .list [j 1, j 2]),
    (.meet (.len (int 2)) (.list [int 1] none true), .list [j 1]),
    (.meet (.len (.max (nb 1))) (.map [("x", false, int 1), ("y", false, int 2)] none true), dxy),
    (.meet (.len (.max (nb 1))) (.map [("x", false, int 1), ("y", false, int 2)] (some .integer) false), dxy),
    (.meet (.len (.max (nb 2))) xy, dxy),
    (.meet (.len (.neq [nb 2])) xy, dxyz),
    (.meet (.len (.neq [nb 2])) (.meet xy (mp [("z", false, int 3)])), dxyz),
    (.meet (.len (.mulof (.integer ⟨3, by decide⟩))) (ls [int 1, int 2]), .list [j 1, j 2, j 3]),
    (.meet (.len (.above (nb 5))) (ls [int 1]), .list [j 1]),
    (.meet (.len (.max (nb 1))) (.list [] (some .integer) false), .list [j 1, j 2]),
    (.meet (.len (.max (nb 1))) (mp [("x", false, int 1), ("y", true, mp [])]), .map [("x", j 1)]),
    (.meet (.len (.max (nb 1))) (mp [("x", false, int 1), ("y", true, ls [])]), .map [("x", j 1)]),
    (.meet (.len (.max (nb 1))) (mp [("x", false, int 1), ("y", true, mp [("z", false, int 1)])]),
      .map [("x", j 1)]),
    (.len (.or [(0, int 1), (0, int 3)]), .list [j 1]),
    (.len (.or [(0, int 1), (0, int 3)]), .list [j 1, j 2]),
    (.meet (.len (.or [(0, int 1), (0, int 3)])) (ls [int 1]), .list [j 1]),
    (.len (.or [(0, .min (nb 1)), (0, .max (nb 3))]), .list [j 1]),
    (.len (.pref 1 (int 1)), .list [j 1]),
    (.len (.or [(1, int 1), (0, int 3)]), .list [j 1]),
    (.len (.meet (.min (nb 1)) (.or [(0, int 1), (0, int 3)])), .list [j 1]),
    (.len (.meet (.min (nb 1)) (.max (nb 3))), .list [j 1]),
    (.len (.ride .type (.or [(0, int 1), (0, int 3)]) []), .list [j 1]),
    (.len (.ride .metadata (.or [(0, int 1), (0, int 3)]) []), .list [j 1]),
    (.len (.ride .type (.pref 1 (int 1)) []), .list [j 1]),
    (.len (.ride .type (int 1) []), .list [j 1]),
    (.len (.ride .type (int 1) []), .list [j 1, j 2]),
    (.len (.or [(0, int 1), (0, int 1)]), .list [j 1]),
    (.len (.or [(0, int 1), (0, int 1)]), .list [j 1, j 2]),
    (.len (.meet (int 1) (.or [(0, int 1), (0, int 3)])), .list [j 1]),
    (.len (.or [(0, int 1), (0, .meet (int 1) (int 2))]), .list [j 1]),
    (.len (.or [(0, .meet (int 1) (int 2)), (0, int 3)]), .list [j 1]),
    (.len (.meet (.pref 1 (int 1)) (int 1)), .list [j 1]),
    (.len (.or [(0, .min (nb 1)), (0, .min (nb 1))]), .list [j 1]),
    (.len (.or [(0, .integer), (0, .integer)]), .list [j 1]),
    (.len (.or [(0, int 1), (0, .lit (.num (.float (.dyadic 1 0))))]), .list [j 1]),
    (.len (.or [(0, .meet (.min (nb 1)) (.max (nb 1))), (0, int 1)]), .list [j 1]),
    (.len (.or [(0, .meet (.min (nb 1)) (.max (nb 0))), (0, int 1)]), .list [j 1]),
    (nt (.len (int 1)), dt (.list [j 1, j 2])),
    (nt (.len (int 1)), dt (.map [("a", j 1), ("b", j 2)])),
    (nt (.len (int 3)), dt (.list [j 1, j 2])),
    (nt (.len (.neq [nb 2])), dt (.list [j 1, j 2])),
    (nt (.len (.beneath (nb 2))), dt (.list [j 1, j 2])),
    (nt (.len (.above (nb 2))), dt (.list [j 1, j 2])),
    (nt (ls [.len (int 1)]), dt (.list [.list [j 1, j 2]])),
    (nt (.meet (.len (int 1)) (.list [] (some .integer) false)), dt (.list [j 1, j 2])),
    (nt (.meet (.len (int 2)) (mp [("a", false, int 1)])), dt (.map [("b", j 2), ("c", j 3)])),
    (nt (.len (int 3)), dt (.str "ab")),
    (nt (.unique none), dt (.list [j 1, j 1])),
    (nt (.unique none), dt (.list [j 1, j 2])),
    (nt (.meet (.unique none) (ls [int 1, .integer])), dt (.list [j 1, j 1])),
    (nt (.unique (some "k")), dt (.list [.map [("k", j 1)], .map [("k", j 1)]])),
    (nt (.contains (int 1) (.max (nb 1))), dt (.list [j 1, j 1])),
    (nt (.contains (int 1) (int 0)), dt (.list [j 1])),
    (nt (.contains (int 1) (.min (nb 1))), dt (.list [j 2])),
    (nt (.meet (.contains (int 1) (.max (nb 1))) (ls [int 1, .integer])), dt (.list [j 1, j 1])),
    (nt (.meet (.len (int 1)) (ls [int 1, .integer])), d0),
    (nt (.meet (.len (int 1)) (ls [int 1, .string])), d0),
    (nt (.meet (.len (int 1)) (ls [int 1, .or [(0, int 2), (0, int 3)]])), d0),
    (nt (.meet (.len (int 1)) (ls [int 1, .or [(1, int 2), (0, int 3)]])), d0),
    (nt (.meet (.len (int 1)) (ls [int 1, mp [("a", false, .integer)]])), d0),
    (nt (.meet (.len (int 1)) (ls [int 1, ls [.integer]])), d0),
    (nt (.meet (.len (int 1)) (mp [("a", false, int 1), ("b", true, .integer)])), d0),
    (nt (.meet (.unique none) (ls [int 1, int 1])), d0),
    (nt (.meet (.unique none) (ls [.integer, .integer])), d0),
    (nt (.meet (.unique none) (ls [.or [(1, int 1), (0, int 2)], int 1])), d0),
    (nt (.meet (.unique none) (ls [mp [("a", false, .integer)], mp [("a", false, .integer)]])), d0),
    (nt (.meet (.unique (some "k")) (ls [mp [("k", false, int 1)], mp [("k", false, int 1)]])), d0),
    (nt (.meet (.contains (int 1) (.max (nb 1))) (ls [int 1, int 1])), d0),
    (nt (.meet (.contains (int 1) (.max (nb 1))) (ls [.integer, .integer])), d0),
    (nt (.or [(0, .meet (.len (int 1)) (ls [int 1, int 2])), (0, int 3)]), d0),
    (nt (.or [(0, .len (int 1)), (0, .listKind)]), dt (.list [j 1, j 2])),
    (nt (.or [(0, .len (int 1)), (0, .string)]), dt (.list [j 1, j 2])),
    (nt (.map [("a", true, .meet (.len (int 1)) (ls [int 1, int 2]))] none false), d0),
    (mp [("t", false, .len (int 1))], dt (.list [j 1, j 2])),
    (mp [("t", false, .or [(0, .meet (.len (int 1)) (ls [int 1, int 2])), (0, int 3)])], d0),
    (mp [("t", false, .or [(1, .meet (.len (int 1)) (ls [int 1, int 2])), (0, int 3)])], d0),
    (mp [("t", false, .or [(1, .meet (.len (int 1)) (ls [int 1, int 2])), (0, int 3)])], dt (j 3))]

theorem lenCases_checkable : ∀ c ∈ lenCases, (vetDoc c).1.CheckableA := by decide

theorem len_verdict_exact : ∀ c ∈ lenCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (lenCases_checkable c hc)) v

/-- The cases of decision 10 of the design note's §7: `hide()` and
`type()` on a member of a map, which the output leaves out while the
member still meets the data, the member absent and present, in conflict,
with a default, nested, beside a seal, as a spread, under a rider and in
a meet, and on the value at `v` itself. A disjunction of marked arms
carries no mark, one whose other arms are dead carries its live arm's,
and a refusal at generation reads a marked member. -/
def markCases : List (Val × Data) :=
  let mp (fs : List (String × Bool × Val)) : Val := .map fs none false
  let a (v : Val) : Val := mp [("a", false, v)]
  let da (x : Data) : Data := .map [("a", x)]
  let pick (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .or [(1, int n h), (0, .integer)]
  let b : Val := mp [("b", false, .integer)]
  let sealed : Val := .map [("a", false, hide .integer)] none true
  [(a (hide .integer), da (j 1)), (a (hide .integer), .map []), (a (hide .integer), da (.str "x")),
    (a (type .integer), .map []), (a (type .integer), da (.str "x")),
    (a (hide (pick 1)), .map []), (a (hide (pick 1)), da (j 2)),
    (type (mp [("x", false, .integer)]), .map [("x", j 1), ("y", j 2)]), (hide (a .integer), .map []),
    (a (hide (int 1)), da (j 2)), (a (hide (int 1)), .map []),
    (mp [("a", false, hide .integer), ("b", false, .integer)], .map [("b", j 1)]),
    (mp [("a", false, hide .integer), ("b", false, .integer)], .map []),
    (mp [("a", false, hide (int 1)), ("b", false, pick 2)], .map []),
    (a (mp [("b", false, hide .integer)]), da (.map [])),
    (sealed, .map []), (sealed, da (j 1)), (sealed, .map [("b", j 1)]),
    (mp [("a", true, hide .integer)], .map []),
    (.map [] (some (hide .integer)) false, da (j 1)), (.map [] (some (hide .integer)) false, da (.str "x")),
    (.map [] (some (hide b)) false, da (.map [])),
    (a (.ride .metadata (hide .integer) []), .map []), (a (hide (.ride .metadata .integer [])), .map []),
    (a (.ride .deprecate (hide .integer) []), .map []),
    (a (.meet (hide b) (mp [("c", false, .integer)])), da (.map [])),
    (a (type b), da (.map [])), (a (type b), da (.map [("c", j 1)])),
    (a (.meet (hide .integer) (int 1)), .map []), (a (.meet .integer (hide (int 1))), da (j 1)),
    (.meet (a .integer) (a (hide (int 1))), .map []), (.meet (a (hide .integer)) (a .integer), .map []),
    (.meet (a .number) (a (hide .integer)), .map []), (.meet (a .integer) (a (hide .integer)), .map []),
    (.meet (a .integer) (a (hide .number)), .map []),
    (a (hide (.nof (int 1) [.integer, .number])), da (j 1)),
    (a (hide (.nof (int 1) [.integer, .string])), da (j 1)),
    (a (.or [(0, hide (int 1)), (0, hide (int 2))]), .map []),
    (a (.or [(1, hide (int 1)), (0, .integer)]), .map []),
    (a (.or [(0, hide (int 1)), (0, .meet (int 2) (int 3))]), .map []),
    (a (.or [(0, hide (int 1)), (0, .meet (int 2) (int 3))]), da (j 2))]

theorem markCases_checkable : ∀ c ∈ markCases, (vetDoc c).1.CheckableA := by decide

theorem mark_verdict_exact : ∀ c ∈ markCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (markCases_checkable c hc)) v

/-- The cases of decision 18 of the design note's §7: a list holds no
position for an element a mark of its own leaves out, `hide()` or
`type()`, so each element after it moves up, for the data, another
list, a seal and a spread; a marked element before, between and after
the others, inside a list and through a meet; a list whose marked
element is a conflict, alone, met with the spread and in an arm; and a
disjunction of marked arms, which carries no mark and holds its
position, beside one whose other arm is dead, which carries its live
arm's; and a `key()` after a marked element, which reads the index its
element takes. -/
def markListCases : List (Val × Data) :=
  let h1 : Val := lst [hide (int 1), int 2]
  let mid : Val := lst [int 1, hide (int 2), int 3]
  let both : Val := .or [(0, hide (int 1)), (0, hide (int 2))]
  [(h1, dl [j 2]), (h1, dl [j 1, j 2]), (h1, dl []),
    (mid, dl [j 1, j 3]), (mid, dl [j 1, j 2, j 3]),
    (lst [type .integer, .lit (.str "a")], dl [.str "a"]), (lst [hide .integer], dl [.str "x"]),
    (lst [type (int 1), hide (int 2)], dl [j 5]),
    (.list [hide (int 1), int 2] none true, dl [j 2]), (.list [hide (int 1), int 2] none true, dl [j 2, j 3]),
    (.list [hide (int 1), int 2] (some .integer) false, dl [j 2, j 3]),
    (.list [hide (int 1), int 2] (some .integer) false, dl [j 1, j 2]),
    (.meet (lst [hide (int 1)]) (lst [int 2]), dl [j 2]), (.meet h1 (lst [hide (int 3), int 2]), dl [j 2]),
    (lst [.meet (hide (int 1)) (int 1), int 2], dl [j 2]),
    (lst [lst [hide (int 1)], int 2], dl [dl [.str "x"], j 2]),
    (lst [hide (.map [("a", false, .integer)] none false), int 1], dl [j 1]),
    (lst [hide (.or [(1, int 1), (0, .integer)]), int 2], dl []),
    (lst [hide (.meet (int 1) (int 2)), int 3], dl [j 3]), (lst [.meet (hide (int 1)) (int 2), int 3], dl [j 3]),
    (.list [hide (.lit (.str "a")), int 1] (some .integer) false, dl [j 1, j 2]),
    (.or [(0, lst [hide (.meet (int 1) (int 2)), int 3]), (0, lst [int 4])], dl [j 4]),
    (lst [both, int 3], dl [j 3]), (lst [both, int 3], dl [j 1, j 3]),
    (lst [.or [(0, hide (int 1)), (0, .meet (int 2) (int 3))], int 3], dl [j 3]),
    (lst [hide (int 1), .map [("k", false, .keyUp 1)] none false], dl [.map [("k", .str "0")]]),
    (lst [hide (int 1), .map [("k", false, .keyUp 1)] none false], dl [.map [("k", .str "1")]]),
    (lst [type (int 1), int 5, .map [("k", false, .keyUp 1)] none false], dl [j 5, .map [("k", .str "1")]])]

theorem markListCases_checkable : ∀ c ∈ markListCases, (vetDoc c).1.CheckableA := by decide

theorem mark_list_verdict_exact : ∀ c ∈ markListCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (markListCases_checkable c hc)) v

/-- The cases of decision 32 of the design note's §7: without the fill
the data passes where it is an instance of the schema as written, and a
disjunction admits what any arm admits, whatever the arm's rank, so an
arm beside the default that admits the data as written is enough: alone,
beside a member the default carries too, under a key beside a member the
data leaves out, at a position of a list, beside a list's next element
the data leaves out, an arm with an optional member, an arm of `null`,
an arm inside an arm, and arms of three ranks; and the cases where no
arm admits the data, where the default's members are what it lacks,
where the default is dead and another arm admits it, where every arm
admits it, and a disjunction with no default, which singles out
nothing. -/
def armCases : List (Val × Data) :=
  let mp (fs : List (String × Bool × Val)) : Val := .map fs none false
  let b1 : Val := mp [("b", false, int 1)]
  let b1c2 : Val := mp [("b", false, int 1), ("c", false, int 2)]
  let pick : Val := .or [(1, b1), (0, mp [])]
  [(pick, .map []), (.or [(1, b1c2), (0, mp [])], .map [("c", j 2)]),
    (.or [(1, int 1), (0, .integer)], j 2), (.or [(1, b1c2), (0, int 5)], .map [("c", j 2)]),
    (mp [("a", false, pick), ("x", false, int 1)], .map [("a", .map [])]),
    (ls [pick], .list [.map []]), (ls [.or [(1, b1), (0, .lit .null)], int 2], .list [.null]),
    (.or [(1, b1), (0, mp [("c", true, int 2)])], .map []), (.or [(1, b1), (0, .lit .null)], .null),
    (.or [(1, mp [("b", false, .or [(1, int 1), (0, mp [("c", false, int 2)])])]), (0, mp [("b", false, mp [])])],
      .map [("b", .map [])]),
    (.or [(2, b1), (1, mp [("c", false, int 1)]), (0, mp [])], .map []),
    (.or [(1, b1), (0, mp [("b", false, .integer)])], .map [("b", j 2)]),
    (pick, .map [("b", j 1)]), (.or [(0, b1), (0, mp [])], .map [])]

theorem armCases_checkable : ∀ c ∈ armCases, (vetDoc c).1.CheckableA := by decide

theorem arm_verdict_exact : ∀ c ∈ armCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (armCases_checkable c hc)) v

/-- A preference as an arm of a disjunction, which is the arm `x` of
rank one, read by position, with no parent type (#637): a map and a
list the data refuses beside an arm that refuses it too, and beside an
arm that admits it; a scalar; the arm that admits the data itself; the
same arm under a key and at a position of a list; and a lone
preference, which keeps its parent type, so `*{b: 1}` admits
`{b: 2}`. -/
def prefArmCases : List (Val × Data) :=
  let mp (fs : List (String × Bool × Val)) : Val := .map fs none false
  let b1 : Val := mp [("b", false, int 1)]
  let z : Val := .lit (.str "z")
  let b2 : Data := .map [("b", j 2)]
  [(.or [(1, b1), (0, z)], b2), (.or [(1, .list [int 1] none true), (0, z)], .list [j 2]),
    (.or [(1, b1), (0, mp [("c", false, int 1)])], b2),
    (.or [(1, .lit (.str "q")), (0, int 5)], .str "r"),
    (.or [(1, b1), (0, mp [("c", false, int 1)])], .map [("b", j 1)]),
    (.or [(1, b1), (0, mp [("b", false, .integer)])], b2),
    (mp [("a", false, .or [(1, b1), (0, z)])], .map [("a", b2)]),
    (.list [.or [(1, b1), (0, z)]] none false, .list [b2]),
    (.pref 1 b1, b2)]

theorem prefArmCases_checkable : ∀ c ∈ prefArmCases, (vetDoc c).1.CheckableA := by decide

theorem pref_arm_verdict_exact : ∀ c ∈ prefArmCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (prefArmCases_checkable c hc)) v

/-- Preferences that meet, each under a key the data leaves out, so that
the default mode reads the default (ruling 41): two of one rank whose
values meet fold into that meet, a scalar beside a kind, in a
disjunction and in a meet, and two maps; two of one rank whose values
admit nothing in common clash; of two ranks the lower one's default
wins and the higher one's still constrains, so that `*1 & **"s"` admits
nothing; a higher-rank scalar beside a lower-rank kind, which fills in
under the kind's default on either side (ruling 42); two kinds; a
disjunction's default met with a preference whose default it refuses;
and a higher-rank map whose member the data must write, as its
constraint holds. -/
def rankFoldCases : List (Val × Data) :=
  let mp (k : String) (v : Val) : Val := .map [(k, false, v)] none false
  let none : Data := .map []
  [(x (.meet (.pref 1 (int 1)) (.pref 1 .integer)), none),
    (x (.or [(1, int 1), (1, .integer)]), none),
    (x (.or [(1, mp "a" (int 1)), (1, mp "b" (int 2))]), none),
    (x (.meet (.pref 1 (mp "a" (int 1))) (.pref 1 (mp "b" (int 2)))), none),
    (x (.meet (.pref 1 (int 1)) (.pref 1 (int 7))), none),
    (x (.meet (.pref 1 (int 1)) (.pref 2 (int 7))), none),
    (x (.meet (.pref 1 (int 1)) (.pref 2 (.lit (.str "s")))), none),
    (x (.meet (.pref 1 (int 1)) (.pref 2 (.lit (.str "s")))), .map [("x", j 2)]),
    (x (.meet (.pref 2 (int 1)) (.pref 1 .integer)), none),
    (x (.meet (.pref 1 .integer) (.pref 1 (.min (.num (.integer (.of 0)))))), none),
    (x (.meet (.or [(1, int 1), (0, int 2)]) (.pref 1 .integer)), none),
    (x (.meet (.pref 1 (int 1)) (.pref 2 .integer)), .map [("x", j 5)]),
    (x (.meet (.pref 1 .integer) (.pref 2 (int 1))), none),
    (x (.meet (.pref 1 (mp "a" (int 1))) (.pref 2 (mp "b" (int 2)))), .map [("x", .map [("a", j 1)])]),
    (x (.meet (.pref 1 .integer) (.or [(1, int 1), (0, int 2)])), none),
    (x (.meet (.or [(0, int 1), (0, int 2)]) (.pref 1 .integer)), none),
    (x (.meet (.pref 1 .integer) (.or [(0, int 1), (0, int 2)])), none),
    (x (.meet (.or [(1, mp "a" (int 1)), (0, mp "c" (int 3))]) (.pref 1 (mp "b" (int 2)))), none),
    (x (.meet (.pref 1 (mp "b" (int 2))) (.or [(1, mp "a" (int 1)), (0, mp "c" (int 3))])), none),
    (x (.meet (.or [(1, mp "a" (int 1)), (0, mp "c" (int 3))]) (.or [(1, mp "b" (int 2)), (0, mp "d" (int 4))])),
      none),
    (x (.meet (.or [(1, int 1), (0, int 7)]) (.or [(1, int 7), (0, int 1)])), none),
    (x (.meet (.or [(1, int 1), (0, int 2)]) (.or [(1, int 7), (0, int 1)])), none),
    (x (.meet (.pref 1 (int 7)) (.pref 1 (int 1))), none)]

theorem rankFoldCases_checkable : ∀ c ∈ rankFoldCases, (vetDoc c).1.CheckableA := by decide

theorem rank_fold_verdict_exact : ∀ c ∈ rankFoldCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (rankFoldCases_checkable c hc)) v

/-- The numbers of decisions 70 and 71, each as the data writes it:
whole numbers each side of the integer leaf's window and of the
double's reach, a fraction, the negative zeros, a whole number written
with a fraction and with a negative exponent, and the exactness
budget's edges, a scale of 4096 either way and one past it. -/
def readNums : List NumText :=
  [⟨false, 1, 0, 2⟩, ⟨false, 1, 0, -5000⟩, ⟨false, 10, 1, 0⟩, ⟨false, 18446744073709551616, 0, 0⟩,
    ⟨false, 9007199254740993, 0, 0⟩, ⟨false, 9007199254740992, 0, 0⟩, ⟨false, 1, 0, 400⟩,
    ⟨false, 1, 1, 0⟩, ⟨false, 20, 0, -1⟩, ⟨true, 0, 0, 0⟩, ⟨true, 0, 1, 0⟩,
    ⟨true, 9223372036854775808, 0, 0⟩, ⟨false, 9223372036854775807, 0, 0⟩, ⟨false, 1, 0, 300⟩,
    ⟨false, 1, 0, -4096⟩, ⟨false, 1, 0, -4097⟩, ⟨false, 1, 0, 4096⟩, ⟨false, 1, 0, 4097⟩,
    ⟨false, 10, 0, 4096⟩, ⟨true, 15, 1, 0⟩]

/-- The exactness budget's other half, the digits of a fraction: 4096
of them and 4097, read against `number` alone. -/
def readLongNums : List NumText :=
  [⟨false, (10 ^ 4096 - 1) / 9, 4096, 0⟩, ⟨false, (10 ^ 4097 - 1) / 9, 4097, 0⟩]

/-- The kinds each number is read against, under the key `v`. -/
def readKinds : List Val := [.number, .integer, .float, .biginteger, .bigdecimal]

/-- A kind under the key `v`. -/
def readSchema (k : Val) : Val := .map [("v", false, k)] none false

/-- A kind under the key `v`, and a number written under it. -/
def readDoc (k : Val) (t : NumText) : Val × DataText := (readSchema k, .map [("v", .num t)])

theorem readKinds_checkable : ∀ k ∈ readKinds, (readSchema k).CheckableA := by decide

/-- Each reading row's verdict is `VetText`'s, by `vetText_iff`. -/
theorem read_verdict_exact : ∀ k ∈ readKinds, ∀ (t : NumText) (m : Mode) (v : Verdict),
    vetText m [] (readDoc k t).1 (readDoc k t).2 = v ↔
      VetText m [] (readDoc k t).1 (readDoc k t).2 v :=
  fun k hk _ _ v => vetText_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (readKinds_checkable k hk)) v

/-- The two read modes a reading row is printed in, with the options
each row writes. -/
def readModes : List (Mode × String) :=
  [(({} : Mode), ""), (({ exact := true } : Mode), ",\"opts\":{\"exactNumbers\":true}")]

/-- The reading rows: each number against each kind, the long fractions
against `number` alone, in both read modes, with the one class
`vetText` gives. -/
def readRows (tag : String) : IO Unit := do
  let mut i := 0
  let cases := readKinds.flatMap (fun k => readNums.map (k, ·)) ++ readLongNums.map (.number, ·)
  for (k, t) in cases do
    let some ksrc := k.cell | throw (IO.userError "a kind of the reading rows has no text")
    let (S, D) := readDoc k t
    for (m, opts) in readModes do
      IO.println (tag ++ toString i ++ "\tverdict\tv: " ++ ksrc ++ "\tv: " ++ t.text
        ++ "\t{\"verdict\":\"" ++ verdictName (vetText m [] S D) ++ "\"" ++ opts ++ "}")
      i := i + 1

/-- Schemas that hold a path value met with a string constraint the
address passes by its spelling, for the `verdict` rows ks0 on: the fill
supplies the address the data leaves out. -/
def spellVetCases : List (Val × Data) :=
  let n3 : Val := .lit (.num (.integer ⟨3, by decide⟩))
  [(x (.meet (addrAt 0 ["a"]) (.len n3)), .map []),
    (x (.meet (addrAt 0 ["a", "b"]) (.above (.str "$.a"))), .map []),
    (x (.meet (.max (.str "$.b")) (addrAt 0 ["a"])), .map [])]

theorem spellVetCases_checkable : ∀ c ∈ spellVetCases, (vetDoc c).1.CheckableA := by decide

theorem spell_verdict_exact : ∀ c ∈ spellVetCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (spellVetCases_checkable c hc)) v

/-- Schemas that hold a path value against data, for the `verdict` rows k0
on: a path the data leaves out, which the fill supplies, and a string
the data writes for it, which no path value admits, since no JSON text
reads as an address; `path` alone; and meets no value satisfies. -/
def addrVetCases : List (Val × Data) :=
  [(x (addrAt 0 ["a"]), .map []), (addrAt 0 ["a"], .str "$.a"), (x .pathKind, .map []),
    (.pathKind, .str "$.a"), (.map [("x", true, addrAt 0 ["a"])] none false, .map []),
    (x (.meet (addrAt 0 ["a"]) (addrAt 0 ["a", "b"])), .map []),
    (x (.meet (addrAt 0 ["a"]) (addrAt 0 ["b"])), .map []),
    (x (.meet (addrAt 0 ["a"]) (.lit (.str "$.a"))), .map []),
    (x (.meet .string (addrAt 0 ["a"])), .map []),
    (x (.meet .pathKind (.lit (.num (.integer (.of 1))))), .map []),
    (x (.or [(1, addrAt 0 ["a"]), (0, .pathKind)]), .map []),
    (x (.or [(0, addrAt 0 ["a"]), (0, addrAt 0 ["b"])]), .map []),
    (x (addrAt 1 ["a"]), .map []), (addrAt 0 ["a"], .integer 1),
    (x (.meet .pathKind (addrAt 0 ["a"])), .map []),
    (x (.list [addrAt 0 ["a"], addrAt 2 ["b"]] none false), .map [])]

theorem addrVetCases_checkable : ∀ c ∈ addrVetCases, (vetDoc c).1.CheckableA := by decide

theorem addr_verdict_exact : ∀ c ∈ addrVetCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (addrVetCases_checkable c hc)) v
