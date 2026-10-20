import Aontu.Meet

/-!
# What evaluation singles out

`Gen env root v j`: the term `v` generates the value `j`, which is what
evaluation outputs for `v` where it outputs anything. A literal
generates its value. A map generates a map with a member for each
declared key whose value generates one the spread admits, and nothing
at all where a required key's does not; a list generates each position.
A disjunction generates what the arms the rank rule picks all generate:
of the live arms, those of the lowest positive rank, or every arm where
none has one. A preference generates what its value does. A meet left
as written generates what its left side generates and its right admits,
or, where the left generates nothing, the other way about. A kind, a
bound, `any`, `nil`, an alias and a path generate nothing. `Output env
root v j` reads `Gen` off the normal form `normalise v`, where every
meet is computed and every dead arm dropped, which is the shape the
engines evaluate. `output_admits` says what evaluation singles out is
an instance; `output_unique` that it is one value; and `gen` computes
it, admitted by `gen_iff`.
-/

namespace Aontu

/-! ## Values, told apart -/

mutual
/-- Whether two values are one Lean `Data`: the same scalar, the same
members in the same order, the same elements. -/
def Data.eqb : Data → Data → Bool
  | .num x, .num y => decide (x = y)
  | .str s, .str t => decide (s = t)
  | .bool b, .bool c => decide (b = c)
  | .null, .null => true
  | .map fs, .map gs => Data.eqbMembers fs gs
  | .list xs, .list ys => Data.eqbList xs ys
  | _, _ => false

def Data.eqbMembers : List (String × Data) → List (String × Data) → Bool
  | [], [] => true
  | (k, x) :: fs, (k', y) :: gs => decide (k = k') && x.eqb y && Data.eqbMembers fs gs
  | _, _ => false

def Data.eqbList : List Data → List Data → Bool
  | [], [] => true
  | x :: xs, y :: ys => x.eqb y && Data.eqbList xs ys
  | _, _ => false
end

mutual
theorem Data.eqb_iff : ∀ x y : Data, x.eqb y = true ↔ x = y
  | .num x, y => by
    cases y with
    | num y => simp [Data.eqb]
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .str s, y => by
    cases y with
    | str t => simp [Data.eqb]
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .bool b, y => by
    cases y with
    | bool c => simp [Data.eqb]
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .null, y => by
    cases y with
    | null => simp [Data.eqb]
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .map fs, y => by
    cases y with
    | map gs =>
      simp only [Data.eqb, Data.map.injEq]
      exact Data.eqbMembers_iff fs gs
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .list xs, y => by
    cases y with
    | list ys =>
      simp only [Data.eqb, Data.list.injEq]
      exact Data.eqbList_iff xs ys
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩

