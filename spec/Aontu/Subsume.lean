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

/-- Every value a map admits is a map, and every value a list admits a
list: each is below its kind. -/
theorem map_le_mapKind (fs : List (String × Bool × Val)) (spread : Option Val) (closed : Bool) :
    .map fs spread closed ⊑[env] .mapKind := by
  intro j ⟨hw, h⟩
  cases h
  exact ⟨hw, .mapKind⟩

theorem list_le_listKind (items : List Val) (spread : Option Val) (closed : Bool) :
    .list items spread closed ⊑[env] .listKind := by
  intro j ⟨hw, h⟩
  cases h
  exact ⟨hw, .listKind⟩

/-- `{}` and `[]`, open and with no spread, admit every map and every
list, so each kind is below them: the kind and its empty literal admit
the same values, and only `Output` tells them apart. -/
theorem mapKind_le_open_map : .mapKind ⊑[env] .map [] none false := by
  intro j ⟨hw, h⟩
  cases h
  exact ⟨hw, .map (fun _ _ _ _ hm _ => nomatch hm) (fun _ _ _ hm _ => nomatch hm)
    (fun _ hs => nomatch hs) (fun hc => nomatch hc)⟩

theorem listKind_le_open_list : .listKind ⊑[env] .list [] none false := by
  intro j ⟨hw, h⟩
  cases h
  exact ⟨hw, .list (Nat.zero_le _) (fun hc => nomatch hc) (fun _ _ _ hv _ => by simp at hv)
    (fun _ hs => nomatch hs)⟩

/-! ## The table: a kind over a residual

A kind covers a residual whose domain it admits whole: `number` every
bound with a number at its end and every `mulof`, and
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

theorem mulof_le_number (d : Number) : .mulof d ⊑[env] .number := by
  intro j ⟨hw, h⟩
  cases h with | mulof _ _ => exact ⟨hw, .number⟩

/-- The denominator a number shows is positive, as its value's is. -/
theorem Number.shown_den_pos (x : Number) : 0 < x.shown.2 := by
  cases x with
  | float f =>
    show 0 < (match f.shortest with
      | (c, k) => if 0 ≤ k then (c * 10 ^ k.toNat, 1) else (c, 10 ^ (-k).toNat)).2
    rcases f.shortest with ⟨c, k⟩
    dsimp only
    split
    · exact Nat.one_pos
    · exact Nat.pow_pos (by decide)
  | integer x => exact Number.den_pos _
  | biginteger x => exact Number.den_pos _
  | bigdecimal x => exact Number.den_pos _

/-- A multiple of a multiple of `b` is a multiple of `b`. -/
theorem Number.multipleOf_trans {x a b : Number} (hxa : x.multipleOf a) (hab : a.multipleOf b) :
    x.multipleOf b := by
  unfold Number.multipleOf at *
  have hd : (a.shown.2 : ℤ) ≠ 0 := by
    have := a.shown_den_pos
    omega
  obtain ⟨p, hp⟩ := Int.dvd_of_emod_eq_zero hxa
  obtain ⟨q, hq⟩ := Int.dvd_of_emod_eq_zero hab
  apply Int.emod_eq_zero_of_dvd
  refine ⟨p * q, ?_⟩
  apply Int.eq_of_mul_eq_mul_left hd
  calc (a.shown.2 : ℤ) * (x.shown.1 * b.shown.2) = (x.shown.1 * a.shown.2) * b.shown.2 := by ac_rfl
    _ = ((a.shown.1 * x.shown.2) * p) * b.shown.2 := by rw [hp]
    _ = (a.shown.1 * b.shown.2) * (x.shown.2 * p) := by ac_rfl
    _ = ((b.shown.1 * a.shown.2) * q) * (x.shown.2 * p) := by rw [hq]
    _ = (a.shown.2 : ℤ) * ((b.shown.1 * x.shown.2) * (p * q)) := by ac_rfl

/-- `mulof(a)` sits below `mulof(b)` where `a` is a multiple of `b`:
every multiple of `a` is one of `b`. -/
theorem mulof_le_mulof {a b : Number} (hb : b.Positive) (hab : a.multipleOf b) :
    .mulof a ⊑[env] .mulof b := by
  intro j ⟨hw, hj⟩
  cases hj with
  | mulof _ hx => exact ⟨hw, .mulof hb (Number.multipleOf_trans hx hab)⟩

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
  | pref h => exact .or (List.mem_cons_self) h
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

/-! ## The table: maps and lists

The order on containers follows the members' order under the root the
members are judged under: `Le` quantifies over instances, whose root is
the instance itself, and `judge_root` carries an admission from one
root to any other. -/

/-- A value below another admits, under any root, what the first admits. -/
theorem admits_of_le {a b : Val} (h : a ⊑[env] b) {root j : Data} (hw : j.WellFormed)
    (hj : Admits env root a j) : Admits env root b j :=
  judge_root (h j ⟨hw, judge_root hj⟩).2

