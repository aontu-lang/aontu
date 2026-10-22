import Aontu.Verdict

/-!
# Paths

A path, `$.a.b`, names a position in the document and reads as what the
document holds there: the term at the position in the normal form of
the schema met with the data. The reading is by declaration: each path
a document writes becomes a name, declared as that term, so that the
expansion, the residuals, the checker and the alias-cycle rule of
`Aontu/Alias.lean` carry paths as they carry names, and a document that
reads only by its own paths is an `error` as a cycle of names is. A path
resolves within the schema's own tree, through maps by key and lists by
index and through nothing else, not a disjunction and not a reference
left as a residual; a path that does not is an `error`.
-/

namespace Aontu

/-! ## Positions -/

/-- The term at a path in a term: through maps by key and lists by
index, the riders around either read through, and through nothing
else. -/
def Val.at : Val → List Seg → Option Val
  | v, [] => some v
  | v, .key k :: p =>
    match v.unride with
    | .map fs _ _ =>
      match fs.find? (fun f => f.1 == k) with
      | some f => f.2.2.at p
      | none => none
    | _ => none
  | v, .idx i :: p =>
    match v.unride with
    | .list items _ _ =>
      match items[i]? with
      | some w => w.at p
      | none => none
    | _ => none
termination_by structural _ p => p

/-! ## Paths as names -/

/-- The name a path is declared under: each key behind its length, so
that no two paths share a name, and no document can write it as an
alias, since an alias begins with a letter. -/
def pathName (p : List Seg) : String :=
  "$" ++ String.join (p.map fun
    | .key k => "." ++ toString k.length ++ ":" ++ k
    | .idx i => "#" ++ toString i)

mutual
/-- The term with each path replaced by a reference to the path's name. -/
def Val.pathsToAliases : Val → Val
  | .path p => .alias (pathName p)
  | .len c => .len c.pathsToAliases
  | .map fs spread closed => .map (ptaFields fs) (ptaSpread spread) closed
  | .list items spread closed => .list (ptaItems items) (ptaSpread spread) closed
  | .or arms => .or (ptaArms arms)
  | .pref r x => .pref r x.pathsToAliases
  | .meet a b => .meet a.pathsToAliases b.pathsToAliases
  | .nof n cs => .nof n.pathsToAliases (ptaItems cs)
  | .must c m => .must c.pathsToAliases m
  | .when c t e => .when c.pathsToAliases t.pathsToAliases (ptaSpread e)
  | .contains c n => .contains c.pathsToAliases n.pathsToAliases
  | .rest t cs => .rest t.pathsToAliases (ptaCovers cs)
  | .select s arms d => .select s.pathsToAliases (ptaPairs arms) (ptaSpread d)
  | .filter s c => .filter s.pathsToAliases c.pathsToAliases
  | .call f args => .call f (ptaItems args)
  | .ride k v r => .ride k v.pathsToAliases r
  | v => v

def ptaPairs : List (Val × Val) → List (Val × Val)
  | [] => []
  | (p, r) :: ps => (p.pathsToAliases, r.pathsToAliases) :: ptaPairs ps

def ptaCovers : List Cover → List Cover
  | [] => []
  | (c, k, m) :: cs => (ptaSpread c, ptaSpread k, ptaSpread m) :: ptaCovers cs

def ptaFields : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.pathsToAliases) :: ptaFields fs

def ptaItems : List Val → List Val
  | [] => []
  | v :: vs => v.pathsToAliases :: ptaItems vs

def ptaSpread : Option Val → Option Val
  | none => none
  | some s => some s.pathsToAliases

def ptaArms : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: as => (r, a.pathsToAliases) :: ptaArms as
end

/-- The declarations a document's paths make: each path's name, declared
as the term at the path in the root, with that term's own paths read as
names too. A path to nothing declares nothing. -/
def Decls.ofPaths (root : Val) (ps : List (List Seg)) : Decls :=
  ps.filterMap fun p => (root.at p).map fun w => (pathName p, w.pathsToAliases)

/-- The paths a document writes: in the schema as read and in every body. -/
def Decls.docPaths (ds : Decls) (S : Val) : List (List Seg) :=
  ((ds.read S).paths ++ ds.paths).eraseDups

