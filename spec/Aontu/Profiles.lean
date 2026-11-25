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

end Aontu