/-- A map on the general side with no spread is above a map on the
specific side as its keys say: each key the general side declares, the
specific side declares too, with a value below it, required where the
general side requires it; and a sealed general side has a sealed
specific side declaring no key the general side does not. The specific
side's other keys and its spread only narrow it. The reference's rule
for an optional key the specific side lacks is not here: an open
specific side admits any value at it, so it is below only a value that
admits any (#377). -/
theorem map_le {fsg fss : List (String × Bool × Val)} {sps : Option Val} {cs cg : Bool}
    (hk : ∀ k og vg, (k, og, vg) ∈ fsg →
      ∃ os vs, (k, os, vs) ∈ fss ∧ vs ⊑[env] vg ∧ (og = false → os = false))
    (hc : cg = true → cs = true ∧ ∀ k os vs, (k, os, vs) ∈ fss → ∃ og vg, (k, og, vg) ∈ fsg) :
    .map fss sps cs ⊑[env] .map fsg none cg := by
  intro j ⟨hw, hj⟩
  refine ⟨hw, ?_⟩
  cases hj with
  | map hp ha _ hcl =>
    refine .map ?_ ?_ (fun _ h => nomatch h) ?_
    · intro k og vg x hm hx
      obtain ⟨os, vs, hms, hle, _⟩ := hk k og vg hm
      have hwx : x.WellFormed := by
        cases hw with | map _ hm' => exact hm' k x (lookup_mem hx)
      exact admits_of_le hle hwx (hp k os vs x hms hx)
    · intro k og vg hm hx
      obtain ⟨os, vs, hms, _, hreq⟩ := hk k og vg hm
      cases og with
      | true => rfl
      | false =>
        have hos := ha k os vs hms hx
        rw [hreq rfl] at hos
        exact nomatch hos
    · intro hcg k x hkx
      obtain ⟨hcs, hkeys⟩ := hc hcg
      obtain ⟨os, vs, hms⟩ := hcl hcs k x hkx
      exact hkeys k os vs hms

/-- A map that requires a key is above no value that admits the empty
map: the reference's `compat_required_added`. -/
theorem not_le_map_required {a : Val} {fsg : List (String × Bool × Val)} {sp : Option Val}
    {c : Bool} {k : String} {vg : Val} (hk : (k, false, vg) ∈ fsg)
    (ha : Admits env (.map []) a (.map [])) : ¬ a ⊑[env] .map fsg sp c := by
  intro hle
  have h := (hle (.map []) ⟨.map List.nodup_nil (fun _ _ h => nomatch h), ha⟩).2
  cases h with
  | map _ hopt _ _ => exact nomatch hopt k false vg hk rfl

/-- A list on the general side with no spread is above a list on the
specific side as its positions say: each has a position below it on
the specific side, and a sealed general side has a sealed specific side
of the same length with no spread. -/
theorem list_le {ig is : List Val} {sps : Option Val} {cs cg : Bool}
    (hn : ig.length ≤ is.length)
    (hi : ∀ (i : ℕ) (vg vs : Val), ig[i]? = some vg → is[i]? = some vs → vs ⊑[env] vg)
    (hc : cg = true → cs = true ∧ sps = none ∧ is.length = ig.length) :
    .list is sps cs ⊑[env] .list ig none cg := by
  intro j ⟨hw, hj⟩
  refine ⟨hw, ?_⟩
  cases hj with
  | list hlen hcl hp _ =>
    refine .list (Nat.le_trans hn hlen) ?_ ?_ (fun _ h => nomatch h)
    · intro hcg _
      obtain ⟨hcs, hsp, heq⟩ := hc hcg
      rw [hcl hcs hsp, heq]
    · intro i vg x hig hx
      cases his : is[i]? with
      | none =>
        have hlt : ¬ ig.length ≤ i := fun hle => by
          rw [List.getElem?_eq_none_iff.2 hle] at hig
          exact nomatch hig
        exact absurd (Nat.le_trans hn (List.getElem?_eq_none_iff.1 his)) hlt
      | some vs =>
        have hwx : x.WellFormed := by
          cases hw with | list hm => exact hm x (List.mem_of_getElem? hx)
        exact admits_of_le (hi i vg vs hig his) hwx (hp i vs x his hx)

/-- A map on the general side with a spread is above a map on the
specific side as `map_le` says of its keys, and when the spread holds
every member the specific side can have: each value the specific side
declares is below the spread, and its other members are refused by a
seal or held by its own spread, itself below the general one. A specific
side open with no spread admits any member, so it is below only a
spread that admits any. -/
theorem map_le_spread {fsg fss : List (String × Bool × Val)} {sps : Option Val} {sg : Val}
    {cs cg : Bool}
    (hk : ∀ k og vg, (k, og, vg) ∈ fsg →
      ∃ os vs, (k, os, vs) ∈ fss ∧ vs ⊑[env] vg ∧ (og = false → os = false))
    (hc : cg = true → cs = true ∧ ∀ k os vs, (k, os, vs) ∈ fss → ∃ og vg, (k, og, vg) ∈ fsg)
    (hv : ∀ k os vs, (k, os, vs) ∈ fss → vs ⊑[env] sg)
    (ho : cs = true ∨ ∃ ss, sps = some ss ∧ ss ⊑[env] sg) :
    .map fss sps cs ⊑[env] .map fsg (some sg) cg := by
  intro j ⟨hw, hj⟩
  cases hj with
  | map hp ha hs hcl =>
    cases hw with
    | map hn hm =>
      refine ⟨.map hn hm, .map ?_ ?_ ?_ ?_⟩
      · intro k og vg x hm' hx
        obtain ⟨os, vs, hms, hle, _⟩ := hk k og vg hm'
        exact admits_of_le hle (hm k x (lookup_mem hx)) (hp k os vs x hms hx)
      · intro k og vg hm' hx
        obtain ⟨os, vs, hms, _, hreq⟩ := hk k og vg hm'
        cases og with
        | true => rfl
        | false =>
          have hos := ha k os vs hms hx
          rw [hreq rfl] at hos
          exact nomatch hos
      · intro s hs' k x hmem
        cases hs'
        cases hd : declared k fss with
        | true =>
          obtain ⟨os, vs, hms⟩ := declared_iff.1 hd
          exact admits_of_le (hv k os vs hms) (hm k x hmem)
            (hp k os vs x hms (lookup_eq_some_of_nodup hn hmem))
        | false =>
          rcases ho with hcs | ⟨ss, hsps, hle⟩
          · obtain ⟨o, v, hm'⟩ := hcl hcs k x hmem
            have hd' := declared_iff.2 ⟨o, v, hm'⟩
            rw [hd] at hd'
            exact nomatch hd'
          · exact admits_of_le hle (hm k x hmem) (hs ss hsps k x hmem)
      · intro hcg k x hkx
        obtain ⟨hcs, hkeys⟩ := hc hcg
        obtain ⟨os, vs, hms⟩ := hcl hcs k x hkx
        exact hkeys k os vs hms

/-- A list on the general side with a spread is above a list on the
specific side as `list_le` says of its positions, and when the spread
holds every member the specific side can have: each of its items is
below the spread, and the members past its positions are refused by a
seal with no spread or held by its own spread, itself below the general
one. The general side's own seal asks nothing here: beside a spread it
fixes no length, so `close([integer, &: integer])` and
`[integer, &: integer]` admit the same lists. -/
theorem list_le_spread {ig is : List Val} {sps : Option Val} {sg : Val} {cs cg : Bool}
    (hn : ig.length ≤ is.length)
    (hi : ∀ (i : ℕ) (vg vs : Val), ig[i]? = some vg → is[i]? = some vs → vs ⊑[env] vg)
    (hv : ∀ v, v ∈ is → v ⊑[env] sg)
    (ho : (cs = true ∧ sps = none) ∨ ∃ ss, sps = some ss ∧ ss ⊑[env] sg) :
    .list is sps cs ⊑[env] .list ig (some sg) cg := by
  intro j ⟨hw, hj⟩
  cases hj with
  | list hlen hcl hp hs =>
    cases hw with
    | list hm =>
      refine ⟨.list hm, .list (Nat.le_trans hn hlen) ?_ ?_ ?_⟩
      · intro _ h
        exact nomatch h
      · intro i vg x hig hx
        cases his : is[i]? with
        | none =>
          have hlt : ¬ ig.length ≤ i := fun hle => by
            rw [List.getElem?_eq_none_iff.2 hle] at hig
            exact nomatch hig
          exact absurd (Nat.le_trans hn (List.getElem?_eq_none_iff.1 his)) hlt
        | some vs =>
          exact admits_of_le (hi i vg vs hig his) (hm x (List.mem_of_getElem? hx)) (hp i vs x his hx)
      · intro s hs' x hx
        cases hs'
        rcases ho with ⟨hcs, hsp⟩ | ⟨ss, hsps, hle⟩
        · obtain ⟨i, hi'⟩ := List.mem_iff_getElem?.1 hx
          cases his : is[i]? with
          | none =>
            have hle := List.getElem?_eq_none_iff.1 his
            rw [List.getElem?_eq_none_iff.2 (hcl hcs hsp ▸ hle)] at hi'
            exact nomatch hi'
          | some vs =>
            exact admits_of_le (hv vs (List.mem_of_getElem? his)) (hm x hx) (hp i vs x his hi')
        · exact admits_of_le hle (hm x hx) (hs ss hsps x hx)

/-! ## The table: the constraint algebra

The reference's second table, "Subsumption" under the constraints,
orders the residuals among themselves: an interval contains another,
`neq` of fewer values is more general, `len` follows its count, and a
concrete scalar is below a bound that admits it. -/

theorem Number.le_refl (x : Number) : x.le x := Int.le_refl _

theorem String.le_refl (t : String) : t ≤ t := fun h => lt_asymm_chars h h

theorem String.le_trans {a b c : String} (h₁ : a ≤ b) (h₂ : b ≤ c) : a ≤ c := by
  intro hca
  rcases lt_total_chars a.data b.data with hab | hab | hab
  · exact h₂ (lt_trans_chars hca hab)
  · exact h₂ (show c.data < b.data from hab ▸ hca)
  · exact h₁ hab

/-- A closed lower bound is below another exactly when its end is at or
above the other's: `min(3) ⊑ min(0)`. -/
theorem min_le_min_iff (n m : Number) : .min (.num n) ⊑[env] .min (.num m) ↔ m.le n := by
  constructor
  · intro h
    have h' := (h (.num n) ⟨.num, .min (Number.le_refl n)⟩).2
    cases h' with | min h' => exact h'
  · intro hle j ⟨hw, hj⟩
    refine ⟨hw, ?_⟩
    cases hj with | min h' => exact .min (Number.le_trans hle h')

theorem max_le_max_iff (n m : Number) : .max (.num n) ⊑[env] .max (.num m) ↔ n.le m := by
  constructor
  · intro h
    have h' := (h (.num n) ⟨.num, .max (Number.le_refl n)⟩).2
    cases h' with | max h' => exact h'
  · intro hle j ⟨hw, hj⟩
    refine ⟨hw, ?_⟩
    cases hj with | max h' => exact .max (Number.le_trans h' hle)