/-- Whether every path of the document resolves in the schema's own
tree: the normal form of the schema as read, before any data. -/
def Decls.resolvesB (ds : Decls) (S : Val) : Bool :=
  (ds.docPaths S).all fun p => ((normaliseD ds (ds.read S)).at p).isSome

/-- Every path of the document resolves in the schema's own tree. -/
def Decls.Resolves (ds : Decls) (S : Val) : Prop :=
  ∀ p, p ∈ ds.docPaths S → ((normaliseD ds (ds.read S)).at p).isSome = true

theorem Decls.resolvesB_iff {ds : Decls} {S : Val} : ds.resolvesB S = true ↔ ds.Resolves S := by
  simp only [Decls.resolvesB, Decls.Resolves, List.all_eq_true]

/-- The document with its paths read as names from a root: each path is
declared as the term at it, and the bodies and the schema refer to the
names. -/
def Decls.withPathsFrom (ds : Decls) (S : Val) (root : Val) : Decls × Val :=
  (ds.map (fun d => (d.1, d.2.pathsToAliases)) ++ Decls.ofPaths root (ds.docPaths S), S.pathsToAliases)

/-- The document with its paths read as names from the schema alone:
the root is the normal form of the schema as read, before any data,
which is what the error class is judged on. The root keeps its keys as
written, so that a key a path reaches reads where the path lands. -/
def Decls.withPathsS (ds : Decls) (S : Val) : Decls × Val :=
  ds.withPathsFrom S (normaliseD ds (ds.readU S))

/-- The document with its paths read as names from the data too: the
root is the normal form of the schema met with the data, which is what
the other classes are judged on. -/
def Decls.withPaths (ds : Decls) (S : Val) (j : Data) : Decls × Val :=
  ds.withPathsFrom S (normaliseD ds (meetD ds (ds.readU S) j.term))

/-! ## The verdict with paths -/

/-- The verdict of a document with paths. It is an `error` where a path
does not resolve in the schema's own tree, or where the document is an
error with its paths read from the schema alone: a name declared
nowhere, a cycle, a `nil` in the schema. Otherwise the paths read from
the data too, and the document is `invalid` where that reading is dead
or an error, since the data made it so, and `valid` or `incomplete` as
that reading is. -/
def VetP (m : Mode) (ds : Decls) (S : Val) (j : Data) : Verdict → Prop
  | .error => ¬ ds.Resolves S ∨ Vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j .error
  | .invalid =>
    ds.Resolves S ∧ ¬ Vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j .error ∧
      (Vet m (ds.withPaths S j).1 (ds.withPaths S j).2 j .invalid ∨
        Vet m (ds.withPaths S j).1 (ds.withPaths S j).2 j .error)
  | v =>
    ds.Resolves S ∧ ¬ Vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j .error ∧
      Vet m (ds.withPaths S j).1 (ds.withPaths S j).2 j v

/-- The verdict with paths, computed. -/
def vetP (m : Mode) (ds : Decls) (S : Val) (j : Data) : Verdict :=
  if ds.resolvesB S then
    if vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j = .error then .error
    else
      match vet m (ds.withPaths S j).1 (ds.withPaths S j).2 j with
      | .error => .invalid
      | v => v
  else .error

/-! ## Paths read as names keep a term checkable -/

theorem mem_ptaFields {fs : List (String × Bool × Val)} {k : String} {o : Bool} {w : Val} :
    (k, o, w) ∈ ptaFields fs ↔ ∃ v, (k, o, v) ∈ fs ∧ w = v.pathsToAliases := by
  induction fs with
  | nil => simp [ptaFields]
  | cons f fs ih =>
    obtain ⟨k', o', v'⟩ := f
    simp only [ptaFields, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl, rfl⟩ | ⟨v, hm, rfl⟩)
      · exact ⟨v', Or.inl ⟨rfl, rfl, rfl⟩, rfl⟩
      · exact ⟨v, Or.inr hm, rfl⟩
    · rintro ⟨v, ⟨rfl, rfl, rfl⟩ | hm, rfl⟩
      · exact Or.inl ⟨rfl, rfl, rfl⟩
      · exact Or.inr ⟨v, hm, rfl⟩

