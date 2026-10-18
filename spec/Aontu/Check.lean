import Aontu.Admits

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
  | [], _ :: _ => by simp [Data.sameElems]
  | _ :: _, [] => by simp [Data.sameElems]
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

mutual
/-- Whether `v` admits `j`, computed. -/
def check : Val → Data → Bool
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
    | some n => if h : IntegerLeaf n then check c (.num (.integer ⟨n, h⟩)) else false
    | none => false
  | .unique k, j => match j.members with
    | some ms => ms.all (fun x => (x.project k).isSome) && distinct k ms
    | none => false
  | .any, _ => true
  | .nil, _ => false
  | .map fs spread closed, j => match j with
    | .map jfs =>
      checkFields fs jfs && jfs.all (fun m => checkSpread spread m.2) &&
        (!closed || jfs.all fun m => fs.any fun f => decide (f.1 = m.1))
    | _ => false
  | .list items spread closed, j => match j with
    | .list xs =>
      decide (items.length ≤ xs.length) &&
        (!closed || spread.isSome || decide (xs.length = items.length)) &&
        checkItems items xs && xs.all (fun x => checkSpread spread x)
    | _ => false
  | .or arms, j => checkArms arms j
  | .pref _ x, j => check x j || checkSuper x j
  | .meet a b, j => check a j && check b j
  | .re _, _ => false
  | .format _, _ => false
  | .alias _, _ => false
  | .path _, _ => false

/-- The declared keys of a map: each present one holds its value, and
each absent one is optional. -/
def checkFields : List (String × Bool × Val) → List (String × Data) → Bool
  | [], _ => true
  | (k, o, v) :: fs, jfs =>
    (match lookup k jfs with
      | none => o
      | some x => check v x) && checkFields fs jfs

/-- The positions of a list that the instance has. -/
def checkItems : List Val → List Data → Bool
  | v :: vs, x :: xs => check v x && checkItems vs xs
  | _, _ => true

/-- A spread, where there is one. -/
def checkSpread : Option Val → Data → Bool
  | none, _ => true
  | some s, x => check s x

/-- Whether any arm admits. -/
def checkArms : List (ℕ × Val) → Data → Bool
  | [], _ => false
  | (_, a) :: arms, j => check a j || checkArms arms j

/-- Whether `v.super`, the parent type of `v`, admits `j`: `check` on
`v.super`, written by recursion on `v`, since `v.super` is no part of
`v` for `check` to recurse into. -/
def checkSuper : Val → Data → Bool
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
      checkSuperFields fs jfs && jfs.all (fun m => checkSuperSpread spread m.2) &&
        (!closed || jfs.all fun m => fs.any fun f => decide (f.1 = m.1))
    | _ => false
  | .list items spread closed, j => match j with
    | .list xs =>
      decide (items.length ≤ xs.length) &&
        (!closed || spread.isSome || decide (xs.length = items.length)) &&
        checkSuperItems items xs && xs.all (fun x => checkSuperSpread spread x)
    | _ => false
  | .or arms, j => checkSuperArms arms j
  | .pref _ x, j => checkSuper x j
  | .meet a b, j =>
    if a.isKind then (if b.isKind then (if a.isLeaf then checkSuper a j else checkSuper b j) else check a j)
    else if b.isKind then check b j else checkSuper a j && checkSuper b j
  | .alias _, _ => false
  | .path _, _ => false

def checkSuperFields : List (String × Bool × Val) → List (String × Data) → Bool
  | [], _ => true
  | (k, o, v) :: fs, jfs =>
    (match lookup k jfs with
      | none => o
      | some x => checkSuper v x) && checkSuperFields fs jfs

def checkSuperItems : List Val → List Data → Bool
  | v :: vs, x :: xs => checkSuper v x && checkSuperItems vs xs
  | _, _ => true

def checkSuperSpread : Option Val → Data → Bool
  | none, _ => true
  | some s, x => checkSuper s x

def checkSuperArms : List (ℕ × Val) → Data → Bool
  | [], _ => false
  | (_, a) :: arms, j => checkSuper a j || checkSuperArms arms j
end

section
variable {env : Env} {root : Data}

