import Aontu.Subsume
import Aontu.Paths

/-!
# The profiles of subsumption

`aontu subsume general specific` answers under one of three profiles,
and each is a question of the order. `values` asks `Le`: whether every
instance of the specific document is an instance of the general.
`defaults` asks that, and that every value the specific side singles
out at a position, the general side singles out there too, so that a
default survives into the general side unchanged. `gen` asks that, and
that the marks agree at every position both sides have. Each profile
has one contract, of the shape `SubsumeCorrect` gives the first. The
rows of the order, and the procedure that decides it, are in
`Aontu/Subsume.lean`; the order on documents follows the profiles here.
-/

namespace Aontu

section
variable {env : Env}

/-! ## The profiles -/

/-- The profiles `aontu subsume` answers under. -/
inductive Profile where
  | values
  | defaults
  | gen

/-- Whether a term declares a default: a preference, or a disjunction
with a live arm of positive rank, which the rank rule picks. A literal
singles out its own value and declares none, nor does a disjunction
whose arms all single out one value without a rank. A rider declares
what its value declares. -/
def Val.declaresDefault : Val → Bool
  | .pref _ _ => true
  | .or arms => (pickRank arms).isSome
  | .ride _ v _ => v.declaresDefault
  | .link v _ => v.declaresDefault
  | _ => false

