import Aontu.Admits
import Aontu.Names

/-!
# The checker

`Admits` computes nothing: it is a relation, and Lean will not run it
(`decide (Admits Env.empty .null .integer (.integer 3))` finds no
`Decidable` instance). `check` is an algorithm, and `check_iff` is what
lets its answers stand in for the definition's, on every value that
reads no alias, no path, no pattern and no format. Without that theorem it would be a
third port. `Data.wf` decides that a Lean `Data` is a value the same
way, beside `Data.wf_iff`.
-/

namespace Aontu

mutual
/-- Whether a Lean `Data` is a value, computed. -/
def Data.wf : Data → Bool
  | .num _ => true
  | .str _ => true
  | .bool _ => true
  | .null => true
  | .map fs => decide (fs.map Prod.fst).Nodup && Data.wfMembers fs
  | .list xs => Data.wfAll xs

def Data.wfAll : List Data → Bool
  | [] => true
  | x :: xs => x.wf && Data.wfAll xs

def Data.wfMembers : List (String × Data) → Bool
  | [] => true
  | (_, x) :: fs => x.wf && Data.wfMembers fs
end

mutual
theorem Data.wf_iff : ∀ j : Data, j.wf = true ↔ j.WellFormed
  | .num _ => ⟨fun _ => .num, fun _ => rfl⟩
  | .str _ => ⟨fun _ => .str, fun _ => rfl⟩
  | .bool _ => ⟨fun _ => .bool, fun _ => rfl⟩
  | .null => ⟨fun _ => .null, fun _ => rfl⟩
  | .map fs => by
    simp only [Data.wf, Bool.and_eq_true, decide_eq_true_eq]
    rw [Data.wfMembers_iff fs]
    exact ⟨fun ⟨h1, h2⟩ => .map h1 h2, fun h => by cases h; exact ⟨‹_›, ‹_›⟩⟩
  | .list xs => by
    simp only [Data.wf]
    rw [Data.wfAll_iff xs]
    exact ⟨.list, fun h => by cases h; assumption⟩

theorem Data.wfAll_iff : ∀ xs : List Data, Data.wfAll xs = true ↔ ∀ x, x ∈ xs → x.WellFormed
  | [] => by simp [Data.wfAll]
  | x :: xs => by
    simp only [Data.wfAll, Bool.and_eq_true, List.forall_mem_cons]
    rw [Data.wf_iff x, Data.wfAll_iff xs]

theorem Data.wfMembers_iff :
    ∀ fs : List (String × Data), Data.wfMembers fs = true ↔ ∀ k x, (k, x) ∈ fs → x.WellFormed
  | [] => by simp [Data.wfMembers]
  | (k, x) :: fs => by
    simp only [Data.wfMembers, Bool.and_eq_true, List.mem_cons, Prod.mk.injEq]
    rw [Data.wf_iff x, Data.wfMembers_iff fs]
    constructor
    · rintro ⟨hx, hfs⟩ k' x' (⟨rfl, rfl⟩ | h)
      · exact hx
      · exact hfs k' x' h
    · intro h
      exact ⟨h k x (.inl ⟨rfl, rfl⟩), fun k' x' h' => h k' x' (.inr h')⟩
end

instance (j : Data) : Decidable j.WellFormed := decidable_of_iff _ (Data.wf_iff j)

/-! ## Sameness, computed -/

mutual
/-- Whether `j` and `j'` are one value, computed: `Data.Same` decided. -/
def Data.same : Data → Data → Bool
  | .num x, .num y => decide (x = y)
  | .str s, .str t => decide (s = t)
  | .bool b, .bool c => decide (b = c)
  | .null, .null => true
  | .map fs, .map gs => Data.sameMembers gs [] fs && gs.all fun m => (lookup m.1 fs).isSome
  | .list xs, .list ys => Data.sameElems xs ys
  | _, _ => false

/-- Each key of `fs` not yet seen gives, in `gs`, the same value it
gives in `fs`; a key seen before is a duplicate, whose value `lookup`
never reaches. -/
def Data.sameMembers (gs : List (String × Data)) : List String → List (String × Data) → Bool
  | _, [] => true
  | seen, (k, x) :: fs =>
    (if k ∈ seen then true else
      match lookup k gs with
      | some y => x.same y
      | none => false) && Data.sameMembers gs (k :: seen) fs

def Data.sameElems : List Data → List Data → Bool
  | [], [] => true
  | x :: xs, y :: ys => x.same y && Data.sameElems xs ys
  | _, _ => false
end

/-- A key found by `lookup` is a key of the list. -/
theorem lookup_isSome_iff (k : String) (fs : List (String × Data)) :
    (lookup k fs).isSome = true ↔ ∃ x, (k, x) ∈ fs := by
  induction fs with
  | nil => simp [lookup]
  | cons f fs ih =>
    obtain ⟨k', x⟩ := f
    by_cases h : k = k'
    · subst h; simp [lookup]
    · simp [lookup, h, ih, Ne.symm h]

mutual
theorem Data.same_iff : ∀ j j' : Data, j.same j' = true ↔ j.Same j'
  | .num x, j' => by
    cases j' with
    | num y =>
      simp only [Data.same, decide_eq_true_eq]
      exact ⟨fun h => by subst h; exact .num, fun h => by cases h; rfl⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .str s, j' => by
    cases j' with
    | str t =>
      simp only [Data.same, decide_eq_true_eq]
      exact ⟨fun h => by subst h; exact .str, fun h => by cases h; rfl⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .bool b, j' => by
    cases j' with
    | bool c =>
      simp only [Data.same, decide_eq_true_eq]
      exact ⟨fun h => by subst h; exact .bool, fun h => by cases h; rfl⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .null, j' => by
    cases j' with
    | null => exact ⟨fun _ => .null, fun _ => rfl⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .map fs, j' => by
    cases j' with
    | map gs =>
      simp only [Data.same, Bool.and_eq_true, List.all_eq_true]
      rw [Data.sameMembers_iff gs [] fs]
      constructor
      · rintro ⟨h1, h2⟩
        refine .map (fun k => ?_) (fun k x y hx hy => ?_)
        · cases hf : lookup k fs with
          | none =>
            cases hg : lookup k gs with
            | none => rfl
            | some y =>
              obtain ⟨x, hx⟩ := (lookup_isSome_iff k gs).mp (by simp [hg])
              have := h2 (k, x) hx
              simp [hf] at this
          | some x =>
            obtain ⟨y, hy, -⟩ := h1 k x (by simp) hf
            simp [hf, hy]
        · obtain ⟨y', hy', hs⟩ := h1 k x (by simp) hx
          rw [hy] at hy'
          cases hy'
          exact hs
      · intro h
        cases h with
        | map h1 h2 =>
          refine ⟨fun k x _ hx => ?_, fun m hm => ?_⟩
          · have hg := h1 k
            rw [hx] at hg
            cases hgs : lookup k gs with
            | none => simp [hgs] at hg
            | some y => exact ⟨y, rfl, h2 k x y hx hgs⟩
          · have hg := h1 m.1
            have : (lookup m.1 gs).isSome = true := (lookup_isSome_iff m.1 gs).mpr ⟨m.2, hm⟩
            rw [this] at hg
            exact hg
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .list xs, j' => by
    cases j' with
    | list ys =>
      simp only [Data.same]
      rw [Data.sameElems_iff xs ys]
      exact ⟨fun ⟨h1, h2⟩ => .list h1 h2, fun h => by cases h; exact ⟨‹_›, ‹_›⟩⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩

theorem Data.sameMembers_iff (gs : List (String × Data)) :
    ∀ (seen : List String) (fs : List (String × Data)),
      Data.sameMembers gs seen fs = true ↔
        ∀ k x, k ∉ seen → lookup k fs = some x → ∃ y, lookup k gs = some y ∧ x.Same y
  | _, [] => by simp [Data.sameMembers, lookup]
  | seen, (k, x) :: fs => by
    simp only [Data.sameMembers, Bool.and_eq_true]
    rw [Data.sameMembers_iff gs (k :: seen) fs]
    constructor
    · rintro ⟨hh, ht⟩ k' x' hseen hl
      by_cases hk : k' = k
      · subst hk
        simp only [lookup, if_true, Option.some.injEq] at hl
        subst hl
        rw [if_neg hseen] at hh
        cases hg : lookup k' gs with
        | none => simp [hg] at hh
        | some y => simp only [hg] at hh; exact ⟨y, rfl, (Data.same_iff _ _).mp hh⟩
      · simp only [lookup, hk, if_false] at hl
        exact ht k' x' (by simp [hseen, hk]) hl
    · intro h
      constructor
      · by_cases hseen : k ∈ seen
        · simp [hseen]
        · rw [if_neg hseen]
          obtain ⟨y, hy, hs⟩ := h k x hseen (by simp [lookup])
          rw [hy]
          exact (Data.same_iff x y).mpr hs
      · intro k' x' hseen hl
        have hk : k' ≠ k := fun hk => hseen (hk ▸ List.mem_cons_self _ _)
        have hseen' : k' ∉ seen := fun hm => hseen (List.mem_cons_of_mem _ hm)
        refine h k' x' hseen' ?_
        simp only [lookup, hk, if_false]
        exact hl

