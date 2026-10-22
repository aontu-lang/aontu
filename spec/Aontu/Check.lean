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
    · simp [lookup, h, ih]

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
            simp [hy]
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
        have hk : k' ≠ k := fun hk => hseen (hk ▸ List.mem_cons_self)
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
  | mapKind : Checkable .mapKind
  | listKind : Checkable .listKind
  | lit {s : Scalar} : Checkable (.lit s)
  | min {b : Bound} : Checkable (.min b)
  | max {b : Bound} : Checkable (.max b)
  | above {b : Bound} : Checkable (.above b)
  | beneath {b : Bound} : Checkable (.beneath b)
  | neq {vs : List Bound} : Checkable (.neq vs)
  | mulof {d : Number} : Checkable (.mulof d)
  | len {c : Val} : Checkable c → Checkable (.len c)
  | unique {k : Option String} : Checkable (.unique k)
  | any : Checkable .any
  | hole : Checkable .hole
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
  | path {p : List Seg} : Checkable (.path p)
  | nof {n : Val} {cs : List Val} : Checkable n → (∀ c, c ∈ cs → Checkable c) → Checkable (.nof n cs)
  | call {f : Fn} {args : List Val} : (∀ a, a ∈ args → Checkable a) → Checkable (.call f args)
  | must {c : Val} {msg : String} : Checkable c → Checkable (.must c msg)
  | when {c t : Val} {e : Option Val} :
      Checkable c → Checkable t → (∀ e', e = some e' → Checkable e') → Checkable (.when c t e)
  | contains {c n : Val} : Checkable c → Checkable n → Checkable (.contains c n)
  | rest {t : Val} {cs : List Cover} : Checkable t →
      (∀ c, c ∈ cs → ∀ v, c.1 = some v → Checkable v) →
      (∀ c, c ∈ cs → ∀ v, c.2.1 = some v → Checkable v) →
      (∀ c, c ∈ cs → ∀ v, c.2.2 = some v → Checkable v) →
      Checkable (.rest t cs)
  | ride {k : Rider} {v : Val} {r : Record} : Checkable v → Checkable (.ride k v r)
  | key : Checkable .key
  | keyUp {n : ℤ} : Checkable (.keyUp n)
  | selectKey {arms : List (Val × Val)} {d : Option Val} :
      (∀ p r, (p, r) ∈ arms → Checkable p) → (∀ p r, (p, r) ∈ arms → Checkable r) →
      (∀ e, d = some e → Checkable e) → Checkable (.select .key arms d)
  | selectLit {s : Scalar} {arms : List (Val × Val)} {d : Option Val} :
      (∀ p r, (p, r) ∈ arms → Checkable p) → (∀ p r, (p, r) ∈ arms → Checkable r) →
      (∀ e, d = some e → Checkable e) → Checkable (.select (.lit s) arms d)

mutual
/-- Whether a value is checkable, computed. -/
def Val.checkableB : Val → Bool
  | .select .key arms d | .select (.lit _) arms d => pairsCheckable arms && spreadCheckable d
  | .alias _ | .re _ | .format _ | .select _ _ _ | .filter _ _ => false
  | .len c => c.checkableB
  | .map fs spread _ => fieldsCheckable fs && spreadCheckable spread
  | .list items spread _ => itemsCheckable items && spreadCheckable spread
  | .or arms => armsCheckable arms
  | .pref _ x => x.checkableB
  | .meet a b => a.checkableB && b.checkableB
  | .nof n cs => n.checkableB && itemsCheckable cs
  | .call _ args => itemsCheckable args
  | .must c _ => c.checkableB
  | .when c t e => c.checkableB && t.checkableB && spreadCheckable e
  | .contains c n => c.checkableB && n.checkableB
  | .rest t cs => t.checkableB && coversCheckable cs
  | .ride _ v _ => v.checkableB
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

def coversCheckable : List Cover → Bool
  | [] => true
  | (c, k, m) :: cs => spreadCheckable c && spreadCheckable k && spreadCheckable m && coversCheckable cs

def armsCheckable : List (ℕ × Val) → Bool
  | [] => true
  | (_, a) :: arms => a.checkableB && armsCheckable arms

def pairsCheckable : List (Val × Val) → Bool
  | [] => true
  | (p, r) :: ps => p.checkableB && r.checkableB && pairsCheckable ps
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
  | .mapKind => ⟨fun _ => .mapKind, fun _ => rfl⟩
  | .listKind => ⟨fun _ => .listKind, fun _ => rfl⟩
  | .lit _ => ⟨fun _ => .lit, fun _ => rfl⟩
  | .min _ => ⟨fun _ => .min, fun _ => rfl⟩
  | .max _ => ⟨fun _ => .max, fun _ => rfl⟩
  | .above _ => ⟨fun _ => .above, fun _ => rfl⟩
  | .beneath _ => ⟨fun _ => .beneath, fun _ => rfl⟩
  | .neq _ => ⟨fun _ => .neq, fun _ => rfl⟩
  | .mulof _ => ⟨fun _ => .mulof, fun _ => rfl⟩
  | .unique _ => ⟨fun _ => .unique, fun _ => rfl⟩
  | .any => ⟨fun _ => .any, fun _ => rfl⟩
  | .hole => ⟨fun _ => .hole, fun _ => rfl⟩
  | .nil => ⟨fun _ => .nil, fun _ => rfl⟩
  | .re _ => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .format _ => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .select s arms d => by
    cases s
    case key =>
      simp only [Val.checkableB, Bool.and_eq_true]
      rw [pairsCheckable_iff arms, spreadCheckable_iff d]
      exact ⟨fun ⟨⟨h1, h2⟩, h3⟩ => .selectKey h1 h2 h3, fun h => by cases h; exact ⟨⟨‹_›, ‹_›⟩, ‹_›⟩⟩
    case lit =>
      simp only [Val.checkableB, Bool.and_eq_true]
      rw [pairsCheckable_iff arms, spreadCheckable_iff d]
      exact ⟨fun ⟨⟨h1, h2⟩, h3⟩ => .selectLit h1 h2 h3, fun h => by cases h; exact ⟨⟨‹_›, ‹_›⟩, ‹_›⟩⟩
    all_goals exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .filter _ _ => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .alias _ => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .path _ => ⟨fun _ => .path, fun _ => rfl⟩
  | .key => ⟨fun _ => .key, fun _ => rfl⟩
  | .keyUp _ => ⟨fun _ => .keyUp, fun _ => rfl⟩
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
  | .ride k v r => by
    simp only [Val.checkableB]
    rw [Val.checkableB_iff v]
    exact ⟨.ride, fun h => by cases h; assumption⟩
  | .meet a b => by
    simp only [Val.checkableB, Bool.and_eq_true]
    rw [Val.checkableB_iff a, Val.checkableB_iff b]
    exact ⟨fun ⟨h1, h2⟩ => .meet h1 h2, fun h => by cases h; exact ⟨‹_›, ‹_›⟩⟩
  | .nof n cs => by
    simp only [Val.checkableB, Bool.and_eq_true]
    rw [Val.checkableB_iff n, itemsCheckable_iff cs]
    exact ⟨fun ⟨h1, h2⟩ => .nof h1 h2, fun h => by cases h; exact ⟨‹_›, ‹_›⟩⟩
  | .call _ args => by
    simp only [Val.checkableB]
    rw [itemsCheckable_iff args]
    exact ⟨.call, fun h => by cases h; assumption⟩
  | .must c _ => by
    simp only [Val.checkableB]
    rw [Val.checkableB_iff c]
    exact ⟨.must, fun h => by cases h; assumption⟩
  | .when c t e => by
    simp only [Val.checkableB, Bool.and_eq_true]
    rw [Val.checkableB_iff c, Val.checkableB_iff t, spreadCheckable_iff e]
    exact ⟨fun ⟨⟨h1, h2⟩, h3⟩ => .when h1 h2 h3, fun h => by cases h; exact ⟨⟨‹_›, ‹_›⟩, ‹_›⟩⟩
  | .contains c n => by
    simp only [Val.checkableB, Bool.and_eq_true]
    rw [Val.checkableB_iff c, Val.checkableB_iff n]
    exact ⟨fun ⟨h1, h2⟩ => .contains h1 h2, fun h => by cases h; exact ⟨‹_›, ‹_›⟩⟩
  | .rest t cs => by
    simp only [Val.checkableB, Bool.and_eq_true]
    rw [Val.checkableB_iff t, coversCheckable_iff cs]
    exact ⟨fun ⟨h1, h2, h3, h4⟩ => .rest h1 h2 h3 h4, fun h => by cases h; exact ⟨‹_›, ‹_›, ‹_›, ‹_›⟩⟩

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

theorem coversCheckable_iff : ∀ cs : List Cover,
    coversCheckable cs = true ↔
      (∀ c, c ∈ cs → ∀ v, c.1 = some v → v.Checkable) ∧ (∀ c, c ∈ cs → ∀ v, c.2.1 = some v → v.Checkable) ∧
        (∀ c, c ∈ cs → ∀ v, c.2.2 = some v → v.Checkable)
  | [] => by simp [coversCheckable]
  | (c, k, m) :: cs => by
    simp only [coversCheckable, Bool.and_eq_true, List.forall_mem_cons]
    rw [spreadCheckable_iff c, spreadCheckable_iff k, spreadCheckable_iff m, coversCheckable_iff cs]
    exact ⟨fun ⟨⟨⟨h1, h2⟩, h3⟩, h4, h5, h6⟩ => ⟨⟨h1, h4⟩, ⟨h2, h5⟩, h3, h6⟩,
      fun ⟨⟨h1, h4⟩, ⟨h2, h5⟩, h3, h6⟩ => ⟨⟨⟨h1, h2⟩, h3⟩, h4, h5, h6⟩⟩

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

theorem pairsCheckable_iff : ∀ ps : List (Val × Val),
    pairsCheckable ps = true ↔
      (∀ p r, (p, r) ∈ ps → p.Checkable) ∧ (∀ p r, (p, r) ∈ ps → r.Checkable)
  | [] => by simp [pairsCheckable]
  | (p, r) :: ps => by
    simp only [pairsCheckable, Bool.and_eq_true, List.mem_cons, Prod.mk.injEq]
    rw [Val.checkableB_iff p, Val.checkableB_iff r, pairsCheckable_iff ps]
    constructor
    · rintro ⟨⟨hp, hr⟩, hps, hrs⟩
      refine ⟨fun p' r' h => ?_, fun p' r' h => ?_⟩
      · rcases h with ⟨rfl, rfl⟩ | h
        · exact hp
        · exact hps p' r' h
      · rcases h with ⟨rfl, rfl⟩ | h
        · exact hr
        · exact hrs p' r' h
    · rintro ⟨hps, hrs⟩
      exact ⟨⟨hps p r (.inl ⟨rfl, rfl⟩), hrs p r (.inl ⟨rfl, rfl⟩)⟩,
        fun p' r' h' => hps p' r' (.inr h'), fun p' r' h' => hrs p' r' (.inr h')⟩
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
  | [], _, h => absurd h (List.not_mem_nil)
  | (k, x) :: fs, m, h => by
    rcases List.mem_cons.mp h with rfl | h'
    · exact Nat.le_add_right _ _
    · exact Nat.le_trans (weightMembers_ge h') (Nat.le_add_left _ _)

theorem weightElems_ge : ∀ {xs : List Data} {x : Data}, x ∈ xs → x.weight ≤ weightElems xs
  | [], _, h => absurd h (List.not_mem_nil)
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
      exact hk ▸ List.mem_cons_self
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

theorem Data.weight_lt_of_members {j : Data} {ms : List Data} {x : Data} (hm : j.members = some ms)
    (hx : x ∈ ms) : x.weight < j.weight := by
  cases j with
  | map fs =>
    simp only [Data.members, Option.some.injEq] at hm
    subst hm
    obtain ⟨⟨k, y⟩, hy, rfl⟩ := List.mem_map.mp hx
    exact Data.weight_lt_of_mem_members hy
  | list xs =>
    simp only [Data.members, Option.some.injEq] at hm
    subst hm
    exact Data.weight_lt_of_mem_elems hx
  | _ => simp [Data.members] at hm

theorem Data.weight_lt_of_named {j : Data} {ns : List (String × Data)} {k : String} {x : Data}
    (hm : j.named = some ns) (hx : (k, x) ∈ ns) : x.weight < j.weight := by
  cases j with
  | map fs =>
    simp only [Data.named, Option.some.injEq] at hm
    subst hm
    exact Data.weight_lt_of_mem_members hx
  | list xs =>
    simp only [Data.named, Option.some.injEq] at hm
    subst hm
    exact Data.weight_lt_of_mem_elems (mem_namedItems hx)
  | _ => simp [Data.named] at hm

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

theorem mem_refsCovers {cs : List Cover} {n : String} :
    n ∈ refsCovers cs ↔ ∃ c, c ∈ cs ∧ (n ∈ refsSpread c.1 ∨ n ∈ refsSpread c.2.1 ∨ n ∈ refsSpread c.2.2) := by
  induction cs with
  | nil => simp [refsCovers]
  | cons c cs ih =>
    obtain ⟨a, k, m⟩ := c
    simp only [refsCovers, List.mem_append, ih, List.mem_cons]
    constructor
    · rintro (((h | h) | h) | ⟨d, hd, h⟩)
      · exact ⟨(a, k, m), .inl rfl, .inl h⟩
      · exact ⟨(a, k, m), .inl rfl, .inr (.inl h)⟩
      · exact ⟨(a, k, m), .inl rfl, .inr (.inr h)⟩
      · exact ⟨d, .inr hd, h⟩
    · rintro ⟨d, rfl | hd, h⟩
      · rcases h with h | h | h
        · exact .inl (.inl (.inl h))
        · exact .inl (.inl (.inr h))
        · exact .inl (.inr h)
      · exact .inr ⟨d, hd, h⟩

theorem mem_unguardedCovers {cs : List Cover} {n : String} :
    n ∈ unguardedCovers cs ↔ ∃ c, c ∈ cs ∧ n ∈ unguardedSpread c.1 := by
  induction cs with
  | nil => simp [unguardedCovers]
  | cons c cs ih =>
    obtain ⟨a, k, m⟩ := c
    simp only [unguardedCovers, List.mem_append, ih, List.mem_cons]
    constructor
    · rintro (h | ⟨d, hd, h⟩)
      · exact ⟨(a, k, m), .inl rfl, h⟩
      · exact ⟨d, .inr hd, h⟩
    · rintro ⟨d, rfl | hd, h⟩
      · exact .inl h
      · exact .inr ⟨d, hd, h⟩

theorem mem_refsPairs {ps : List (Val × Val)} {n : String} :
    n ∈ refsPairs ps ↔ ∃ p r, (p, r) ∈ ps ∧ (n ∈ p.refs ∨ n ∈ r.refs) := by
  induction ps with
  | nil => simp [refsPairs]
  | cons q ps ih =>
    obtain ⟨p, r⟩ := q
    simp only [refsPairs, List.mem_append, ih, List.mem_cons, Prod.mk.injEq]
    constructor
    · rintro ((h | h) | ⟨p', r', hm, h⟩)
      · exact ⟨p, r, .inl ⟨rfl, rfl⟩, .inl h⟩
      · exact ⟨p, r, .inl ⟨rfl, rfl⟩, .inr h⟩
      · exact ⟨p', r', .inr hm, h⟩
    · rintro ⟨p', r', ⟨rfl, rfl⟩ | hm, h⟩
      · exact .inl h
      · exact .inr ⟨p', r', hm, h⟩

theorem mem_unguardedPairs {ps : List (Val × Val)} {n : String} :
    n ∈ unguardedPairs ps ↔ ∃ p r, (p, r) ∈ ps ∧ (n ∈ p.unguardedRefs ∨ n ∈ r.unguardedRefs) := by
  induction ps with
  | nil => simp [unguardedPairs]
  | cons q ps ih =>
    obtain ⟨p, r⟩ := q
    simp only [unguardedPairs, List.mem_append, ih, List.mem_cons, Prod.mk.injEq]
    constructor
    · rintro ((h | h) | ⟨p', r', hm, h⟩)
      · exact ⟨p, r, .inl ⟨rfl, rfl⟩, .inl h⟩
      · exact ⟨p, r, .inl ⟨rfl, rfl⟩, .inr h⟩
      · exact ⟨p', r', .inr hm, h⟩
    · rintro ⟨p', r', ⟨rfl, rfl⟩ | hm, h⟩
      · exact .inl h
      · exact .inr ⟨p', r', hm, h⟩

theorem mem_unguardedItems {items : List Val} {n : String} :
    n ∈ unguardedItems items ↔ ∃ v, v ∈ items ∧ n ∈ v.unguardedRefs := by
  induction items with
  | nil => simp [unguardedItems]
  | cons v vs ih =>
    simp only [unguardedItems, List.mem_append, ih, List.mem_cons]
    constructor
    · rintro (h | ⟨w, hm, h⟩)
      · exact ⟨v, Or.inl rfl, h⟩
      · exact ⟨w, Or.inr hm, h⟩
    · rintro ⟨w, rfl | hm, h⟩
      · exact Or.inl h
      · exact Or.inr ⟨w, hm, h⟩

/-! ## What the checker can be told about names

The checker recurses on the term, and where it meets a name it asks a
hook, `unfold`, which a checker that reads declarations supplies. The
hook is answerable for a name at a datum no heavier than the one in
hand, and at one as heavy only where the name stands with no key and no
element between: that is where the checker asks. Its answer is a `Bool`,
and a `Bool` the definition agrees with is a judgement: `true` where the
name admits the datum, `false` where it refuses it. -/

/-- What the hook answers rightly, at a term and a datum: for a name it
is asked about, its answer is the judgement. -/
def HookOk (unfold : String → Data → Bool) (env : Env) (root : Data) (v : Val) (j : Data) : Prop :=
  ∀ k j', ((j'.weight < j.weight ∧ k ∈ v.refs) ∨ (j'.weight = j.weight ∧ k ∈ v.unguardedRefs)) →
    Judge env root (unfold k j') (.alias k) j'

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

theorem HookOk.selectPattern {sc : Val} {arms : List (Val × Val)} {d : Option Val} {j x : Data}
    {p r : Val} (h : HookOk u env root (.select sc arms d) j) (hm : (p, r) ∈ arms)
    (hx : x.weight ≤ j.weight) : HookOk u env root p x :=
  h.sub hx (fun n hn => by
      simp only [Val.refs, List.mem_append]; exact .inl (.inr (mem_refsPairs.mpr ⟨p, r, hm, .inl hn⟩)))
    (fun _ n hn => by
      simp only [Val.unguardedRefs, List.mem_append]
      exact .inl (.inr (mem_unguardedPairs.mpr ⟨p, r, hm, .inl hn⟩)))

theorem HookOk.selectResult {sc : Val} {arms : List (Val × Val)} {d : Option Val} {j : Data}
    {p r : Val} (h : HookOk u env root (.select sc arms d) j) (hm : (p, r) ∈ arms) :
    HookOk u env root r j :=
  h.same (fun n hn => by
      simp only [Val.refs, List.mem_append]; exact .inl (.inr (mem_refsPairs.mpr ⟨p, r, hm, .inr hn⟩)))
    (fun n hn => by
      simp only [Val.unguardedRefs, List.mem_append]
      exact .inl (.inr (mem_unguardedPairs.mpr ⟨p, r, hm, .inr hn⟩)))

theorem HookOk.selectElse {sc : Val} {arms : List (Val × Val)} {d : Option Val} {j : Data} {e : Val}
    (h : HookOk u env root (.select sc arms d) j) (hd : d = some e) : HookOk u env root e j :=
  h.same (fun n hn => by simp only [Val.refs, List.mem_append, hd, refsSpread]; exact .inr hn)
    (fun n hn => by simp only [Val.unguardedRefs, List.mem_append, hd, unguardedSpread]; exact .inr hn)

theorem HookOk.pref {r : ℕ} {x : Val} {j : Data} (h : HookOk u env root (.pref r x) j) :
    HookOk u env root x j :=
  h.same (fun n hn => by simpa [Val.refs] using hn) (fun n hn => by simpa [Val.unguardedRefs] using hn)

theorem HookOk.ride {k : Rider} {v : Val} {r : Record} {j : Data} (h : HookOk u env root (.ride k v r) j) :
    HookOk u env root v j :=
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
    Judge env root (u k j) (.alias k) j :=
  h k j (.inr ⟨rfl, by simp [Val.unguardedRefs]⟩)

theorem HookOk.nofCount {n : Val} {cs : List Val} {j : Data} {k : Number}
    (h : HookOk u env root (.nof n cs) j) : HookOk u env root n (.num k) :=
  h.sub (Data.weight_pos j) (fun m hm => by simp only [Val.refs, List.mem_append]; exact .inl hm)
    (fun _ m hm => by simp only [Val.unguardedRefs, List.mem_append]; exact .inl hm)

theorem HookOk.nofBranch {n : Val} {cs : List Val} {j : Data} {c : Val}
    (h : HookOk u env root (.nof n cs) j) (hc : c ∈ cs) : HookOk u env root c j :=
  h.same (fun m hm => by
      simp only [Val.refs, List.mem_append]; exact .inr (mem_refsItems.mpr ⟨c, hc, hm⟩))
    (fun m hm => by
      simp only [Val.unguardedRefs, List.mem_append]; exact .inr (mem_unguardedItems.mpr ⟨c, hc, hm⟩))

theorem HookOk.must {c : Val} {msg : String} {j : Data} (h : HookOk u env root (.must c msg) j) :
    HookOk u env root c j :=
  h.same (fun m hm => by simpa [Val.refs] using hm) (fun m hm => by simpa [Val.unguardedRefs] using hm)

theorem HookOk.whenCond {c t : Val} {e : Option Val} {j : Data} (h : HookOk u env root (.when c t e) j) :
    HookOk u env root c j :=
  h.same (fun m hm => by simp only [Val.refs, List.mem_append]; exact .inl (.inl hm))
    (fun m hm => by simp only [Val.unguardedRefs, List.mem_append]; exact .inl (.inl hm))

theorem HookOk.whenThen {c t : Val} {e : Option Val} {j : Data} (h : HookOk u env root (.when c t e) j) :
    HookOk u env root t j :=
  h.same (fun m hm => by simp only [Val.refs, List.mem_append]; exact .inl (.inr hm))
    (fun m hm => by simp only [Val.unguardedRefs, List.mem_append]; exact .inl (.inr hm))

theorem HookOk.whenElse {c t e : Val} {j : Data} (h : HookOk u env root (.when c t (some e)) j) :
    HookOk u env root e j :=
  h.same (fun m hm => by simp only [Val.refs, List.mem_append, refsSpread]; exact .inr hm)
    (fun m hm => by simp only [Val.unguardedRefs, List.mem_append, unguardedSpread]; exact .inr hm)

theorem HookOk.containsMember {c n : Val} {j : Data} {ms : List Data} {x : Data}
    (h : HookOk u env root (.contains c n) j) (hm : j.members = some ms) (hx : x ∈ ms) :
    HookOk u env root c x :=
  h.strict (Data.weight_lt_of_members hm hx) fun m hm' => by
    simp only [Val.refs, List.mem_append]; exact .inl hm'

theorem HookOk.containsCount {c n : Val} {j : Data} {k : Number} (h : HookOk u env root (.contains c n) j) :
    HookOk u env root n (.num k) :=
  h.sub (Data.weight_pos j) (fun m hm => by simp only [Val.refs, List.mem_append]; exact .inr hm)
    (fun _ m hm => by simpa [Val.unguardedRefs] using hm)

theorem HookOk.restT {t : Val} {cs : List Cover} {j : Data} {ns : List (String × Data)} {k : String} {x : Data}
    (h : HookOk u env root (.rest t cs) j) (hm : j.named = some ns) (hx : (k, x) ∈ ns) :
    HookOk u env root t x :=
  h.strict (Data.weight_lt_of_named hm hx) fun m hm' => by
    simp only [Val.refs, List.mem_append]; exact .inl hm'

theorem HookOk.restCond {t : Val} {cs : List Cover} {j : Data} {c : Cover} {v : Val}
    (h : HookOk u env root (.rest t cs) j) (hc : c ∈ cs) (hv : c.1 = some v) : HookOk u env root v j :=
  h.same (fun m hm => by
      simp only [Val.refs, List.mem_append]
      exact .inr (mem_refsCovers.mpr ⟨c, hc, .inl (by rw [hv]; exact hm)⟩))
    (fun m hm => by
      simp only [Val.unguardedRefs]
      exact mem_unguardedCovers.mpr ⟨c, hc, by rw [hv]; exact hm⟩)

theorem HookOk.restKey {t : Val} {cs : List Cover} {j : Data} {ns : List (String × Data)} {c : Cover} {v : Val}
    {k : String} {x : Data} (h : HookOk u env root (.rest t cs) j) (hc : c ∈ cs) (hv : c.2.1 = some v)
    (hm : j.named = some ns) (hx : (k, x) ∈ ns) : HookOk u env root v (.str k) :=
  h.strict (Nat.lt_of_le_of_lt (Data.weight_pos x) (Data.weight_lt_of_named hm hx)) fun m hm' => by
    simp only [Val.refs, List.mem_append]
    exact .inr (mem_refsCovers.mpr ⟨c, hc, .inr (.inl (by rw [hv]; exact hm'))⟩)

theorem HookOk.restMember {t : Val} {cs : List Cover} {j : Data} {ns : List (String × Data)} {c : Cover}
    {v : Val} {k : String} {x : Data} (h : HookOk u env root (.rest t cs) j) (hc : c ∈ cs)
    (hv : c.2.2 = some v) (hm : j.named = some ns) (hx : (k, x) ∈ ns) : HookOk u env root v x :=
  h.strict (Data.weight_lt_of_named hm hx) fun m hm' => by
    simp only [Val.refs, List.mem_append]
    exact .inr (mem_refsCovers.mpr ⟨c, hc, .inr (.inr (by rw [hv]; exact hm'))⟩)

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
  | mapKind : CheckableA .mapKind
  | listKind : CheckableA .listKind
  | lit {s : Scalar} : CheckableA (.lit s)
  | min {b : Bound} : CheckableA (.min b)
  | max {b : Bound} : CheckableA (.max b)
  | above {b : Bound} : CheckableA (.above b)
  | beneath {b : Bound} : CheckableA (.beneath b)
  | neq {vs : List Bound} : CheckableA (.neq vs)
  | mulof {d : Number} : CheckableA (.mulof d)
  | len {c : Val} : CheckableA c → CheckableA (.len c)
  | unique {k : Option String} : CheckableA (.unique k)
  | any : CheckableA .any
  | hole : CheckableA .hole
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
  | path {p : List Seg} : CheckableA (.path p)
  | nof {n : Val} {cs : List Val} : CheckableA n → (∀ c, c ∈ cs → CheckableA c) → CheckableA (.nof n cs)
  | call {f : Fn} {args : List Val} : (∀ a, a ∈ args → CheckableA a) → CheckableA (.call f args)
  | must {c : Val} {msg : String} : CheckableA c → CheckableA (.must c msg)
  | when {c t : Val} {e : Option Val} :
      CheckableA c → CheckableA t → (∀ e', e = some e' → CheckableA e') → CheckableA (.when c t e)
  | contains {c n : Val} : CheckableA c → CheckableA n → CheckableA (.contains c n)
  | rest {t : Val} {cs : List Cover} : CheckableA t →
      (∀ c, c ∈ cs → ∀ v, c.1 = some v → CheckableA v) →
      (∀ c, c ∈ cs → ∀ v, c.2.1 = some v → CheckableA v) →
      (∀ c, c ∈ cs → ∀ v, c.2.2 = some v → CheckableA v) →
      CheckableA (.rest t cs)
  | ride {k : Rider} {v : Val} {r : Record} : CheckableA v → CheckableA (.ride k v r)
  | key : CheckableA .key
  | keyUp {n : ℤ} : CheckableA (.keyUp n)
  | selectKey {arms : List (Val × Val)} {d : Option Val} :
      (∀ p r, (p, r) ∈ arms → CheckableA p) → (∀ p r, (p, r) ∈ arms → CheckableA r) →
      (∀ e, d = some e → CheckableA e) → CheckableA (.select .key arms d)
  | selectLit {s : Scalar} {arms : List (Val × Val)} {d : Option Val} :
      (∀ p r, (p, r) ∈ arms → CheckableA p) → (∀ p r, (p, r) ∈ arms → CheckableA r) →
      (∀ e, d = some e → CheckableA e) → CheckableA (.select (.lit s) arms d)

mutual
/-- Whether a value is checkable given a hook, computed. -/
def Val.checkableAB : Val → Bool
  | .select .key arms d | .select (.lit _) arms d => pairsCheckableA arms && spreadCheckableA d
  | .re _ | .format _ | .select _ _ _ | .filter _ _ => false
  | .len c => c.checkableAB
  | .map fs spread _ => fieldsCheckableA fs && spreadCheckableA spread
  | .list items spread _ => itemsCheckableA items && spreadCheckableA spread
  | .or arms => armsCheckableA arms
  | .pref _ x => x.checkableAB
  | .meet a b => a.checkableAB && b.checkableAB
  | .nof n cs => n.checkableAB && itemsCheckableA cs
  | .call _ args => itemsCheckableA args
  | .must c _ => c.checkableAB
  | .when c t e => c.checkableAB && t.checkableAB && spreadCheckableA e
  | .contains c n => c.checkableAB && n.checkableAB
  | .rest t cs => t.checkableAB && coversCheckableA cs
  | .ride _ v _ => v.checkableAB
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

def coversCheckableA : List Cover → Bool
  | [] => true
  | (c, k, m) :: cs => spreadCheckableA c && spreadCheckableA k && spreadCheckableA m && coversCheckableA cs

def armsCheckableA : List (ℕ × Val) → Bool
  | [] => true
  | (_, a) :: arms => a.checkableAB && armsCheckableA arms

def pairsCheckableA : List (Val × Val) → Bool
  | [] => true
  | (p, r) :: ps => p.checkableAB && r.checkableAB && pairsCheckableA ps
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
  | .mapKind => ⟨fun _ => .mapKind, fun _ => rfl⟩
  | .listKind => ⟨fun _ => .listKind, fun _ => rfl⟩
  | .lit _ => ⟨fun _ => .lit, fun _ => rfl⟩
  | .min _ => ⟨fun _ => .min, fun _ => rfl⟩
  | .max _ => ⟨fun _ => .max, fun _ => rfl⟩
  | .above _ => ⟨fun _ => .above, fun _ => rfl⟩
  | .beneath _ => ⟨fun _ => .beneath, fun _ => rfl⟩
  | .neq _ => ⟨fun _ => .neq, fun _ => rfl⟩
  | .mulof _ => ⟨fun _ => .mulof, fun _ => rfl⟩
  | .unique _ => ⟨fun _ => .unique, fun _ => rfl⟩
  | .any => ⟨fun _ => .any, fun _ => rfl⟩
  | .hole => ⟨fun _ => .hole, fun _ => rfl⟩
  | .nil => ⟨fun _ => .nil, fun _ => rfl⟩
  | .alias _ => ⟨fun _ => .alias, fun _ => rfl⟩
  | .re _ => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .format _ => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .select s arms d => by
    cases s
    case key =>
      simp only [Val.checkableAB, Bool.and_eq_true]
      rw [pairsCheckableA_iff arms, spreadCheckableA_iff d]
      exact ⟨fun ⟨⟨h1, h2⟩, h3⟩ => .selectKey h1 h2 h3, fun h => by cases h; exact ⟨⟨‹_›, ‹_›⟩, ‹_›⟩⟩
    case lit =>
      simp only [Val.checkableAB, Bool.and_eq_true]
      rw [pairsCheckableA_iff arms, spreadCheckableA_iff d]
      exact ⟨fun ⟨⟨h1, h2⟩, h3⟩ => .selectLit h1 h2 h3, fun h => by cases h; exact ⟨⟨‹_›, ‹_›⟩, ‹_›⟩⟩
    all_goals exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .filter _ _ => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .path _ => ⟨fun _ => .path, fun _ => rfl⟩
  | .key => ⟨fun _ => .key, fun _ => rfl⟩
  | .keyUp _ => ⟨fun _ => .keyUp, fun _ => rfl⟩
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
  | .ride k v r => by
    simp only [Val.checkableAB]
    rw [Val.checkableAB_iff v]
    exact ⟨.ride, fun h => by cases h; assumption⟩
  | .meet a b => by
    simp only [Val.checkableAB, Bool.and_eq_true]
    rw [Val.checkableAB_iff a, Val.checkableAB_iff b]
    exact ⟨fun ⟨h1, h2⟩ => .meet h1 h2, fun h => by cases h; exact ⟨‹_›, ‹_›⟩⟩
  | .nof n cs => by
    simp only [Val.checkableAB, Bool.and_eq_true]
    rw [Val.checkableAB_iff n, itemsCheckableA_iff cs]
    exact ⟨fun ⟨h1, h2⟩ => .nof h1 h2, fun h => by cases h; exact ⟨‹_›, ‹_›⟩⟩
  | .call _ args => by
    simp only [Val.checkableAB]
    rw [itemsCheckableA_iff args]
    exact ⟨.call, fun h => by cases h; assumption⟩
  | .must c _ => by
    simp only [Val.checkableAB]
    rw [Val.checkableAB_iff c]
    exact ⟨.must, fun h => by cases h; assumption⟩
  | .when c t e => by
    simp only [Val.checkableAB, Bool.and_eq_true]
    rw [Val.checkableAB_iff c, Val.checkableAB_iff t, spreadCheckableA_iff e]
    exact ⟨fun ⟨⟨h1, h2⟩, h3⟩ => .when h1 h2 h3, fun h => by cases h; exact ⟨⟨‹_›, ‹_›⟩, ‹_›⟩⟩
  | .contains c n => by
    simp only [Val.checkableAB, Bool.and_eq_true]
    rw [Val.checkableAB_iff c, Val.checkableAB_iff n]
    exact ⟨fun ⟨h1, h2⟩ => .contains h1 h2, fun h => by cases h; exact ⟨‹_›, ‹_›⟩⟩
  | .rest t cs => by
    simp only [Val.checkableAB, Bool.and_eq_true]
    rw [Val.checkableAB_iff t, coversCheckableA_iff cs]
    exact ⟨fun ⟨h1, h2, h3, h4⟩ => .rest h1 h2 h3 h4, fun h => by cases h; exact ⟨‹_›, ‹_›, ‹_›, ‹_›⟩⟩

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

theorem coversCheckableA_iff : ∀ cs : List Cover,
    coversCheckableA cs = true ↔
      (∀ c, c ∈ cs → ∀ v, c.1 = some v → v.CheckableA) ∧ (∀ c, c ∈ cs → ∀ v, c.2.1 = some v → v.CheckableA) ∧
        (∀ c, c ∈ cs → ∀ v, c.2.2 = some v → v.CheckableA)
  | [] => by simp [coversCheckableA]
  | (c, k, m) :: cs => by
    simp only [coversCheckableA, Bool.and_eq_true, List.forall_mem_cons]
    rw [spreadCheckableA_iff c, spreadCheckableA_iff k, spreadCheckableA_iff m, coversCheckableA_iff cs]
    exact ⟨fun ⟨⟨⟨h1, h2⟩, h3⟩, h4, h5, h6⟩ => ⟨⟨h1, h4⟩, ⟨h2, h5⟩, h3, h6⟩,
      fun ⟨⟨h1, h4⟩, ⟨h2, h5⟩, h3, h6⟩ => ⟨⟨⟨h1, h2⟩, h3⟩, h4, h5, h6⟩⟩

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

theorem pairsCheckableA_iff : ∀ ps : List (Val × Val),
    pairsCheckableA ps = true ↔
      (∀ p r, (p, r) ∈ ps → p.CheckableA) ∧ (∀ p r, (p, r) ∈ ps → r.CheckableA)
  | [] => by simp [pairsCheckableA]
  | (p, r) :: ps => by
    simp only [pairsCheckableA, Bool.and_eq_true, List.mem_cons, Prod.mk.injEq]
    rw [Val.checkableAB_iff p, Val.checkableAB_iff r, pairsCheckableA_iff ps]
    constructor
    · rintro ⟨⟨hp, hr⟩, hps, hrs⟩
      refine ⟨fun p' r' h => ?_, fun p' r' h => ?_⟩
      · rcases h with ⟨rfl, rfl⟩ | h
        · exact hp
        · exact hps p' r' h
      · rcases h with ⟨rfl, rfl⟩ | h
        · exact hr
        · exact hrs p' r' h
    · rintro ⟨hps, hrs⟩
      exact ⟨⟨hps p r (.inl ⟨rfl, rfl⟩), hrs p r (.inl ⟨rfl, rfl⟩)⟩,
        fun p' r' h' => hps p' r' (.inr h'), fun p' r' h' => hrs p' r' (.inr h')⟩
end

instance (v : Val) : Decidable v.CheckableA := decidable_of_iff _ (Val.checkableAB_iff v)

/-- A spread the checker can read it can read under any key. -/
theorem Val.CheckableA.atKey {v : Val} (h : v.CheckableA) (k : String) : (v.atKey k).CheckableA := by
  induction h with
  | key => exact .lit
  | meet _ _ iha ihb => exact .meet iha ihb
  | ride _ ih => exact .ride ih
  | selectKey hp hr hd => exact .selectLit hp hr hd
  | selectLit hp hr hd => exact .selectLit hp hr hd
  | _ => rw [Val.atKey_of_keyed k rfl]; first | (constructor <;> assumption) | constructor

theorem Val.Checkable.atKey {v : Val} (h : v.Checkable) (k : String) : (v.atKey k).Checkable := by
  induction h with
  | key => exact .lit
  | meet _ _ iha ihb => exact .meet iha ihb
  | ride _ ih => exact .ride ih
  | selectKey hp hr hd => exact .selectLit hp hr hd
  | selectLit hp hr hd => exact .selectLit hp hr hd
  | _ => rw [Val.atKey_of_keyed k rfl]; first | (constructor <;> assumption) | constructor

/-- A spread reads the names it reads under any key. -/
theorem Val.refs_atKey (k : String) (v : Val) : (v.atKey k).refs = v.refs := by
  induction v using Val.atKey.induct with
  | case1 => rfl
  | case2 a b iha ihb => simp only [Val.atKey, Val.refs, iha, ihb]
  | case3 s arms d ih => simp only [Val.atKey, Val.refs, ih]
  | case4 t v r ih => simp only [Val.atKey, Val.refs, ih]
  | case5 v h1 h2 h3 h4 => rw [Val.atKey.eq_5 k v h1 h2 h3 h4]

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
  | mapKind => exact .mapKind
  | listKind => exact .listKind
  | lit => exact .lit
  | min => exact .min
  | max => exact .max
  | above => exact .above
  | beneath => exact .beneath
  | neq => exact .neq
  | mulof => exact .mulof
  | len _ ih => exact .len ih
  | unique => exact .unique
  | any => exact .any
  | hole => exact .hole
  | nil => exact .nil
  | map _ _ ihf ihs => exact .map ihf ihs
  | list _ _ ihi ihs => exact .list ihi ihs
  | or _ ih => exact .or ih
  | pref _ ih => exact .pref ih
  | ride _ ih => exact .ride ih
  | meet _ _ iha ihb => exact .meet iha ihb
  | path => exact .path
  | nof _ _ ihn ihcs => exact .nof ihn ihcs
  | call _ ih => exact .call ih
  | must _ ih => exact .must ih
  | when _ _ _ ihc iht ihe => exact .when ihc iht ihe
  | contains _ _ ihc ihn => exact .contains ihc ihn
  | rest _ _ _ _ iht ih1 ih2 ih3 => exact .rest iht ih1 ih2 ih3
  | key => exact .key
  | keyUp => exact .keyUp
  | selectKey _ _ _ ihp ihr ihd => exact .selectKey ihp ihr ihd
  | selectLit _ _ _ ihp ihr ihd => exact .selectLit ihp ihr ihd

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
  | ride _ ih => exact .ride (ih fun n hn' => hn n (by simpa [Val.refs] using hn'))
  | meet _ _ iha ihb =>
    exact .meet (iha fun n hn' => hn n (by simp only [Val.refs, List.mem_append]; exact .inl hn'))
      (ihb fun n hn' => hn n (by simp only [Val.refs, List.mem_append]; exact .inr hn'))
  | @alias n => exact absurd (by simp [Val.refs]) (hn n)
  | @nof n cs _ _ ihn ihcs =>
    refine .nof (ihn fun m hm => hn m ?_) (fun c hc => ihcs c hc fun m hm => hn m ?_)
    · simp only [Val.refs, List.mem_append]; exact .inl hm
    · simp only [Val.refs, List.mem_append]; exact .inr (mem_refsItems.mpr ⟨c, hc, hm⟩)
  | must _ ih => exact .must (ih fun m hm => hn m (by simpa [Val.refs] using hm))
  | @when c t e _ _ _ ihc iht ihe =>
    refine .when (ihc fun m hm => hn m ?_) (iht fun m hm => hn m ?_)
      (fun e' he => ihe e' he fun m hm => hn m ?_)
    · simp only [Val.refs, List.mem_append]; exact .inl (.inl hm)
    · simp only [Val.refs, List.mem_append]; exact .inl (.inr hm)
    · simp only [Val.refs, List.mem_append, he, refsSpread]; exact .inr hm
  | @contains c n _ _ ihc ihn =>
    refine .contains (ihc fun m hm => hn m ?_) (ihn fun m hm => hn m ?_)
    · simp only [Val.refs, List.mem_append]; exact .inl hm
    · simp only [Val.refs, List.mem_append]; exact .inr hm
  | @rest t cs _ _ _ _ iht ih1 ih2 ih3 =>
    refine .rest (iht fun m hm => hn m ?_) (fun c hc v hv => ih1 c hc v hv fun m hm => hn m ?_)
      (fun c hc v hv => ih2 c hc v hv fun m hm => hn m ?_) (fun c hc v hv => ih3 c hc v hv fun m hm => hn m ?_)
    · simp only [Val.refs, List.mem_append]; exact .inl hm
    · simp only [Val.refs, List.mem_append]
      exact .inr (mem_refsCovers.mpr ⟨c, hc, .inl (by rw [hv]; exact hm)⟩)
    · simp only [Val.refs, List.mem_append]
      exact .inr (mem_refsCovers.mpr ⟨c, hc, .inr (.inl (by rw [hv]; exact hm))⟩)
    · simp only [Val.refs, List.mem_append]
      exact .inr (mem_refsCovers.mpr ⟨c, hc, .inr (.inr (by rw [hv]; exact hm))⟩)
  | @selectKey arms d _ _ _ ihp ihr ihd =>
    refine .selectKey (fun p r hm => ihp p r hm fun n hn' => hn n ?_)
      (fun p r hm => ihr p r hm fun n hn' => hn n ?_) (fun e he => ihd e he fun n hn' => hn n ?_)
    · simp only [Val.refs, List.mem_append]; exact .inl (.inr (mem_refsPairs.mpr ⟨p, r, hm, .inl hn'⟩))
    · simp only [Val.refs, List.mem_append]; exact .inl (.inr (mem_refsPairs.mpr ⟨p, r, hm, .inr hn'⟩))
    · simp only [Val.refs, List.mem_append, he, refsSpread]; exact .inr hn'
  | @selectLit s arms d _ _ _ ihp ihr ihd =>
    refine .selectLit (fun p r hm => ihp p r hm fun n hn' => hn n ?_)
      (fun p r hm => ihr p r hm fun n hn' => hn n ?_) (fun e he => ihd e he fun n hn' => hn n ?_)
    · simp only [Val.refs, List.mem_append]; exact .inl (.inr (mem_refsPairs.mpr ⟨p, r, hm, .inl hn'⟩))
    · simp only [Val.refs, List.mem_append]; exact .inl (.inr (mem_refsPairs.mpr ⟨p, r, hm, .inr hn'⟩))
    · simp only [Val.refs, List.mem_append, he, refsSpread]; exact .inr hn'
  | @call f args _ ih =>
    exact .call fun a ha => ih a ha fun n hn' => hn n (by
      simp only [Val.refs]; exact mem_refsItems.mpr ⟨a, ha, hn'⟩)
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
      | none => rw [hs] at hn; exact absurd hn (List.not_mem_nil)
      | some s => rw [hs] at hn; exact ihs s hs n hn
  | @list items spread closed _ _ ihi ihs =>
    intro n hn
    simp only [Val.refs, List.mem_append] at hn
    rcases hn with hn | hn
    · obtain ⟨v, hm, hv⟩ := mem_refsItems.mp hn
      exact ihi v hm n hv
    · cases hs : spread with
      | none => rw [hs] at hn; exact absurd hn (List.not_mem_nil)
      | some s => rw [hs] at hn; exact ihs s hs n hn
  | or _ ih =>
    intro n hn
    simp only [Val.refs] at hn
    obtain ⟨r, a, hm, ha⟩ := mem_refsArms.mp hn
    exact ih r a hm n ha
  | pref _ ih => intro n hn; exact ih n (by simpa [Val.refs] using hn)
  | ride _ ih => intro n hn; exact ih n (by simpa [Val.refs] using hn)
  | meet _ _ iha ihb =>
    intro n hn
    simp only [Val.refs, List.mem_append] at hn
    exact hn.elim (iha n) (ihb n)
  | @nof n cs _ _ ihn ihcs =>
    intro m hm
    simp only [Val.refs, List.mem_append] at hm
    rcases hm with hm | hm
    · exact ihn m hm
    · obtain ⟨c, hc, hv⟩ := mem_refsItems.mp hm
      exact ihcs c hc m hv
  | must _ ih => intro m hm; exact ih m (by simpa [Val.refs] using hm)
  | @when c t e _ _ _ ihc iht ihe =>
    intro m hm
    simp only [Val.refs, List.mem_append] at hm
    rcases hm with (hm | hm) | hm
    · exact ihc m hm
    · exact iht m hm
    · cases he : e with
      | none => rw [he] at hm; exact absurd hm (List.not_mem_nil)
      | some e' => rw [he] at hm; exact ihe e' he m hm
  | @contains c n _ _ ihc ihn =>
    intro m hm
    simp only [Val.refs, List.mem_append] at hm
    exact hm.elim (ihc m) (ihn m)
  | @rest t cs _ _ _ _ iht ih1 ih2 ih3 =>
    intro m hm
    simp only [Val.refs, List.mem_append] at hm
    rcases hm with hm | hm
    · exact iht m hm
    · obtain ⟨c, hc, h⟩ := mem_refsCovers.mp hm
      rcases h with h | h | h
      · cases hv : c.1 with
        | none => rw [hv] at h; exact absurd h (List.not_mem_nil)
        | some v => rw [hv] at h; exact ih1 c hc v hv m h
      · cases hv : c.2.1 with
        | none => rw [hv] at h; exact absurd h (List.not_mem_nil)
        | some v => rw [hv] at h; exact ih2 c hc v hv m h
      · cases hv : c.2.2 with
        | none => rw [hv] at h; exact absurd h (List.not_mem_nil)
        | some v => rw [hv] at h; exact ih3 c hc v hv m h
  | @selectKey arms d _ _ _ ihp ihr ihd =>
    intro n hn
    simp only [Val.refs, List.mem_append] at hn
    rcases hn with (hn | hn) | hn
    · simp at hn
    · obtain ⟨p, r, hm, hp | hr⟩ := mem_refsPairs.mp hn
      · exact ihp p r hm n hp
      · exact ihr p r hm n hr
    · cases hd : d with
      | none => rw [hd] at hn; exact absurd hn (List.not_mem_nil)
      | some e => rw [hd] at hn; exact ihd e hd n hn
  | @selectLit s arms d _ _ _ ihp ihr ihd =>
    intro n hn
    simp only [Val.refs, List.mem_append] at hn
    rcases hn with (hn | hn) | hn
    · simp at hn
    · obtain ⟨p, r, hm, hp | hr⟩ := mem_refsPairs.mp hn
      · exact ihp p r hm n hp
      · exact ihr p r hm n hr
    · cases hd : d with
      | none => rw [hd] at hn; exact absurd hn (List.not_mem_nil)
      | some e => rw [hd] at hn; exact ihd e hd n hn
  | call _ ih =>
    intro n hn
    simp only [Val.refs] at hn
    obtain ⟨a, ha, hn⟩ := mem_refsItems.mp hn
    exact ih a ha n hn
  | _ => intro n hn; simp [Val.refs] at hn

mutual
/-- Whether `v` admits `j`, computed: `v.atKeyO k` judged, with `k` the key a
spread is tried under, which the forms `atKey` reads through carry. -/
def checkWith (u : String → Data → Bool) (k : Option String) : Val → Data → Bool
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
  | .mapKind, j => match j with
    | .map _ => true
    | _ => false
  | .listKind, j => match j with
    | .list _ => true
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
  | .mulof d, j => match j with
    | .num x => decide d.Positive && decide (x.multipleOf d)
    | _ => false
  | .len c, j => match j.size with
    | some n => if h : IntegerLeaf n then checkWith u none c (.num (.integer ⟨n, h⟩)) else false
    | none => false
  | .unique k, j => match j.members with
    | some ms => ms.all (fun x => (x.project k).isSome) && distinct k ms
    | none => false
  | .any, _ => true
  | .hole, _ => true
  | .nil, _ => false
  | .map fs spread closed, j => match j with
    | .map jfs =>
      checkFieldsWith u fs jfs && jfs.all (fun m => checkKeySpreadWith u m.1 spread m.2) &&
        (!closed || jfs.all fun m => fs.any fun f => decide (f.1 = m.1))
    | _ => false
  | .list items spread closed, j => match j with
    | .list xs =>
      decide (items.length ≤ xs.length) &&
        (!closed || spread.isSome || decide (xs.length = items.length)) &&
        checkItemsWith u items xs && (namedItems 0 xs).all (fun m => checkKeySpreadWith u m.1 spread m.2)
    | _ => false
  | .or arms, j => checkArmsWith u arms j
  | .pref _ x, j => checkWith u none x j || checkSuperWith u x j
  | .ride _ v _, j => checkWith u k v j
  | .meet a b, j => checkWith u k a j && checkWith u k b j
  | .re _, _ => false
  | .format _, _ => false
  | .select .key arms d, j => match k with
    | some k' => (checkArmsSelectWith u (.str k') arms j).getD (checkOptWith u d j)
    | none => false
  | .select (.lit s) arms d, j => (checkArmsSelectWith u s.data arms j).getD (checkOptWith u d j)
  | .select _ _ _, _ => false
  | .filter _ _, _ => false
  | .call _ _, _ => false
  | .key, j => match k, j with
    | some k', .str s => decide (k' = s)
    | _, _ => false
  | .keyUp _, _ => false
  | .alias n, j => u n j
  | .path _, _ => false
  | .nof n cs, j =>
    if h : IntegerLeaf (countWith u cs j) then checkWith u none n (.num (.integer ⟨countWith u cs j, h⟩))
    else false
  | .must c _, j => checkWith u none c j
  | .when c t e, j => if checkWith u none c j then checkWith u none t j else checkSpreadWith u e j
  | .contains c n, j => match j.members with
    | some ms =>
      if h : IntegerLeaf (ms.countP fun x => checkWith u none c x) then
        checkWith u none n (.num (.integer ⟨ms.countP fun x => checkWith u none c x, h⟩))
      else false
    | none => false
  | .rest t cs, j => match j.named with
    | some ns => ns.all fun m => restEvaluatedWith u cs j m.1 m.2 || checkWith u none t m.2
    | none => true

/-- The branches of a trial that admit the datum, counted. -/
def countWith (u : String → Data → Bool) : List Val → Data → ℕ
  | [], _ => 0
  | c :: cs, j => (if checkWith u none c j then 1 else 0) + countWith u cs j

/-- The declared keys of a map: each present one holds its value, and
each absent one is optional. -/
def checkFieldsWith (u : String → Data → Bool) : List (String × Bool × Val) → List (String × Data) → Bool
  | [], _ => true
  | (k, o, v) :: fs, jfs =>
    (match lookup k jfs with
      | none => o
      | some x => checkWith u none v x) && checkFieldsWith u fs jfs

/-- The positions of a list that the instance has. -/
def checkItemsWith (u : String → Data → Bool) : List Val → List Data → Bool
  | v :: vs, x :: xs => checkWith u none v x && checkItemsWith u vs xs
  | _, _ => true

/-- A spread, where there is one. -/
def checkSpreadWith (u : String → Data → Bool) : Option Val → Data → Bool
  | none, _ => true
  | some s, x => checkWith u none s x

/-- A container's spread, where there is one, under the key of the
member it is tried on. -/
def checkKeySpreadWith (u : String → Data → Bool) (key : String) : Option Val → Data → Bool
  | none, _ => true
  | some s, x => checkWith u (some key) s x

/-- The result of the first arm whose pattern admits `x`, where one does. -/
def checkArmsSelectWith (u : String → Data → Bool) (x : Data) : List (Val × Val) → Data → Option Bool
  | [], _ => none
  | (p, r) :: arms, j => if checkWith u none p x then some (checkWith u none r j) else checkArmsSelectWith u x arms j

/-- A cover's `keys` or `members` trial, where there is one: one not
written evaluates nothing. -/
def checkOptWith (u : String → Data → Bool) : Option Val → Data → Bool
  | none, _ => false
  | some v, x => checkWith u none v x

/-- Whether some cover evaluates the member `x` under the key `k` of `j`. -/
def restEvaluatedWith (u : String → Data → Bool) : List Cover → Data → String → Data → Bool
  | [], _, _, _ => false
  | (c, ks, ms) :: cs, j, k, x =>
    (checkSpreadWith u c j && (checkOptWith u ks (.str k) || checkOptWith u ms x)) || restEvaluatedWith u cs j k x

/-- Whether any arm admits. -/
def checkArmsWith (u : String → Data → Bool) : List (ℕ × Val) → Data → Bool
  | [], _ => false
  | (_, a) :: arms, j => checkWith u none a j || checkArmsWith u arms j

/-- Whether `v.super`, the parent type of `v`, admits `j`: `check` on
`v.super`, written by recursion on `v`, since `v.super` is no part of
`v` for `check` to recurse into. -/
def checkSuperWith (u : String → Data → Bool) : Val → Data → Bool
  | .integer, j | .float, j | .biginteger, j | .bigdecimal, j => match j with
    | .num _ => true
    | _ => false
  | .number, _ | .string, _ | .anyString, _ | .boolean, _ | .mapKind, _ | .listKind, _
  | .any, _ => true
  | .hole, _ => true
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
  | .mulof _, j => match j with
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
        checkSuperItemsWith u items xs && (namedItems 0 xs).all (fun m => checkSuperSpreadWith u spread m.2)
    | _ => false
  | .or arms, j => checkSuperArmsWith u arms j
  | .pref _ x, j => checkSuperWith u x j
  | .ride _ v _, j => checkSuperWith u v j
  | .meet a b, j =>
    if a.isKind then (if b.isKind then (if a.isLeaf then checkSuperWith u a j else checkSuperWith u b j) else checkWith u none a j)
    else if b.isKind then checkWith u none b j else checkSuperWith u a j && checkSuperWith u b j
  | .alias n, j => u n j
  | .path _, _ => false
  | .nof _ _, _ | .must _ _, _ | .when _ _ _, _ | .contains _ _, _ | .rest _ _, _
  | .select _ _ _, _ | .filter _ _, _ | .call _ _, _ => true
  | .key, j | .keyUp _, j => match j with
    | .str _ => true
    | _ => false

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
    (ih : ∀ s, spread = some s → (checkWith u none s x = true ↔ Admits env root s x)) :
    checkSpreadWith u spread x = true ↔ ∀ s, spread = some s → Admits env root s x := by
  cases spread with
  | none => simp [checkSpreadWith]
  | some s => simp [checkSpreadWith, ih s rfl]

theorem checkFieldsWith_iff {fs : List (String × Bool × Val)} {jfs : List (String × Data)}
    (ih : ∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x →
      (checkWith u none v x = true ↔ Admits env root v x)) :
    checkFieldsWith u fs jfs = true ↔
      (∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x → Admits env root v x) ∧
        (∀ k o v, (k, o, v) ∈ fs → lookup k jfs = none → o = true) := by
  induction fs with
  | nil => simp [checkFieldsWith]
  | cons f fs ihfs =>
    obtain ⟨k, o, v⟩ := f
    have ihv := fun x hx => ih k o v x (List.mem_cons_self) hx
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

set_option maxHeartbeats 1000000 in
theorem checkItemsWith_iff {items : List Val} {xs : List Data}
    (ih : ∀ (i : ℕ) (v : Val) (x : Data), items[i]? = some v → xs[i]? = some x →
      (checkWith u none v x = true ↔ Admits env root v x)) :
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
    (ih : ∀ r a, (r, a) ∈ arms → (checkWith u none a j = true ↔ Admits env root a j)) :
    checkArmsWith u arms j = true ↔ ∃ r a, (r, a) ∈ arms ∧ Admits env root a j := by
  induction arms with
  | nil => simp [checkArmsWith]
  | cons p arms iharms =>
    obtain ⟨r, a⟩ := p
    have iha := ih r a (List.mem_cons_self)
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
    have ihv := fun x hx => ih k o v x (List.mem_cons_self) hx
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

set_option maxHeartbeats 1000000 in
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
    have iha := ih r a (List.mem_cons_self)
    have iht := iharms (fun r a h => ih r a (List.mem_cons_of_mem _ h))
    simp only [checkSuperArmsWith, Bool.or_eq_true, iha, iht, List.mem_cons, Prod.mk.injEq]
    constructor
    · rintro (h | ⟨r', a', hm, h⟩)
      · exact ⟨r, a, Or.inl ⟨rfl, rfl⟩, h⟩
      · exact ⟨r', a', Or.inr hm, h⟩
    · rintro ⟨r', a', ⟨rfl, rfl⟩ | hm, h⟩
      · exact Or.inl h
      · exact Or.inr ⟨r', a', hm, h⟩

/-! ## The checker's answer is the judgement

Each lemma below reads the checker's `Bool` as the judgement it is:
`true` where the definition admits, `false` where it refuses. The list
lemmas say what a `false` over a container's members witnesses. -/

/-- A `Bool` is a judgement when each of its values would be. -/
theorem judge_of_bool {c : Bool} {v : Val} {j : Data} (ht : c = true → Judge env root true v j)
    (hf : c = false → Judge env root false v j) : Judge env root c v j := by
  cases c
  · exact hf rfl
  · exact ht rfl

/-- A judgement, read through an equation on its answer. -/
theorem Judge.of_eq {c b : Bool} {v : Val} {j : Data} (h : Judge env root c v j) (e : c = b) :
    Judge env root b v j := e ▸ h

/-- A `false` over a list has a member that answers `false`. -/
theorem all_false_mem {α : Type} {p : α → Bool} : ∀ {l : List α}, l.all p = false → ∃ x, x ∈ l ∧ p x = false
  | [], h => nomatch h
  | x :: l, h => by
    simp only [List.all_cons, Bool.and_eq_false_iff] at h
    rcases h with h | h
    · exact ⟨x, List.mem_cons_self, h⟩
    · obtain ⟨y, hy, hp⟩ := all_false_mem h
      exact ⟨y, List.mem_cons_of_mem _ hy, hp⟩

theorem checkSpreadWith_false {spread : Option Val} {x : Data}
    (ih : ∀ s, spread = some s → Judge env root (checkWith u none s x) s x) :
    checkSpreadWith u spread x = false → ∃ s, spread = some s ∧ Judge env root false s x := by
  cases spread with
  | none => intro h; exact nomatch h
  | some s => intro h; exact ⟨s, rfl, (ih s rfl).of_eq h⟩

theorem checkKeySpreadWith_false {spread : Option Val} {k : String} {x : Data}
    (ih : ∀ s, spread = some s → Judge env root (checkWith u (some k) s x) (s.atKey k) x) :
    checkKeySpreadWith u k spread x = false → ∃ s, spread = some s ∧ Judge env root false (s.atKey k) x := by
  cases spread with
  | none => intro h; exact nomatch h
  | some s => intro h; exact ⟨s, rfl, (ih s rfl).of_eq h⟩

/-- An arm the scrutinee's value is refused by goes before what a
selection on the rest of the arms judges. -/
theorem judge_select_cons {s : Scalar} {p r : Val} {arms : List (Val × Val)} {d : Option Val}
    {b : Bool} {j : Data} (hp : Judge env root false p s.data)
    (h : Judge env root b (.select (.lit s) arms d) j) :
    Judge env root b (.select (.lit s) ((p, r) :: arms) d) j := by
  cases h with
  | @selectArm _ _ _ _ i p' r' _ hi hpre hp' hr' =>
    refine .selectArm (i := i + 1) (by simpa using hi) (fun i' q hlt hq => ?_) hp' hr'
    cases i' with
    | zero => simp only [List.getElem?_cons_zero, Option.some.injEq] at hq; subst hq; exact hp
    | succ i' => exact hpre i' q (by omega) (by simpa using hq)
  | selectElse hall he =>
    refine .selectElse (fun q hq => ?_) he
    rcases List.mem_cons.mp hq with rfl | hq
    · exact hp
    · exact hall q hq
  | selectNone hall =>
    refine .selectNone fun q hq => ?_
    rcases List.mem_cons.mp hq with rfl | hq
    · exact hp
    · exact hall q hq

/-- An arm whose pattern refuses the scrutinee's value is passed over. -/
theorem judge_select_uncons {s : Scalar} {p r : Val} {arms : List (Val × Val)} {d : Option Val}
    {b : Bool} {j : Data} (hp : Judge env root false p s.data)
    (h : Judge env root b (.select (.lit s) ((p, r) :: arms) d) j) :
    Judge env root b (.select (.lit s) arms d) j := by
  cases h with
  | @selectArm _ _ _ _ i p' r' _ hi hpre hp' hr' =>
    cases i with
    | zero =>
      simp only [List.getElem?_cons_zero, Option.some.injEq, Prod.mk.injEq] at hi
      obtain ⟨rfl, rfl⟩ := hi
      exact nomatch judge_unique hp hp'
    | succ i =>
      exact .selectArm (i := i) (by simpa using hi)
        (fun i' q hlt hq => hpre (i' + 1) q (by omega) (by simpa using hq)) hp' hr'
  | selectElse hall he => exact .selectElse (fun q hq => hall q (List.mem_cons_of_mem _ hq)) he
  | selectNone hall => exact .selectNone fun q hq => hall q (List.mem_cons_of_mem _ hq)

/-- The checker judges a selection on a literal as the definition does,
given that it judges each pattern on the literal's value, and each
result and the default on the datum. -/
theorem judge_selectWith {s : Scalar} {d : Option Val} {j : Data} :
    ∀ {arms : List (Val × Val)},
    (∀ p r, (p, r) ∈ arms → Judge env root (checkWith u none p s.data) p s.data) →
    (∀ p r, (p, r) ∈ arms → Judge env root (checkWith u none r j) r j) →
    (∀ e, d = some e → Judge env root (checkWith u none e j) e j) →
    Judge env root ((checkArmsSelectWith u s.data arms j).getD (checkOptWith u d j))
      (.select (.lit s) arms d) j
  | [], _, _, hd => by
    simp only [checkArmsSelectWith, Option.getD_none]
    cases d with
    | none => exact .selectNone fun q hq => nomatch hq
    | some e => exact .selectElse (fun q hq => nomatch hq) (hd e rfl)
  | (p, r) :: arms, hp, hr, hd => by
    simp only [checkArmsSelectWith]
    have hp0 := hp p r List.mem_cons_self
    split
    · rename_i hc
      exact .selectArm (i := 0) rfl (fun _ _ hlt _ => absurd hlt (Nat.not_lt_zero _))
        (hp0.of_eq hc) (hr p r List.mem_cons_self)
    · rename_i hc
      exact judge_select_cons (hp0.of_eq (Bool.eq_false_iff.mpr hc))
        (judge_selectWith (fun p' r' hm => hp p' r' (List.mem_cons_of_mem _ hm))
          (fun p' r' hm => hr p' r' (List.mem_cons_of_mem _ hm)) hd)

theorem checkFieldsWith_false {fs : List (String × Bool × Val)} {jfs : List (String × Data)}
    (ih : ∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x → Judge env root (checkWith u none v x) v x) :
    checkFieldsWith u fs jfs = false →
      (∃ k o v x, (k, o, v) ∈ fs ∧ lookup k jfs = some x ∧ Judge env root false v x) ∨
        (∃ k o v, (k, o, v) ∈ fs ∧ lookup k jfs = none ∧ o = false) := by
  induction fs with
  | nil => intro h; exact nomatch h
  | cons f fs ihfs =>
    obtain ⟨k, o, v⟩ := f
    intro h
    simp only [checkFieldsWith] at h
    rcases Bool.and_eq_false_iff.mp h with h | h
    · cases hl : lookup k jfs with
      | none =>
        rw [hl] at h
        exact .inr ⟨k, o, v, List.mem_cons_self, hl, h⟩
      | some x =>
        rw [hl] at h
        exact .inl ⟨k, o, v, x, List.mem_cons_self, hl,
          (ih k o v x (List.mem_cons_self) hl).of_eq h⟩
    · rcases ihfs (fun k o v x hm hx => ih k o v x (List.mem_cons_of_mem _ hm) hx) h with
        ⟨k', o', v', x, hm, hx, hr⟩ | ⟨k', o', v', hm, hx, ho⟩
      · exact .inl ⟨k', o', v', x, List.mem_cons_of_mem _ hm, hx, hr⟩
      · exact .inr ⟨k', o', v', List.mem_cons_of_mem _ hm, hx, ho⟩

set_option maxHeartbeats 1000000 in
theorem checkItemsWith_false {items : List Val} {xs : List Data}
    (ih : ∀ (i : ℕ) (v : Val) (x : Data), items[i]? = some v → xs[i]? = some x →
      Judge env root (checkWith u none v x) v x) :
    checkItemsWith u items xs = false →
      ∃ (i : ℕ) (v : Val) (x : Data), items[i]? = some v ∧ xs[i]? = some x ∧ Judge env root false v x := by
  induction items generalizing xs with
  | nil => intro h; exact nomatch h
  | cons v vs ihvs =>
    cases xs with
    | nil => intro h; exact nomatch h
    | cons x xs =>
      intro h
      simp only [checkItemsWith] at h
      rcases Bool.and_eq_false_iff.mp h with h | h
      · exact ⟨0, v, x, List.getElem?_cons_zero, List.getElem?_cons_zero,
          (ih 0 v x List.getElem?_cons_zero List.getElem?_cons_zero).of_eq h⟩
      · obtain ⟨i, w, y, hw, hy, hr⟩ := ihvs (fun i w y hw hy => ih (i + 1) w y
          (by rw [List.getElem?_cons_succ]; exact hw) (by rw [List.getElem?_cons_succ]; exact hy)) h
        exact ⟨i + 1, w, y, by rw [List.getElem?_cons_succ]; exact hw,
          by rw [List.getElem?_cons_succ]; exact hy, hr⟩

theorem checkClosed_false (fs : List (String × Bool × Val)) (closed : Bool)
    (jfs : List (String × Data)) :
    (!closed || jfs.all fun m => fs.any fun f => decide (f.1 = m.1)) = false →
      closed = true ∧ ∃ k x, (k, x) ∈ jfs ∧ ∀ o v, (k, o, v) ∉ fs := by
  cases closed with
  | false => intro h; exact nomatch h
  | true =>
    intro h
    simp only [Bool.not_true, Bool.false_or] at h
    obtain ⟨m, hm, hn⟩ := all_false_mem h
    refine ⟨rfl, m.1, m.2, hm, fun o v hv => ?_⟩
    rw [List.any_eq_true.mpr ⟨(m.1, o, v), hv, decide_eq_true rfl⟩] at hn
    exact nomatch hn

theorem checkSealed_false (closed : Bool) (spread : Option Val) (items : List Val) (xs : List Data) :
    (!closed || spread.isSome || decide (xs.length = items.length)) = false →
      closed = true ∧ spread = none ∧ xs.length ≠ items.length := by
  cases closed <;> cases spread <;> simp

theorem checkArmsWith_false {arms : List (ℕ × Val)} {j : Data}
    (ih : ∀ r a, (r, a) ∈ arms → Judge env root (checkWith u none a j) a j) :
    checkArmsWith u arms j = false → ∀ r a, (r, a) ∈ arms → Judge env root false a j := by
  induction arms with
  | nil => intro _ r a hm; exact absurd hm (List.not_mem_nil)
  | cons p arms iharms =>
    obtain ⟨r, a⟩ := p
    intro h r' a' hm
    simp only [checkArmsWith] at h
    obtain ⟨ha, hrest⟩ := Bool.or_eq_false_iff.mp h
    rcases List.mem_cons.mp hm with he | hm'
    · cases he
      exact (ih r a (List.mem_cons_self)).of_eq ha
    · exact iharms (fun r a hm => ih r a (List.mem_cons_of_mem _ hm)) hrest r' a' hm'

theorem checkSuperSpreadWith_false {spread : Option Val} {x : Data}
    (ih : ∀ s, spread = some s → Judge env root (checkSuperWith u s x) s.super x) :
    checkSuperSpreadWith u spread x = false → ∃ s, spread = some s ∧ Judge env root false s.super x := by
  cases spread with
  | none => intro h; exact nomatch h
  | some s => intro h; exact ⟨s, rfl, (ih s rfl).of_eq h⟩

theorem checkSuperFieldsWith_false {fs : List (String × Bool × Val)} {jfs : List (String × Data)}
    (ih : ∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x →
      Judge env root (checkSuperWith u v x) v.super x) :
    checkSuperFieldsWith u fs jfs = false →
      (∃ k o v x, (k, o, v) ∈ fs ∧ lookup k jfs = some x ∧ Judge env root false v.super x) ∨
        (∃ k o v, (k, o, v) ∈ fs ∧ lookup k jfs = none ∧ o = false) := by
  induction fs with
  | nil => intro h; exact nomatch h
  | cons f fs ihfs =>
    obtain ⟨k, o, v⟩ := f
    intro h
    simp only [checkSuperFieldsWith] at h
    rcases Bool.and_eq_false_iff.mp h with h | h
    · cases hl : lookup k jfs with
      | none =>
        rw [hl] at h
        exact .inr ⟨k, o, v, List.mem_cons_self, hl, h⟩
      | some x =>
        rw [hl] at h
        exact .inl ⟨k, o, v, x, List.mem_cons_self, hl,
          (ih k o v x (List.mem_cons_self) hl).of_eq h⟩
    · rcases ihfs (fun k o v x hm hx => ih k o v x (List.mem_cons_of_mem _ hm) hx) h with
        ⟨k', o', v', x, hm, hx, hr⟩ | ⟨k', o', v', hm, hx, ho⟩
      · exact .inl ⟨k', o', v', x, List.mem_cons_of_mem _ hm, hx, hr⟩
      · exact .inr ⟨k', o', v', List.mem_cons_of_mem _ hm, hx, ho⟩

set_option maxHeartbeats 1000000 in
theorem checkSuperItemsWith_false {items : List Val} {xs : List Data}
    (ih : ∀ (i : ℕ) (v : Val) (x : Data), items[i]? = some v → xs[i]? = some x →
      Judge env root (checkSuperWith u v x) v.super x) :
    checkSuperItemsWith u items xs = false →
      ∃ (i : ℕ) (v : Val) (x : Data), items[i]? = some v ∧ xs[i]? = some x ∧
        Judge env root false v.super x := by
  induction items generalizing xs with
  | nil => intro h; exact nomatch h
  | cons v vs ihvs =>
    cases xs with
    | nil => intro h; exact nomatch h
    | cons x xs =>
      intro h
      simp only [checkSuperItemsWith] at h
      rcases Bool.and_eq_false_iff.mp h with h | h
      · exact ⟨0, v, x, List.getElem?_cons_zero, List.getElem?_cons_zero,
          (ih 0 v x List.getElem?_cons_zero List.getElem?_cons_zero).of_eq h⟩
      · obtain ⟨i, w, y, hw, hy, hr⟩ := ihvs (fun i w y hw hy => ih (i + 1) w y
          (by rw [List.getElem?_cons_succ]; exact hw) (by rw [List.getElem?_cons_succ]; exact hy)) h
        exact ⟨i + 1, w, y, by rw [List.getElem?_cons_succ]; exact hw,
          by rw [List.getElem?_cons_succ]; exact hy, hr⟩

theorem checkSuperArmsWith_false {arms : List (ℕ × Val)} {j : Data}
    (ih : ∀ r a, (r, a) ∈ arms → Judge env root (checkSuperWith u a j) a.super j) :
    checkSuperArmsWith u arms j = false → ∀ r a, (r, a) ∈ arms → Judge env root false a.super j := by
  induction arms with
  | nil => intro _ r a hm; exact absurd hm (List.not_mem_nil)
  | cons p arms iharms =>
    obtain ⟨r, a⟩ := p
    intro h r' a' hm
    simp only [checkSuperArmsWith] at h
    obtain ⟨ha, hrest⟩ := Bool.or_eq_false_iff.mp h
    rcases List.mem_cons.mp hm with he | hm'
    · cases he
      exact (ih r a (List.mem_cons_self)).of_eq ha
    · exact iharms (fun r a hm => ih r a (List.mem_cons_of_mem _ hm)) hrest r' a' hm'

/-- The checker's evaluation of a member is the relation's, each trial
answered by the checker. -/
theorem restEvaluatedWith_eq {u : String → Data → Bool} : ∀ (cs : List Cover) (j : Data) (k : String) (x : Data),
    restEvaluatedWith u cs j k x =
      evaluatedBy cs (fun c => checkSpreadWith u c.1 j) (fun c k => checkOptWith u c.2.1 (.str k))
        (fun c x => checkOptWith u c.2.2 x) k x
  | [], _, _, _ => rfl
  | (c, ks, ms) :: cs, j, k, x => by
    rw [restEvaluatedWith, restEvaluatedWith_eq cs j k x]
    unfold evaluatedBy
    simp only [List.any_cons]
    congr 1
    unfold coverApplies coverHolds
    cases c <;> cases ks <;> cases ms <;> simp [checkSpreadWith, checkOptWith]

/-- The count the checker takes is the count of the branches it answers `true`. -/
theorem countWith_eq {j : Data} : ∀ cs : List Val, countWith u cs j = cs.countP fun c => checkWith u none c j
  | [] => rfl
  | c :: cs => by
    simp only [countWith, List.countP_cons, countWith_eq cs]
    cases checkWith u none c j <;> simp [Nat.add_comm]

/-- The domain of a bound, judged as the checker judges it. -/
theorem checkDomain_judge (b : Bound) (j : Data) : Judge env root (checkDomain b j) b.domain j := by
  cases b with
  | num n =>
    cases j with
    | num x => exact .number
    | _ => exact .numberNot fun _ h => nomatch h
  | str b =>
    cases j with
    | str t =>
      simp only [checkDomain, Bound.domain]
      refine judge_of_bool (fun h => .string (of_decide_eq_true h)) (fun h => .stringNot fun s hs => ?_)
      cases hs
      exact Decidable.of_not_not (of_decide_eq_false h)
    | _ => exact .stringNot fun _ h => nomatch h

/-- A leaf's kind refuses a number of another leaf. -/
theorem leaf_kind_refuses (l : Leaf) (y : Number) (h : l ≠ y.leaf) :
    Judge env root false l.kind (.num y) := by
  cases l <;> cases y <;>
    first
    | exact absurd rfl h
    | exact .integerNot fun _ h => nomatch h
    | exact .floatNot fun _ h => nomatch h
    | exact .bigintegerNot fun _ h => nomatch h
    | exact .bigdecimalNot fun _ h => nomatch h

/-- A leaf's kind refuses what is no number. -/
theorem leaf_kind_refuses_nonnum (l : Leaf) (j : Data) (h : ∀ y, j ≠ .num y) :
    Judge env root false l.kind j := by
  cases l
  · exact .integerNot fun x hx => h _ hx
  · exact .floatNot fun x hx => h _ hx
  · exact .bigintegerNot fun x hx => h _ hx
  · exact .bigdecimalNot fun x hx => h _ hx

theorem judge_integer (j : Data) : Judge env root (checkWith u none .integer j) .integer j := by
  cases j with
  | num x => cases x with
    | integer _ => exact .integer
    | _ => exact .integerNot fun _ h => nomatch h
  | _ => exact .integerNot fun _ h => nomatch h

theorem judge_float (j : Data) : Judge env root (checkWith u none .float j) .float j := by
  cases j with
  | num x => cases x with
    | float _ => exact .float
    | _ => exact .floatNot fun _ h => nomatch h
  | _ => exact .floatNot fun _ h => nomatch h

theorem judge_biginteger (j : Data) : Judge env root (checkWith u none .biginteger j) .biginteger j := by
  cases j with
  | num x => cases x with
    | biginteger _ => exact .biginteger
    | _ => exact .bigintegerNot fun _ h => nomatch h
  | _ => exact .bigintegerNot fun _ h => nomatch h

theorem judge_bigdecimal (j : Data) : Judge env root (checkWith u none .bigdecimal j) .bigdecimal j := by
  cases j with
  | num x => cases x with
    | bigdecimal _ => exact .bigdecimal
    | _ => exact .bigdecimalNot fun _ h => nomatch h
  | _ => exact .bigdecimalNot fun _ h => nomatch h

theorem judge_number (j : Data) : Judge env root (checkWith u none .number j) .number j := by
  cases j with
  | num x => exact .number
  | _ => exact .numberNot fun _ h => nomatch h

theorem judge_string (j : Data) : Judge env root (checkWith u none .string j) .string j := by
  cases j with
  | str s =>
    simp only [checkWith]
    refine judge_of_bool (fun h => .string (of_decide_eq_true h)) (fun h => .stringNot fun s' hs => ?_)
    cases hs
    exact Decidable.of_not_not (of_decide_eq_false h)
  | _ => exact .stringNot fun _ h => nomatch h

theorem judge_anyString (j : Data) : Judge env root (checkWith u none .anyString j) .anyString j := by
  cases j with
  | str s => exact .anyString
  | _ => exact .anyStringNot fun _ h => nomatch h

theorem judge_boolean (j : Data) : Judge env root (checkWith u none .boolean j) .boolean j := by
  cases j with
  | bool b => exact .boolean
  | _ => exact .booleanNot fun _ h => nomatch h

theorem judge_mapKind (j : Data) : Judge env root (checkWith u none .mapKind j) .mapKind j := by
  cases j with
  | map fs => exact .mapKind
  | _ => exact .mapKindNot fun _ h => nomatch h

theorem judge_listKind (j : Data) : Judge env root (checkWith u none .listKind j) .listKind j := by
  cases j with
  | list xs => exact .listKind
  | _ => exact .listKindNot fun _ h => nomatch h

/-- The checker judges a kind as the definition does. -/
theorem check_kind_judge {v : Val} (hk : v.isKind = true) (j : Data) :
    Judge env root (checkWith u none v j) v j := by
  cases v
  case ride k v r => exact .ride (check_kind_judge (v := v) hk j)
  all_goals simp [Val.isKind] at hk <;>
    first
    | exact judge_integer j
    | exact judge_float j
    | exact judge_biginteger j
    | exact judge_bigdecimal j
    | exact judge_number j
    | exact judge_string j
    | exact judge_anyString j
    | exact judge_boolean j

set_option linter.unusedVariables false in
/-- The checker by the parent type judges by it, for every value it can
check, given a hook that is right where it is asked. -/
theorem checkSuperWith_judge {v : Val} (h : v.CheckableA) :
    ∀ j, HookOk u env root v j → Judge env root (checkSuperWith u v j) v.super j := by
  induction h with
  | integer | float | biginteger | bigdecimal =>
    intro j _
    cases j with
    | num x => exact .number
    | _ => exact .numberNot fun _ h => nomatch h
  | number | string | anyString | boolean | mapKind | listKind | any | hole => intro j _; exact .any
  | nil => intro j _; exact .nil
  | @lit s =>
    intro j _
    cases s with
    | num x =>
      cases j with
      | num y =>
        simp only [checkSuperWith, Val.super]
        refine judge_of_bool (fun h => ?_) (fun h => leaf_kind_refuses _ _ (of_decide_eq_false h))
        rw [of_decide_eq_true h]
        exact admits_leaf_kind y
      | _ => exact leaf_kind_refuses_nonnum _ _ fun _ h => nomatch h
    | str s =>
      cases j with
      | str t =>
        by_cases hs : s = ""
        · subst hs
          simp only [checkSuperWith, Val.super, if_true, decide_true, Bool.true_or]
          exact .anyString
        · simp only [checkSuperWith, Val.super, hs, if_false, decide_false, Bool.false_or]
          refine judge_of_bool (fun h => .string (of_decide_eq_true h))
            (fun h => .stringNot fun s' hs' => ?_)
          cases hs'
          exact Decidable.of_not_not (of_decide_eq_false h)
      | _ =>
        unfold Val.super
        split
        · exact .anyStringNot fun _ h => nomatch h
        · exact .stringNot fun _ h => nomatch h
    | bool b =>
      cases j with
      | bool c => exact .boolean
      | _ => exact .booleanNot fun _ h => nomatch h
    | null =>
      cases j with
      | null => exact .null
      | _ => exact .litNot fun h => nomatch h
  | @min b | @max b | @above b | @beneath b => intro j _; exact checkDomain_judge b j
  | @neq vs =>
    intro j _
    cases vs with
    | nil => exact .any
    | cons v vs => exact checkDomain_judge v j
  | @mulof d =>
    intro j _
    cases j with
    | num x => exact .number
    | _ => exact .numberNot fun _ h => nomatch h
  | @len c _ _ | @unique k => intro j _; exact .any
  | @map fs spread closed _ _ ihfs ihsp =>
    intro j hu
    cases j with
    | map jfs =>
      simp only [checkSuperWith, Val.super]
      have ihf : ∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x →
          Judge env root (checkSuperWith u v x) v.super x :=
        fun k o v x hm hx => ihfs k o v hm x (hu.field hm hx)
      refine judge_of_bool (fun h => ?_) (fun h => ?_)
      · simp only [Bool.and_eq_true] at h
        obtain ⟨⟨h1, h2⟩, h3⟩ := h
        obtain ⟨hf1, hf2⟩ :=
          (checkSuperFieldsWith_iff fun k o v x hm hx => (ihf k o v x hm hx).toIff).mp h1
        have hs : ∀ t, superSpread spread = some t → ∀ k x, (k, x) ∈ jfs →
            Admits env root (t.atKey k) x := by
          intro t ht k x hm
          obtain ⟨s, hs, rfl⟩ := superSpread_eq.mp ht
          rw [Val.atKey_of_keyed k (Val.keyed_super s)]
          have := List.all_eq_true.mp h2 (k, x) hm
          exact (ihsp s hs x (hu.mapSpread hs hm)).of_eq (by simpa [checkSuperSpreadWith, hs] using this)
        have h4 := (checkClosed_iff fs closed jfs).mp h3
        refine .map ?_ ?_ hs ?_
        · intro k o w x hm hx
          obtain ⟨v, hv, rfl⟩ := mem_superFields.mp hm
          exact hf1 k o v x hv hx
        · intro k o w hm hx
          obtain ⟨v, hv, rfl⟩ := mem_superFields.mp hm
          exact hf2 k o v hv hx
        · intro hc k x hm
          obtain ⟨o, v, hv⟩ := h4 hc k x hm
          exact ⟨o, v.super, mem_superFields.mpr ⟨v, hv, rfl⟩⟩
      · rcases Bool.and_eq_false_iff.mp h with h12 | h3
        · rcases Bool.and_eq_false_iff.mp h12 with h1 | h2
          · rcases checkSuperFieldsWith_false ihf h1 with ⟨k, o, v, x, hm, hx, hr⟩ | ⟨k, o, v, hm, hx, ho⟩
            · exact .mapField (mem_superFields.mpr ⟨v, hm, rfl⟩) hx hr
            · exact .mapMissing (mem_superFields.mpr ⟨v, hm, rfl⟩) hx ho
          · obtain ⟨⟨k, x⟩, hm, hn⟩ := all_false_mem h2
            obtain ⟨s, hs, hr⟩ := checkSuperSpreadWith_false
              (fun s hs => ihsp s hs x (hu.mapSpread hs hm)) hn
            exact .mapSpread (superSpread_eq.mpr ⟨s, hs, rfl⟩) hm
              (by rw [Val.atKey_of_keyed k (Val.keyed_super s)]; exact hr)
        · obtain ⟨hc, k, x, hm, hn⟩ := checkClosed_false fs closed jfs h3
          refine .mapClosed hc hm fun o w hw => ?_
          obtain ⟨v, hv, -⟩ := mem_superFields.mp hw
          exact hn o v hv
    | _ => exact .mapNot fun _ h => nomatch h
  | @list items spread closed _ _ ihitems ihsp =>
    intro j hu
    cases j with
    | list xs =>
      simp only [checkSuperWith, Val.super]
      have ihi : ∀ (i : ℕ) (v : Val) (x : Data), items[i]? = some v → xs[i]? = some x →
          Judge env root (checkSuperWith u v x) v.super x :=
        fun i v x hv hx => ihitems v (List.mem_of_getElem? hv) x (hu.item hv hx)
      refine judge_of_bool (fun h => ?_) (fun h => ?_)
      · simp only [Bool.and_eq_true, decide_eq_true_eq] at h
        obtain ⟨⟨⟨h1, h2⟩, h3⟩, h4⟩ := h
        have hi := (checkSuperItemsWith_iff fun i v x hv hx => (ihi i v x hv hx).toIff).mp h3
        refine .list (by rw [superItems_length]; exact h1)
          (by
            rw [superItems_length]
            intro hc ht
            exact (checkSealed_iff closed spread items xs).mp h2 hc (superSpread_none.mp ht))
          (fun i w x hw hx => ?_) (fun t ht k x hm => ?_)
        · rw [superItems_getElem?] at hw
          cases hv : items[i]? with
          | none => rw [hv] at hw; cases hw
          | some v => rw [hv] at hw; cases hw; exact hi i v x hv hx
        · obtain ⟨s, hs, rfl⟩ := superSpread_eq.mp ht
          rw [Val.atKey_of_keyed k (Val.keyed_super s)]
          have := List.all_eq_true.mp h4 (k, x) hm
          exact (ihsp s hs x (hu.listSpread hs (mem_namedItems hm))).of_eq
            (by simpa [checkSuperSpreadWith, hs] using this)
      · rcases Bool.and_eq_false_iff.mp h with h123 | h4
        · rcases Bool.and_eq_false_iff.mp h123 with h12 | h3
          · rcases Bool.and_eq_false_iff.mp h12 with h1 | h2
            · exact .listShort (by rw [superItems_length]; exact Nat.lt_of_not_le (of_decide_eq_false h1))
            · obtain ⟨hc, hsn, hne⟩ := checkSealed_false closed spread items xs h2
              exact .listLong hc (superSpread_none.mpr hsn) (by rw [superItems_length]; exact hne)
          · obtain ⟨i, v, x, hv, hx, hr⟩ := checkSuperItemsWith_false ihi h3
            exact .listItem (by rw [superItems_getElem?, hv]; rfl) hx hr
        · obtain ⟨⟨k, x⟩, hm, hn⟩ := all_false_mem h4
          obtain ⟨s, hs, hr⟩ := checkSuperSpreadWith_false
            (fun s hs => ihsp s hs x (hu.listSpread hs (mem_namedItems hm))) hn
          exact .listSpread (superSpread_eq.mpr ⟨s, hs, rfl⟩) hm
            (by rw [Val.atKey_of_keyed k (Val.keyed_super s)]; exact hr)
    | _ => exact .listNot fun _ h => nomatch h
  | @or arms _ iharms =>
    intro j hu
    simp only [checkSuperWith, Val.super]
    have iha : ∀ r a, (r, a) ∈ arms → Judge env root (checkSuperWith u a j) a.super j :=
      fun r a hm => iharms r a hm j (hu.arm hm)
    refine judge_of_bool (fun h => ?_) (fun h => ?_)
    · obtain ⟨r, a, hm, ha⟩ := (checkSuperArmsWith_iff fun r a hm => (iha r a hm).toIff).mp h
      exact .or (mem_superArms.mpr ⟨a, hm, rfl⟩) ha
    · refine .orNone fun r b hm => ?_
      obtain ⟨a, hm', rfl⟩ := mem_superArms.mp hm
      exact checkSuperArmsWith_false iha h r a hm'
  | @pref r x _ ihx => intro j hu; exact ihx j hu.pref
  | @ride k v r _ ihv => intro j hu; exact ihv j hu.ride
  | @alias k =>
    intro j hu
    simp only [checkSuperWith, Val.super]
    exact hu.alias
  | path =>
    intro j _
    simp only [checkSuperWith, Val.super]
    exact .path
  | nof _ _ _ _ | must _ _ | when _ _ _ _ _ _ | contains _ _ _ _ | rest _ _ _ _ _ _ _ _
  | selectKey _ _ _ _ _ _ | selectLit _ _ _ _ _ _ | call _ _ => intro j _; exact .any
  | key | keyUp =>
    intro j _
    cases j with
    | str s => exact .anyString
    | _ => exact .anyStringNot fun _ h => nomatch h
  | @meet a b ha hb iha ihb =>
    intro j hu
    cases hka : a.isKind <;> cases hkb : b.isKind <;>
      simp only [checkSuperWith, Val.super, hka, hkb, Bool.false_eq_true, if_false, if_true]
    · have h1 := iha j hu.meetLeft
      have h2 := ihb j hu.meetRight
      refine judge_of_bool (fun h => ?_) (fun h => ?_)
      · simp only [Bool.and_eq_true] at h
        exact .meet (h1.of_eq h.1) (h2.of_eq h.2)
      · rcases Bool.and_eq_false_iff.mp h with e1 | e2
        · exact .meetLeft (h1.of_eq e1)
        · exact .meetRight (h2.of_eq e2)
    · exact check_kind_judge hkb j
    · exact check_kind_judge hka j
    · cases a.isLeaf
      · simp only [Bool.false_eq_true, if_false]; exact ihb j hu.meetRight
      · simp only [if_true]; exact iha j hu.meetLeft

/-- The checker by the parent type decides admission, and refusal, by
it. -/
theorem checkSuperWith_iff {v : Val} (h : v.CheckableA) (j : Data) (hu : HookOk u env root v j)
    {b : Bool} : checkSuperWith u v j = b ↔ Judge env root b v.super j :=
  (checkSuperWith_judge h j hu).toIff

/-- A term with no `key` at its own position is checked alike under any key. -/
theorem checkWith_keyless {v : Val} (hv : v.keyed = false) (ky : Option String) (j : Data) :
    checkWith u ky v j = checkWith u none v j := by
  induction v using Val.keyed.induct generalizing j with
  | case1 => exact nomatch hv
  | case2 a b iha ihb =>
    simp only [Val.keyed, Bool.or_eq_false_iff] at hv
    simp only [checkWith, iha hv.1, ihb hv.2]
  | case3 sc arms d _ =>
    simp only [Val.keyed] at hv
    cases sc <;> first | rfl | exact nomatch hv
  | case4 t v r ih =>
    simp only [Val.keyed] at hv
    simp only [checkWith, ih hv]
  | case5 v h1 h2 h3 h4 =>
    cases v <;> first
      | rfl
      | exact absurd rfl h1
      | exact (h2 _ _ rfl).elim
      | exact (h3 _ _ _ rfl).elim
      | exact (h4 _ _ _ rfl).elim

theorem judge_keyless {v : Val} (hv : v.keyed = false) {ky : Option String} {j : Data}
    (h : Judge env root (checkWith u none v j) v j) :
    Judge env root (checkWith u ky v j) (v.atKeyO ky) j := by
  cases ky with
  | none => exact h
  | some k' =>
    rw [checkWith_keyless hv, Val.atKeyO, Val.atKey_of_keyed k' hv]
    exact h

set_option linter.unusedVariables false in
/-- The checker judges every value it can check as the definition does,
under the key a spread is tried with, where there is one. -/
theorem checkWithKey_judge {v : Val} (h : v.CheckableA) :
    ∀ (ky : Option String) j, HookOk u env root v j →
      Judge env root (checkWith u ky v j) (v.atKeyO ky) j := by
  induction h with
  | any => intro ky j _; refine judge_keyless rfl ?_; exact .any
  | hole => intro ky j _; refine judge_keyless rfl ?_; exact .hole
  | keyUp => intro ky j _; refine judge_keyless rfl ?_; exact .keyUp
  | nil => intro ky j _; refine judge_keyless rfl ?_; exact .nil
  | call _ _ => intro ky j _; refine judge_keyless rfl ?_; exact .call
  | integer => intro ky j _; refine judge_keyless rfl ?_; exact judge_integer j
  | float => intro ky j _; refine judge_keyless rfl ?_; exact judge_float j
  | biginteger => intro ky j _; refine judge_keyless rfl ?_; exact judge_biginteger j
  | bigdecimal => intro ky j _; refine judge_keyless rfl ?_; exact judge_bigdecimal j
  | number => intro ky j _; refine judge_keyless rfl ?_; exact judge_number j
  | string => intro ky j _; refine judge_keyless rfl ?_; exact judge_string j
  | anyString => intro ky j _; refine judge_keyless rfl ?_; exact judge_anyString j
  | boolean => intro ky j _; refine judge_keyless rfl ?_; exact judge_boolean j
  | mapKind => intro ky j _; refine judge_keyless rfl ?_; exact judge_mapKind j
  | listKind => intro ky j _; refine judge_keyless rfl ?_; exact judge_listKind j
  | @lit s =>
    intro ky j _
    refine judge_keyless rfl ?_
    cases s with
    | null =>
      cases j with
      | null => exact .null
      | _ => exact .litNot fun h => nomatch h
    | bool b =>
      cases j with
      | bool b' =>
        simp only [checkWith]
        refine judge_of_bool (fun h => ?_) (fun h => .litNot fun e => ?_)
        · cases of_decide_eq_true h; exact .bool
        · exact of_decide_eq_false h (by cases e; rfl)
      | _ => exact .litNot fun h => nomatch h
    | num x =>
      cases j with
      | num y =>
        simp only [checkWith]
        refine judge_of_bool (fun h => ?_) (fun h => .litNot fun e => ?_)
        · cases of_decide_eq_true h; exact .num
        · exact of_decide_eq_false h (by cases e; rfl)
      | _ => exact .litNot fun h => nomatch h
    | str s =>
      cases j with
      | str s' =>
        simp only [checkWith]
        refine judge_of_bool (fun h => ?_) (fun h => .litNot fun e => ?_)
        · cases of_decide_eq_true h; exact .str
        · exact of_decide_eq_false h (by cases e; rfl)
      | _ => exact .litNot fun h => nomatch h
  | @min b =>
    intro ky j _
    refine judge_keyless rfl ?_
    cases b with
    | num n =>
      cases j with
      | num x =>
        simp only [checkWith]
        refine judge_of_bool (fun h => .min (of_decide_eq_true h))
          (fun h => .minNot (fun _ _ hn hx => ?_) (fun _ _ h => nomatch h))
        cases hn; cases hx; exact of_decide_eq_false h
      | _ => exact .minNot (fun _ _ _ h => nomatch h) (fun _ _ h => nomatch h)
    | str b =>
      cases j with
      | str s =>
        simp only [checkWith]
        refine judge_of_bool (fun h => .minStr (of_decide_eq_true h))
          (fun h => .minNot (fun _ _ h => nomatch h) (fun _ _ hb hs => ?_))
        cases hb; cases hs; exact of_decide_eq_false h
      | _ => exact .minNot (fun _ _ h => nomatch h) (fun _ _ _ h => nomatch h)
  | @max b =>
    intro ky j _
    refine judge_keyless rfl ?_
    cases b with
    | num n =>
      cases j with
      | num x =>
        simp only [checkWith]
        refine judge_of_bool (fun h => .max (of_decide_eq_true h))
          (fun h => .maxNot (fun _ _ hn hx => ?_) (fun _ _ h => nomatch h))
        cases hn; cases hx; exact of_decide_eq_false h
      | _ => exact .maxNot (fun _ _ _ h => nomatch h) (fun _ _ h => nomatch h)
    | str b =>
      cases j with
      | str s =>
        simp only [checkWith]
        refine judge_of_bool (fun h => .maxStr (of_decide_eq_true h))
          (fun h => .maxNot (fun _ _ h => nomatch h) (fun _ _ hb hs => ?_))
        cases hb; cases hs; exact of_decide_eq_false h
      | _ => exact .maxNot (fun _ _ h => nomatch h) (fun _ _ _ h => nomatch h)
  | @above b =>
    intro ky j _
    refine judge_keyless rfl ?_
    cases b with
    | num n =>
      cases j with
      | num x =>
        simp only [checkWith]
        refine judge_of_bool (fun h => .above (of_decide_eq_true h))
          (fun h => .aboveNot (fun _ _ hn hx => ?_) (fun _ _ h => nomatch h))
        cases hn; cases hx; exact of_decide_eq_false h
      | _ => exact .aboveNot (fun _ _ _ h => nomatch h) (fun _ _ h => nomatch h)
    | str b =>
      cases j with
      | str s =>
        simp only [checkWith]
        refine judge_of_bool (fun h => .aboveStr (of_decide_eq_true h))
          (fun h => .aboveNot (fun _ _ h => nomatch h) (fun _ _ hb hs => ?_))
        cases hb; cases hs; exact of_decide_eq_false h
      | _ => exact .aboveNot (fun _ _ h => nomatch h) (fun _ _ _ h => nomatch h)
  | @beneath b =>
    intro ky j _
    refine judge_keyless rfl ?_
    cases b with
    | num n =>
      cases j with
      | num x =>
        simp only [checkWith]
        refine judge_of_bool (fun h => .beneath (of_decide_eq_true h))
          (fun h => .beneathNot (fun _ _ hn hx => ?_) (fun _ _ h => nomatch h))
        cases hn; cases hx; exact of_decide_eq_false h
      | _ => exact .beneathNot (fun _ _ _ h => nomatch h) (fun _ _ h => nomatch h)
    | str b =>
      cases j with
      | str s =>
        simp only [checkWith]
        refine judge_of_bool (fun h => .beneathStr (of_decide_eq_true h))
          (fun h => .beneathNot (fun _ _ h => nomatch h) (fun _ _ hb hs => ?_))
        cases hb; cases hs; exact of_decide_eq_false h
      | _ => exact .beneathNot (fun _ _ h => nomatch h) (fun _ _ _ h => nomatch h)
  | @neq vs =>
    intro ky j _
    refine judge_keyless rfl ?_
    cases j with
    | num x =>
      simp only [checkWith]
      refine judge_of_bool (fun ha => ?_) (fun ha => ?_)
      · refine .neq fun v hv => ?_
        have hv := List.all_eq_true.mp ha v hv
        cases v with
        | num n => exact ⟨n, rfl, by simpa using hv⟩
        | str _ => simp at hv
      · refine .neqNot (fun x' hx => ?_) (fun _ h => nomatch h)
        cases hx
        obtain ⟨v, hv, hnv⟩ := all_false_mem ha
        refine ⟨v, hv, fun n hn => ?_⟩
        subst hn
        change decide (n ≠ x) = false at hnv
        exact Decidable.of_not_not (of_decide_eq_false hnv)
    | str s =>
      simp only [checkWith]
      refine judge_of_bool (fun ha => ?_) (fun ha => ?_)
      · refine .neqStr fun v hv => ?_
        have hv := List.all_eq_true.mp ha v hv
        cases v with
        | str t => exact ⟨t, rfl, by simpa using hv⟩
        | num _ => simp at hv
      · refine .neqNot (fun _ h => nomatch h) (fun s' hs => ?_)
        cases hs
        obtain ⟨v, hv, hnv⟩ := all_false_mem ha
        refine ⟨v, hv, fun t ht => ?_⟩
        subst ht
        change decide (t ≠ s) = false at hnv
        exact Decidable.of_not_not (of_decide_eq_false hnv)
    | _ => exact .neqNot (fun _ h => nomatch h) (fun _ h => nomatch h)
  | @mulof d =>
    intro ky j _
    refine judge_keyless rfl ?_
    cases j with
    | num x =>
      simp only [checkWith]
      refine judge_of_bool (fun h => ?_) (fun h => .mulofNot fun x' hx hp hm => ?_)
      · simp only [Bool.and_eq_true, decide_eq_true_eq] at h
        exact .mulof h.1 h.2
      · cases hx
        rcases Bool.and_eq_false_iff.mp h with h | h
        · exact of_decide_eq_false h hp
        · exact of_decide_eq_false h hm
    | _ => exact .mulofNot fun _ h => nomatch h
  | @len c _ ihc =>
    intro ky j hu
    refine judge_keyless rfl ?_
    simp only [checkWith]
    cases hs : j.size with
    | none => exact .lenNone hs
    | some n =>
      show Judge env root (if h : IntegerLeaf n then checkWith u none c (.num (.integer ⟨n, h⟩)) else false) (.len c) j
      split
      · rename_i h
        exact .len h hs (ihc none _ hu.len)
      · rename_i h
        exact .lenBig hs h
  | @unique k =>
    intro ky j _
    refine judge_keyless rfl ?_
    simp only [checkWith]
    cases hm : j.members with
    | none => exact .uniqueNone hm
    | some ms =>
      refine judge_of_bool (fun h => ?_) (fun h => ?_)
      · simp only [Bool.and_eq_true, List.all_eq_true, distinct_iff] at h
        exact .unique hm (fun x hx => h.1 x hx) h.2
      · rcases Bool.and_eq_false_iff.mp h with h | h
        · obtain ⟨x, hx, hp⟩ := all_false_mem h
          refine .uniqueBare hm hx ?_
          cases hq : x.project k with
          | none => rfl
          | some _ => rw [hq] at hp; exact nomatch hp
        · refine .uniqueDup hm fun hp => ?_
          rw [(distinct_iff k ms).mpr hp] at h
          exact nomatch h
  | @alias k =>
    intro ky j hu
    refine judge_keyless rfl ?_
    simp only [checkWith]
    exact hu.alias
  | path => intro ky j _; refine judge_keyless rfl ?_; exact .path
  | @nof n cs _ _ ihn ihcs =>
    intro ky j hu
    refine judge_keyless rfl ?_
    simp only [checkWith]
    have hbr : ∀ c, c ∈ cs → Judge env root (checkWith u none c j) c j :=
      fun c hc => ihcs c hc none j (hu.nofBranch hc)
    split
    · rename_i h
      exact .nof h hbr (countWith_eq cs).symm (ihn none _ hu.nofCount)
    · rename_i h
      exact .nofBig hbr (countWith_eq cs).symm h
  | must _ ih =>
    intro ky j hu
    refine judge_keyless rfl ?_
    simp only [checkWith]
    exact .must (ih none j hu.must)
  | @when c t e _ _ _ ihc iht ihe =>
    intro ky j hu
    refine judge_keyless rfl ?_
    simp only [checkWith]
    have hc := ihc none j hu.whenCond
    split
    · rename_i h
      exact .whenThen (hc.of_eq h) (iht none j hu.whenThen)
    · rename_i h
      have hc' : Judge env root false c j := hc.of_eq (Bool.eq_false_iff.mpr h)
      cases e with
      | none => exact .whenPass hc'
      | some e' => exact .whenElse hc' (ihe e' rfl none j hu.whenElse)
  | @contains c n _ _ ihc ihn =>
    intro ky j hu
    refine judge_keyless rfl ?_
    simp only [checkWith]
    cases hm : j.members with
    | none => exact .containsNone hm
    | some ms =>
      have hmem : ∀ x, x ∈ ms → Judge env root (checkWith u none c x) c x :=
        fun x hx => ihc none x (hu.containsMember hm hx)
      show Judge env root (if h : IntegerLeaf (ms.countP fun x => checkWith u none c x) then
        checkWith u none n (.num (.integer ⟨ms.countP fun x => checkWith u none c x, h⟩)) else false) (.contains c n) j
      split
      · rename_i h
        exact .contains h hm hmem rfl (ihn none _ hu.containsCount)
      · rename_i h
        exact .containsBig hm hmem rfl h
  | @rest t cs _ _ _ _ iht ih1 ih2 ih3 =>
    intro ky j hu
    refine judge_keyless rfl ?_
    simp only [checkWith]
    cases hm : j.named with
    | none => exact .restNone hm
    | some ns =>
      show Judge env root (ns.all fun m => restEvaluatedWith u cs j m.1 m.2 || checkWith u none t m.2) (.rest t cs) j
      refine .rest (gc := fun c => checkSpreadWith u c.1 j) (gk := fun c k => checkOptWith u c.2.1 (.str k))
        (gm := fun c x => checkOptWith u c.2.2 x) (ft := fun x => checkWith u none t x) hm
        (fun c hc v hv => ?_) (fun c hc v hv k x hx => ?_) (fun c hc v hv k x hx => ?_)
        (fun k x hx => iht none x (hu.restT hm hx)) ?_
      · have := ih1 c hc v hv none j (hu.restCond hc hv)
        show Judge env root (checkSpreadWith u c.1 j) v j
        rw [hv]; exact this
      · have := ih2 c hc v hv none (.str k) (hu.restKey hc hv hm hx)
        show Judge env root (checkOptWith u c.2.1 (.str k)) v (.str k)
        rw [hv]; exact this
      · have := ih3 c hc v hv none x (hu.restMember hc hv hm hx)
        show Judge env root (checkOptWith u c.2.2 x) v x
        rw [hv]; exact this
      · apply all_congr
        intro m _
        rw [restEvaluatedWith_eq]
  | @map fs spread closed _ _ ihfs ihsp =>
    intro ky j hu
    refine judge_keyless rfl ?_
    cases j with
    | map jfs =>
      simp only [checkWith]
      have ihf : ∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x →
          Judge env root (checkWith u none v x) v x :=
        fun k o v x hm hx => ihfs k o v hm none x (hu.field hm hx)
      refine judge_of_bool (fun h => ?_) (fun h => ?_)
      · simp only [Bool.and_eq_true] at h
        obtain ⟨⟨h1, h2⟩, h3⟩ := h
        obtain ⟨hf1, hf2⟩ := (checkFieldsWith_iff fun k o v x hm hx => (ihf k o v x hm hx).toIff).mp h1
        refine .map hf1 hf2 (fun s hs k x hm => ?_) ((checkClosed_iff fs closed jfs).mp h3)
        have := List.all_eq_true.mp h2 (k, x) hm
        exact (ihsp s hs (some k) x (hu.mapSpread hs hm)).of_eq
          (by simpa [checkKeySpreadWith, hs] using this)
      · rcases Bool.and_eq_false_iff.mp h with h12 | h3
        · rcases Bool.and_eq_false_iff.mp h12 with h1 | h2
          · rcases checkFieldsWith_false ihf h1 with ⟨k, o, v, x, hm, hx, hr⟩ | ⟨k, o, v, hm, hx, ho⟩
            · exact .mapField hm hx hr
            · exact .mapMissing hm hx ho
          · obtain ⟨⟨k, x⟩, hm, hn⟩ := all_false_mem h2
            obtain ⟨s, hs, hr⟩ := checkKeySpreadWith_false
              (fun s hs => ihsp s hs (some k) x (hu.mapSpread hs hm)) hn
            exact .mapSpread hs hm hr
        · obtain ⟨hc, k, x, hm, hn⟩ := checkClosed_false fs closed jfs h3
          exact .mapClosed hc hm hn
    | _ => exact .mapNot fun _ h => nomatch h
  | @list items spread closed _ _ ihitems ihsp =>
    intro ky j hu
    refine judge_keyless rfl ?_
    cases j with
    | list xs =>
      simp only [checkWith]
      have ihi : ∀ (i : ℕ) (v : Val) (x : Data), items[i]? = some v → xs[i]? = some x →
          Judge env root (checkWith u none v x) v x :=
        fun i v x hv hx => ihitems v (List.mem_of_getElem? hv) none x (hu.item hv hx)
      refine judge_of_bool (fun h => ?_) (fun h => ?_)
      · simp only [Bool.and_eq_true, decide_eq_true_eq] at h
        obtain ⟨⟨⟨h1, h2⟩, h3⟩, h4⟩ := h
        refine .list h1 ((checkSealed_iff closed spread items xs).mp h2)
          ((checkItemsWith_iff fun i v x hv hx => (ihi i v x hv hx).toIff).mp h3) (fun s hs k x hm => ?_)
        have := List.all_eq_true.mp h4 (k, x) hm
        exact (ihsp s hs (some k) x (hu.listSpread hs (mem_namedItems hm))).of_eq
          (by simpa [checkKeySpreadWith, hs] using this)
      · rcases Bool.and_eq_false_iff.mp h with h123 | h4
        · rcases Bool.and_eq_false_iff.mp h123 with h12 | h3
          · rcases Bool.and_eq_false_iff.mp h12 with h1 | h2
            · exact .listShort (Nat.lt_of_not_le (of_decide_eq_false h1))
            · obtain ⟨hc, hsn, hne⟩ := checkSealed_false closed spread items xs h2
              exact .listLong hc hsn hne
          · obtain ⟨i, v, x, hv, hx, hr⟩ := checkItemsWith_false ihi h3
            exact .listItem hv hx hr
        · obtain ⟨⟨k, x⟩, hm, hn⟩ := all_false_mem h4
          obtain ⟨s, hs, hr⟩ := checkKeySpreadWith_false
            (fun s hs => ihsp s hs (some k) x (hu.listSpread hs (mem_namedItems hm))) hn
          exact .listSpread hs hm hr
    | _ => exact .listNot fun _ h => nomatch h
  | @or arms _ iharms =>
    intro ky j hu
    refine judge_keyless rfl ?_
    simp only [checkWith]
    have iha : ∀ r a, (r, a) ∈ arms → Judge env root (checkWith u none a j) a j :=
      fun r a hm => iharms r a hm none j (hu.arm hm)
    refine judge_of_bool (fun h => ?_) (fun h => .orNone (checkArmsWith_false iha h))
    obtain ⟨r, a, hm, ha⟩ := (checkArmsWith_iff fun r a hm => (iha r a hm).toIff).mp h
    exact .or hm ha
  | @pref r x hx ihx =>
    intro ky j hu
    refine judge_keyless rfl ?_
    simp only [checkWith]
    have h1 := ihx none j hu.pref
    have h2 := checkSuperWith_judge hx j hu.pref
    refine judge_of_bool (fun h => ?_) (fun h => ?_)
    · rcases Bool.or_eq_true_iff.mp h with h | h
      · exact .pref (h1.of_eq h)
      · exact .prefSuper (h2.of_eq h)
    · obtain ⟨ha, hb⟩ := Bool.or_eq_false_iff.mp h
      exact .prefNone (h1.of_eq ha) (h2.of_eq hb)
  | @ride t v r _ ihv =>
    intro ky j hu
    have e : (Val.ride t v r).atKeyO ky = .ride t (v.atKeyO ky) r := by cases ky <;> rfl
    rw [e]
    simp only [checkWith]
    exact .ride (ihv ky j hu.ride)
  | @meet a b _ _ iha ihb =>
    intro ky j hu
    have e : (Val.meet a b).atKeyO ky = .meet (a.atKeyO ky) (b.atKeyO ky) := by cases ky <;> rfl
    rw [e]
    simp only [checkWith]
    have ha := iha ky j hu.meetLeft
    have hb := ihb ky j hu.meetRight
    refine judge_of_bool (fun h => ?_) (fun h => ?_)
    · simp only [Bool.and_eq_true] at h
      exact .meet (ha.of_eq h.1) (hb.of_eq h.2)
    · rcases Bool.and_eq_false_iff.mp h with h1 | h2
      · exact .meetLeft (ha.of_eq h1)
      · exact .meetRight (hb.of_eq h2)
  | key =>
    intro ky j _
    cases ky with
    | none => exact .key
    | some k' =>
      show Judge env root (checkWith u (some k') .key j) (.lit (.str k')) j
      cases j with
      | str s =>
        simp only [checkWith]
        refine judge_of_bool (fun h => ?_) (fun h => .litNot fun e => ?_)
        · cases of_decide_eq_true h; exact .str
        · exact of_decide_eq_false h (by cases e; rfl)
      | _ => exact .litNot fun h => nomatch h
  | @selectKey arms d _ _ _ ihp ihr ihd =>
    intro ky j hu
    cases ky with
    | none => exact .selectKey
    | some k' =>
      show Judge env root (checkWith u (some k') (.select .key arms d) j) (.select (.lit (.str k')) arms d) j
      simp only [checkWith]
      exact judge_selectWith (s := .str k')
        (fun p r hm => ihp p r hm none _ (hu.selectPattern hm (Data.weight_pos j)))
        (fun p r hm => ihr p r hm none j (hu.selectResult hm))
        (fun e hd => ihd e hd none j (hu.selectElse hd))
  | @selectLit s arms d _ _ _ ihp ihr ihd =>
    intro ky j hu
    refine judge_keyless rfl ?_
    simp only [checkWith]
    exact judge_selectWith
      (fun p r hm => ihp p r hm none _ (hu.selectPattern hm (by cases s <;> exact Data.weight_pos j)))
      (fun p r hm => ihr p r hm none j (hu.selectResult hm))
      (fun e hd => ihd e hd none j (hu.selectElse hd))

/-- The checker judges every value it can check as the definition does,
given a hook that is right where it is asked: its `true` is admission
and its `false` refusal. -/
theorem checkWith_judge {v : Val} (h : v.CheckableA) :
    ∀ j, HookOk u env root v j → Judge env root (checkWith u none v j) v j :=
  fun j hu => checkWithKey_judge h none j hu

/-- The checker decides admission, and refusal, for every value it can
check, given a hook that is right where it is asked. -/
theorem checkWith_iff {v : Val} (h : v.CheckableA) (j : Data) (hu : HookOk u env root v j) {b : Bool} :
    checkWith u none v j = b ↔ Judge env root b v j :=
  (checkWith_judge h j hu).toIff

end

/-- The checker with no hook: a name is never admitted, which decides the
values that read no name. -/
abbrev check : Val → Data → Bool := checkWith (fun _ _ => false) none

abbrev checkSpread : Option Val → Data → Bool := checkSpreadWith fun _ _ => false

abbrev checkSuper : Val → Data → Bool := checkSuperWith fun _ _ => false

section
variable {env : Env} {root : Data}

/-- `check` judges every checkable value as the definition does. -/
theorem check_judge {v : Val} (h : v.Checkable) (j : Data) : Judge env root (check v j) v j :=
  checkWith_judge h.toA j fun k _ hk =>
    absurd (hk.elim (fun h' => h'.2) fun h' => unguardedRefs_sub_refs _ _ h'.2) (h.no_refs k)

/-- `check` decides admission, and refusal, for every checkable value. -/
theorem check_iff {v : Val} (h : v.Checkable) (j : Data) {b : Bool} :
    check v j = b ↔ Judge env root b v j :=
  (check_judge h j).toIff

theorem checkSuper_judge {v : Val} (h : v.Checkable) (j : Data) :
    Judge env root (checkSuper v j) v.super j :=
  checkSuperWith_judge h.toA j fun k _ hk =>
    absurd (hk.elim (fun h' => h'.2) fun h' => unguardedRefs_sub_refs _ _ h'.2) (h.no_refs k)

theorem checkSuper_iff {v : Val} (h : v.Checkable) (j : Data) {b : Bool} :
    checkSuper v j = b ↔ Judge env root b v.super j :=
  (checkSuper_judge h j).toIff

theorem checkSpread_iff {spread : Option Val}
    (ih : ∀ s, spread = some s → ∀ j, check s j = true ↔ Admits env root s j) (x : Data) :
    checkSpread spread x = true ↔ ∀ s, spread = some s → Admits env root s x :=
  checkSpreadWith_iff fun s hs => ih s hs x

end

end Aontu
