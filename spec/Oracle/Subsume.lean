import Oracle.Base

/-! The oracle's cases: Subsume, split out of `Oracle.lean` so that each area builds on its own. -/

open Aontu
open Case

/-! ## The ninth fragment: the order -/

/-- Maps and lists with a spread or a seal, and two divisors, for the
rows of `map_le_spread`, `list_le_spread` and `mulof_le_mulof`. -/
def spreadBases : List Val :=
  [.map [] (some .integer) false, .map [("x", false, .integer)] (some .integer) false,
    .map [("x", false, .integer)] none true, .map [("x", true, .integer)] (some .integer) true,
    .list [] (some .integer) false, .list [.integer] (some .integer) false,
    .mulof two, .mulof (.integer (.of 4))]

theorem spreadBases_checkable : ∀ v ∈ spreadBases, v.Checkable := by
  intro v hv
  simp only [spreadBases, List.mem_cons, List.mem_nil_iff, or_false] at hv
  rcases hv with rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl <;> checkable

/-- The values the `subsumption` rows compare pairwise: the first
fragment's level, the bases and each under a key, and the third
fragment's bases, `|` and `*` over scalars, kinds, bounds and sealed
lists. -/
def subVals : List Val := level1 ++ choiceBases ++ spreadBases

theorem subVals_checkable : ∀ v ∈ subVals, v.Checkable := by
  intro v hv
  rcases List.mem_append.1 hv with h | h
  · rcases List.mem_append.1 h with h | h
    · exact level1_checkable v h
    · exact choiceBases_checkable v h
  · exact spreadBases_checkable v h

/-- Every `subsumption` row is the definition's: where the procedure puts
the specific below the general it is below, and where an instance of the
pool admits the specific and refuses the general it is not. -/
theorem subsume_rows_exact : ∀ g ∈ subVals, ∀ s ∈ subVals,
    ((leDecF .empty 64 s g).isSome = true → s ⊑[.empty] g) ∧
    (∀ j ∈ subInstances, check s j = true → check g j = false → ¬ s ⊑[.empty] g) := by
  intro g hg s hs
  exact ⟨leDecF_sound, fun j hj h1 h2 =>
    not_le_of_witness (subVals_checkable s hs) (subVals_checkable g hg)
      (subInstances_wellFormed j hj) h1 h2⟩

/-- The rows of the values `subVals` compares pairwise. -/
def subsumeRows (tag : String) : IO Unit :=
  subsumePairRows tag (subVals.flatMap fun g => subVals.map fun s => (g, s))

/-! ## The `defaults` and `gen` profiles

Values that declare defaults, alone, under a key and at a position, for
the `defaults` profile, rows f0 on in the ninth fragment's file, and
values that carry marks, on a member, a position, a spread and a whole
map, for the `gen` profile, rows w0 on, each pool compared pairwise. -/

def defaultVals : List Val :=
  let d1 : Val := .or [(1, .lit (.num one)), (0, .number)]
  let d2 : Val := .or [(1, .lit (.num two)), (0, .number)]
  let mx (v : Val) : Val := .map [("x", false, v)] none false
  [.lit (.num one), .lit (.num two), .integer, .number, d1, d2,
    .or [(1, .lit (.num one)), (0, .integer)], .or [(0, .lit (.num one)), (0, .lit (.num two))],
    .or [(2, .lit (.num one)), (1, .lit (.num two)), (0, .number)], .pref 1 (.lit (.num one)),
    mx d1, mx d2, mx .number, mx (.lit (.num one)),
    .list [d1] none false, .list [.number] none false, .list [.lit (.num one)] none false]

def markVals : List Val :=
  let mx (v : Val) : Val := .map [("x", false, v)] none false
  let d1 : Val := .or [(1, .lit (.num one)), (0, .number)]
  [.integer, hide .integer, type .integer, mx .integer, mx (hide .integer), mx (type .integer),
    .map [("x", true, hide .integer)] none false, .list [.integer] none false,
    .list [hide .integer] none false, mx (.map [("y", false, hide (.lit (.num one)))] none false),
    mx (.map [("y", false, .lit (.num one))] none false), hide (mx .integer), d1, mx (hide d1),
    .map [] (some .integer) false, .map [] (some (hide .integer)) false]

/-- The instances that may tell two values of the profiles' pools apart. -/
def profileInstances : List Data :=
  subInstances ++ [.map [("x", .map [("y", .integer 1)])]]

theorem defaultVals_checkable : ∀ v ∈ defaultVals, v.Checkable := by decide

theorem markVals_checkable : ∀ v ∈ markVals, v.Checkable := by decide

theorem profileInstances_wellFormed : ∀ j ∈ profileInstances, j.WellFormed := by
  intro j hj
  rcases List.mem_append.1 hj with h | h
  · exact subInstances_wellFormed j h
  · rcases List.mem_singleton.1 h with rfl
    decide