theorem above_le_above_of_le {n m : Number} (h : m.le n) :
    .above (.num n) ⊑[env] .above (.num m) := by
  intro j ⟨hw, hj⟩
  refine ⟨hw, ?_⟩
  cases hj with | above h' => exact .above (Number.lt_of_le_of_lt h h')

theorem beneath_le_beneath_of_le {n m : Number} (h : n.le m) :
    .beneath (.num n) ⊑[env] .beneath (.num m) := by
  intro j ⟨hw, hj⟩
  refine ⟨hw, ?_⟩
  cases hj with | beneath h' => exact .beneath (Number.lt_of_lt_of_le h' h)

/-- A closed bound is below a strict one exactly when its end lies
strictly inside: `min(3) ⊑ above(2)`. -/
theorem min_le_above_iff (n m : Number) : .min (.num n) ⊑[env] .above (.num m) ↔ m.lt n := by
  constructor
  · intro h
    have h' := (h (.num n) ⟨.num, .min (Number.le_refl n)⟩).2
    cases h' with | above h' => exact h'
  · intro hlt j ⟨hw, hj⟩
    refine ⟨hw, ?_⟩
    cases hj with | min h' => exact .above (Number.lt_of_lt_of_le hlt h')

theorem max_le_beneath_iff (n m : Number) : .max (.num n) ⊑[env] .beneath (.num m) ↔ n.lt m := by
  constructor
  · intro h
    have h' := (h (.num n) ⟨.num, .max (Number.le_refl n)⟩).2
    cases h' with | beneath h' => exact h'
  · intro hlt j ⟨hw, hj⟩
    refine ⟨hw, ?_⟩
    cases hj with | max h' => exact .beneath (Number.lt_of_le_of_lt h' hlt)

