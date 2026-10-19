import Aontu.Output
import Aontu.Paths

/-!
# The profiles of subsumption

`aontu subsume general specific` answers under one of three profiles,
and each is a question of the order. `values` asks `Le`: whether every
instance of the specific document is an instance of the general.
`defaults` asks that, and that every value the specific side singles
out at a position, the general side singles out there too, so that a
default survives into the general side unchanged. `gen` asks that, and
that the marks agree, which are not yet terms of the definition and
enter its contract as a predicate. Each profile has one contract, of
the shape `SubsumeCorrect` gives the first, and the rows of the
reference's table, "Rules, by value former", are theorems of `Le`
here: the scalars, the kinds, the bounds under the kinds that cover
their domains, disjunction, preference and the meet. The containers
follow.
-/

namespace Aontu

section
variable {env : Env}

/-! ## The table: the ends -/

/-- `nil` on the general side admits nothing, so only a specific side
that admits nothing is below it: the reference's `compat_narrowed`. -/
theorem le_nil_iff (a : Val) : a ⊑[env] .nil ↔ ∀ j, ¬ Instance env a j := by
  constructor
  · intro h j hj
    exact nomatch (h j hj).2
  · intro h j hj
    exact (h j hj).elim

/-- `any` on the specific side admits every value, so the general side
must too. -/
theorem any_le_iff (b : Val) : .any ⊑[env] b ↔ ∀ j, j.WellFormed → Admits env j b j :=
  ⟨fun h j hw => (h j ⟨hw, .any⟩).2, fun h j hj => ⟨hj.1, h j hj.1⟩⟩

/-! ## The table: the kinds -/

/-- A number of each leaf. -/
def Leaf.some : Leaf → Number
  | .integer => .integer (.of 0)
  | .float => .float ⟨false, 0, 0, by decide, by decide, fun h => nomatch h⟩
  | .biginteger => .biginteger ⟨0⟩
  | .bigdecimal => .bigdecimal (.of 0 0)

theorem Leaf.some_leaf (l : Leaf) : l.some.leaf = l := by cases l <;> rfl

/-- A leaf other than the one given. -/
def Leaf.other : Leaf → Leaf
  | .integer => .float
  | _ => .integer

theorem Leaf.other_ne (l : Leaf) : l.other ≠ l := by cases l <;> decide

/-- A leaf's kind admits a number exactly when the number is of that
leaf. -/
theorem admits_leaf_iff {root : Data} (l : Leaf) (x : Number) :
    Admits env root l.kind (.num x) ↔ x.leaf = l := by
  constructor
  · intro h
    cases l <;> cases x <;> first | rfl | cases h
  · intro h
    cases l <;> cases x <;> first
      | exact .integer | exact .float | exact .biginteger | exact .bigdecimal | exact nomatch h

/-- `number` is above each leaf: `number ⊒ integer`. -/
theorem leaf_le_number (l : Leaf) : l.kind ⊑[env] .number := by
  intro j ⟨hw, h⟩
  refine ⟨hw, ?_⟩
  cases l <;> cases h <;> exact .number

/-- No leaf is above `number`: a number of another leaf shows it. -/
theorem number_not_le_leaf (l : Leaf) : ¬ (.number ⊑[env] l.kind) := by
  intro h
  have e := (admits_leaf_iff l _).1 (h (.num l.other.some) ⟨.num, .number⟩).2
  rw [Leaf.some_leaf] at e
  exact Leaf.other_ne l e

/-- Two leaves are below each other only when they are one: the leaves
are disjoint. -/
theorem leaf_le_leaf_iff (l m : Leaf) : l.kind ⊑[env] m.kind ↔ l = m := by
  constructor
  · intro h
    have e := (admits_leaf_iff m _).1
      (h (.num l.some) ⟨.num, (admits_leaf_iff l _).2 (Leaf.some_leaf l)⟩).2
    exact (Leaf.some_leaf l).symm.trans e
  · rintro rfl
    exact Le.refl env _

