import Aontu.Names
import Aontu.Output

/-!
# Declarations in the meet

A document reads as its expansion: a reference to a name that is not
recursive is replaced by the meet of the name's bodies, read the same
way, and a reference to a recursive name stays as written, a residual.
A residual expands by one level each time the meet brings it against
concrete structure, a scalar, a kind, a bound, a literal, a map or a
list, and never against `any`, another reference or a connective, so a
recursion unfolds as far as the data goes and no further. Where no data
reaches it, a residual generates nothing, which `Gen` says of an alias.
-/

namespace Aontu

/-! ## The expansion -/

/-- The size of the bodies declared, summed. -/
def Decls.bodiesSize (ds : Decls) : ℕ := ds.foldl (fun acc d => acc + d.2.size) 0

/-! ## The seal on a definition

A reference reads a `type()` value as a definition and its copy as an
instance, which admits nothing the definition does not declare, at any
depth, once the definition's declarations are met (decision 10 of the
design note's §7). The copy is the expansion met with a restriction: a
sealed map that declares the keys the conjuncts' maps declare, each
optional and restricted in turn by its declarations, a sealed list the
same by position, and `any` where no conjunct is a container, so the
seal stops at a disjunction, a preference, a kind and a name, and at a
term held open (`open(v)`, decision 44), whose seals are lifted. The seal
follows a selection: the restriction of one is a selection on the same
scrutinee and patterns, of the restrictions of its results. -/

/-- The terms a meet joins, through the riders, as the seal reads them:
a term held open (`open(v)`) whole, and a bare `open()`, since the seal
stops at either. -/
def Val.sealConjuncts : Val → List Val
  | .meet a b => a.sealConjuncts ++ b.sealConjuncts
  | .ride .opened v r => [.ride .opened v r]
  | .ride .lifts v r => [.ride .lifts v r]
  | .ride _ v _ => v.sealConjuncts
  | .link v _ => v.sealConjuncts
  | v => [v]