/-- A strict bound is below a closed one whose end is at or inside it:
`above_le_min` with the ends apart. -/
theorem above_le_min_of_le {n m : Number} (h : m.le n) : .above (.num n) ⊑[env] .min (.num m) := by
  intro j ⟨hw, hj⟩
  refine ⟨hw, ?_⟩
  cases hj with | above h' => exact .min (Number.le_of_lt (Number.lt_of_le_of_lt h h'))

theorem beneath_le_max_of_le {n m : Number} (h : n.le m) :
    .beneath (.num n) ⊑[env] .max (.num m) := by
  intro j ⟨hw, hj⟩
  refine ⟨hw, ?_⟩
  cases hj with | beneath h' => exact .max (Number.le_of_lt (Number.lt_of_lt_of_le h' h))

/-- A concrete number is below a bound exactly when the bound admits
it: the reference's membership rule. -/
theorem lit_le_min_iff (x n : Number) : .lit (.num x) ⊑[env] .min (.num n) ↔ n.le x := by
  constructor
  · intro h
    have h' := (h (.num x) ⟨.num, .num⟩).2
    cases h' with | min h' => exact h'
  · intro hle j ⟨hw, hj⟩
    refine ⟨hw, ?_⟩
    cases hj
    exact .min hle

theorem lit_le_max_iff (x n : Number) : .lit (.num x) ⊑[env] .max (.num n) ↔ x.le n := by
  constructor
  · intro h
    have h' := (h (.num x) ⟨.num, .num⟩).2
    cases h' with | max h' => exact h'
  · intro hle j ⟨hw, hj⟩
    refine ⟨hw, ?_⟩
    cases hj
    exact .max hle

theorem lit_le_above_iff (x n : Number) : .lit (.num x) ⊑[env] .above (.num n) ↔ n.lt x := by
  constructor
  · intro h
    have h' := (h (.num x) ⟨.num, .num⟩).2
    cases h' with | above h' => exact h'
  · intro hlt j ⟨hw, hj⟩
    refine ⟨hw, ?_⟩
    cases hj
    exact .above hlt

theorem lit_le_beneath_iff (x n : Number) : .lit (.num x) ⊑[env] .beneath (.num n) ↔ x.lt n := by
  constructor
  · intro h
    have h' := (h (.num x) ⟨.num, .num⟩).2
    cases h' with | beneath h' => exact h'
  · intro hlt j ⟨hw, hj⟩
    refine ⟨hw, ?_⟩
    cases hj
    exact .beneath hlt