/-- The `defaults` profile's order: `a`, the specific side, below `b`,
the general side, in the order, and at every position where the normal
form of `a` declares a default that singles out a value, the normal
form of `b` declares one that singles out the same value. A default the
specific side declares survives into the general side unchanged; one
the general side adds where the specific side had none is no
obligation, and neither is a literal's own value, which is no default
(decision 11 of the design note's §7). -/
def DefaultsLe (env : Env) (a b : Val) : Prop :=
  a ⊑[env] b ∧
    ∀ (p : List Seg) (wa wb : Val), (normalise a).at p = some wa → wa.declaresDefault = true →
      (normalise b).at p = some wb →
      ∀ (root j : Data), Output env root wa j → wb.declaresDefault = true ∧ Output env root wb j

/-- A step to a corresponding node: a key, a position, or a container's
spread, which holds a mark as a member does. -/
inductive MarkSeg where
  | key (k : String)
  | idx (i : ℕ)
  | spread

/-- The node at a step path, the riders around a container read through. -/
def Val.atM : Val → List MarkSeg → Option Val
  | v, [] => some v
  | v, .key k :: p =>
    match v.unride with
    | .map fs _ _ =>
      match fs.find? (fun f => f.1 == k) with
      | some f => f.2.2.atM p
      | none => none
    | _ => none
  | v, .idx i :: p =>
    match v.unride with
    | .list items _ _ =>
      match items[i]? with
      | some x => x.atM p
      | none => none
    | _ => none
  | v, .spread :: p =>
    match v.unride with
    | .map _ (some s) _ | .list _ (some s) _ => s.atM p
    | _ => none

/-- The marks agree on corresponding nodes: at every position both
normal forms have, a spread's among them, each carries `type()` where
the other does, and `hide()` where the other does. -/
def MarksAgree (a b : Val) : Prop :=
  ∀ (p : List MarkSeg) (wa wb : Val), (normalise a).atM p = some wa → (normalise b).atM p = some wb →
    wa.hasMark .type = wb.hasMark .type ∧ wa.hasMark .hide = wb.hasMark .hide

/-- The `gen` profile's order: the `defaults` profile's, and the marks
agree on corresponding nodes, since a mark decides what the output holds
(decision 10 of the design note's §7). -/
def GenLe (env : Env) (a b : Val) : Prop :=
  DefaultsLe env a b ∧ MarksAgree a b

/-- The order each profile asks. -/
def Profile.Le (env : Env) : Profile → Val → Val → Prop
  | .values => Aontu.Le env
  | .defaults => DefaultsLe env
  | .gen => GenLe env

/-- The contract on an implementation under a profile: `subsumes` only
where the profile's order holds, `doesNotSubsume` only where it fails,
and `undecided` anywhere. Under `values` it is `SubsumeCorrect`. -/
def ProfileCorrect (env : Env) (pr : Profile) (subsume : Val → Val → Subsumption) : Prop :=
  ∀ general specific,
    (subsume general specific = .subsumes → pr.Le env specific general) ∧
    (subsume general specific = .doesNotSubsume → ¬ pr.Le env specific general)

theorem values_correct_iff {sub : Val → Val → Subsumption} :
    ProfileCorrect env .values sub ↔ SubsumeCorrect env sub := by
  unfold ProfileCorrect SubsumeCorrect Profile.Le
  exact Iff.rfl

theorem DefaultsLe.le {a b : Val} (h : DefaultsLe env a b) : a ⊑[env] b := h.1

theorem GenLe.defaults {a b : Val} (h : GenLe env a b) : DefaultsLe env a b := h.1

theorem DefaultsLe.refl (a : Val) : DefaultsLe env a a :=
  ⟨Le.refl env a, fun _ _ _ ha hd hb _ _ h => by rw [ha] at hb; cases hb; exact ⟨hd, h⟩⟩

theorem GenLe.refl (a : Val) : GenLe env a a :=
  ⟨DefaultsLe.refl a, fun _ _ _ ha hb => by rw [ha] at hb; cases hb; exact ⟨rfl, rfl⟩⟩

/-- A mark changes the `gen` order: `hide(integer)` is not below
`integer` under it, though each is below the other in `Le`, and a mark
on a field of a spread's template, the field's own, which each member's
field takes, does the same. -/
theorem hide_not_genLe : ¬ GenLe env (.ride .hide .integer []) .integer := fun h =>
  absurd (h.2 [] _ _ rfl rfl).2 (by decide)

theorem hide_spread_not_genLe :
    ¬ GenLe env (.map [] (some (.map [("n", false, .ride .hide .integer [])] none false)) false)
      (.map [] (some (.map [("n", false, .integer)] none false)) false) :=
  fun h => absurd (h.2 [.spread, .key "n"] _ _ rfl rfl).2 (by decide)

/-- A literal declares no default, so `defaults` asks of a value above
it what `values` asks: `integer` over `1` holds under both, as the
reference's `kind-over-scalar` answers. -/
theorem DefaultsLe.of_lit {s : Scalar} {b : Val} (h : .lit s ⊑[env] b) :
    DefaultsLe env (.lit s) b := by
  refine ⟨h, fun p wa _ ha hd _ _ _ _ => ?_⟩
  rw [normalise_lit] at ha
  cases p with
  | nil =>
    simp only [Val.at, Option.some.injEq] at ha
    subst ha
    simp [Val.declaresDefault] at hd
  | cons g p => cases g <;> simp [Val.at, Val.unride] at ha

/-- What `defaults` asks beyond `values`: `*2 | number` is below
`*1 | number` in the order, since both admit every number, and not
under `defaults`, since it singles out `2` where the general side
singles out `1`. The reference's `compat_default_changed`. -/
theorem defaults_sees_the_default :
    (.or [(1, .lit (.num (.integer (.of 2)))), (0, .number)]) ⊑[env]
        (.or [(1, .lit (.num (.integer (.of 1)))), (0, .number)]) ∧
      ¬ DefaultsLe env (.or [(1, .lit (.num (.integer (.of 2)))), (0, .number)])
        (.or [(1, .lit (.num (.integer (.of 1)))), (0, .number)]) := by
  refine ⟨?_, ?_⟩
  · rw [or_le_iff]
    intro r a hm
    rcases List.mem_cons.1 hm with h | h
    · cases h
      exact le_or_of_mem (lit_num_le_number _)
        (List.mem_cons_of_mem _ (List.mem_singleton.mpr rfl))
    · cases List.mem_singleton.1 h
      exact arm_le_or (List.mem_cons_of_mem _ (List.mem_singleton.mpr rfl))
  · intro ⟨_, h⟩
    have h2 := (h [] _ _ rfl (by decide) rfl .null (.num (.integer (.of 2)))
      ((output_iff (by decide) _).1 (by decide))).2
    have h1 : Output env .null (normalise (.or [(1, .lit (.num (.integer (.of 1)))), (0, .number)]))
        (.num (.integer (.of 1))) :=
      (output_iff (by decide) _).1 (by decide)
    exact absurd (output_unique _ _ _ h2 h1) (by decide)

/-- A rider keeps the default its value declares: `meta(*2 | number,
{})` is not below `*1 | number` under `defaults`, as `*2 | number` is
not. -/
theorem defaults_sees_through_riders :
    ¬ DefaultsLe env (.ride .metadata (.or [(1, .lit (.num (.integer (.of 2)))), (0, .number)]) [])
      (.or [(1, .lit (.num (.integer (.of 1)))), (0, .number)]) := by
  intro ⟨_, h⟩
  have h2 := (h [] _ _ rfl (by decide) rfl .null (.num (.integer (.of 2)))
    ((output_iff (by decide) _).1 (by decide))).2
  have h1 : Output env .null (normalise (.or [(1, .lit (.num (.integer (.of 1)))), (0, .number)]))
      (.num (.integer (.of 1))) :=
    (output_iff (by decide) _).1 (by decide)
  exact absurd (output_unique _ _ _ h2 h1) (by decide)

/-! ## Deciding the profiles

`defaults` and `gen` ask more than the order, at every position both
normal forms have, so each is decided by walking the positions of the
specific side beside the general side's: `defaultsAt` and `marksAt`
decide what each asks at one position, and a walk that fails nowhere,
where `leDecF` proves the order, proves the profile's order. One
position where what the profile asks fails refutes it. -/

/-- What `defaults` asks at one position, decided: where the specific
side declares a default that singles out a value, the general side
declares one that singles out the same. -/
def defaultsAt (a b : Val) : Bool :=
  !a.declaresDefault ||
    (decide (normalise a).Checkable &&
      match output a with
      | some j => b.declaresDefault && decide (normalise b).Checkable && decide (output b = some j)
      | none => true)

theorem defaultsAt_sound {a b : Val} (h : defaultsAt a b = true) (hd : a.declaresDefault = true)
    {root j : Data} (hj : Output env root a j) : b.declaresDefault = true ∧ Output env root b j := by
  simp only [defaultsAt, hd, Bool.not_true, Bool.false_or, Bool.and_eq_true,
    decide_eq_true_eq] at h
  obtain ⟨ha, h⟩ := h
  rw [(output_iff ha j).2 hj] at h
  simp only [Bool.and_eq_true, decide_eq_true_eq] at h
  obtain ⟨⟨hbd, hb⟩, ho⟩ := h
  exact ⟨hbd, (output_iff hb j).1 ho⟩

mutual
/-- `defaultsAt` at every position below the root that both terms
have, as `Val.at` reads them. -/
def defaultsBelow : Val → Val → Bool
  | .ride _ v _, b => defaultsBelow v b
  | .link v _, b => defaultsBelow v b
  | .map fs _ _, b =>
    match b.unride with
    | .map gs _ _ => defaultsFields fs gs
    | _ => true
  | .list items _ _, b =>
    match b.unride with
    | .list hs _ _ => defaultsItems items hs
    | _ => true
  | _, _ => true

def defaultsFields : List (String × Bool × Val) → List (String × Bool × Val) → Bool
  | [], _ => true
  | (k, _, v) :: fs, gs =>
    (match gs.find? (fun g => g.1 == k) with
      | some g => defaultsAt v g.2.2 && defaultsBelow v g.2.2
      | none => true) && defaultsFields fs gs

def defaultsItems : List Val → List Val → Bool
  | x :: xs, y :: ys => defaultsAt x y && defaultsBelow x y && defaultsItems xs ys
  | _, _ => true
end

theorem defaultsBelow_unride (a b : Val) : defaultsBelow a b = defaultsBelow a.unride b := by
  induction a using Val.unride.induct with
  | case1 k v r ih => simp only [defaultsBelow, Val.unride, ih]
  | case2 v t ih => simp only [defaultsBelow, Val.unride, ih]
  | case3 v h1 h2 => rw [Val.unride.eq_3 v h1 h2]

theorem defaultsFields_mem {fs gs : List (String × Bool × Val)} (h : defaultsFields fs gs = true)
    {f g : String × Bool × Val} (hf : f ∈ fs) (hg : gs.find? (fun g => g.1 == f.1) = some g) :
    defaultsAt f.2.2 g.2.2 = true ∧ defaultsBelow f.2.2 g.2.2 = true := by
  induction fs with
  | nil => exact nomatch hf
  | cons f' fs ih =>
    obtain ⟨k, o, v⟩ := f'
    simp only [defaultsFields, Bool.and_eq_true] at h
    rcases List.mem_cons.mp hf with rfl | hf
    · simpa only [hg, Bool.and_eq_true] using h.1
    · exact ih h.2 hf

theorem defaultsItems_get {xs ys : List Val} (h : defaultsItems xs ys = true) {i : ℕ} {x y : Val}
    (hx : xs[i]? = some x) (hy : ys[i]? = some y) :
    defaultsAt x y = true ∧ defaultsBelow x y = true := by
  induction xs generalizing ys i with
  | nil => simp at hx
  | cons x' xs ih =>
    cases ys with
    | nil => simp at hy
    | cons y' ys =>
      simp only [defaultsItems, Bool.and_eq_true] at h
      cases i with
      | zero =>
        simp only [List.getElem?_cons_zero, Option.some.injEq] at hx hy
        subst hx; subst hy
        exact h.1
      | succ i =>
        simp only [List.getElem?_cons_succ] at hx hy
        exact ih h.2 hx hy

/-- The walk is what `defaults` asks at every position both terms have. -/
theorem defaults_walk_sound : ∀ (p : List Seg) {a b wa wb : Val},
    defaultsAt a b = true → defaultsBelow a b = true →
    a.at p = some wa → b.at p = some wb → defaultsAt wa wb = true
  | [], _, _, _, _, h1, _, ha, hb => by
    simp only [Val.at, Option.some.injEq] at ha hb
    exact ha ▸ hb ▸ h1
  | .key k :: p, a, b, wa, wb, _, h2, ha, hb => by
    rw [defaultsBelow_unride] at h2
    simp only [Val.at] at ha hb
    split at ha
    · rename_i fs _ _ hau
      split at ha
      · rename_i f hf
        split at hb
        · rename_i gs _ _ hbu
          split at hb
          · rename_i g hg
            rw [hau] at h2
            simp only [defaultsBelow, hbu] at h2
            have hfk : f.1 = k := by simpa using List.find?_some hf
            obtain ⟨h1', h2'⟩ := defaultsFields_mem h2 (List.mem_of_find?_eq_some hf)
              (by rw [hfk]; exact hg)
            exact defaults_walk_sound p h1' h2' ha hb
          · exact absurd hb (by simp)
        · exact absurd hb (by simp)
      · exact absurd ha (by simp)
    · exact absurd ha (by simp)
  | .idx i :: p, a, b, wa, wb, _, h2, ha, hb => by
    rw [defaultsBelow_unride] at h2
    simp only [Val.at] at ha hb
    split at ha
    · rename_i items _ _ hau
      split at ha
      · rename_i x hx
        split at hb
        · rename_i hs _ _ hbu
          split at hb
          · rename_i y hy
            rw [hau] at h2
            simp only [defaultsBelow, hbu] at h2
            obtain ⟨h1', h2'⟩ := defaultsItems_get h2 hx hy
            exact defaults_walk_sound p h1' h2' ha hb
          · exact absurd hb (by simp)
        · exact absurd hb (by simp)
      · exact absurd ha (by simp)
    · exact absurd ha (by simp)
  | .var _ :: _, _, _, _, _, _, _, ha, _ => by simp [Val.at] at ha
  | .up _ :: _, _, _, _, _, _, _, ha, _ => by simp [Val.at] at ha
  | .node :: _, _, _, _, _, _, _, ha, _ => by simp [Val.at] at ha
  | .lands _ :: _, _, _, _, _, _, _, ha, _ => by simp [Val.at] at ha
  | .own n :: p, a, b, wa, wb, _, h2, ha, hb => by
    rw [defaultsBelow_unride] at h2
    simp only [Val.at] at ha hb
    split at ha
    · rename_i fs _ _ hau
      split at ha
      · rename_i f hf
        split at hb
        · rename_i gs _ _ hbu
          split at hb
          · rename_i g hg
            rw [hau] at h2
            simp only [defaultsBelow, hbu] at h2
            have hfk : f.1 = "%" ++ n := by simpa using List.find?_some hf
            obtain ⟨h1', h2'⟩ := defaultsFields_mem h2 (List.mem_of_find?_eq_some hf)
              (by rw [hfk]; exact hg)
            exact defaults_walk_sound p h1' h2' ha hb
          · exact absurd hb (by simp)
        · exact absurd hb (by simp)
      · exact absurd ha (by simp)
    · exact absurd ha (by simp)

/-- The `defaults` profile's order where the order holds and the walk
fails nowhere. -/
theorem defaultsLe_of_walk {a b : Val} (hle : a ⊑[env] b)
    (h1 : defaultsAt (normalise a) (normalise b) = true)
    (h2 : defaultsBelow (normalise a) (normalise b) = true) : DefaultsLe env a b :=
  ⟨hle, fun p _ _ ha hd hb _ _ hj => defaultsAt_sound (defaults_walk_sound p h1 h2 ha hb) hd hj⟩

/-- A position where the specific side declares a default that singles
out a value the general side does not single out by a default. -/
def defaultsRefutesAt (a b : Val) (p : List Seg) : Bool :=
  match (normalise a).at p, (normalise b).at p with
  | some wa, some wb =>
    wa.declaresDefault && decide (normalise wa).Checkable &&
      match output wa with
      | some j => !wb.declaresDefault ||
          (decide (normalise wb).Checkable && !decide (output wb = some j))
      | none => false
  | _, _ => false

theorem not_defaultsLe_of_refutes {a b : Val} {p : List Seg} (h : defaultsRefutesAt a b p = true) :
    ¬ DefaultsLe env a b := by
  intro ⟨_, hD⟩
  simp only [defaultsRefutesAt] at h
  split at h
  · rename_i wa wb ha hb
    simp only [Bool.and_eq_true, decide_eq_true_eq] at h
    obtain ⟨⟨hd, hA⟩, h⟩ := h
    split at h
    · rename_i j hj
      have hO := hD p wa wb ha hd hb .null j ((output_iff hA j).1 hj)
      simp only [Bool.or_eq_true, Bool.not_eq_true', Bool.and_eq_true, decide_eq_true_eq,
        decide_eq_false_iff_not] at h
      rcases h with h | ⟨hB, hne⟩
      · exact absurd hO.1 (by simp [h])
      · exact hne ((output_iff hB j).2 hO.2)
    · exact absurd h (by simp)
  · exact absurd h (by simp)

/-- What `gen` asks beyond `defaults` at one position, decided: the two
carry the same marks. -/
def marksAt (a b : Val) : Bool :=
  a.hasMark .type == b.hasMark .type && a.hasMark .hide == b.hasMark .hide

mutual
/-- `marksAt` at every position below the root that both terms have, as
`Val.atM` reads them, a spread's among them. -/
def marksBelow : Val → Val → Bool
  | .ride _ v _, b => marksBelow v b
  | .link v _, b => marksBelow v b
  | .map fs s _, b =>
    match b.unride with
    | .map gs t _ => marksFields fs gs && marksSpread s t
    | .list _ t _ => marksSpread s t
    | _ => true
  | .list items s _, b =>
    match b.unride with
    | .list hs t _ => marksItems items hs && marksSpread s t
    | .map _ t _ => marksSpread s t
    | _ => true
  | _, _ => true

def marksFields : List (String × Bool × Val) → List (String × Bool × Val) → Bool
  | [], _ => true
  | (k, _, v) :: fs, gs =>
    (match gs.find? (fun g => g.1 == k) with
      | some g => marksAt v g.2.2 && marksBelow v g.2.2
      | none => true) && marksFields fs gs

def marksItems : List Val → List Val → Bool
  | x :: xs, y :: ys => marksAt x y && marksBelow x y && marksItems xs ys
  | _, _ => true

def marksSpread : Option Val → Option Val → Bool
  | some x, some y => marksAt x y && marksBelow x y
  | _, _ => true
end

theorem marksBelow_unride (a b : Val) : marksBelow a b = marksBelow a.unride b := by
  induction a using Val.unride.induct with
  | case1 k v r ih => simp only [marksBelow, Val.unride, ih]
  | case2 v t ih => simp only [marksBelow, Val.unride, ih]
  | case3 v h1 h2 => rw [Val.unride.eq_3 v h1 h2]

theorem marksFields_mem {fs gs : List (String × Bool × Val)} (h : marksFields fs gs = true)
    {f g : String × Bool × Val} (hf : f ∈ fs) (hg : gs.find? (fun g => g.1 == f.1) = some g) :
    marksAt f.2.2 g.2.2 = true ∧ marksBelow f.2.2 g.2.2 = true := by
  induction fs with
  | nil => exact nomatch hf
  | cons f' fs ih =>
    obtain ⟨k, o, v⟩ := f'
    simp only [marksFields, Bool.and_eq_true] at h
    rcases List.mem_cons.mp hf with rfl | hf
    · simpa only [hg, Bool.and_eq_true] using h.1
    · exact ih h.2 hf

theorem marksItems_get {xs ys : List Val} (h : marksItems xs ys = true) {i : ℕ} {x y : Val}
    (hx : xs[i]? = some x) (hy : ys[i]? = some y) :
    marksAt x y = true ∧ marksBelow x y = true := by
  induction xs generalizing ys i with
  | nil => simp at hx
  | cons x' xs ih =>
    cases ys with
    | nil => simp at hy
    | cons y' ys =>
      simp only [marksItems, Bool.and_eq_true] at h
      cases i with
      | zero =>
        simp only [List.getElem?_cons_zero, Option.some.injEq] at hx hy
        subst hx; subst hy
        exact h.1
      | succ i =>
        simp only [List.getElem?_cons_succ] at hx hy
        exact ih h.2 hx hy

/-- The spread of a container, the riders around it read through. -/
def Val.spreadOf (v : Val) : Option Val :=
  match v.unride with
  | .map _ (some s) _ | .list _ (some s) _ => some s
  | _ => none

theorem Val.atM_spread (v : Val) (p : List MarkSeg) :
    v.atM (.spread :: p) = v.spreadOf.bind (·.atM p) := by
  simp only [Val.atM, Val.spreadOf]
  split <;> (try split) <;> simp_all

theorem marksBelow_spreadOf {a b s t : Val} (h : marksBelow a b = true)
    (hs : a.spreadOf = some s) (ht : b.spreadOf = some t) :
    marksAt s t = true ∧ marksBelow s t = true := by
  rw [marksBelow_unride] at h
  simp only [Val.spreadOf] at hs ht
  split at hs <;> split at ht <;> simp_all [marksBelow, marksSpread]

/-- The walk is what `gen` asks beyond `defaults` at every position both
terms have. -/
theorem marks_walk_sound : ∀ (p : List MarkSeg) {a b wa wb : Val},
    marksAt a b = true → marksBelow a b = true →
    a.atM p = some wa → b.atM p = some wb → marksAt wa wb = true
  | [], _, _, _, _, h1, _, ha, hb => by
    simp only [Val.atM, Option.some.injEq] at ha hb
    exact ha ▸ hb ▸ h1
  | .key k :: p, a, b, wa, wb, _, h2, ha, hb => by
    rw [marksBelow_unride] at h2
    simp only [Val.atM] at ha hb
    split at ha
    · rename_i fs _ _ hau
      split at ha
      · rename_i f hf
        split at hb
        · rename_i gs _ _ hbu
          split at hb
          · rename_i g hg
            rw [hau] at h2
            simp only [marksBelow, hbu, Bool.and_eq_true] at h2
            have hfk : f.1 = k := by simpa using List.find?_some hf
            obtain ⟨h1', h2'⟩ := marksFields_mem h2.1 (List.mem_of_find?_eq_some hf)
              (by rw [hfk]; exact hg)
            exact marks_walk_sound p h1' h2' ha hb
          · exact absurd hb (by simp)
        · exact absurd hb (by simp)
      · exact absurd ha (by simp)
    · exact absurd ha (by simp)
  | .idx i :: p, a, b, wa, wb, _, h2, ha, hb => by
    rw [marksBelow_unride] at h2
    simp only [Val.atM] at ha hb
    split at ha
    · rename_i items _ _ hau
      split at ha
      · rename_i x hx
        split at hb
        · rename_i hs _ _ hbu
          split at hb
          · rename_i y hy
            rw [hau] at h2
            simp only [marksBelow, hbu, Bool.and_eq_true] at h2
            obtain ⟨h1', h2'⟩ := marksItems_get h2.1 hx hy
            exact marks_walk_sound p h1' h2' ha hb
          · exact absurd hb (by simp)
        · exact absurd hb (by simp)
      · exact absurd ha (by simp)
    · exact absurd ha (by simp)
  | .spread :: p, a, b, wa, wb, _, h2, ha, hb => by
    rw [Val.atM_spread] at ha hb
    obtain ⟨s, hs, ha⟩ := Option.bind_eq_some_iff.mp ha
    obtain ⟨t, ht, hb⟩ := Option.bind_eq_some_iff.mp hb
    obtain ⟨h1', h2'⟩ := marksBelow_spreadOf h2 hs ht
    exact marks_walk_sound p h1' h2' ha hb

/-- The `gen` profile's order where the `defaults` profile's holds and
the walk of the marks fails nowhere. -/
theorem genLe_of_walk {a b : Val} (hd : DefaultsLe env a b)
    (h1 : marksAt (normalise a) (normalise b) = true)
    (h2 : marksBelow (normalise a) (normalise b) = true) : GenLe env a b := by
  refine ⟨hd, fun p wa wb ha hb => ?_⟩
  have h := marks_walk_sound p h1 h2 ha hb
  simp only [marksAt, Bool.and_eq_true, beq_iff_eq] at h
  exact h

/-- A position where the two carry different marks. -/
def marksRefuteAt (a b : Val) (p : List MarkSeg) : Bool :=
  match (normalise a).atM p, (normalise b).atM p with
  | some wa, some wb => !marksAt wa wb
  | _, _ => false

theorem not_genLe_of_refutes {a b : Val} {p : List MarkSeg} (h : marksRefuteAt a b p = true) :
    ¬ GenLe env a b := by
  intro ⟨_, hM⟩
  simp only [marksRefuteAt] at h
  split at h
  · rename_i wa wb ha hb
    have := hM p wa wb ha hb
    simp [marksAt, this.1, this.2] at h
  · exact absurd h (by simp)

end

/-! ## The order on documents

`aontu subsume` compares two documents, each read under its own
declarations, so the order on documents reads each side as `vet` does:
its term expanded and its selections made, under the environment of its
expanded bodies. The reference's row for recursive positions, that a
recursion and its unrolling subsume each other, is a fact of `Le` under
that environment, and a document whose reading reads no name decides as
its reading does under the empty environment. -/

/-- An instance of a document: of its term as read under its declarations. -/
def InstanceD (ds : Decls) (S : Val) (j : Data) : Prop := Instance ds.envE (ds.readR S) j

/-- The order on documents: every instance of the specific document is
one of the general document, each read under its own declarations. -/
def LeD (dg : Decls) (g : Val) (ds : Decls) (s : Val) : Prop :=
  ∀ j, InstanceD ds s j → InstanceD dg g j

theorem LeD.refl (ds : Decls) (S : Val) : LeD ds S ds S := fun _ h => h

/-- The contract on `aontu subsume` over documents: `subsumes` only where
the order holds, `doesNotSubsume` only where it fails, and `undecided`
anywhere. -/
def SubsumeCorrectD (subsume : Decls → Val → Decls → Val → Subsumption) : Prop :=
  ∀ dg g ds s,
    (subsume dg g ds s = .subsumes → LeD dg g ds s) ∧
    (subsume dg g ds s = .doesNotSubsume → ¬ LeD dg g ds s)

/-- A term that reads no name, no path, no pattern and no format has the
same instances under every environment: the checker reads none of them. -/
theorem instance_of_checkable {env env' : Env} {v : Val} (hv : v.Checkable) {j : Data}
    (h : Instance env v j) : Instance env' v j :=
  ⟨h.1, (check_iff (env := env') (root := j) hv j).1 ((check_iff (env := env) (root := j) hv j).2 h.2)⟩

/-- Two documents whose readings read no name are ordered as their
readings are under the empty environment. -/
theorem leD_of_le {dg ds : Decls} {g s : Val} (hg : (dg.readR g).Checkable)
    (hs : (ds.readR s).Checkable) (h : ds.readR s ⊑[.empty] dg.readR g) : LeD dg g ds s :=
  fun j hj => instance_of_checkable hg (h j (instance_of_checkable hs hj))

/-- A recursion and its unrolling subsume each other: a reference to a
name is below the expansion of the name's body, under the document's
environment. -/
theorem alias_le_unroll {ds : Decls} {n : String} {body : Val} (h : ds.env n = some body) :
    .alias n ⊑[ds.envE] expand ds body :=
  fun _ ⟨hw, hj⟩ => ⟨hw, (admits_alias_iff h).1 hj⟩

/-- And above it. -/
theorem unroll_le_alias {ds : Decls} {n : String} {body : Val} (h : ds.env n = some body) :
    expand ds body ⊑[ds.envE] .alias n :=
  fun _ ⟨hw, hj⟩ => ⟨hw, (admits_alias_iff h).2 hj⟩

/-- An instance of the specific document the general one refuses puts the
specific outside the order; `checkR` reads each side under its own
declarations, so a witness is found by running it. -/
theorem not_leD_of_witness {dg ds : Decls} {g s : Val} {j : Data}
    (hgg : dg.Guarded) (hgb : ∀ d, d ∈ dg → d.2.CheckableA) (hgv : (dg.readR g).CheckableA)
    (hsg : ds.Guarded) (hsb : ∀ d, d ∈ ds → d.2.CheckableA) (hsv : (ds.readR s).CheckableA)
    (hj : j.WellFormed) (h1 : checkR ds (ds.readR s) j = true)
    (h2 : checkR dg (dg.readR g) j = false) : ¬ LeD dg g ds s := by
  intro hle
  have hi : InstanceD ds s j := ⟨hj, (checkR_iff (root := j) hsg hsb hsv j).1 h1⟩
  have hg' := (checkR_iff (root := j) hgg hgb hgv j).2 (hle j hi).2
  rw [h2] at hg'
  exact nomatch hg'

/-- The order on documents decided where both readings read no name:
`leDecF` under the empty environment, with its proof. -/
def leDecD (n : ℕ) (dg : Decls) (g : Val) (ds : Decls) (s : Val) : Option (PLift (LeD dg g ds s)) :=
  if hg : (dg.readR g).checkableB = true then
    if hs : (ds.readR s).checkableB = true then
      match leDecF .empty n (ds.readR s) (dg.readR g) with
      | some ⟨h⟩ =>
        some ⟨leD_of_le ((Val.checkableB_iff _).1 hg) ((Val.checkableB_iff _).1 hs) h⟩
      | none => none
    else none
  else none

/-! ## Two recursions

`leDecD` decides the order where neither reading reads a name. A name
that refers to itself has no end to read to, so the comparison of two
recursions assumes the pair of names it is asked about while it compares
their bodies, and answers a pair met again below a key or an element by
that assumption. Every value is a finite tree, so the assumption is
only ever read on a lighter value than the one it was made for, which is
what the proof of `leCo_sound` goes by: induction on the value's weight.
Two recursions of one shape are ordered whatever their names are, a
recursion and its unrolling both ways, and a recursion below a wider one
of its shape. -/

/-- The order on two terms that read no name, where `leDecF` decides it. -/
def leBase (g s : Val) : Bool :=
  g.checkableB && s.checkableB && (leDecF .empty 64 s g).isSome

/-- What a specific container holds beyond the members it writes, held
to `t`: its spread compared with `t`, or nothing where it is sealed, or
anything, which only `any` admits. -/
def leRest (r : Val → Val → Bool) (t : Val) (ssp : Option Val) (sc : Bool) : Bool :=
  match ssp with
  | some t' => !t'.keyed && r t t'
  | none => sc || t.isAny

/-- A map's members compared, `r` comparing two terms: each member the
general map declares is required by the specific where the general
requires it, and its term compared with the specific's, or with what the
specific holds beyond its members; a general spread that reads no key is
compared with every member of the specific and with what it holds beyond
them; and a sealed general map declares every key a sealed specific
does. -/
def leMembers (r : Val → Val → Bool) (gfs : List (String × Bool × Val)) (gsp : Option Val)
    (gc : Bool) (sfs : List (String × Bool × Val)) (ssp : Option Val) (sc : Bool) : Bool :=
  gfs.all (fun f =>
    (f.2.1 || sfs.any (fun f' => f'.1 == f.1 && !f'.2.1)) &&
    (match sfs.find? (fun f' => f'.1 == f.1) with
      | some f' => r f.2.2 f'.2.2
      | none => leRest r f.2.2 ssp sc)) &&
  (match gsp with
    | none => true
    | some t => !t.keyed && sfs.all (fun f' => r t f'.2.2) && leRest r t ssp sc) &&
  (!gc || (sc && sfs.all (fun f' => gfs.any (fun f => f.1 == f'.1))))

/-- A list's elements compared: no more written in the general than in
the specific, each with the one at its position, a sealed general against
a sealed specific of its length, and a general spread that reads no key
against every element the specific writes and against its spread. -/
def leElems (r : Val → Val → Bool) (gis : List Val) (gsp : Option Val) (gc : Bool)
    (sis : List Val) (ssp : Option Val) (sc : Bool) : Bool :=
  decide (gis.length ≤ sis.length) &&
  (!(gc && gsp.isNone) || (sc && ssp.isNone && decide (sis.length = gis.length))) &&
  (gis.zip sis).all (fun p => r p.1 p.2) &&
  (match gsp with
    | none => true
    | some t => !t.keyed && sis.all (fun sv => r t sv) && leRest r t ssp sc)

/-- A turn of the order on two terms that may read names, the general
under `eg` and the specific under `es`, `r` making the turns after it. A
pair of names met is assumed ordered while their bodies are compared,
the rule Amadio and Cardelli give for recursive types. `cold` holds the
pairs assumed above a key or an element, which answer where they are met
again; `hot` holds those assumed since, which can't answer yet. -/
def leStep (eg es : Env)
    (r : List (String × String) → List (String × String) → Val → Val → Bool)
    (hot cold : List (String × String)) (g s : Val) : Bool :=
  leBase g s ||
  match g with
  | .any => true
  | .alias kg =>
    (match eg kg with
      | none => false
      | some bg =>
        match s with
        | .alias ks =>
          cold.contains (kg, ks) ||
            (match es ks with
              | some bs => r ((kg, ks) :: hot) cold bg bs
              | none => false)
        | _ => r hot cold bg s)
  | .meet a b => r hot cold a s && r hot cold b s
  | _ =>
    match s with
    | .alias ks =>
      (match es ks with
        | some bs => r hot cold g bs
        | none => false)
    | .or arms => arms.all fun a => r hot cold g a.2
    | .meet a b => r hot cold g a || r hot cold g b
    | _ =>
      match g with
      | .or arms => arms.any fun a => r hot cold a.2 s
      | .map gfs gsp gc =>
        (match s with
          | .map sfs ssp sc => leMembers (r [] (hot ++ cold)) gfs gsp gc sfs ssp sc
          | _ => false)
      | .list gis gsp gc =>
        (match s with
          | .list sis ssp sc => leElems (r [] (hot ++ cold)) gis gsp gc sis ssp sc
          | _ => false)
      | _ => false

/-- The order on two terms that may read names, within `n` turns. -/
def leCo (eg es : Env) : ℕ → List (String × String) → List (String × String) → Val → Val → Bool
  | 0, _, _, _, _ => false
  | n + 1, hot, cold, g, s => leStep eg es (leCo eg es n) hot cold g s

/-- The order on data no heavier than `w`, whatever root a path would
read: every such value the specific term admits, the general admits. -/
def HoldsTo (eg es : Env) (w : ℕ) (g s : Val) : Prop :=
  ∀ root j, j.weight ≤ w → j.WellFormed → Admits es root s j → Admits eg root g j

theorem HoldsTo.mono {eg es : Env} {w w' : ℕ} {g s : Val} (h : HoldsTo eg es w g s) (hw : w' ≤ w) :
    HoldsTo eg es w' g s :=
  fun root j hj => h root j (Nat.le_trans hj hw)

theorem holdsTo_of_base {eg es : Env} {g s : Val} (h : leBase g s = true) (w : ℕ) :
    HoldsTo eg es w g s := by
  simp only [leBase, Bool.and_eq_true] at h
  obtain ⟨⟨hg, hs⟩, hd⟩ := h
  have hg' := (Val.checkableB_iff g).1 hg
  have hs' := (Val.checkableB_iff s).1 hs
  have hle : s ⊑[.empty] g := leDecF_sound hd
  intro root j _ hj ha
  have h1 : Instance .empty s j :=
    ⟨hj, (check_iff (env := .empty) (root := j) hs' j).1 ((check_iff (env := es) (root := root) hs' j).2 ha)⟩
  exact (check_iff (env := eg) (root := root) hg' j).1
    ((check_iff (env := .empty) (root := j) hg' j).2 (hle j h1).2)

theorem admits_map_data {env : Env} {root : Data} {fs : List (String × Bool × Val)} {sp : Option Val}
    {c : Bool} {j : Data} (h : Admits env root (.map fs sp c) j) : ∃ jfs, j = .map jfs := by
  cases h with
  | map _ _ _ _ => exact ⟨_, rfl⟩

theorem admits_list_data {env : Env} {root : Data} {is : List Val} {sp : Option Val}
    {c : Bool} {j : Data} (h : Admits env root (.list is sp c) j) : ∃ xs, j = .list xs := by
  cases h with
  | list _ _ _ _ => exact ⟨_, rfl⟩

/-- A map's members compared soundly: where `r` is sound on every value
lighter than the map, the general map admits what the specific does. -/
theorem leMembers_sound {eg es : Env} {r : Val → Val → Bool} {gfs sfs : List (String × Bool × Val)}
    {gc sc : Bool} {gsp ssp : Option Val} {root : Data} {jfs : List (String × Data)}
    (hr : ∀ g s x, r g s = true → x.weight < (Data.map jfs).weight → x.WellFormed →
      Admits es root s x → Admits eg root g x)
    (h : leMembers r gfs gsp gc sfs ssp sc = true) (hj : (Data.map jfs).WellFormed)
    (ha : Admits es root (.map sfs ssp sc) (.map jfs)) :
    Admits eg root (.map gfs gsp gc) (.map jfs) := by
  rw [admits_map_iff] at ha ⊢
  obtain ⟨hs1, hs2, hs3, hs4⟩ := ha
  simp only [leMembers, Bool.and_eq_true, List.all_eq_true] at h
  obtain ⟨⟨hall, hspread⟩, hclosed⟩ := h
  obtain ⟨hnd, hwf⟩ : (jfs.map Prod.fst).Nodup ∧ ∀ k x, (k, x) ∈ jfs → x.WellFormed := by
    cases hj with
    | map hn hm => exact ⟨hn, hm⟩
  -- What the specific holds at a key it doesn't declare, the term `t` admits.
  have rest : ∀ t k x, leRest r t ssp sc = true → (k, x) ∈ jfs →
      (∀ o' v', (k, o', v') ∉ sfs) → Admits eg root t x := by
    intro t k x ht hm hno
    unfold leRest at ht
    split at ht
    · rename_i t'
      simp only [Bool.and_eq_true, Bool.not_eq_true'] at ht
      have := hs3 t' rfl k x hm
      rw [Val.atKey_of_keyed _ ht.1] at this
      exact hr t t' x ht.2 (Data.weight_lt_of_mem_members hm) (hwf k x hm) this
    · rcases (Bool.or_eq_true _ _).mp ht with hsc | hany
      · obtain ⟨o', v', hm'⟩ := hs4 hsc k x hm
        exact absurd hm' (hno o' v')
      · rw [isAny_eq hany]; exact .any
  refine ⟨fun k o v x hm hl => ?_, fun k o v hm hl => ?_, fun t ht k x hm => ?_, fun hgc k x hm => ?_⟩
  · have hf := (hall (k, o, v) hm).2
    simp only at hf
    split at hf
    · rename_i f' hfind
      have hk : f'.1 = k := by simpa using List.find?_some hfind
      have hmem : (k, f'.2.1, f'.2.2) ∈ sfs := by
        have := List.mem_of_find?_eq_some hfind
        rw [← hk]; exact this
      exact hr v f'.2.2 x hf (Data.weight_lt_of_lookup hl) (hwf k x (lookup_mem hl))
        (hs1 k f'.2.1 f'.2.2 x hmem hl)
    · rename_i hfind
      refine rest v k x hf (lookup_mem hl) fun o' v' hm' => ?_
      have := List.find?_eq_none.mp hfind (k, o', v') hm'
      simp at this
  · have hf := (hall (k, o, v) hm).1
    simp only at hf
    rcases (Bool.or_eq_true _ _).mp hf with ho | hreq
    · exact ho
    · obtain ⟨f', hm', hf'⟩ := List.any_eq_true.mp hreq
      simp only [Bool.and_eq_true, beq_iff_eq, Bool.not_eq_true'] at hf'
      have hmem : (k, false, f'.2.2) ∈ sfs := by
        rw [← hf'.1, ← hf'.2]; exact hm'
      exact absurd (hs2 k false f'.2.2 hmem hl) (by simp)
  · subst ht
    simp only [Bool.and_eq_true, Bool.not_eq_true', List.all_eq_true] at hspread
    obtain ⟨⟨hkey, hallS⟩, hrest⟩ := hspread
    rw [Val.atKey_of_keyed _ hkey]
    by_cases hd : ∃ o' v', (k, o', v') ∈ sfs
    · obtain ⟨o', v', hm'⟩ := hd
      have hl := lookup_eq_some_of_nodup hnd hm
      exact hr t v' x (hallS (k, o', v') hm') (Data.weight_lt_of_mem_members hm) (hwf k x hm)
        (hs1 k o' v' x hm' hl)
    · exact rest t k x hrest hm fun o' v' hm' => hd ⟨o', v', hm'⟩
  · rw [hgc] at hclosed
    simp only [Bool.not_true, Bool.false_or, Bool.and_eq_true, List.all_eq_true] at hclosed
    obtain ⟨o', v', hm'⟩ := hs4 hclosed.1 k x hm
    obtain ⟨f, hfm, hfk⟩ := List.any_eq_true.mp (hclosed.2 (k, o', v') hm')
    simp only [beq_iff_eq] at hfk
    exact ⟨f.2.1, f.2.2, by rw [← hfk]; exact hfm⟩

/-- A list's elements compared soundly, as `leMembers_sound` is for a
map's members. -/
theorem leElems_sound {eg es : Env} {r : Val → Val → Bool} {gis sis : List Val} {gsp ssp : Option Val}
    {gc sc : Bool} {root : Data} {xs : List Data}
    (hr : ∀ g s x, r g s = true → x.weight < (Data.list xs).weight → x.WellFormed →
      Admits es root s x → Admits eg root g x)
    (h : leElems r gis gsp gc sis ssp sc = true) (hj : (Data.list xs).WellFormed)
    (ha : Admits es root (.list sis ssp sc) (.list xs)) :
    Admits eg root (.list gis gsp gc) (.list xs) := by
  rw [admits_list_iff] at ha ⊢
  obtain ⟨hs1, hs2, hs3, hs4⟩ := ha
  simp only [leElems, Bool.and_eq_true, decide_eq_true_eq, List.all_eq_true] at h
  obtain ⟨⟨⟨hlen, hseal⟩, hzip⟩, hspread⟩ := h
  have hwf : ∀ x, x ∈ xs → x.WellFormed := by
    cases hj with
    | list hm => exact hm
  have hat : ∀ i, i < sis.length → ∃ sv, sis[i]? = some sv := fun i hi =>
    ⟨sis[i], List.getElem?_eq_getElem hi⟩
  refine ⟨Nat.le_trans hlen hs1, fun hgc hgsp => ?_, fun i v x hv hx => ?_, fun t ht i x hx => ?_⟩
  · rw [hgc, hgsp] at hseal
    simp only [Option.isNone_none, Bool.and_self, Bool.not_true, Bool.false_or, Bool.and_eq_true,
      Option.isNone_iff_eq_none, decide_eq_true_eq] at hseal
    rw [← hseal.2]
    exact hs2 hseal.1.1 hseal.1.2
  · have hi : i < gis.length := (List.getElem?_eq_some_iff.mp hv).1
    obtain ⟨sv, hsv⟩ := hat i (Nat.lt_of_lt_of_le hi hlen)
    have hz : (v, sv) ∈ gis.zip sis :=
      List.mem_of_getElem? (List.getElem?_zip_eq_some.mpr ⟨hv, hsv⟩)
    exact hr v sv x (hzip (v, sv) hz) (Data.weight_lt_of_getElem? hx) (hwf x (List.mem_of_getElem? hx))
      (hs3 i sv x hsv hx)
  · subst ht
    simp only [Bool.and_eq_true, Bool.not_eq_true', List.all_eq_true] at hspread
    obtain ⟨⟨hkey, hall⟩, hrest⟩ := hspread
    rw [Val.atKey_of_keyed _ hkey]
    have hxw := hwf x (List.mem_of_getElem? hx)
    by_cases hi : i < sis.length
    · obtain ⟨sv, hsv⟩ := hat i hi
      exact hr t sv x (hall sv (List.mem_of_getElem? hsv)) (Data.weight_lt_of_getElem? hx) hxw
        (hs3 i sv x hsv hx)
    · unfold leRest at hrest
      split at hrest
      · rename_i t'
        simp only [Bool.and_eq_true, Bool.not_eq_true'] at hrest
        have := hs4 t' rfl i x hx
        rw [Val.atKey_of_keyed _ hrest.1] at this
        exact hr t t' x hrest.2 (Data.weight_lt_of_getElem? hx) hxw this
      · rcases (Bool.or_eq_true _ _).mp hrest with hsc | hany
        · have hl := hs2 hsc rfl
          have := (List.getElem?_eq_some_iff.mp hx).1
          omega
        · rw [isAny_eq hany]; exact .any

/-- `leCo` is sound: where it answers yes with every pair in `cold`
ordered on data no heavier than `w` and every pair in `hot` ordered on
lighter data, the two terms are ordered on data no heavier than `w`. A
pair it assumes is ordered on lighter data by induction on the weight,
and it is only read again below a key or an element, on lighter data. -/
theorem leCo_sound (eg es : Env) : ∀ (n : ℕ) (hot cold : List (String × String)) (g s : Val),
    leCo eg es n hot cold g s = true → ∀ w,
    (∀ p ∈ cold, HoldsTo eg es w (.alias p.1) (.alias p.2)) →
    (∀ p ∈ hot, ∀ w' < w, HoldsTo eg es w' (.alias p.1) (.alias p.2)) →
    HoldsTo eg es w g s
  | 0, _, _, _, _, h => by simp [leCo] at h
  | n + 1, hot, cold, g, s, h => by
    have ih := leCo_sound eg es n
    have below : ∀ {w : ℕ} {x : Data} {g' s' : Val} {root : Data},
        (∀ p ∈ cold, HoldsTo eg es w (.alias p.1) (.alias p.2)) →
        (∀ p ∈ hot, ∀ w' < w, HoldsTo eg es w' (.alias p.1) (.alias p.2)) →
        leCo eg es n [] (hot ++ cold) g' s' = true → x.weight < w → x.WellFormed →
        Admits es root s' x → Admits eg root g' x := by
      intro w x g' s' root hcold hhot hr hx hxw hax
      refine ih _ _ _ _ hr x.weight (fun p hp => ?_) (fun p hp => nomatch hp) root x (Nat.le_refl _) hxw hax
      rcases List.mem_append.mp hp with hp | hp
      · exact hhot p hp _ hx
      · exact (hcold p hp).mono (Nat.le_of_lt hx)
    rw [leCo] at h
    unfold leStep at h
    rw [Bool.or_eq_true] at h
    rcases h with hb | h
    · exact fun w _ _ => holdsTo_of_base hb w
    · split at h
      · exact fun w _ _ root j _ _ _ => .any
      · rename_i kg
        split at h
        · exact absurd h (by simp)
        · rename_i bg heg
          split at h
          · rename_i ks
            rcases (Bool.or_eq_true _ _).mp h with hc | h
            · intro w hcold _
              exact hcold (kg, ks) (by simpa using hc)
            · split at h
              · rename_i bs hes
                intro w
                induction w using Nat.strongRecOn with
                | ind w ihw =>
                  intro hcold hhot
                  have hpair : ∀ w' < w, HoldsTo eg es w' (.alias kg) (.alias ks) := fun w' hw' =>
                    ihw w' hw' (fun p hp => (hcold p hp).mono (Nat.le_of_lt hw'))
                      (fun p hp w'' hw'' => hhot p hp w'' (Nat.lt_trans hw'' hw'))
                  have hb := ih _ _ _ _ h w hcold (by
                    intro p hp w' hw'
                    rcases List.mem_cons.mp hp with rfl | hp
                    · exact hpair w' hw'
                    · exact hhot p hp w' hw')
                  intro root j hjw hj ha
                  cases ha with
                  | alias he hb' =>
                    rw [hes] at he; cases he
                    exact .alias heg (hb root j hjw hj hb')
              · exact absurd h (by simp)
          · intro w hcold hhot root j hjw hj ha
            exact .alias heg (ih _ _ _ _ h w hcold hhot root j hjw hj ha)
      · rename_i a b
        rw [Bool.and_eq_true] at h
        intro w hcold hhot root j hjw hj ha
        exact .meet (ih _ _ _ _ h.1 w hcold hhot root j hjw hj ha)
          (ih _ _ _ _ h.2 w hcold hhot root j hjw hj ha)
      · split at h
        · rename_i ks
          split at h
          · rename_i bs hes
            intro w hcold hhot root j hjw hj ha
            cases ha with
            | alias he hb' =>
              rw [hes] at he; cases he
              exact ih _ _ _ _ h w hcold hhot root j hjw hj hb'
          · exact absurd h (by simp)
        · rename_i arms
          rw [List.all_eq_true] at h
          intro w hcold hhot root j hjw hj ha
          obtain ⟨r, a, hm, haa⟩ := admits_or_iff.mp ha
          exact ih _ _ _ _ (h (r, a) hm) w hcold hhot root j hjw hj haa
        · rename_i a b
          intro w hcold hhot root j hjw hj ha
          obtain ⟨ha1, ha2⟩ := admits_meet_iff.mp ha
          rcases (Bool.or_eq_true _ _).mp h with h | h
          · exact ih _ _ _ _ h w hcold hhot root j hjw hj ha1
          · exact ih _ _ _ _ h w hcold hhot root j hjw hj ha2
        · split at h
          · rename_i arms
            obtain ⟨a, hm, haa⟩ := List.any_eq_true.mp h
            intro w hcold hhot root j hjw hj ha
            exact admits_or_iff.mpr ⟨a.1, a.2, hm, ih _ _ _ _ haa w hcold hhot root j hjw hj ha⟩
          · rename_i gfs gsp gc
            split at h
            · rename_i sfs ssp sc
              intro w hcold hhot root j hjw hj ha
              obtain ⟨jfs, rfl⟩ := admits_map_data ha
              exact leMembers_sound (fun g' s' x hr hx hxw hax =>
                below hcold hhot hr (Nat.lt_of_lt_of_le hx hjw) hxw hax) h hj ha
            · exact absurd h (by simp)
          · rename_i gis gsp gc
            split at h
            · rename_i sis ssp sc
              intro w hcold hhot root j hjw hj ha
              obtain ⟨xs, rfl⟩ := admits_list_data ha
              exact leElems_sound (fun g' s' x hr hx hxw hax =>
                below hcold hhot hr (Nat.lt_of_lt_of_le hx hjw) hxw hax) h hj ha
            · exact absurd h (by simp)
          · exact absurd h (by simp)

/-- The order on documents decided through their names: `leCo` on the two
readings, each under its own environment, with its proof. -/
def leCoD (n : ℕ) (dg : Decls) (g : Val) (ds : Decls) (s : Val) : Option (PLift (LeD dg g ds s)) :=
  if h : leCo dg.envE ds.envE n [] [] (dg.readR g) (ds.readR s) = true then
    some ⟨fun j hj => ⟨hj.1, leCo_sound dg.envE ds.envE n [] [] _ _ h j.weight
      (fun _ hp => nomatch hp) (fun _ hp => nomatch hp) j j (Nat.le_refl _) hj.1 hj.2⟩⟩
  else none

/-- Where `leCoD` answers, the order holds. -/
theorem leCoD_sound {n : ℕ} {dg ds : Decls} {g s : Val} (h : (leCoD n dg g ds s).isSome = true) :
    LeD dg g ds s :=
  match hd : leCoD n dg g ds s with
  | some ⟨hle⟩ => hle
  | none => by rw [hd] at h; exact nomatch h

end Aontu