/-- `string & empty()` is above `string`. -/
theorem string_le_anyString : .string ⊑[env] .anyString := by
  intro j ⟨hw, h⟩
  cases h with | string _ => exact ⟨hw, .anyString⟩

/-- `string` is not above `string & empty()`: `""` shows it. -/
theorem anyString_not_le_string : ¬ (.anyString ⊑[env] .string) := by
  intro h
  have h' := (h (.str "") ⟨.str, .anyString⟩).2
  cases h' with | string hne => exact hne rfl

/-! ## The table: the literals -/

theorem Scalar.data_wf (s : Scalar) : s.data.WellFormed := by cases s <;> constructor

theorem Scalar.data_inj {s t : Scalar} (h : s.data = t.data) : s = t := by
  cases s <;> cases t <;> simp [Scalar.data] at h <;> simp [h]

/-- A concrete value subsumes only itself, its leaf included: `1` is
not above `1.0`. -/
theorem lit_le_lit_iff (s t : Scalar) : .lit s ⊑[env] .lit t ↔ s = t := by
  constructor
  · intro h
    exact Scalar.data_inj (admits_lit_iff.1 (h s.data ⟨s.data_wf, admits_lit_iff.2 rfl⟩).2)
  · rintro rfl
    exact Le.refl env _

/-- A number's leaf is above the number, and `number` above both. -/
theorem lit_num_le_leaf (x : Number) : .lit (.num x) ⊑[env] x.leaf.kind := by
  intro j ⟨hw, h⟩
  refine ⟨hw, ?_⟩
  cases h
  cases x <;> first | exact .integer | exact .float | exact .biginteger | exact .bigdecimal

theorem lit_num_le_number (x : Number) : .lit (.num x) ⊑[env] .number :=
  (lit_num_le_leaf x).trans (leaf_le_number _)

theorem lit_str_le_anyString (s : String) : .lit (.str s) ⊑[env] .anyString := by
  intro j ⟨hw, h⟩
  cases h
  exact ⟨hw, .anyString⟩

/-- `string` is above a string literal other than `""`, which only
`string & empty()` is above. -/
theorem lit_str_le_string {s : String} (hs : s ≠ "") : .lit (.str s) ⊑[env] .string := by
  intro j ⟨hw, h⟩
  cases h
  exact ⟨hw, .string hs⟩

theorem lit_bool_le_boolean (b : Bool) : .lit (.bool b) ⊑[env] .boolean := by
  intro j ⟨hw, h⟩
  cases h
  exact ⟨hw, .boolean⟩

/-! ## The table: a kind over a residual

A kind covers a residual whose domain it admits whole: `number` every
bound with a number at its end and every `multiple`, and
`string & empty()` every bound with a string at its end, every pattern
and every format. `string` covers none of the last three, since each
may admit `""`. -/

theorem min_num_le_number (n : Number) : .min (.num n) ⊑[env] .number := by
  intro j ⟨hw, h⟩
  cases h with | min _ => exact ⟨hw, .number⟩

theorem max_num_le_number (n : Number) : .max (.num n) ⊑[env] .number := by
  intro j ⟨hw, h⟩
  cases h with | max _ => exact ⟨hw, .number⟩

theorem above_num_le_number (n : Number) : .above (.num n) ⊑[env] .number := by
  intro j ⟨hw, h⟩
  cases h with | above _ => exact ⟨hw, .number⟩

theorem beneath_num_le_number (n : Number) : .beneath (.num n) ⊑[env] .number := by
  intro j ⟨hw, h⟩
  cases h with | beneath _ => exact ⟨hw, .number⟩

theorem multiple_le_number (d : Number) : .multiple d ⊑[env] .number := by
  intro j ⟨hw, h⟩
  cases h with | multiple _ _ => exact ⟨hw, .number⟩

theorem min_str_le_anyString (t : String) : .min (.str t) ⊑[env] .anyString := by
  intro j ⟨hw, h⟩
  cases h with | minStr _ => exact ⟨hw, .anyString⟩

theorem max_str_le_anyString (t : String) : .max (.str t) ⊑[env] .anyString := by
  intro j ⟨hw, h⟩
  cases h with | maxStr _ => exact ⟨hw, .anyString⟩