/-- The positions of a term, as `Val.at` reads them, where the oracle
looks for one that refutes the `defaults` profile. -/
partial def segPaths (v : Val) : List (List Seg) :=
  [] :: match v.unride with
    | .map fs _ _ => fs.flatMap fun f => (segPaths f.2.2).map (.key f.1 :: ·)
    | .list items _ _ =>
      ((List.range items.length).zip items).flatMap fun (i, x) => (segPaths x).map (.idx i :: ·)
    | _ => []

/-- The positions of a term, as `Val.atM` reads them, a spread's among
them, where the oracle looks for one that refutes the `gen` profile. -/
partial def markPaths (v : Val) : List (List MarkSeg) :=
  [] :: match v.unride with
    | .map fs s _ =>
      (fs.flatMap fun f => (markPaths f.2.2).map (.key f.1 :: ·)) ++
        (match s with | some t => (markPaths t).map (.spread :: ·) | none => [])
    | .list items s _ =>
      (((List.range items.length).zip items).flatMap fun (i, x) => (markPaths x).map (.idx i :: ·)) ++
        (match s with | some t => (markPaths t).map (.spread :: ·) | none => [])
    | _ => []

/-- Every row of the profiles is the definition's: where the order holds
and the walk fails nowhere the profile's order holds, and where an
instance tells the two apart, or a position refutes what the profile
asks, it fails. -/
theorem profile_rows_exact (g s : Val) (hs : s.Checkable) (hg : g.Checkable) :
    ((leDecF .empty 64 s g).isSome = true → defaultsAt (normalise s) (normalise g) = true →
      defaultsBelow (normalise s) (normalise g) = true → DefaultsLe .empty s g) ∧
    (∀ j ∈ profileInstances, check s j = true → check g j = false → ¬ DefaultsLe .empty s g) ∧
    (∀ p, defaultsRefutesAt s g p = true → ¬ DefaultsLe .empty s g) ∧
    (DefaultsLe .empty s g → marksAt (normalise s) (normalise g) = true →
      marksBelow (normalise s) (normalise g) = true → GenLe .empty s g) ∧
    (¬ DefaultsLe .empty s g → ¬ GenLe .empty s g) ∧
    (∀ p, marksRefuteAt s g p = true → ¬ GenLe .empty s g) :=
  ⟨fun h h1 h2 => defaultsLe_of_walk (leDecF_sound h) h1 h2,
    fun j hj h1 h2 hd => not_le_of_witness hs hg (profileInstances_wellFormed j hj) h1 h2 hd.le,
    fun _ h => not_defaultsLe_of_refutes h,
    fun hd h1 h2 => genLe_of_walk hd h1 h2,
    fun h hg' => h hg'.defaults,
    fun _ h => not_genLe_of_refutes h⟩

/-- The `subsumption` rows of some pairs of values under the `defaults`
or the `gen` profile, each under the key `v`, the general first, with
the answers the profile's contract allows; a pair the definition leaves
undecided has no row. Each value is judged as a document reads it
(`Decls.readR`), so a marked list element is no element (decision 18). -/
def profilePairRows (tag : String) (pr : Profile) (pairs : List (Val × Val)) : IO Unit := do
  let name := match pr with | .values => "values" | .defaults => "defaults" | .gen => "gen"
  let mut i := 0
  for (g0, s0) in pairs do
    let some gsrc := g0.cell | throw (IO.userError "a value of the pool has no text")
    let some ssrc := s0.cell | throw (IO.userError "a value of the pool has no text")
    let g := Decls.readR [] g0
    let s := Decls.readR [] s0
    let ns := normalise s
    let ng := normalise g
    let dHolds := (leDecF .empty 64 s g).isSome && defaultsAt ns ng && defaultsBelow ns ng
    let dFails := profileInstances.any (fun j => check s j && !(check g j)) ||
      (segPaths ns).any (defaultsRefutesAt s g)
    let (holds, fails) := match pr with
      | .gen => (dHolds && marksAt ns ng && marksBelow ns ng,
          dFails || (markPaths ns).any (marksRefuteAt s g))
      | _ => (dHolds, dFails)
    if holds && fails then
      throw (IO.userError s!"a pair both holds and fails: {gsrc} over {ssrc}")
    let want? : Option String :=
      if holds then some "[\"subsumes\",\"undecided\"]"
      else if fails then some "[\"does_not_subsume\",\"undecided\"]"
      else none
    if let some want := want? then
      IO.println (tag ++ toString i ++ "\tsubsumption\tv: " ++ gsrc ++ "\tv: " ++ ssrc
        ++ "\t{\"verdict\":" ++ want ++ ",\"opts\":{\"profile\":\"" ++ name ++ "\"}}")
      i := i + 1

/-- The values the kinds are ordered against. -/
def kindSubVals : List Val :=
  kindBases ++ [.map [] none false, .list [] none false, field false .integer,
    field true .integer, .map [("x", false, .integer)] none true, .list [.integer] none false,
    .list [.integer] none true, .list [] none true, .map [] (some .integer) false,
    .list [] (some .integer) false, .any, Val.void, .string, .integer]