theorem mem_ptaPairs {ps : List (Val × Val)} {p r : Val} :
    (p, r) ∈ ptaPairs ps ↔ ∃ p₀ r₀, (p₀, r₀) ∈ ps ∧ p = p₀.pathsToAliases ∧ r = r₀.pathsToAliases := by
  induction ps with
  | nil => simp [ptaPairs]
  | cons q ps ih =>
    obtain ⟨p', r'⟩ := q
    simp only [ptaPairs, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl⟩ | ⟨p₀, r₀, hm, rfl, rfl⟩)
      · exact ⟨p', r', Or.inl ⟨rfl, rfl⟩, rfl, rfl⟩
      · exact ⟨p₀, r₀, Or.inr hm, rfl, rfl⟩
    · rintro ⟨p₀, r₀, ⟨rfl, rfl⟩ | hm, rfl, rfl⟩
      · exact Or.inl ⟨rfl, rfl⟩
      · exact Or.inr ⟨p₀, r₀, hm, rfl, rfl⟩

theorem mem_ptaItems {items : List Val} {w : Val} :
    w ∈ ptaItems items ↔ ∃ v, v ∈ items ∧ w = v.pathsToAliases := by
  induction items with
  | nil => simp [ptaItems]
  | cons v vs ih =>
    simp only [ptaItems, List.mem_cons, ih]
    constructor
    · rintro (rfl | ⟨u, hu, rfl⟩)
      · exact ⟨v, .inl rfl, rfl⟩
      · exact ⟨u, .inr hu, rfl⟩
    · rintro ⟨u, rfl | hu, rfl⟩
      · exact .inl rfl
      · exact .inr ⟨u, hu, rfl⟩

theorem ptaSpread_eq {spread : Option Val} {t : Val} :
    ptaSpread spread = some t ↔ ∃ s, spread = some s ∧ t = s.pathsToAliases := by
  cases spread with
  | none => simp [ptaSpread]
  | some s =>
    simp only [ptaSpread, Option.some.injEq]
    exact ⟨fun h => ⟨s, rfl, h.symm⟩, fun ⟨s', hs, ht⟩ => by cases hs; exact ht.symm⟩