theorem above_str_le_anyString (t : String) : .above (.str t) ⊑[env] .anyString := by
  intro j ⟨hw, h⟩
  cases h with | aboveStr _ => exact ⟨hw, .anyString⟩

theorem beneath_str_le_anyString (t : String) : .beneath (.str t) ⊑[env] .anyString := by
  intro j ⟨hw, h⟩
  cases h with | beneathStr _ => exact ⟨hw, .anyString⟩

theorem re_le_anyString (p : String) : .re p ⊑[env] .anyString := by
  intro j ⟨hw, h⟩
  cases h with | re _ => exact ⟨hw, .anyString⟩

theorem format_le_anyString (g : String) : .format g ⊑[env] .anyString := by
  intro j ⟨hw, h⟩
  cases h with | format _ => exact ⟨hw, .anyString⟩

/-- `string` is not above a pattern that matches `""`: the reference's
"`string` admits any pattern residual" holds of a pattern only where it
refuses the empty string. -/
theorem re_not_le_string {p : String} (h : host.pattern p "") : ¬ (.re p ⊑[env] .string) := by
  intro hle
  have h' := (hle (.str "") ⟨.str, .re h⟩).2
  cases h' with | string hne => exact hne rfl

/-- The empty string is below every string in code-point order. -/
theorem String.empty_le (t : String) : "" ≤ t := by
  intro h
  have h' : t.data < [] := h
  generalize t.data = l at h'
  cases h'

/-- `max("b")` admits `""`, so `string` is not above it either. -/
theorem max_str_not_le_string (t : String) : ¬ (.max (.str t) ⊑[env] .string) := by
  intro hle
  have h' := (hle (.str "") ⟨.str, .maxStr (String.empty_le t)⟩).2
  cases h' with | string hne => exact hne rfl

/-! ## The table: disjunction, preference and the meet -/

/-- An arm is below its disjunction. -/
theorem arm_le_or {arms : List (ℕ × Val)} {r : ℕ} {a : Val} (h : (r, a) ∈ arms) :
    a ⊑[env] .or arms :=
  fun _ hj => ⟨hj.1, .or h hj.2⟩

/-- A disjunction on the specific side is below a value exactly when
every arm is: the reference's "every specific alternative must be
admitted by A". -/
theorem or_le_iff {arms : List (ℕ × Val)} {b : Val} :
    .or arms ⊑[env] b ↔ ∀ r a, (r, a) ∈ arms → a ⊑[env] b := by
  constructor
  · intro h r a hm
    exact (arm_le_or hm).trans h
  · intro h j ⟨hw, hj⟩
    rcases admits_or_iff.1 hj with ⟨r, a, hm, ha⟩
    exact h r a hm j ⟨hw, ha⟩

/-- A value below some arm is below the disjunction: the reference's
"some general alternative must admit B", which is sufficient, and not
necessary, since two arms may admit between them what neither admits
alone. -/
theorem le_or_of_mem {a b : Val} {arms : List (ℕ × Val)} {r : ℕ} (h : a ⊑[env] b)
    (hm : (r, b) ∈ arms) : a ⊑[env] .or arms :=
  h.trans (arm_le_or hm)

/-- A preference alone is above its value and above its value's parent
type. -/
theorem le_pref (r : ℕ) (x : Val) : x ⊑[env] .pref r x :=
  fun _ hj => ⟨hj.1, .pref hj.2⟩

theorem super_le_pref (r : ℕ) (x : Val) : x.super ⊑[env] .pref r x :=
  fun _ hj => ⟨hj.1, .prefSuper hj.2⟩

/-- A preference alone compares as what it admits, `x | super(x)`: the
two are below each other. -/
theorem pref_le_or (r : ℕ) (x : Val) : .pref r x ⊑[env] .or [(r, x), (0, x.super)] := by
  intro j ⟨hw, h⟩
  refine ⟨hw, ?_⟩
  cases h with
  | pref h => exact .or (List.mem_cons_self _ _) h
  | prefSuper h => exact .or (List.mem_cons_of_mem _ (List.mem_singleton.mpr rfl)) h