def isWord : Val → Bool
  | .mapKind | .listKind => true
  | _ => false

/-- The pairs with a kind on either side. -/
def kindPairs : List (Val × Val) :=
  kindSubVals.flatMap fun g =>
    (kindSubVals.filter fun s => isWord g || isWord s).map fun s => (g, s)

theorem kindSubVals_checkableB : ∀ v ∈ kindSubVals, v.checkableB = true := by decide

/-- Every row of the kinds' order is the definition's, as
`subsume_rows_exact` makes the ninth fragment's. -/
theorem kind_subsume_rows_exact : ∀ g ∈ kindSubVals, ∀ s ∈ kindSubVals,
    ((leDecF .empty 64 s g).isSome = true → s ⊑[.empty] g) ∧
    (∀ j ∈ subInstances, check s j = true → check g j = false → ¬ s ⊑[.empty] g) := by
  intro g hg s hs
  exact ⟨leDecF_sound, fun j hj h1 h2 =>
    not_le_of_witness ((Val.checkableB_iff s).1 (kindSubVals_checkableB s hs))
      ((Val.checkableB_iff g).1 (kindSubVals_checkableB g hg))
      (subInstances_wellFormed j hj) h1 h2⟩

/-- The values the `subsumption` rows k0 on compare: path values from the
root and from a relative start, one the prefix of another, `path`,
`string`, `any` and a string that spells an address. -/
def addrSubVals : List Val :=
  [.pathKind, addrAt 0 ["a"], addrAt 0 ["a", "b"], addrAt 0 ["b"], addrAt 1 ["a"],
    addrAt 1 ["a", "b"], .string, .any, .lit (.str "$.a")]

/-- The instances that may tell two of them apart: an address for each
value, and a string. -/
def addrInstances : List Data :=
  [.addr ⟨0, ["a"]⟩, .addr ⟨0, ["a", "b"]⟩, .addr ⟨0, ["b"]⟩, .addr ⟨1, ["a"]⟩,
    .addr ⟨1, ["a", "b"]⟩, .str "$.a", .str "a"]

theorem addrSubVals_checkable : ∀ v ∈ addrSubVals, v.Checkable := by decide

theorem addrInstances_wellFormed : ∀ j ∈ addrInstances, j.WellFormed := by decide

/-- Every path `subsumption` row is the definition's, as
`subsume_rows_exact` makes the others. -/
theorem addr_subsume_rows_exact : ∀ g ∈ addrSubVals, ∀ s ∈ addrSubVals,
    ((leDecF .empty 64 s g).isSome = true → s ⊑[.empty] g) ∧
    (∀ j ∈ addrInstances, check s j = true → check g j = false → ¬ s ⊑[.empty] g) := by
  intro g hg s hs
  exact ⟨leDecF_sound, fun j hj h1 h2 =>
    not_le_of_witness (addrSubVals_checkable s hs) (addrSubVals_checkable g hg)
      (addrInstances_wellFormed j hj) h1 h2⟩

/-- The pairs the `subsumption` rows ks0 on compare: string bounds that a
path's spelling reaches and ones it can't, each under `string` and under
`string & empty()`, which admit no path (#544). -/
def spellSubPairs : List (Val × Val) :=
  let bounds : List Val :=
    [.min (.str ""), .min (.str "/"), .min (.str "a"), .above (.str ""), .above (.str "/"),
      .max (.str "b"), .max (.str "#"), .beneath (.str "b"), .beneath (.str "$")]
  [Val.string, .anyString].flatMap fun g => bounds.map fun s => (g, s)

/-- The instances that may tell a pair apart: an address from the root
and one from a relative start, and the strings at the bounds' ends. -/
def spellSubInstances : List Data :=
  [.addr ⟨0, ["a"]⟩, .addr ⟨1, ["x"]⟩, .str "", .str "a", .str "#"]

theorem spellSubPairs_checkable : ∀ p ∈ spellSubPairs, p.1.Checkable ∧ p.2.Checkable := by
  decide

theorem spellSubInstances_wellFormed : ∀ j ∈ spellSubInstances, j.WellFormed := by decide

/-- Every such row is the definition's, as `subsume_rows_exact` makes the
others. -/
theorem spell_subsume_rows_exact : ∀ p ∈ spellSubPairs,
    ((leDecF .empty 64 p.2 p.1).isSome = true → p.2 ⊑[.empty] p.1) ∧
    (∀ j ∈ spellSubInstances, check p.2 j = true → check p.1 j = false →
      ¬ p.2 ⊑[.empty] p.1) := by
  intro p hp
  exact ⟨leDecF_sound, fun j hj h1 h2 =>
    not_le_of_witness (spellSubPairs_checkable p hp).2 (spellSubPairs_checkable p hp).1
      (spellSubInstances_wellFormed j hj) h1 h2⟩