theorem checkSpread_iff {spread : Option Val}
    (ih : ∀ s, spread = some s → ∀ j, check s j = true ↔ Admits env root s j) (x : Data) :
    checkSpread spread x = true ↔ ∀ s, spread = some s → Admits env root s x := by
  cases spread with
  | none => simp [checkSpread]
  | some s => simp [checkSpread, ih s rfl]

theorem checkFields_iff {fs : List (String × Bool × Val)}
    (ih : ∀ k o v, (k, o, v) ∈ fs → ∀ j, check v j = true ↔ Admits env root v j)
    (jfs : List (String × Data)) :
    checkFields fs jfs = true ↔
      (∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x → Admits env root v x) ∧
        (∀ k o v, (k, o, v) ∈ fs → lookup k jfs = none → o = true) := by
  induction fs with
  | nil => simp [checkFields]
  | cons f fs ihfs =>
    obtain ⟨k, o, v⟩ := f
    have ihv := ih k o v (List.mem_cons_self _ _)
    have iht := ihfs (fun k o v h => ih k o v (List.mem_cons_of_mem _ h))
    simp only [checkFields, Bool.and_eq_true, iht, List.mem_cons, Prod.mk.injEq]
    constructor
    · rintro ⟨hh, ht1, ht2⟩
      refine ⟨?_, ?_⟩
      · rintro k' o' v' x (⟨rfl, rfl, rfl⟩ | hm) hx
        · simp only [hx] at hh; exact (ihv x).mp hh
        · exact ht1 k' o' v' x hm hx
      · rintro k' o' v' (⟨rfl, rfl, rfl⟩ | hm) hx
        · simp only [hx] at hh; exact hh
        · exact ht2 k' o' v' hm hx
    · rintro ⟨h1, h2⟩
      refine ⟨?_, fun k' o' v' x hm hx => h1 k' o' v' x (Or.inr hm) hx,
        fun k' o' v' hm hx => h2 k' o' v' (Or.inr hm) hx⟩
      cases hl : lookup k jfs with
      | none => exact h2 k o v (Or.inl ⟨rfl, rfl, rfl⟩) hl
      | some x => exact (ihv x).mpr (h1 k o v x (Or.inl ⟨rfl, rfl, rfl⟩) hl)

theorem checkItems_iff {items : List Val}
    (ih : ∀ v, v ∈ items → ∀ j, check v j = true ↔ Admits env root v j) (xs : List Data) :
    checkItems items xs = true ↔
      ∀ (i : ℕ) (v : Val) (x : Data), items[i]? = some v → xs[i]? = some x →
        Admits env root v x := by
  induction items generalizing xs with
  | nil => simp [checkItems]
  | cons v vs ihvs =>
    cases xs with
    | nil => simp [checkItems]
    | cons x xs =>
      have ihv := ih v (List.mem_cons_self _ _)
      have iht := ihvs (fun w h => ih w (List.mem_cons_of_mem _ h)) xs
      simp only [checkItems, Bool.and_eq_true, iht, ihv]
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

theorem checkArms_iff {arms : List (ℕ × Val)}
    (ih : ∀ r a, (r, a) ∈ arms → ∀ j, check a j = true ↔ Admits env root a j) (j : Data) :
    checkArms arms j = true ↔ ∃ r a, (r, a) ∈ arms ∧ Admits env root a j := by
  induction arms with
  | nil => simp [checkArms]
  | cons p arms iharms =>
    obtain ⟨r, a⟩ := p
    have iha := ih r a (List.mem_cons_self _ _)
    have iht := iharms (fun r a h => ih r a (List.mem_cons_of_mem _ h))
    simp only [checkArms, Bool.or_eq_true, iha, iht, List.mem_cons, Prod.mk.injEq]
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

theorem checkSuperSpread_iff {spread : Option Val}
    (ih : ∀ s, spread = some s → ∀ j, checkSuper s j = true ↔ Admits env root s.super j)
    (x : Data) :
    checkSuperSpread spread x = true ↔ ∀ s, spread = some s → Admits env root s.super x := by
  cases spread with
  | none => simp [checkSuperSpread]
  | some s => simp [checkSuperSpread, ih s rfl]