theorem or_le_pref (r : ℕ) (x : Val) : .or [(r, x), (0, x.super)] ⊑[env] .pref r x := by
  rw [or_le_iff]
  intro r' a hm
  rcases List.mem_cons.1 hm with h | h
  · cases h
    exact le_pref _ _
  · cases List.mem_singleton.1 h
    exact super_le_pref _ _

/-- Below a meet is below both sides, and back. -/
theorem le_meet_iff {a b c : Val} : c ⊑[env] .meet a b ↔ c ⊑[env] a ∧ c ⊑[env] b :=
  ⟨fun h => ⟨h.trans (meet_le_left env a b), h.trans (meet_le_right env a b)⟩,
   fun ⟨ha, hb⟩ => le_meet ha hb⟩

/-! ## The profiles -/

/-- The profiles `aontu subsume` answers under. -/
inductive Profile where
  | values
  | defaults
  | gen

/-- The `defaults` profile's order: `a`, the specific side, below `b`,
the general side, in the order, and at every position where the normal
form of `a` holds a term that singles out a value, the normal form of
`b` holds a term that singles out the same value. A default the
specific side declares survives into the general side unchanged; one
the general side adds where the specific side had none is no
obligation, since a term that singles out nothing asks nothing. -/
def DefaultsLe (env : Env) (a b : Val) : Prop :=
  a ⊑[env] b ∧
    ∀ (p : List Seg) (wa wb : Val), (normalise a).at p = some wa → (normalise b).at p = some wb →
      ∀ (root j : Data), Output env root wa j → Output env root wb j

/-- The `gen` profile's order: the `defaults` profile's, and the marks
agree on corresponding nodes. The marks `type()` and `hide()` are not
terms of the definition, so their agreement is a predicate the engines
supply, as `host` supplies the patterns. -/
def GenLe (env : Env) (marks : Val → Val → Prop) (a b : Val) : Prop :=
  DefaultsLe env a b ∧ marks a b

/-- The order each profile asks. -/
def Profile.Le (env : Env) (marks : Val → Val → Prop) : Profile → Val → Val → Prop
  | .values => Aontu.Le env
  | .defaults => DefaultsLe env
  | .gen => GenLe env marks

/-- The contract on an implementation under a profile: `subsumes` only
where the profile's order holds, `doesNotSubsume` only where it fails,
and `undecided` anywhere. Under `values` it is `SubsumeCorrect`. -/
def ProfileCorrect (env : Env) (marks : Val → Val → Prop) (pr : Profile)
    (subsume : Val → Val → Subsumption) : Prop :=
  ∀ general specific,
    (subsume general specific = .subsumes → pr.Le env marks specific general) ∧
    (subsume general specific = .doesNotSubsume → ¬ pr.Le env marks specific general)

theorem values_correct_iff {marks : Val → Val → Prop} {sub : Val → Val → Subsumption} :
    ProfileCorrect env marks .values sub ↔ SubsumeCorrect env sub := by
  unfold ProfileCorrect SubsumeCorrect Profile.Le
  exact Iff.rfl

theorem DefaultsLe.le {a b : Val} (h : DefaultsLe env a b) : a ⊑[env] b := h.1

theorem GenLe.defaults {marks : Val → Val → Prop} {a b : Val} (h : GenLe env marks a b) :
    DefaultsLe env a b := h.1

theorem DefaultsLe.refl (a : Val) : DefaultsLe env a a :=
  ⟨Le.refl env a, fun _ _ _ ha hb _ _ h => by rw [ha] at hb; cases hb; exact h⟩

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
    have h2 := h [] _ _ rfl rfl .null (.num (.integer (.of 2)))
      ((output_iff (by decide) _).1 (by decide))
    have h1 : Output env .null (normalise (.or [(1, .lit (.num (.integer (.of 1)))), (0, .number)]))
        (.num (.integer (.of 1))) :=
      (output_iff (by decide) _).1 (by decide)
    exact absurd (output_unique _ _ _ h2 h1) (by decide)

end

end Aontu
