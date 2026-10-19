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
  | [] => some ⟨fun _ _ h => absurd h (List.not_mem_nil _)⟩
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
    | some ⟨h⟩ => some ⟨le_or_of_mem h (hsub p (List.mem_cons_self _ _))⟩
    | none => armsAnyDec dec a arms₀ rest fun q hq => hsub q (List.mem_cons_of_mem _ hq)

/-- Each key the general side declares, found on the specific side with a
value below it, required where the general side requires it. -/
def fieldsDec (dec : (a b : Val) → Option (PLift (a ⊑[env] b))) (fss : List (String × Bool × Val)) :
    (fsg : List (String × Bool × Val)) →
      Option (PLift (∀ k og vg, (k, og, vg) ∈ fsg →
        ∃ os vs, (k, os, vs) ∈ fss ∧ vs ⊑[env] vg ∧ (og = false → os = false)))
  | [] => some ⟨fun _ _ _ h => absurd h (List.not_mem_nil _)⟩
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
  | [] => some ⟨fun _ _ _ h => absurd h (List.not_mem_nil _)⟩
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

/-- `a` below `b`, with the proof, where the forms decide it in `n`
steps; the connectives first, the right side's meet and disjunction
before the left side's, since below a meet is below both sides and
below a disjunction is below some arm; then two maps and two lists
whose general side has no spread, by `map_le` and `list_le`; then the
scalars. -/
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
    | .integer, .integer | .float, .float | .biginteger, .biginteger | .bigdecimal, .bigdecimal
    | .number, .number | .string, .string | .anyString, .anyString | .boolean, .boolean =>
      some ⟨Le.refl env _⟩
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
    | .multiple d, .number => some ⟨multiple_le_number d⟩
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

end Aontu