theorem Data.sameElems_iff : ∀ xs ys : List Data,
    Data.sameElems xs ys = true ↔
      xs.length = ys.length ∧
        ∀ (i : ℕ) (x y : Data), xs[i]? = some x → ys[i]? = some y → x.Same y
  | [], [] => by simp [Data.sameElems]
  | [], _ :: _ => by
    simp only [Data.sameElems, List.length_nil, List.length_cons]
    exact ⟨(fun h => nomatch h), (fun ⟨h, _⟩ => nomatch h)⟩
  | _ :: _, [] => by
    simp only [Data.sameElems, List.length_nil, List.length_cons]
    exact ⟨(fun h => nomatch h), (fun ⟨h, _⟩ => nomatch h)⟩
  | x :: xs, y :: ys => by
    simp only [Data.sameElems, Bool.and_eq_true, List.length_cons]
    rw [Data.sameElems_iff xs ys, Data.same_iff x y]
    constructor
    · rintro ⟨hx, hlen, ht⟩
      refine ⟨by omega, fun i x' y' hx' hy' => ?_⟩
      cases i with
      | zero =>
        simp only [List.getElem?_cons_zero, Option.some.injEq] at hx' hy'
        subst hx'; subst hy'; exact hx
      | succ i =>
        simp only [List.getElem?_cons_succ] at hx' hy'
        exact ht i x' y' hx' hy'
    · rintro ⟨hlen, h⟩
      refine ⟨h 0 x y List.getElem?_cons_zero List.getElem?_cons_zero, by omega,
        fun i x' y' hx' hy' => ?_⟩
      exact h (i + 1) x' y' (by rw [List.getElem?_cons_succ]; exact hx')
        (by rw [List.getElem?_cons_succ]; exact hy')
end

instance (j j' : Data) : Decidable (j.Same j') := decidable_of_iff _ (Data.same_iff j j')

/-- Whether no two of `ms` project, under `k`, to one value. -/
def distinct (k : Option String) : List Data → Bool
  | [] => true
  | x :: ms =>
    ms.all (fun y => match x.project k, y.project k with
      | some x', some y' => !x'.same y'
      | _, _ => true) && distinct k ms

theorem distinct_iff (k : Option String) (ms : List Data) :
    distinct k ms = true ↔
      ms.Pairwise (fun x y => ∀ x' y', x.project k = some x' → y.project k = some y' →
        ¬ x'.Same y') := by
  induction ms with
  | nil => simp [distinct]
  | cons x ms ih =>
    simp only [distinct, Bool.and_eq_true, List.all_eq_true, ih, List.pairwise_cons]
    constructor
    · rintro ⟨h1, h2⟩
      refine ⟨fun y hy x' y' hx hy' => ?_, h2⟩
      have := h1 y hy
      simp only [hx, hy', Bool.not_eq_true'] at this
      exact fun hs => by rw [(Data.same_iff x' y').mpr hs] at this; cases this
    · rintro ⟨h1, h2⟩
      refine ⟨fun y hy => ?_, h2⟩
      cases hx : x.project k with
      | none => rfl
      | some x' =>
        cases hy' : y.project k with
        | none => rfl
        | some y' =>
          simp only [Bool.not_eq_true']
          cases hs : x'.same y' with
          | false => rfl
          | true => exact absurd ((Data.same_iff x' y').mp hs) (h1 y hy x' y' hx hy')

/-- The values `check` decides: those that read no alias, no path, no
pattern and no format, so that what they admit depends on no
declaration, no root, and no predicate of the host's. -/
inductive Val.Checkable : Val → Prop
  | integer : Checkable .integer
  | float : Checkable .float
  | biginteger : Checkable .biginteger
  | bigdecimal : Checkable .bigdecimal
  | number : Checkable .number
  | string : Checkable .string
  | anyString : Checkable .anyString
  | boolean : Checkable .boolean
  | lit {s : Scalar} : Checkable (.lit s)
  | min {b : Bound} : Checkable (.min b)
  | max {b : Bound} : Checkable (.max b)
  | above {b : Bound} : Checkable (.above b)
  | beneath {b : Bound} : Checkable (.beneath b)
  | neq {vs : List Bound} : Checkable (.neq vs)
  | multiple {d : Number} : Checkable (.multiple d)
  | len {c : Val} : Checkable c → Checkable (.len c)
  | unique {k : Option String} : Checkable (.unique k)
  | any : Checkable .any
  | nil : Checkable .nil
  | map {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool} :
      (∀ k o v, (k, o, v) ∈ fs → Checkable v) → (∀ s, spread = some s → Checkable s) →
      Checkable (.map fs spread closed)
  | list {items : List Val} {spread : Option Val} {closed : Bool} :
      (∀ v, v ∈ items → Checkable v) → (∀ s, spread = some s → Checkable s) →
      Checkable (.list items spread closed)
  | or {arms : List (ℕ × Val)} : (∀ r a, (r, a) ∈ arms → Checkable a) → Checkable (.or arms)
  | pref {r : ℕ} {x : Val} : Checkable x → Checkable (.pref r x)
  | meet {a b : Val} : Checkable a → Checkable b → Checkable (.meet a b)

mutual
/-- Whether a value is checkable, computed. -/
def Val.checkableB : Val → Bool
  | .alias _ | .path _ | .re _ | .format _ => false
  | .len c => c.checkableB
  | .map fs spread _ => fieldsCheckable fs && spreadCheckable spread
  | .list items spread _ => itemsCheckable items && spreadCheckable spread
  | .or arms => armsCheckable arms
  | .pref _ x => x.checkableB
  | .meet a b => a.checkableB && b.checkableB
  | _ => true

def fieldsCheckable : List (String × Bool × Val) → Bool
  | [] => true
  | (_, _, v) :: fs => v.checkableB && fieldsCheckable fs

def itemsCheckable : List Val → Bool
  | [] => true
  | v :: vs => v.checkableB && itemsCheckable vs

def spreadCheckable : Option Val → Bool
  | none => true
  | some s => s.checkableB

def armsCheckable : List (ℕ × Val) → Bool
  | [] => true
  | (_, a) :: arms => a.checkableB && armsCheckable arms
end

mutual
theorem Val.checkableB_iff : ∀ v : Val, v.checkableB = true ↔ v.Checkable
  | .integer => ⟨fun _ => .integer, fun _ => rfl⟩
  | .float => ⟨fun _ => .float, fun _ => rfl⟩
  | .biginteger => ⟨fun _ => .biginteger, fun _ => rfl⟩
  | .bigdecimal => ⟨fun _ => .bigdecimal, fun _ => rfl⟩
  | .number => ⟨fun _ => .number, fun _ => rfl⟩
  | .string => ⟨fun _ => .string, fun _ => rfl⟩
  | .anyString => ⟨fun _ => .anyString, fun _ => rfl⟩
  | .boolean => ⟨fun _ => .boolean, fun _ => rfl⟩
  | .lit _ => ⟨fun _ => .lit, fun _ => rfl⟩
  | .min _ => ⟨fun _ => .min, fun _ => rfl⟩
  | .max _ => ⟨fun _ => .max, fun _ => rfl⟩
  | .above _ => ⟨fun _ => .above, fun _ => rfl⟩
  | .beneath _ => ⟨fun _ => .beneath, fun _ => rfl⟩
  | .neq _ => ⟨fun _ => .neq, fun _ => rfl⟩
  | .multiple _ => ⟨fun _ => .multiple, fun _ => rfl⟩
  | .unique _ => ⟨fun _ => .unique, fun _ => rfl⟩
  | .any => ⟨fun _ => .any, fun _ => rfl⟩
  | .nil => ⟨fun _ => .nil, fun _ => rfl⟩
  | .re _ => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .format _ => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .alias _ => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .path _ => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .len c => by
    simp only [Val.checkableB]
    rw [Val.checkableB_iff c]
    exact ⟨.len, fun h => by cases h; assumption⟩
  | .map fs spread closed => by
    simp only [Val.checkableB, Bool.and_eq_true]
    rw [fieldsCheckable_iff fs, spreadCheckable_iff spread]
    exact ⟨fun ⟨h1, h2⟩ => .map h1 h2, fun h => by cases h; exact ⟨‹_›, ‹_›⟩⟩
  | .list items spread closed => by
    simp only [Val.checkableB, Bool.and_eq_true]
    rw [itemsCheckable_iff items, spreadCheckable_iff spread]
    exact ⟨fun ⟨h1, h2⟩ => .list h1 h2, fun h => by cases h; exact ⟨‹_›, ‹_›⟩⟩
  | .or arms => by
    simp only [Val.checkableB]
    rw [armsCheckable_iff arms]
    exact ⟨.or, fun h => by cases h; assumption⟩
  | .pref r x => by
    simp only [Val.checkableB]
    rw [Val.checkableB_iff x]
    exact ⟨.pref, fun h => by cases h; assumption⟩
  | .meet a b => by
    simp only [Val.checkableB, Bool.and_eq_true]
    rw [Val.checkableB_iff a, Val.checkableB_iff b]
    exact ⟨fun ⟨h1, h2⟩ => .meet h1 h2, fun h => by cases h; exact ⟨‹_›, ‹_›⟩⟩

theorem fieldsCheckable_iff : ∀ fs : List (String × Bool × Val),
    fieldsCheckable fs = true ↔ ∀ k o v, (k, o, v) ∈ fs → v.Checkable
  | [] => by simp [fieldsCheckable]
  | (k, o, v) :: fs => by
    simp only [fieldsCheckable, Bool.and_eq_true, List.mem_cons, Prod.mk.injEq]
    rw [Val.checkableB_iff v, fieldsCheckable_iff fs]
    constructor
    · rintro ⟨hv, hfs⟩ k' o' v' (⟨rfl, rfl, rfl⟩ | h)
      · exact hv
      · exact hfs k' o' v' h
    · intro h
      exact ⟨h k o v (.inl ⟨rfl, rfl, rfl⟩), fun k' o' v' h' => h k' o' v' (.inr h')⟩

theorem itemsCheckable_iff : ∀ items : List Val,
    itemsCheckable items = true ↔ ∀ v, v ∈ items → v.Checkable
  | [] => by simp [itemsCheckable]
  | v :: vs => by
    simp only [itemsCheckable, Bool.and_eq_true, List.forall_mem_cons]
    rw [Val.checkableB_iff v, itemsCheckable_iff vs]

theorem spreadCheckable_iff : ∀ spread : Option Val,
    spreadCheckable spread = true ↔ ∀ s, spread = some s → s.Checkable
  | none => by simp [spreadCheckable]
  | some s => by
    simp only [spreadCheckable, Option.some.injEq, forall_eq']
    exact Val.checkableB_iff s

theorem armsCheckable_iff : ∀ arms : List (ℕ × Val),
    armsCheckable arms = true ↔ ∀ r a, (r, a) ∈ arms → a.Checkable
  | [] => by simp [armsCheckable]
  | (r, a) :: arms => by
    simp only [armsCheckable, Bool.and_eq_true, List.mem_cons, Prod.mk.injEq]
    rw [Val.checkableB_iff a, armsCheckable_iff arms]
    constructor
    · rintro ⟨ha, harms⟩ r' a' (⟨rfl, rfl⟩ | h)
      · exact ha
      · exact harms r' a' h
    · intro h
      exact ⟨h r a (.inl ⟨rfl, rfl⟩), fun r' a' h' => h r' a' (.inr h')⟩
end

instance (v : Val) : Decidable v.Checkable := decidable_of_iff _ (Val.checkableB_iff v)

/-- A disjunction of two checkable arms is checkable. -/
theorem checkable_or₂ {r₁ r₂ : ℕ} {a b : Val} (ha : a.Checkable) (hb : b.Checkable) :
    Val.Checkable (.or [(r₁, a), (r₂, b)]) := by
  refine .or fun r v hm => ?_
  simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
  rcases hm with ⟨-, rfl⟩ | ⟨-, rfl⟩
  · exact ha
  · exact hb

/-- Whether `j` is in the domain of a bound: a number for a numeric end,
a string, not `""`, for a string end. -/
def checkDomain : Bound → Data → Bool
  | .num _, .num _ => true
  | .str _, .str t => decide (t ≠ "")
  | _, _ => false

/-! ## The weight of a datum

The number of nodes a datum holds: a member of a container weighs less
than the container, which is what a checker that unfolds names against
the data consumes. -/

mutual
def Data.weight : Data → ℕ
  | .map fs => weightMembers fs + 1
  | .list xs => weightElems xs + 1
  | _ => 1

def weightMembers : List (String × Data) → ℕ
  | [] => 0
  | (_, x) :: fs => x.weight + weightMembers fs

def weightElems : List Data → ℕ
  | [] => 0
  | x :: xs => x.weight + weightElems xs
end

theorem Data.weight_pos : ∀ j : Data, 1 ≤ j.weight
  | .map _ => Nat.le_add_left _ _
  | .list _ => Nat.le_add_left _ _
  | .num _ | .str _ | .bool _ | .null => Nat.le_refl _

theorem weightMembers_ge : ∀ {fs : List (String × Data)} {m : String × Data}, m ∈ fs →
    m.2.weight ≤ weightMembers fs
  | [], _, h => absurd h (List.not_mem_nil _)
  | (k, x) :: fs, m, h => by
    rcases List.mem_cons.mp h with rfl | h'
    · exact Nat.le_add_right _ _
    · exact Nat.le_trans (weightMembers_ge h') (Nat.le_add_left _ _)

theorem weightElems_ge : ∀ {xs : List Data} {x : Data}, x ∈ xs → x.weight ≤ weightElems xs
  | [], _, h => absurd h (List.not_mem_nil _)
  | y :: xs, x, h => by
    rcases List.mem_cons.mp h with rfl | h'
    · exact Nat.le_add_right _ _
    · exact Nat.le_trans (weightElems_ge h') (Nat.le_add_left _ _)

theorem Data.weight_lt_of_mem_members {fs : List (String × Data)} {m : String × Data} (h : m ∈ fs) :
    m.2.weight < (Data.map fs).weight :=
  Nat.lt_succ_of_le (weightMembers_ge h)

theorem mem_of_lookup {k : String} {x : Data} : ∀ {fs : List (String × Data)},
    lookup k fs = some x → (k, x) ∈ fs
  | [], h => nomatch h
  | (k', y) :: fs, h => by
    simp only [lookup] at h
    split at h
    · rename_i hk
      cases h
      exact hk ▸ List.mem_cons_self _ _
    · exact List.mem_cons_of_mem _ (mem_of_lookup h)

theorem Data.weight_lt_of_lookup {fs : List (String × Data)} {k : String} {x : Data}
    (h : lookup k fs = some x) : x.weight < (Data.map fs).weight :=
  Data.weight_lt_of_mem_members (m := (k, x)) (mem_of_lookup h)

theorem Data.weight_lt_of_mem_elems {xs : List Data} {x : Data} (h : x ∈ xs) :
    x.weight < (Data.list xs).weight :=
  Nat.lt_succ_of_le (weightElems_ge h)

theorem Data.weight_lt_of_getElem? {xs : List Data} {i : ℕ} {x : Data} (h : xs[i]? = some x) :
    x.weight < (Data.list xs).weight :=
  Data.weight_lt_of_mem_elems (List.mem_of_getElem? h)

/-! ## Where a term's names stand -/

theorem mem_refsFields {fs : List (String × Bool × Val)} {n : String} :
    n ∈ refsFields fs ↔ ∃ k o v, (k, o, v) ∈ fs ∧ n ∈ v.refs := by
  induction fs with
  | nil => simp [refsFields]
  | cons f fs ih =>
    obtain ⟨k, o, v⟩ := f
    simp only [refsFields, List.mem_append, ih, List.mem_cons, Prod.mk.injEq]
    constructor
    · rintro (h | ⟨k', o', v', hm, h⟩)
      · exact ⟨k, o, v, Or.inl ⟨rfl, rfl, rfl⟩, h⟩
      · exact ⟨k', o', v', Or.inr hm, h⟩
    · rintro ⟨k', o', v', ⟨rfl, rfl, rfl⟩ | hm, h⟩
      · exact Or.inl h
      · exact Or.inr ⟨k', o', v', hm, h⟩

theorem mem_refsItems {items : List Val} {n : String} :
    n ∈ refsItems items ↔ ∃ v, v ∈ items ∧ n ∈ v.refs := by
  induction items with
  | nil => simp [refsItems]
  | cons v vs ih =>
    simp only [refsItems, List.mem_append, ih, List.mem_cons]
    constructor
    · rintro (h | ⟨w, hm, h⟩)
      · exact ⟨v, Or.inl rfl, h⟩
      · exact ⟨w, Or.inr hm, h⟩
    · rintro ⟨w, rfl | hm, h⟩
      · exact Or.inl h
      · exact Or.inr ⟨w, hm, h⟩

theorem mem_refsArms {arms : List (ℕ × Val)} {n : String} :
    n ∈ refsArms arms ↔ ∃ r a, (r, a) ∈ arms ∧ n ∈ a.refs := by
  induction arms with
  | nil => simp [refsArms]
  | cons p arms ih =>
    obtain ⟨r, a⟩ := p
    simp only [refsArms, List.mem_append, ih, List.mem_cons, Prod.mk.injEq]
    constructor
    · rintro (h | ⟨r', a', hm, h⟩)
      · exact ⟨r, a, Or.inl ⟨rfl, rfl⟩, h⟩
      · exact ⟨r', a', Or.inr hm, h⟩
    · rintro ⟨r', a', ⟨rfl, rfl⟩ | hm, h⟩
      · exact Or.inl h
      · exact Or.inr ⟨r', a', hm, h⟩

theorem mem_unguardedArms {arms : List (ℕ × Val)} {n : String} :
    n ∈ unguardedArms arms ↔ ∃ r a, (r, a) ∈ arms ∧ n ∈ a.unguardedRefs := by
  induction arms with
  | nil => simp [unguardedArms]
  | cons p arms ih =>
    obtain ⟨r, a⟩ := p
    simp only [unguardedArms, List.mem_append, ih, List.mem_cons, Prod.mk.injEq]
    constructor
    · rintro (h | ⟨r', a', hm, h⟩)
      · exact ⟨r, a, Or.inl ⟨rfl, rfl⟩, h⟩
      · exact ⟨r', a', Or.inr hm, h⟩
    · rintro ⟨r', a', ⟨rfl, rfl⟩ | hm, h⟩
      · exact Or.inl h
      · exact Or.inr ⟨r', a', hm, h⟩

/-! ## What the checker can be told about names

The checker recurses on the term, and where it meets a name it asks a
hook, `unfold`, which a checker that reads declarations supplies. The
hook is answerable for a name at a datum no heavier than the one in
hand, and at one as heavy only where the name stands with no key and no
element between: that is where the checker asks. -/

/-- What the hook decides rightly, at a term and a datum. -/
def HookOk (unfold : String → Data → Bool) (env : Env) (root : Data) (v : Val) (j : Data) : Prop :=
  ∀ k j', ((j'.weight < j.weight ∧ k ∈ v.refs) ∨ (j'.weight = j.weight ∧ k ∈ v.unguardedRefs)) →
    (unfold k j' = true ↔ Admits env root (.alias k) j')

section
variable {u : String → Data → Bool} {env : Env} {root : Data}

theorem HookOk.sub {v v' : Val} {j x : Data} (h : HookOk u env root v j) (hw : x.weight ≤ j.weight)
    (hr : ∀ k, k ∈ v'.refs → k ∈ v.refs)
    (hu : x.weight = j.weight → ∀ k, k ∈ v'.unguardedRefs → k ∈ v.unguardedRefs) :
    HookOk u env root v' x := by
  intro k j' hk
  apply h k j'
  rcases hk with ⟨hlt, hk⟩ | ⟨heq, hk⟩
  · exact .inl ⟨Nat.lt_of_lt_of_le hlt hw, hr k hk⟩
  · rcases Nat.lt_or_eq_of_le hw with hlt | heq'
    · exact .inl ⟨heq ▸ hlt, hr k (unguardedRefs_sub_refs _ _ hk)⟩
    · exact .inr ⟨heq.trans heq', hu heq' k hk⟩

theorem HookOk.strict {v v' : Val} {j x : Data} (h : HookOk u env root v j) (hw : x.weight < j.weight)
    (hr : ∀ k, k ∈ v'.refs → k ∈ v.refs) : HookOk u env root v' x :=
  h.sub (Nat.le_of_lt hw) hr fun heq => absurd heq (Nat.ne_of_lt hw)

theorem HookOk.same {v v' : Val} {j : Data} (h : HookOk u env root v j)
    (hr : ∀ k, k ∈ v'.refs → k ∈ v.refs) (hu : ∀ k, k ∈ v'.unguardedRefs → k ∈ v.unguardedRefs) :
    HookOk u env root v' j :=
  h.sub (Nat.le_refl _) hr fun _ => hu

theorem HookOk.field {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool}
    {jfs : List (String × Data)} {k : String} {o : Bool} {v : Val} {x : Data}
    (h : HookOk u env root (.map fs spread closed) (.map jfs)) (hm : (k, o, v) ∈ fs)
    (hx : lookup k jfs = some x) : HookOk u env root v x :=
  h.strict (Data.weight_lt_of_lookup hx) fun n hn => by
    simp only [Val.refs, List.mem_append]
    exact .inl (mem_refsFields.mpr ⟨k, o, v, hm, hn⟩)

theorem HookOk.mapSpread {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool}
    {jfs : List (String × Data)} {s : Val} {m : String × Data}
    (h : HookOk u env root (.map fs spread closed) (.map jfs)) (hs : spread = some s) (hm : m ∈ jfs) :
    HookOk u env root s m.2 :=
  h.strict (Data.weight_lt_of_mem_members hm) fun n hn => by
    simp only [Val.refs, List.mem_append, hs, refsSpread]
    exact .inr hn

theorem HookOk.item {items : List Val} {spread : Option Val} {closed : Bool} {xs : List Data}
    {i : ℕ} {v : Val} {x : Data} (h : HookOk u env root (.list items spread closed) (.list xs))
    (hv : items[i]? = some v) (hx : xs[i]? = some x) : HookOk u env root v x :=
  h.strict (Data.weight_lt_of_getElem? hx) fun n hn => by
    simp only [Val.refs, List.mem_append]
    exact .inl (mem_refsItems.mpr ⟨v, List.mem_of_getElem? hv, hn⟩)

theorem HookOk.listSpread {items : List Val} {spread : Option Val} {closed : Bool} {xs : List Data}
    {s : Val} {x : Data} (h : HookOk u env root (.list items spread closed) (.list xs))
    (hs : spread = some s) (hm : x ∈ xs) : HookOk u env root s x :=
  h.strict (Data.weight_lt_of_mem_elems hm) fun n hn => by
    simp only [Val.refs, List.mem_append, hs, refsSpread]
    exact .inr hn

theorem HookOk.arm {arms : List (ℕ × Val)} {j : Data} {r : ℕ} {a : Val}
    (h : HookOk u env root (.or arms) j) (hm : (r, a) ∈ arms) : HookOk u env root a j :=
  h.same (fun n hn => by simp only [Val.refs]; exact mem_refsArms.mpr ⟨r, a, hm, hn⟩)
    (fun n hn => by simp only [Val.unguardedRefs]; exact mem_unguardedArms.mpr ⟨r, a, hm, hn⟩)

theorem HookOk.pref {r : ℕ} {x : Val} {j : Data} (h : HookOk u env root (.pref r x) j) :
    HookOk u env root x j :=
  h.same (fun n hn => by simpa [Val.refs] using hn) (fun n hn => by simpa [Val.unguardedRefs] using hn)

theorem HookOk.meetLeft {a b : Val} {j : Data} (h : HookOk u env root (.meet a b) j) :
    HookOk u env root a j :=
  h.same (fun n hn => by simp only [Val.refs, List.mem_append]; exact .inl hn)
    (fun n hn => by simp only [Val.unguardedRefs, List.mem_append]; exact .inl hn)

theorem HookOk.meetRight {a b : Val} {j : Data} (h : HookOk u env root (.meet a b) j) :
    HookOk u env root b j :=
  h.same (fun n hn => by simp only [Val.refs, List.mem_append]; exact .inr hn)
    (fun n hn => by simp only [Val.unguardedRefs, List.mem_append]; exact .inr hn)

theorem HookOk.len {c : Val} {j : Data} {n : Number} (h : HookOk u env root (.len c) j) :
    HookOk u env root c (.num n) :=
  h.sub (Data.weight_pos j) (fun k hk => by simpa [Val.refs] using hk)
    (fun _ k hk => by simpa [Val.unguardedRefs] using hk)

theorem HookOk.alias {k : String} {j : Data} (h : HookOk u env root (.alias k) j) :
    u k j = true ↔ Admits env root (.alias k) j :=
  h k j (.inr ⟨rfl, by simp [Val.unguardedRefs]⟩)

end

/-- The values the checker decides, given a hook for the names: those
that read no path, no pattern and no format. -/
inductive Val.CheckableA : Val → Prop
  | integer : CheckableA .integer
  | float : CheckableA .float
  | biginteger : CheckableA .biginteger
  | bigdecimal : CheckableA .bigdecimal
  | number : CheckableA .number
  | string : CheckableA .string
  | anyString : CheckableA .anyString
  | boolean : CheckableA .boolean
  | lit {s : Scalar} : CheckableA (.lit s)
  | min {b : Bound} : CheckableA (.min b)
  | max {b : Bound} : CheckableA (.max b)
  | above {b : Bound} : CheckableA (.above b)
  | beneath {b : Bound} : CheckableA (.beneath b)
  | neq {vs : List Bound} : CheckableA (.neq vs)
  | multiple {d : Number} : CheckableA (.multiple d)
  | len {c : Val} : CheckableA c → CheckableA (.len c)
  | unique {k : Option String} : CheckableA (.unique k)
  | any : CheckableA .any
  | nil : CheckableA .nil
  | map {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool} :
      (∀ k o v, (k, o, v) ∈ fs → CheckableA v) → (∀ s, spread = some s → CheckableA s) →
      CheckableA (.map fs spread closed)
  | list {items : List Val} {spread : Option Val} {closed : Bool} :
      (∀ v, v ∈ items → CheckableA v) → (∀ s, spread = some s → CheckableA s) →
      CheckableA (.list items spread closed)
  | or {arms : List (ℕ × Val)} : (∀ r a, (r, a) ∈ arms → CheckableA a) → CheckableA (.or arms)
  | pref {r : ℕ} {x : Val} : CheckableA x → CheckableA (.pref r x)
  | meet {a b : Val} : CheckableA a → CheckableA b → CheckableA (.meet a b)
  | alias {n : String} : CheckableA (.alias n)

mutual
/-- Whether a value is checkable given a hook, computed. -/
def Val.checkableAB : Val → Bool
  | .path _ | .re _ | .format _ => false
  | .len c => c.checkableAB
  | .map fs spread _ => fieldsCheckableA fs && spreadCheckableA spread
  | .list items spread _ => itemsCheckableA items && spreadCheckableA spread
  | .or arms => armsCheckableA arms
  | .pref _ x => x.checkableAB
  | .meet a b => a.checkableAB && b.checkableAB
  | _ => true

def fieldsCheckableA : List (String × Bool × Val) → Bool
  | [] => true
  | (_, _, v) :: fs => v.checkableAB && fieldsCheckableA fs

def itemsCheckableA : List Val → Bool
  | [] => true
  | v :: vs => v.checkableAB && itemsCheckableA vs

def spreadCheckableA : Option Val → Bool
  | none => true
  | some s => s.checkableAB

def armsCheckableA : List (ℕ × Val) → Bool
  | [] => true
  | (_, a) :: arms => a.checkableAB && armsCheckableA arms
end

mutual
theorem Val.checkableAB_iff : ∀ v : Val, v.checkableAB = true ↔ v.CheckableA
  | .integer => ⟨fun _ => .integer, fun _ => rfl⟩
  | .float => ⟨fun _ => .float, fun _ => rfl⟩
  | .biginteger => ⟨fun _ => .biginteger, fun _ => rfl⟩
  | .bigdecimal => ⟨fun _ => .bigdecimal, fun _ => rfl⟩
  | .number => ⟨fun _ => .number, fun _ => rfl⟩
  | .string => ⟨fun _ => .string, fun _ => rfl⟩
  | .anyString => ⟨fun _ => .anyString, fun _ => rfl⟩
  | .boolean => ⟨fun _ => .boolean, fun _ => rfl⟩
  | .lit _ => ⟨fun _ => .lit, fun _ => rfl⟩
  | .min _ => ⟨fun _ => .min, fun _ => rfl⟩
  | .max _ => ⟨fun _ => .max, fun _ => rfl⟩
  | .above _ => ⟨fun _ => .above, fun _ => rfl⟩
  | .beneath _ => ⟨fun _ => .beneath, fun _ => rfl⟩
  | .neq _ => ⟨fun _ => .neq, fun _ => rfl⟩
  | .multiple _ => ⟨fun _ => .multiple, fun _ => rfl⟩
  | .unique _ => ⟨fun _ => .unique, fun _ => rfl⟩
  | .any => ⟨fun _ => .any, fun _ => rfl⟩
  | .nil => ⟨fun _ => .nil, fun _ => rfl⟩
  | .alias _ => ⟨fun _ => .alias, fun _ => rfl⟩
  | .re _ => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .format _ => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .path _ => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .len c => by
    simp only [Val.checkableAB]
    rw [Val.checkableAB_iff c]
    exact ⟨.len, fun h => by cases h; assumption⟩
  | .map fs spread closed => by
    simp only [Val.checkableAB, Bool.and_eq_true]
    rw [fieldsCheckableA_iff fs, spreadCheckableA_iff spread]
    exact ⟨fun ⟨h1, h2⟩ => .map h1 h2, fun h => by cases h; exact ⟨‹_›, ‹_›⟩⟩
  | .list items spread closed => by
    simp only [Val.checkableAB, Bool.and_eq_true]
    rw [itemsCheckableA_iff items, spreadCheckableA_iff spread]
    exact ⟨fun ⟨h1, h2⟩ => .list h1 h2, fun h => by cases h; exact ⟨‹_›, ‹_›⟩⟩
  | .or arms => by
    simp only [Val.checkableAB]
    rw [armsCheckableA_iff arms]
    exact ⟨.or, fun h => by cases h; assumption⟩
  | .pref r x => by
    simp only [Val.checkableAB]
    rw [Val.checkableAB_iff x]
    exact ⟨.pref, fun h => by cases h; assumption⟩
  | .meet a b => by
    simp only [Val.checkableAB, Bool.and_eq_true]
    rw [Val.checkableAB_iff a, Val.checkableAB_iff b]
    exact ⟨fun ⟨h1, h2⟩ => .meet h1 h2, fun h => by cases h; exact ⟨‹_›, ‹_›⟩⟩

theorem fieldsCheckableA_iff : ∀ fs : List (String × Bool × Val),
    fieldsCheckableA fs = true ↔ ∀ k o v, (k, o, v) ∈ fs → v.CheckableA
  | [] => by simp [fieldsCheckableA]
  | (k, o, v) :: fs => by
    simp only [fieldsCheckableA, Bool.and_eq_true, List.mem_cons, Prod.mk.injEq]
    rw [Val.checkableAB_iff v, fieldsCheckableA_iff fs]
    constructor
    · rintro ⟨hv, hfs⟩ k' o' v' (⟨rfl, rfl, rfl⟩ | h)
      · exact hv
      · exact hfs k' o' v' h
    · intro h
      exact ⟨h k o v (.inl ⟨rfl, rfl, rfl⟩), fun k' o' v' h' => h k' o' v' (.inr h')⟩

theorem itemsCheckableA_iff : ∀ items : List Val,
    itemsCheckableA items = true ↔ ∀ v, v ∈ items → v.CheckableA
  | [] => by simp [itemsCheckableA]
  | v :: vs => by
    simp only [itemsCheckableA, Bool.and_eq_true, List.forall_mem_cons]
    rw [Val.checkableAB_iff v, itemsCheckableA_iff vs]

theorem spreadCheckableA_iff : ∀ spread : Option Val,
    spreadCheckableA spread = true ↔ ∀ s, spread = some s → s.CheckableA
  | none => by simp [spreadCheckableA]
  | some s => by
    simp only [spreadCheckableA, Option.some.injEq, forall_eq']
    exact Val.checkableAB_iff s

theorem armsCheckableA_iff : ∀ arms : List (ℕ × Val),
    armsCheckableA arms = true ↔ ∀ r a, (r, a) ∈ arms → a.CheckableA
  | [] => by simp [armsCheckableA]
  | (r, a) :: arms => by
    simp only [armsCheckableA, Bool.and_eq_true, List.mem_cons, Prod.mk.injEq]
    rw [Val.checkableAB_iff a, armsCheckableA_iff arms]
    constructor
    · rintro ⟨ha, harms⟩ r' a' (⟨rfl, rfl⟩ | h)
      · exact ha
      · exact harms r' a' h
    · intro h
      exact ⟨h r a (.inl ⟨rfl, rfl⟩), fun r' a' h' => h r' a' (.inr h')⟩
end

instance (v : Val) : Decidable v.CheckableA := decidable_of_iff _ (Val.checkableAB_iff v)

/-- A checkable value is checkable given any hook. -/
theorem Val.Checkable.toA {v : Val} (h : v.Checkable) : v.CheckableA := by
  induction h with
  | integer => exact .integer
  | float => exact .float
  | biginteger => exact .biginteger
  | bigdecimal => exact .bigdecimal
  | number => exact .number
  | string => exact .string
  | anyString => exact .anyString
  | boolean => exact .boolean
  | lit => exact .lit
  | min => exact .min
  | max => exact .max
  | above => exact .above
  | beneath => exact .beneath
  | neq => exact .neq
  | multiple => exact .multiple
  | len _ ih => exact .len ih
  | unique => exact .unique
  | any => exact .any
  | nil => exact .nil
  | map _ _ ihf ihs => exact .map ihf ihs
  | list _ _ ihi ihs => exact .list ihi ihs
  | or _ ih => exact .or ih
  | pref _ ih => exact .pref ih
  | meet _ _ iha ihb => exact .meet iha ihb

/-- A value the checker can read given a hook, which refers to no name,
is checkable with none. -/
theorem Val.CheckableA.toChecked {v : Val} (h : v.CheckableA) (hn : ∀ n, n ∉ v.refs) : v.Checkable := by
  induction h with
  | len _ ih => exact .len (ih fun n hn' => hn n (by simpa [Val.refs] using hn'))
  | @map fs spread closed _ _ ihf ihs =>
    refine .map (fun k o v hm => ihf k o v hm fun n hn' => hn n ?_) (fun s hs => ihs s hs fun n hn' => hn n ?_)
    · simp only [Val.refs, List.mem_append]
      exact .inl (mem_refsFields.mpr ⟨k, o, v, hm, hn'⟩)
    · simp only [Val.refs, List.mem_append, hs, refsSpread]
      exact .inr hn'
  | @list items spread closed _ _ ihi ihs =>
    refine .list (fun v hm => ihi v hm fun n hn' => hn n ?_) (fun s hs => ihs s hs fun n hn' => hn n ?_)
    · simp only [Val.refs, List.mem_append]
      exact .inl (mem_refsItems.mpr ⟨v, hm, hn'⟩)
    · simp only [Val.refs, List.mem_append, hs, refsSpread]
      exact .inr hn'
  | or _ ih =>
    exact .or fun r a hm => ih r a hm fun n hn' => hn n (by
      simp only [Val.refs]; exact mem_refsArms.mpr ⟨r, a, hm, hn'⟩)
  | pref _ ih => exact .pref (ih fun n hn' => hn n (by simpa [Val.refs] using hn'))
  | meet _ _ iha ihb =>
    exact .meet (iha fun n hn' => hn n (by simp only [Val.refs, List.mem_append]; exact .inl hn'))
      (ihb fun n hn' => hn n (by simp only [Val.refs, List.mem_append]; exact .inr hn'))
  | @alias n => exact absurd (by simp [Val.refs]) (hn n)
  | _ => constructor

/-- A checkable value refers to no name. -/
theorem Val.Checkable.no_refs {v : Val} (h : v.Checkable) : ∀ n, n ∉ v.refs := by
  induction h with
  | len _ ih => intro n hn; exact ih n (by simpa [Val.refs] using hn)
  | @map fs spread closed _ _ ihf ihs =>
    intro n hn
    simp only [Val.refs, List.mem_append] at hn
    rcases hn with hn | hn
    · obtain ⟨k, o, v, hm, hv⟩ := mem_refsFields.mp hn
      exact ihf k o v hm n hv
    · cases hs : spread with
      | none => rw [hs] at hn; exact absurd hn (List.not_mem_nil n)
      | some s => rw [hs] at hn; exact ihs s hs n hn
  | @list items spread closed _ _ ihi ihs =>
    intro n hn
    simp only [Val.refs, List.mem_append] at hn
    rcases hn with hn | hn
    · obtain ⟨v, hm, hv⟩ := mem_refsItems.mp hn
      exact ihi v hm n hv
    · cases hs : spread with
      | none => rw [hs] at hn; exact absurd hn (List.not_mem_nil n)
      | some s => rw [hs] at hn; exact ihs s hs n hn
  | or _ ih =>
    intro n hn
    simp only [Val.refs] at hn
    obtain ⟨r, a, hm, ha⟩ := mem_refsArms.mp hn
    exact ih r a hm n ha
  | pref _ ih => intro n hn; exact ih n (by simpa [Val.refs] using hn)
  | meet _ _ iha ihb =>
    intro n hn
    simp only [Val.refs, List.mem_append] at hn
    exact hn.elim (iha n) (ihb n)
  | _ => intro n hn; simp [Val.refs] at hn

mutual
/-- Whether `v` admits `j`, computed. -/
def checkWith (u : String → Data → Bool) : Val → Data → Bool
  | .integer, j => match j with
    | .num (.integer _) => true
    | _ => false
  | .float, j => match j with
    | .num (.float _) => true
    | _ => false
  | .biginteger, j => match j with
    | .num (.biginteger _) => true
    | _ => false
  | .bigdecimal, j => match j with
    | .num (.bigdecimal _) => true
    | _ => false
  | .number, j => match j with
    | .num _ => true
    | _ => false
  | .string, j => match j with
    | .str s => decide (s ≠ "")
    | _ => false
  | .anyString, j => match j with
    | .str _ => true
    | _ => false
  | .boolean, j => match j with
    | .bool _ => true
    | _ => false
  | .lit s, j => match s, j with
    | .num x, .num y => decide (x = y)
    | .str s, .str s' => decide (s = s')
    | .bool b, .bool b' => decide (b = b')
    | .null, .null => true
    | _, _ => false
  | .min b, j => match b, j with
    | .num n, .num x => decide (n.le x)
    | .str b, .str s => decide (b ≤ s)
    | _, _ => false
  | .max b, j => match b, j with
    | .num n, .num x => decide (x.le n)
    | .str b, .str s => decide (s ≤ b)
    | _, _ => false
  | .above b, j => match b, j with
    | .num n, .num x => decide (n.lt x)
    | .str b, .str s => decide (b < s)
    | _, _ => false
  | .beneath b, j => match b, j with
    | .num n, .num x => decide (x.lt n)
    | .str b, .str s => decide (s < b)
    | _, _ => false
  | .neq vs, j => match j with
    | .num x => vs.all fun v => match v with
      | .num n => decide (n ≠ x)
      | .str _ => false
    | .str s => vs.all fun v => match v with
      | .str t => decide (t ≠ s)
      | .num _ => false
    | _ => false
  | .multiple d, j => match j with
    | .num x => decide d.Positive && decide (x.multipleOf d)
    | _ => false
  | .len c, j => match j.size with
    | some n => if h : IntegerLeaf n then checkWith u c (.num (.integer ⟨n, h⟩)) else false
    | none => false
  | .unique k, j => match j.members with
    | some ms => ms.all (fun x => (x.project k).isSome) && distinct k ms
    | none => false
  | .any, _ => true
  | .nil, _ => false
  | .map fs spread closed, j => match j with
    | .map jfs =>
      checkFieldsWith u fs jfs && jfs.all (fun m => checkSpreadWith u spread m.2) &&
        (!closed || jfs.all fun m => fs.any fun f => decide (f.1 = m.1))
    | _ => false
  | .list items spread closed, j => match j with
    | .list xs =>
      decide (items.length ≤ xs.length) &&
        (!closed || spread.isSome || decide (xs.length = items.length)) &&
        checkItemsWith u items xs && xs.all (fun x => checkSpreadWith u spread x)
    | _ => false
  | .or arms, j => checkArmsWith u arms j
  | .pref _ x, j => checkWith u x j || checkSuperWith u x j
  | .meet a b, j => checkWith u a j && checkWith u b j
  | .re _, _ => false
  | .format _, _ => false
  | .alias k, j => u k j
  | .path _, _ => false

/-- The declared keys of a map: each present one holds its value, and
each absent one is optional. -/
def checkFieldsWith (u : String → Data → Bool) : List (String × Bool × Val) → List (String × Data) → Bool
  | [], _ => true
  | (k, o, v) :: fs, jfs =>
    (match lookup k jfs with
      | none => o
      | some x => checkWith u v x) && checkFieldsWith u fs jfs

/-- The positions of a list that the instance has. -/
def checkItemsWith (u : String → Data → Bool) : List Val → List Data → Bool
  | v :: vs, x :: xs => checkWith u v x && checkItemsWith u vs xs
  | _, _ => true

/-- A spread, where there is one. -/
def checkSpreadWith (u : String → Data → Bool) : Option Val → Data → Bool
  | none, _ => true
  | some s, x => checkWith u s x

/-- Whether any arm admits. -/
def checkArmsWith (u : String → Data → Bool) : List (ℕ × Val) → Data → Bool
  | [], _ => false
  | (_, a) :: arms, j => checkWith u a j || checkArmsWith u arms j

/-- Whether `v.super`, the parent type of `v`, admits `j`: `check` on
`v.super`, written by recursion on `v`, since `v.super` is no part of
`v` for `check` to recurse into. -/
def checkSuperWith (u : String → Data → Bool) : Val → Data → Bool
  | .integer, j | .float, j | .biginteger, j | .bigdecimal, j => match j with
    | .num _ => true
    | _ => false
  | .number, _ | .string, _ | .anyString, _ | .boolean, _ | .any, _ => true
  | .nil, _ => false
  | .lit s, j => match s, j with
    | .num x, .num y => decide (x.leaf = y.leaf)
    | .str s, .str t => decide (s = "") || decide (t ≠ "")
    | .bool _, .bool _ => true
    | .null, .null => true
    | _, _ => false
  | .min b, j | .max b, j | .above b, j | .beneath b, j => checkDomain b j
  | .neq (v :: _), j => checkDomain v j
  | .neq [], _ => true
  | .multiple _, j => match j with
    | .num _ => true
    | _ => false
  | .len _, _ | .unique _, _ => true
  | .re _, j | .format _, j => match j with
    | .str t => decide (t ≠ "")
    | _ => false
  | .map fs spread closed, j => match j with
    | .map jfs =>
      checkSuperFieldsWith u fs jfs && jfs.all (fun m => checkSuperSpreadWith u spread m.2) &&
        (!closed || jfs.all fun m => fs.any fun f => decide (f.1 = m.1))
    | _ => false
  | .list items spread closed, j => match j with
    | .list xs =>
      decide (items.length ≤ xs.length) &&
        (!closed || spread.isSome || decide (xs.length = items.length)) &&
        checkSuperItemsWith u items xs && xs.all (fun x => checkSuperSpreadWith u spread x)
    | _ => false
  | .or arms, j => checkSuperArmsWith u arms j
  | .pref _ x, j => checkSuperWith u x j
  | .meet a b, j =>
    if a.isKind then (if b.isKind then (if a.isLeaf then checkSuperWith u a j else checkSuperWith u b j) else checkWith u a j)
    else if b.isKind then checkWith u b j else checkSuperWith u a j && checkSuperWith u b j
  | .alias k, j => u k j
  | .path _, _ => false

def checkSuperFieldsWith (u : String → Data → Bool) : List (String × Bool × Val) → List (String × Data) → Bool
  | [], _ => true
  | (k, o, v) :: fs, jfs =>
    (match lookup k jfs with
      | none => o
      | some x => checkSuperWith u v x) && checkSuperFieldsWith u fs jfs

def checkSuperItemsWith (u : String → Data → Bool) : List Val → List Data → Bool
  | v :: vs, x :: xs => checkSuperWith u v x && checkSuperItemsWith u vs xs
  | _, _ => true

def checkSuperSpreadWith (u : String → Data → Bool) : Option Val → Data → Bool
  | none, _ => true
  | some s, x => checkSuperWith u s x

def checkSuperArmsWith (u : String → Data → Bool) : List (ℕ × Val) → Data → Bool
  | [], _ => false
  | (_, a) :: arms, j => checkSuperWith u a j || checkSuperArmsWith u arms j
end

section
variable {u : String → Data → Bool} {env : Env} {root : Data}

theorem checkSpreadWith_iff {spread : Option Val} {x : Data}
    (ih : ∀ s, spread = some s → (checkWith u s x = true ↔ Admits env root s x)) :
    checkSpreadWith u spread x = true ↔ ∀ s, spread = some s → Admits env root s x := by
  cases spread with
  | none => simp [checkSpreadWith]
  | some s => simp [checkSpreadWith, ih s rfl]

theorem checkFieldsWith_iff {fs : List (String × Bool × Val)} {jfs : List (String × Data)}
    (ih : ∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x →
      (checkWith u v x = true ↔ Admits env root v x)) :
    checkFieldsWith u fs jfs = true ↔
      (∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x → Admits env root v x) ∧
        (∀ k o v, (k, o, v) ∈ fs → lookup k jfs = none → o = true) := by
  induction fs with
  | nil => simp [checkFieldsWith]
  | cons f fs ihfs =>
    obtain ⟨k, o, v⟩ := f
    have ihv := fun x hx => ih k o v x (List.mem_cons_self _ _) hx
    have iht := ihfs (fun k o v x h hx => ih k o v x (List.mem_cons_of_mem _ h) hx)
    simp only [checkFieldsWith, Bool.and_eq_true, iht, List.mem_cons, Prod.mk.injEq]
    constructor
    · rintro ⟨hh, ht1, ht2⟩
      refine ⟨?_, ?_⟩
      · rintro k' o' v' x (⟨rfl, rfl, rfl⟩ | hm) hx
        · simp only [hx] at hh; exact (ihv x hx).mp hh
        · exact ht1 k' o' v' x hm hx
      · rintro k' o' v' (⟨rfl, rfl, rfl⟩ | hm) hx
        · simp only [hx] at hh; exact hh
        · exact ht2 k' o' v' hm hx
    · rintro ⟨h1, h2⟩
      refine ⟨?_, fun k' o' v' x hm hx => h1 k' o' v' x (Or.inr hm) hx,
        fun k' o' v' hm hx => h2 k' o' v' (Or.inr hm) hx⟩
      cases hl : lookup k jfs with
      | none => exact h2 k o v (Or.inl ⟨rfl, rfl, rfl⟩) hl
      | some x => exact (ihv x hl).mpr (h1 k o v x (Or.inl ⟨rfl, rfl, rfl⟩) hl)

theorem checkItemsWith_iff {items : List Val} {xs : List Data}
    (ih : ∀ (i : ℕ) (v : Val) (x : Data), items[i]? = some v → xs[i]? = some x →
      (checkWith u v x = true ↔ Admits env root v x)) :
    checkItemsWith u items xs = true ↔
      ∀ (i : ℕ) (v : Val) (x : Data), items[i]? = some v → xs[i]? = some x →
        Admits env root v x := by
  induction items generalizing xs with
  | nil => simp [checkItemsWith]
  | cons v vs ihvs =>
    cases xs with
    | nil => simp [checkItemsWith]
    | cons x xs =>
      have ihv := ih 0 v x List.getElem?_cons_zero List.getElem?_cons_zero
      have iht := ihvs (xs := xs) (fun i w y hw hy => ih (i + 1) w y
        (by rw [List.getElem?_cons_succ]; exact hw) (by rw [List.getElem?_cons_succ]; exact hy))
      simp only [checkItemsWith, Bool.and_eq_true, iht, ihv]
      constructor
      · rintro ⟨hv, ht⟩ i w y hw hy
        cases i with
        | zero =>
          simp only [List.getElem?_cons_zero, Option.some.injEq] at hw hy
          subst hw; subst hy; exact hv
        | succ i =>
          simp only [List.getElem?_cons_succ] at hw hy
          exact ht i w y hw hy
      · intro h
        refine ⟨h 0 v x List.getElem?_cons_zero List.getElem?_cons_zero, fun i w y hw hy => ?_⟩
        exact h (i + 1) w y (by rw [List.getElem?_cons_succ]; exact hw)
          (by rw [List.getElem?_cons_succ]; exact hy)

theorem checkClosed_iff (fs : List (String × Bool × Val)) (closed : Bool)
    (jfs : List (String × Data)) :
    (!closed || jfs.all fun m => fs.any fun f => decide (f.1 = m.1)) = true ↔
      (closed = true → ∀ k x, (k, x) ∈ jfs → ∃ o v, (k, o, v) ∈ fs) := by
  cases closed with
  | false => simp
  | true =>
    simp only [Bool.not_true, Bool.false_or, List.all_eq_true, List.any_eq_true,
      decide_eq_true_eq, forall_const]
    constructor
    · intro h k x hm
      obtain ⟨⟨k', o, v⟩, hf, he⟩ := h (k, x) hm
      subst he; exact ⟨o, v, hf⟩
    · rintro h ⟨k, x⟩ hm
      obtain ⟨o, v, hf⟩ := h k x hm
      exact ⟨(k, o, v), hf, rfl⟩

theorem checkSealed_iff (closed : Bool) (spread : Option Val) (items : List Val) (xs : List Data) :
    (!closed || spread.isSome || decide (xs.length = items.length)) = true ↔
      (closed = true → spread = none → xs.length = items.length) := by
  cases closed <;> cases spread <;> simp

theorem checkArmsWith_iff {arms : List (ℕ × Val)} {j : Data}
    (ih : ∀ r a, (r, a) ∈ arms → (checkWith u a j = true ↔ Admits env root a j)) :
    checkArmsWith u arms j = true ↔ ∃ r a, (r, a) ∈ arms ∧ Admits env root a j := by
  induction arms with
  | nil => simp [checkArmsWith]
  | cons p arms iharms =>
    obtain ⟨r, a⟩ := p
    have iha := ih r a (List.mem_cons_self _ _)
    have iht := iharms (fun r a h => ih r a (List.mem_cons_of_mem _ h))
    simp only [checkArmsWith, Bool.or_eq_true, iha, iht, List.mem_cons, Prod.mk.injEq]
    constructor
    · rintro (h | ⟨r', a', hm, h⟩)
      · exact ⟨r, a, Or.inl ⟨rfl, rfl⟩, h⟩
      · exact ⟨r', a', Or.inr hm, h⟩
    · rintro ⟨r', a', ⟨rfl, rfl⟩ | hm, h⟩
      · exact Or.inl h
      · exact Or.inr ⟨r', a', hm, h⟩

/-! ## The parent type, computed -/

theorem checkDomain_iff (b : Bound) (j : Data) :
    checkDomain b j = true ↔ Admits env root b.domain j := by
  cases b with
  | num n =>
    cases j with
    | num x => exact ⟨fun _ => .number, fun _ => rfl⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | str b =>
    cases j with
    | str t =>
      simp only [checkDomain, Bound.domain, decide_eq_true_eq]
      exact ⟨fun h => .string h, fun h => by cases h; assumption⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩

/-- The kind of a number's leaf admits the number. -/
theorem admits_leaf_kind (y : Number) : Admits env root y.leaf.kind (.num y) := by
  cases y with
  | integer _ => exact .integer
  | float _ => exact .float
  | biginteger _ => exact .biginteger
  | bigdecimal _ => exact .bigdecimal

/-- A leaf's kind admits a number of that leaf alone. -/
theorem leaf_kind_eq (l : Leaf) (y : Number) (h : Admits env root l.kind (.num y)) :
    l = y.leaf := by
  cases l <;> cases y <;> simp only [Leaf.kind] at h <;> first | rfl | nomatch h

/-- A leaf's kind admits numbers alone. -/
theorem leaf_kind_num (l : Leaf) (j : Data) (h : Admits env root l.kind j) : ∃ y, j = .num y := by
  cases l <;> simp only [Leaf.kind] at h <;> cases h <;> exact ⟨_, rfl⟩

theorem mem_superFields {fs : List (String × Bool × Val)} {k : String} {o : Bool} {w : Val} :
    (k, o, w) ∈ superFields fs ↔ ∃ v, (k, o, v) ∈ fs ∧ w = v.super := by
  induction fs with
  | nil => simp [superFields]
  | cons f fs ih =>
    obtain ⟨k', o', v'⟩ := f
    simp only [superFields, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl, rfl⟩ | ⟨v, hm, rfl⟩)
      · exact ⟨v', Or.inl ⟨rfl, rfl, rfl⟩, rfl⟩
      · exact ⟨v, Or.inr hm, rfl⟩
    · rintro ⟨v, ⟨rfl, rfl, rfl⟩ | hm, rfl⟩
      · exact Or.inl ⟨rfl, rfl, rfl⟩
      · exact Or.inr ⟨v, hm, rfl⟩

theorem mem_superArms {arms : List (ℕ × Val)} {r : ℕ} {b : Val} :
    (r, b) ∈ superArms arms ↔ ∃ a, (r, a) ∈ arms ∧ b = a.super := by
  induction arms with
  | nil => simp [superArms]
  | cons p arms ih =>
    obtain ⟨r', a'⟩ := p
    simp only [superArms, List.mem_cons, Prod.mk.injEq, ih]
    constructor
    · rintro (⟨rfl, rfl⟩ | ⟨a, hm, rfl⟩)
      · exact ⟨a', Or.inl ⟨rfl, rfl⟩, rfl⟩
      · exact ⟨a, Or.inr hm, rfl⟩
    · rintro ⟨a, ⟨rfl, rfl⟩ | hm, rfl⟩
      · exact Or.inl ⟨rfl, rfl⟩
      · exact Or.inr ⟨a, hm, rfl⟩

theorem superItems_length (items : List Val) : (superItems items).length = items.length := by
  induction items with
  | nil => rfl
  | cons v vs ih => simp [superItems, ih]

theorem superItems_getElem? (items : List Val) (i : ℕ) :
    (superItems items)[i]? = (items[i]?).map Val.super := by
  induction items generalizing i with
  | nil => simp [superItems]
  | cons v vs ih =>
    cases i with
    | zero => simp [superItems]
    | succ i => simp [superItems, ih]

theorem superSpread_none {spread : Option Val} : superSpread spread = none ↔ spread = none := by
  cases spread <;> simp [superSpread]

theorem superSpread_eq {spread : Option Val} {t : Val} :
    superSpread spread = some t ↔ ∃ s, spread = some s ∧ t = s.super := by
  cases spread <;> simp [superSpread, eq_comm]

theorem checkSuperSpreadWith_iff {spread : Option Val} {x : Data}
    (ih : ∀ s, spread = some s → (checkSuperWith u s x = true ↔ Admits env root s.super x)) :
    checkSuperSpreadWith u spread x = true ↔ ∀ s, spread = some s → Admits env root s.super x := by
  cases spread with
  | none => simp [checkSuperSpreadWith]
  | some s => simp [checkSuperSpreadWith, ih s rfl]

theorem checkSuperFieldsWith_iff {fs : List (String × Bool × Val)} {jfs : List (String × Data)}
    (ih : ∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x →
      (checkSuperWith u v x = true ↔ Admits env root v.super x)) :
    checkSuperFieldsWith u fs jfs = true ↔
      (∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x → Admits env root v.super x) ∧
        (∀ k o v, (k, o, v) ∈ fs → lookup k jfs = none → o = true) := by
  induction fs with
  | nil => simp [checkSuperFieldsWith]
  | cons f fs ihfs =>
    obtain ⟨k, o, v⟩ := f
    have ihv := fun x hx => ih k o v x (List.mem_cons_self _ _) hx
    have iht := ihfs (fun k o v x h hx => ih k o v x (List.mem_cons_of_mem _ h) hx)
    simp only [checkSuperFieldsWith, Bool.and_eq_true, iht, List.mem_cons, Prod.mk.injEq]
    constructor
    · rintro ⟨hh, ht1, ht2⟩
      refine ⟨?_, ?_⟩
      · rintro k' o' v' x (⟨rfl, rfl, rfl⟩ | hm) hx
        · simp only [hx] at hh; exact (ihv x hx).mp hh
        · exact ht1 k' o' v' x hm hx
      · rintro k' o' v' (⟨rfl, rfl, rfl⟩ | hm) hx
        · simp only [hx] at hh; exact hh
        · exact ht2 k' o' v' hm hx
    · rintro ⟨h1, h2⟩
      refine ⟨?_, fun k' o' v' x hm hx => h1 k' o' v' x (Or.inr hm) hx,
        fun k' o' v' hm hx => h2 k' o' v' (Or.inr hm) hx⟩
      cases hl : lookup k jfs with
      | none => exact h2 k o v (Or.inl ⟨rfl, rfl, rfl⟩) hl
      | some x => exact (ihv x hl).mpr (h1 k o v x (Or.inl ⟨rfl, rfl, rfl⟩) hl)

theorem checkSuperItemsWith_iff {items : List Val} {xs : List Data}
    (ih : ∀ (i : ℕ) (v : Val) (x : Data), items[i]? = some v → xs[i]? = some x →
      (checkSuperWith u v x = true ↔ Admits env root v.super x)) :
    checkSuperItemsWith u items xs = true ↔
      ∀ (i : ℕ) (v : Val) (x : Data), items[i]? = some v → xs[i]? = some x →
        Admits env root v.super x := by
  induction items generalizing xs with
  | nil => simp [checkSuperItemsWith]
  | cons v vs ihvs =>
    cases xs with
    | nil => simp [checkSuperItemsWith]
    | cons x xs =>
      have ihv := ih 0 v x List.getElem?_cons_zero List.getElem?_cons_zero
      have iht := ihvs (xs := xs) (fun i w y hw hy => ih (i + 1) w y
        (by rw [List.getElem?_cons_succ]; exact hw) (by rw [List.getElem?_cons_succ]; exact hy))
      simp only [checkSuperItemsWith, Bool.and_eq_true, iht, ihv]
      constructor
      · rintro ⟨hv, ht⟩ i w y hw hy
        cases i with
        | zero =>
          simp only [List.getElem?_cons_zero, Option.some.injEq] at hw hy
          subst hw; subst hy; exact hv
        | succ i =>
          simp only [List.getElem?_cons_succ] at hw hy
          exact ht i w y hw hy
      · intro h
        refine ⟨h 0 v x List.getElem?_cons_zero List.getElem?_cons_zero, fun i w y hw hy => ?_⟩
        exact h (i + 1) w y (by rw [List.getElem?_cons_succ]; exact hw)
          (by rw [List.getElem?_cons_succ]; exact hy)

theorem checkSuperArmsWith_iff {arms : List (ℕ × Val)} {j : Data}
    (ih : ∀ r a, (r, a) ∈ arms → (checkSuperWith u a j = true ↔ Admits env root a.super j)) :
    checkSuperArmsWith u arms j = true ↔ ∃ r a, (r, a) ∈ arms ∧ Admits env root a.super j := by
  induction arms with
  | nil => simp [checkSuperArmsWith]
  | cons p arms iharms =>
    obtain ⟨r, a⟩ := p
    have iha := ih r a (List.mem_cons_self _ _)
    have iht := iharms (fun r a h => ih r a (List.mem_cons_of_mem _ h))
    simp only [checkSuperArmsWith, Bool.or_eq_true, iha, iht, List.mem_cons, Prod.mk.injEq]
    constructor
    · rintro (h | ⟨r', a', hm, h⟩)
      · exact ⟨r, a, Or.inl ⟨rfl, rfl⟩, h⟩
      · exact ⟨r', a', Or.inr hm, h⟩
    · rintro ⟨r', a', ⟨rfl, rfl⟩ | hm, h⟩
      · exact Or.inl h
      · exact Or.inr ⟨r', a', hm, h⟩

/-- `check` decides admission for a kind. -/
theorem check_kind_iff {v : Val} (hk : v.isKind = true) (j : Data) :
    checkWith u v j = true ↔ Admits env root v j := by
  cases v <;> simp [Val.isKind] at hk <;> cases j <;> (try simp only [checkWith]) <;>
    first
    | exact ⟨fun _ => .number, fun _ => trivial⟩
    | exact ⟨fun _ => .anyString, fun _ => trivial⟩
    | exact ⟨fun _ => .boolean, fun _ => trivial⟩
    | exact ⟨fun _ => .number, fun _ => rfl⟩
    | exact ⟨fun _ => .anyString, fun _ => rfl⟩
    | exact ⟨fun _ => .boolean, fun _ => rfl⟩
    | (simp only [decide_eq_true_eq]; exact ⟨fun h => .string h, fun h => by cases h; assumption⟩)
    | (rename_i x; cases x <;>
        first
        | exact ⟨fun _ => .integer, fun _ => rfl⟩
        | exact ⟨fun _ => .float, fun _ => rfl⟩
        | exact ⟨fun _ => .biginteger, fun _ => rfl⟩
        | exact ⟨fun _ => .bigdecimal, fun _ => rfl⟩
        | exact ⟨fun _ => .integer, fun _ => trivial⟩
        | exact ⟨fun _ => .float, fun _ => trivial⟩
        | exact ⟨fun _ => .biginteger, fun _ => trivial⟩
        | exact ⟨fun _ => .bigdecimal, fun _ => trivial⟩
        | exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩)
    | exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩

set_option linter.unusedVariables false in
/-- The checker by the parent type decides admission by it, for every
value it can check, given a hook that is right where it is asked. -/
theorem checkSuperWith_iff {v : Val} (h : v.CheckableA) :
    ∀ j, HookOk u env root v j → (checkSuperWith u v j = true ↔ Admits env root v.super j) := by
  induction h with
  | integer | float | biginteger | bigdecimal =>
    intro j hu
    cases j with
    | num x => exact ⟨fun _ => .number, fun _ => rfl⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | number | string | anyString | boolean | any =>
    intro j _; exact ⟨fun _ => .any, fun _ => rfl⟩
  | nil => intro j _; exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @lit s =>
    intro j hu
    cases s with
    | num x =>
      cases j with
      | num y =>
        simp only [checkSuperWith, Val.super, decide_eq_true_eq]
        exact ⟨fun h => h ▸ admits_leaf_kind y, fun h => leaf_kind_eq _ _ h⟩
      | _ =>
        exact ⟨(fun h => nomatch h), (fun h => by
          obtain ⟨y, hy⟩ := leaf_kind_num x.leaf _ h
          cases hy)⟩
    | str s =>
      cases j with
      | str t =>
        by_cases hs : s = ""
        · subst hs
          simp only [checkSuperWith, Val.super, if_true, decide_true, Bool.true_or]
          exact ⟨fun _ => .anyString, fun _ => trivial⟩
        · simp only [checkSuperWith, Val.super, hs, if_false, decide_false, Bool.false_or, decide_eq_true_eq]
          exact ⟨fun h => .string h, fun h => by cases h; assumption⟩
      | _ =>
        refine ⟨(fun h => nomatch h), (fun h => ?_)⟩
        unfold Val.super at h
        split at h <;> nomatch h
    | bool b =>
      cases j with
      | bool c => exact ⟨fun _ => .boolean, fun _ => rfl⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | null =>
      cases j with
      | null => exact ⟨fun _ => .null, fun _ => rfl⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @min b | @max b | @above b | @beneath b => intro j _; exact checkDomain_iff b j
  | @neq vs =>
    intro j hu
    cases vs with
    | nil => exact ⟨fun _ => .any, fun _ => rfl⟩
    | cons v vs => exact checkDomain_iff v j
  | @multiple d =>
    intro j hu
    cases j with
    | num x => exact ⟨fun _ => .number, fun _ => rfl⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @len c _ _ | @unique k => intro j _; exact ⟨fun _ => .any, fun _ => rfl⟩
  | @map fs spread closed _ _ ihfs ihsp =>
    intro j hu
    cases j with
    | map jfs =>
      have hs : (jfs.all fun m => checkSuperSpreadWith u spread m.2) = true ↔
          ∀ t, superSpread spread = some t → ∀ k x, (k, x) ∈ jfs → Admits env root t x := by
        rw [List.all_eq_true]
        constructor
        · intro h t ht k x hm
          obtain ⟨s, hs, rfl⟩ := superSpread_eq.mp ht
          exact (checkSuperSpreadWith_iff fun s' hs' => ihsp s' hs' x (hu.mapSpread hs' hm)).mp
            (h (k, x) hm) s hs
        · intro h m hm
          exact (checkSuperSpreadWith_iff fun s hs => ihsp s hs m.2 (hu.mapSpread hs hm)).mpr fun s hs =>
            h s.super (superSpread_eq.mpr ⟨s, hs, rfl⟩) m.1 m.2 hm
      simp only [checkSuperWith, Val.super, Bool.and_eq_true]
      rw [checkSuperFieldsWith_iff fun k o v x hm hx => ihfs k o v hm x (hu.field hm hx),
        checkClosed_iff, hs]
      constructor
      · rintro ⟨⟨⟨h1, h2⟩, h3⟩, h4⟩
        refine .map ?_ ?_ h3 ?_
        · intro k o w x hm hx
          obtain ⟨v, hv, rfl⟩ := mem_superFields.mp hm
          exact h1 k o v x hv hx
        · intro k o w hm hx
          obtain ⟨v, hv, rfl⟩ := mem_superFields.mp hm
          exact h2 k o v hv hx
        · intro hc k x hm
          obtain ⟨o, v, hv⟩ := h4 hc k x hm
          exact ⟨o, v.super, mem_superFields.mpr ⟨v, hv, rfl⟩⟩
      · intro h
        cases h with
        | map h1 h2 h3 h4 =>
          refine ⟨⟨⟨?_, ?_⟩, h3⟩, ?_⟩
          · intro k o v x hv hx
            exact h1 k o v.super x (mem_superFields.mpr ⟨v, hv, rfl⟩) hx
          · intro k o v hv hx
            exact h2 k o v.super (mem_superFields.mpr ⟨v, hv, rfl⟩) hx
          · intro hc k x hm
            obtain ⟨o, w, hw⟩ := h4 hc k x hm
            obtain ⟨v, hv, -⟩ := mem_superFields.mp hw
            exact ⟨o, v, hv⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @list items spread closed _ _ ihitems ihsp =>
    intro j hu
    cases j with
    | list xs =>
      have hs : (xs.all fun x => checkSuperSpreadWith u spread x) = true ↔
          ∀ t, superSpread spread = some t → ∀ x, x ∈ xs → Admits env root t x := by
        rw [List.all_eq_true]
        constructor
        · intro h t ht x hm
          obtain ⟨s, hs, rfl⟩ := superSpread_eq.mp ht
          exact (checkSuperSpreadWith_iff fun s' hs' => ihsp s' hs' x (hu.listSpread hs' hm)).mp
            (h x hm) s hs
        · intro h x hm
          exact (checkSuperSpreadWith_iff fun s hs => ihsp s hs x (hu.listSpread hs hm)).mpr fun s hs =>
            h s.super (superSpread_eq.mpr ⟨s, hs, rfl⟩) x hm
      have hi : checkSuperItemsWith u items xs = true ↔
          ∀ (i : ℕ) (w : Val) (x : Data), (superItems items)[i]? = some w → xs[i]? = some x →
            Admits env root w x := by
        rw [checkSuperItemsWith_iff fun i v x hv hx =>
          ihitems v (List.mem_of_getElem? hv) x (hu.item hv hx)]
        constructor
        · intro h i w x hw hx
          rw [superItems_getElem?] at hw
          cases hv : items[i]? with
          | none => rw [hv] at hw; cases hw
          | some v => rw [hv] at hw; cases hw; exact h i v x hv hx
        · intro h i v x hv hx
          exact h i v.super x (by rw [superItems_getElem?, hv]; rfl) hx
      simp only [checkSuperWith, Val.super, Bool.and_eq_true, decide_eq_true_eq]
      rw [checkSealed_iff, hi, hs]
      constructor
      · rintro ⟨⟨⟨h1, h2⟩, h3⟩, h4⟩
        exact .list (by rw [superItems_length]; exact h1)
          (by rw [superItems_length]; intro hc ht; exact h2 hc (superSpread_none.mp ht)) h3 h4
      · intro h
        cases h with
        | list h1 h2 h3 h4 =>
          rw [superItems_length] at h1 h2
          exact ⟨⟨⟨h1, fun hc ht => h2 hc (superSpread_none.mpr ht)⟩, h3⟩, h4⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @or arms _ iharms =>
    intro j hu
    simp only [checkSuperWith, Val.super]
    rw [checkSuperArmsWith_iff fun r a hm => iharms r a hm j (hu.arm hm)]
    constructor
    · rintro ⟨r, a, hm, h⟩
      exact .or (mem_superArms.mpr ⟨a, hm, rfl⟩) h
    · intro h
      cases h with
      | or hm h =>
        obtain ⟨a', hm', rfl⟩ := mem_superArms.mp hm
        exact ⟨_, a', hm', h⟩
  | @pref r x _ ihx => intro j hu; exact ihx j hu.pref
  | @alias k =>
    intro j hu
    simp only [checkSuperWith, Val.super]
    exact hu.alias
  | @meet a b ha hb iha ihb =>
    intro j hu
    cases hka : a.isKind <;> cases hkb : b.isKind <;>
      simp only [checkSuperWith, Val.super, hka, hkb, Bool.false_eq_true, if_false, if_true,
        Bool.and_eq_true]
    · rw [iha j hu.meetLeft, ihb j hu.meetRight]
      exact ⟨fun ⟨h1, h2⟩ => .meet h1 h2, fun h => by cases h with | meet h1 h2 => exact ⟨h1, h2⟩⟩
    · exact check_kind_iff hkb j
    · exact check_kind_iff hka j
    · cases a.isLeaf
      · simp only [Bool.false_eq_true, if_false]; exact ihb j hu.meetRight
      · simp only [if_true]; exact iha j hu.meetLeft

set_option linter.unusedVariables false in
/-- The checker decides admission for every value it can check, given a
hook that is right where it is asked. -/
theorem checkWith_iff {v : Val} (h : v.CheckableA) :
    ∀ j, HookOk u env root v j → (checkWith u v j = true ↔ Admits env root v j) := by
  induction h with
  | any => intro j _; exact ⟨fun _ => .any, fun _ => rfl⟩
  | nil => intro j _; exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | boolean =>
    intro j hu
    cases j with
    | bool b => exact ⟨fun _ => .boolean, fun _ => rfl⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | number =>
    intro j hu
    cases j with
    | num x => exact ⟨fun _ => .number, fun _ => rfl⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | integer =>
    intro j hu
    cases j with
    | num x =>
      cases x with
      | integer y => exact ⟨fun _ => .integer, fun _ => rfl⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | float =>
    intro j hu
    cases j with
    | num x =>
      cases x with
      | float y => exact ⟨fun _ => .float, fun _ => rfl⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | biginteger =>
    intro j hu
    cases j with
    | num x =>
      cases x with
      | biginteger y => exact ⟨fun _ => .biginteger, fun _ => rfl⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | bigdecimal =>
    intro j hu
    cases j with
    | num x =>
      cases x with
      | bigdecimal y => exact ⟨fun _ => .bigdecimal, fun _ => rfl⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | string =>
    intro j hu
    cases j with
    | str s =>
      simp only [checkWith, decide_eq_true_eq]
      exact ⟨fun h => .string h, fun h => by cases h; assumption⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | anyString =>
    intro j hu
    cases j with
    | str s => exact ⟨fun _ => .anyString, fun _ => rfl⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @lit s =>
    intro j hu
    cases s with
    | null =>
      cases j with
      | null => exact ⟨fun _ => .null, fun _ => rfl⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | bool b =>
      cases j with
      | bool b' =>
        simp only [checkWith, decide_eq_true_eq]
        exact ⟨fun h => by subst h; exact .bool, fun h => by cases h; rfl⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | num x =>
      cases j with
      | num y =>
        simp only [checkWith, decide_eq_true_eq]
        exact ⟨fun h => by subst h; exact .num, fun h => by cases h; rfl⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | str s =>
      cases j with
      | str s' =>
        simp only [checkWith, decide_eq_true_eq]
        exact ⟨fun h => by subst h; exact .str, fun h => by cases h; rfl⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @min b =>
    intro j hu
    cases b with
    | num n =>
      cases j with
      | num x =>
        simp only [checkWith, decide_eq_true_eq]
        exact ⟨fun h => .min h, fun h => by cases h; assumption⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | str b =>
      cases j with
      | str s =>
        simp only [checkWith, decide_eq_true_eq]
        exact ⟨fun h => .minStr h, fun h => by cases h; assumption⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @max b =>
    intro j hu
    cases b with
    | num n =>
      cases j with
      | num x =>
        simp only [checkWith, decide_eq_true_eq]
        exact ⟨fun h => .max h, fun h => by cases h; assumption⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | str b =>
      cases j with
      | str s =>
        simp only [checkWith, decide_eq_true_eq]
        exact ⟨fun h => .maxStr h, fun h => by cases h; assumption⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @above b =>
    intro j hu
    cases b with
    | num n =>
      cases j with
      | num x =>
        simp only [checkWith, decide_eq_true_eq]
        exact ⟨fun h => .above h, fun h => by cases h; assumption⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | str b =>
      cases j with
      | str s =>
        simp only [checkWith, decide_eq_true_eq]
        exact ⟨fun h => .aboveStr h, fun h => by cases h; assumption⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @beneath b =>
    intro j hu
    cases b with
    | num n =>
      cases j with
      | num x =>
        simp only [checkWith, decide_eq_true_eq]
        exact ⟨fun h => .beneath h, fun h => by cases h; assumption⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | str b =>
      cases j with
      | str s =>
        simp only [checkWith, decide_eq_true_eq]
        exact ⟨fun h => .beneathStr h, fun h => by cases h; assumption⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @neq vs =>
    intro j hu
    cases j with
    | num x =>
      simp only [checkWith, List.all_eq_true]
      constructor
      · intro h
        refine .neq fun v hv => ?_
        have hv := h v hv
        cases v with
        | num n => exact ⟨n, rfl, by simpa using hv⟩
        | str _ => simp at hv
      · intro h v hv
        cases h with
        | neq h =>
          obtain ⟨n, rfl, hn⟩ := h v hv
          simpa using hn
    | str s =>
      simp only [checkWith, List.all_eq_true]
      constructor
      · intro h
        refine .neqStr fun v hv => ?_
        have hv := h v hv
        cases v with
        | str t => exact ⟨t, rfl, by simpa using hv⟩
        | num _ => simp at hv
      · intro h v hv
        cases h with
        | neqStr h =>
          obtain ⟨t, rfl, ht⟩ := h v hv
          simpa using ht
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @multiple d =>
    intro j hu
    cases j with
    | num x =>
      simp only [checkWith, decide_eq_true_eq, Bool.and_eq_true]
      exact ⟨fun ⟨hd, hm⟩ => .multiple hd hm, fun h => by cases h; exact ⟨‹_›, ‹_›⟩⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @len c _ ihc =>
    intro j hu
    simp only [checkWith]
    cases hs : j.size with
    | none =>
      simp only [Bool.false_eq_true, false_iff]
      intro h
      cases h with
      | len _ hs' _ => rw [hs] at hs'; cases hs'
    | some n =>
      simp only
      split
      · rename_i h
        rw [ihc _ hu.len]
        constructor
        · intro ha; exact .len h hs ha
        · intro ha
          cases ha with
          | len h' hs' ha' => rw [hs] at hs'; cases hs'; exact ha'
      · rename_i h
        simp only [Bool.false_eq_true, false_iff]
        intro ha
        cases ha with
        | len h' hs' _ => rw [hs] at hs'; cases hs'; exact absurd h' h
  | @unique k =>
    intro j hu
    simp only [checkWith]
    cases hm : j.members with
    | none =>
      simp only [Bool.false_eq_true, false_iff]
      intro h
      cases h with
      | unique hm' _ _ => rw [hm] at hm'; cases hm'
    | some ms =>
      simp only [Bool.and_eq_true, List.all_eq_true, distinct_iff]
      constructor
      · rintro ⟨h1, h2⟩
        exact .unique hm (fun x hx => h1 x hx) h2
      · intro h
        cases h with
        | unique hm' h1 h2 => rw [hm] at hm'; cases hm'; exact ⟨fun x hx => h1 x hx, h2⟩
  | @alias k =>
    intro j hu
    simp only [checkWith]
    exact hu.alias
  | @map fs spread closed _ _ ihfs ihsp =>
    intro j hu
    cases j with
    | map jfs =>
      have hs : (jfs.all fun m => checkSpreadWith u spread m.2) = true ↔
          ∀ s, spread = some s → ∀ k x, (k, x) ∈ jfs → Admits env root s x := by
        rw [List.all_eq_true]
        constructor
        · intro h s hs k x hm
          exact (checkSpreadWith_iff fun s' hs' => ihsp s' hs' x (hu.mapSpread hs' hm)).mp (h (k, x) hm) s hs
        · intro h m hm
          exact (checkSpreadWith_iff fun s hs => ihsp s hs m.2 (hu.mapSpread hs hm)).mpr
            fun s hs => h s hs m.1 m.2 hm
      simp only [checkWith, Bool.and_eq_true]
      rw [checkFieldsWith_iff fun k o v x hm hx => ihfs k o v hm x (hu.field hm hx), checkClosed_iff, hs]
      constructor
      · rintro ⟨⟨⟨h1, h2⟩, h3⟩, h4⟩
        exact .map h1 h2 h3 h4
      · intro h
        cases h with
        | map h1 h2 h3 h4 => exact ⟨⟨⟨h1, h2⟩, h3⟩, h4⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @list items spread closed _ _ ihitems ihsp =>
    intro j hu
    cases j with
    | list xs =>
      have hs : (xs.all fun x => checkSpreadWith u spread x) = true ↔
          ∀ s, spread = some s → ∀ x, x ∈ xs → Admits env root s x := by
        rw [List.all_eq_true]
        constructor
        · intro h s hs x hm
          exact (checkSpreadWith_iff fun s' hs' => ihsp s' hs' x (hu.listSpread hs' hm)).mp (h x hm) s hs
        · intro h x hm
          exact (checkSpreadWith_iff fun s hs => ihsp s hs x (hu.listSpread hs hm)).mpr fun s hs => h s hs x hm
      simp only [checkWith, Bool.and_eq_true, decide_eq_true_eq]
      rw [checkSealed_iff, checkItemsWith_iff fun i v x hv hx =>
        ihitems v (List.mem_of_getElem? hv) x (hu.item hv hx), hs]
      constructor
      · rintro ⟨⟨⟨h1, h2⟩, h3⟩, h4⟩
        exact .list h1 h2 h3 h4
      · intro h
        cases h with
        | list h1 h2 h3 h4 => exact ⟨⟨⟨h1, h2⟩, h3⟩, h4⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @or arms _ iharms =>
    intro j hu
    simp only [checkWith]
    rw [checkArmsWith_iff fun r a hm => iharms r a hm j (hu.arm hm)]
    constructor
    · rintro ⟨r, a, hm, h⟩
      exact .or hm h
    · intro h
      cases h with
      | or hm h => exact ⟨_, _, hm, h⟩
  | @pref r x hx ihx =>
    intro j hu
    simp only [checkWith, Bool.or_eq_true]
    rw [ihx j hu.pref, checkSuperWith_iff hx j hu.pref]
    constructor
    · rintro (h | h)
      · exact .pref h
      · exact .prefSuper h
    · intro h
      cases h with
      | pref h => exact Or.inl h
      | prefSuper h => exact Or.inr h
  | meet _ _ iha ihb =>
    intro j hu
    simp only [checkWith, Bool.and_eq_true, iha j hu.meetLeft, ihb j hu.meetRight]
    exact ⟨fun ⟨h1, h2⟩ => .meet h1 h2, fun h => by cases h with | meet h1 h2 => exact ⟨h1, h2⟩⟩

end

/-- The checker with no hook: a name is never admitted, which decides the
values that read no name. -/
abbrev check : Val → Data → Bool := checkWith fun _ _ => false

abbrev checkSpread : Option Val → Data → Bool := checkSpreadWith fun _ _ => false

abbrev checkSuper : Val → Data → Bool := checkSuperWith fun _ _ => false

section
variable {env : Env} {root : Data}

/-- `check` decides admission for every checkable value. -/
theorem check_iff {v : Val} (h : v.Checkable) : ∀ j, check v j = true ↔ Admits env root v j :=
  fun j => checkWith_iff h.toA j fun k _ hk =>
    absurd (hk.elim (fun h' => h'.2) fun h' => unguardedRefs_sub_refs _ _ h'.2) (h.no_refs k)

theorem checkSuper_iff {v : Val} (h : v.Checkable) :
    ∀ j, checkSuper v j = true ↔ Admits env root v.super j :=
  fun j => checkSuperWith_iff h.toA j fun k _ hk =>
    absurd (hk.elim (fun h' => h'.2) fun h' => unguardedRefs_sub_refs _ _ h'.2) (h.no_refs k)

theorem checkSpread_iff {spread : Option Val}
    (ih : ∀ s, spread = some s → ∀ j, check s j = true ↔ Admits env root s j) (x : Data) :
    checkSpread spread x = true ↔ ∀ s, spread = some s → Admits env root s x :=
  checkSpreadWith_iff fun s hs => ih s hs x

end

end Aontu