theorem Data.eqbMembers_iff : ∀ fs gs : List (String × Data),
    Data.eqbMembers fs gs = true ↔ fs = gs
  | [], [] => by simp [Data.eqbMembers]
  | [], _ :: _ => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | _ :: _, [] => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | (k, x) :: fs, (k', y) :: gs => by
    simp only [Data.eqbMembers, Bool.and_eq_true, decide_eq_true_eq, List.cons.injEq,
      Prod.mk.injEq]
    rw [Data.eqb_iff x y, Data.eqbMembers_iff fs gs]

theorem Data.eqbList_iff : ∀ xs ys : List Data, Data.eqbList xs ys = true ↔ xs = ys
  | [], [] => by simp [Data.eqbList]
  | [], _ :: _ => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | _ :: _, [] => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | x :: xs, y :: ys => by
    simp only [Data.eqbList, Bool.and_eq_true, List.cons.injEq]
    rw [Data.eqb_iff x y, Data.eqbList_iff xs ys]
end

instance : DecidableEq Data := fun x y => decidable_of_iff _ (Data.eqb_iff x y)

/-! ## The rank rule -/

/-- The rank the rule picks: the lowest positive rank among the live
arms, where any has one. -/
def pickRank (arms : List (ℕ × Val)) : Option ℕ :=
  arms.foldl (fun acc p =>
    if p.2.dead || p.1 = 0 then acc
    else match acc with
      | none => some p.1
      | some m => some (min m p.1)) none

/-- Whether the rule picks an arm: a live one, of the picked rank where
there is one. -/
def picked (arms : List (ℕ × Val)) (p : ℕ × Val) : Bool :=
  !p.2.dead && (match pickRank arms with
    | none => true
    | some m => decide (p.1 = m))

/-- Whether a map term declares each key once. -/
def keysDistinct : List (String × Bool × Val) → Bool
  | [] => true
  | (k, _, _) :: fs => !declared k fs && keysDistinct fs

/-- A member placed before the first member whose key is not below its
own. -/
def insertMember (m : String × Data) : List (String × Data) → List (String × Data)
  | [] => [m]
  | n :: ns => if m.1 ≤ n.1 then m :: n :: ns else n :: insertMember m ns

/-- The members of a generated map in key order: one order for the one
value, so that two arms that generate one map generate one term. -/
def sortMembers : List (String × Data) → List (String × Data)
  | [] => []
  | m :: ms => insertMember m (sortMembers ms)

theorem insertMember_perm (m : String × Data) :
    ∀ l : List (String × Data), (insertMember m l).Perm (m :: l)
  | [] => List.Perm.refl _
  | n :: ns => by
    unfold insertMember
    split
    · exact List.Perm.refl _
    · exact ((insertMember_perm m ns).cons n).trans (List.Perm.swap m n ns)

theorem sortMembers_perm : ∀ ms : List (String × Data), (sortMembers ms).Perm ms
  | [] => List.Perm.refl _
  | m :: ms => (insertMember_perm m _).trans ((sortMembers_perm ms).cons m)

/-! ## Generation -/

mutual
/-- `v` generates `j`. -/
def Gen (env : Env) (root : Data) : Val → Data → Prop
  | .lit s, j => j = s.data
  | .map fs spread _, j =>
    keysDistinct fs = true ∧ ∃ ms, genFields env root spread fs ms ∧ j = .map (sortMembers ms)
  | .list items spread _, j => ∃ xs, genItems env root spread items xs ∧ j = .list xs
  | .or arms, j => arms.any (picked arms) = true ∧ genArms env root arms arms j
  | .pref _ x, j => Gen env root x j
  | .meet a b, j =>
    (Gen env root a j ∧ Admits env root b j) ∨
      ((∀ j', ¬ Gen env root a j') ∧ Gen env root b j ∧ Admits env root a j)
  | .integer, _ | .float, _ | .biginteger, _ | .bigdecimal, _ | .number, _ | .string, _
  | .anyString, _ | .boolean, _ | .min _, _ | .max _, _ | .above _, _ | .beneath _, _
  | .neq _, _ | .multiple _, _ | .len _, _ | .unique _, _ | .re _, _ | .format _, _
  | .any, _ | .nil, _ | .alias _, _ | .path _, _ | .nof _ _, _ | .must _ _, _
  | .when _ _ _, _ | .contains _ _, _ | .rest _ _, _ | .select _ _ _, _ | .filter _ _, _ => False

/-- The members a map's declarations generate, in declaration order: a
key whose value generates one the spread admits, with it; an optional
key whose value generates none such, absent; a required key whose
value generates none such, no members at all. -/
def genFields (env : Env) (root : Data) (spread : Option Val) :
    List (String × Bool × Val) → List (String × Data) → Prop
  | [], ms => ms = []
  | (k, o, v) :: fs, ms =>
    (∃ x rest, Gen env root v x ∧ (∀ s, spread = some s → Admits env root s x) ∧
      genFields env root spread fs rest ∧ ms = (k, x) :: rest) ∨
    (o = true ∧
      (∀ x, Gen env root v x → (∀ s, spread = some s → Admits env root s x) → False) ∧
      genFields env root spread fs ms)

/-- The elements a list's positions generate, each one the spread
admits. -/
def genItems (env : Env) (root : Data) (spread : Option Val) : List Val → List Data → Prop
  | [], xs => xs = []
  | v :: vs, xs =>
    ∃ x rest, Gen env root v x ∧ (∀ s, spread = some s → Admits env root s x) ∧
      genItems env root spread vs rest ∧ xs = x :: rest

/-- Every arm the rule picks, among the arms `arms₀`, generates `j`. -/
def genArms (env : Env) (root : Data) (arms₀ : List (ℕ × Val)) :
    List (ℕ × Val) → Data → Prop
  | [], _ => True
  | (r, a) :: arms, j =>
    (picked arms₀ (r, a) = true → Gen env root a j) ∧ genArms env root arms₀ arms j
end

/-- What evaluation singles out for `v`: what the normal form of `v`,
every meet computed and every dead arm dropped, generates. -/
def Output (env : Env) (root : Data) (v : Val) (j : Data) : Prop := Gen env root (normalise v) j

section
variable {env : Env} {root : Data}

/-! ## Members and positions -/

theorem genFields_mem {spread : Option Val} :
    ∀ {fs : List (String × Bool × Val)} {ms : List (String × Data)},
      genFields env root spread fs ms → ∀ k x, (k, x) ∈ ms →
        ∃ o v, (k, o, v) ∈ fs ∧ Gen env root v x ∧ ∀ s, spread = some s → Admits env root s x
  | [], ms, h, k, x, hm => by
    rw [genFields] at h
    subst h
    exact absurd hm (List.not_mem_nil)
  | (k', o', v') :: fs, ms, h, k, x, hm => by
    rw [genFields] at h
    rcases h with ⟨y, rest, hg, hs, hrest, rfl⟩ | ⟨-, -, hrest⟩
    · rcases List.mem_cons.mp hm with he | hm'
      · cases he
        exact ⟨o', v', List.mem_cons_self, hg, hs⟩
      · obtain ⟨o, v, hmem, hg', hs'⟩ := genFields_mem hrest k x hm'
        exact ⟨o, v, List.mem_cons_of_mem _ hmem, hg', hs'⟩
    · obtain ⟨o, v, hmem, hg', hs'⟩ := genFields_mem hrest k x hm
      exact ⟨o, v, List.mem_cons_of_mem _ hmem, hg', hs'⟩

theorem keysDistinct_cons {k : String} {o : Bool} {v : Val} {fs : List (String × Bool × Val)}
    (h : keysDistinct ((k, o, v) :: fs) = true) :
    declared k fs = false ∧ keysDistinct fs = true := by
  rw [keysDistinct, Bool.and_eq_true_iff, Bool.not_eq_true'] at h
  exact h

/-- A map term that declares each key once generates each key once. -/
theorem genFields_nodup {spread : Option Val} :
    ∀ {fs : List (String × Bool × Val)} {ms : List (String × Data)},
      keysDistinct fs = true → genFields env root spread fs ms → (ms.map Prod.fst).Nodup
  | [], ms, _, h => by
    rw [genFields] at h
    subst h
    exact List.nodup_nil
  | (k, o, v) :: fs, ms, hd, h => by
    obtain ⟨hd₁, hd₂⟩ := keysDistinct_cons hd
    rw [genFields] at h
    rcases h with ⟨x, rest, -, -, hrest, rfl⟩ | ⟨-, -, hrest⟩
    · rw [List.map_cons, List.nodup_cons]
      refine ⟨fun hk => ?_, genFields_nodup hd₂ hrest⟩
      obtain ⟨⟨k', y⟩, hmem, hk'⟩ := List.mem_map.mp hk
      simp only at hk'
      subst hk'
      obtain ⟨o', v', hmem', -, -⟩ := genFields_mem hrest _ y hmem
      exact Bool.false_ne_true (hd₁ ▸ declared_iff.mpr ⟨o', v', hmem'⟩)
    · exact genFields_nodup hd₂ hrest

theorem genFields_lookup_some {spread : Option Val} :
    ∀ {fs : List (String × Bool × Val)} {ms : List (String × Data)},
      keysDistinct fs = true → genFields env root spread fs ms →
      ∀ k o v x, (k, o, v) ∈ fs → lookup k ms = some x →
        Gen env root v x ∧ ∀ s, spread = some s → Admits env root s x
  | [], _, _, _, _, _, _, _, hm, _ => absurd hm (List.not_mem_nil)
  | (k', o', v') :: fs, ms, hd, h, k, o, v, x, hm, hl => by
    obtain ⟨hd₁, hd₂⟩ := keysDistinct_cons hd
    rw [genFields] at h
    rcases h with ⟨y, rest, hg, hs, hrest, rfl⟩ | ⟨-, -, hrest⟩
    · rcases List.mem_cons.mp hm with he | hm'
      · cases he
        simp only [lookup, if_true, Option.some.injEq] at hl
        subst hl
        exact ⟨hg, hs⟩
      · have hk : k ≠ k' := fun hk =>
          Bool.false_ne_true (hd₁ ▸ declared_iff.mpr ⟨o, v, hk ▸ hm'⟩)
        simp only [lookup, if_neg hk] at hl
        exact genFields_lookup_some hd₂ hrest k o v x hm' hl
    · rcases List.mem_cons.mp hm with he | hm'
      · cases he
        exfalso
        obtain ⟨o'', v'', hmem, -, -⟩ := genFields_mem hrest _ x (lookup_mem hl)
        exact Bool.false_ne_true (hd₁ ▸ declared_iff.mpr ⟨o'', v'', hmem⟩)
      · exact genFields_lookup_some hd₂ hrest k o v x hm' hl

theorem genFields_lookup_none {spread : Option Val} :
    ∀ {fs : List (String × Bool × Val)} {ms : List (String × Data)},
      keysDistinct fs = true → genFields env root spread fs ms →
      ∀ k o v, (k, o, v) ∈ fs → lookup k ms = none → o = true
  | [], _, _, _, _, _, _, hm, _ => absurd hm (List.not_mem_nil)
  | (k', o', v') :: fs, ms, hd, h, k, o, v, hm, hl => by
    obtain ⟨hd₁, hd₂⟩ := keysDistinct_cons hd
    rw [genFields] at h
    rcases h with ⟨y, rest, -, -, hrest, rfl⟩ | ⟨ho, -, hrest⟩
    · rcases List.mem_cons.mp hm with he | hm'
      · cases he
        simp [lookup] at hl
      · have hk : k ≠ k' := fun hk =>
          Bool.false_ne_true (hd₁ ▸ declared_iff.mpr ⟨o, v, hk ▸ hm'⟩)
        simp only [lookup, if_neg hk] at hl
        exact genFields_lookup_none hd₂ hrest k o v hm' hl
    · rcases List.mem_cons.mp hm with he | hm'
      · cases he
        exact ho
      · exact genFields_lookup_none hd₂ hrest k o v hm' hl

theorem genItems_length {spread : Option Val} : ∀ {items : List Val} {xs : List Data},
    genItems env root spread items xs → xs.length = items.length
  | [], xs, h => by
    rw [genItems] at h
    subst h
    rfl
  | v :: vs, xs, h => by
    rw [genItems] at h
    obtain ⟨x, rest, -, -, hrest, rfl⟩ := h
    simp [genItems_length hrest]

theorem genItems_pos {spread : Option Val} : ∀ {items : List Val} {xs : List Data},
    genItems env root spread items xs →
    ∀ (i : ℕ) (v : Val) (x : Data), items[i]? = some v → xs[i]? = some x →
      Gen env root v x ∧ ∀ s, spread = some s → Admits env root s x
  | [], _, _, _, _, _, hv, _ => by simp at hv
  | v' :: vs, xs, h, i, v, x, hv, hx => by
    rw [genItems] at h
    obtain ⟨y, rest, hg, hs, hrest, rfl⟩ := h
    cases i with
    | zero =>
      simp only [List.getElem?_cons_zero, Option.some.injEq] at hv hx
      subst hv
      subst hx
      exact ⟨hg, hs⟩
    | succ i =>
      simp only [List.getElem?_cons_succ] at hv hx
      exact genItems_pos hrest i v x hv hx

theorem genItems_mem {spread : Option Val} : ∀ {items : List Val} {xs : List Data},
    genItems env root spread items xs → ∀ x, x ∈ xs → ∀ s, spread = some s → Admits env root s x
  | [], xs, h, x, hx => by
    rw [genItems] at h
    subst h
    exact absurd hx (List.not_mem_nil)
  | v :: vs, xs, h, x, hx => by
    rw [genItems] at h
    obtain ⟨y, rest, -, hs, hrest, rfl⟩ := h
    rcases List.mem_cons.mp hx with rfl | hm
    · exact hs
    · exact genItems_mem hrest x hm

theorem genArms_mem {arms₀ : List (ℕ × Val)} : ∀ {arms : List (ℕ × Val)} {j : Data},
    genArms env root arms₀ arms j → ∀ p, p ∈ arms → picked arms₀ p = true → Gen env root p.2 j
  | [], _, _, _, hm, _ => absurd hm (List.not_mem_nil)
  | ⟨r, a⟩ :: arms, j, h, p, hm, hp => by
    rw [genArms] at h
    rcases List.mem_cons.mp hm with rfl | hm'
    · exact h.1 hp
    · exact genArms_mem h.2 p hm' hp

/-! ## Lookups under a permutation -/

theorem lookup_eq_some_of_nodup : ∀ {l : List (String × Data)} {k : String} {x : Data},
    (l.map Prod.fst).Nodup → (k, x) ∈ l → lookup k l = some x
  | [], _, _, _, h => absurd h (List.not_mem_nil)
  | (k', y) :: l, k, x, hn, h => by
    rw [List.map_cons, List.nodup_cons] at hn
    rcases List.mem_cons.mp h with he | hm
    · cases he
      simp [lookup]
    · have hk : k ≠ k' := fun hk => hn.1 (hk ▸ List.mem_map.mpr ⟨(k, x), hm, rfl⟩)
      simp only [lookup, if_neg hk]
      exact lookup_eq_some_of_nodup hn.2 hm

theorem lookup_eq_of_perm {l₁ l₂ : List (String × Data)} (hn : (l₁.map Prod.fst).Nodup)
    (hp : l₁.Perm l₂) (k : String) : lookup k l₁ = lookup k l₂ := by
  have hn₂ : (l₂.map Prod.fst).Nodup := ((hp.map Prod.fst).nodup_iff).mp hn
  cases hl : lookup k l₁ with
  | some x => exact (lookup_eq_some_of_nodup hn₂ (hp.mem_iff.mp (lookup_mem hl))).symm
  | none =>
    cases hl₂ : lookup k l₂ with
    | none => rfl
    | some y =>
      have hmem : (k, y) ∈ l₁ := hp.mem_iff.mpr (lookup_mem hl₂)
      rw [lookup_eq_some_of_nodup hn hmem] at hl
      exact nomatch hl

/-! ## ADR-007: the output is an instance -/

mutual
theorem gen_admits : ∀ (v : Val) (j : Data), Gen env root v j → Admits env root v j
  | .lit s, j, h => by
    rw [Gen] at h
    subst h
    exact admits_lit_iff.mpr rfl
  | .map fs spread closed, j, h => by
    rw [Gen] at h
    obtain ⟨hd, ms, hg, rfl⟩ := h
    have hn := genFields_nodup hd hg
    have hperm := sortMembers_perm ms
    have hlook : ∀ k, lookup k (sortMembers ms) = lookup k ms :=
      fun k => (lookup_eq_of_perm hn hperm.symm k).symm
    refine .map ?_ ?_ ?_ ?_
    · intro k o v x hm hl
      rw [hlook] at hl
      exact fields_admits fs k o v hm x (genFields_lookup_some hd hg k o v x hm hl).1
    · intro k o v hm hl
      rw [hlook] at hl
      exact genFields_lookup_none hd hg k o v hm hl
    · intro s hs k x hx
      obtain ⟨-, -, -, -, hsp⟩ := genFields_mem hg k x (hperm.mem_iff.mp hx)
      exact hsp s hs
    · intro _ k x hx
      obtain ⟨o, v, hmem, -, -⟩ := genFields_mem hg k x (hperm.mem_iff.mp hx)
      exact ⟨o, v, hmem⟩
  | .list items spread closed, j, h => by
    rw [Gen] at h
    obtain ⟨xs, hg, rfl⟩ := h
    have hlen := genItems_length hg
    refine .list (Nat.le_of_eq hlen.symm) (fun _ _ => hlen) ?_ ?_
    · intro i v x hv hx
      exact items_admits items v (List.mem_of_getElem? hv) x (genItems_pos hg i v x hv hx).1
    · intro s hs x hx
      exact genItems_mem hg x hx s hs
  | .or arms, j, h => by
    rw [Gen] at h
    obtain ⟨hany, hg⟩ := h
    obtain ⟨p, hp, hpk⟩ := List.any_eq_true.mp hany
    exact .or hp (arms_admits arms p.1 p.2 hp j (genArms_mem hg p hp hpk))
  | .pref r x, j, h => by
    rw [Gen] at h
    exact .pref (gen_admits x j h)
  | .meet a b, j, h => by
    rw [Gen] at h
    rcases h with ⟨ha, hb⟩ | ⟨-, hb, ha⟩
    · exact .meet (gen_admits a j ha) hb
    · exact .meet ha (gen_admits b j hb)
  | .integer, _, h | .float, _, h | .biginteger, _, h | .bigdecimal, _, h | .number, _, h
  | .string, _, h | .anyString, _, h | .boolean, _, h | .min _, _, h | .max _, _, h
  | .above _, _, h | .beneath _, _, h | .neq _, _, h | .multiple _, _, h | .len _, _, h
  | .unique _, _, h | .re _, _, h | .format _, _, h | .any, _, h | .nil, _, h
  | .alias _, _, h | .path _, _, h => by rw [Gen] at h; exact h.elim

theorem fields_admits : ∀ fs : List (String × Bool × Val), ∀ k o v, (k, o, v) ∈ fs →
    ∀ x, Gen env root v x → Admits env root v x
  | [], _, _, _, hm, _, _ => absurd hm (List.not_mem_nil)
  | (k', o', v') :: fs, k, o, v, hm, x, hg => by
    rcases List.mem_cons.mp hm with he | hm'
    · cases he
      exact gen_admits _ x hg
    · exact fields_admits fs k o v hm' x hg

theorem items_admits : ∀ items : List Val, ∀ v, v ∈ items →
    ∀ x, Gen env root v x → Admits env root v x
  | [], _, hm, _, _ => absurd hm (List.not_mem_nil)
  | v' :: vs, v, hm, x, hg => by
    rcases List.mem_cons.mp hm with rfl | hm'
    · exact gen_admits _ x hg
    · exact items_admits vs v hm' x hg

theorem arms_admits : ∀ arms : List (ℕ × Val), ∀ r a, (r, a) ∈ arms →
    ∀ j, Gen env root a j → Admits env root a j
  | [], _, _, hm, _, _ => absurd hm (List.not_mem_nil)
  | (r', a') :: arms, r, a, hm, j, hg => by
    rcases List.mem_cons.mp hm with he | hm'
    · cases he
      exact gen_admits _ j hg
    · exact arms_admits arms r a hm' j hg
end

/-- What evaluation singles out is an instance. -/
theorem output_admits (v : Val) (j : Data) (h : Output env root v j) : Admits env root v j :=
  (admits_normalise v j).mp (gen_admits _ j h)

/-! ## The output is one value -/

theorem genFields_unique {spread : Option Val} :
    ∀ {fs : List (String × Bool × Val)} {ms ms' : List (String × Data)},
      (∀ k o v, (k, o, v) ∈ fs → ∀ x x', Gen env root v x → Gen env root v x' → x = x') →
      genFields env root spread fs ms → genFields env root spread fs ms' → ms = ms'
  | [], ms, ms', _, h, h' => by
    rw [genFields] at h h'
    rw [h, h']
  | (k, o, v) :: fs, ms, ms', hu, h, h' => by
    rw [genFields] at h h'
    have hu' : ∀ k o v, (k, o, v) ∈ fs → ∀ x x', Gen env root v x → Gen env root v x' → x = x' :=
      fun k o v hm => hu k o v (List.mem_cons_of_mem _ hm)
    rcases h with ⟨x, rest, hg, hs, hrest, rfl⟩ | ⟨-, hnone, hrest⟩ <;>
      rcases h' with ⟨x', rest', hg', hs', hrest', rfl⟩ | ⟨-, hnone', hrest'⟩
    · obtain rfl := hu k o v (List.mem_cons_self) x x' hg hg'
      rw [genFields_unique hu' hrest hrest']
    · exact absurd hs (hnone' x hg)
    · exact absurd hs' (hnone x' hg')
    · exact genFields_unique hu' hrest hrest'

theorem genItems_unique {spread : Option Val} :
    ∀ {items : List Val} {xs xs' : List Data},
      (∀ v, v ∈ items → ∀ x x', Gen env root v x → Gen env root v x' → x = x') →
      genItems env root spread items xs → genItems env root spread items xs' → xs = xs'
  | [], xs, xs', _, h, h' => by
    rw [genItems] at h h'
    rw [h, h']
  | v :: vs, xs, xs', hu, h, h' => by
    rw [genItems] at h h'
    obtain ⟨x, rest, hg, -, hrest, rfl⟩ := h
    obtain ⟨x', rest', hg', -, hrest', rfl⟩ := h'
    obtain rfl := hu v (List.mem_cons_self) x x' hg hg'
    rw [genItems_unique (fun v hm => hu v (List.mem_cons_of_mem _ hm)) hrest hrest']

mutual
theorem gen_unique : ∀ (v : Val) (j j' : Data), Gen env root v j → Gen env root v j' → j = j'
  | .lit s, j, j', h, h' => by
    rw [Gen] at h h'
    rw [h, h']
  | .map fs spread closed, j, j', h, h' => by
    rw [Gen] at h h'
    obtain ⟨-, ms, hg, rfl⟩ := h
    obtain ⟨-, ms', hg', rfl⟩ := h'
    rw [genFields_unique (fields_unique fs) hg hg']
  | .list items spread closed, j, j', h, h' => by
    rw [Gen] at h h'
    obtain ⟨xs, hg, rfl⟩ := h
    obtain ⟨xs', hg', rfl⟩ := h'
    rw [genItems_unique (items_unique items) hg hg']
  | .or arms, j, j', h, h' => by
    rw [Gen] at h h'
    obtain ⟨hany, hg⟩ := h
    obtain ⟨-, hg'⟩ := h'
    obtain ⟨p, hp, hpk⟩ := List.any_eq_true.mp hany
    exact arms_unique arms p.1 p.2 hp j j' (genArms_mem hg p hp hpk) (genArms_mem hg' p hp hpk)
  | .pref r x, j, j', h, h' => by
    rw [Gen] at h h'
    exact gen_unique x j j' h h'
  | .meet a b, j, j', h, h' => by
    rw [Gen] at h h'
    rcases h with ⟨ha, -⟩ | ⟨hna, hb, -⟩ <;> rcases h' with ⟨ha', -⟩ | ⟨hna', hb', -⟩
    · exact gen_unique a j j' ha ha'
    · exact absurd ha (hna' j)
    · exact absurd ha' (hna j')
    · exact gen_unique b j j' hb hb'
  | .integer, _, _, h, _ | .float, _, _, h, _ | .biginteger, _, _, h, _ | .bigdecimal, _, _, h, _
  | .number, _, _, h, _ | .string, _, _, h, _ | .anyString, _, _, h, _ | .boolean, _, _, h, _
  | .min _, _, _, h, _ | .max _, _, _, h, _ | .above _, _, _, h, _ | .beneath _, _, _, h, _
  | .neq _, _, _, h, _ | .multiple _, _, _, h, _ | .len _, _, _, h, _ | .unique _, _, _, h, _
  | .re _, _, _, h, _ | .format _, _, _, h, _ | .any, _, _, h, _ | .nil, _, _, h, _
  | .alias _, _, _, h, _ | .path _, _, _, h, _ => by rw [Gen] at h; exact h.elim

theorem fields_unique : ∀ fs : List (String × Bool × Val), ∀ k o v, (k, o, v) ∈ fs →
    ∀ x x', Gen env root v x → Gen env root v x' → x = x'
  | [], _, _, _, hm, _, _, _, _ => absurd hm (List.not_mem_nil)
  | (k', o', v') :: fs, k, o, v, hm, x, x', hg, hg' => by
    rcases List.mem_cons.mp hm with he | hm'
    · cases he
      exact gen_unique _ x x' hg hg'
    · exact fields_unique fs k o v hm' x x' hg hg'

theorem items_unique : ∀ items : List Val, ∀ v, v ∈ items →
    ∀ x x', Gen env root v x → Gen env root v x' → x = x'
  | [], _, hm, _, _, _, _ => absurd hm (List.not_mem_nil)
  | v' :: vs, v, hm, x, x', hg, hg' => by
    rcases List.mem_cons.mp hm with rfl | hm'
    · exact gen_unique _ x x' hg hg'
    · exact items_unique vs v hm' x x' hg hg'

theorem arms_unique : ∀ arms : List (ℕ × Val), ∀ r a, (r, a) ∈ arms →
    ∀ j j', Gen env root a j → Gen env root a j' → j = j'
  | [], _, _, hm, _, _, _, _ => absurd hm (List.not_mem_nil)
  | (r', a') :: arms, r, a, hm, j, j', hg, hg' => by
    rcases List.mem_cons.mp hm with he | hm'
    · cases he
      exact gen_unique _ j j' hg hg'
    · exact arms_unique arms r a hm' j j' hg hg'
end

/-- Evaluation singles out one value. -/
theorem output_unique (v : Val) (j j' : Data) (h : Output env root v j) (h' : Output env root v j') :
    j = j' :=
  gen_unique _ j j' h h'

end

/-! ## Generation, computed -/

/-- Whether a spread, where there is one, admits a member, by the checker
given. -/
def spreadOk (chk : Val → Data → Bool) : Option Val → Data → Bool
  | none, _ => true
  | some s, x => chk s x

mutual
/-- What `v` generates, computed. -/
def genWith (chk : Val → Data → Bool) : Val → Option Data
  | .lit s => some s.data
  | .map fs spread _ =>
    if keysDistinct fs then (genFieldsWith chk spread fs).map fun ms => .map (sortMembers ms) else none
  | .list items spread _ => (genItemsWith chk spread items).map .list
  | .or arms =>
    match genArmsWith chk arms arms none with
    | some (some j) => some j
    | _ => none
  | .pref _ x => genWith chk x
  | .meet a b =>
    match genWith chk a with
    | some x => if chk b x then some x else none
    | none =>
      match genWith chk b with
      | some y => if chk a y then some y else none
      | none => none
  | .integer | .float | .biginteger | .bigdecimal | .number | .string | .anyString | .boolean
  | .min _ | .max _ | .above _ | .beneath _ | .neq _ | .multiple _ | .len _ | .unique _
  | .re _ | .format _ | .any | .nil | .alias _ | .path _ | .nof _ _ | .must _ _
  | .when _ _ _ | .contains _ _ | .rest _ _ | .select _ _ _ | .filter _ _ => none

/-- The members the declarations generate, or `none` where a required
key's value generates none the spread admits. -/
def genFieldsWith (chk : Val → Data → Bool) (spread : Option Val) : List (String × Bool × Val) → Option (List (String × Data))
  | [] => some []
  | (k, o, v) :: fs =>
    match genWith chk v with
    | some x =>
      if spreadOk chk spread x then (genFieldsWith chk spread fs).map ((k, x) :: ·)
      else if o then genFieldsWith chk spread fs else none
    | none => if o then genFieldsWith chk spread fs else none

def genItemsWith (chk : Val → Data → Bool) (spread : Option Val) : List Val → Option (List Data)
  | [] => some []
  | v :: vs =>
    match genWith chk v with
    | some x => if spreadOk chk spread x then (genItemsWith chk spread vs).map (x :: ·) else none
    | none => none

/-- The one value the picked arms generate: `some (some j)` where every
picked arm generates `j`, `some acc` where none is picked, and `none`
where one generates nothing or two generate differently. -/
def genArmsWith (chk : Val → Data → Bool) (arms₀ : List (ℕ × Val)) : List (ℕ × Val) → Option Data → Option (Option Data)
  | [], acc => some acc
  | p :: arms, acc =>
    if picked arms₀ p then
      match genWith chk p.2 with
      | none => none
      | some x =>
        match acc with
        | none => genArmsWith chk arms₀ arms (some x)
        | some y => if x = y then genArmsWith chk arms₀ arms acc else none
    else genArmsWith chk arms₀ arms acc
end

/-- The generator with no hook for names: the checker of values that read
none. -/
abbrev gen : Val → Option Data := genWith check

/-- What evaluation singles out, computed: `gen` of the normal form. -/
def output (v : Val) : Option Data := gen (normalise v)

section
variable {chk : Val → Data → Bool} {env : Env} {root : Data}

theorem spreadOk_iff {spread : Option Val}
    (ih : ∀ s, spread = some s → ∀ j, chk s j = true ↔ Admits env root s j) (x : Data) :
    spreadOk chk spread x = true ↔ ∀ s, spread = some s → Admits env root s x := by
  cases spread with
  | none => simp [spreadOk]
  | some s => simp [spreadOk, ih s rfl]

theorem genFieldsWith_iff {spread : Option Val}
    (hs : ∀ s, spread = some s → ∀ j, chk s j = true ↔ Admits env root s j) :
    ∀ {fs : List (String × Bool × Val)},
      (∀ k o v, (k, o, v) ∈ fs → ∀ j, genWith chk v = some j ↔ Gen env root v j) →
      ∀ ms, genFieldsWith chk spread fs = some ms ↔ genFields env root spread fs ms
  | [], _, ms => by
    rw [genFieldsWith, genFields, Option.some.injEq]
    exact eq_comm
  | (k, o, v) :: fs, ih, ms => by
    have ihv := ih k o v (List.mem_cons_self)
    have ihfs := genFieldsWith_iff hs (fun k o v hm => ih k o v (List.mem_cons_of_mem _ hm))
    rw [genFieldsWith, genFields]
    cases hg : genWith chk v with
    | none =>
      dsimp only
      have hnone : ∀ x, ¬ Gen env root v x := fun x hx => by
        have := (ihv x).mpr hx
        rw [hg] at this
        exact nomatch this
      cases o with
      | true =>
        rw [if_pos rfl, ihfs]
        constructor
        · intro h
          exact .inr ⟨rfl, fun x hx _ => hnone x hx, h⟩
        · rintro (⟨x, rest, hx, -, -, -⟩ | ⟨-, -, h⟩)
          · exact absurd hx (hnone x)
          · exact h
      | false =>
        rw [if_neg Bool.false_ne_true]
        constructor
        · intro h
          exact nomatch h
        · rintro (⟨x, rest, hx, -, -, -⟩ | ⟨h, -, -⟩)
          · exact absurd hx (hnone x)
          · exact nomatch h
    | some x =>
      dsimp only
      have hgen : Gen env root v x := (ihv x).mp hg
      have huniq : ∀ y, Gen env root v y → x = y := fun y hy =>
        Option.some.inj (hg.symm.trans ((ihv y).mpr hy))
      cases hsp : spreadOk chk spread x with
      | true =>
        have hspOK : ∀ s, spread = some s → Admits env root s x := (spreadOk_iff hs x).mp hsp
        rw [if_pos rfl]
        constructor
        · intro h
          obtain ⟨rest, hrest, rfl⟩ := Option.map_eq_some_iff.mp h
          exact .inl ⟨x, rest, hgen, hspOK, (ihfs rest).mp hrest, rfl⟩
        · rintro (⟨x', rest, hx', -, hrest, rfl⟩ | ⟨-, hno, -⟩)
          · obtain rfl := huniq x' hx'
            exact Option.map_eq_some_iff.mpr ⟨rest, (ihfs rest).mpr hrest, rfl⟩
          · exact absurd hspOK (hno x hgen)
      | false =>
        have hspNo : ¬ ∀ s, spread = some s → Admits env root s x := fun h => by
          have := (spreadOk_iff hs x).mpr h
          rw [hsp] at this
          exact nomatch this
        rw [if_neg Bool.false_ne_true]
        cases o with
        | true =>
          rw [if_pos rfl, ihfs]
          constructor
          · intro h
            refine .inr ⟨rfl, fun y hy hsp' => ?_, h⟩
            obtain rfl := huniq y hy
            exact hspNo hsp'
          · rintro (⟨x', rest, hx', hsp', -, -⟩ | ⟨-, -, h⟩)
            · obtain rfl := huniq x' hx'
              exact absurd hsp' hspNo
            · exact h
        | false =>
          rw [if_neg Bool.false_ne_true]
          constructor
          · intro h
            exact nomatch h
          · rintro (⟨x', rest, hx', hsp', -, -⟩ | ⟨h, -, -⟩)
            · obtain rfl := huniq x' hx'
              exact absurd hsp' hspNo
            · exact nomatch h

theorem genItemsWith_iff {spread : Option Val}
    (hs : ∀ s, spread = some s → ∀ j, chk s j = true ↔ Admits env root s j) :
    ∀ {items : List Val}, (∀ v, v ∈ items → ∀ j, genWith chk v = some j ↔ Gen env root v j) →
      ∀ xs, genItemsWith chk spread items = some xs ↔ genItems env root spread items xs
  | [], _, xs => by
    rw [genItemsWith, genItems, Option.some.injEq]
    exact eq_comm
  | v :: vs, ih, xs => by
    have ihv := ih v (List.mem_cons_self)
    have ihvs := genItemsWith_iff hs (fun v hm => ih v (List.mem_cons_of_mem _ hm))
    rw [genItemsWith, genItems]
    cases hg : genWith chk v with
    | none =>
      dsimp only
      have hnone : ∀ x, ¬ Gen env root v x := fun x hx => by
        have := (ihv x).mpr hx
        rw [hg] at this
        exact nomatch this
      constructor
      · intro h
        exact nomatch h
      · rintro ⟨x, rest, hx, -, -, -⟩
        exact absurd hx (hnone x)
    | some x =>
      dsimp only
      have hgen : Gen env root v x := (ihv x).mp hg
      have huniq : ∀ y, Gen env root v y → x = y := fun y hy =>
        Option.some.inj (hg.symm.trans ((ihv y).mpr hy))
      cases hsp : spreadOk chk spread x with
      | true =>
        have hspOK : ∀ s, spread = some s → Admits env root s x := (spreadOk_iff hs x).mp hsp
        rw [if_pos rfl]
        constructor
        · intro h
          obtain ⟨rest, hrest, rfl⟩ := Option.map_eq_some_iff.mp h
          exact ⟨x, rest, hgen, hspOK, (ihvs rest).mp hrest, rfl⟩
        · rintro ⟨x', rest, hx', -, hrest, rfl⟩
          obtain rfl := huniq x' hx'
          exact Option.map_eq_some_iff.mpr ⟨rest, (ihvs rest).mpr hrest, rfl⟩
      | false =>
        have hspNo : ¬ ∀ s, spread = some s → Admits env root s x := fun h => by
          have := (spreadOk_iff hs x).mpr h
          rw [hsp] at this
          exact nomatch this
        rw [if_neg Bool.false_ne_true]
        constructor
        · intro h
          exact nomatch h
        · rintro ⟨x', rest, hx', hsp', -, -⟩
          obtain rfl := huniq x' hx'
          exact absurd hsp' hspNo

theorem genArmsWith_iff {arms₀ : List (ℕ × Val)}
    (ih : ∀ r a, (r, a) ∈ arms₀ → ∀ j, genWith chk a = some j ↔ Gen env root a j) :
    ∀ {arms : List (ℕ × Val)}, (∀ p, p ∈ arms → p ∈ arms₀) → ∀ (acc : Option Data) (j : Data),
      genArmsWith chk arms₀ arms acc = some (some j) ↔
        genArms env root arms₀ arms j ∧ (acc = some j ∨ (acc = none ∧ arms.any (picked arms₀) = true))
  | [], _, acc, j => by
    rw [genArmsWith, genArms]
    simp
  | ⟨r, a⟩ :: arms, hsub, acc, j => by
    have iha := ih r a (hsub _ (List.mem_cons_self))
    have ihrest := genArmsWith_iff ih (fun p hp => hsub p (List.mem_cons_of_mem _ hp))
    rw [genArmsWith, genArms, List.any_cons]
    by_cases hp : picked arms₀ (r, a) = true
    · rw [if_pos hp, hp, Bool.true_or]
      simp only [true_implies]
      cases hg : genWith chk a with
      | none =>
        dsimp only
        have hnone : ∀ x, ¬ Gen env root a x := fun x hx => by
          have := (iha x).mpr hx
          rw [hg] at this
          exact nomatch this
        exact ⟨(fun h => nomatch h), fun h => absurd h.1.1 (hnone j)⟩
      | some x =>
        dsimp only
        have hgen : Gen env root a x := (iha x).mp hg
        have huniq : ∀ y, Gen env root a y → x = y := fun y hy =>
          Option.some.inj (hg.symm.trans ((iha y).mpr hy))
        cases acc with
        | none =>
          dsimp only
          rw [ihrest]
          constructor
          · rintro ⟨hrest, hx | ⟨hx, -⟩⟩
            · obtain rfl := Option.some.inj hx
              exact ⟨⟨hgen, hrest⟩, .inr ⟨rfl, by simp⟩⟩
            · exact nomatch hx
          · rintro ⟨⟨hj, hrest⟩, -⟩
            obtain rfl := huniq j hj
            exact ⟨hrest, .inl rfl⟩
        | some y =>
          dsimp only
          by_cases hxy : x = y
          · subst hxy
            rw [if_pos rfl, ihrest]
            constructor
            · rintro ⟨hrest, hx | ⟨hx, -⟩⟩
              · obtain rfl := Option.some.inj hx
                exact ⟨⟨hgen, hrest⟩, .inl rfl⟩
              · exact nomatch hx
            · rintro ⟨⟨hj, hrest⟩, hx | ⟨hx, -⟩⟩
              · obtain rfl := huniq j hj
                exact ⟨hrest, .inl rfl⟩
              · exact nomatch hx
          · rw [if_neg hxy]
            constructor
            · intro h
              exact nomatch h
            · rintro ⟨⟨hj, -⟩, hx | ⟨hx, -⟩⟩
              · obtain rfl := huniq j hj
                exact absurd (Option.some.inj hx).symm hxy
              · exact nomatch hx
    · rw [if_neg hp, ihrest]
      have hp' : picked arms₀ (r, a) = false := Bool.eq_false_iff.mpr hp
      rw [hp', Bool.false_or]
      constructor
      · rintro ⟨hrest, hacc⟩
        exact ⟨⟨(fun h => nomatch h), hrest⟩, hacc⟩
      · rintro ⟨⟨-, hrest⟩, hacc⟩
        exact ⟨hrest, hacc⟩

/-- The generator computes `Gen` on every value it can read, given a
checker that is right on the values the term holds, which is where it
asks. -/
theorem genWith_iff {v : Val} (h : v.CheckableA)
    (hchk : ∀ w j, w.CheckableA → (∀ n, n ∈ w.refs → n ∈ v.refs) →
      (chk w j = true ↔ Admits env root w j)) :
    ∀ j, genWith chk v = some j ↔ Gen env root v j := by
  induction h with
  | integer | float | biginteger | bigdecimal | number | string | anyString | boolean
  | min | max | above | beneath | neq | multiple | unique | any | nil | alias | path =>
    intro j
    rw [genWith, Gen]
    exact ⟨(fun h => nomatch h), False.elim⟩
  | len _ _ | nof _ _ _ _ | must _ _ | when _ _ _ _ _ _ | contains _ _ _ _ | rest _ _ _ _ _ _ _ _ =>
    intro j
    rw [genWith, Gen]
    exact ⟨(fun h => nomatch h), False.elim⟩
  | lit =>
    intro j
    rw [genWith, Gen]
    exact ⟨fun h => (Option.some.inj h).symm, fun h => by rw [h]⟩
  | @map fs spread closed hf hs ihf _ =>
    intro j
    rw [genWith, Gen]
    have hsp : ∀ s, spread = some s → ∀ j, chk s j = true ↔ Admits env root s j :=
      fun s h j => hchk s j (hs s h) fun n hn => by
        simp only [Val.refs, List.mem_append, h, refsSpread]; exact .inr hn
    have ihf := fun k o v hm => ihf k o v hm fun w j hw hsub => hchk w j hw fun n hn => by
      simp only [Val.refs, List.mem_append]; exact .inl (mem_refsFields.mpr ⟨k, o, v, hm, hsub n hn⟩)
    by_cases hd : keysDistinct fs = true
    · rw [if_pos hd]
      constructor
      · intro h
        obtain ⟨ms, hms, rfl⟩ := Option.map_eq_some_iff.mp h
        exact ⟨hd, ms, (genFieldsWith_iff hsp ihf ms).mp hms, rfl⟩
      · rintro ⟨-, ms, hg, rfl⟩
        exact Option.map_eq_some_iff.mpr ⟨ms, (genFieldsWith_iff hsp ihf ms).mpr hg, rfl⟩
    · rw [if_neg hd]
      exact ⟨(fun h => nomatch h), fun h => absurd h.1 hd⟩
  | @list items spread closed hi hs ihi _ =>
    intro j
    rw [genWith, Gen]
    have hsp : ∀ s, spread = some s → ∀ j, chk s j = true ↔ Admits env root s j :=
      fun s h j => hchk s j (hs s h) fun n hn => by
        simp only [Val.refs, List.mem_append, h, refsSpread]; exact .inr hn
    have ihi := fun v hm => ihi v hm fun w j hw hsub => hchk w j hw fun n hn => by
      simp only [Val.refs, List.mem_append]; exact .inl (mem_refsItems.mpr ⟨v, hm, hsub n hn⟩)
    constructor
    · intro h
      obtain ⟨xs, hxs, rfl⟩ := Option.map_eq_some_iff.mp h
      exact ⟨xs, (genItemsWith_iff hsp ihi xs).mp hxs, rfl⟩
    · rintro ⟨xs, hg, rfl⟩
      exact Option.map_eq_some_iff.mpr ⟨xs, (genItemsWith_iff hsp ihi xs).mpr hg, rfl⟩
  | @or arms ha iha =>
    intro j
    rw [genWith, Gen]
    have iha := fun r a hm => iha r a hm fun w j hw hsub => hchk w j hw fun n hn => by
      simp only [Val.refs]; exact mem_refsArms.mpr ⟨r, a, hm, hsub n hn⟩
    have key := genArmsWith_iff iha (fun p hp => hp) none j
    cases hg : genArmsWith chk arms arms none with
    | none =>
      dsimp only
      rw [hg] at key
      exact ⟨(fun h => nomatch h), fun ⟨hany, hgen⟩ => nomatch (key.mpr ⟨hgen, .inr ⟨rfl, hany⟩⟩)⟩
    | some acc =>
      rw [hg] at key
      cases acc with
      | none =>
        dsimp only
        exact ⟨(fun h => nomatch h), fun ⟨hany, hgen⟩ => nomatch (key.mpr ⟨hgen, .inr ⟨rfl, hany⟩⟩)⟩
      | some j' =>
        dsimp only
        constructor
        · intro h
          obtain rfl := Option.some.inj h
          obtain ⟨hgen, hacc⟩ := key.mp rfl
          rcases hacc with hx | ⟨-, hany⟩
          · exact nomatch hx
          · exact ⟨hany, hgen⟩
        · rintro ⟨hany, hgen⟩
          have := key.mpr ⟨hgen, .inr ⟨rfl, hany⟩⟩
          rw [Option.some.injEq, Option.some.injEq] at this
          rw [this]
  | @pref r x _ ih =>
    intro j
    rw [genWith, Gen]
    exact ih (fun w j hw hsub => hchk w j hw fun n hn => by simpa [Val.refs] using hsub n hn) j
  | @meet a b ha hb iha ihb =>
    intro j
    rw [genWith, Gen]
    have iha := iha fun w j hw hsub => hchk w j hw fun n hn => by
      simp only [Val.refs, List.mem_append]; exact .inl (hsub n hn)
    have ihb := ihb fun w j hw hsub => hchk w j hw fun n hn => by
      simp only [Val.refs, List.mem_append]; exact .inr (hsub n hn)
    have hcb : ∀ x, chk b x = true ↔ Admits env root b x := fun x => hchk b x hb fun n hn => by
      simp only [Val.refs, List.mem_append]; exact .inr hn
    have hca : ∀ y, chk a y = true ↔ Admits env root a y := fun y => hchk a y ha fun n hn => by
      simp only [Val.refs, List.mem_append]; exact .inl hn
    cases hga : genWith chk a with
    | some x =>
      dsimp only
      have hgen : Gen env root a x := (iha x).mp hga
      have huniq : ∀ y, Gen env root a y → x = y := fun y hy =>
        Option.some.inj (hga.symm.trans ((iha y).mpr hy))
      by_cases hc : chk b x = true
      · rw [if_pos hc]
        have hadm : Admits env root b x := (hcb x).mp hc
        constructor
        · intro h
          obtain rfl := Option.some.inj h
          exact .inl ⟨hgen, hadm⟩
        · rintro (⟨hj, -⟩ | ⟨hna, -, -⟩)
          · obtain rfl := huniq j hj
            rfl
          · exact absurd hgen (hna x)
      · rw [if_neg hc]
        constructor
        · intro h
          exact nomatch h
        · rintro (⟨hj, hadm⟩ | ⟨hna, -, -⟩)
          · obtain rfl := huniq j hj
            exact absurd ((hcb x).mpr hadm) hc
          · exact absurd hgen (hna x)
    | none =>
      dsimp only
      have hnone : ∀ x, ¬ Gen env root a x := fun x hx => by
        have := (iha x).mpr hx
        rw [hga] at this
        exact nomatch this
      cases hgb : genWith chk b with
      | some y =>
        dsimp only
        have hgen : Gen env root b y := (ihb y).mp hgb
        have huniq : ∀ y', Gen env root b y' → y = y' := fun y' hy =>
          Option.some.inj (hgb.symm.trans ((ihb y').mpr hy))
        by_cases hc : chk a y = true
        · rw [if_pos hc]
          have hadm : Admits env root a y := (hca y).mp hc
          constructor
          · intro h
            obtain rfl := Option.some.inj h
            exact .inr ⟨hnone, hgen, hadm⟩
          · rintro (⟨hj, -⟩ | ⟨-, hj, -⟩)
            · exact absurd hj (hnone j)
            · obtain rfl := huniq j hj
              rfl
        · rw [if_neg hc]
          constructor
          · intro h
            exact nomatch h
          · rintro (⟨hj, -⟩ | ⟨-, hj, hadm⟩)
            · exact absurd hj (hnone j)
            · obtain rfl := huniq j hj
              exact absurd ((hca y).mpr hadm) hc
      | none =>
        dsimp only
        have hnoneb : ∀ y, ¬ Gen env root b y := fun y hy => by
          have := (ihb y).mpr hy
          rw [hgb] at this
          exact nomatch this
        constructor
        · intro h
          exact nomatch h
        · rintro (⟨hj, -⟩ | ⟨-, hj, -⟩)
          · exact absurd hj (hnone j)
          · exact absurd hj (hnoneb j)

/-- `gen` computes `Gen` on every checkable value. -/
theorem gen_iff {v : Val} (h : v.Checkable) : ∀ j, gen v = some j ↔ Gen env root v j :=
  genWith_iff h.toA fun _ j hw hsub =>
    check_iff (hw.toChecked fun n hn => h.no_refs n (hsub n hn)) j

/-- `output` computes `Output` wherever the normal form is checkable,
which `decide` settles for any closed term. -/
theorem output_iff {v : Val} (h : (normalise v).Checkable) (j : Data) :
    output v = some j ↔ Output env root v j :=
  gen_iff h j

end

end Aontu
