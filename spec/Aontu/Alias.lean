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
seal stops at a disjunction, a preference, a kind and a name. The seal
follows a selection: the restriction of one is a selection on the same
scrutinee and patterns, of the restrictions of its results. -/

/-- The terms a meet joins, through the riders, as the seal reads them. -/
def Val.sealConjuncts : Val → List Val
  | .meet a b => a.sealConjuncts ++ b.sealConjuncts
  | .ride _ v _ => v.sealConjuncts
  | v => [v]

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

/-- What the seal adds to some conjuncts, within `f` levels: for a
selection among them, the selection of the restrictions of its results,
each met with the other conjuncts. -/
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
      if cs.any isMapLit then
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
  | case2 k v r ih =>
    cases h with
    | ride hv =>
      intro c hc
      simp only [Val.sealConjuncts] at hc
      exact ih hv c hc
  | case3 v h1 h2 =>
    intro c hc
    rw [Val.sealConjuncts.eq_3 v h1 h2, List.mem_singleton] at hc
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
  | case2 k v r ih =>
    simp only [Val.sealConjuncts] at hc
    simp only [Val.unguardedRefs]
    exact ih hc
  | case3 v h1 h2 =>
    rw [Val.sealConjuncts.eq_3 v h1 h2, List.mem_singleton] at hc
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
recursive name, or to no name, stays. -/
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
    | .ride t v r => .ride t (expandF ds k v) r
    | v => v

/-- The expansion of a term: enough turns for every chain of names that
are not recursive, which repeats no name, and for the structure each
body adds. -/
def expand (ds : Decls) (v : Val) : Val :=
  expandF ds ((ds.length + 1) * (ds.bodiesSize + v.size + 1)) v

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
      simp only [expandF, Val.unguardedRefs] at h ⊢
      exact unguardedRefs_expandF f v h
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
      rcases unguardedRefs_expandF _ b hk'' with h' | ⟨m, hm, hmn⟩
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
    | ride hv => exact .ride (expandF_checkableA hb f _ hv)
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

theorem expand_checkableA {ds : Decls} (hb : ∀ d, d ∈ ds → d.2.CheckableA) {v : Val}
    (hv : v.CheckableA) : (expand ds v).CheckableA :=
  expandF_checkableA hb _ v hv

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
  | _ => true

/-- Whether every body reads no path, no pattern and no format. -/
def Decls.bodiesCheckableB (ds : Decls) : Bool := ds.all fun d => d.2.checkableAB

theorem Decls.bodiesCheckableB_iff {ds : Decls} :
    ds.bodiesCheckableB = true ↔ ∀ d, d ∈ ds → d.2.CheckableA := by
  simp only [Decls.bodiesCheckableB, List.all_eq_true, Val.checkableAB_iff]

/-- A literal met with a term under the declarations: the literal where
the term admits its value and `nil` where it refuses it, decided by the
checker that reads the names wherever the names keep the alias-cycle
rule and the bodies and the term read no pattern and no format; and the
pair where that cannot be computed, where the term writes a path,
which is read by declaration later and until then is left as written,
or where the term is a call the reading has not made. -/
def litMeetD (ds : Decls) (s : Scalar) (b : Val) : Val :=
  if ds.guardedB && ds.bodiesCheckableB && b.checkableAB && b.paths.isEmpty && !b.callAt then
    (if checkR ds b s.data then .lit s else .nil)
  else .meet (.lit s) b

theorem admits_litMeetD {ds : Decls} {root : Data} (s : Scalar) (b : Val) (j : Data) :
    Admits ds.envE root (litMeetD ds s b) j ↔
      Admits ds.envE root (.lit s) j ∧ Admits ds.envE root b j := by
  unfold litMeetD
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
    | exact .number | exact .string | exact .anyString | exact .boolean

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

theorem atomMeet_checkableA {a b : Val} (ha : a.CheckableA) (hb : b.CheckableA) :
    (atomMeet a b).CheckableA := by
  unfold atomMeet
  split
  · exact Kind.meet_checkableA _ _
  · exact aliasMeet_checkableA ha hb

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