theorem checkSuperFields_iff {fs : List (String × Bool × Val)}
    (ih : ∀ k o v, (k, o, v) ∈ fs → ∀ j, checkSuper v j = true ↔ Admits env root v.super j)
    (jfs : List (String × Data)) :
    checkSuperFields fs jfs = true ↔
      (∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x → Admits env root v.super x) ∧
        (∀ k o v, (k, o, v) ∈ fs → lookup k jfs = none → o = true) := by
  induction fs with
  | nil => simp [checkSuperFields]
  | cons f fs ihfs =>
    obtain ⟨k, o, v⟩ := f
    have ihv := ih k o v (List.mem_cons_self _ _)
    have iht := ihfs (fun k o v h => ih k o v (List.mem_cons_of_mem _ h))
    simp only [checkSuperFields, Bool.and_eq_true, iht, List.mem_cons, Prod.mk.injEq]
    constructor
    · rintro ⟨hh, ht1, ht2⟩
      refine ⟨?_, ?_⟩
      · rintro k' o' v' x (⟨rfl, rfl, rfl⟩ | hm) hx
        · simp only [hx] at hh; exact (ihv x).mp hh
        · exact ht1 k' o' v' x hm hx
      · rintro k' o' v' (⟨rfl, rfl, rfl⟩ | hm) hx
        · simp only [hx] at hh; exact hh
        · exact ht2 k' o' v' hm hx
    · rintro ⟨h1, h2⟩
      refine ⟨?_, fun k' o' v' x hm hx => h1 k' o' v' x (Or.inr hm) hx,
        fun k' o' v' hm hx => h2 k' o' v' (Or.inr hm) hx⟩
      cases hl : lookup k jfs with
      | none => exact h2 k o v (Or.inl ⟨rfl, rfl, rfl⟩) hl
      | some x => exact (ihv x).mpr (h1 k o v x (Or.inl ⟨rfl, rfl, rfl⟩) hl)

theorem checkSuperItems_iff {items : List Val}
    (ih : ∀ v, v ∈ items → ∀ j, checkSuper v j = true ↔ Admits env root v.super j)
    (xs : List Data) :
    checkSuperItems items xs = true ↔
      ∀ (i : ℕ) (v : Val) (x : Data), items[i]? = some v → xs[i]? = some x →
        Admits env root v.super x := by
  induction items generalizing xs with
  | nil => simp [checkSuperItems]
  | cons v vs ihvs =>
    cases xs with
    | nil => simp [checkSuperItems]
    | cons x xs =>
      have ihv := ih v (List.mem_cons_self _ _)
      have iht := ihvs (fun w h => ih w (List.mem_cons_of_mem _ h)) xs
      simp only [checkSuperItems, Bool.and_eq_true, iht, ihv]
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

theorem checkSuperArms_iff {arms : List (ℕ × Val)}
    (ih : ∀ r a, (r, a) ∈ arms → ∀ j, checkSuper a j = true ↔ Admits env root a.super j)
    (j : Data) :
    checkSuperArms arms j = true ↔ ∃ r a, (r, a) ∈ arms ∧ Admits env root a.super j := by
  induction arms with
  | nil => simp [checkSuperArms]
  | cons p arms iharms =>
    obtain ⟨r, a⟩ := p
    have iha := ih r a (List.mem_cons_self _ _)
    have iht := iharms (fun r a h => ih r a (List.mem_cons_of_mem _ h))
    simp only [checkSuperArms, Bool.or_eq_true, iha, iht, List.mem_cons, Prod.mk.injEq]
    constructor
    · rintro (h | ⟨r', a', hm, h⟩)
      · exact ⟨r, a, Or.inl ⟨rfl, rfl⟩, h⟩
      · exact ⟨r', a', Or.inr hm, h⟩
    · rintro ⟨r', a', ⟨rfl, rfl⟩ | hm, h⟩
      · exact Or.inl h
      · exact Or.inr ⟨r', a', hm, h⟩

/-- `check` decides admission for a kind. -/
theorem check_kind_iff {v : Val} (hk : v.isKind = true) (j : Data) :
    check v j = true ↔ Admits env root v j := by
  cases v <;> simp [Val.isKind] at hk <;> cases j <;>
    first
    | exact ⟨fun _ => .number, fun _ => rfl⟩
    | exact ⟨fun _ => .anyString, fun _ => rfl⟩
    | exact ⟨fun _ => .boolean, fun _ => rfl⟩
    | (simp only [check, decide_eq_true_eq]; exact ⟨fun h => .string h, fun h => by cases h; assumption⟩)
    | (rename_i x; cases x <;>
        first
        | exact ⟨fun _ => .integer, fun _ => rfl⟩
        | exact ⟨fun _ => .float, fun _ => rfl⟩
        | exact ⟨fun _ => .biginteger, fun _ => rfl⟩
        | exact ⟨fun _ => .bigdecimal, fun _ => rfl⟩
        | exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩)
    | exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩

/-- `checkSuper` decides admission by the parent type, for every
checkable value. -/
theorem checkSuper_iff {v : Val} (h : v.Checkable) :
    ∀ j, checkSuper v j = true ↔ Admits env root v.super j := by
  induction h with
  | integer | float | biginteger | bigdecimal =>
    intro j
    cases j with
    | num x => exact ⟨fun _ => .number, fun _ => rfl⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | number | string | anyString | boolean | any =>
    intro j; exact ⟨fun _ => .any, fun _ => rfl⟩
  | nil => intro j; exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @lit s =>
    intro j
    cases s with
    | num x =>
      cases j with
      | num y =>
        simp only [checkSuper, Val.super, decide_eq_true_eq]
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
          simp only [checkSuper, Val.super, if_true, decide_true, Bool.true_or]
          exact ⟨fun _ => .anyString, fun _ => trivial⟩
        · simp only [checkSuper, Val.super, hs, if_false, decide_false, Bool.false_or, decide_eq_true_eq]
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
  | @min b | @max b | @above b | @beneath b => intro j; exact checkDomain_iff b j
  | @neq vs =>
    intro j
    cases vs with
    | nil => exact ⟨fun _ => .any, fun _ => rfl⟩
    | cons v vs => exact checkDomain_iff v j
  | @multiple d =>
    intro j
    cases j with
    | num x => exact ⟨fun _ => .number, fun _ => rfl⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @len c _ _ | @unique k => intro j; exact ⟨fun _ => .any, fun _ => rfl⟩
  | @map fs spread closed _ _ ihfs ihsp =>
    intro j
    cases j with
    | map jfs =>
      have hs : (jfs.all fun m => checkSuperSpread spread m.2) = true ↔
          ∀ t, superSpread spread = some t → ∀ k x, (k, x) ∈ jfs → Admits env root t x := by
        rw [List.all_eq_true]
        constructor
        · intro h t ht k x hm
          obtain ⟨s, hs, rfl⟩ := superSpread_eq.mp ht
          exact (checkSuperSpread_iff ihsp x).mp (h (k, x) hm) s hs
        · intro h m hm
          exact (checkSuperSpread_iff ihsp m.2).mpr fun s hs =>
            h s.super (superSpread_eq.mpr ⟨s, hs, rfl⟩) m.1 m.2 hm
      simp only [checkSuper, Val.super, Bool.and_eq_true]
      rw [checkSuperFields_iff ihfs jfs, checkClosed_iff, hs]
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
    intro j
    cases j with
    | list xs =>
      have hs : (xs.all fun x => checkSuperSpread spread x) = true ↔
          ∀ t, superSpread spread = some t → ∀ x, x ∈ xs → Admits env root t x := by
        rw [List.all_eq_true]
        constructor
        · intro h t ht x hm
          obtain ⟨s, hs, rfl⟩ := superSpread_eq.mp ht
          exact (checkSuperSpread_iff ihsp x).mp (h x hm) s hs
        · intro h x hm
          exact (checkSuperSpread_iff ihsp x).mpr fun s hs =>
            h s.super (superSpread_eq.mpr ⟨s, hs, rfl⟩) x hm
      have hi : checkSuperItems items xs = true ↔
          ∀ (i : ℕ) (w : Val) (x : Data), (superItems items)[i]? = some w → xs[i]? = some x →
            Admits env root w x := by
        rw [checkSuperItems_iff ihitems xs]
        constructor
        · intro h i w x hw hx
          rw [superItems_getElem?] at hw
          cases hv : items[i]? with
          | none => rw [hv] at hw; cases hw
          | some v => rw [hv] at hw; cases hw; exact h i v x hv hx
        · intro h i v x hv hx
          exact h i v.super x (by rw [superItems_getElem?, hv]; rfl) hx
      simp only [checkSuper, Val.super, Bool.and_eq_true, decide_eq_true_eq]
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
    intro j
    simp only [checkSuper, Val.super]
    rw [checkSuperArms_iff iharms j]
    constructor
    · rintro ⟨r, a, hm, h⟩
      exact .or (mem_superArms.mpr ⟨a, hm, rfl⟩) h
    · intro h
      cases h with
      | or hm h =>
        obtain ⟨a', hm', rfl⟩ := mem_superArms.mp hm
        exact ⟨_, a', hm', h⟩
  | @pref r x _ ihx => intro j; exact ihx j
  | @meet a b ha hb iha ihb =>
    intro j
    cases hka : a.isKind <;> cases hkb : b.isKind <;>
      simp only [checkSuper, Val.super, hka, hkb, Bool.false_eq_true, if_false, if_true,
        Bool.and_eq_true]
    · rw [iha j, ihb j]
      exact ⟨fun ⟨h1, h2⟩ => .meet h1 h2, fun h => by cases h with | meet h1 h2 => exact ⟨h1, h2⟩⟩
    · exact check_kind_iff hkb j
    · exact check_kind_iff hka j
    · cases a.isLeaf
      · simp only [Bool.false_eq_true, if_false]; exact ihb j
      · simp only [if_true]; exact iha j