/-- Whether a term is held open, written `open(v)`, or is a bare
`open()`, which holds every term at its place open (decision 44 of the
design note's §7). -/
def Val.heldOpen : Val → Bool
  | .ride .opened _ _ | .ride .lifts _ _ => true
  | _ => false

/-- The keys the maps among some terms declare, each once. -/
def declaredKeys (vs : List Val) : List String :=
  (vs.flatMap fun v => match v with
    | .map fs _ _ => fs.map (·.1)
    | _ => []).eraseDups

/-- The values the maps among some terms declare for a key. -/
def valuesAt (k : String) (vs : List Val) : List Val :=
  vs.flatMap fun v => match v with
    | .map fs _ _ => (fs.filter (·.1 == k)).map (·.2.2)
    | _ => []

/-- The elements the lists among some terms hold at a position. -/
def itemsAt (i : ℕ) (vs : List Val) : List Val :=
  vs.flatMap fun v => match v with
    | .list items _ _ => items[i]?.toList
    | _ => []

/-- The longest of the lists among some terms. -/
def listsLength (vs : List Val) : ℕ :=
  vs.foldl (fun n v => match v with
    | .list items _ _ => max n items.length
    | _ => n) 0

def isMapLit : Val → Bool
  | .map _ _ _ => true
  | _ => false

def isListLit : Val → Bool
  | .list _ _ _ => true
  | _ => false

def hasListSpread : Val → Bool
  | .list _ (some _) _ => true
  | _ => false

def isSelect : Val → Bool
  | .select _ _ _ => true
  | _ => false

/-- Whether a term is a choice, a disjunction or a lone preference: the
seal stops at one, and a directive beside one reaches each of its arms
(`Val.folds`). -/
def Val.choosesArm : Val → Bool
  | .or _ | .pref _ _ => true
  | _ => false

/-- What the seal adds to some conjuncts, within `f` levels: for a
selection among them, the selection of the restrictions of its results,
each met with the other conjuncts; and nothing at a level where a
conjunct is held open or is a choice. -/
def restrictF : ℕ → List Val → Val
  | 0, _ => .any
  | f + 1, vs =>
    let cs := vs.flatMap Val.sealConjuncts
    match cs.filter isSelect with
    | .select s arms d :: more =>
      let others := cs.filter (fun c => !isSelect c) ++ more
      .select s (arms.map fun a => (a.1, restrictF f (a.2 :: others)))
        (d.map fun x => restrictF f (x :: others))
    | _ =>
      if cs.any Val.heldOpen || cs.any Val.choosesArm then .any
      else if cs.any isMapLit then
        .map ((declaredKeys cs).map fun k => (k, true, restrictF f (valuesAt k cs))) none true
      else if cs.any isListLit then
        .list ((List.range (listsLength cs)).map fun i => restrictF f (itemsAt i cs))
          (if cs.any hasListSpread then some .any else none) true
      else .any

/-- The restriction a seal puts on a term. -/
def Val.restrict (v : Val) : Val := restrictF (v.size + 1) [v]

theorem Val.sealConjuncts_checkableA {v : Val} (h : v.CheckableA) :
    ∀ c ∈ v.sealConjuncts, c.CheckableA := by
  induction v using Val.sealConjuncts.induct with
  | case1 a b iha ihb =>
    cases h with
    | meet ha hb =>
      intro c hc
      simp only [Val.sealConjuncts, List.mem_append] at hc
      rcases hc with hc | hc
      · exact iha ha c hc
      · exact ihb hb c hc
  | case2 v r =>
    intro c hc
    simp only [Val.sealConjuncts, List.mem_singleton] at hc
    exact hc ▸ h
  | case3 v r =>
    intro c hc
    simp only [Val.sealConjuncts, List.mem_singleton] at hc
    exact hc ▸ h
  | case4 k v r hk hk' ih =>
    cases h with
    | ride hv =>
      intro c hc
      rw [Val.sealConjuncts.eq_4 k v r hk hk'] at hc
      exact ih hv c hc
  | case5 v t ih =>
    cases h with
    | link hv _ =>
      intro c hc
      simp only [Val.sealConjuncts] at hc
      exact ih hv c hc
  | case6 v h1 h2 h3 h4 h5 =>
    intro c hc
    rw [Val.sealConjuncts.eq_6 v h1 h2 h3 h4 h5, List.mem_singleton] at hc
    exact hc ▸ h

theorem Val.sealConjuncts_unguardedRefs {v c : Val} (hc : c ∈ v.sealConjuncts) {n : String}
    (hn : n ∈ c.unguardedRefs) : n ∈ v.unguardedRefs := by
  induction v using Val.sealConjuncts.induct with
  | case1 a b iha ihb =>
    simp only [Val.sealConjuncts, List.mem_append] at hc
    simp only [Val.unguardedRefs, List.mem_append]
    rcases hc with hc | hc
    · exact .inl (iha hc)
    · exact .inr (ihb hc)
  | case2 v r =>
    simp only [Val.sealConjuncts, List.mem_singleton] at hc
    exact hc ▸ hn
  | case3 v r =>
    simp only [Val.sealConjuncts, List.mem_singleton] at hc
    exact hc ▸ hn
  | case4 k v r hk hk' ih =>
    rw [Val.sealConjuncts.eq_4 k v r hk hk'] at hc
    simp only [Val.unguardedRefs]
    exact ih hc
  | case5 v t ih =>
    simp only [Val.sealConjuncts] at hc
    simp only [Val.unguardedRefs, List.mem_append]
    exact .inl (ih hc)
  | case6 v h1 h2 h3 h4 h5 =>
    rw [Val.sealConjuncts.eq_6 v h1 h2 h3 h4 h5, List.mem_singleton] at hc
    exact hc ▸ hn

theorem valuesAt_checkableA {k : String} {cs : List Val} (h : ∀ c ∈ cs, c.CheckableA) :
    ∀ w ∈ valuesAt k cs, w.CheckableA := by
  intro w hw
  obtain ⟨c, hc, hw⟩ := List.mem_flatMap.mp hw
  have hcA := h c hc
  cases c with
  | map fs sp cl =>
    obtain ⟨f, hf, rfl⟩ := List.mem_map.mp hw
    cases hcA with
    | map hfs _ => exact hfs f.1 f.2.1 f.2.2 (List.mem_filter.mp hf).1
  | _ => simp at hw

theorem itemsAt_checkableA {i : ℕ} {cs : List Val} (h : ∀ c ∈ cs, c.CheckableA) :
    ∀ w ∈ itemsAt i cs, w.CheckableA := by
  intro w hw
  obtain ⟨c, hc, hw⟩ := List.mem_flatMap.mp hw
  have hcA := h c hc
  cases c with
  | list items sp cl =>
    cases hcA with
    | list his _ => exact his w (List.mem_of_getElem? (by simpa using hw))
  | _ => simp at hw

theorem mem_of_filter_select {cs more : List Val} {s : Val} {arms : List (Val × Val)}
    {d : Option Val} (h : cs.filter isSelect = .select s arms d :: more) : .select s arms d ∈ cs := by
  have : Val.select s arms d ∈ cs.filter isSelect := by rw [h]; simp
  exact (List.mem_filter.mp this).1

theorem mem_restrictOthers {cs more : List Val} {s : Val} {arms : List (Val × Val)}
    {d : Option Val} (h : cs.filter isSelect = .select s arms d :: more) {w : Val}
    (hw : w ∈ cs.filter (fun c => !isSelect c) ++ more) : w ∈ cs := by
  rcases List.mem_append.mp hw with hw | hw
  · exact (List.mem_filter.mp hw).1
  · have : w ∈ cs.filter isSelect := by rw [h]; exact List.mem_cons_of_mem _ hw
    exact (List.mem_filter.mp this).1

/-- The restriction reaches no name the conjuncts do not. -/
theorem restrictF_unguardedRefs : ∀ (f : ℕ) (vs : List Val) {n : String},
    n ∈ (restrictF f vs).unguardedRefs → ∃ v ∈ vs, n ∈ v.unguardedRefs
  | 0, _, _, h => by simp [restrictF, Val.unguardedRefs] at h
  | f + 1, vs, n, h => by
    have hcs : ∀ c ∈ vs.flatMap Val.sealConjuncts, ∀ m, m ∈ c.unguardedRefs →
        ∃ v ∈ vs, m ∈ v.unguardedRefs := fun c hc m hm => by
      obtain ⟨v, hv, hc⟩ := List.mem_flatMap.mp hc
      exact ⟨v, hv, Val.sealConjuncts_unguardedRefs hc hm⟩
    simp only [restrictF] at h
    split at h
    · next s arms d more hsel =>
      have hc := hcs _ (mem_of_filter_select hsel)
      simp only [Val.unguardedRefs, List.mem_append] at hc h
      rcases h with (h | h) | h
      · exact hc n (.inl (.inl h))
      · obtain ⟨p, r, hm, hpr⟩ := mem_unguardedPairs.mp h
        obtain ⟨a, ha, he⟩ := List.mem_map.mp hm
        simp only [Prod.mk.injEq] at he
        obtain ⟨rfl, rfl⟩ := he
        rcases hpr with hp | hr
        · exact hc n (.inl (.inr (mem_unguardedPairs.mpr ⟨a.1, a.2, ha, .inl hp⟩)))
        · obtain ⟨w, hw, hn⟩ := restrictF_unguardedRefs f _ hr
          rcases List.mem_cons.mp hw with rfl | hw
          · exact hc n (.inl (.inr (mem_unguardedPairs.mpr ⟨a.1, a.2, ha, .inr hn⟩)))
          · exact hcs w (mem_restrictOthers hsel hw) n hn
      · cases d with
        | none => simp [unguardedSpread] at h
        | some x =>
          simp only [Option.map_some, unguardedSpread] at h hc
          obtain ⟨w, hw, hn⟩ := restrictF_unguardedRefs f _ h
          rcases List.mem_cons.mp hw with rfl | hw
          · exact hc n (.inr hn)
          · exact hcs w (mem_restrictOthers hsel hw) n hn
    · split at h
      · simp [Val.unguardedRefs] at h
      · split at h
        · simp [Val.unguardedRefs] at h
        · split at h <;> simp [Val.unguardedRefs] at h

theorem restrictF_checkableA : ∀ (f : ℕ) (vs : List Val), (∀ v ∈ vs, v.CheckableA) →
    (restrictF f vs).CheckableA
  | 0, _, _ => .any
  | f + 1, vs, hvs => by
    have hcs : ∀ c ∈ vs.flatMap Val.sealConjuncts, c.CheckableA := fun c hc => by
      obtain ⟨v, hv, hc⟩ := List.mem_flatMap.mp hc
      exact Val.sealConjuncts_checkableA (hvs v hv) c hc
    simp only [restrictF]
    split
    · next s arms d more hsel =>
      have hres : ∀ x, x.CheckableA → ∀ w ∈ x :: ((vs.flatMap Val.sealConjuncts).filter
          (fun c => !isSelect c) ++ more), w.CheckableA := fun x hx w hw => by
        rcases List.mem_cons.mp hw with rfl | hw
        · exact hx
        · exact hcs w (mem_restrictOthers hsel hw)
      have hsA := hcs _ (mem_of_filter_select hsel)
      cases hsA with
      | selectKey hp hr hd =>
        refine .selectKey (fun p r hm => ?_) (fun p r hm => ?_) (fun e he => ?_)
        · obtain ⟨a, ha, he⟩ := List.mem_map.mp hm
          simp only [Prod.mk.injEq] at he
          obtain ⟨rfl, -⟩ := he
          exact hp a.1 a.2 ha
        · obtain ⟨a, ha, he⟩ := List.mem_map.mp hm
          simp only [Prod.mk.injEq] at he
          obtain ⟨-, rfl⟩ := he
          exact restrictF_checkableA f _ (hres a.2 (hr a.1 a.2 ha))
        · obtain ⟨x, hx, rfl⟩ := Option.map_eq_some_iff.mp he
          exact restrictF_checkableA f _ (hres x (hd x hx))
      | selectLit hp hr hd =>
        refine .selectLit (fun p r hm => ?_) (fun p r hm => ?_) (fun e he => ?_)
        · obtain ⟨a, ha, he⟩ := List.mem_map.mp hm
          simp only [Prod.mk.injEq] at he
          obtain ⟨rfl, -⟩ := he
          exact hp a.1 a.2 ha
        · obtain ⟨a, ha, he⟩ := List.mem_map.mp hm
          simp only [Prod.mk.injEq] at he
          obtain ⟨-, rfl⟩ := he
          exact restrictF_checkableA f _ (hres a.2 (hr a.1 a.2 ha))
        · obtain ⟨x, hx, rfl⟩ := Option.map_eq_some_iff.mp he
          exact restrictF_checkableA f _ (hres x (hd x hx))
    · split
      · exact .any
      · split
        · refine .map (fun k o w hm => ?_) (fun _ h => nomatch h)
          obtain ⟨k', hk, he⟩ := List.mem_map.mp hm
          simp only [Prod.mk.injEq] at he
          obtain ⟨-, -, rfl⟩ := he
          exact restrictF_checkableA f _ (valuesAt_checkableA hcs)
        · split
          · refine .list (fun w hm => ?_) (fun s hs => ?_)
            · obtain ⟨i, -, rfl⟩ := List.mem_map.mp hm
              exact restrictF_checkableA f _ (itemsAt_checkableA hcs)
            · split at hs
              · cases hs; exact .any
              · exact nomatch hs
          · exact .any

/-- The expansion of a term, within `k` turns: a reference to a name
that is not recursive is replaced by the meet of its bodies, expanded in
turn and sealed where the name is a definition; a reference to a
recursive name, or to no name, stays. A rider's body reads as the rider
has it read (`Rider.reads`), so `open(v)` reads `v`, expanded, with
every seal lifted, the seal of a definition's instance among them. -/
def expandF (ds : Decls) : ℕ → Val → Val
  | 0, v => v
  | k + 1, v =>
    match v with
    | .alias n =>
      if ds.recursiveB n then .alias n
      else
        match ds.env n with
        | some b =>
          let e := expandF ds k b
          if ds.typed n then .meet e e.restrict else e
        | none => .alias n
    | .len c => .len (expandF ds k c)
    | .map fs spread closed =>
      .map (fs.map fun f => (f.1, f.2.1, expandF ds k f.2.2)) (spread.map (expandF ds k)) closed
    | .list items spread closed =>
      .list (items.map (expandF ds k)) (spread.map (expandF ds k)) closed
    | .or arms => .or (arms.map fun p => (p.1, expandF ds k p.2))
    | .pref r x => .pref r (expandF ds k x)
    | .meet a b => .meet (expandF ds k a) (expandF ds k b)
    | .nof n cs => .nof (expandF ds k n) (cs.map (expandF ds k))
    | .must c m => .must (expandF ds k c) m
    | .when c t e => .when (expandF ds k c) (expandF ds k t) (e.map (expandF ds k))
    | .contains c n => .contains (expandF ds k c) (expandF ds k n)
    | .rest t cs =>
      .rest (expandF ds k t)
        (cs.map fun c => (c.1.map (expandF ds k), c.2.1.map (expandF ds k), c.2.2.map (expandF ds k)))
    | .select s arms d =>
      .select (expandF ds k s) (arms.map fun a => (expandF ds k a.1, expandF ds k a.2)) (d.map (expandF ds k))
    | .filter s c => .filter (expandF ds k s) (expandF ds k c)
    | .call f args => .call f (args.map (expandF ds k))
    | .ride t v r => .ride t (t.reads (expandF ds k v)) r
    | .link v t => .link (expandF ds k v) (expandF ds k t)
    | v => v

/-! ## Disjunctions met at one place -/

/-- Two nodes' arms met as written, the left one's outermost: each arm of
`as` keeping its rank over the arms of `bs` it meets, each pair met in
the order written, and an arm of rank `0` opening into them
(`flattenArm`). -/
def outerMeet (as bs : List (ℕ × Val)) : List (ℕ × Val) :=
  (as.map fun p => (p.1, Val.or (bs.map fun q => (q.1, Val.meet p.2 q.2)))).flatMap flattenArm

/-- `outerMeet` with the right one's arms outermost. -/
def outerMeetR (as bs : List (ℕ × Val)) : List (ℕ × Val) :=
  (bs.map fun q => (q.1, Val.or (as.map fun p => (p.1, Val.meet p.2 q.2)))).flatMap flattenArm

/-- The arms `tieArms` makes of two nodes' arms that lead with the rank
`r`, each pair met as written: the defaults' meets at rank `r`, and the
arms that keep one side's default alone at rank `k`. -/
def tieMeetArms (r k : ℕ) (as bs : List (ℕ × Val)) : List (ℕ × Val) :=
  (as.filter fun p => p.1 == r).flatMap
      (fun p => (bs.filter fun p => p.1 == r).map fun q => (r, Val.meet p.2 q.2)) ++
    (as.filter fun p => p.1 == r).map
      (fun p => (k, Val.or ((bs.filter fun p => p.1 != r).map fun q => (q.1, Val.meet p.2 q.2)))) ++
    (bs.filter fun p => p.1 == r).map
      (fun q => (k, Val.or ((as.filter fun p => p.1 != r).map fun p => (p.1, Val.meet p.2 q.2))))

/-- Two nodes' arms that lead with the rank `r` met as `nodeTie` meets
them (decision 43), each pair met as written and `rest` the other arms
of the two met: where a default of each meets one of the other's
(`meet`), the arms `tieMeetArms` makes, one rank weaker for one side's
default alone, as one arm of rank `r`; where none does, those arms at
rank `r` themselves. -/
def tieMeet (r : ℕ) (rest as bs : List (ℕ × Val)) : List (ℕ × Val) :=
  if (as.filter fun p => p.1 == r).any
      (fun p => (bs.filter fun p => p.1 == r).any fun q => !(meet p.2 q.2).dead) then
    (r, Val.or (tieMeetArms r (r + 1) as bs)) :: rest
  else tieMeetArms r r as bs ++ rest

/-- Two nodes' arms met, within `n` levels, each pair met as written and
ranked as the meet ranks them (`meetNodesN`): the one that leads with
the stronger rank outermost, one with no default inside one with a
default, and two that lead with one rank as `tieMeet` meets them. -/
def orMeetF : ℕ → List (ℕ × Val) → List (ℕ × Val) → List (ℕ × Val)
  | 0, as, bs => outerMeet as bs
  | n + 1, as, bs =>
    match pickRank as, pickRank bs with
    | some ra, some rb =>
      if ra < rb then outerMeet as bs
      else if rb < ra then outerMeetR as bs
      else tieMeet ra (orMeetF n (as.filter fun p => p.1 != ra) (bs.filter fun p => p.1 != ra)) as bs
    | some _, none => outerMeet as bs
    | none, some _ => outerMeetR as bs
    | none, none => outerMeet as bs

/-- Two nodes met, as one: the meet of each arm of the first with each
arm of the second, ranked as the meet ranks them (`orMeetF`). -/
def orMeet (as bs : List (ℕ × Val)) : List (ℕ × Val) := orMeetF (as.length + bs.length) as bs

/-! ## Directives on a place

A bare `open()` and a bare `close()` are directives on their place
(decision 44 of the design note's §7), read once a term's names are
expanded and before any meet. A place is the document's root, a map's
member and a list's element, and a spread's template, a disjunction's
arm and a preference's value, each a place of its own: the terms at a
member are what each map among the terms at its parent declares for its
key, across statements and meets, and an element's the same by index.
`open()` holds every term at its place open, every seal in it lifted, as
`open(v)` does; then `close()` seals the place's terms as met, as the
seal on an instance does (`restrictF`), its own level whatever holds it
open, and every level beneath it but those held open. The places beneath
a place are read first, so an `open()` lifts the seal a `close()`
beneath it makes, and a `close()` stops at an `open()` beneath it. A
place whose terms hold a choice, and a directive at the place or beneath
it, reads as one disjunction (decision 45): each combination of the
choices' arms, ranked as the meet ranks them, met with every other term
at the place and read as a place of its own, so that a directive reaches
every combination with the keys that combination declares. -/

/-- Whether a term standing at a place writes the directive `k` there:
through meets, riders and links. -/
def Val.directs (k : Rider) : Val → Bool
  | .meet a b => a.directs k || b.directs k
  | .ride k' v _ => k' == k || v.directs k
  | .link v _ => v.directs k
  | _ => false

/-- The terms a term written at a place holds there, whose members stand
at the places beneath it: through meets, riders and links, a directive
kept whole. -/
def Val.placeTerms : Val → List Val
  | .meet a b => a.placeTerms ++ b.placeTerms
  | .ride .lifts v r => [.ride .lifts v r]
  | .ride .seals v r => [.ride .seals v r]
  | .ride _ v _ => v.placeTerms
  | .link v _ => v.placeTerms
  | v => [v]

/-- A container's members each held open, as a term held open holds
them. -/
def Val.membersOpen : Val → Val
  | .map fs s c => .map (fs.map fun f => (f.1, f.2.1, .ride .opened f.2.2 [])) s c
  | .list items s c => .list (items.map fun x => .ride .opened x []) s c
  | v => v

/-- The terms a bare `close()` seals at its own level: each conjunct, a
term held open read through and its members held open in turn, so that
the seal holds its own level whatever holds it open, and stops beneath
it where a term is held open. -/
def Val.closeConjuncts : Val → List Val
  | .meet a b => a.closeConjuncts ++ b.closeConjuncts
  | .ride .opened v _ => v.closeConjuncts.map Val.membersOpen
  | .ride _ v _ => v.closeConjuncts
  | .link v _ => v.closeConjuncts
  | v => [v]

/-- The seal a bare `close()` meets into its place, whose terms are
`vs`: the restriction of the terms, as an instance's seal is, read at
its own level through every term held open. -/
def closeSeal (vs : List Val) : Val :=
  restrictF (vs.foldl (fun n v => n + v.size) 0 + 1) (vs.flatMap Val.closeConjuncts)

/-- A term standing at a place whose terms are `all`, the places beneath
it read already (`w`): held open, every seal in it lifted, where a bare
`open()` stands among the terms, and met with the place's seal
(`closeSeal`) where a bare `close()` does, read from the terms as held
open there. -/
def Val.atPlace (all : List Val) (w : Val) : Val :=
  let lift := all.any (Val.directs .lifts)
  let w' := if lift then Val.ride .opened w.unseal [] else w
  if all.any (Val.directs .seals) then
    .meet w' (closeSeal (if lift then all.map fun t => .ride .opened t [] else all))
  else w'

mutual
/-- Whether a term writes a directive at its place or at a place beneath
it: through meets, riders and links, members, elements, spreads' templates,
arms and a preference's value. -/
def Val.holdsDir : Val → Bool
  | .meet a b => a.holdsDir || b.holdsDir
  | .ride .lifts _ _ => true
  | .ride .seals _ _ => true
  | .ride _ v _ => v.holdsDir
  | .link v _ => v.holdsDir
  | .map fs s _ => holdsDirFields fs || holdsDirSpread s
  | .list items s _ => holdsDirItems items || holdsDirSpread s
  | .or arms => holdsDirArms arms
  | .pref _ x => x.holdsDir
  | _ => false
termination_by structural v => v

def holdsDirFields : List (String × Bool × Val) → Bool
  | [] => false
  | (_, _, v) :: fs => v.holdsDir || holdsDirFields fs
termination_by structural fs => fs

def holdsDirItems : List Val → Bool
  | [] => false
  | v :: vs => v.holdsDir || holdsDirItems vs
termination_by structural vs => vs

def holdsDirArms : List (ℕ × Val) → Bool
  | [] => false
  | (_, a) :: as => a.holdsDir || holdsDirArms as
termination_by structural as => as

def holdsDirSpread : Option Val → Bool
  | none => false
  | some t => t.holdsDir
termination_by structural s => s
end

/-- The choices a term written at a place holds there, each as its arms:
through meets, riders and links, each arm under the riders and links its
choice stands under, and a lone preference `*x` as `x | super(x)`, as
the meet reads one (`Val.armsOf`). -/
def Val.placeChoices : Val → List (List (ℕ × Val))
  | .meet a b => a.placeChoices ++ b.placeChoices
  | .ride .lifts _ _ => []
  | .ride .seals _ _ => []
  | .ride k v r => v.placeChoices.map (·.map fun p => (p.1, .ride k p.2 r))
  | .link v t => v.placeChoices.map (·.map fun p => (p.1, .link p.2 t))
  | .or arms => [arms]
  | .pref r x => [[(r, x), (0, x.super)]]
  | _ => []

/-- A term written at a place with each choice it holds there read as
`any`, the term every combination of the choices' arms meets
(`foldPlace`). -/
def Val.unchosen : Val → Val
  | .meet a b => .meet a.unchosen b.unchosen
  | .ride .lifts v r => .ride .lifts v r
  | .ride .seals v r => .ride .seals v r
  | .ride k v r => .ride k v.unchosen r
  | .link v t => .link v.unchosen t
  | .or _ => .any
  | .pref _ _ => .any
  | v => v

/-- The choices at one place met: each combination of their arms, met
as written and ranked as the meet ranks them (`orMeet`). -/
def choicesMet : List (List (ℕ × Val)) → List (ℕ × Val)
  | [] => []
  | c :: cs => cs.foldl orMeet c

/-- Whether a place whose written terms are `all` reads as one
disjunction (`foldPlace`, decision 45 of the design note's §7): one of
them holds a choice there, and one writes a directive at the place or
beneath it (`Val.holdsDir`). -/
def Val.folds (all : List Val) : Bool :=
  !(all.flatMap Val.placeChoices).isEmpty && all.any Val.holdsDir

/-- Whether `t` is the first term written at a place, which carries the
disjunction a place that folds reads as, since that disjunction holds
every term written there. -/
def Val.leads (all : List Val) (t : Val) : Bool :=
  match all with
  | u :: _ => u.beq t
  | [] => false

/-- The disjunction a place that folds reads as, its written terms `all`:
each combination of its choices' arms (`choicesMet`), met with every
term written there, its choices read as `any` (`Val.unchosen`), and read
by `rd` as a place of its own, so that a directive among the terms
reaches each combination and seals it with the keys it declares. -/
def foldPlace (rd : Val → Val) (all : List Val) : Val :=
  .or ((choicesMet (all.flatMap Val.placeChoices)).map
    fun p => (p.1, rd (.meet p.2 ((all.map Val.unchosen).foldl Val.meet .any))))

/-- A term `t` written at a place whose written terms are `all`, the
places beneath it read already (`w`): where the place folds, the
disjunction it reads as for the term that leads (`Val.leads`) and `any`
for the others, which that disjunction holds; elsewhere the term with
the place's directives on it (`Val.atPlace`). -/
def Val.directedAt (rd : Val → Val) (all : List Val) (t w : Val) : Val :=
  if Val.folds all then (if Val.leads all t then foldPlace rd all else .any)
  else Val.atPlace all w

/-- The templates of the spreads of the maps among some terms, each of
which reaches every member, a declared one too. -/
def mapSpreads (vs : List Val) : List Val :=
  vs.flatMap fun v => match v with
    | .map _ (some t) _ => [t]
    | _ => []

/-- The templates of the spreads of the lists among some terms, each of
which reaches every element. -/
def listSpreads (vs : List Val) : List Val :=
  vs.flatMap fun v => match v with
    | .list _ (some t) _ => [t]
    | _ => []

/-- The terms at a member, under the terms `cs` at its parent: what each
map among them declares for its key, and each map's spread's template
read at that key, since the template reaches the member too. -/
def memberTerms (k : String) (cs : List Val) : List Val :=
  valuesAt k cs ++ (mapSpreads cs).map (Val.atKey k)

/-- The terms at an element: what each list among `cs` holds at its
position, and each list's spread's template read at that position. -/
def elementTerms (i : ℕ) (cs : List Val) : List Val :=
  itemsAt i cs ++ (listSpreads cs).map (Val.atKey (toString i))

/-- A term `x` a spread's template reads as for the members of no key in
`ks`: `any` for a member a key there names, chosen by the member's own
key (`key()`), so that the template's own place speaks for the members
no term declares, a declared member's place reading the template among
its own terms (`memberTerms`). -/
def exceptKeys (ks : List String) (x : Val) : Val :=
  if ks.isEmpty then x else .select .key (ks.map fun k => (.lit (.str k), .any)) (some x)

/-- A spread's template `t` written at the place the templates `all`
share, its places beneath read already (`w`): as `Val.directedAt` reads
a term, the seal, or the disjunction a place that folds reads as, for
the members of no key in `ks` alone (`exceptKeys`). -/
def Val.directedSpread (rd : Val → Val) (ks : List String) (all : List Val) (t w : Val) : Val :=
  if Val.folds all then (if Val.leads all t then exceptKeys ks (foldPlace rd all) else .any)
  else
    let lift := all.any (Val.directs .lifts)
    let w' := if lift then Val.ride .opened w.unseal [] else w
    if all.any (Val.directs .seals) then
      .meet w' (exceptKeys ks (closeSeal (if lift then all.map fun t => .ride .opened t [] else all)))
    else w'

mutual
/-- A term written at a place whose terms hold the conjuncts `cs`, read
with the directives on the places beneath it (`Val.directedAt`): a
member at the place its key names, whose terms are what each map among
`cs` declares for the key and each map's spread's template, which
reaches it (`memberTerms`), an element at its index the same, a spread's
template at the place the templates share, for the members no term
declares (`Val.directedSpread`), and a disjunction's arm and a
preference's value each at a place of its own. A directive reads as
`any`, a term held open,
`open(v)`, has the seals its places' directives make lifted too, and
`rd` reads the arms of a place that folds. -/
def Val.dirIn (rd : Val → Val) (cs : List Val) : Val → Val
  | .meet a b => .meet (a.dirIn rd cs) (b.dirIn rd cs)
  | .ride .lifts _ _ => .any
  | .ride .seals _ _ => .any
  | .ride .opened v r => .ride .opened (v.dirIn rd cs).unseal r
  | .ride k v r => .ride k (v.dirIn rd cs) r
  | .link v t => .link (v.dirIn rd cs) t
  | .map fs s c => .map (dirFields rd cs fs) (dirSpread rd (mapSpreads cs) (declaredKeys cs) s) c
  | .list items s c =>
    .list (dirItems rd cs 0 items)
      (dirSpread rd (listSpreads cs) ((List.range (listsLength cs)).map toString) s) c
  | .or arms => .or (dirArms rd arms)
  | .pref r x => .pref r (Val.directedAt rd [x] x (x.dirIn rd x.placeTerms))
  | v => v
termination_by structural v => v

def dirFields (rd : Val → Val) (cs : List Val) : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs =>
    (k, o, Val.directedAt rd (memberTerms k cs) v (v.dirIn rd ((memberTerms k cs).flatMap Val.placeTerms))) ::
      dirFields rd cs fs
termination_by structural fs => fs

def dirItems (rd : Val → Val) (cs : List Val) (i : ℕ) : List Val → List Val
  | [] => []
  | v :: vs =>
    Val.directedAt rd (elementTerms i cs) v (v.dirIn rd ((elementTerms i cs).flatMap Val.placeTerms)) ::
      dirItems rd cs (i + 1) vs
termination_by structural vs => vs

def dirSpread (rd : Val → Val) (ts : List Val) (ks : List String) : Option Val → Option Val
  | none => none
  | some t => some (Val.directedSpread rd ks ts t (t.dirIn rd (ts.flatMap Val.placeTerms)))
termination_by structural s => s

def dirArms (rd : Val → Val) : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: as => (r, Val.directedAt rd [a] a (a.dirIn rd a.placeTerms)) :: dirArms rd as
termination_by structural as => as
end

/-- A term read with the directives on its places as the one term at a
place of its own, in `n` turns: each turn reads the places beneath, and
the arms of a place that folds (`foldPlace`) in the next. -/
def dirF : ℕ → Val → Val
  | 0, v => v
  | n + 1, v => Val.directedAt (dirF n) [v] v (v.dirIn (dirF n) v.placeTerms)

/-- Whether a call's value holds its argument where the call stands, so
that a directive in the argument acts there, where the value lands
(decision 46): `copy`, `super` and `pref`. -/
def Fn.landsArg : Fn → Bool
  | .copy | .super | .pref => true
  | _ => false

mutual
/-- The shape of a call's argument where the call's value lands: its
maps and lists unsealed, each member in its shape and a spread as `any`,
a disjunction's arms, a lone preference's value, a meet's sides, the
directives, and a term held open, every other term `any`, so that a
directive at the call's place reads the keys the value declares. -/
def Val.shape : Val → Val
  | .map fs s _ => .map (shapeFields fs) (s.map fun _ => .any) false
  | .list items s _ => .list (shapeItems items) (s.map fun _ => .any) false
  | .or arms => .or (shapeArms arms)
  | .pref _ x => x.shape
  | .meet a b => .meet a.shape b.shape
  | .ride .lifts v r => .ride .lifts v r
  | .ride .seals v r => .ride .seals v r
  | .ride .opened v r => .ride .opened v.shape r
  | .ride _ v _ => v.shape
  | .link v _ => v.shape
  | .call f args => if f.landsArg then shapeArgs args else .any
  | _ => .any
termination_by structural v => v

def shapeFields : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.shape) :: shapeFields fs
termination_by structural fs => fs

def shapeItems : List Val → List Val
  | [] => []
  | v :: vs => v.shape :: shapeItems vs
termination_by structural vs => vs

def shapeArms : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: as => (r, a.shape) :: shapeArms as
termination_by structural as => as

def shapeArgs : List Val → Val
  | [x] => x.shape
  | _ => .any
termination_by structural xs => xs
end

/-- A call whose value holds its argument, met with the shape of an
argument that writes a directive (`Val.shape`), where its value lands. -/
def landCall (f : Fn) : List Val → Val
  | [x] => if x.holdsDir then .meet (.call f [x]) x.shape else .call f [x]
  | args => .call f args

mutual
/-- A term with each call whose value holds its argument, an argument
that writes a directive, met with that argument's shape (`landCall`),
so that the directive acts where the call's value lands (decision 46),
not on the argument a `copy` unseals: through meets, riders and links,
members, elements, spreads, arms, a preference's value, and those
calls' arguments. -/
def Val.landed : Val → Val
  | .meet a b => .meet a.landed b.landed
  | .ride k v r => .ride k v.landed r
  | .link v t => .link v.landed t
  | .map fs s c => .map (landedFields fs) (landedSpread s) c
  | .list items s c => .list (landedItems items) (landedSpread s) c
  | .or arms => .or (landedArms arms)
  | .pref r x => .pref r x.landed
  | .call f args => if f.landsArg then landCall f (landedItems args) else .call f args
  | v => v
termination_by structural v => v

def landedFields : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.landed) :: landedFields fs
termination_by structural fs => fs

def landedItems : List Val → List Val
  | [] => []
  | v :: vs => v.landed :: landedItems vs
termination_by structural vs => vs

def landedSpread : Option Val → Option Val
  | none => none
  | some t => some t.landed
termination_by structural s => s

def landedArms : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: as => (r, a.landed) :: landedArms as
termination_by structural as => as
end

/-- A term read with the directives on its places, the term itself the
root's one term, each call whose value holds its argument met first with
the shape where its value lands (`Val.landed`): a turn for each place
that folds within another, each one place deeper, so a turn for each
constructor the term holds is enough. A term that writes no directive
reads as itself, as the turns would read it. -/
def Val.directed (v : Val) : Val :=
  if v.landed.holdsDir then dirF (v.landed.size + 1) v.landed else v.landed

/-- The expansion of a term: enough turns for every chain of names that
are not recursive, which repeats no name, and for the structure each
body adds, and the directives on its places read (`Val.directed`). -/
def expand (ds : Decls) (v : Val) : Val :=
  (expandF ds ((ds.length + 1) * (ds.bodiesSize + v.size + 1)) v).directed

/-- How a document reads: its term expanded. -/
abbrev Decls.read (ds : Decls) (S : Val) : Val := expand ds S

/-- The environment a document reads under: each name's bodies, met and
expanded. -/
def Decls.envE (ds : Decls) : Env := fun n => (ds.env n).map (expand ds)

theorem Decls.envE_eq {ds : Decls} {n : String} {b : Val} (h : ds.env n = some b) :
    ds.envE n = some (expand ds b) := by
  simp only [Decls.envE, h, Option.map_some]

/-- A reference judges as the expansion of its body judges. -/
theorem judge_alias_iff {ds : Decls} {root : Data} {b : Bool} {k : String} {body : Val} {j : Data}
    (h : ds.env k = some body) :
    Judge ds.envE root b (.alias k) j ↔ Judge ds.envE root b (expand ds body) j := by
  constructor
  · intro ha
    cases ha with
    | alias he hb =>
      rw [Decls.envE_eq h] at he
      exact Option.some.inj he ▸ hb
    | aliasNone he => rw [Decls.envE_eq h] at he; cases he
  · exact fun hb => .alias (Decls.envE_eq h) hb

/-- A reference admits what the expansion of its body admits. -/
theorem admits_alias_iff {ds : Decls} {root : Data} {k : String} {body : Val} {j : Data}
    (h : ds.env k = some body) :
    Admits ds.envE root (.alias k) j ↔ Admits ds.envE root (expand ds body) j :=
  judge_alias_iff h

/-! ## A checker that reads the names

`check` asks a hook where it meets a name. Under the declarations the
hook unfolds the name to its expanded body: against a lighter datum
afresh, and against one as heavy only while the name is not already
being unfolded at that datum, which a stack records. The alias-cycle
rule is what makes the stack enough: a name met again at the same datum
with no key and no element between would be a cycle the rule refuses. -/

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

/-- The turns a datum needs under a stack: one for each name a chain
with no key and no element between can hold, at each level of the
datum, and the names the stack has not yet taken. -/
def Decls.budget (ds : Decls) (j : Data) (stack : List String) : ℕ :=
  (j.weight + 1) * (ds.length + 1) + (ds.length - stack.length)

/-- What the stack records of the term in hand: names being unfolded,
each declared and each once, every one of which reaches, with no key
and no element between, every name the term refers to that way. -/
def Decls.Stacked (ds : Decls) (stack : List String) (v : Val) : Prop :=
  stack.Nodup ∧ (∀ k, k ∈ stack → k ∈ ds.names) ∧
    ∀ k', k' ∈ v.unguardedRefs → ∀ k, k ∈ stack → Relation.TransGen ds.RefersUnguarded k k'

/-- The checker under the declarations, given the turns the datum needs. -/
def checkR (ds : Decls) (v : Val) (j : Data) : Bool := checkD ds (ds.budget j []) [] v j

namespace Decls

theorem Stacked.nil {ds : Decls} (v : Val) : ds.Stacked [] v :=
  ⟨List.nodup_nil, fun _ h => absurd h (List.not_mem_nil), fun _ _ _ h => absurd h (List.not_mem_nil)⟩

theorem Stacked.length_le {ds : Decls} {stack : List String} {v : Val} (h : ds.Stacked stack v) :
    stack.length ≤ ds.length := by
  have := length_le_of_nodup h.1 h.2.1
  simpa [names] using this

theorem Stacked.not_mem {ds : Decls} {stack : List String} {v : Val} {k : String} (hg : ds.Guarded)
    (h : ds.Stacked stack v) (hk : k ∈ v.unguardedRefs) : k ∉ stack :=
  fun hm => hg k (h.2.2 k hk k hm)

theorem mem_names_of_env {ds : Decls} {k : String} {b : Val} (h : ds.env k = some b) : k ∈ ds.names := by
  simp only [env] at h
  split at h
  · exact nomatch h
  · rename_i v vs hb
    exact mem_names (mem_bodies (hb ▸ List.mem_cons_self))

/-- The names a meet of bodies reaches with nothing between are the
bodies' own. -/
theorem unguardedRefs_foldl_meet : ∀ (vs : List Val) (v : Val) {n : String},
    n ∈ (vs.foldl Val.meet v).unguardedRefs → n ∈ v.unguardedRefs ∨ ∃ w, w ∈ vs ∧ n ∈ w.unguardedRefs
  | [], _, _, h => .inl h
  | w :: vs, v, n, h => by
    rcases unguardedRefs_foldl_meet vs (.meet v w) h with h' | ⟨w', hw', hn⟩
    · simp only [Val.unguardedRefs, List.mem_append] at h'
      rcases h' with h' | h'
      · exact .inl h'
      · exact .inr ⟨w, List.mem_cons_self, h'⟩
    · exact .inr ⟨w', List.mem_cons_of_mem _ hw', hn⟩

theorem refersUnguarded_of_env {ds : Decls} {k n : String} {b : Val} (h : ds.env k = some b)
    (hn : n ∈ b.unguardedRefs) : ds.RefersUnguarded k n := by
  simp only [env] at h
  split at h
  · exact nomatch h
  · rename_i v vs hb
    cases h
    rw [Val.unguardedRefs_unmark, Val.unguardedRefs_unident] at hn
    rcases unguardedRefs_foldl_meet vs v hn with h' | ⟨w, hw, hn'⟩
    · exact ⟨v, hb ▸ List.mem_cons_self, h'⟩
    · exact ⟨w, hb ▸ List.mem_cons_of_mem v hw, hn'⟩

end Decls

/-- A name the expansion of a term reaches with nothing between, the term
reached that way itself, or reaches through a name it so reached. -/
theorem unguardedRefs_expandF {ds : Decls} : ∀ (f : ℕ) (b : Val) {n : String},
    n ∈ (expandF ds f b).unguardedRefs →
      n ∈ b.unguardedRefs ∨ ∃ m, m ∈ b.unguardedRefs ∧ Relation.TransGen ds.RefersUnguarded m n
  | 0, _, _, h => .inl h
  | f + 1, b, n, h => by
    cases b with
    | alias k =>
      simp only [expandF] at h
      split at h
      · exact .inl h
      · split at h
        · rename_i b' he
          have h0 : n ∈ (expandF ds f b').unguardedRefs := by
            split at h
            · simp only [Val.unguardedRefs, Val.restrict, List.mem_append] at h
              rcases h with h | h
              · exact h
              · obtain ⟨w, hw, hn⟩ := restrictF_unguardedRefs _ _ h
                exact List.mem_singleton.mp hw ▸ hn
            · exact h
          rcases unguardedRefs_expandF f b' h0 with h' | ⟨m, hm, hmn⟩
          · exact .inr ⟨k, by simp [Val.unguardedRefs], .single (Decls.refersUnguarded_of_env he h')⟩
          · exact .inr ⟨k, by simp [Val.unguardedRefs],
              .trans (.single (Decls.refersUnguarded_of_env he hm)) hmn⟩
        · exact .inl h
    | len c =>
      simp only [expandF, Val.unguardedRefs] at h ⊢
      exact unguardedRefs_expandF f c h
    | or arms =>
      simp only [expandF, Val.unguardedRefs] at h ⊢
      obtain ⟨r, a', hm, hn⟩ := mem_unguardedArms.mp h
      obtain ⟨⟨r', a⟩, ha, he⟩ := List.mem_map.mp hm
      simp only [Prod.mk.injEq] at he
      obtain ⟨rfl, rfl⟩ := he
      rcases unguardedRefs_expandF f a hn with h' | ⟨m, hm', hmn⟩
      · exact .inl (mem_unguardedArms.mpr ⟨r', a, ha, h'⟩)
      · exact .inr ⟨m, mem_unguardedArms.mpr ⟨r', a, ha, hm'⟩, hmn⟩
    | pref r x =>
      simp only [expandF, Val.unguardedRefs] at h ⊢
      exact unguardedRefs_expandF f x h
    | ride t v r =>
      simp only [expandF, Val.unguardedRefs, Rider.unguardedRefs_reads] at h ⊢
      exact unguardedRefs_expandF f v h
    | link v t =>
      simp only [expandF, Val.unguardedRefs, List.mem_append] at h ⊢
      rcases h with h | h
      · rcases unguardedRefs_expandF f v h with h' | ⟨m, hm, hmn⟩
        · exact .inl (.inl h')
        · exact .inr ⟨m, .inl hm, hmn⟩
      · rcases unguardedRefs_expandF f t h with h' | ⟨m, hm, hmn⟩
        · exact .inl (.inr h')
        · exact .inr ⟨m, .inr hm, hmn⟩
    | meet a b =>
      simp only [expandF, Val.unguardedRefs, List.mem_append] at h ⊢
      rcases h with h | h
      · rcases unguardedRefs_expandF f a h with h' | ⟨m, hm, hmn⟩
        · exact .inl (.inl h')
        · exact .inr ⟨m, .inl hm, hmn⟩
      · rcases unguardedRefs_expandF f b h with h' | ⟨m, hm, hmn⟩
        · exact .inl (.inr h')
        · exact .inr ⟨m, .inr hm, hmn⟩
    | nof c cs =>
      simp only [expandF, Val.unguardedRefs, List.mem_append] at h ⊢
      rcases h with h | h
      · rcases unguardedRefs_expandF f c h with h' | ⟨m, hm, hmn⟩
        · exact .inl (.inl h')
        · exact .inr ⟨m, .inl hm, hmn⟩
      · obtain ⟨a', hm, hn⟩ := mem_unguardedItems.mp h
        obtain ⟨a, ha, rfl⟩ := List.mem_map.mp hm
        rcases unguardedRefs_expandF f a hn with h' | ⟨m, hm', hmn⟩
        · exact .inl (.inr (mem_unguardedItems.mpr ⟨a, ha, h'⟩))
        · exact .inr ⟨m, .inr (mem_unguardedItems.mpr ⟨a, ha, hm'⟩), hmn⟩
    | must c _ =>
      simp only [expandF, Val.unguardedRefs] at h ⊢
      exact unguardedRefs_expandF f c h
    | when c t e =>
      simp only [expandF, Val.unguardedRefs, List.mem_append] at h ⊢
      rcases h with (h | h) | h
      · rcases unguardedRefs_expandF f c h with h' | ⟨m, hm, hmn⟩
        · exact .inl (.inl (.inl h'))
        · exact .inr ⟨m, .inl (.inl hm), hmn⟩
      · rcases unguardedRefs_expandF f t h with h' | ⟨m, hm, hmn⟩
        · exact .inl (.inl (.inr h'))
        · exact .inr ⟨m, .inl (.inr hm), hmn⟩
      · cases e with
        | none => exact absurd h (List.not_mem_nil)
        | some e' =>
          simp only [Option.map, unguardedSpread] at h ⊢
          rcases unguardedRefs_expandF f e' h with h' | ⟨m, hm, hmn⟩
          · exact .inl (.inr h')
          · exact .inr ⟨m, .inr hm, hmn⟩
    | contains c n' =>
      simp only [expandF, Val.unguardedRefs] at h ⊢
      exact unguardedRefs_expandF f n' h
    | rest t cs =>
      simp only [expandF, Val.unguardedRefs] at h ⊢
      obtain ⟨c', hc', hn⟩ := mem_unguardedCovers.mp h
      obtain ⟨c, hc, rfl⟩ := List.mem_map.mp hc'
      cases hcond : c.1 with
      | none => simp [hcond, unguardedSpread] at hn
      | some v =>
        simp only [hcond, Option.map, unguardedSpread] at hn
        rcases unguardedRefs_expandF f v hn with h' | ⟨m, hm, hmn⟩
        · exact .inl (mem_unguardedCovers.mpr ⟨c, hc, by rw [hcond]; exact h'⟩)
        · exact .inr ⟨m, mem_unguardedCovers.mpr ⟨c, hc, by rw [hcond]; exact hm⟩, hmn⟩
    | select s arms d =>
      simp only [expandF, Val.unguardedRefs, List.mem_append] at h ⊢
      rcases h with (h | h) | h
      · rcases unguardedRefs_expandF f s h with h' | ⟨m, hm, hmn⟩
        · exact .inl (.inl (.inl h'))
        · exact .inr ⟨m, .inl (.inl hm), hmn⟩
      · obtain ⟨p', r', hm, hn⟩ := mem_unguardedPairs.mp h
        obtain ⟨⟨p, r⟩, ha, he⟩ := List.mem_map.mp hm
        simp only [Prod.mk.injEq] at he
        obtain ⟨rfl, rfl⟩ := he
        rcases hn with hn | hn
        · rcases unguardedRefs_expandF f p hn with h' | ⟨m, hm', hmn⟩
          · exact .inl (.inl (.inr (mem_unguardedPairs.mpr ⟨p, r, ha, .inl h'⟩)))
          · exact .inr ⟨m, .inl (.inr (mem_unguardedPairs.mpr ⟨p, r, ha, .inl hm'⟩)), hmn⟩
        · rcases unguardedRefs_expandF f r hn with h' | ⟨m, hm', hmn⟩
          · exact .inl (.inl (.inr (mem_unguardedPairs.mpr ⟨p, r, ha, .inr h'⟩)))
          · exact .inr ⟨m, .inl (.inr (mem_unguardedPairs.mpr ⟨p, r, ha, .inr hm'⟩)), hmn⟩
      · cases d with
        | none => exact absurd h (List.not_mem_nil)
        | some e' =>
          simp only [Option.map, unguardedSpread] at h
          rcases unguardedRefs_expandF f e' h with h' | ⟨m, hm, hmn⟩
          · exact .inl (.inr h')
          · exact .inr ⟨m, .inr hm, hmn⟩
    | filter s c =>
      simp only [expandF, Val.unguardedRefs, List.mem_append] at h ⊢
      rcases h with h | h
      · rcases unguardedRefs_expandF f s h with h' | ⟨m, hm, hmn⟩
        · exact .inl (.inl h')
        · exact .inr ⟨m, .inl hm, hmn⟩
      · rcases unguardedRefs_expandF f c h with h' | ⟨m, hm, hmn⟩
        · exact .inl (.inr h')
        · exact .inr ⟨m, .inr hm, hmn⟩
    | map _ _ _ => simp [expandF, Val.unguardedRefs] at h
    | list _ _ _ => simp [expandF, Val.unguardedRefs] at h
    | call _ args =>
      simp only [expandF, Val.unguardedRefs] at h ⊢
      obtain ⟨a', hm, hn⟩ := mem_unguardedItems.mp h
      obtain ⟨a, ha, rfl⟩ := List.mem_map.mp hm
      rcases unguardedRefs_expandF f a hn with h' | ⟨m, hm', hmn⟩
      · exact .inl (mem_unguardedItems.mpr ⟨a, ha, h'⟩)
      · exact .inr ⟨m, mem_unguardedItems.mpr ⟨a, ha, hm'⟩, hmn⟩
    | _ => exact .inl (by simpa [expandF] using h)

/-! ### The directives reach no name the term does not -/

theorem Val.membersOpen_unguardedRefs {v : Val} {n : String} (h : n ∈ v.membersOpen.unguardedRefs) :
    n ∈ v.unguardedRefs := by
  cases v with
  | map => simp [Val.membersOpen, Val.unguardedRefs] at h
  | list => simp [Val.membersOpen, Val.unguardedRefs] at h
  | _ => exact h

theorem Val.closeConjuncts_unguardedRefs : ∀ {v c : Val}, c ∈ v.closeConjuncts → ∀ {n : String},
    n ∈ c.unguardedRefs → n ∈ v.unguardedRefs
  | .meet a b, c, hc, n, hn => by
    simp only [Val.closeConjuncts, List.mem_append] at hc
    simp only [Val.unguardedRefs, List.mem_append]
    rcases hc with hc | hc
    · exact .inl (Val.closeConjuncts_unguardedRefs hc hn)
    · exact .inr (Val.closeConjuncts_unguardedRefs hc hn)
  | .ride k v r, c, hc, n, hn => by
    simp only [Val.unguardedRefs]
    cases k with
    | opened =>
      simp only [Val.closeConjuncts, List.mem_map] at hc
      obtain ⟨c', hc', rfl⟩ := hc
      exact Val.closeConjuncts_unguardedRefs hc' (Val.membersOpen_unguardedRefs hn)
    | _ =>
      simp only [Val.closeConjuncts] at hc
      exact Val.closeConjuncts_unguardedRefs hc hn
  | .link v t, c, hc, n, hn => by
    simp only [Val.closeConjuncts] at hc
    simp only [Val.unguardedRefs, List.mem_append]
    exact .inl (Val.closeConjuncts_unguardedRefs hc hn)
  | .integer, c, hc, n, hn | .float, c, hc, n, hn | .biginteger, c, hc, n, hn | .bigdecimal, c, hc, n, hn
  | .number, c, hc, n, hn | .string, c, hc, n, hn | .anyString, c, hc, n, hn | .boolean, c, hc, n, hn
  | .mapKind, c, hc, n, hn | .listKind, c, hc, n, hn | .pathKind, c, hc, n, hn | .lit _, c, hc, n, hn
  | .addr _, c, hc, n, hn | .min _, c, hc, n, hn | .max _, c, hc, n, hn | .above _, c, hc, n, hn
  | .beneath _, c, hc, n, hn | .neq _, c, hc, n, hn | .mulof _, c, hc, n, hn | .len _, c, hc, n, hn
  | .unique _, c, hc, n, hn | .grammar _, c, hc, n, hn | .any, c, hc, n, hn | .absent, c, hc, n, hn
  | .hole, c, hc, n, hn | .nil, c, hc, n, hn | .nothing, c, hc, n, hn | .alias _, c, hc, n, hn
  | .path _, c, hc, n, hn | .nof _ _, c, hc, n, hn | .call _ _, c, hc, n, hn | .must _ _, c, hc, n, hn
  | .when _ _ _, c, hc, n, hn | .contains _ _, c, hc, n, hn | .rest _ _, c, hc, n, hn | .key, c, hc, n, hn
  | .keyUp _, c, hc, n, hn | .select _ _ _, c, hc, n, hn | .re _, c, hc, n, hn | .format _, c, hc, n, hn
  | .filter _ _, c, hc, n, hn | .map _ _ _, c, hc, n, hn | .list _ _ _, c, hc, n, hn | .or _, c, hc, n, hn
  | .pref _ _, c, hc, n, hn => by
    simp only [Val.closeConjuncts, List.mem_singleton] at hc
    exact hc ▸ hn

theorem closeSeal_unguardedRefs {vs : List Val} {n : String} (h : n ∈ (closeSeal vs).unguardedRefs) :
    ∃ v ∈ vs, n ∈ v.unguardedRefs := by
  obtain ⟨c, hc, hn⟩ := restrictF_unguardedRefs _ _ h
  obtain ⟨v, hv, hc⟩ := List.mem_flatMap.mp hc
  exact ⟨v, hv, Val.closeConjuncts_unguardedRefs hc hn⟩

theorem Val.atPlace_unguardedRefs {all : List Val} {w : Val} {n : String}
    (h : n ∈ (Val.atPlace all w).unguardedRefs) :
    n ∈ w.unguardedRefs ∨ ∃ t ∈ all, n ∈ t.unguardedRefs := by
  have hw : n ∈ (if all.any (Val.directs .lifts) then Val.ride .opened w.unseal [] else w).unguardedRefs →
      n ∈ w.unguardedRefs := by
    split
    · intro h'
      simpa only [Val.unguardedRefs, Val.unguardedRefs_unseal] using h'
    · exact id
  have hc : n ∈ (closeSeal (if all.any (Val.directs .lifts) then all.map (fun t => Val.ride .opened t [])
      else all)).unguardedRefs → ∃ t ∈ all, n ∈ t.unguardedRefs := by
    intro h'
    obtain ⟨t, ht, hn⟩ := closeSeal_unguardedRefs h'
    split at ht
    · obtain ⟨t', ht', rfl⟩ := List.mem_map.mp ht
      exact ⟨t', ht', by simpa only [Val.unguardedRefs] using hn⟩
    · exact ⟨t, ht, hn⟩
  unfold Val.atPlace at h
  dsimp only at h
  by_cases hs : all.any (Val.directs .seals) = true
  · rw [if_pos hs] at h
    rcases List.mem_append.mp h with h | h
    · exact .inl (hw h)
    · exact .inr (hc h)
  · rw [if_neg hs] at h
    exact .inl (hw h)

theorem Val.placeTerms_unguardedRefs : ∀ {v c : Val}, c ∈ v.placeTerms → ∀ {n : String},
    n ∈ c.unguardedRefs → n ∈ v.unguardedRefs
  | .meet a b, c, hc, n, hn => by
    simp only [Val.placeTerms, List.mem_append] at hc
    simp only [Val.unguardedRefs, List.mem_append]
    rcases hc with hc | hc
    · exact .inl (Val.placeTerms_unguardedRefs hc hn)
    · exact .inr (Val.placeTerms_unguardedRefs hc hn)
  | .ride k v r, c, hc, n, hn => by
    cases k with
    | lifts =>
      simp only [Val.placeTerms, List.mem_singleton] at hc
      rw [hc] at hn; exact hn
    | seals =>
      simp only [Val.placeTerms, List.mem_singleton] at hc
      rw [hc] at hn; exact hn
    | _ =>
      simp only [Val.placeTerms] at hc
      simp only [Val.unguardedRefs]
      exact Val.placeTerms_unguardedRefs hc hn
  | .link v t, c, hc, n, hn => by
    simp only [Val.placeTerms] at hc
    simp only [Val.unguardedRefs, List.mem_append]
    exact .inl (Val.placeTerms_unguardedRefs hc hn)
  | .integer, c, hc, n, hn | .float, c, hc, n, hn | .biginteger, c, hc, n, hn | .bigdecimal, c, hc, n, hn
  | .number, c, hc, n, hn | .string, c, hc, n, hn | .anyString, c, hc, n, hn | .boolean, c, hc, n, hn
  | .mapKind, c, hc, n, hn | .listKind, c, hc, n, hn | .pathKind, c, hc, n, hn | .lit _, c, hc, n, hn
  | .addr _, c, hc, n, hn | .min _, c, hc, n, hn | .max _, c, hc, n, hn | .above _, c, hc, n, hn
  | .beneath _, c, hc, n, hn | .neq _, c, hc, n, hn | .mulof _, c, hc, n, hn | .len _, c, hc, n, hn
  | .unique _, c, hc, n, hn | .grammar _, c, hc, n, hn | .any, c, hc, n, hn | .absent, c, hc, n, hn
  | .hole, c, hc, n, hn | .nil, c, hc, n, hn | .nothing, c, hc, n, hn | .alias _, c, hc, n, hn
  | .path _, c, hc, n, hn | .nof _ _, c, hc, n, hn | .call _ _, c, hc, n, hn | .must _ _, c, hc, n, hn
  | .when _ _ _, c, hc, n, hn | .contains _ _, c, hc, n, hn | .rest _ _, c, hc, n, hn | .key, c, hc, n, hn
  | .keyUp _, c, hc, n, hn | .select _ _ _, c, hc, n, hn | .re _, c, hc, n, hn | .format _, c, hc, n, hn
  | .filter _ _, c, hc, n, hn | .map _ _ _, c, hc, n, hn | .list _ _ _, c, hc, n, hn | .or _, c, hc, n, hn
  | .pref _ _, c, hc, n, hn => by
    simp only [Val.placeTerms, List.mem_singleton] at hc
    exact hc ▸ hn

theorem Leaf.kind_unguardedRefs (l : Leaf) : l.kind.unguardedRefs = [] := by cases l <;> rfl

theorem Bound.domain_unguardedRefs (b : Bound) : b.domain.unguardedRefs = [] := by cases b <;> rfl

mutual
theorem Val.unguardedRefs_super : ∀ (v : Val) {n : String}, n ∈ v.super.unguardedRefs → n ∈ v.unguardedRefs
  | .or arms, n, h => by
    simp only [Val.super, Val.unguardedRefs] at h ⊢
    exact unguardedArms_superArms arms h
  | .pref _ x, n, h => by
    simp only [Val.super, Val.unguardedRefs] at h ⊢
    exact Val.unguardedRefs_super x h
  | .meet a b, n, h => by
    simp only [Val.super] at h
    simp only [Val.unguardedRefs, List.mem_append]
    split at h
    · split at h
      · split at h
        · exact .inl (Val.unguardedRefs_super a h)
        · exact .inr (Val.unguardedRefs_super b h)
      · exact .inl h
    · split at h
      · exact .inr h
      · simp only [Val.unguardedRefs, List.mem_append] at h
        rcases h with h | h
        · exact .inl (Val.unguardedRefs_super a h)
        · exact .inr (Val.unguardedRefs_super b h)
  | .ride k v r, n, h => by
    cases k <;> simp only [Val.super, Val.unguardedRefs] at h ⊢ <;> exact Val.unguardedRefs_super v h
  | .link v t, n, h => by
    simp only [Val.super, Val.unguardedRefs, List.mem_append] at h ⊢
    exact .inl (Val.unguardedRefs_super v h)
  | .lit s, n, h => by
    cases s with
    | num x => simp [Val.super, Leaf.kind_unguardedRefs] at h
    | str s => simp only [Val.super] at h; split at h <;> simp [Val.unguardedRefs] at h
    | bool _ => simp [Val.super, Val.unguardedRefs] at h
    | null => simp [Val.super, Val.unguardedRefs] at h
  | .neq vs, n, h => by
    cases vs with
    | nil => simp [Val.super, Val.unguardedRefs] at h
    | cons b _ => simp [Val.super, Bound.domain_unguardedRefs] at h
  | .alias _, _, h => by simpa only [Val.super] using h
  | .min b, _, h | .max b, _, h | .above b, _, h | .beneath b, _, h => by
    simp [Val.super, Bound.domain_unguardedRefs] at h
  | .map _ _ _, _, h | .list _ _ _, _, h => by simp [Val.super, Val.unguardedRefs] at h
  | .integer, _, h | .float, _, h | .biginteger, _, h | .bigdecimal, _, h | .number, _, h
  | .string, _, h | .anyString, _, h | .boolean, _, h | .mapKind, _, h | .listKind, _, h
  | .pathKind, _, h | .any, _, h | .absent, _, h | .nothing, _, h | .nil, _, h | .mulof _, _, h
  | .len _, _, h | .unique _, _, h | .re _, _, h | .format _, _, h | .grammar _, _, h
  | .path _, _, h | .addr _, _, h | .nof _ _, _, h | .must _ _, _, h | .when _ _ _, _, h
  | .contains _ _, _, h | .rest _ _, _, h | .select _ _ _, _, h | .filter _ _, _, h
  | .call _ _, _, h | .key, _, h | .keyUp _, _, h | .hole, _, h => by
    simp [Val.super, Val.unguardedRefs] at h

theorem unguardedArms_superArms : ∀ (arms : List (ℕ × Val)) {n : String},
    n ∈ unguardedArms (superArms arms) → n ∈ unguardedArms arms
  | [], n, h => by simp [superArms, unguardedArms] at h
  | (r, a) :: arms, n, h => by
    simp only [superArms, unguardedArms, List.mem_append] at h ⊢
    rcases h with h | h
    · exact .inl (Val.unguardedRefs_super a h)
    · exact .inr (unguardedArms_superArms arms h)
end

theorem flattenArm_unguardedRefs {p q : ℕ × Val} (hq : q ∈ flattenArm p) {n : String}
    (hn : n ∈ q.2.unguardedRefs) : n ∈ p.2.unguardedRefs := by
  unfold flattenArm at hq
  split at hq
  · simp only [Val.unguardedRefs]
    exact mem_unguardedArms.mpr ⟨q.1, q.2, hq, hn⟩
  · rw [List.mem_singleton] at hq
    exact hq ▸ hn

/-- A name an arm of two nodes met reaches, an arm of one of them reaches. -/
def ArmsReach (as : List (ℕ × Val)) (n : String) : Prop := ∃ p ∈ as, n ∈ p.2.unguardedRefs

theorem outerMeet_reach {as bs : List (ℕ × Val)} {n : String} {p : ℕ × Val} (hp : p ∈ outerMeet as bs)
    (hn : n ∈ p.2.unguardedRefs) : ArmsReach as n ∨ ArmsReach bs n := by
  simp only [outerMeet, List.mem_flatMap, List.mem_map] at hp
  obtain ⟨_, ⟨a, ha, rfl⟩, hm⟩ := hp
  have h := flattenArm_unguardedRefs hm hn
  simp only [Val.unguardedRefs] at h
  obtain ⟨r, w, hw, hn'⟩ := mem_unguardedArms.mp h
  obtain ⟨b, hb, he⟩ := List.mem_map.mp hw
  simp only [Prod.mk.injEq] at he
  obtain ⟨-, rfl⟩ := he
  simp only [Val.unguardedRefs, List.mem_append] at hn'
  rcases hn' with hn' | hn'
  · exact .inl ⟨a, ha, hn'⟩
  · exact .inr ⟨b, hb, hn'⟩

theorem outerMeetR_reach {as bs : List (ℕ × Val)} {n : String} {p : ℕ × Val} (hp : p ∈ outerMeetR as bs)
    (hn : n ∈ p.2.unguardedRefs) : ArmsReach as n ∨ ArmsReach bs n := by
  simp only [outerMeetR, List.mem_flatMap, List.mem_map] at hp
  obtain ⟨_, ⟨b, hb, rfl⟩, hm⟩ := hp
  have h := flattenArm_unguardedRefs hm hn
  simp only [Val.unguardedRefs] at h
  obtain ⟨r, w, hw, hn'⟩ := mem_unguardedArms.mp h
  obtain ⟨a, ha, he⟩ := List.mem_map.mp hw
  simp only [Prod.mk.injEq] at he
  obtain ⟨-, rfl⟩ := he
  simp only [Val.unguardedRefs, List.mem_append] at hn'
  rcases hn' with hn' | hn'
  · exact .inl ⟨a, ha, hn'⟩
  · exact .inr ⟨b, hb, hn'⟩

theorem tieMeetArms_reach {r k : ℕ} {as bs : List (ℕ × Val)} {n : String} {p : ℕ × Val}
    (hp : p ∈ tieMeetArms r k as bs) (hn : n ∈ p.2.unguardedRefs) : ArmsReach as n ∨ ArmsReach bs n := by
  have hm : ∀ a b, a ∈ as → b ∈ bs → n ∈ (Val.meet a.2 b.2).unguardedRefs →
      ArmsReach as n ∨ ArmsReach bs n := fun a b ha hb h => by
    simp only [Val.unguardedRefs, List.mem_append] at h
    rcases h with h | h
    · exact .inl ⟨a, ha, h⟩
    · exact .inr ⟨b, hb, h⟩
  unfold tieMeetArms at hp
  rcases List.mem_append.mp hp with hp | hp
  · rcases List.mem_append.mp hp with hp | hp
    · obtain ⟨x, hx, hm'⟩ := List.mem_flatMap.mp hp
      obtain ⟨y, hy, rfl⟩ := List.mem_map.mp hm'
      exact hm x y (List.mem_filter.mp hx).1 (List.mem_filter.mp hy).1 hn
    · obtain ⟨x, hx, rfl⟩ := List.mem_map.mp hp
      simp only [Val.unguardedRefs] at hn
      obtain ⟨_, w, hw, hn'⟩ := mem_unguardedArms.mp hn
      obtain ⟨y, hy, he⟩ := List.mem_map.mp hw
      simp only [Prod.mk.injEq] at he
      obtain ⟨-, rfl⟩ := he
      exact hm x y (List.mem_filter.mp hx).1 (List.mem_filter.mp hy).1 hn'
  · obtain ⟨y, hy, rfl⟩ := List.mem_map.mp hp
    simp only [Val.unguardedRefs] at hn
    obtain ⟨_, w, hw, hn'⟩ := mem_unguardedArms.mp hn
    obtain ⟨x, hx, he⟩ := List.mem_map.mp hw
    simp only [Prod.mk.injEq] at he
    obtain ⟨-, rfl⟩ := he
    exact hm x y (List.mem_filter.mp hx).1 (List.mem_filter.mp hy).1 hn'

theorem orMeetF_reach : ∀ (m : ℕ) {as bs : List (ℕ × Val)} {n : String} {p : ℕ × Val},
    p ∈ orMeetF m as bs → n ∈ p.2.unguardedRefs → ArmsReach as n ∨ ArmsReach bs n
  | 0, _, _, _, _, hp, hn => outerMeet_reach hp hn
  | m + 1, as, bs, n, p, hp, hn => by
    have hfa : ∀ (f : ℕ × Val → Bool), ArmsReach (as.filter f) n → ArmsReach as n :=
      fun _ ⟨q, hq, h⟩ => ⟨q, (List.mem_filter.mp hq).1, h⟩
    have hfb : ∀ (f : ℕ × Val → Bool), ArmsReach (bs.filter f) n → ArmsReach bs n :=
      fun _ ⟨q, hq, h⟩ => ⟨q, (List.mem_filter.mp hq).1, h⟩
    unfold orMeetF at hp
    split at hp
    · split at hp
      · exact outerMeet_reach hp hn
      · split at hp
        · exact outerMeetR_reach hp hn
        · unfold tieMeet at hp
          split at hp
          · rcases List.mem_cons.mp hp with rfl | hp
            · simp only [Val.unguardedRefs] at hn
              obtain ⟨r', a, ha, hn'⟩ := mem_unguardedArms.mp hn
              exact tieMeetArms_reach ha hn'
            · rcases orMeetF_reach m hp hn with h | h
              · exact .inl (hfa _ h)
              · exact .inr (hfb _ h)
          · rcases List.mem_append.mp hp with hp | hp
            · exact tieMeetArms_reach hp hn
            · rcases orMeetF_reach m hp hn with h | h
              · exact .inl (hfa _ h)
              · exact .inr (hfb _ h)
    · exact outerMeet_reach hp hn
    · exact outerMeetR_reach hp hn
    · exact outerMeet_reach hp hn

theorem orMeet_reach {as bs : List (ℕ × Val)} {n : String} {p : ℕ × Val} (hp : p ∈ orMeet as bs)
    (hn : n ∈ p.2.unguardedRefs) : ArmsReach as n ∨ ArmsReach bs n :=
  orMeetF_reach _ hp hn

theorem choicesMet_reach {cs : List (List (ℕ × Val))} {n : String} {p : ℕ × Val}
    (hp : p ∈ choicesMet cs) (hn : n ∈ p.2.unguardedRefs) : ∃ c ∈ cs, ArmsReach c n := by
  cases cs with
  | nil => exact nomatch hp
  | cons c cs =>
    simp only [choicesMet] at hp
    have key : ∀ (more : List (List (ℕ × Val))) (acc : List (ℕ × Val)),
        (∀ p, p ∈ acc → n ∈ p.2.unguardedRefs → ∃ c' ∈ c :: cs, ArmsReach c' n) →
        (∀ d ∈ more, d ∈ c :: cs) →
        ∀ p, p ∈ more.foldl orMeet acc → n ∈ p.2.unguardedRefs → ∃ c' ∈ c :: cs, ArmsReach c' n := by
      intro more
      induction more with
      | nil => intro acc hacc _; exact hacc
      | cons d ds ih =>
        intro acc hacc hd
        refine ih (orMeet acc d) (fun q hq hnq => ?_) (fun d' h' => hd d' (List.mem_cons_of_mem _ h'))
        rcases orMeet_reach hq hnq with ⟨q', hq', h⟩ | h
        · exact hacc q' hq' h
        · exact ⟨d, hd d List.mem_cons_self, h⟩
    exact key cs c (fun q hq hnq => ⟨c, List.mem_cons_self, q, hq, hnq⟩)
      (fun d h => List.mem_cons_of_mem _ h) p hp hn

theorem Val.placeChoices_reach : ∀ {v : Val} {as : List (ℕ × Val)}, as ∈ v.placeChoices →
    ∀ {n : String}, ArmsReach as n → n ∈ v.unguardedRefs
  | .meet a b, as, h, n, hn => by
    simp only [Val.placeChoices, List.mem_append] at h
    simp only [Val.unguardedRefs, List.mem_append]
    rcases h with h | h
    · exact .inl (Val.placeChoices_reach h hn)
    · exact .inr (Val.placeChoices_reach h hn)
  | .ride k v r, as, h, n, ⟨p, hp, hn⟩ => by
    cases k with
    | lifts => simp [Val.placeChoices] at h
    | seals => simp [Val.placeChoices] at h
    | _ =>
      simp only [Val.placeChoices, List.mem_map] at h
      obtain ⟨bs, hbs, rfl⟩ := h
      obtain ⟨q, hq, rfl⟩ := List.mem_map.mp hp
      simp only [Val.unguardedRefs] at hn ⊢
      exact Val.placeChoices_reach hbs ⟨q, hq, hn⟩
  | .link v t, as, h, n, ⟨p, hp, hn⟩ => by
    simp only [Val.placeChoices, List.mem_map] at h
    obtain ⟨bs, hbs, rfl⟩ := h
    obtain ⟨q, hq, rfl⟩ := List.mem_map.mp hp
    simp only [Val.unguardedRefs, List.mem_append] at hn ⊢
    rcases hn with hn | hn
    · exact .inl (Val.placeChoices_reach hbs ⟨q, hq, hn⟩)
    · exact .inr hn
  | .or arms, as, h, n, ⟨p, hp, hn⟩ => by
    simp only [Val.placeChoices, List.mem_singleton] at h
    subst h
    simp only [Val.unguardedRefs]
    exact mem_unguardedArms.mpr ⟨p.1, p.2, hp, hn⟩
  | .pref r x, as, h, n, ⟨p, hp, hn⟩ => by
    simp only [Val.placeChoices, List.mem_singleton] at h
    subst h
    simp only [Val.unguardedRefs]
    simp only [List.mem_cons, List.not_mem_nil, or_false] at hp
    rcases hp with rfl | rfl
    · exact hn
    · exact Val.unguardedRefs_super x hn
  | .integer, _, h, _, _ | .float, _, h, _, _ | .biginteger, _, h, _, _ | .bigdecimal, _, h, _, _
  | .number, _, h, _, _ | .string, _, h, _, _ | .anyString, _, h, _, _ | .boolean, _, h, _, _
  | .mapKind, _, h, _, _ | .listKind, _, h, _, _ | .pathKind, _, h, _, _ | .lit _, _, h, _, _
  | .addr _, _, h, _, _ | .min _, _, h, _, _ | .max _, _, h, _, _ | .above _, _, h, _, _
  | .beneath _, _, h, _, _ | .neq _, _, h, _, _ | .mulof _, _, h, _, _ | .len _, _, h, _, _
  | .unique _, _, h, _, _ | .grammar _, _, h, _, _ | .any, _, h, _, _ | .absent, _, h, _, _
  | .hole, _, h, _, _ | .nil, _, h, _, _ | .nothing, _, h, _, _ | .alias _, _, h, _, _
  | .path _, _, h, _, _ | .nof _ _, _, h, _, _ | .call _ _, _, h, _, _ | .must _ _, _, h, _, _
  | .when _ _ _, _, h, _, _ | .contains _ _, _, h, _, _ | .rest _ _, _, h, _, _ | .key, _, h, _, _
  | .keyUp _, _, h, _, _ | .select _ _ _, _, h, _, _ | .re _, _, h, _, _ | .format _, _, h, _, _
  | .filter _ _, _, h, _, _ | .map _ _ _, _, h, _, _ | .list _ _ _, _, h, _, _ => by
    simp [Val.placeChoices] at h

theorem Val.unchosen_unguardedRefs : ∀ {v : Val} {n : String}, n ∈ v.unchosen.unguardedRefs →
    n ∈ v.unguardedRefs
  | .meet a b, n, h => by
    simp only [Val.unchosen, Val.unguardedRefs, List.mem_append] at h ⊢
    rcases h with h | h
    · exact .inl (Val.unchosen_unguardedRefs h)
    · exact .inr (Val.unchosen_unguardedRefs h)
  | .ride k v r, n, h => by
    cases k <;> simp only [Val.unchosen, Val.unguardedRefs] at h ⊢ <;>
      first | exact h | exact Val.unchosen_unguardedRefs h
  | .link v t, n, h => by
    simp only [Val.unchosen, Val.unguardedRefs, List.mem_append] at h ⊢
    rcases h with h | h
    · exact .inl (Val.unchosen_unguardedRefs h)
    · exact .inr h
  | .or _, _, h | .pref _ _, _, h => by simp [Val.unchosen, Val.unguardedRefs] at h
  | .integer, _, h | .float, _, h | .biginteger, _, h | .bigdecimal, _, h | .number, _, h
  | .string, _, h | .anyString, _, h | .boolean, _, h | .mapKind, _, h | .listKind, _, h
  | .pathKind, _, h | .lit _, _, h | .addr _, _, h | .min _, _, h | .max _, _, h
  | .above _, _, h | .beneath _, _, h | .neq _, _, h | .mulof _, _, h | .len _, _, h
  | .unique _, _, h | .grammar _, _, h | .any, _, h | .absent, _, h | .hole, _, h
  | .nil, _, h | .nothing, _, h | .alias _, _, h | .path _, _, h | .nof _ _, _, h
  | .call _ _, _, h | .must _ _, _, h | .when _ _ _, _, h | .contains _ _, _, h
  | .rest _ _, _, h | .key, _, h | .keyUp _, _, h | .select _ _ _, _, h | .re _, _, h
  | .format _, _, h | .filter _ _, _, h | .map _ _ _, _, h | .list _ _ _, _, h => by
    simpa only [Val.unchosen] using h

theorem foldl_meet_unguardedRefs : ∀ (vs : List Val) (acc : Val) {n : String},
    n ∈ (vs.foldl Val.meet acc).unguardedRefs → n ∈ acc.unguardedRefs ∨ ∃ v ∈ vs, n ∈ v.unguardedRefs
  | [], acc, n, h => .inl h
  | v :: vs, acc, n, h => by
    rcases foldl_meet_unguardedRefs vs (.meet acc v) h with h | ⟨w, hw, h⟩
    · simp only [Val.unguardedRefs, List.mem_append] at h
      rcases h with h | h
      · exact .inl h
      · exact .inr ⟨v, List.mem_cons_self, h⟩
    · exact .inr ⟨w, List.mem_cons_of_mem _ hw, h⟩

theorem foldPlace_unguardedRefs {rd : Val → Val}
    (hrd : ∀ x {n : String}, n ∈ (rd x).unguardedRefs → n ∈ x.unguardedRefs) {all : List Val}
    {n : String} (h : n ∈ (foldPlace rd all).unguardedRefs) : ∃ u ∈ all, n ∈ u.unguardedRefs := by
  simp only [foldPlace, Val.unguardedRefs] at h
  obtain ⟨r, a, ha, hn⟩ := mem_unguardedArms.mp h
  obtain ⟨p, hp, he⟩ := List.mem_map.mp ha
  simp only [Prod.mk.injEq] at he
  obtain ⟨-, rfl⟩ := he
  have hn := hrd _ hn
  simp only [Val.unguardedRefs, List.mem_append] at hn
  rcases hn with hn | hn
  · obtain ⟨c, hc, hr⟩ := choicesMet_reach hp hn
    obtain ⟨u, hu, hc⟩ := List.mem_flatMap.mp hc
    exact ⟨u, hu, Val.placeChoices_reach hc hr⟩
  · rcases foldl_meet_unguardedRefs _ _ hn with hn | ⟨w, hw, hn⟩
    · simp [Val.unguardedRefs] at hn
    · obtain ⟨u, hu, rfl⟩ := List.mem_map.mp hw
      exact ⟨u, hu, Val.unchosen_unguardedRefs hn⟩

theorem Val.directedAt_unguardedRefs {rd : Val → Val}
    (hrd : ∀ x {n : String}, n ∈ (rd x).unguardedRefs → n ∈ x.unguardedRefs) {all : List Val}
    {t w : Val} {n : String} (h : n ∈ (Val.directedAt rd all t w).unguardedRefs) :
    n ∈ w.unguardedRefs ∨ ∃ u ∈ all, n ∈ u.unguardedRefs := by
  unfold Val.directedAt at h
  split at h
  · split at h
    · exact .inr (foldPlace_unguardedRefs hrd h)
    · simp [Val.unguardedRefs] at h
  · exact Val.atPlace_unguardedRefs h

mutual
theorem Val.dirIn_unguardedRefs {rd : Val → Val}
    (hrd : ∀ x {n : String}, n ∈ (rd x).unguardedRefs → n ∈ x.unguardedRefs) :
    ∀ (v : Val) (cs : List Val) {n : String}, n ∈ (v.dirIn rd cs).unguardedRefs → n ∈ v.unguardedRefs
  | .meet a b, cs, n, h => by
    simp only [Val.dirIn, Val.unguardedRefs, List.mem_append] at h ⊢
    rcases h with h | h
    · exact .inl (Val.dirIn_unguardedRefs hrd a cs h)
    · exact .inr (Val.dirIn_unguardedRefs hrd b cs h)
  | .ride k v r, cs, n, h => by
    cases k with
    | lifts => simp [Val.dirIn, Val.unguardedRefs] at h
    | seals => simp [Val.dirIn, Val.unguardedRefs] at h
    | opened =>
      simp only [Val.dirIn, Val.unguardedRefs, Val.unguardedRefs_unseal] at h ⊢
      exact Val.dirIn_unguardedRefs hrd v cs h
    | _ =>
      simp only [Val.dirIn, Val.unguardedRefs] at h ⊢
      exact Val.dirIn_unguardedRefs hrd v cs h
  | .link v t, cs, n, h => by
    simp only [Val.dirIn, Val.unguardedRefs, List.mem_append] at h ⊢
    rcases h with h | h
    · exact .inl (Val.dirIn_unguardedRefs hrd v cs h)
    · exact .inr h
  | .or arms, cs, n, h => by
    simp only [Val.dirIn, Val.unguardedRefs] at h ⊢
    exact dirArms_unguardedRefs hrd arms h
  | .pref r x, cs, n, h => by
    simp only [Val.dirIn, Val.unguardedRefs] at h ⊢
    rcases Val.directedAt_unguardedRefs hrd h with h | ⟨u, hu, hn⟩
    · exact Val.dirIn_unguardedRefs hrd x _ h
    · rw [List.mem_singleton.mp hu] at hn; exact hn
  | .map _ _ _, _, _, h => by simp [Val.dirIn, Val.unguardedRefs] at h
  | .list _ _ _, _, _, h => by simp [Val.dirIn, Val.unguardedRefs] at h
  | .integer, _, _, h | .float, _, _, h | .biginteger, _, _, h | .bigdecimal, _, _, h | .number, _, _, h
  | .string, _, _, h | .anyString, _, _, h | .boolean, _, _, h | .mapKind, _, _, h | .listKind, _, _, h
  | .pathKind, _, _, h | .lit _, _, _, h | .addr _, _, _, h | .min _, _, _, h | .max _, _, _, h
  | .above _, _, _, h | .beneath _, _, _, h | .neq _, _, _, h | .mulof _, _, _, h | .len _, _, _, h
  | .unique _, _, _, h | .grammar _, _, _, h | .any, _, _, h | .absent, _, _, h | .hole, _, _, h
  | .nil, _, _, h | .nothing, _, _, h | .alias _, _, _, h | .path _, _, _, h | .nof _ _, _, _, h
  | .call _ _, _, _, h | .must _ _, _, _, h | .when _ _ _, _, _, h | .contains _ _, _, _, h
  | .rest _ _, _, _, h | .key, _, _, h | .keyUp _, _, _, h | .select _ _ _, _, _, h | .re _, _, _, h
  | .format _, _, _, h | .filter _ _, _, _, h => h

theorem dirArms_unguardedRefs {rd : Val → Val}
    (hrd : ∀ x {n : String}, n ∈ (rd x).unguardedRefs → n ∈ x.unguardedRefs) :
    ∀ (arms : List (ℕ × Val)) {n : String}, n ∈ unguardedArms (dirArms rd arms) → n ∈ unguardedArms arms
  | [], n, h => by simp [dirArms, unguardedArms] at h
  | (r, a) :: as, n, h => by
    simp only [dirArms, unguardedArms, List.mem_append] at h ⊢
    rcases h with h | h
    · rcases Val.directedAt_unguardedRefs hrd h with h | ⟨u, hu, hn⟩
      · exact .inl (Val.dirIn_unguardedRefs hrd a _ h)
      · rw [List.mem_singleton.mp hu] at hn; exact .inl hn
    · exact .inr (dirArms_unguardedRefs hrd as h)
end

theorem dirF_unguardedRefs : ∀ (m : ℕ) (v : Val) {n : String}, n ∈ (dirF m v).unguardedRefs →
    n ∈ v.unguardedRefs
  | 0, v, n, h => h
  | m + 1, v, n, h => by
    simp only [dirF] at h
    rcases Val.directedAt_unguardedRefs (fun x _ hx => dirF_unguardedRefs m x hx) h with h | ⟨u, hu, hn⟩
    · exact Val.dirIn_unguardedRefs (fun x _ hx => dirF_unguardedRefs m x hx) v _ h
    · rw [List.mem_singleton.mp hu] at hn; exact hn

mutual
theorem Val.shape_unguardedRefs : ∀ (v : Val) {n : String}, n ∈ v.shape.unguardedRefs → n ∈ v.unguardedRefs
  | .or arms, n, h => by
    simp only [Val.shape, Val.unguardedRefs] at h ⊢
    exact shapeArms_unguardedRefs arms h
  | .pref _ x, n, h => by
    simp only [Val.shape, Val.unguardedRefs] at h ⊢
    exact Val.shape_unguardedRefs x h
  | .meet a b, n, h => by
    simp only [Val.shape, Val.unguardedRefs, List.mem_append] at h ⊢
    rcases h with h | h
    · exact .inl (Val.shape_unguardedRefs a h)
    · exact .inr (Val.shape_unguardedRefs b h)
  | .ride k v r, n, h => by
    cases k <;> simp only [Val.shape, Val.unguardedRefs] at h ⊢ <;>
      first | exact h | exact Val.shape_unguardedRefs v h
  | .link v t, n, h => by
    simp only [Val.shape, Val.unguardedRefs, List.mem_append] at h ⊢
    exact .inl (Val.shape_unguardedRefs v h)
  | .call f args, n, h => by
    simp only [Val.shape] at h
    simp only [Val.unguardedRefs]
    split at h
    · exact shapeArgs_unguardedRefs args h
    · simp [Val.unguardedRefs] at h
  | .map _ _ _, _, h | .list _ _ _, _, h => by simp [Val.shape, Val.unguardedRefs] at h
  | .integer, _, h | .float, _, h | .biginteger, _, h | .bigdecimal, _, h | .number, _, h
  | .string, _, h | .anyString, _, h | .boolean, _, h | .mapKind, _, h | .listKind, _, h
  | .pathKind, _, h | .lit _, _, h | .addr _, _, h | .min _, _, h | .max _, _, h
  | .above _, _, h | .beneath _, _, h | .neq _, _, h | .mulof _, _, h | .len _, _, h
  | .unique _, _, h | .grammar _, _, h | .any, _, h | .absent, _, h | .hole, _, h
  | .nil, _, h | .nothing, _, h | .alias _, _, h | .path _, _, h | .nof _ _, _, h
  | .must _ _, _, h | .when _ _ _, _, h | .contains _ _, _, h
  | .rest _ _, _, h | .key, _, h | .keyUp _, _, h | .select _ _ _, _, h | .re _, _, h
  | .format _, _, h | .filter _ _, _, h => by simp [Val.shape, Val.unguardedRefs] at h

theorem shapeArms_unguardedRefs : ∀ (arms : List (ℕ × Val)) {n : String},
    n ∈ unguardedArms (shapeArms arms) → n ∈ unguardedArms arms
  | [], n, h => by simp [shapeArms, unguardedArms] at h
  | (r, a) :: as, n, h => by
    simp only [shapeArms, unguardedArms, List.mem_append] at h ⊢
    rcases h with h | h
    · exact .inl (Val.shape_unguardedRefs a h)
    · exact .inr (shapeArms_unguardedRefs as h)

theorem shapeArgs_unguardedRefs : ∀ (args : List Val) {n : String},
    n ∈ (shapeArgs args).unguardedRefs → n ∈ unguardedItems args
  | [x], n, h => by
    simp only [shapeArgs] at h
    simp only [unguardedItems, List.mem_append]
    exact .inl (Val.shape_unguardedRefs x h)
  | [], n, h => by simp [shapeArgs, Val.unguardedRefs] at h
  | _ :: _ :: _, n, h => by simp [shapeArgs, Val.unguardedRefs] at h
end

theorem landCall_unguardedRefs {f : Fn} {args : List Val} {n : String}
    (h : n ∈ (landCall f args).unguardedRefs) : n ∈ unguardedItems args := by
  unfold landCall at h
  split at h
  · rename_i x
    split at h
    · simp only [Val.unguardedRefs, List.mem_append] at h
      rcases h with h | h
      · exact h
      · simp only [unguardedItems, List.mem_append]
        exact .inl (Val.shape_unguardedRefs x h)
    · simpa only [Val.unguardedRefs] using h
  · simpa only [Val.unguardedRefs] using h

mutual
theorem Val.landed_unguardedRefs : ∀ (v : Val) {n : String}, n ∈ v.landed.unguardedRefs → n ∈ v.unguardedRefs
  | .meet a b, n, h => by
    simp only [Val.landed, Val.unguardedRefs, List.mem_append] at h ⊢
    rcases h with h | h
    · exact .inl (Val.landed_unguardedRefs a h)
    · exact .inr (Val.landed_unguardedRefs b h)
  | .ride k v r, n, h => by
    simp only [Val.landed, Val.unguardedRefs] at h ⊢
    exact Val.landed_unguardedRefs v h
  | .link v t, n, h => by
    simp only [Val.landed, Val.unguardedRefs, List.mem_append] at h ⊢
    rcases h with h | h
    · exact .inl (Val.landed_unguardedRefs v h)
    · exact .inr h
  | .or arms, n, h => by
    simp only [Val.landed, Val.unguardedRefs] at h ⊢
    exact landedArms_unguardedRefs arms h
  | .pref r x, n, h => by
    simp only [Val.landed, Val.unguardedRefs] at h ⊢
    exact Val.landed_unguardedRefs x h
  | .call f args, n, h => by
    simp only [Val.landed] at h
    simp only [Val.unguardedRefs]
    split at h
    · exact landedItems_unguardedRefs args (landCall_unguardedRefs h)
    · simpa only [Val.unguardedRefs] using h
  | .map _ _ _, _, h | .list _ _ _, _, h => by simp [Val.landed, Val.unguardedRefs] at h
  | .integer, _, h | .float, _, h | .biginteger, _, h | .bigdecimal, _, h | .number, _, h
  | .string, _, h | .anyString, _, h | .boolean, _, h | .mapKind, _, h | .listKind, _, h
  | .pathKind, _, h | .lit _, _, h | .addr _, _, h | .min _, _, h | .max _, _, h
  | .above _, _, h | .beneath _, _, h | .neq _, _, h | .mulof _, _, h | .len _, _, h
  | .unique _, _, h | .grammar _, _, h | .any, _, h | .absent, _, h | .hole, _, h
  | .nil, _, h | .nothing, _, h | .alias _, _, h | .path _, _, h | .nof _ _, _, h
  | .must _ _, _, h | .when _ _ _, _, h | .contains _ _, _, h
  | .rest _ _, _, h | .key, _, h | .keyUp _, _, h | .select _ _ _, _, h | .re _, _, h
  | .format _, _, h | .filter _ _, _, h => by simpa only [Val.landed] using h

theorem landedArms_unguardedRefs : ∀ (arms : List (ℕ × Val)) {n : String},
    n ∈ unguardedArms (landedArms arms) → n ∈ unguardedArms arms
  | [], n, h => by simp [landedArms, unguardedArms] at h
  | (r, a) :: as, n, h => by
    simp only [landedArms, unguardedArms, List.mem_append] at h ⊢
    rcases h with h | h
    · exact .inl (Val.landed_unguardedRefs a h)
    · exact .inr (landedArms_unguardedRefs as h)

theorem landedItems_unguardedRefs : ∀ (items : List Val) {n : String},
    n ∈ unguardedItems (landedItems items) → n ∈ unguardedItems items
  | [], n, h => by simp [landedItems, unguardedItems] at h
  | v :: vs, n, h => by
    simp only [landedItems, unguardedItems, List.mem_append] at h ⊢
    rcases h with h | h
    · exact .inl (Val.landed_unguardedRefs v h)
    · exact .inr (landedItems_unguardedRefs vs h)
end

theorem Val.unguardedRefs_directed {v : Val} {n : String} (h : n ∈ v.directed.unguardedRefs) :
    n ∈ v.unguardedRefs := by
  unfold Val.directed at h
  split at h
  · exact Val.landed_unguardedRefs v (dirF_unguardedRefs _ _ h)
  · exact Val.landed_unguardedRefs v h

theorem Decls.Stacked.push {ds : Decls} {stack : List String} {v : Val} {k : String} {b : Val}
    (hs : ds.Stacked stack v) (hk : k ∈ v.unguardedRefs) (hnot : k ∉ stack) (he : ds.env k = some b) :
    ds.Stacked (k :: stack) (expand ds b) := by
  refine ⟨List.nodup_cons.mpr ⟨hnot, hs.1⟩, ?_, ?_⟩
  · intro k' hk'
    rcases List.mem_cons.mp hk' with rfl | hk'
    · exact Decls.mem_names_of_env he
    · exact hs.2.1 k' hk'
  · intro k'' hk'' k₀ hk₀
    have hkk'' : Relation.TransGen ds.RefersUnguarded k k'' := by
      rcases unguardedRefs_expandF _ b (Val.unguardedRefs_directed hk'') with h' | ⟨m, hm, hmn⟩
      · exact .single (Decls.refersUnguarded_of_env he h')
      · exact .trans (.single (Decls.refersUnguarded_of_env he hm)) hmn
    rcases List.mem_cons.mp hk₀ with rfl | hk₀
    · exact hkk''
    · exact .trans (hs.2.2 k hk k₀ hk₀) hkk''

/-! ### The expansion keeps a term checkable -/

/-- Leaving an identity behind keeps a body checkable. -/
theorem Val.checkableA_unident {v : Val} (h : v.CheckableA) : v.unident.CheckableA := by
  induction v using Val.unident.induct with
  | case1 v r => cases h with | ride h => exact h
  | case2 a b iha ihb => cases h with | meet ha hb => exact .meet (iha ha) (ihb hb)
  | case3 v h1 h2 => rw [Val.unident.eq_3 v h1 h2]; exact h

theorem mem_unmarkFields {fs : List (String × Bool × Val)} {k : String} {o : Bool} {w : Val} :
    (k, o, w) ∈ unmarkFields fs ↔ ∃ v, (k, o, v) ∈ fs ∧ w = v.unmark := by
  induction fs with
  | nil => simp [unmarkFields]
  | cons f fs ih =>
    obtain ⟨k', o', v'⟩ := f
    simp only [unmarkFields, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl, rfl⟩ | ⟨v, hm, rfl⟩)
      · exact ⟨v', Or.inl ⟨rfl, rfl, rfl⟩, rfl⟩
      · exact ⟨v, Or.inr hm, rfl⟩
    · rintro ⟨v, ⟨rfl, rfl, rfl⟩ | hm, rfl⟩
      · exact Or.inl ⟨rfl, rfl, rfl⟩
      · exact Or.inr ⟨v, hm, rfl⟩

theorem mem_unmarkItems {items : List Val} {w : Val} :
    w ∈ unmarkItems items ↔ ∃ v, v ∈ items ∧ w = v.unmark := by
  induction items with
  | nil => simp [unmarkItems]
  | cons v vs ih =>
    simp only [unmarkItems, List.mem_cons, ih]
    constructor
    · rintro (rfl | ⟨v', hm, rfl⟩)
      · exact ⟨v, Or.inl rfl, rfl⟩
      · exact ⟨v', Or.inr hm, rfl⟩
    · rintro ⟨v', rfl | hm, rfl⟩
      · exact Or.inl rfl
      · exact Or.inr ⟨v', hm, rfl⟩

theorem unmarkSpread_eq {spread : Option Val} {t : Val} :
    unmarkSpread spread = some t ↔ ∃ s, spread = some s ∧ t = s.unmark := by
  cases spread <;> simp [unmarkSpread, eq_comm]

theorem mem_unmarkArms {arms : List (ℕ × Val)} {r : ℕ} {b : Val} :
    (r, b) ∈ unmarkArms arms ↔ ∃ a, (r, a) ∈ arms ∧ b = a.unmark := by
  induction arms with
  | nil => simp [unmarkArms]
  | cons p arms ih =>
    obtain ⟨r', a'⟩ := p
    simp only [unmarkArms, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl⟩ | ⟨a, hm, rfl⟩)
      · exact ⟨a', Or.inl ⟨rfl, rfl⟩, rfl⟩
      · exact ⟨a, Or.inr hm, rfl⟩
    · rintro ⟨a, ⟨rfl, rfl⟩ | hm, rfl⟩
      · exact Or.inl ⟨rfl, rfl⟩
      · exact Or.inr ⟨a, hm, rfl⟩

theorem mem_unmarkPairs {ps : List (Val × Val)} {p r : Val} :
    (p, r) ∈ unmarkPairs ps ↔ ∃ p' r', (p', r') ∈ ps ∧ p = p'.unmark ∧ r = r'.unmark := by
  induction ps with
  | nil => simp [unmarkPairs]
  | cons q ps ih =>
    obtain ⟨p₀, r₀⟩ := q
    simp only [unmarkPairs, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl⟩ | ⟨p', r', hm, rfl, rfl⟩)
      · exact ⟨p₀, r₀, Or.inl ⟨rfl, rfl⟩, rfl, rfl⟩
      · exact ⟨p', r', Or.inr hm, rfl, rfl⟩
    · rintro ⟨p', r', ⟨rfl, rfl⟩ | hm, rfl, rfl⟩
      · exact Or.inl ⟨rfl, rfl⟩
      · exact Or.inr ⟨p', r', hm, rfl, rfl⟩

theorem mem_unmarkCovers {cs : List Cover} {c : Cover} :
    c ∈ unmarkCovers cs ↔
      ∃ c', c' ∈ cs ∧ c = (unmarkSpread c'.1, unmarkSpread c'.2.1, unmarkSpread c'.2.2) := by
  induction cs with
  | nil => simp [unmarkCovers]
  | cons q cs ih =>
    obtain ⟨a, b, d⟩ := q
    simp only [unmarkCovers, List.mem_cons, ih]
    constructor
    · rintro (rfl | ⟨c', hm, rfl⟩)
      · exact ⟨(a, b, d), Or.inl rfl, rfl⟩
      · exact ⟨c', Or.inr hm, rfl⟩
    · rintro ⟨c', rfl | hm, rfl⟩
      · exact Or.inl rfl
      · exact Or.inr ⟨c', hm, rfl⟩

/-- Dropping the marks written around a term keeps it checkable. -/
theorem Val.CheckableA.dropMarks {v : Val} (h : v.CheckableA) : v.dropMarks.CheckableA := by
  induction v using Val.dropMarks.induct with
  | case1 v r ih => simp only [Val.dropMarks]; cases h with | ride h => exact ih h
  | case2 v r ih => simp only [Val.dropMarks]; cases h with | ride h => exact ih h
  | case3 k v r hk1 hk2 ih =>
    rw [Val.dropMarks.eq_3 k v r hk1 hk2]; cases h with | ride h => exact .ride (ih h)
  | case4 v t ih => simp only [Val.dropMarks]; cases h with | link hv ht => exact .link (ih hv) ht
  | case5 a b iha ihb =>
    simp only [Val.dropMarks]; cases h with | meet ha hb => exact .meet (iha ha) (ihb hb)
  | case6 r a ih =>
    simp only [Val.dropMarks]
    cases h with
    | or hall =>
      refine .or fun r' b hm => ?_
      simp only [List.mem_singleton, Prod.mk.injEq] at hm
      obtain ⟨rfl, rfl⟩ := hm
      exact ih (hall _ _ (List.mem_singleton.mpr rfl))
  | case7 v h1 h2 h3 h4 h5 h6 => rw [Val.dropMarks.eq_7 v h1 h2 h3 h4 h5 h6]; exact h

/-- Clearing the marks keeps a body checkable. -/
theorem Val.CheckableA.unmark {v : Val} (h : v.CheckableA) : v.unmark.CheckableA := by
  induction h with
  | @map fs spread closed _ _ ihf ihs =>
    refine .map ?_ ?_
    · intro k o w hm
      obtain ⟨v, hv, rfl⟩ := mem_unmarkFields.mp hm
      exact ihf k o v hv
    · intro t ht
      obtain ⟨s, hs, rfl⟩ := unmarkSpread_eq.mp ht
      exact ihs s hs
  | @list items spread closed _ _ ihi ihs =>
    refine .list ?_ ?_
    · intro w hm
      obtain ⟨v, hv, rfl⟩ := mem_unmarkItems.mp hm
      exact ihi v hv
    · intro t ht
      obtain ⟨s, hs, rfl⟩ := unmarkSpread_eq.mp ht
      exact ihs s hs
  | @or arms _ ih =>
    refine .or fun r b hm => ?_
    obtain ⟨a, ha, rfl⟩ := mem_unmarkArms.mp hm
    exact ih r a ha
  | pref _ ih => exact .pref ih
  | meet _ _ iha ihb => exact .meet iha ihb
  | @ride k v r _ ih => cases k <;> first | exact ih | exact .ride ih
  | @link v t _ _ ihv iht => exact .link ihv iht
  | len _ ih => exact .len ih
  | @nof n cs _ _ ihn ihc =>
    refine .nof ihn fun w hm => ?_
    obtain ⟨v, hv, rfl⟩ := mem_unmarkItems.mp hm
    exact ihc v hv
  | @call f args _ ih =>
    refine .call fun w hm => ?_
    obtain ⟨v, hv, rfl⟩ := mem_unmarkItems.mp hm
    exact ih v hv
  | must _ ih => exact .must ih
  | when _ _ _ ihc iht ihe =>
    refine .when ihc iht fun e' he => ?_
    obtain ⟨s, hs, rfl⟩ := unmarkSpread_eq.mp he
    exact ihe s hs
  | contains _ _ ihc ihn => exact .contains ihc ihn
  | @rest t cs _ _ _ _ iht ih1 ih2 ih3 =>
    refine .rest iht ?_ ?_ ?_ <;> intro c hc w hw <;>
      obtain ⟨c', hc', rfl⟩ := mem_unmarkCovers.mp hc <;>
      obtain ⟨s, hs, rfl⟩ := unmarkSpread_eq.mp hw
    · exact ih1 c' hc' s hs
    · exact ih2 c' hc' s hs
    · exact ih3 c' hc' s hs
  | @selectKey arms d _ _ _ ihp ihr ihd =>
    refine .selectKey (fun p r hm => ?_) (fun p r hm => ?_) (fun e he => ?_)
    · obtain ⟨p', r', hm', rfl, rfl⟩ := mem_unmarkPairs.mp hm
      exact ihp p' r' hm'
    · obtain ⟨p', r', hm', rfl, rfl⟩ := mem_unmarkPairs.mp hm
      exact ihr p' r' hm'
    · obtain ⟨s, hs, rfl⟩ := unmarkSpread_eq.mp he
      exact ihd s hs
  | @selectLit s₀ arms d _ _ _ ihp ihr ihd =>
    refine .selectLit (fun p r hm => ?_) (fun p r hm => ?_) (fun e he => ?_)
    · obtain ⟨p', r', hm', rfl, rfl⟩ := mem_unmarkPairs.mp hm
      exact ihp p' r' hm'
    · obtain ⟨p', r', hm', rfl, rfl⟩ := mem_unmarkPairs.mp hm
      exact ihr p' r' hm'
    · obtain ⟨s, hs, rfl⟩ := unmarkSpread_eq.mp he
      exact ihd s hs
  | _ => simp only [Val.unmark]; constructor <;> assumption

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
  | link _ ht ih _ => simp only [Val.unseal]; exact .link ih ht
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

theorem Val.CheckableA.reads {k : Rider} {v : Val} (h : v.CheckableA) : (k.reads v).CheckableA := by
  unfold Rider.reads
  split
  · exact h.unseal
  · exact h

theorem Decls.env_checkableA {ds : Decls} (hb : ∀ d, d ∈ ds → d.2.CheckableA) {k : String} {b : Val}
    (h : ds.env k = some b) : b.CheckableA := by
  simp only [Decls.env] at h
  split at h
  · exact nomatch h
  · rename_i v vs hbs
    cases h
    have hall : ∀ w, w ∈ v :: vs → w.CheckableA := by
      intro w hw
      rw [← hbs] at hw
      simp only [Decls.bodies, List.mem_map, List.mem_filter] at hw
      obtain ⟨d, ⟨hd, -⟩, rfl⟩ := hw
      exact hb d hd
    have : ∀ (vs : List Val) (v : Val), v.CheckableA → (∀ w, w ∈ vs → w.CheckableA) →
        (vs.foldl Val.meet v).CheckableA := by
      intro vs
      induction vs with
      | nil => intro v hv _; exact hv
      | cons w vs ih =>
        intro v hv hws
        exact ih (.meet v w) (.meet hv (hws w (List.mem_cons_self)))
          (fun w' hw' => hws w' (List.mem_cons_of_mem _ hw'))
    exact (Val.checkableA_unident
      (this vs v (hall v (List.mem_cons_self)) (fun w hw => hall w (List.mem_cons_of_mem _ hw)))).unmark

theorem expandF_checkableA {ds : Decls} (hb : ∀ d, d ∈ ds → d.2.CheckableA) :
    ∀ (f : ℕ) (v : Val), v.CheckableA → (expandF ds f v).CheckableA
  | 0, _, hv => hv
  | f + 1, v, hv => by
    cases hv with
    | alias =>
      simp only [expandF]
      split
      · exact .alias
      · split
        · rename_i he
          have hx := expandF_checkableA hb f _ (Decls.env_checkableA hb he)
          split
          · exact .meet hx (restrictF_checkableA _ _ fun w hw => List.mem_singleton.mp hw ▸ hx)
          · exact hx
        · exact .alias
    | len hc => exact .len (expandF_checkableA hb f _ hc)
    | map hf hs =>
      refine .map ?_ ?_
      · intro k o v' hm
        obtain ⟨⟨k', o', w⟩, hw, he⟩ := List.mem_map.mp hm
        simp only [Prod.mk.injEq] at he
        obtain ⟨rfl, rfl, rfl⟩ := he
        exact expandF_checkableA hb f w (hf k' o' w hw)
      · intro s hs'
        obtain ⟨s', hs'', rfl⟩ := Option.map_eq_some_iff.mp hs'
        exact expandF_checkableA hb f s' (hs s' hs'')
    | list hi hs =>
      refine .list ?_ ?_
      · intro v' hm
        obtain ⟨w, hw, rfl⟩ := List.mem_map.mp hm
        exact expandF_checkableA hb f w (hi w hw)
      · intro s hs'
        obtain ⟨s', hs'', rfl⟩ := Option.map_eq_some_iff.mp hs'
        exact expandF_checkableA hb f s' (hs s' hs'')
    | or ha =>
      refine .or ?_
      intro r a' hm
      obtain ⟨⟨r', a⟩, ha', he⟩ := List.mem_map.mp hm
      simp only [Prod.mk.injEq] at he
      obtain ⟨rfl, rfl⟩ := he
      exact expandF_checkableA hb f a (ha r' a ha')
    | pref hx => exact .pref (expandF_checkableA hb f _ hx)
    | ride hv => exact .ride (expandF_checkableA hb f _ hv).reads
    | link hv ht => exact .link (expandF_checkableA hb f _ hv) (expandF_checkableA hb f _ ht)
    | meet ha hb' => exact .meet (expandF_checkableA hb f _ ha) (expandF_checkableA hb f _ hb')
    | nof hn hcs =>
      refine .nof (expandF_checkableA hb f _ hn) ?_
      intro c' hm
      obtain ⟨c, hc, rfl⟩ := List.mem_map.mp hm
      exact expandF_checkableA hb f c (hcs c hc)
    | call hargs =>
      refine .call fun a' hm => ?_
      obtain ⟨a, ha, rfl⟩ := List.mem_map.mp hm
      exact expandF_checkableA hb f a (hargs a ha)
    | must hc => exact .must (expandF_checkableA hb f _ hc)
    | when hc ht he =>
      refine .when (expandF_checkableA hb f _ hc) (expandF_checkableA hb f _ ht) ?_
      intro e' he'
      obtain ⟨e'', he'', rfl⟩ := Option.map_eq_some_iff.mp he'
      exact expandF_checkableA hb f e'' (he e'' he'')
    | contains hc hn => exact .contains (expandF_checkableA hb f _ hc) (expandF_checkableA hb f _ hn)
    | rest ht h1 h2 h3 =>
      refine .rest (expandF_checkableA hb f _ ht) ?_ ?_ ?_
      · intro c' hc' v hv
        obtain ⟨c, hc, rfl⟩ := List.mem_map.mp hc'
        obtain ⟨w, hw, rfl⟩ := Option.map_eq_some_iff.mp hv
        exact expandF_checkableA hb f w (h1 c hc w hw)
      · intro c' hc' v hv
        obtain ⟨c, hc, rfl⟩ := List.mem_map.mp hc'
        obtain ⟨w, hw, rfl⟩ := Option.map_eq_some_iff.mp hv
        exact expandF_checkableA hb f w (h2 c hc w hw)
      · intro c' hc' v hv
        obtain ⟨c, hc, rfl⟩ := List.mem_map.mp hc'
        obtain ⟨w, hw, rfl⟩ := Option.map_eq_some_iff.mp hv
        exact expandF_checkableA hb f w (h3 c hc w hw)
    | selectKey hp hr hd =>
      show (Val.select (expandF ds f .key) _ _).CheckableA
      rw [show expandF ds f .key = .key by cases f <;> rfl]
      refine .selectKey (fun p r hm => ?_) (fun p r hm => ?_) (fun e he => ?_)
      · obtain ⟨⟨p', r'⟩, hm', he⟩ := List.mem_map.mp hm
        simp only [Prod.mk.injEq] at he
        obtain ⟨rfl, rfl⟩ := he
        exact expandF_checkableA hb f p' (hp p' r' hm')
      · obtain ⟨⟨p', r'⟩, hm', he⟩ := List.mem_map.mp hm
        simp only [Prod.mk.injEq] at he
        obtain ⟨rfl, rfl⟩ := he
        exact expandF_checkableA hb f r' (hr p' r' hm')
      · obtain ⟨e', he', rfl⟩ := Option.map_eq_some_iff.mp he
        exact expandF_checkableA hb f e' (hd e' he')
    | @selectLit sc _ _ hp hr hd =>
      show (Val.select (expandF ds f (.lit sc)) _ _).CheckableA
      rw [show expandF ds f (.lit sc) = .lit sc by cases f <;> rfl]
      refine .selectLit (fun p r hm => ?_) (fun p r hm => ?_) (fun e he => ?_)
      · obtain ⟨⟨p', r'⟩, hm', he⟩ := List.mem_map.mp hm
        simp only [Prod.mk.injEq] at he
        obtain ⟨rfl, rfl⟩ := he
        exact expandF_checkableA hb f p' (hp p' r' hm')
      · obtain ⟨⟨p', r'⟩, hm', he⟩ := List.mem_map.mp hm
        simp only [Prod.mk.injEq] at he
        obtain ⟨rfl, rfl⟩ := he
        exact expandF_checkableA hb f r' (hr p' r' hm')
      · obtain ⟨e', he', rfl⟩ := Option.map_eq_some_iff.mp he
        exact expandF_checkableA hb f e' (hd e' he')
    | _ => (try simp only [expandF]); constructor

/-! ### The directives keep a term checkable -/

theorem Val.placeTerms_checkableA : ∀ {v : Val}, v.CheckableA → ∀ c ∈ v.placeTerms, c.CheckableA
  | .meet a b, .meet ha hb, c, hc => by
    simp only [Val.placeTerms, List.mem_append] at hc
    rcases hc with hc | hc
    · exact Val.placeTerms_checkableA ha c hc
    · exact Val.placeTerms_checkableA hb c hc
  | .ride k v r, .ride hv, c, hc => by
    cases k with
    | lifts =>
      simp only [Val.placeTerms, List.mem_singleton] at hc
      rw [hc]; exact .ride hv
    | seals =>
      simp only [Val.placeTerms, List.mem_singleton] at hc
      rw [hc]; exact .ride hv
    | _ =>
      simp only [Val.placeTerms] at hc
      exact Val.placeTerms_checkableA hv c hc
  | .link v _, .link hv _, c, hc => by
    simp only [Val.placeTerms] at hc
    exact Val.placeTerms_checkableA hv c hc
  | .integer, h, c, hc | .float, h, c, hc | .biginteger, h, c, hc | .bigdecimal, h, c, hc
  | .number, h, c, hc | .string, h, c, hc | .anyString, h, c, hc | .boolean, h, c, hc
  | .mapKind, h, c, hc | .listKind, h, c, hc | .pathKind, h, c, hc | .lit _, h, c, hc
  | .addr _, h, c, hc | .min _, h, c, hc | .max _, h, c, hc | .above _, h, c, hc
  | .beneath _, h, c, hc | .neq _, h, c, hc | .mulof _, h, c, hc | .len _, h, c, hc
  | .unique _, h, c, hc | .grammar _, h, c, hc | .any, h, c, hc | .absent, h, c, hc
  | .hole, h, c, hc | .nil, h, c, hc | .nothing, h, c, hc | .map _ _ _, h, c, hc
  | .list _ _ _, h, c, hc | .or _, h, c, hc | .pref _ _, h, c, hc | .alias _, h, c, hc
  | .path _, h, c, hc | .nof _ _, h, c, hc | .call _ _, h, c, hc | .must _ _, h, c, hc
  | .when _ _ _, h, c, hc | .contains _ _, h, c, hc | .rest _ _, h, c, hc | .key, h, c, hc
  | .keyUp _, h, c, hc | .select _ _ _, h, c, hc | .re _, h, c, hc | .format _, h, c, hc
  | .filter _ _, h, c, hc => by
    simp only [Val.placeTerms, List.mem_singleton] at hc
    exact hc ▸ h

theorem Val.membersOpen_checkableA {v : Val} (h : v.CheckableA) : v.membersOpen.CheckableA := by
  cases h with
  | map hf hs =>
    refine .map (fun k o w hw => ?_) hs
    obtain ⟨f, hf', he⟩ := List.mem_map.mp hw
    simp only [Prod.mk.injEq] at he
    obtain ⟨-, -, rfl⟩ := he
    exact .ride (hf f.1 f.2.1 f.2.2 hf')
  | list hi hs =>
    refine .list (fun w hw => ?_) hs
    obtain ⟨x, hx, rfl⟩ := List.mem_map.mp hw
    exact .ride (hi x hx)
  | _ => (try simp only [Val.membersOpen]); constructor <;> assumption

theorem Val.closeConjuncts_checkableA : ∀ {v : Val}, v.CheckableA → ∀ c ∈ v.closeConjuncts, c.CheckableA
  | .meet a b, .meet ha hb, c, hc => by
    simp only [Val.closeConjuncts, List.mem_append] at hc
    rcases hc with hc | hc
    · exact Val.closeConjuncts_checkableA ha c hc
    · exact Val.closeConjuncts_checkableA hb c hc
  | .ride k v _, .ride hv, c, hc => by
    cases k with
    | opened =>
      simp only [Val.closeConjuncts, List.mem_map] at hc
      obtain ⟨c', hc', rfl⟩ := hc
      exact Val.membersOpen_checkableA (Val.closeConjuncts_checkableA hv c' hc')
    | _ =>
      simp only [Val.closeConjuncts] at hc
      exact Val.closeConjuncts_checkableA hv c hc
  | .link v _, .link hv _, c, hc => by
    simp only [Val.closeConjuncts] at hc
    exact Val.closeConjuncts_checkableA hv c hc
  | .integer, h, c, hc | .float, h, c, hc | .biginteger, h, c, hc | .bigdecimal, h, c, hc
  | .number, h, c, hc | .string, h, c, hc | .anyString, h, c, hc | .boolean, h, c, hc
  | .mapKind, h, c, hc | .listKind, h, c, hc | .pathKind, h, c, hc | .lit _, h, c, hc
  | .addr _, h, c, hc | .min _, h, c, hc | .max _, h, c, hc | .above _, h, c, hc
  | .beneath _, h, c, hc | .neq _, h, c, hc | .mulof _, h, c, hc | .len _, h, c, hc
  | .unique _, h, c, hc | .grammar _, h, c, hc | .any, h, c, hc | .absent, h, c, hc
  | .hole, h, c, hc | .nil, h, c, hc | .nothing, h, c, hc | .map _ _ _, h, c, hc
  | .list _ _ _, h, c, hc | .or _, h, c, hc | .pref _ _, h, c, hc | .alias _, h, c, hc
  | .path _, h, c, hc | .nof _ _, h, c, hc | .call _ _, h, c, hc | .must _ _, h, c, hc
  | .when _ _ _, h, c, hc | .contains _ _, h, c, hc | .rest _ _, h, c, hc | .key, h, c, hc
  | .keyUp _, h, c, hc | .select _ _ _, h, c, hc | .re _, h, c, hc | .format _, h, c, hc
  | .filter _ _, h, c, hc => by
    simp only [Val.closeConjuncts, List.mem_singleton] at hc
    exact hc ▸ h

theorem closeSeal_checkableA {vs : List Val} (h : ∀ v ∈ vs, v.CheckableA) : (closeSeal vs).CheckableA :=
  restrictF_checkableA _ _ fun c hc => by
    obtain ⟨v, hv, hc⟩ := List.mem_flatMap.mp hc
    exact Val.closeConjuncts_checkableA (h v hv) c hc

theorem Val.atPlace_checkableA {all : List Val} {w : Val} (hall : ∀ t ∈ all, t.CheckableA)
    (hw : w.CheckableA) : (Val.atPlace all w).CheckableA := by
  have hw' : (if all.any (Val.directs .lifts) then Val.ride .opened w.unseal [] else w).CheckableA := by
    split
    · exact .ride hw.unseal
    · exact hw
  have hseal : (closeSeal (if all.any (Val.directs .lifts) then all.map (fun t => Val.ride .opened t [])
      else all)).CheckableA := by
    refine closeSeal_checkableA fun t ht => ?_
    split at ht
    · obtain ⟨t', ht', rfl⟩ := List.mem_map.mp ht
      exact .ride (hall t' ht')
    · exact hall t ht
  unfold Val.atPlace
  dsimp only
  by_cases hs : all.any (Val.directs .seals) = true
  · rw [if_pos hs]; exact .meet hw' hseal
  · rw [if_neg hs]; exact hw'

theorem flattenArm_checkableA {p : ℕ × Val} (hp : p.2.CheckableA) :
    ∀ q, q ∈ flattenArm p → q.2.CheckableA := by
  intro q hq
  unfold flattenArm at hq
  split at hq
  · cases hp with
    | or h => exact h q.1 q.2 hq
  · rw [List.mem_singleton] at hq
    exact hq ▸ hp

theorem outerMeet_checkableA {as bs : List (ℕ × Val)} (ha : ∀ p, p ∈ as → p.2.CheckableA)
    (hb : ∀ q, q ∈ bs → q.2.CheckableA) : ∀ p, p ∈ outerMeet as bs → p.2.CheckableA := by
  intro p hp
  simp only [outerMeet, List.mem_flatMap, List.mem_map] at hp
  obtain ⟨_, ⟨p', hp', rfl⟩, hm⟩ := hp
  refine flattenArm_checkableA (.or fun r a h => ?_) p hm
  simp only [List.mem_map, Prod.mk.injEq] at h
  obtain ⟨q, hq, rfl, rfl⟩ := h
  exact .meet (ha p' hp') (hb q hq)

theorem outerMeetR_checkableA {as bs : List (ℕ × Val)} (ha : ∀ p, p ∈ as → p.2.CheckableA)
    (hb : ∀ q, q ∈ bs → q.2.CheckableA) : ∀ p, p ∈ outerMeetR as bs → p.2.CheckableA := by
  intro p hp
  simp only [outerMeetR, List.mem_flatMap, List.mem_map] at hp
  obtain ⟨_, ⟨q', hq', rfl⟩, hm⟩ := hp
  refine flattenArm_checkableA (.or fun r a h => ?_) p hm
  simp only [List.mem_map, Prod.mk.injEq] at h
  obtain ⟨p'', hp'', rfl, rfl⟩ := h
  exact .meet (ha p'' hp'') (hb q' hq')

theorem tieMeetArms_checkableA {r k : ℕ} {as bs : List (ℕ × Val)} (ha : ∀ p, p ∈ as → p.2.CheckableA)
    (hb : ∀ q, q ∈ bs → q.2.CheckableA) : ∀ p, p ∈ tieMeetArms r k as bs → p.2.CheckableA := by
  intro p hp
  unfold tieMeetArms at hp
  rcases List.mem_append.mp hp with hp | hp
  · rcases List.mem_append.mp hp with hp | hp
    · obtain ⟨x, hx, hm⟩ := List.mem_flatMap.mp hp
      obtain ⟨y, hy, rfl⟩ := List.mem_map.mp hm
      exact .meet (ha x (List.mem_filter.mp hx).1) (hb y (List.mem_filter.mp hy).1)
    · obtain ⟨x, hx, rfl⟩ := List.mem_map.mp hp
      refine .or fun r' a h => ?_
      obtain ⟨y, hy, he⟩ := List.mem_map.mp h
      simp only [Prod.mk.injEq] at he
      obtain ⟨rfl, rfl⟩ := he
      exact .meet (ha x (List.mem_filter.mp hx).1) (hb y (List.mem_filter.mp hy).1)
  · obtain ⟨y, hy, rfl⟩ := List.mem_map.mp hp
    refine .or fun r' a h => ?_
    obtain ⟨x, hx, he⟩ := List.mem_map.mp h
    simp only [Prod.mk.injEq] at he
    obtain ⟨rfl, rfl⟩ := he
    exact .meet (ha x (List.mem_filter.mp hx).1) (hb y (List.mem_filter.mp hy).1)

theorem orMeetF_checkableA : ∀ (n : ℕ) {as bs : List (ℕ × Val)}, (∀ p, p ∈ as → p.2.CheckableA) →
    (∀ q, q ∈ bs → q.2.CheckableA) → ∀ p, p ∈ orMeetF n as bs → p.2.CheckableA
  | 0, _, _, ha, hb => outerMeet_checkableA ha hb
  | n + 1, as, bs, ha, hb => by
    have hfa : ∀ (f : ℕ × Val → Bool), ∀ p, p ∈ as.filter f → p.2.CheckableA :=
      fun _ p h => ha p (List.mem_filter.mp h).1
    have hfb : ∀ (f : ℕ × Val → Bool), ∀ q, q ∈ bs.filter f → q.2.CheckableA :=
      fun _ q h => hb q (List.mem_filter.mp h).1
    unfold orMeetF
    split
    · split
      · exact outerMeet_checkableA ha hb
      · split
        · exact outerMeetR_checkableA ha hb
        · intro p hp
          unfold tieMeet at hp
          split at hp
          · rcases List.mem_cons.mp hp with rfl | hp
            · exact .or fun r' a h => tieMeetArms_checkableA ha hb (r', a) h
            · exact orMeetF_checkableA n (hfa _) (hfb _) p hp
          · rcases List.mem_append.mp hp with hp | hp
            · exact tieMeetArms_checkableA ha hb p hp
            · exact orMeetF_checkableA n (hfa _) (hfb _) p hp
    · exact outerMeet_checkableA ha hb
    · exact outerMeetR_checkableA ha hb
    · exact outerMeet_checkableA ha hb

theorem orMeet_checkableA {as bs : List (ℕ × Val)} (ha : ∀ p, p ∈ as → p.2.CheckableA)
    (hb : ∀ q, q ∈ bs → q.2.CheckableA) : ∀ p, p ∈ orMeet as bs → p.2.CheckableA :=
  orMeetF_checkableA _ ha hb

theorem foldl_meet_checkableA : ∀ (us : List Val) {acc : Val}, acc.CheckableA → (∀ u, u ∈ us → u.CheckableA) →
    (us.foldl .meet acc).CheckableA
  | [], _, h, _ => h
  | u :: us, _, h, hu => foldl_meet_checkableA us (.meet h (hu u List.mem_cons_self))
      fun w hw => hu w (List.mem_cons_of_mem _ hw)

theorem mem_superItems {items : List Val} {w : Val} :
    w ∈ superItems items ↔ ∃ v, v ∈ items ∧ w = v.super := by
  induction items with
  | nil => simp [superItems]
  | cons v vs ih =>
    simp only [superItems, List.mem_cons, ih]
    constructor
    · rintro (rfl | ⟨u, hu, rfl⟩)
      · exact ⟨v, .inl rfl, rfl⟩
      · exact ⟨u, .inr hu, rfl⟩
    · rintro ⟨u, rfl | hu, rfl⟩
      · exact .inl rfl
      · exact .inr ⟨u, hu, rfl⟩

/-- The parent type of a term the checker can read is one it can read. -/
theorem Val.CheckableA.super {v : Val} (h : v.CheckableA) : v.super.CheckableA := by
  induction h with
  | integer | float | biginteger | bigdecimal => exact .number
  | number | string | anyString | boolean | mapKind | listKind | pathKind | any | absent | nothing | hole =>
    exact .any
  | addr => exact .pathKind
  | grammar => exact .string
  | nil => exact .nil
  | path => exact .path
  | nof _ _ _ _ | must _ _ | when _ _ _ _ _ _ | contains _ _ _ _ | rest _ _ _ _ _ _ _ _
  | selectKey _ _ _ _ _ _ | selectLit _ _ _ _ _ _ | call _ _ => exact .any
  | key | keyUp => exact .anyString
  | @lit s =>
    cases s with
    | num x =>
      show x.leaf.kind.CheckableA
      generalize x.leaf = l
      cases l <;> constructor
    | str s =>
      show (if s = "" then Val.anyString else Val.string).CheckableA
      split <;> constructor
    | bool _ => exact .boolean
    | null => exact .lit
  | @min b | @max b | @above b | @beneath b => cases b <;> constructor
  | @neq vs =>
    cases vs with
    | nil => exact .any
    | cons v _ => cases v <;> constructor
  | mulof => exact .number
  | len _ _ | unique => exact .any
  | @map fs spread closed _ _ ihf ihs =>
    refine .map ?_ ?_
    · intro k o w hm
      obtain ⟨v, hv, rfl⟩ := mem_superFields.mp hm
      exact ihf k o v hv
    · intro t ht
      obtain ⟨s, hs, rfl⟩ := superSpread_eq.mp ht
      exact ihs s hs
  | @list items spread closed _ _ ihi ihs =>
    refine .list ?_ ?_
    · intro w hm
      obtain ⟨v, hv, rfl⟩ := mem_superItems.mp hm
      exact ihi v hv
    · intro t ht
      obtain ⟨s, hs, rfl⟩ := superSpread_eq.mp ht
      exact ihs s hs
  | @or arms _ ih =>
    refine .or fun r b hm => ?_
    obtain ⟨a, ha, rfl⟩ := mem_superArms.mp hm
    exact ih r a ha
  | pref _ ih => exact ih
  | @ride k v r _ ih =>
    cases k with
    | move n => exact .ride ih
    | opened => exact .ride ih
    | _ => exact ih
  | link _ _ ih _ => exact ih
  | @meet a b ha hb iha ihb =>
    show (if a.isKind then (if b.isKind then (if a.isLeaf then a.super else b.super) else a)
      else if b.isKind then b else Val.meet a.super b.super).CheckableA
    split
    · split
      · split
        · exact iha
        · exact ihb
      · exact ha
    · split
      · exact hb
      · exact .meet iha ihb
  | alias => exact .alias

theorem Val.placeChoices_checkableA : ∀ {v : Val}, v.CheckableA → ∀ as ∈ v.placeChoices, ∀ p ∈ as,
    p.2.CheckableA
  | .meet a b, .meet ha hb, as, h, p, hp => by
    simp only [Val.placeChoices, List.mem_append] at h
    rcases h with h | h
    · exact Val.placeChoices_checkableA ha as h p hp
    · exact Val.placeChoices_checkableA hb as h p hp
  | .ride k v r, .ride hv, as, h, p, hp => by
    cases k with
    | lifts => simp [Val.placeChoices] at h
    | seals => simp [Val.placeChoices] at h
    | _ =>
      simp only [Val.placeChoices, List.mem_map] at h
      obtain ⟨bs, hbs, rfl⟩ := h
      obtain ⟨q, hq, rfl⟩ := List.mem_map.mp hp
      exact .ride (Val.placeChoices_checkableA hv bs hbs q hq)
  | .link v t, .link hv ht, as, h, p, hp => by
    simp only [Val.placeChoices, List.mem_map] at h
    obtain ⟨bs, hbs, rfl⟩ := h
    obtain ⟨q, hq, rfl⟩ := List.mem_map.mp hp
    exact .link (Val.placeChoices_checkableA hv bs hbs q hq) ht
  | .or arms, .or ha, as, h, p, hp => by
    simp only [Val.placeChoices, List.mem_singleton] at h
    subst h
    exact ha p.1 p.2 hp
  | .pref r x, .pref hx, as, h, p, hp => by
    simp only [Val.placeChoices, List.mem_singleton] at h
    subst h
    simp only [List.mem_cons, List.not_mem_nil, or_false] at hp
    rcases hp with rfl | rfl
    · exact hx
    · exact hx.super
  | .integer, _, _, h, _, _ | .float, _, _, h, _, _ | .biginteger, _, _, h, _, _
  | .bigdecimal, _, _, h, _, _ | .number, _, _, h, _, _ | .string, _, _, h, _, _
  | .anyString, _, _, h, _, _ | .boolean, _, _, h, _, _ | .mapKind, _, _, h, _, _
  | .listKind, _, _, h, _, _ | .pathKind, _, _, h, _, _ | .lit _, _, _, h, _, _
  | .addr _, _, _, h, _, _ | .min _, _, _, h, _, _ | .max _, _, _, h, _, _ | .above _, _, _, h, _, _
  | .beneath _, _, _, h, _, _ | .neq _, _, _, h, _, _ | .mulof _, _, _, h, _, _ | .len _, _, _, h, _, _
  | .unique _, _, _, h, _, _ | .grammar _, _, _, h, _, _ | .any, _, _, h, _, _ | .absent, _, _, h, _, _
  | .hole, _, _, h, _, _ | .nil, _, _, h, _, _ | .nothing, _, _, h, _, _ | .alias _, _, _, h, _, _
  | .path _, _, _, h, _, _ | .nof _ _, _, _, h, _, _ | .call _ _, _, _, h, _, _
  | .must _ _, _, _, h, _, _ | .when _ _ _, _, _, h, _, _ | .contains _ _, _, _, h, _, _
  | .rest _ _, _, _, h, _, _ | .key, _, _, h, _, _ | .keyUp _, _, _, h, _, _
  | .select _ _ _, _, _, h, _, _ | .re _, _, _, h, _, _ | .format _, _, _, h, _, _
  | .filter _ _, _, _, h, _, _ | .map _ _ _, _, _, h, _, _ | .list _ _ _, _, _, h, _, _ => by
    simp [Val.placeChoices] at h

theorem Val.unchosen_checkableA : ∀ {v : Val}, v.CheckableA → v.unchosen.CheckableA
  | .meet a b, .meet ha hb => .meet (Val.unchosen_checkableA ha) (Val.unchosen_checkableA hb)
  | .ride k v r, .ride hv => by
    cases k <;> simp only [Val.unchosen] <;> first | exact .ride hv | exact .ride (Val.unchosen_checkableA hv)
  | .link v t, .link hv ht => .link (Val.unchosen_checkableA hv) ht
  | .or _, _ | .pref _ _, _ => by simp only [Val.unchosen]; exact .any
  | .integer, h | .float, h | .biginteger, h | .bigdecimal, h | .number, h | .string, h
  | .anyString, h | .boolean, h | .mapKind, h | .listKind, h | .pathKind, h | .lit _, h
  | .addr _, h | .min _, h | .max _, h | .above _, h | .beneath _, h | .neq _, h | .mulof _, h
  | .len _, h | .unique _, h | .grammar _, h | .any, h | .absent, h | .hole, h | .nil, h
  | .nothing, h | .alias _, h | .path _, h | .nof _ _, h | .call _ _, h | .must _ _, h
  | .when _ _ _, h | .contains _ _, h | .rest _ _, h | .key, h | .keyUp _, h | .select _ _ _, h
  | .re _, h | .format _, h | .filter _ _, h | .map _ _ _, h | .list _ _ _, h => by
    simpa only [Val.unchosen] using h

theorem choicesMet_checkableA {cs : List (List (ℕ × Val))} (h : ∀ c ∈ cs, ∀ p ∈ c, p.2.CheckableA) :
    ∀ p ∈ choicesMet cs, p.2.CheckableA := by
  cases cs with
  | nil => intro p hp; exact nomatch hp
  | cons c cs =>
    simp only [choicesMet]
    have key : ∀ (more : List (List (ℕ × Val))) (acc : List (ℕ × Val)),
        (∀ p ∈ acc, p.2.CheckableA) → (∀ d ∈ more, ∀ p ∈ d, p.2.CheckableA) →
        ∀ p ∈ more.foldl orMeet acc, p.2.CheckableA := by
      intro more
      induction more with
      | nil => intro acc hacc _; exact hacc
      | cons d ds ih =>
        intro acc hacc hd
        exact ih _ (orMeet_checkableA hacc (hd d List.mem_cons_self))
          fun d' h' => hd d' (List.mem_cons_of_mem _ h')
    exact key cs c (h c List.mem_cons_self) fun d hd => h d (List.mem_cons_of_mem _ hd)

theorem foldPlace_checkableA {rd : Val → Val} (hrd : ∀ x, x.CheckableA → (rd x).CheckableA)
    {all : List Val} (hall : ∀ u ∈ all, u.CheckableA) : (foldPlace rd all).CheckableA := by
  refine .or fun r a h => ?_
  obtain ⟨p, hp, he⟩ := List.mem_map.mp h
  simp only [Prod.mk.injEq] at he
  obtain ⟨rfl, rfl⟩ := he
  refine hrd _ (.meet ?_ (foldl_meet_checkableA _ .any fun w hw => ?_))
  · refine choicesMet_checkableA (fun c hc q hq => ?_) p hp
    obtain ⟨u, hu, hc⟩ := List.mem_flatMap.mp hc
    exact Val.placeChoices_checkableA (hall u hu) c hc q hq
  · obtain ⟨u, hu, rfl⟩ := List.mem_map.mp hw
    exact Val.unchosen_checkableA (hall u hu)

theorem Val.directedAt_checkableA {rd : Val → Val} (hrd : ∀ x, x.CheckableA → (rd x).CheckableA)
    {all : List Val} {t w : Val} (hall : ∀ u ∈ all, u.CheckableA) (hw : w.CheckableA) :
    (Val.directedAt rd all t w).CheckableA := by
  unfold Val.directedAt
  split
  · split
    · exact foldPlace_checkableA hrd hall
    · exact .any
  · exact Val.atPlace_checkableA hall hw

theorem mapSpreads_checkableA {cs : List Val} (h : ∀ c ∈ cs, c.CheckableA) :
    ∀ t ∈ mapSpreads cs, t.CheckableA := by
  intro t ht
  obtain ⟨c, hc, ht⟩ := List.mem_flatMap.mp ht
  have hc' := h c hc
  split at ht
  · rw [List.mem_singleton] at ht
    subst ht
    cases hc' with
    | map _ hs => exact hs _ rfl
  · exact nomatch ht

theorem listSpreads_checkableA {cs : List Val} (h : ∀ c ∈ cs, c.CheckableA) :
    ∀ t ∈ listSpreads cs, t.CheckableA := by
  intro t ht
  obtain ⟨c, hc, ht⟩ := List.mem_flatMap.mp ht
  have hc' := h c hc
  split at ht
  · rw [List.mem_singleton] at ht
    subst ht
    cases hc' with
    | list _ hs => exact hs _ rfl
  · exact nomatch ht

theorem memberTerms_checkableA {k : String} {cs : List Val} (h : ∀ c ∈ cs, c.CheckableA) :
    ∀ t ∈ memberTerms k cs, t.CheckableA := by
  intro t ht
  rcases List.mem_append.mp ht with ht | ht
  · exact valuesAt_checkableA h t ht
  · obtain ⟨u, hu, rfl⟩ := List.mem_map.mp ht
    exact (mapSpreads_checkableA h u hu).atKey k

theorem elementTerms_checkableA {i : ℕ} {cs : List Val} (h : ∀ c ∈ cs, c.CheckableA) :
    ∀ t ∈ elementTerms i cs, t.CheckableA := by
  intro t ht
  rcases List.mem_append.mp ht with ht | ht
  · exact itemsAt_checkableA h t ht
  · obtain ⟨u, hu, rfl⟩ := List.mem_map.mp ht
    exact (listSpreads_checkableA h u hu).atKey _

theorem exceptKeys_checkableA {ks : List String} {x : Val} (h : x.CheckableA) :
    (exceptKeys ks x).CheckableA := by
  unfold exceptKeys
  split
  · exact h
  · refine .selectKey (fun p r hm => ?_) (fun p r hm => ?_) (fun e he => ?_)
    · obtain ⟨k, -, he⟩ := List.mem_map.mp hm
      simp only [Prod.mk.injEq] at he
      rw [← he.1]; exact .lit
    · obtain ⟨k, -, he⟩ := List.mem_map.mp hm
      simp only [Prod.mk.injEq] at he
      rw [← he.2]; exact .any
    · simp only [Option.some.injEq] at he
      rw [← he]; exact h

theorem Val.directedSpread_checkableA {rd : Val → Val} (hrd : ∀ x, x.CheckableA → (rd x).CheckableA)
    {ks : List String} {all : List Val} {t w : Val} (hall : ∀ u ∈ all, u.CheckableA) (hw : w.CheckableA) :
    (Val.directedSpread rd ks all t w).CheckableA := by
  have hw' : (if all.any (Val.directs .lifts) then Val.ride .opened w.unseal [] else w).CheckableA := by
    split
    · exact .ride hw.unseal
    · exact hw
  have hseal : (closeSeal (if all.any (Val.directs .lifts) then all.map (fun t => Val.ride .opened t [])
      else all)).CheckableA := by
    refine closeSeal_checkableA fun u hu => ?_
    split at hu
    · obtain ⟨u', hu', rfl⟩ := List.mem_map.mp hu
      exact .ride (hall u' hu')
    · exact hall u hu
  unfold Val.directedSpread
  split
  · split
    · exact exceptKeys_checkableA (foldPlace_checkableA hrd hall)
    · exact .any
  · dsimp only
    by_cases hs : all.any (Val.directs .seals) = true
    · rw [if_pos hs]; exact .meet hw' (exceptKeys_checkableA hseal)
    · rw [if_neg hs]; exact hw'

section
variable {rd : Val → Val} (hrd : ∀ x, x.CheckableA → (rd x).CheckableA)
include hrd

theorem dirFields_checkableA (cs : List Val) (hcs : ∀ c ∈ cs, c.CheckableA) :
    ∀ (fs : List (String × Bool × Val)), (∀ k o v, (k, o, v) ∈ fs → v.CheckableA) →
    (∀ k o v, (k, o, v) ∈ fs → ∀ cs, (∀ c ∈ cs, c.CheckableA) → (v.dirIn rd cs).CheckableA) →
    ∀ k o v, (k, o, v) ∈ dirFields rd cs fs → v.CheckableA
  | [], _, _, _, _, _, h => nomatch h
  | (k, o, v) :: fs, hf, ih, k', o', v', h => by
    simp only [dirFields, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨rfl, rfl, rfl⟩ | h
    · have hvs := memberTerms_checkableA (k := k') hcs
      exact Val.directedAt_checkableA hrd hvs (ih _ _ _ List.mem_cons_self _ fun c hc => by
        obtain ⟨t, ht, hc⟩ := List.mem_flatMap.mp hc
        exact Val.placeTerms_checkableA (hvs t ht) c hc)
    · exact dirFields_checkableA cs hcs fs (fun k o v h' => hf k o v (List.mem_cons_of_mem _ h'))
        (fun k o v h' => ih k o v (List.mem_cons_of_mem _ h')) k' o' v' h

theorem dirItems_checkableA (cs : List Val) (hcs : ∀ c ∈ cs, c.CheckableA) :
    ∀ (i : ℕ) (items : List Val), (∀ v, v ∈ items → v.CheckableA) →
    (∀ v, v ∈ items → ∀ cs, (∀ c ∈ cs, c.CheckableA) → (v.dirIn rd cs).CheckableA) →
    ∀ v, v ∈ dirItems rd cs i items → v.CheckableA
  | _, [], _, _, _, h => nomatch h
  | i, v :: vs, hi, ih, v', h => by
    simp only [dirItems, List.mem_cons] at h
    rcases h with rfl | h
    · have hvs := elementTerms_checkableA (i := i) hcs
      exact Val.directedAt_checkableA hrd hvs (ih _ List.mem_cons_self _ fun c hc => by
        obtain ⟨t, ht, hc⟩ := List.mem_flatMap.mp hc
        exact Val.placeTerms_checkableA (hvs t ht) c hc)
    · exact dirItems_checkableA cs hcs (i + 1) vs (fun v h' => hi v (List.mem_cons_of_mem _ h'))
        (fun v h' => ih v (List.mem_cons_of_mem _ h')) v' h

theorem dirOwn_checkableA {t : Val} (ht : t.CheckableA)
    (ih : ∀ cs, (∀ c ∈ cs, c.CheckableA) → (t.dirIn rd cs).CheckableA) :
    (Val.directedAt rd [t] t (t.dirIn rd t.placeTerms)).CheckableA :=
  Val.directedAt_checkableA hrd (fun x hx => by rw [List.mem_singleton.mp hx]; exact ht)
    (ih _ (Val.placeTerms_checkableA ht))

theorem dirSpread_checkableA {ts : List Val} (hts : ∀ t ∈ ts, t.CheckableA) {ks : List String} :
    ∀ (s : Option Val), (∀ t, s = some t → t.CheckableA) →
    (∀ t, s = some t → ∀ cs, (∀ c ∈ cs, c.CheckableA) → (t.dirIn rd cs).CheckableA) →
    ∀ t, dirSpread rd ts ks s = some t → t.CheckableA
  | none, _, _, _, h => nomatch h
  | some t, hs, ih, t', h => by
    simp only [dirSpread, Option.some.injEq] at h
    subst h
    exact Val.directedSpread_checkableA hrd hts (ih t rfl _ fun c hc => by
      obtain ⟨u, hu, hc⟩ := List.mem_flatMap.mp hc
      exact Val.placeTerms_checkableA (hts u hu) c hc)

theorem dirArms_checkableA : ∀ (arms : List (ℕ × Val)), (∀ r a, (r, a) ∈ arms → a.CheckableA) →
    (∀ r a, (r, a) ∈ arms → ∀ cs, (∀ c ∈ cs, c.CheckableA) → (a.dirIn rd cs).CheckableA) →
    ∀ r a, (r, a) ∈ dirArms rd arms → a.CheckableA
  | [], _, _, _, _, h => nomatch h
  | (r, a) :: as, ha, ih, r', a', h => by
    simp only [dirArms, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨-, ha'⟩ | h
    · rw [ha']
      exact dirOwn_checkableA hrd (ha _ _ List.mem_cons_self) (ih _ _ List.mem_cons_self)
    · exact dirArms_checkableA as (fun r a h' => ha r a (List.mem_cons_of_mem _ h'))
        (fun r a h' => ih r a (List.mem_cons_of_mem _ h')) r' a' h

theorem Val.dirIn_checkableA : ∀ {v : Val}, v.CheckableA → ∀ (cs : List Val),
    (∀ c ∈ cs, c.CheckableA) → (v.dirIn rd cs).CheckableA := by
  intro v h
  induction h with
  | @map fs spread closed hf hs ihf ihs =>
    intro cs hcs
    simp only [Val.dirIn]
    exact .map (dirFields_checkableA hrd cs hcs fs hf ihf)
      (dirSpread_checkableA hrd (mapSpreads_checkableA hcs) spread hs ihs)
  | @list items spread closed hi hs ihi ihs =>
    intro cs hcs
    simp only [Val.dirIn]
    exact .list (dirItems_checkableA hrd cs hcs 0 items hi ihi)
      (dirSpread_checkableA hrd (listSpreads_checkableA hcs) spread hs ihs)
  | @or arms ha iha =>
    intro cs hcs
    simp only [Val.dirIn]
    exact .or (dirArms_checkableA hrd arms ha iha)
  | @pref r x hx ih =>
    intro cs hcs
    simp only [Val.dirIn]
    exact .pref (dirOwn_checkableA hrd hx ih)
  | meet _ _ iha ihb =>
    intro cs hcs
    simp only [Val.dirIn]
    exact .meet (iha cs hcs) (ihb cs hcs)
  | @ride k v r hv ih =>
    intro cs hcs
    cases k with
    | lifts => simp only [Val.dirIn]; exact .any
    | seals => simp only [Val.dirIn]; exact .any
    | opened => simp only [Val.dirIn]; exact .ride (ih cs hcs).unseal
    | _ => simp only [Val.dirIn]; exact .ride (ih cs hcs)
  | link _ ht ih _ =>
    intro cs hcs
    simp only [Val.dirIn]
    exact .link (ih cs hcs) ht
  | _ => intro _ _; (try simp only [Val.dirIn]); constructor <;> assumption
end

theorem dirF_checkableA : ∀ (m : ℕ) {v : Val}, v.CheckableA → (dirF m v).CheckableA
  | 0, _, h => h
  | m + 1, v, h => by
    simp only [dirF]
    exact Val.directedAt_checkableA (fun x hx => dirF_checkableA m hx)
      (fun x hx => by rw [List.mem_singleton.mp hx]; exact h)
      (Val.dirIn_checkableA (fun x hx => dirF_checkableA m hx) h _ (Val.placeTerms_checkableA h))

theorem Val.CheckableA.shape : ∀ {v : Val}, v.CheckableA → v.shape.CheckableA := by
  intro v h
  induction h with
  | @map fs spread closed hf hs ihf ihs =>
    simp only [Val.shape]
    refine .map (fun k o w hw => ?_) (fun t ht => ?_)
    · have : ∀ (fs : List (String × Bool × Val)), (∀ k o v, (k, o, v) ∈ fs → v.shape.CheckableA) →
          ∀ k o w, (k, o, w) ∈ shapeFields fs → w.CheckableA := by
        intro fs
        induction fs with
        | nil => intro _ k o w h; exact nomatch h
        | cons f fs ih =>
          obtain ⟨k₀, o₀, v₀⟩ := f
          intro hall k o w h
          simp only [shapeFields, List.mem_cons, Prod.mk.injEq] at h
          rcases h with ⟨-, -, rfl⟩ | h
          · exact hall _ _ _ List.mem_cons_self
          · exact ih (fun k o v h' => hall k o v (List.mem_cons_of_mem _ h')) k o w h
      exact this fs ihf k o w hw
    · cases spread with
      | none => exact nomatch ht
      | some s =>
        simp only [Option.map_some, Option.some.injEq] at ht
        subst ht; exact .any
  | @list items spread closed hi hs ihi ihs =>
    simp only [Val.shape]
    refine .list (fun w hw => ?_) (fun t ht => ?_)
    · have : ∀ (items : List Val), (∀ v, v ∈ items → v.shape.CheckableA) →
          ∀ w, w ∈ shapeItems items → w.CheckableA := by
        intro items
        induction items with
        | nil => intro _ w h; exact nomatch h
        | cons x xs ih =>
          intro hall w h
          simp only [shapeItems, List.mem_cons] at h
          rcases h with rfl | h
          · exact hall _ List.mem_cons_self
          · exact ih (fun v h' => hall v (List.mem_cons_of_mem _ h')) w h
      exact this items ihi w hw
    · cases spread with
      | none => exact nomatch ht
      | some s =>
        simp only [Option.map_some, Option.some.injEq] at ht
        subst ht; exact .any
  | @or arms ha iha =>
    simp only [Val.shape]
    refine .or fun r a h => ?_
    have : ∀ (arms : List (ℕ × Val)), (∀ r a, (r, a) ∈ arms → a.shape.CheckableA) →
        ∀ r a, (r, a) ∈ shapeArms arms → a.CheckableA := by
      intro arms
      induction arms with
      | nil => intro _ r a h; exact nomatch h
      | cons p ps ih =>
        obtain ⟨r₀, a₀⟩ := p
        intro hall r a h
        simp only [shapeArms, List.mem_cons, Prod.mk.injEq] at h
        rcases h with ⟨-, rfl⟩ | h
        · exact hall _ _ List.mem_cons_self
        · exact ih (fun r a h' => hall r a (List.mem_cons_of_mem _ h')) r a h
    exact this arms iha r a h
  | pref _ ih => simpa only [Val.shape] using ih
  | meet _ _ iha ihb => simp only [Val.shape]; exact .meet iha ihb
  | @ride k v r hv ih =>
    cases k <;> simp only [Val.shape] <;> first | exact .ride hv | exact .ride ih | exact ih
  | link _ _ ih _ => simpa only [Val.shape] using ih
  | @call f args ha iha =>
    simp only [Val.shape]
    split
    · match args, iha with
      | [x], iha => simpa only [shapeArgs] using iha x List.mem_cons_self
      | [], _ => simp only [shapeArgs]; exact .any
      | _ :: _ :: _, _ => simp only [shapeArgs]; exact .any
    · exact .any
  | _ => simp only [Val.shape]; exact .any

theorem landCall_checkableA {f : Fn} {args : List Val} (h : ∀ a, a ∈ args → a.CheckableA) :
    (landCall f args).CheckableA := by
  unfold landCall
  split
  · rename_i x
    have hx := h x List.mem_cons_self
    split
    · exact .meet (.call h) hx.shape
    · exact .call h
  · exact .call h

theorem Val.CheckableA.landed : ∀ {v : Val}, v.CheckableA → v.landed.CheckableA := by
  intro v h
  induction h with
  | @map fs spread closed hf hs ihf ihs =>
    simp only [Val.landed]
    refine .map (fun k o w hw => ?_) (fun t ht => ?_)
    · have : ∀ (fs : List (String × Bool × Val)), (∀ k o v, (k, o, v) ∈ fs → v.landed.CheckableA) →
          ∀ k o w, (k, o, w) ∈ landedFields fs → w.CheckableA := by
        intro fs
        induction fs with
        | nil => intro _ k o w h; exact nomatch h
        | cons f fs ih =>
          obtain ⟨k₀, o₀, v₀⟩ := f
          intro hall k o w h
          simp only [landedFields, List.mem_cons, Prod.mk.injEq] at h
          rcases h with ⟨-, -, rfl⟩ | h
          · exact hall _ _ _ List.mem_cons_self
          · exact ih (fun k o v h' => hall k o v (List.mem_cons_of_mem _ h')) k o w h
      exact this fs ihf k o w hw
    · cases spread with
      | none => exact nomatch ht
      | some s =>
        simp only [landedSpread, Option.some.injEq] at ht
        subst ht; exact ihs s rfl
  | @list items spread closed hi hs ihi ihs =>
    simp only [Val.landed]
    refine .list (fun w hw => ?_) (fun t ht => ?_)
    · have : ∀ (items : List Val), (∀ v, v ∈ items → v.landed.CheckableA) →
          ∀ w, w ∈ landedItems items → w.CheckableA := by
        intro items
        induction items with
        | nil => intro _ w h; exact nomatch h
        | cons x xs ih =>
          intro hall w h
          simp only [landedItems, List.mem_cons] at h
          rcases h with rfl | h
          · exact hall _ List.mem_cons_self
          · exact ih (fun v h' => hall v (List.mem_cons_of_mem _ h')) w h
      exact this items ihi w hw
    · cases spread with
      | none => exact nomatch ht
      | some s =>
        simp only [landedSpread, Option.some.injEq] at ht
        subst ht; exact ihs s rfl
  | @or arms ha iha =>
    simp only [Val.landed]
    refine .or fun r a h => ?_
    have : ∀ (arms : List (ℕ × Val)), (∀ r a, (r, a) ∈ arms → a.landed.CheckableA) →
        ∀ r a, (r, a) ∈ landedArms arms → a.CheckableA := by
      intro arms
      induction arms with
      | nil => intro _ r a h; exact nomatch h
      | cons p ps ih =>
        obtain ⟨r₀, a₀⟩ := p
        intro hall r a h
        simp only [landedArms, List.mem_cons, Prod.mk.injEq] at h
        rcases h with ⟨-, rfl⟩ | h
        · exact hall _ _ List.mem_cons_self
        · exact ih (fun r a h' => hall r a (List.mem_cons_of_mem _ h')) r a h
    exact this arms iha r a h
  | pref _ ih => simp only [Val.landed]; exact .pref ih
  | meet _ _ iha ihb => simp only [Val.landed]; exact .meet iha ihb
  | ride _ ih => simp only [Val.landed]; exact .ride ih
  | link _ ht ih _ => simp only [Val.landed]; exact .link ih ht
  | @call f args ha iha =>
    simp only [Val.landed]
    split
    · refine landCall_checkableA fun a h => ?_
      have : ∀ (items : List Val), (∀ v, v ∈ items → v.landed.CheckableA) →
          ∀ w, w ∈ landedItems items → w.CheckableA := by
        intro items
        induction items with
        | nil => intro _ w h; exact nomatch h
        | cons x xs ih =>
          intro hall w h
          simp only [landedItems, List.mem_cons] at h
          rcases h with rfl | h
          · exact hall _ List.mem_cons_self
          · exact ih (fun v h' => hall v (List.mem_cons_of_mem _ h')) w h
      exact this args iha a h
    · exact .call ha
  | _ => (try simp only [Val.landed]); constructor <;> assumption

theorem Val.directed_checkableA {v : Val} (h : v.CheckableA) : v.directed.CheckableA := by
  unfold Val.directed
  split
  · exact dirF_checkableA _ h.landed
  · exact h.landed

/-- A map whose one member writes no directive and has no place beneath
it reads as itself. -/
theorem Val.directed_map_of {k : String} {w : Val} (hw : w.landed = w) (hh : w.holdsDir = false) :
    (Val.map [(k, false, w)] none false).directed = .map [(k, false, w)] none false := by
  have hm : (Val.map [(k, false, w)] none false).landed = .map [(k, false, w)] none false := by
    simp [Val.landed, landedFields, landedSpread, hw]
  simp [Val.directed, hm, Val.holdsDir, holdsDirFields, holdsDirSpread, hh]

theorem expand_checkableA {ds : Decls} (hb : ∀ d, d ∈ ds → d.2.CheckableA) {v : Val}
    (hv : v.CheckableA) : (expand ds v).CheckableA :=
  Val.directed_checkableA (expandF_checkableA hb _ v hv)

/-! ### The budget -/

theorem Decls.budget_pos (ds : Decls) (j : Data) (stack : List String) : 1 ≤ ds.budget j stack :=
  Nat.le_trans (Nat.le_trans (Nat.le_add_left 1 j.weight) (Nat.le_mul_of_pos_right _ (Nat.succ_pos _)))
    (Nat.le_add_right _ _)

theorem Decls.budget_lighter {ds : Decls} {j j' : Data} (stack : List String) (hw : j'.weight < j.weight) :
    ds.budget j' [] + 1 ≤ ds.budget j stack := by
  unfold Decls.budget
  simp only [List.length_nil, Nat.sub_zero]
  have h2 : (j'.weight + 1 + 1) * (ds.length + 1) ≤ (j.weight + 1) * (ds.length + 1) :=
    Nat.mul_le_mul_right _ (Nat.succ_le_succ hw)
  rw [Nat.add_mul, Nat.one_mul] at h2
  exact Nat.le_trans (by rw [Nat.add_assoc]; exact h2) (Nat.le_add_right _ _)

theorem Decls.budget_push {ds : Decls} {j : Data} {k : String} {stack : List String}
    (hlen : (k :: stack).length ≤ ds.length) : ds.budget j (k :: stack) + 1 = ds.budget j stack := by
  unfold Decls.budget
  simp only [List.length_cons] at hlen ⊢
  have h1 : 1 ≤ ds.length - stack.length := Nat.le_sub_of_add_le (by rw [Nat.add_comm]; exact hlen)
  rw [Nat.add_assoc, ← Nat.sub_sub, Nat.sub_add_cancel h1]

/-! ### The checker under the declarations is the definition's -/

theorem checkD_judge {ds : Decls} {root : Data} (hg : ds.Guarded) (hb : ∀ d, d ∈ ds → d.2.CheckableA) :
    ∀ (n : ℕ) (stack : List String) (v : Val) (j : Data), ds.Stacked stack v →
      ds.budget j stack ≤ n → v.CheckableA → Judge ds.envE root (checkD ds n stack v j) v j
  | 0, stack, _, j, _, hn, _ => absurd (Nat.le_trans (ds.budget_pos j stack) hn) (Nat.not_succ_le_zero 0)
  | n + 1, stack, v, j, hs, hn, hv => by
    simp only [checkD]
    apply checkWith_judge hv j
    intro k j' hk
    dsimp only
    rcases hk with ⟨hlt, -⟩ | ⟨heq, hku⟩
    · cases he : ds.env k with
      | none => exact .aliasNone (by simp [Decls.envE, he])
      | some b =>
        simp only [hlt, ↓reduceIte]
        have hn' : ds.budget j' [] ≤ n :=
          Nat.le_of_succ_le_succ (Nat.le_trans (ds.budget_lighter stack hlt) hn)
        exact (judge_alias_iff he).mpr (checkD_judge hg hb n [] (expand ds b) j' (Decls.Stacked.nil _) hn'
          (expand_checkableA hb (Decls.env_checkableA hb he)))
    · have hnot : k ∉ stack := hs.not_mem hg hku
      cases he : ds.env k with
      | none => exact .aliasNone (by simp [Decls.envE, he])
      | some b =>
        have hnlt : ¬ j'.weight < j.weight := fun h => Nat.lt_irrefl _ (heq ▸ h)
        have hcon : ¬ stack.contains k = true := fun h => hnot (List.contains_iff_mem.mp h)
        simp only [hnlt, hcon, ↓reduceIte, Bool.false_eq_true]
        have hs' := hs.push hku hnot he
        have hn' : ds.budget j' (k :: stack) ≤ n := by
          have hpush := Decls.budget_push (ds := ds) (j := j') hs'.length_le
          have hw : ds.budget j' stack = ds.budget j stack := by
            unfold Decls.budget; rw [heq]
          rw [hw] at hpush
          rw [← hpush] at hn
          exact Nat.le_of_succ_le_succ hn
        exact (judge_alias_iff he).mpr (checkD_judge hg hb n (k :: stack) (expand ds b) j' hs' hn'
          (expand_checkableA hb (Decls.env_checkableA hb he)))

/-- The checker under the declarations judges every value it can check
as the definition does, wherever the names keep the alias-cycle rule. -/
theorem checkR_judge {ds : Decls} {root : Data} (hg : ds.Guarded) (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    {v : Val} (hv : v.CheckableA) (j : Data) : Judge ds.envE root (checkR ds v j) v j :=
  checkD_judge hg hb _ [] v j (Decls.Stacked.nil _) (Nat.le_refl _) hv

/-- The checker under the declarations decides admission, and refusal,
for every value it can check, wherever the names keep the alias-cycle
rule. -/
theorem checkR_iff {ds : Decls} {root : Data} (hg : ds.Guarded) (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    {v : Val} (hv : v.CheckableA) (j : Data) {b : Bool} : checkR ds v j = b ↔ Judge ds.envE root b v j :=
  (checkR_judge hg hb hv j).toIff

/-! ## The meet with the declarations -/

/-- Whether a term is concrete structure, which a residual expands
against: everything but `any`, `nil`, a reference and a connective. -/
def Val.concrete : Val → Bool
  | .any | .nil | .alias _ | .path _ | .meet _ _ | .or _ | .pref _ _ => false
  | .ride _ v _ => v.concrete
  | .link v _ => v.concrete
  | _ => true

/-- Whether every body reads no path, no pattern and no format. -/
def Decls.bodiesCheckableB (ds : Decls) : Bool := ds.all fun d => d.2.checkableAB

theorem Decls.bodiesCheckableB_iff {ds : Decls} :
    ds.bodiesCheckableB = true ↔ ∀ d, d ∈ ds → d.2.CheckableA := by
  simp only [Decls.bodiesCheckableB, List.all_eq_true, Val.checkableAB_iff]

/-- Whether a term is a map or a list, which admits no scalar whatever
its members hold. -/
def Val.container : Val → Bool
  | .map _ _ _ | .list _ _ _ => true
  | _ => false

/-- A literal met with a term under the declarations: `nil` where the
term is a map or a list, whatever its members hold, paths among them;
the literal where the term admits its value and `nil` where it refuses
it, decided by the checker of the fragment where the term reads no name
(`check`), whatever the bodies hold, and else by the checker that reads
the names wherever the names keep the alias-cycle rule and the bodies
and the term read no pattern and no format, either way only where the
term writes no path and holds no call the reading has not made; and the
pair where that cannot be computed, where the term writes a path, which is read by
declaration later and until then is left as written, or where the term
is a call the reading has not made. -/
def litMeetD (ds : Decls) (s : Scalar) (b : Val) : Val :=
  if b.container then .nil
  else if b.checkableB && b.paths.isEmpty && !b.callAt then (if check b s.data then .lit s else .nil)
  else if ds.guardedB && ds.bodiesCheckableB && b.checkableAB && b.paths.isEmpty && !b.callAt then
    (if checkR ds b s.data then .lit s else .nil)
  else .meet (.lit s) b

/-- A map or a list admits no scalar. -/
theorem not_admits_container {env : Env} {root : Data} {b : Val} (hb : b.container = true) (s : Scalar) :
    ¬ Admits env root b s.data := by
  intro h
  cases b <;> simp only [Val.container, Bool.false_eq_true] at hb <;> cases s <;> cases h

theorem admits_litMeetD {ds : Decls} {root : Data} (s : Scalar) (b : Val) (j : Data) :
    Admits ds.envE root (litMeetD ds s b) j ↔
      Admits ds.envE root (.lit s) j ∧ Admits ds.envE root b j := by
  unfold litMeetD
  by_cases hk : b.container = true
  · rw [if_pos hk]
    constructor
    · exact fun h => nomatch h
    · rintro ⟨h₁, h₂⟩
      obtain rfl := admits_lit_iff.mp h₁
      exact (not_admits_container hk s h₂).elim
  rw [if_neg hk]
  by_cases hf : (b.checkableB && b.paths.isEmpty && !b.callAt) = true
  · rw [if_pos hf]
    simp only [Bool.and_eq_true] at hf
    have hf' := (Val.checkableB_iff b).mp hf.1.1
    by_cases hj : check b s.data = true
    · rw [if_pos hj]
      constructor
      · intro h
        obtain rfl := admits_lit_iff.mp h
        exact ⟨h, (check_iff hf' _).mp hj⟩
      · exact fun h => h.1
    · rw [if_neg hj]
      constructor
      · exact fun h => nomatch h
      · intro ⟨h₁, h₂⟩
        obtain rfl := admits_lit_iff.mp h₁
        exact (hj ((check_iff hf' _).mpr h₂)).elim
  rw [if_neg hf]
  by_cases hc : (ds.guardedB && ds.bodiesCheckableB && b.checkableAB && b.paths.isEmpty &&
      !b.callAt) = true
  · rw [if_pos hc]
    simp only [Bool.and_eq_true] at hc
    obtain ⟨⟨⟨⟨hg, hb⟩, hcb⟩, -⟩, -⟩ := hc
    have hg' := Decls.guardedB_iff.mp hg
    have hb' := Decls.bodiesCheckableB_iff.mp hb
    have hcb' := (Val.checkableAB_iff b).mp hcb
    by_cases hk : checkR ds b s.data = true
    · rw [if_pos hk]
      constructor
      · intro h
        obtain rfl := admits_lit_iff.mp h
        exact ⟨h, (checkR_iff hg' hb' hcb' _).mp hk⟩
      · exact fun h => h.1
    · rw [if_neg hk]
      constructor
      · exact fun h => nomatch h
      · intro ⟨h₁, h₂⟩
        obtain rfl := admits_lit_iff.mp h₁
        exact (hk ((checkR_iff hg' hb' hcb' _).mpr h₂)).elim
  · rw [if_neg hc]
    exact admits_meet_iff

theorem litMeetD_checkableA {ds : Decls} (s : Scalar) (b : Val) (hb : b.CheckableA) :
    (litMeetD ds s b).CheckableA := by
  unfold litMeetD
  split
  · constructor
  · split
    · split
      · constructor
      · constructor
    · split
      · split
        · constructor
        · constructor
      · exact .meet (by constructor) hb

/-- A step of the meet with the declarations: a residual against
concrete structure expands by one level, and every other pair takes a
step of the meet. -/
def meetStepA (ds : Decls) (rec : Val → Val → Val) (a b : Val) : Val :=
  match a.alias?, b.alias? with
  | some k, _ =>
    if b.concrete then
      match ds.env k with
      | some body => rec (expand ds body) b
      | none => meetStep (litMeetD ds) rec a b
    else meetStep (litMeetD ds) rec a b
  | none, some k =>
    if a.concrete then
      match ds.env k with
      | some body => rec a (expand ds body)
      | none => meetStep (litMeetD ds) rec a b
    else meetStep (litMeetD ds) rec a b
  | none, none => meetStep (litMeetD ds) rec a b

/-- The meet with the declarations, within a budget of steps. -/
def meetA (ds : Decls) : ℕ → Val → Val → Val
  | 0, a, b => .meet a b
  | n + 1, a, b => meetStepA ds (meetA ds n) a b

section
variable {ds : Decls} {root : Data}

theorem admits_meetStepA {rec : Val → Val → Val}
    (hr : ∀ a b j, Admits ds.envE root (rec a b) j ↔ Admits ds.envE root a j ∧ Admits ds.envE root b j)
    (a b : Val) (j : Data) :
    Admits ds.envE root (meetStepA ds rec a b) j ↔ Admits ds.envE root a j ∧ Admits ds.envE root b j := by
  unfold meetStepA
  cases ha : a.alias? with
  | some k =>
    obtain rfl := Val.alias?_some.mp ha
    cases hc : b.concrete with
    | false => exact admits_meetStep admits_litMeetD hr _ _ _
    | true =>
      simp only [↓reduceIte]
      cases he : ds.env k with
      | none => exact admits_meetStep admits_litMeetD hr _ _ _
      | some body => rw [hr, admits_alias_iff he]
  | none =>
    cases hb : b.alias? with
    | some k =>
      obtain rfl := Val.alias?_some.mp hb
      cases hc : a.concrete with
      | false => exact admits_meetStep admits_litMeetD hr _ _ _
      | true =>
        simp only [↓reduceIte]
        cases he : ds.env k with
        | none => exact admits_meetStep admits_litMeetD hr _ _ _
        | some body => rw [hr, admits_alias_iff he]
    | none => exact admits_meetStep admits_litMeetD hr _ _ _

/-- Whatever the budget, the meet with the declarations admits what both
of its sides admit. -/
theorem admits_meetA : ∀ (n : ℕ) (a b : Val) (j : Data),
    Admits ds.envE root (meetA ds n a b) j ↔ Admits ds.envE root a j ∧ Admits ds.envE root b j
  | 0, _, _, _ => by simp only [meetA]; exact admits_meet_iff
  | n + 1, a, b, j => by simp only [meetA]; exact admits_meetStepA (admits_meetA n) a b j

end

/-- The size of the bodies declared, each expanded, summed: what a
residual can add to a term at each level of the data. -/
def Decls.expandedSize (ds : Decls) : ℕ := ds.foldl (fun acc d => acc + (expand ds d.2).size) 0

/-- The budget of steps a meet under the declarations takes: a few for
each node of the two terms and of the bodies a residual expands to.
Two atoms that neither combine nor refuse each other leave a meet as
written, which the splitting rules take up again, so the budget is what
ends that, and it is kept small enough to run. -/
def Decls.meetFuel (ds : Decls) (a b : Val) : ℕ := 4 * (a.size + b.size + 4) * (ds.expandedSize + 2)

/-- `a & b` under the declarations, computed, within the budget. -/
def meetD (ds : Decls) (a b : Val) : Val := meetA ds (ds.meetFuel a b) a b

theorem admits_meetD {ds : Decls} {root : Data} (a b : Val) (j : Data) :
    Admits ds.envE root (meetD ds a b) j ↔ Admits ds.envE root a j ∧ Admits ds.envE root b j :=
  admits_meetA _ a b j

/-- The normal form under the declarations: met with `any`, so that
every meet is computed, every dead arm dropped, and every residual the
term's own structure reaches expanded. -/
def normaliseD (ds : Decls) (v : Val) : Val := meetD ds .any v

theorem admits_normaliseD {ds : Decls} {root : Data} (v : Val) (j : Data) :
    Admits ds.envE root (normaliseD ds v) j ↔ Admits ds.envE root v j := by
  rw [normaliseD, admits_meetD]
  exact ⟨fun h => h.2, fun h => ⟨.any, h⟩⟩

/-! ## What evaluation singles out, under the declarations -/

/-- What evaluation singles out for `v` under the declarations: what
the visible part of its normal form generates. -/
def OutputD (ds : Decls) (root : Data) (v : Val) (j : Data) : Prop :=
  Gen ds.envE root (normaliseD ds v).visible j

/-- What evaluation singles out under the declarations is an instance
of the visible part of the normal form. -/
theorem outputD_admits {ds : Decls} {root : Data} (v : Val) (j : Data) (h : OutputD ds root v j) :
    Admits ds.envE root (normaliseD ds v).visible j :=
  gen_admits _ j h

theorem outputD_unique {ds : Decls} {root : Data} {v : Val} {j j' : Data}
    (h : OutputD ds root v j) (h' : OutputD ds root v j') : j = j' :=
  gen_unique _ _ _ h h'

/-- The generator under the declarations: the checker reads the names. -/
def genD (ds : Decls) : Val → Option Data := genWith (checkR ds)

/-- What evaluation singles out under the declarations, computed. -/
def outputD (ds : Decls) (v : Val) : Option Data := genD ds (normaliseD ds v).visible

/-- `outputD` computes `OutputD` wherever the normal form can be read,
and the names keep the alias-cycle rule. -/
theorem outputD_iff {ds : Decls} {root : Data} (hg : ds.Guarded) (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    {v : Val} (h : (normaliseD ds v).CheckableA) (j : Data) :
    outputD ds v = some j ↔ OutputD ds root v j :=
  genWith_iff h.visible (fun _ j hw _ => checkR_iff hg hb hw j) j


/-! ## The normal form can be read

The checker reads a term that holds no path, no pattern and no format.
The meet builds its answer from the pieces of its sides and the bodies
it unfolds, so the normal form of a term the checker can read is one it
can read: what `vet` has to decide can be decided. -/

theorem Kind.val_checkableA (k : Kind) : k.val.CheckableA := by
  cases k <;> constructor

theorem Kind.meet_checkableA (ka kb : Kind) : (ka.meet kb).CheckableA := by
  cases ka <;> cases kb <;> first
    | exact .nil | exact .integer | exact .float | exact .biginteger | exact .bigdecimal
    | exact .number | exact .string | exact .anyString | exact .boolean | exact .pathKind

theorem litMeet_checkableA (s : Scalar) {b : Val} (hb : b.CheckableA) : (litMeet s b).CheckableA := by
  unfold litMeet
  split
  · split
    · exact .lit
    · exact .nil
  · exact .meet .lit hb

theorem aliasMeet_checkableA {a b : Val} (ha : a.CheckableA) (hb : b.CheckableA) :
    (aliasMeet a b).CheckableA := by
  unfold aliasMeet
  split
  · split
    · exact ha
    · exact .meet ha hb
  · split
    · exact .meet ha hb
    · exact .nil

theorem pathMeet_checkableA {a b : Val} (ha : a.CheckableA) (hb : b.CheckableA) :
    (pathMeet a b).CheckableA := by
  unfold pathMeet
  split
  · unfold addrMeet
    split
    · exact .addr
    · split
      · exact .addr
      · exact .nil
  · exact .addr
  · exact .addr
  · exact aliasMeet_checkableA ha hb

theorem atomMeet_checkableA {a b : Val} (ha : a.CheckableA) (hb : b.CheckableA) :
    (atomMeet a b).CheckableA := by
  unfold atomMeet
  split
  · exact Kind.meet_checkableA _ _
  · exact pathMeet_checkableA ha hb

theorem meetBase_checkableA {lm : Scalar → Val → Val} (hl : ∀ s b, b.CheckableA → (lm s b).CheckableA)
    {a b : Val} (ha : a.CheckableA) (hb : b.CheckableA) : (meetBase lm a b).CheckableA := by
  unfold meetBase
  split
  · exact hb
  · split
    · exact ha
    · split
      · exact hl _ _ hb
      · exact hl _ _ ha
      · exact atomMeet_checkableA ha hb

theorem mkOr_checkableA {arms : List (ℕ × Val)} (h : ∀ p, p ∈ arms → p.2.CheckableA) :
    (mkOr arms).CheckableA := by
  simp only [mkOr]
  split
  · exact .nil
  · refine .or fun r a hm => ?_
    obtain ⟨p, hp, hq⟩ := List.mem_flatMap.mp (List.mem_filter.mp hm).1
    exact flattenArm_checkableA (h p hp) (r, a) hq

section
variable {m : Val → Val → Val}

theorem meetDecls_checkableA (hm : ∀ a b, a.CheckableA → b.CheckableA → (m a b).CheckableA) {k : String} :
    ∀ (fs : List (String × Bool × Val)) {v : Val}, v.CheckableA →
      (∀ k' o w, (k', o, w) ∈ fs → w.CheckableA) → (meetDecls m k v fs).CheckableA
  | [], _, hv, _ => hv
  | (k', o, w) :: fs, v, hv, hfs => by
    simp only [meetDecls]
    refine meetDecls_checkableA hm fs ?_ (fun k'' o' w' h => hfs k'' o' w' (List.mem_cons_of_mem _ h))
    split
    · exact hm _ _ hv (hfs k' o w (List.mem_cons_self))
    · exact hv

theorem meetKey_checkableA (hm : ∀ a b, a.CheckableA → b.CheckableA → (m a b).CheckableA)
    {other : List (String × Bool × Val)} {s : Option Val} {c : Bool} {f : String × Bool × Val}
    (hother : ∀ k o w, (k, o, w) ∈ other → w.CheckableA) (hs : ∀ t, s = some t → t.CheckableA)
    (hf : f.2.2.CheckableA) : ∀ g, meetKey m other s c f = some g → g.2.2.CheckableA := by
  intro g hg
  unfold meetKey at hg
  split at hg
  · cases hg
    exact meetDecls_checkableA hm other hf hother
  · split at hg
    · split at hg
      · exact nomatch hg
      · cases hg
        exact .nil
    · cases hg
      refine hm _ _ hf (Val.CheckableA.dropMarks (Val.CheckableA.selectNow ?_))
      cases s with
      | none => exact .any
      | some t => exact (hs t rfl).atKey _

theorem foldSpread_checkableA (hm : ∀ a b, a.CheckableA → b.CheckableA → (m a b).CheckableA)
    {sp : Option Val} {fs : List (String × Bool × Val)}
    (hsp : ∀ t, sp = some t → t.CheckableA) (hfs : ∀ k o w, (k, o, w) ∈ fs → w.CheckableA) :
    ∀ k o w, (k, o, w) ∈ foldSpread m sp fs → w.CheckableA := by
  intro k o w hw
  unfold foldSpread at hw
  split at hw
  · exact hfs k o w hw
  · rename_i t
    obtain ⟨⟨k', o', u⟩, hu, he⟩ := List.mem_map.mp hw
    simp only [Prod.mk.injEq] at he
    obtain ⟨rfl, rfl, rfl⟩ := he
    exact hm _ _ (hfs _ _ _ hu) ((hsp t rfl).atKey _).selectNow.dropMarks

theorem meetSpread_checkableA (hm : ∀ a b, a.CheckableA → b.CheckableA → (m a b).CheckableA)
    {s₁ s₂ : Option Val} (h₁ : ∀ t, s₁ = some t → t.CheckableA) (h₂ : ∀ t, s₂ = some t → t.CheckableA) :
    ∀ t, meetSpread m s₁ s₂ = some t → t.CheckableA := by
  intro t ht
  cases s₁ with
  | none =>
    cases s₂ with
    | none => exact nomatch ht
    | some t₂ => exact (Option.some.inj ht) ▸ h₂ t₂ rfl
  | some t₁ =>
    cases s₂ with
    | none => exact (Option.some.inj ht) ▸ h₁ t₁ rfl
    | some t₂ =>
      rw [← Option.some.inj ht]
      split
      · exact .meet (h₁ t₁ rfl) (h₂ t₂ rfl)
      · exact hm _ _ (h₁ t₁ rfl) (h₂ t₂ rfl)

theorem meetMap_checkableA (hm : ∀ a b, a.CheckableA → b.CheckableA → (m a b).CheckableA)
    {fs₁ fs₂ : List (String × Bool × Val)} {s₁ s₂ : Option Val} {c₁ c₂ : Bool}
    (hf₁ : ∀ k o w, (k, o, w) ∈ fs₁ → w.CheckableA) (hs₁ : ∀ t, s₁ = some t → t.CheckableA)
    (hf₂ : ∀ k o w, (k, o, w) ∈ fs₂ → w.CheckableA) (hs₂ : ∀ t, s₂ = some t → t.CheckableA) :
    (meetMap m fs₁ s₁ c₁ fs₂ s₂ c₂).CheckableA := by
  have hm' : ∀ a b, a.CheckableA → b.CheckableA → (m b a).CheckableA := fun a b ha hb => hm b a hb ha
  refine .map (foldSpread_checkableA hm (meetSpread_checkableA hm hs₁ hs₂) ?_)
    (meetSpread_checkableA hm hs₁ hs₂)
  intro k o w hw
  rcases List.mem_append.mp hw with hw | hw
  · obtain ⟨f, hf, hg⟩ := List.mem_filterMap.mp hw
    exact meetKey_checkableA hm hf₂ hs₂ (hf₁ f.1 f.2.1 f.2.2 hf) (k, o, w) hg
  · obtain ⟨f, hf, hg⟩ := List.mem_filterMap.mp hw
    split at hg
    · exact nomatch hg
    · exact meetKey_checkableA hm' hf₁ hs₁ (hf₂ f.1 f.2.1 f.2.2 hf) (k, o, w) hg

theorem meetPos_checkableA (hm : ∀ a b, a.CheckableA → b.CheckableA → (m a b).CheckableA)
    {f₁ f₂ : Bool} {a b : Option Val} (ha : ∀ x, a = some x → x.CheckableA)
    (hb : ∀ x, b = some x → x.CheckableA) : (meetPos m f₁ f₂ a b).CheckableA := by
  cases a with
  | none =>
    cases b with
    | none => exact .nil
    | some y =>
      show (if f₁ then Val.nil else m .any y).CheckableA
      split
      · exact .nil
      · exact hm _ _ .any (hb y rfl)
  | some x =>
    cases b with
    | none =>
      show (if f₂ then Val.nil else m x .any).CheckableA
      split
      · exact .nil
      · exact hm _ _ (ha x rfl) .any
    | some y => exact hm _ _ (ha x rfl) (hb y rfl)

theorem meetWrap_checkableA (hm : ∀ a b, a.CheckableA → b.CheckableA → (m a b).CheckableA)
    {sp : Option Val} {i : ℕ} {e : Val} (hsp : ∀ t, sp = some t → t.CheckableA) (he : e.CheckableA) :
    (meetWrap m sp i e).CheckableA := by
  cases sp with
  | none => exact he
  | some t => exact hm _ _ he ((hsp t rfl).atKey _).selectNow.dropMarks

theorem meetItems_checkableA (hm : ∀ a b, a.CheckableA → b.CheckableA → (m a b).CheckableA)
    {f₁ f₂ : Bool} {sp : Option Val} {is₁ is₂ : List Val} (hsp : ∀ t, sp = some t → t.CheckableA)
    (h₁ : ∀ v, v ∈ is₁ → v.CheckableA) (h₂ : ∀ v, v ∈ is₂ → v.CheckableA) :
    ∀ v, v ∈ meetItems m f₁ f₂ sp is₁ is₂ → v.CheckableA := by
  intro v hv
  obtain ⟨i, -, rfl⟩ := List.mem_map.mp hv
  exact meetWrap_checkableA hm hsp (meetPos_checkableA hm
    (fun x hx => h₁ x (List.mem_of_getElem? hx)) (fun x hx => h₂ x (List.mem_of_getElem? hx)))

theorem meetList_checkableA (hm : ∀ a b, a.CheckableA → b.CheckableA → (m a b).CheckableA)
    {is₁ is₂ : List Val} {s₁ s₂ : Option Val} {c₁ c₂ : Bool}
    (h₁ : ∀ v, v ∈ is₁ → v.CheckableA) (hs₁ : ∀ t, s₁ = some t → t.CheckableA)
    (h₂ : ∀ v, v ∈ is₂ → v.CheckableA) (hs₂ : ∀ t, s₂ = some t → t.CheckableA) :
    (meetList m is₁ s₁ c₁ is₂ s₂ c₂).CheckableA := by
  refine .list (meetItems_checkableA hm (meetSpread_checkableA hm hs₁ hs₂) h₁ h₂) ?_
  intro t ht
  split at ht
  · exact nomatch ht
  · exact meetSpread_checkableA hm hs₁ hs₂ t ht

end

/-- A meet with absence keeps a term the checker can read. -/
theorem absentOr_checkableA {v : Val} (h : v.CheckableA) : (absentOr v).CheckableA := by
  unfold absentOr
  split
  · exact .absent
  · exact h

/-- A meet with an atom that admits nothing is a term the checker can
read. -/
theorem nothingOr_checkableA (v : Val) : (nothingOr v).CheckableA := by
  unfold nothingOr
  split
  · exact .nothing
  · exact .nil

theorem unrankF_checkableA : ∀ (n : ℕ) {v : Val}, v.CheckableA → (unrankF n v).CheckableA
  | 0, _, h => h
  | n + 1, v, h => by
    cases v with
    | or arms =>
      cases h with
      | or ha =>
        simp only [unrankF]
        refine .or fun r a hm => ?_
        obtain ⟨⟨r', a'⟩, hm', he⟩ := List.mem_map.mp hm
        simp only [Prod.mk.injEq] at he
        obtain ⟨rfl, rfl⟩ := he
        exact unrankF_checkableA n (ha r' a' hm')
    | _ => exact h

section
variable {rec : Val → Val → Val} (hr : ∀ a b, a.CheckableA → b.CheckableA → (rec a b).CheckableA)
include hr

theorem foldArms_checkableA {live : List (ℕ × Val)} (h : ∀ p, p ∈ live → p.2.CheckableA) :
    ∀ p, p ∈ foldArms rec live → p.2.CheckableA := by
  have hfold : ∀ (more : List (ℕ × Val)) (acc : Val), acc.CheckableA → (∀ a, a ∈ more → a.2.CheckableA) →
      (more.foldl (fun acc a => rec acc a.2) acc).CheckableA := by
    intro more
    induction more with
    | nil => intro acc hacc _; exact hacc
    | cons a more ih =>
      intro acc hacc hm
      exact ih _ (hr _ _ hacc (hm a List.mem_cons_self)) fun a' h' => hm a' (List.mem_cons_of_mem _ h')
  unfold foldArms
  split
  · exact h
  · split
    · rename_i p q more hpq
      have hsub : ∀ a, a ∈ p :: q :: more → a.2.CheckableA := fun a ha =>
        h a (List.mem_filter.mp (hpq ▸ ha)).1
      split
      · exact h
      · intro a ha
        rcases List.mem_cons.mp ha with rfl | ha
        · exact hfold more _ (hr _ _ (hsub p List.mem_cons_self)
            (hsub q (List.mem_cons_of_mem _ List.mem_cons_self)))
            fun a' h' => hsub a' (List.mem_cons_of_mem _ (List.mem_cons_of_mem _ h'))
        · obtain ⟨b, hb, rfl⟩ := List.mem_map.mp ha
          split
          · exact unrankF_checkableA _ (h b hb)
          · exact h b hb
    · exact h

theorem mkOrF_checkableA {arms : List (ℕ × Val)} (h : ∀ p, p ∈ arms → p.2.CheckableA) :
    (mkOrF rec arms).CheckableA := by
  have hm := mkOr_checkableA h
  unfold mkOrF
  split
  · rename_i live heq
    rw [heq] at hm
    cases hm with
    | or ha => exact .or fun r a hp => foldArms_checkableA hr (fun p hp' => ha p.1 p.2 hp') (r, a) hp
  · exact hm

theorem mkOr_or_left {arms : List (ℕ × Val)} {b : Val} (ha : (Val.or arms).CheckableA) (hb : b.CheckableA) :
    (mkOrF rec (arms.map fun p => (p.1, rec p.2 b))).CheckableA := by
  cases ha with
  | or h =>
    refine mkOrF_checkableA hr fun p hp => ?_
    obtain ⟨q, hq, rfl⟩ := List.mem_map.mp hp
    exact hr _ _ (h q.1 q.2 hq) hb

theorem mkOr_or_right {a : Val} {arms : List (ℕ × Val)} (ha : a.CheckableA) (hb : (Val.or arms).CheckableA) :
    (mkOrF rec (arms.map fun p => (p.1, rec a p.2))).CheckableA := by
  cases hb with
  | or h =>
    refine mkOrF_checkableA hr fun p hp => ?_
    obtain ⟨q, hq, rfl⟩ := List.mem_map.mp hp
    exact hr _ _ ha (h q.1 q.2 hq)

theorem mkOr_pref_left {r : ℕ} {x b : Val} (hx : (Val.pref r x).CheckableA) (hb : b.CheckableA) :
    (mkOrF rec [(r, rec x b), (0, rec x.super b)]).CheckableA := by
  cases hx with
  | pref hx =>
    refine mkOrF_checkableA hr fun p hp => ?_
    simp only [List.mem_cons, List.mem_nil_iff, or_false] at hp
    rcases hp with rfl | rfl
    · exact hr _ _ hx hb
    · exact hr _ _ hx.super hb

theorem mkOr_pref_right {a : Val} {r : ℕ} {y : Val} (ha : a.CheckableA) (hy : (Val.pref r y).CheckableA) :
    (mkOrF rec [(r, rec a y), (0, rec a y.super)]).CheckableA := by
  cases hy with
  | pref hy =>
    refine mkOrF_checkableA hr fun p hp => ?_
    simp only [List.mem_cons, List.mem_nil_iff, or_false] at hp
    rcases hp with rfl | rfl
    · exact hr _ _ ha hy
    · exact hr _ _ ha hy.super

theorem nodeRight_checkableA {a b : Val} (ha : a.CheckableA) (hb : b.CheckableA) :
    (nodeRight rec a b).CheckableA := by
  cases b <;> (unfold nodeRight; dsimp only) <;> first
    | exact mkOr_or_right hr ha hb
    | exact mkOr_pref_right hr ha hb
    | exact .meet ha hb

theorem nodeLeft_checkableA {a b : Val} (ha : a.CheckableA) (hb : b.CheckableA) :
    (nodeLeft rec a b).CheckableA := by
  cases a <;> (unfold nodeLeft; dsimp only) <;> first
    | exact mkOr_or_left hr ha hb
    | exact mkOr_pref_left hr ha hb
    | exact nodeRight_checkableA hr ha hb

omit hr in
theorem armsOf_checkableA {v : Val} (h : v.CheckableA) : ∀ p, p ∈ v.armsOf → p.2.CheckableA := by
  cases v with
  | or arms => cases h with | or ha => exact fun p hp => ha p.1 p.2 hp
  | pref r x =>
    cases h with
    | pref hx =>
      intro p hp
      simp only [Val.armsOf, List.mem_cons, List.not_mem_nil, or_false] at hp
      rcases hp with rfl | rfl
      · exact hx
      · exact hx.super
  | _ => intro p hp; rw [List.mem_singleton.mp hp]; exact h

theorem nodeNorm_checkableA {v : Val} (h : v.CheckableA) : (nodeNorm rec v).CheckableA := by
  cases v with
  | or arms =>
    simp only [nodeNorm]
    split
    · exact mkOr_or_left hr h .any
    · exact h
  | _ => exact h

theorem tieArms_checkableA {r k : ℕ} {a b : Val} (ha : a.CheckableA) (hb : b.CheckableA) :
    ∀ p, p ∈ tieArms rec r k a b → p.2.CheckableA := by
  have hpa : ∀ p, p ∈ armsAtRank r a → p.2.CheckableA := fun p hp =>
    armsOf_checkableA ha p (List.mem_filter.mp hp).1
  have hqa : ∀ p, p ∈ armsOffRank r a → p.2.CheckableA := fun p hp =>
    armsOf_checkableA ha p (List.mem_filter.mp hp).1
  have hpb : ∀ p, p ∈ armsAtRank r b → p.2.CheckableA := fun p hp =>
    armsOf_checkableA hb p (List.mem_filter.mp hp).1
  have hqb : ∀ p, p ∈ armsOffRank r b → p.2.CheckableA := fun p hp =>
    armsOf_checkableA hb p (List.mem_filter.mp hp).1
  intro p hp
  unfold tieArms at hp
  rcases List.mem_append.mp hp with hp | hp
  · rcases List.mem_append.mp hp with hp | hp
    · obtain ⟨x, hx, hm⟩ := List.mem_flatMap.mp hp
      obtain ⟨y, hy, rfl⟩ := List.mem_map.mp hm
      exact hr _ _ (hpa x hx) (hpb y hy)
    · obtain ⟨x, hx, rfl⟩ := List.mem_map.mp hp
      refine mkOrF_checkableA hr fun q hq => ?_
      obtain ⟨y, hy, rfl⟩ := List.mem_map.mp hq
      exact hr _ _ (hpa x hx) (hqb y hy)
  · obtain ⟨y, hy, rfl⟩ := List.mem_map.mp hp
    refine mkOrF_checkableA hr fun q hq => ?_
    obtain ⟨x, hx, rfl⟩ := List.mem_map.mp hq
    exact hr _ _ (hqa x hx) (hpb y hy)

theorem nodeTie_checkableA {r : ℕ} {a b : Val} (ha : a.CheckableA) (hb : b.CheckableA) :
    (nodeTie rec r a b).CheckableA := by
  have hqa : ∀ p, p ∈ armsOffRank r a → p.2.CheckableA := fun p hp =>
    armsOf_checkableA ha p (List.mem_filter.mp hp).1
  have hqb : ∀ p, p ∈ armsOffRank r b → p.2.CheckableA := fun p hp =>
    armsOf_checkableA hb p (List.mem_filter.mp hp).1
  have hrest : (rec (.or (armsOffRank r a)) (.or (armsOffRank r b))).CheckableA :=
    hr _ _ (.or fun r' a' h => hqa (r', a') h) (.or fun r' a' h => hqb (r', a') h)
  unfold nodeTie
  split
  · refine mkOrF_checkableA hr fun p hp => ?_
    simp only [List.mem_cons, List.not_mem_nil, or_false] at hp
    rcases hp with rfl | rfl
    · exact mkOrF_checkableA hr (tieArms_checkableA hr ha hb)
    · exact hrest
  · refine mkOrF_checkableA hr fun p hp => ?_
    rcases List.mem_append.mp hp with hp | hp
    · exact tieArms_checkableA hr ha hb p hp
    · rw [List.mem_singleton.mp hp]; exact hrest

theorem meetNodesN_checkableA {a b : Val} (ha : a.CheckableA) (hb : b.CheckableA) :
    (meetNodesN rec a b).CheckableA := by
  unfold meetNodesN
  split
  · split
    · exact nodeLeft_checkableA hr ha hb
    · split
      · exact nodeRight_checkableA hr ha hb
      · exact nodeTie_checkableA hr ha hb
  · exact nodeLeft_checkableA hr ha hb
  · exact nodeRight_checkableA hr ha hb
  · split
    · exact nodeLeft_checkableA hr ha hb
    · exact hr _ _ ha hb

theorem meetNodes_checkableA {a b : Val} (ha : a.CheckableA) (hb : b.CheckableA) :
    (meetNodes rec a b).CheckableA :=
  meetNodesN_checkableA hr (nodeNorm_checkableA hr ha) (nodeNorm_checkableA hr hb)

theorem meetRight_checkableA {a b₁ b₂ : Val} (ha : a.CheckableA) (hb : (Val.meet b₁ b₂).CheckableA) :
    (meetRight rec a b₁ b₂).CheckableA := by
  cases hb with
  | meet h₁ h₂ =>
    simp only [meetRight]
    split
    · split
      · exact .meet ha (.meet h₁ h₂)
      · exact hr _ _ h₁ (hr _ _ ha h₂)
    · exact hr _ _ (hr _ _ ha h₁) h₂

theorem meetMap_of_checkableA {fs₁ fs₂ : List (String × Bool × Val)} {s₁ s₂ : Option Val} {c₁ c₂ : Bool}
    (ha : (Val.map fs₁ s₁ c₁).CheckableA) (hb : (Val.map fs₂ s₂ c₂).CheckableA) :
    (meetMap rec fs₁ s₁ c₁ fs₂ s₂ c₂).CheckableA := by
  cases ha with
  | map hf₁ hs₁ =>
    cases hb with
    | map hf₂ hs₂ => exact meetMap_checkableA hr hf₁ hs₁ hf₂ hs₂

theorem meetList_of_checkableA {is₁ is₂ : List Val} {s₁ s₂ : Option Val} {c₁ c₂ : Bool}
    (ha : (Val.list is₁ s₁ c₁).CheckableA) (hb : (Val.list is₂ s₂ c₂).CheckableA) :
    (meetList rec is₁ s₁ c₁ is₂ s₂ c₂).CheckableA := by
  cases ha with
  | list hi₁ hs₁ =>
    cases hb with
    | list hi₂ hs₂ => exact meetList_checkableA hr hi₁ hs₁ hi₂ hs₂

set_option maxHeartbeats 2000000 in
/-- A step of the meet keeps a term the checker can read. -/
theorem meetStep_checkableA {lm : Scalar → Val → Val} (hl : ∀ s b, b.CheckableA → (lm s b).CheckableA)
    {a b : Val} (ha : a.CheckableA) (hb : b.CheckableA) : (meetStep lm rec a b).CheckableA := by
  have hany : (Val.map [] none false).CheckableA :=
    .map (fun _ _ _ h => absurd h (List.not_mem_nil)) (fun _ h => nomatch h)
  have hanyL : (Val.list [] none false).CheckableA :=
    .list (fun _ h => absurd h (List.not_mem_nil)) (fun _ h => nomatch h)
  cases a <;> cases b <;> (unfold meetStep; dsimp only) <;> first
    | exact .nil
    | exact absentOr_checkableA (hr _ _ .any hb)
    | exact absentOr_checkableA (hr _ _ ha .any)
    | exact nothingOr_checkableA _
    | exact meetBase_checkableA hl ha hb
    | exact (match ha with | .meet h₁ h₂ => hr _ _ h₁ (hr _ _ h₂ hb))
    | exact meetRight_checkableA hr ha hb
    | exact (match ha with | .ride h => .ride (hr _ _ h hb))
    | exact (match hb with | .ride h => .ride (hr _ _ ha h))
    | exact (match ha with | .link h ht => .link (hr _ _ h hb) ht)
    | exact (match hb with | .link h ht => .link (hr _ _ ha h) ht)
    | exact meetNodes_checkableA hr ha hb
    | exact meetMap_of_checkableA hr ha hb
    | exact meetMap_of_checkableA hr hany hb
    | exact meetMap_of_checkableA hr ha hany
    | exact meetList_of_checkableA hr ha hb
    | exact meetList_of_checkableA hr hanyL hb
    | exact meetList_of_checkableA hr ha hanyL

end

theorem meetStepA_checkableA {ds : Decls} (hb : ∀ d, d ∈ ds → d.2.CheckableA) {rec : Val → Val → Val}
    (hr : ∀ a b, a.CheckableA → b.CheckableA → (rec a b).CheckableA) {a b : Val}
    (ha : a.CheckableA) (hb' : b.CheckableA) : (meetStepA ds rec a b).CheckableA := by
  unfold meetStepA
  split
  · split
    · split
      · exact hr _ _ (expand_checkableA hb (Decls.env_checkableA hb (by assumption))) hb'
      · exact meetStep_checkableA hr litMeetD_checkableA ha hb'
    · exact meetStep_checkableA hr litMeetD_checkableA ha hb'
  · split
    · split
      · exact hr _ _ ha (expand_checkableA hb (Decls.env_checkableA hb (by assumption)))
      · exact meetStep_checkableA hr litMeetD_checkableA ha hb'
    · exact meetStep_checkableA hr litMeetD_checkableA ha hb'
  · exact meetStep_checkableA hr litMeetD_checkableA ha hb'

theorem meetA_checkableA {ds : Decls} (hb : ∀ d, d ∈ ds → d.2.CheckableA) :
    ∀ (n : ℕ) {a b : Val}, a.CheckableA → b.CheckableA → (meetA ds n a b).CheckableA
  | 0, _, _, ha, hb' => .meet ha hb'
  | n + 1, _, _, ha, hb' => meetStepA_checkableA hb (fun _ _ => meetA_checkableA hb n) ha hb'

/-- The meet of two terms the checker can read is one it can read. -/
theorem meetD_checkableA {ds : Decls} (hb : ∀ d, d ∈ ds → d.2.CheckableA) {a b : Val}
    (ha : a.CheckableA) (hb' : b.CheckableA) : (meetD ds a b).CheckableA :=
  meetA_checkableA hb _ ha hb'

/-- The normal form of a term the checker can read is one it can read. -/
theorem normaliseD_checkableA {ds : Decls} (hb : ∀ d, d ∈ ds → d.2.CheckableA) {v : Val}
    (hv : v.CheckableA) : (normaliseD ds v).CheckableA :=
  meetD_checkableA hb .any hv

end Aontu
