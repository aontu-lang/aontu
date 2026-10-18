import Aontu.Admits

/-!
# The checker

`Admits` computes nothing: it is a relation, and Lean will not run it
(`decide (Admits Env.empty .null .integer (.integer 3))` finds no
`Decidable` instance). `check` is an algorithm, and `check_iff` is what
lets its answers stand in for the definition's, on every value that
reads neither an alias nor a path. Without that theorem it would be a
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

/-- The values that read neither an alias nor a path, so that what they
admit depends on no declaration and no root. -/
inductive Val.RefFree : Val → Prop
  | integer : RefFree .integer
  | float : RefFree .float
  | biginteger : RefFree .biginteger
  | bigdecimal : RefFree .bigdecimal
  | number : RefFree .number
  | string : RefFree .string
  | anyString : RefFree .anyString
  | boolean : RefFree .boolean
  | lit {s : Scalar} : RefFree (.lit s)
  | min {n : Number} : RefFree (.min n)
  | max {n : Number} : RefFree (.max n)
  | multiple {d : Number} : RefFree (.multiple d)
  | any : RefFree .any
  | nil : RefFree .nil
  | map {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool} :
      (∀ k o v, (k, o, v) ∈ fs → RefFree v) → (∀ s, spread = some s → RefFree s) →
      RefFree (.map fs spread closed)
  | list {items : List Val} {spread : Option Val} :
      (∀ v, v ∈ items → RefFree v) → (∀ s, spread = some s → RefFree s) →
      RefFree (.list items spread)
  | meet {a b : Val} : RefFree a → RefFree b → RefFree (.meet a b)

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
  | .min n, j => match j with
    | .num x => decide (n.le x)
    | _ => false
  | .max n, j => match j with
    | .num x => decide (x.le n)
    | _ => false
  | .multiple d, j => match j with
    | .num x => decide d.Positive && decide (x.multipleOf d)
    | _ => false
  | .any, _ => true
  | .nil, _ => false
  | .map fs spread closed, j => match j with
    | .map jfs =>
      checkFields fs jfs && jfs.all (fun m => checkSpread spread m.2) &&
        (!closed || jfs.all fun m => fs.any fun f => decide (f.1 = m.1))
    | _ => false
  | .list items spread, j => match j with
    | .list xs =>
      decide (items.length ≤ xs.length) && checkItems items xs &&
        xs.all (fun x => checkSpread spread x)
    | _ => false
  | .meet a b, j => check a j && check b j
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

/-- `check` decides admission for every value that reads no reference. -/
theorem check_iff {v : Val} (h : v.RefFree) : ∀ j, check v j = true ↔ Admits env root v j := by
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
  | @min n =>
    intro j
    cases j with
    | num x =>
      simp only [check, decide_eq_true_eq]
      exact ⟨fun h => .min h, fun h => by cases h; assumption⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @max n =>
    intro j
    cases j with
    | num x =>
      simp only [check, decide_eq_true_eq]
      exact ⟨fun h => .max h, fun h => by cases h; assumption⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | @multiple d =>
    intro j
    cases j with
    | num x =>
      simp only [check, decide_eq_true_eq, Bool.and_eq_true]
      exact ⟨fun ⟨hd, hm⟩ => .multiple hd hm, fun h => by cases h; exact ⟨‹_›, ‹_›⟩⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
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
  | @list items spread _ _ ihitems ihsp =>
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
      rw [checkItems_iff ihitems xs, hs]
      constructor
      · rintro ⟨⟨h1, h2⟩, h3⟩
        exact .list h1 h2 h3
      · intro h
        cases h with
        | list h1 h2 h3 => exact ⟨⟨h1, h2⟩, h3⟩
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | meet _ _ iha ihb =>
    intro j
    simp only [check, Bool.and_eq_true, iha, ihb]
    exact ⟨fun ⟨h1, h2⟩ => .meet h1 h2, fun h => by cases h with | meet h1 h2 => exact ⟨h1, h2⟩⟩

end

end Aontu