theorem flattenArm_checkableA {p : ℕ × Val} (hp : p.2.CheckableA) :
    ∀ q, q ∈ flattenArm p → q.2.CheckableA := by
  intro q hq
  unfold flattenArm at hq
  split at hq
  · cases hp with
    | or h => exact h q.1 q.2 hq
  · rw [List.mem_singleton] at hq
    exact hq ▸ hp

theorem mkOr_checkableA {arms : List (ℕ × Val)} (h : ∀ p, p ∈ arms → p.2.CheckableA) :
    (mkOr arms).CheckableA := by
  simp only [mkOr]
  split
  · exact .nil
  · refine .or fun r a hm => ?_
    obtain ⟨p, hp, hq⟩ := List.mem_flatMap.mp (List.mem_filter.mp hm).1
    exact flattenArm_checkableA (h p hp) (r, a) hq

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
  | number | string | anyString | boolean | mapKind | listKind | any => exact .any
  | nil => exact .nil
  | path => exact .path
  | nof _ _ _ _ | must _ _ | when _ _ _ _ _ _ | contains _ _ _ _ | rest _ _ _ _ _ _ _ _
  | selectKey _ _ _ _ _ _ | selectLit _ _ _ _ _ _ | call _ _ => exact .any
  | key => exact .anyString
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
  | ride _ ih => exact ih
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
      refine hm _ _ hf (Val.CheckableA.selectNow ?_)
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
    exact hm _ _ (hfs _ _ _ hu) ((hsp t rfl).atKey _).selectNow

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
  | some t => exact hm _ _ he ((hsp t rfl).atKey _).selectNow

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

section
variable {rec : Val → Val → Val} (hr : ∀ a b, a.CheckableA → b.CheckableA → (rec a b).CheckableA)
include hr

theorem mkOr_or_left {arms : List (ℕ × Val)} {b : Val} (ha : (Val.or arms).CheckableA) (hb : b.CheckableA) :
    (mkOr (arms.map fun p => (p.1, rec p.2 b))).CheckableA := by
  cases ha with
  | or h =>
    refine mkOr_checkableA fun p hp => ?_
    obtain ⟨q, hq, rfl⟩ := List.mem_map.mp hp
    exact hr _ _ (h q.1 q.2 hq) hb

theorem mkOr_or_right {a : Val} {arms : List (ℕ × Val)} (ha : a.CheckableA) (hb : (Val.or arms).CheckableA) :
    (mkOr (arms.map fun p => (p.1, rec a p.2))).CheckableA := by
  cases hb with
  | or h =>
    refine mkOr_checkableA fun p hp => ?_
    obtain ⟨q, hq, rfl⟩ := List.mem_map.mp hp
    exact hr _ _ ha (h q.1 q.2 hq)

theorem mkOr_pref_left {r : ℕ} {x b : Val} (hx : (Val.pref r x).CheckableA) (hb : b.CheckableA) :
    (mkOr [(r, rec x b), (0, rec x.super b)]).CheckableA := by
  cases hx with
  | pref hx =>
    refine mkOr_checkableA fun p hp => ?_
    simp only [List.mem_cons, List.mem_nil_iff, or_false] at hp
    rcases hp with rfl | rfl
    · exact hr _ _ hx hb
    · exact hr _ _ hx.super hb

theorem mkOr_pref_right {a : Val} {r : ℕ} {y : Val} (ha : a.CheckableA) (hy : (Val.pref r y).CheckableA) :
    (mkOr [(r, rec a y), (0, rec a y.super)]).CheckableA := by
  cases hy with
  | pref hy =>
    refine mkOr_checkableA fun p hp => ?_
    simp only [List.mem_cons, List.mem_nil_iff, or_false] at hp
    rcases hp with rfl | rfl
    · exact hr _ _ ha hy
    · exact hr _ _ ha hy.super

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
    | exact meetBase_checkableA hl ha hb
    | exact (match ha with | .meet h₁ h₂ => hr _ _ h₁ (hr _ _ h₂ hb))
    | exact meetRight_checkableA hr ha hb
    | exact (match ha with | .ride h => .ride (hr _ _ h hb))
    | exact (match hb with | .ride h => .ride (hr _ _ ha h))
    | exact mkOr_or_left hr ha hb
    | exact mkOr_or_right hr ha hb
    | exact mkOr_pref_left hr ha hb
    | exact mkOr_pref_right hr ha hb
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