theorem mem_ptaCovers {cs : List Cover} {c' : Cover} :
    c' ∈ ptaCovers cs ↔ ∃ c, c ∈ cs ∧ c' = (ptaSpread c.1, ptaSpread c.2.1, ptaSpread c.2.2) := by
  induction cs with
  | nil => simp [ptaCovers]
  | cons c cs ih =>
    obtain ⟨a, k, m⟩ := c
    simp only [ptaCovers, List.mem_cons, ih]
    constructor
    · rintro (rfl | ⟨d, hd, rfl⟩)
      · exact ⟨(a, k, m), .inl rfl, rfl⟩
      · exact ⟨d, .inr hd, rfl⟩
    · rintro ⟨d, rfl | hd, rfl⟩
      · exact .inl rfl
      · exact .inr ⟨d, hd, rfl⟩

theorem mem_ptaArms {arms : List (ℕ × Val)} {r : ℕ} {b : Val} :
    (r, b) ∈ ptaArms arms ↔ ∃ a, (r, a) ∈ arms ∧ b = a.pathsToAliases := by
  induction arms with
  | nil => simp [ptaArms]
  | cons q qs ih =>
    obtain ⟨r', a'⟩ := q
    simp only [ptaArms, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl⟩ | ⟨a, hm, rfl⟩)
      · exact ⟨a', Or.inl ⟨rfl, rfl⟩, rfl⟩
      · exact ⟨a, Or.inr hm, rfl⟩
    · rintro ⟨a, ⟨rfl, rfl⟩ | hm, rfl⟩
      · exact Or.inl ⟨rfl, rfl⟩
      · exact Or.inr ⟨a, hm, rfl⟩

/-- A term the checker can read, its paths read as names, is one it can read. -/
theorem pathsToAliases_checkableA {v : Val} (h : v.CheckableA) : v.pathsToAliases.CheckableA := by
  induction h with
  | len _ ih => exact .len ih
  | @map fs spread closed _ _ ihf ihs =>
    refine .map ?_ ?_
    · intro k o w hm
      obtain ⟨v, hv, rfl⟩ := mem_ptaFields.mp hm
      exact ihf k o v hv
    · intro t ht
      obtain ⟨s, hs, rfl⟩ := ptaSpread_eq.mp ht
      exact ihs s hs
  | @list items spread closed _ _ ihi ihs =>
    refine .list ?_ ?_
    · intro w hm
      obtain ⟨v, hv, rfl⟩ := mem_ptaItems.mp hm
      exact ihi v hv
    · intro t ht
      obtain ⟨s, hs, rfl⟩ := ptaSpread_eq.mp ht
      exact ihs s hs
  | @or arms _ ih =>
    refine .or fun r b hm => ?_
    obtain ⟨a, ha, rfl⟩ := mem_ptaArms.mp hm
    exact ih r a ha
  | pref _ ih => exact .pref ih
  | ride _ ih => exact .ride ih
  | meet _ _ iha ihb => exact .meet iha ihb
  | path => exact .alias
  | @nof n cs _ _ ihn ihcs =>
    refine .nof ihn fun w hm => ?_
    obtain ⟨c, hc, rfl⟩ := mem_ptaItems.mp hm
    exact ihcs c hc
  | @call f args _ ih =>
    refine .call fun w hm => ?_
    obtain ⟨a, ha, rfl⟩ := mem_ptaItems.mp hm
    exact ih a ha
  | must _ ih => exact .must ih
  | @when c t e _ _ _ ihc iht ihe =>
    refine .when ihc iht fun e' he => ?_
    obtain ⟨s, hs, rfl⟩ := ptaSpread_eq.mp he
    exact ihe s hs
  | contains _ _ ihc ihn => exact .contains ihc ihn
  | @rest t cs _ _ _ _ iht ih1 ih2 ih3 =>
    refine .rest iht ?_ ?_ ?_
    · intro c' hc' v hv
      obtain ⟨c, hc, rfl⟩ := mem_ptaCovers.mp hc'
      obtain ⟨s, hs, rfl⟩ := ptaSpread_eq.mp hv
      exact ih1 c hc s hs
    · intro c' hc' v hv
      obtain ⟨c, hc, rfl⟩ := mem_ptaCovers.mp hc'
      obtain ⟨s, hs, rfl⟩ := ptaSpread_eq.mp hv
      exact ih2 c hc s hs
    · intro c' hc' v hv
      obtain ⟨c, hc, rfl⟩ := mem_ptaCovers.mp hc'
      obtain ⟨s, hs, rfl⟩ := ptaSpread_eq.mp hv
      exact ih3 c hc s hs
  | @selectKey arms d _ _ _ ihp ihr ihd =>
    refine .selectKey (fun p r hm => ?_) (fun p r hm => ?_) (fun e he => ?_)
    · obtain ⟨p₀, r₀, hm₀, rfl, -⟩ := mem_ptaPairs.mp hm
      exact ihp p₀ r₀ hm₀
    · obtain ⟨p₀, r₀, hm₀, -, rfl⟩ := mem_ptaPairs.mp hm
      exact ihr p₀ r₀ hm₀
    · obtain ⟨e₀, he₀, rfl⟩ := ptaSpread_eq.mp he
      exact ihd e₀ he₀
  | @selectLit sc arms d _ _ _ ihp ihr ihd =>
    refine .selectLit (fun p r hm => ?_) (fun p r hm => ?_) (fun e he => ?_)
    · obtain ⟨p₀, r₀, hm₀, rfl, -⟩ := mem_ptaPairs.mp hm
      exact ihp p₀ r₀ hm₀
    · obtain ⟨p₀, r₀, hm₀, -, rfl⟩ := mem_ptaPairs.mp hm
      exact ihr p₀ r₀ hm₀
    · obtain ⟨e₀, he₀, rfl⟩ := ptaSpread_eq.mp he
      exact ihd e₀ he₀
  | _ => simp only [Val.pathsToAliases]; constructor

/-- The term at a path in a term the checker can read is one it can read. -/
theorem at_checkableA : ∀ (p : List Seg) {v w : Val}, v.CheckableA → v.at p = some w → w.CheckableA
  | [], _, _, hv, h => by
    simp only [Val.at, Option.some.injEq] at h
    exact h ▸ hv
  | .key k :: p, v, w, hv, h => by
    have hu := Val.checkableA_unride hv
    simp only [Val.at] at h
    split at h
    · rename_i fs _ _ hm
      rw [hm] at hu
      cases hu with
      | map hf _ =>
        split at h
        · rename_i f hfind
          exact at_checkableA p (hf f.1 f.2.1 f.2.2 (List.mem_of_find?_eq_some hfind)) h
        · exact absurd h (by simp)
    · exact absurd h (by simp)
  | .idx i :: p, v, w, hv, h => by
    have hu := Val.checkableA_unride hv
    simp only [Val.at] at h
    split at h
    · rename_i items _ _ hm
      rw [hm] at hu
      cases hu with
      | list hi _ =>
        split at h
        · rename_i x hx
          exact at_checkableA p (hi x (List.mem_of_getElem? hx)) h
        · exact absurd h (by simp)
    · exact absurd h (by simp)

theorem Decls.ofPaths_checkableA {root : Val} (hr : root.CheckableA) (ps : List (List Seg)) :
    ∀ d, d ∈ Decls.ofPaths root ps → d.2.CheckableA := by
  intro d hd
  simp only [Decls.ofPaths, List.mem_filterMap] at hd
  obtain ⟨p, -, hp⟩ := hd
  cases hw : root.at p with
  | none => rw [hw] at hp; exact absurd hp (by simp)
  | some w =>
    rw [hw] at hp
    simp only [Option.map_some, Option.some.injEq] at hp
    rw [← hp]
    exact pathsToAliases_checkableA (at_checkableA p hr hw)

theorem Decls.withPathsFrom_bodies_checkableA {ds : Decls} {S : Val} {root : Val}
    (hb : ∀ d, d ∈ ds → d.2.CheckableA) (hr : root.CheckableA) :
    ∀ d, d ∈ (ds.withPathsFrom S root).1 → d.2.CheckableA := by
  intro d hd
  simp only [Decls.withPathsFrom, List.mem_append, List.mem_map] at hd
  rcases hd with ⟨d', hd', rfl⟩ | hd
  · exact pathsToAliases_checkableA (hb d' hd')
  · exact Decls.ofPaths_checkableA hr _ d hd

/-- `vetP` computes `VetP` on every document whose bodies and schema
read no pattern and no format. -/
theorem vetP_iff {m : Mode} {ds : Decls} {S : Val} {j : Data} (hb : ∀ d, d ∈ ds → d.2.CheckableA)
    (hS : S.CheckableA) (v : Verdict) : vetP m ds S j = v ↔ VetP m ds S j v := by
  have hbS := Decls.withPathsFrom_bodies_checkableA (S := S) hb (normaliseD_checkableA hb (readU_checkableA hb hS))
  have hvS := vet_iff (m := m) (ds := (ds.withPathsS S).1) (S := (ds.withPathsS S).2) (j := j) hbS
    (readR_checkableA hbS (pathsToAliases_checkableA hS))
  have hbP := Decls.withPathsFrom_bodies_checkableA (S := S) hb
    (normaliseD_checkableA hb (meetD_checkableA hb (readU_checkableA hb hS) (Data.term_checkableA j)))
  have hvP := vet_iff (m := m) (ds := (ds.withPaths S j).1) (S := (ds.withPaths S j).2) (j := j) hbP
    (readR_checkableA hbP (pathsToAliases_checkableA hS))
  unfold vetP
  by_cases hr : ds.resolvesB S = true
  · rw [if_pos hr]
    have hR := Decls.resolvesB_iff.mp hr
    by_cases he : vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j = .error
    · rw [if_pos he]
      have hE := (hvS .error).mp he
      cases v <;> simp only [VetP, hR, hE, not_true_eq_false, false_and, and_false, or_true,
        reduceCtorEq]
    · rw [if_neg he]
      have hE : ¬ Vet m (ds.withPathsS S).1 (ds.withPathsS S).2 j .error := fun h => he ((hvS .error).mpr h)
      cases hp : vet m (ds.withPaths S j).1 (ds.withPaths S j).2 j <;> cases v <;>
        simp only [VetP, hR, hE, ← hvP, hp, not_true_eq_false, not_false_eq_true,
          or_true, or_false, and_false, and_true, reduceCtorEq]
  · rw [if_neg hr]
    have hR : ¬ ds.Resolves S := fun h => hr (Decls.resolvesB_iff.mpr h)
    cases v <;> simp only [VetP, hR, not_false_eq_true, true_or, false_and, reduceCtorEq]

end Aontu