/-- The same for the bounds on strings, in code-point order. -/
theorem min_str_le_min_iff (t u : String) : .min (.str t) ⊑[env] .min (.str u) ↔ u ≤ t := by
  constructor
  · intro h
    have h' := (h (.str t) ⟨.str, .minStr (String.le_refl t)⟩).2
    cases h' with | minStr h' => exact h'
  · intro hle j ⟨hw, hj⟩
    refine ⟨hw, ?_⟩
    cases hj with | minStr h' => exact .minStr (String.le_trans hle h')

theorem max_str_le_max_iff (t u : String) : .max (.str t) ⊑[env] .max (.str u) ↔ t ≤ u := by
  constructor
  · intro h
    have h' := (h (.str t) ⟨.str, .maxStr (String.le_refl t)⟩).2
    cases h' with | maxStr h' => exact h'
  · intro hle j ⟨hw, hj⟩
    refine ⟨hw, ?_⟩
    cases hj with | maxStr h' => exact .maxStr (String.le_trans h' hle)

/-- Excluding fewer values is more general: `neq(1) ⊒ neq(1, 2)`. -/
theorem neq_le_neq {S T : List Bound} (h : ∀ v, v ∈ S → v ∈ T) : .neq T ⊑[env] .neq S := by
  intro j ⟨hw, hj⟩
  refine ⟨hw, ?_⟩
  cases hj with
  | neq hT => exact .neq fun v hv => hT v (h v hv)
  | neqStr hT => exact .neqStr fun v hv => hT v (h v hv)

/-- `len` follows its count: the reference's row reuses the table over
the integers. -/
theorem len_le_len {c d : Val} (h : d ⊑[env] c) : .len d ⊑[env] .len c := by
  intro j ⟨hw, hj⟩
  refine ⟨hw, ?_⟩
  cases hj with
  | len hil hsz hd => exact .len hil hsz (admits_of_le h .num hd)

/-! ## Deciding the order on the scalars

`leDecF` answers with a proof where a theorem above puts `a` below `b`,
by the forms of the scalars and the connectives: the ends, the kinds,
the literals, the residuals under the kinds that cover their domains,
disjunction, preference and the meet. Where it answers `none` it says
nothing: two containers, or two bounds, it leaves undecided, and a
refutation comes from an instance that tells the two apart,
`not_le_of_witness`. It is sound by construction, since what it
returns is the proof, and it is no part of the contract: an engine may
decide more. -/

/-- The kind that admits exactly a leaf, as a kind. -/
def Leaf.toKind : Leaf → Kind
  | .integer => .integer
  | .float => .float
  | .biginteger => .biginteger
  | .bigdecimal => .bigdecimal

/-- Every arm of a disjunction below `b`, found arm by arm. -/
def armsAllDec (dec : (a b : Val) → Option (PLift (a ⊑[env] b))) (b : Val) :
    (arms : List (ℕ × Val)) → Option (PLift (∀ r a, (r, a) ∈ arms → a ⊑[env] b))
  | [] => some ⟨fun _ _ h => absurd h (List.not_mem_nil)⟩
  | (_, x) :: rest =>
    match dec x b, armsAllDec dec b rest with
    | some ⟨h⟩, some ⟨hs⟩ => some ⟨fun r' a hm => by
        rcases List.mem_cons.1 hm with h' | h'
        · cases h'
          exact h
        · exact hs r' a h'⟩
    | _, _ => none

/-- Some arm of a disjunction above `a`, found arm by arm; `hsub` keeps
the arms seen so far inside the whole disjunction. -/
def armsAnyDec (dec : (a b : Val) → Option (PLift (a ⊑[env] b))) (a : Val)
    (arms₀ : List (ℕ × Val)) :
    (arms : List (ℕ × Val)) → (∀ p, p ∈ arms → p ∈ arms₀) → Option (PLift (a ⊑[env] .or arms₀))
  | [], _ => none
  | p :: rest, hsub =>
    match dec a p.2 with
    | some ⟨h⟩ => some ⟨le_or_of_mem h (hsub p (List.mem_cons_self))⟩
    | none => armsAnyDec dec a arms₀ rest fun q hq => hsub q (List.mem_cons_of_mem _ hq)