/-- `check` decides admission for every checkable value. -/
theorem check_iff {v : Val} (h : v.Checkable) : ∀ j, check v j = true ↔ Admits env root v j := by
  induction h with
  | any => intro j; exact ⟨fun _ => .any, fun _ => rfl⟩
  | nil => intro j; exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | boolean =>
    intro j
    cases j with
    | bool b => exact ⟨fun _ => .boolean, fun _ => rfl⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | number =>
    intro j
    cases j with
    | num x => exact ⟨fun _ => .number, fun _ => rfl⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | integer =>
    intro j
    cases j with
    | num x =>
      cases x with
      | integer y => exact ⟨fun _ => .integer, fun _ => rfl⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | float =>
    intro j
    cases j with
    | num x =>
      cases x with
      | float y => exact ⟨fun _ => .float, fun _ => rfl⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | biginteger =>
    intro j
    cases j with
    | num x =>
      cases x with
      | biginteger y => exact ⟨fun _ => .biginteger, fun _ => rfl⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | bigdecimal =>
    intro j
    cases j with
    | num x =>
      cases x with
      | bigdecimal y => exact ⟨fun _ => .bigdecimal, fun _ => rfl⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | string =>
    intro j
    cases j with
    | str s =>
      simp only [check, decide_eq_true_eq]
      exact ⟨fun h => .string h, fun h => by cases h; assumption⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | anyString =>
    intro j
    cases j with
    | str s => exact ⟨fun _ => .anyString, fun _ => rfl⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @lit s =>
    intro j
    cases s with
    | null =>
      cases j with
      | null => exact ⟨fun _ => .null, fun _ => rfl⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | bool b =>
      cases j with
      | bool b' =>
        simp only [check, decide_eq_true_eq]
        exact ⟨fun h => by subst h; exact .bool, fun h => by cases h; rfl⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | num x =>
      cases j with
      | num y =>
        simp only [check, decide_eq_true_eq]
        exact ⟨fun h => by subst h; exact .num, fun h => by cases h; rfl⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | str s =>
      cases j with
      | str s' =>
        simp only [check, decide_eq_true_eq]
        exact ⟨fun h => by subst h; exact .str, fun h => by cases h; rfl⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @min b =>
    intro j
    cases b with
    | num n =>
      cases j with
      | num x =>
        simp only [check, decide_eq_true_eq]
        exact ⟨fun h => .min h, fun h => by cases h; assumption⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | str b =>
      cases j with
      | str s =>
        simp only [check, decide_eq_true_eq]
        exact ⟨fun h => .minStr h, fun h => by cases h; assumption⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @max b =>
    intro j
    cases b with
    | num n =>
      cases j with
      | num x =>
        simp only [check, decide_eq_true_eq]
        exact ⟨fun h => .max h, fun h => by cases h; assumption⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | str b =>
      cases j with
      | str s =>
        simp only [check, decide_eq_true_eq]
        exact ⟨fun h => .maxStr h, fun h => by cases h; assumption⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @above b =>
    intro j
    cases b with
    | num n =>
      cases j with
      | num x =>
        simp only [check, decide_eq_true_eq]
        exact ⟨fun h => .above h, fun h => by cases h; assumption⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | str b =>
      cases j with
      | str s =>
        simp only [check, decide_eq_true_eq]
        exact ⟨fun h => .aboveStr h, fun h => by cases h; assumption⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @beneath b =>
    intro j
    cases b with
    | num n =>
      cases j with
      | num x =>
        simp only [check, decide_eq_true_eq]
        exact ⟨fun h => .beneath h, fun h => by cases h; assumption⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
    | str b =>
      cases j with
      | str s =>
        simp only [check, decide_eq_true_eq]
        exact ⟨fun h => .beneathStr h, fun h => by cases h; assumption⟩
      | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @neq vs =>
    intro j
    cases j with
    | num x =>
      simp only [check, List.all_eq_true]
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
      simp only [check, List.all_eq_true]
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
    intro j
    cases j with
    | num x =>
      simp only [check, decide_eq_true_eq, Bool.and_eq_true]
      exact ⟨fun ⟨hd, hm⟩ => .multiple hd hm, fun h => by cases h; exact ⟨‹_›, ‹_›⟩⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @len c _ ihc =>
    intro j
    simp only [check]
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
        rw [ihc]
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
    intro j
    simp only [check]
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
  | @map fs spread closed _ _ ihfs ihsp =>
    intro j
    cases j with
    | map jfs =>
      have hs : (jfs.all fun m => checkSpread spread m.2) = true ↔
          ∀ s, spread = some s → ∀ k x, (k, x) ∈ jfs → Admits env root s x := by
        rw [List.all_eq_true]
        constructor
        · intro h s hs k x hm
          exact (checkSpread_iff ihsp x).mp (h (k, x) hm) s hs
        · intro h m hm
          exact (checkSpread_iff ihsp m.2).mpr fun s hs => h s hs m.1 m.2 hm
      simp only [check, Bool.and_eq_true]
      rw [checkFields_iff ihfs jfs, checkClosed_iff, hs]
      constructor
      · rintro ⟨⟨⟨h1, h2⟩, h3⟩, h4⟩
        exact .map h1 h2 h3 h4
      · intro h
        cases h with
        | map h1 h2 h3 h4 => exact ⟨⟨⟨h1, h2⟩, h3⟩, h4⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @list items spread closed _ _ ihitems ihsp =>
    intro j
    cases j with
    | list xs =>
      have hs : (xs.all fun x => checkSpread spread x) = true ↔
          ∀ s, spread = some s → ∀ x, x ∈ xs → Admits env root s x := by
        rw [List.all_eq_true]
        constructor
        · intro h s hs x hm
          exact (checkSpread_iff ihsp x).mp (h x hm) s hs
        · intro h x hm
          exact (checkSpread_iff ihsp x).mpr fun s hs => h s hs x hm
      simp only [check, Bool.and_eq_true, decide_eq_true_eq]
      rw [checkSealed_iff, checkItems_iff ihitems xs, hs]
      constructor
      · rintro ⟨⟨⟨h1, h2⟩, h3⟩, h4⟩
        exact .list h1 h2 h3 h4
      · intro h
        cases h with
        | list h1 h2 h3 h4 => exact ⟨⟨⟨h1, h2⟩, h3⟩, h4⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @or arms _ iharms =>
    intro j
    simp only [check]
    rw [checkArms_iff iharms j]
    constructor
    · rintro ⟨r, a, hm, h⟩
      exact .or hm h
    · intro h
      cases h with
      | or hm h => exact ⟨_, _, hm, h⟩
  | @pref r x hx ihx =>
    intro j
    simp only [check, Bool.or_eq_true]
    rw [ihx j, checkSuper_iff hx j]
    constructor
    · rintro (h | h)
      · exact .pref h
      · exact .prefSuper h
    · intro h
      cases h with
      | pref h => exact Or.inl h
      | prefSuper h => exact Or.inr h
  | meet _ _ iha ihb =>
    intro j
    simp only [check, Bool.and_eq_true, iha, ihb]
    exact ⟨fun ⟨h1, h2⟩ => .meet h1 h2, fun h => by cases h with | meet h1 h2 => exact ⟨h1, h2⟩⟩

end

end Aontu