/-- Each key the general side declares, found on the specific side with a
value below it, required where the general side requires it. -/
def fieldsDec (dec : (a b : Val) → Option (PLift (a ⊑[env] b))) (fss : List (String × Bool × Val)) :
    (fsg : List (String × Bool × Val)) →
      Option (PLift (∀ k og vg, (k, og, vg) ∈ fsg →
        ∃ os vs, (k, os, vs) ∈ fss ∧ vs ⊑[env] vg ∧ (og = false → os = false)))
  | [] => some ⟨fun _ _ _ h => absurd h (List.not_mem_nil)⟩
  | (k, og, vg) :: rest =>
    match hf : fss.find? (fun f => f.1 == k) with
    | none => none
    | some (k', os, vs) =>
      if hreq : og = false → os = false then
        match dec vs vg, fieldsDec dec fss rest with
        | some ⟨h⟩, some ⟨hs⟩ => some ⟨fun k₁ o₁ v₁ hm => by
            rcases List.mem_cons.1 hm with h' | h'
            · cases h'
              have hk : k' = k := by simpa using List.find?_some hf
              subst hk
              exact ⟨os, vs, List.mem_of_find?_eq_some hf, h, hreq⟩
            · exact hs k₁ o₁ v₁ h'⟩
        | _, _ => none
      else none

/-- Each key the specific side declares, declared by the general side
too: what a sealed general side asks of a sealed specific side. -/
def keysDec (fsg : List (String × Bool × Val)) :
    (fss : List (String × Bool × Val)) →
      Option (PLift (∀ k os vs, (k, os, vs) ∈ fss → ∃ og vg, (k, og, vg) ∈ fsg))
  | [] => some ⟨fun _ _ _ h => absurd h (List.not_mem_nil)⟩
  | (k, _, _) :: rest =>
    match hf : fsg.find? (fun f => f.1 == k), keysDec fsg rest with
    | some (k', og, vg), some ⟨hs⟩ => some ⟨fun k₁ o₁ v₁ hm => by
        rcases List.mem_cons.1 hm with h' | h'
        · cases h'
          have hk : k' = k := by simpa using List.find?_some hf
          subst hk
          exact ⟨og, vg, List.mem_of_find?_eq_some hf⟩
        · exact hs k₁ o₁ v₁ h'⟩
    | _, _ => none

/-- Each position of the general side with the specific side's position
below it. -/
def itemsDec (dec : (a b : Val) → Option (PLift (a ⊑[env] b))) :
    (ig is : List Val) →
      Option (PLift (∀ (i : ℕ) (vg vs : Val), ig[i]? = some vg → is[i]? = some vs → vs ⊑[env] vg))
  | [], _ => some ⟨fun _ _ _ h => by simp at h⟩
  | _ :: _, [] => some ⟨fun _ _ _ _ h => by simp at h⟩
  | vg :: ig', vs :: is' =>
    match dec vs vg, itemsDec dec ig' is' with
    | some ⟨h⟩, some ⟨hs⟩ => some ⟨fun i vg' vs' hig his => by
        cases i with
        | zero =>
          simp at hig his
          subst hig
          subst his
          exact h
        | succ i => exact hs i vg' vs' (by simpa using hig) (by simpa using his)⟩
    | _, _ => none

/-- Every declared value of a map below one term, found value by value. -/
def valuesDec (dec : (a b : Val) → Option (PLift (a ⊑[env] b))) (sg : Val) :
    (fss : List (String × Bool × Val)) →
      Option (PLift (∀ k os vs, (k, os, vs) ∈ fss → vs ⊑[env] sg))
  | [] => some ⟨fun _ _ _ h => absurd h (List.not_mem_nil)⟩
  | (_, _, vs) :: rest =>
    match dec vs sg, valuesDec dec sg rest with
    | some ⟨h⟩, some ⟨hs⟩ => some ⟨fun k₁ o₁ v₁ hm => by
        rcases List.mem_cons.1 hm with h' | h'
        · cases h'
          exact h
        · exact hs k₁ o₁ v₁ h'⟩
    | _, _ => none

/-- Every item of a list below one term, found item by item. -/
def itemsAllDec (dec : (a b : Val) → Option (PLift (a ⊑[env] b))) (sg : Val) :
    (is : List Val) → Option (PLift (∀ v, v ∈ is → v ⊑[env] sg))
  | [] => some ⟨fun _ h => absurd h (List.not_mem_nil)⟩
  | v :: rest =>
    match dec v sg, itemsAllDec dec sg rest with
    | some ⟨h⟩, some ⟨hs⟩ => some ⟨fun v' hm => by
        rcases List.mem_cons.1 hm with h' | h'
        · subst h'
          exact h
        · exact hs v' h'⟩
    | _, _ => none

/-- Whether the specific side's other members are covered: a seal refuses
them, or its own spread holds them and sits below the general spread. -/
def coverDec (dec : (a b : Val) → Option (PLift (a ⊑[env] b))) (sg : Val) (sps : Option Val)
    (cs : Bool) : Option (PLift (cs = true ∨ ∃ ss, sps = some ss ∧ ss ⊑[env] sg)) :=
  match cs with
  | true => some ⟨.inl rfl⟩
  | false =>
    match sps with
    | none => none
    | some ss =>
      match dec ss sg with
      | some ⟨h⟩ => some ⟨.inr ⟨ss, rfl, h⟩⟩
      | none => none

/-- `a` below `b`, with the proof, where the forms decide it in `n`
steps; the connectives first, the right side's meet and disjunction
before the left side's, since below a meet is below both sides and
below a disjunction is below some arm; then two maps and two lists
whose general side has no spread, by `map_le` and `list_le`; then two
bounds, a literal under a bound, two `neq` and two `len`, by the
constraint algebra's rows; then the scalars. -/
def leDecF (env : Env) : ℕ → (a b : Val) → Option (PLift (a ⊑[env] b))
  | 0, _, _ => none
  | n + 1, a, b =>
    match a, b with
    | _, .any => some ⟨le_any env _⟩
    | .nil, _ => some ⟨nil_le env _⟩
    | a, .meet b₁ b₂ =>
      match leDecF env n a b₁, leDecF env n a b₂ with
      | some ⟨h₁⟩, some ⟨h₂⟩ => some ⟨le_meet h₁ h₂⟩
      | _, _ => none
    | .meet a₁ a₂, b =>
      match leDecF env n a₁ b with
      | some ⟨h⟩ => some ⟨(meet_le_left env a₁ a₂).trans h⟩
      | none =>
        match leDecF env n a₂ b with
        | some ⟨h⟩ => some ⟨(meet_le_right env a₁ a₂).trans h⟩
        | none => none
    | .or arms, b =>
      match armsAllDec (leDecF env n) b arms with
      | some ⟨h⟩ => some ⟨or_le_iff.2 h⟩
      | none => none
    | a, .or arms => armsAnyDec (leDecF env n) a arms arms fun _ h => h
    | .pref r x, b =>
      match leDecF env n x b, leDecF env n x.super b with
      | some ⟨h₁⟩, some ⟨h₂⟩ => some ⟨(pref_le_or r x).trans (or_le_iff.2 fun r' a hm => by
          rcases List.mem_cons.1 hm with h' | h'
          · cases h'
            exact h₁
          · cases List.mem_singleton.1 h'
            exact h₂)⟩
      | _, _ => none
    | a, .pref r x =>
      match leDecF env n a x with
      | some ⟨h⟩ => some ⟨h.trans (le_pref r x)⟩
      | none =>
        match leDecF env n a x.super with
        | some ⟨h⟩ => some ⟨h.trans (super_le_pref r x)⟩
        | none => none
    | .map fss sps cs, .map fsg none cg =>
      match fieldsDec (leDecF env n) fss fsg with
      | none => none
      | some ⟨hk⟩ =>
        match cg with
        | false => some ⟨map_le hk fun h => nomatch h⟩
        | true =>
          match cs with
          | false => none
          | true =>
            match keysDec fsg fss with
            | some ⟨hkeys⟩ => some ⟨map_le hk fun _ => ⟨rfl, hkeys⟩⟩
            | none => none
    | .map fss sps cs, .map fsg (some sg) cg =>
      match fieldsDec (leDecF env n) fss fsg, valuesDec (leDecF env n) sg fss,
          coverDec (leDecF env n) sg sps cs with
      | some ⟨hk⟩, some ⟨hv⟩, some ⟨ho⟩ =>
        match cg with
        | false => some ⟨map_le_spread hk (fun h => nomatch h) hv ho⟩
        | true =>
          match cs with
          | false => none
          | true =>
            match keysDec fsg fss with
            | some ⟨hkeys⟩ => some ⟨map_le_spread hk (fun _ => ⟨rfl, hkeys⟩) hv ho⟩
            | none => none
      | _, _, _ => none
    | .list is sps cs, .list ig none cg =>
      if hn : ig.length ≤ is.length then
        match itemsDec (leDecF env n) ig is with
        | none => none
        | some ⟨hi⟩ =>
          match cg with
          | false => some ⟨list_le hn hi fun h => nomatch h⟩
          | true =>
            match cs, sps with
            | true, none =>
              if heq : is.length = ig.length then some ⟨list_le hn hi fun _ => ⟨rfl, rfl, heq⟩⟩
              else none
            | _, _ => none
      else none
    | .list is sps cs, .list ig (some sg) _ =>
      if hn : ig.length ≤ is.length then
        match itemsDec (leDecF env n) ig is, itemsAllDec (leDecF env n) sg is with
        | some ⟨hi⟩, some ⟨hv⟩ =>
          match cs, sps with
          | true, none => some ⟨list_le_spread hn hi hv (.inl ⟨rfl, rfl⟩)⟩
          | _, some ss =>
            match leDecF env n ss sg with
            | some ⟨hle⟩ => some ⟨list_le_spread hn hi hv (.inr ⟨ss, rfl, hle⟩)⟩
            | none => none
          | false, none => none
        | _, _ => none
      else none
    | .min (.num k), .min (.num m) => if h : m.le k then some ⟨(min_le_min_iff k m).2 h⟩ else none
    | .max (.num k), .max (.num m) => if h : k.le m then some ⟨(max_le_max_iff k m).2 h⟩ else none
    | .above (.num k), .above (.num m) => if h : m.le k then some ⟨above_le_above_of_le h⟩ else none
    | .beneath (.num k), .beneath (.num m) =>
      if h : k.le m then some ⟨beneath_le_beneath_of_le h⟩ else none
    | .min (.num k), .above (.num m) => if h : m.lt k then some ⟨(min_le_above_iff k m).2 h⟩ else none
    | .max (.num k), .beneath (.num m) =>
      if h : k.lt m then some ⟨(max_le_beneath_iff k m).2 h⟩ else none
    | .above (.num k), .min (.num m) => if h : m.le k then some ⟨above_le_min_of_le h⟩ else none
    | .beneath (.num k), .max (.num m) => if h : k.le m then some ⟨beneath_le_max_of_le h⟩ else none
    | .lit (.num x), .min (.num k) => if h : k.le x then some ⟨(lit_le_min_iff x k).2 h⟩ else none
    | .lit (.num x), .max (.num k) => if h : x.le k then some ⟨(lit_le_max_iff x k).2 h⟩ else none
    | .lit (.num x), .above (.num k) => if h : k.lt x then some ⟨(lit_le_above_iff x k).2 h⟩ else none
    | .lit (.num x), .beneath (.num k) =>
      if h : x.lt k then some ⟨(lit_le_beneath_iff x k).2 h⟩ else none
    | .min (.str t), .min (.str u) => if h : u ≤ t then some ⟨(min_str_le_min_iff t u).2 h⟩ else none
    | .max (.str t), .max (.str u) => if h : t ≤ u then some ⟨(max_str_le_max_iff t u).2 h⟩ else none
    | .neq T, .neq S => if h : ∀ v, v ∈ S → v ∈ T then some ⟨neq_le_neq h⟩ else none
    | .len d, .len c =>
      match leDecF env n d c with
      | some ⟨h⟩ => some ⟨len_le_len h⟩
      | none => none
    | .integer, .integer | .float, .float | .biginteger, .biginteger | .bigdecimal, .bigdecimal
    | .number, .number | .string, .string | .anyString, .anyString | .boolean, .boolean
    | .mapKind, .mapKind | .listKind, .listKind =>
      some ⟨Le.refl env _⟩
    | .map fs sp cl, .mapKind => some ⟨map_le_mapKind fs sp cl⟩
    | .list is sp cl, .listKind => some ⟨list_le_listKind is sp cl⟩
    | .mapKind, .map [] none false => some ⟨mapKind_le_open_map⟩
    | .listKind, .list [] none false => some ⟨listKind_le_open_list⟩
    | .integer, .number => some ⟨leaf_le_number .integer⟩
    | .float, .number => some ⟨leaf_le_number .float⟩
    | .biginteger, .number => some ⟨leaf_le_number .biginteger⟩
    | .bigdecimal, .number => some ⟨leaf_le_number .bigdecimal⟩
    | .string, .anyString => some ⟨string_le_anyString⟩
    | .lit s, .lit t => if h : s = t then some ⟨h ▸ Le.refl env _⟩ else none
    | .lit (.num x), .number => some ⟨lit_num_le_number x⟩
    | .lit (.num (.integer i)), .integer => some ⟨lit_num_le_leaf (.integer i)⟩
    | .lit (.num (.float f)), .float => some ⟨lit_num_le_leaf (.float f)⟩
    | .lit (.num (.biginteger i)), .biginteger => some ⟨lit_num_le_leaf (.biginteger i)⟩
    | .lit (.num (.bigdecimal d)), .bigdecimal => some ⟨lit_num_le_leaf (.bigdecimal d)⟩
    | .lit (.str s), .anyString => some ⟨lit_str_le_anyString s⟩
    | .lit (.str s), .string => if h : s = "" then none else some ⟨lit_str_le_string h⟩
    | .lit (.bool c), .boolean => some ⟨lit_bool_le_boolean c⟩
    | .min (.num k), .number => some ⟨min_num_le_number k⟩
    | .max (.num k), .number => some ⟨max_num_le_number k⟩
    | .above (.num k), .number => some ⟨above_num_le_number k⟩
    | .beneath (.num k), .number => some ⟨beneath_num_le_number k⟩
    | .mulof d, .number => some ⟨mulof_le_number d⟩
    | .mulof a, .mulof b =>
      if h : b.Positive ∧ a.multipleOf b then some ⟨mulof_le_mulof h.1 h.2⟩ else none
    | .min (.str t), .anyString => some ⟨min_str_le_anyString t⟩
    | .max (.str t), .anyString => some ⟨max_str_le_anyString t⟩
    | .above (.str t), .anyString => some ⟨above_str_le_anyString t⟩
    | .beneath (.str t), .anyString => some ⟨beneath_str_le_anyString t⟩
    | .re p, .anyString => some ⟨re_le_anyString p⟩
    | .format g, .anyString => some ⟨format_le_anyString g⟩
    | _, _ => none

/-- The procedure's `some` is the order: what it returns is the proof. -/
theorem leDecF_sound {n : ℕ} {a b : Val} (h : (leDecF env n a b).isSome = true) : a ⊑[env] b :=
  match hd : leDecF env n a b with
  | some ⟨hle⟩ => hle
  | none => by rw [hd] at h; exact nomatch h

/-- An instance that one value admits and the other refuses puts the
first outside the order: the refutation the rows carry. -/
theorem not_le_of_witness {s g : Val} {j : Data} (hs : s.Checkable) (hg : g.Checkable)
    (hj : j.WellFormed) (h1 : check s j = true) (h2 : check g j = false) : ¬ s ⊑[env] g := by
  intro hle
  have hg' := (hle j ⟨hj, (check_iff hs j).1 h1⟩).2
  exact nomatch judge_unique hg' ((check_iff hg j).1 h2)

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
