import Aontu.Check
import Aontu.Order

/-!
# The meet, computed

`a & b` is the meet of the order: it admits what both admit. `meet`
computes a term that admits exactly that, by the rules the engines
apply: `nil` is the zero and `any` the unit, a meet with a disjunction
distributes over its arms, a preference alone is `x | super(x)`, two
maps merge key by key, two lists position by position, a literal meets
what admits it, and two atoms that admit no common value meet in `nil`.
`admits_meet` admits the function into the definition: the term it
computes admits a value exactly when both sides do. The shape of that
term is what generation reads: a dead arm drops out of a disjunction,
and a preference narrows to what survives.
-/

namespace Aontu

section
variable {env : Env} {root : Data}

/-! ## The ends -/

theorem admits_nil_iff {j : Data} : Admits env root .nil j ↔ False :=
  ⟨(fun h => nomatch h), False.elim⟩

theorem admits_any_iff {j : Data} : Admits env root .any j ↔ True :=
  ⟨fun _ => trivial, fun _ => .any⟩

theorem admits_meet_iff {a b : Val} {j : Data} :
    Admits env root (.meet a b) j ↔ Admits env root a j ∧ Admits env root b j :=
  ⟨fun h => by cases h with | meet h₁ h₂ => exact ⟨h₁, h₂⟩, fun ⟨h₁, h₂⟩ => .meet h₁ h₂⟩

theorem admits_or_iff {arms : List (ℕ × Val)} {j : Data} :
    Admits env root (.or arms) j ↔ ∃ r a, (r, a) ∈ arms ∧ Admits env root a j :=
  ⟨fun h => by cases h with | or hm ha => exact ⟨_, _, hm, ha⟩, fun ⟨_, _, hm, ha⟩ => .or hm ha⟩

theorem admits_pref_iff {r : ℕ} {x : Val} {j : Data} :
    Admits env root (.pref r x) j ↔ Admits env root x j ∨ Admits env root x.super j :=
  ⟨fun h => by cases h with | pref h => exact .inl h | prefSuper h => exact .inr h,
   fun h => h.elim .pref .prefSuper⟩

theorem admits_lit_iff {s : Scalar} {j : Data} : Admits env root (.lit s) j ↔ j = s.data := by
  constructor
  · intro h; cases s <;> cases h <;> rfl
  · rintro rfl; cases s <;> constructor

/-! ## Kinds -/

/-- The kinds, as terms are told apart by them. -/
inductive Kind where
  | integer | float | biginteger | bigdecimal | number | string | anyString | boolean
  deriving DecidableEq

/-- The kind a term is, if it is one. -/
def Val.kind? : Val → Option Kind
  | .integer => some .integer
  | .float => some .float
  | .biginteger => some .biginteger
  | .bigdecimal => some .bigdecimal
  | .number => some .number
  | .string => some .string
  | .anyString => some .anyString
  | .boolean => some .boolean
  | _ => none

/-- The term a kind is. -/
def Kind.val : Kind → Val
  | .integer => .integer
  | .float => .float
  | .biginteger => .biginteger
  | .bigdecimal => .bigdecimal
  | .number => .number
  | .string => .string
  | .anyString => .anyString
  | .boolean => .boolean

/-- The meet of two kinds: a kind with itself, a leaf under `number`,
`string` under `string & empty()`, and `nil` for two that share no
value. -/
def Kind.meet : Kind → Kind → Val
  | .number, k | k, .number =>
    match k with
    | .string | .anyString | .boolean => .nil
    | k => k.val
  | .string, .anyString | .anyString, .string => .string
  | a, b => if a = b then a.val else .nil

theorem kind?_eq {v : Val} {k : Kind} (h : v.kind? = some k) : v = k.val := by
  cases v <;> simp [Val.kind?] at h <;> subst h <;> rfl

theorem admits_kind_meet (ka kb : Kind) (j : Data) :
    Admits env root (ka.meet kb) j ↔ Admits env root ka.val j ∧ Admits env root kb.val j := by
  cases ka <;> cases kb <;> simp [Kind.meet, Kind.val] <;> first
    | (intro h; cases h <;> constructor; done)
    | (constructor
       · intro h; exact nomatch h
       · rintro ⟨h₁, h₂⟩; cases h₁ <;> cases h₂
       done)
    | (constructor
       · intro h; refine ⟨h, ?_⟩; cases h <;> constructor
       · exact fun h => h.1
       done)
    | (constructor
       · intro h; refine ⟨?_, h⟩; cases h <;> constructor
       · exact fun h => h.2
       done)

/-! ## Domains -/

/-- The kinds of data, as a term's domain tells them apart. -/
inductive Dom where
  | num | str | bool | null | map | list
  deriving DecidableEq

def Bound.dom : Bound → Dom
  | .num _ => .num
  | .str _ => .str

/-- The domains a term can admit a value in, read off its head: every
domain where the head says nothing. Two terms whose domains share
nothing admit no common value. -/
def Val.doms : Val → List Dom
  | .integer | .float | .biginteger | .bigdecimal | .number => [.num]
  | .string | .anyString => [.str]
  | .boolean => [.bool]
  | .mapKind => [.map]
  | .listKind => [.list]
  | .lit (.num _) => [.num]
  | .lit (.str _) => [.str]
  | .lit (.bool _) => [.bool]
  | .lit .null => [.null]
  | .min b | .max b | .above b | .beneath b => [b.dom]
  | .neq (v :: _) => [v.dom]
  | .mulof _ => [.num]
  | .len _ => [.str, .list, .map]
  | .unique _ | .contains _ _ => [.list, .map]
  | .re _ | .format _ => [.str]
  | .map _ _ _ => [.map]
  | .list _ _ _ => [.list]
  | .nil => []
  | .neq [] | .any | .or _ | .pref _ _ | .meet _ _ | .alias _ | .path _ | .nof _ _ | .must _ _
  | .when _ _ _ | .rest _ _ | .select _ _ _ | .filter _ _ | .ride _ _ _ | .key | .keyUp _ | .call _ _
  | .hole =>
    [.num, .str, .bool, .null, .map, .list]

/-- The domain a value is in. -/
def Data.dom : Data → Dom
  | .num _ => .num
  | .str _ => .str
  | .bool _ => .bool
  | .null => .null
  | .map _ => .map
  | .list _ => .list

/-- Whether two terms share a domain. -/
def domsMeet (a b : Val) : Bool := a.doms.any fun d => b.doms.contains d

theorem dom_mem_doms {v : Val} {j : Data} (h : Admits env root v j) : j.dom ∈ v.doms := by
  cases h
  case neq vs x hv =>
    cases vs with
    | nil => simp [Val.doms, Data.dom]
    | cons b vs =>
      obtain ⟨n, rfl, -⟩ := hv b (List.mem_cons_self)
      simp [Val.doms, Bound.dom, Data.dom]
  case neqStr vs s hv =>
    cases vs with
    | nil => simp [Val.doms, Data.dom]
    | cons b vs =>
      obtain ⟨t, rfl, -⟩ := hv b (List.mem_cons_self)
      simp [Val.doms, Bound.dom, Data.dom]
  case len => cases j <;> simp_all [Data.size, Val.doms, Data.dom]
  case unique => cases j <;> simp_all [Data.members, Val.doms, Data.dom]
  case contains => cases j <;> simp_all [Data.members, Val.doms, Data.dom]
  all_goals ((try cases j) <;> simp [Val.doms, Data.dom, Bound.dom])

theorem domsMeet_of_admits {a b : Val} {j : Data} (ha : Admits env root a j)
    (hb : Admits env root b j) : domsMeet a b = true := by
  simp only [domsMeet, List.any_eq_true, List.contains_iff_mem]
  exact ⟨j.dom, dom_mem_doms ha, dom_mem_doms hb⟩

/-! ## Empty intervals -/

theorem Number.den_pos : ∀ x : Number, 0 < x.value.2
  | .integer _ | .biginteger _ => Nat.one_pos
  | .float x => by
    simp only [Number.value]
    split
    · exact Nat.one_pos
    · exact Nat.two_pow_pos _
  | .bigdecimal x => by
    simp only [Number.value]
    split
    · exact Nat.pow_pos (by decide)
    · exact Nat.one_pos

theorem Number.le_trans {a b c : Number} (h₁ : a.le b) (h₂ : b.le c) : a.le c := by
  unfold Number.le at *
  have hb : (0 : ℤ) < b.value.2 := Int.natCast_pos.mpr b.den_pos
  have ha : (0 : ℤ) ≤ a.value.2 := Int.ofNat_zero_le _
  have hc : (0 : ℤ) ≤ c.value.2 := Int.ofNat_zero_le _
  apply Int.le_of_mul_le_mul_right _ hb
  calc a.value.1 * (c.value.2 : ℤ) * b.value.2 = a.value.1 * b.value.2 * c.value.2 := by ac_rfl
    _ ≤ b.value.1 * a.value.2 * c.value.2 := Int.mul_le_mul_of_nonneg_right h₁ hc
    _ = b.value.1 * c.value.2 * a.value.2 := by ac_rfl
    _ ≤ c.value.1 * b.value.2 * a.value.2 := Int.mul_le_mul_of_nonneg_right h₂ ha
    _ = c.value.1 * a.value.2 * b.value.2 := by ac_rfl

theorem Number.lt_of_lt_of_le {a b c : Number} (h₁ : a.lt b) (h₂ : b.le c) : a.lt c := by
  unfold Number.lt Number.le at *
  have hb : (0 : ℤ) < b.value.2 := Int.natCast_pos.mpr b.den_pos
  have ha : (0 : ℤ) ≤ a.value.2 := Int.ofNat_zero_le _
  have hc : (0 : ℤ) < c.value.2 := Int.natCast_pos.mpr c.den_pos
  apply Int.lt_of_mul_lt_mul_right _ (Int.le_of_lt hb)
  calc a.value.1 * (c.value.2 : ℤ) * b.value.2 = a.value.1 * b.value.2 * c.value.2 := by ac_rfl
    _ < b.value.1 * a.value.2 * c.value.2 := Int.mul_lt_mul_of_pos_right h₁ hc
    _ = b.value.1 * c.value.2 * a.value.2 := by ac_rfl
    _ ≤ c.value.1 * b.value.2 * a.value.2 := Int.mul_le_mul_of_nonneg_right h₂ ha
    _ = c.value.1 * a.value.2 * b.value.2 := by ac_rfl

theorem Number.lt_of_le_of_lt {a b c : Number} (h₁ : a.le b) (h₂ : b.lt c) : a.lt c := by
  unfold Number.lt Number.le at *
  have hb : (0 : ℤ) < b.value.2 := Int.natCast_pos.mpr b.den_pos
  have ha : (0 : ℤ) < a.value.2 := Int.natCast_pos.mpr a.den_pos
  have hc : (0 : ℤ) ≤ c.value.2 := Int.ofNat_zero_le _
  apply Int.lt_of_mul_lt_mul_right _ (Int.le_of_lt hb)
  calc a.value.1 * (c.value.2 : ℤ) * b.value.2 = a.value.1 * b.value.2 * c.value.2 := by ac_rfl
    _ ≤ b.value.1 * a.value.2 * c.value.2 := Int.mul_le_mul_of_nonneg_right h₁ hc
    _ = b.value.1 * c.value.2 * a.value.2 := by ac_rfl
    _ < c.value.1 * b.value.2 * a.value.2 := Int.mul_lt_mul_of_pos_right h₂ ha
    _ = c.value.1 * a.value.2 * b.value.2 := by ac_rfl

theorem Number.lt_irrefl (a : Number) : ¬ a.lt a := Int.lt_irrefl _

theorem Number.le_of_lt {a b : Number} (h : a.lt b) : a.le b := Int.le_of_lt h

/-- No number lies from a lower bound to an upper bound below it. -/
theorem Number.none_between {lo hi x : Number} (hlo : lo.le x) (hhi : x.le hi) (h : hi.lt lo) :
    False :=
  Number.lt_irrefl hi (Number.lt_of_lt_of_le h (Number.le_trans hlo hhi))

/-- Nor from a strict lower bound to an upper bound at or below it. -/
theorem Number.none_between_above {lo hi x : Number} (hlo : lo.lt x) (hhi : x.le hi)
    (h : hi.le lo) : False :=
  Number.lt_irrefl lo (Number.lt_of_lt_of_le (Number.lt_of_lt_of_le hlo hhi) h)

theorem Number.none_between_beneath {lo hi x : Number} (hlo : lo.le x) (hhi : x.lt hi)
    (h : hi.le lo) : False :=
  Number.lt_irrefl lo (Number.lt_of_lt_of_le (Number.lt_of_le_of_lt hlo hhi) h)

/-- The order on strings, character by character, is transitive and
total, so the same holds of strings. -/
theorem lt_trans_chars {l₁ l₂ l₃ : List Char} (h₁ : l₁ < l₂) (h₂ : l₂ < l₃) : l₁ < l₃ :=
  List.lt_trans h₁ h₂

theorem lt_total_chars : ∀ (l₁ l₂ : List Char), l₁ < l₂ ∨ l₁ = l₂ ∨ l₂ < l₁
  | [], [] => .inr (.inl rfl)
  | [], _ :: _ => .inl List.Lex.nil
  | _ :: _, [] => .inr (.inr List.Lex.nil)
  | a :: as, b :: bs =>
    if hab : a < b then .inl (List.Lex.rel hab)
    else if hba : b < a then .inr (.inr (List.Lex.rel hba))
    else
      have heq : a = b := Char.ext (UInt32.le_antisymm (Char.not_lt.mp hba) (Char.not_lt.mp hab))
      match lt_total_chars as bs with
      | .inl h => .inl (by subst heq; exact List.Lex.cons h)
      | .inr (.inl h) => .inr (.inl (by rw [heq, h]))
      | .inr (.inr h) => .inr (.inr (by subst heq; exact List.Lex.cons h))

theorem String.none_between {lo hi s : String} (hlo : lo ≤ s) (hhi : s ≤ hi) (h : hi < lo) :
    False :=
  match lt_total_chars s.data hi.data with
  | .inl hsh => hlo (lt_trans_chars hsh h)
  | .inr (.inl heq) => hlo (show s.data < lo.data from heq ▸ h)
  | .inr (.inr hhs) => hhi hhs

theorem String.none_between_above {lo hi s : String} (hlo : lo < s) (hhi : s ≤ hi)
    (h : hi ≤ lo) : False :=
  match lt_total_chars lo.data hi.data with
  | .inl hlh => h hlh
  | .inr (.inl heq) => hhi (show hi.data < s.data from heq ▸ hlo)
  | .inr (.inr hhl) => hhi (lt_trans_chars hhl hlo)

theorem String.none_between_beneath {lo hi s : String} (hlo : lo ≤ s) (hhi : s < hi)
    (h : hi ≤ lo) : False :=
  match lt_total_chars lo.data hi.data with
  | .inl hlh => h hlh
  | .inr (.inl heq) => hlo (show s.data < lo.data from heq ▸ hhi)
  | .inr (.inr hhl) => hlo (lt_trans_chars hhi hhl)

theorem String.le_of_lt {a b : String} (h : a < b) : a ≤ b :=
  fun h' => lt_asymm_chars h h'

/-- The lower bound a term sets, and whether it is strict. -/
def Val.lower : Val → Option (Bound × Bool)
  | .min b => some (b, false)
  | .above b => some (b, true)
  | _ => none

/-- The upper bound a term sets, and whether it is strict. -/
def Val.upper : Val → Option (Bound × Bool)
  | .max b => some (b, false)
  | .beneath b => some (b, true)
  | _ => none

/-- Whether no value lies from a lower bound to an upper: the upper end
below the lower, or at it with either end strict. -/
def emptyBetween : Bound → Bool → Bound → Bool → Bool
  | .num lo, slo, .num hi, shi => decide (hi.lt lo) || ((slo || shi) && decide (hi.le lo))
  | .str lo, slo, .str hi, shi => decide (hi < lo) || ((slo || shi) && decide (hi ≤ lo))
  | _, _, _, _ => false

/-- Whether two terms bound an empty interval, either way round. -/
def emptyBounds (a b : Val) : Bool :=
  emptyPair a b || emptyPair b a
where
  emptyPair (a b : Val) : Bool :=
    match a.lower, b.upper with
    | some (lo, slo), some (hi, shi) => emptyBetween lo slo hi shi
    | _, _ => false

theorem lower_eq {a : Val} {lo : Bound} {s : Bool} (h : a.lower = some (lo, s)) :
    (s = false ∧ a = .min lo) ∨ (s = true ∧ a = .above lo) := by
  cases a <;> simp [Val.lower] at h <;> obtain ⟨rfl, rfl⟩ := h <;> simp

theorem upper_eq {a : Val} {hi : Bound} {s : Bool} (h : a.upper = some (hi, s)) :
    (s = false ∧ a = .max hi) ∨ (s = true ∧ a = .beneath hi) := by
  cases a <;> simp [Val.upper] at h <;> obtain ⟨rfl, rfl⟩ := h <;> simp

theorem emptyPair_sound {a b : Val} {j : Data} (ha : Admits env root a j)
    (hb : Admits env root b j) : emptyBounds.emptyPair a b = false := by
  unfold emptyBounds.emptyPair
  cases hl : a.lower with
  | none => rfl
  | some p =>
    obtain ⟨lo, slo⟩ := p
    cases hu : b.upper with
    | none => rfl
    | some q =>
      obtain ⟨hi, shi⟩ := q
      show emptyBetween lo slo hi shi = false
      rcases lower_eq hl with ⟨rfl, rfl⟩ | ⟨rfl, rfl⟩ <;>
        rcases upper_eq hu with ⟨rfl, rfl⟩ | ⟨rfl, rfl⟩
      · cases ha with
        | min h₁ => cases hb with
          | max h₂ => simp [emptyBetween]; exact fun h => Number.none_between h₁ h₂ h
        | minStr h₁ => cases hb with
          | maxStr h₂ => simp [emptyBetween, -String.not_le]; exact fun h => String.none_between h₁ h₂ h
      · cases ha with
        | min h₁ => cases hb with
          | beneath h₂ =>
            simp [emptyBetween]
            exact ⟨fun h => Number.none_between h₁ (Number.le_of_lt h₂) h,
              fun h => Number.none_between_beneath h₁ h₂ h⟩
        | minStr h₁ => cases hb with
          | beneathStr h₂ =>
            simp [emptyBetween, -String.not_le]
            exact ⟨fun h => String.none_between h₁ (String.le_of_lt h₂) h,
              fun h => String.none_between_beneath h₁ h₂ h⟩
      · cases ha with
        | above h₁ => cases hb with
          | max h₂ =>
            simp [emptyBetween]
            exact ⟨fun h => Number.none_between (Number.le_of_lt h₁) h₂ h,
              fun h => Number.none_between_above h₁ h₂ h⟩
        | aboveStr h₁ => cases hb with
          | maxStr h₂ =>
            simp [emptyBetween, -String.not_le]
            exact ⟨fun h => String.none_between (String.le_of_lt h₁) h₂ h,
              fun h => String.none_between_above h₁ h₂ h⟩
      · cases ha with
        | above h₁ => cases hb with
          | beneath h₂ =>
            simp [emptyBetween]
            exact ⟨fun h => Number.none_between (Number.le_of_lt h₁) (Number.le_of_lt h₂) h,
              fun h => Number.none_between_above h₁ (Number.le_of_lt h₂) h⟩
        | aboveStr h₁ => cases hb with
          | beneathStr h₂ =>
            simp [emptyBetween, -String.not_le]
            exact ⟨fun h => String.none_between (String.le_of_lt h₁) (String.le_of_lt h₂) h,
              fun h => String.none_between_above h₁ (String.le_of_lt h₂) h⟩

theorem emptyBounds_sound {a b : Val} {j : Data} (ha : Admits env root a j)
    (hb : Admits env root b j) : emptyBounds a b = false := by
  simp only [emptyBounds, emptyPair_sound ha hb, emptyPair_sound hb ha, Bool.or_self]

/-! ## Atoms and literals -/

/-- The name a term refers to, where it is a reference. -/
def Val.alias? : Val → Option String
  | .alias n => some n
  | _ => none

theorem Val.alias?_some {v : Val} {n : String} : v.alias? = some n ↔ v = .alias n := by
  cases v <;> simp [Val.alias?]

/-- The meet of two atoms that are not two kinds: two references to one
name are that name; otherwise `nil` where they share no domain or bound
an empty interval, and the pair itself, irreducible, where they may
share a value. -/
def aliasMeet (a b : Val) : Val :=
  match a.alias?, b.alias? with
  | some n, some m => if n = m then a else .meet a b
  | _, _ => if domsMeet a b && !emptyBounds a b then .meet a b else .nil

/-- The meet of two atoms: two kinds by `Kind.meet`, and the rest by
`aliasMeet`. -/
def atomMeet (a b : Val) : Val :=
  match a.kind?, b.kind? with
  | some ka, some kb => ka.meet kb
  | _, _ => aliasMeet a b

theorem admits_residual (a b : Val) (j : Data) :
    Admits env root (if domsMeet a b && !emptyBounds a b then .meet a b else .nil) j ↔
      Admits env root a j ∧ Admits env root b j := by
  by_cases h : (domsMeet a b && !emptyBounds a b) = true
  · rw [if_pos h]; exact admits_meet_iff
  · rw [if_neg h]
    constructor
    · exact fun h => nomatch h
    · rintro ⟨ha, hb⟩
      exact (h (by simp [domsMeet_of_admits ha hb, emptyBounds_sound ha hb])).elim

theorem admits_aliasMeet (a b : Val) (j : Data) :
    Admits env root (aliasMeet a b) j ↔ Admits env root a j ∧ Admits env root b j := by
  unfold aliasMeet
  cases ha : a.alias? with
  | some n =>
    cases hb : b.alias? with
    | some m =>
      simp only
      by_cases hnm : n = m
      · rw [if_pos hnm, Val.alias?_some.mp ha, Val.alias?_some.mp hb, hnm]
        exact ⟨fun h => ⟨h, h⟩, fun h => h.1⟩
      · rw [if_neg hnm]
        exact admits_meet_iff
    | none =>
      simp only
      exact admits_residual a b j
  | none =>
    simp only
    exact admits_residual a b j

theorem admits_atomMeet (a b : Val) (j : Data) :
    Admits env root (atomMeet a b) j ↔ Admits env root a j ∧ Admits env root b j := by
  unfold atomMeet
  cases hka : a.kind? with
  | some ka =>
    cases hkb : b.kind? with
    | some kb =>
      rw [kind?_eq hka, kind?_eq hkb]
      exact admits_kind_meet ka kb j
    | none => exact admits_aliasMeet a b j
  | none => exact admits_aliasMeet a b j

/-- A literal met with a term: the literal where the term admits its
value, `nil` where it refuses it, and the pair where that cannot be
computed, or where the term is a call the reading has not made. -/
def litMeet (s : Scalar) (b : Val) : Val :=
  if b.checkableB && !b.callAt then (if check b s.data then .lit s else .nil) else .meet (.lit s) b

theorem admits_litMeet (s : Scalar) (b : Val) (j : Data) :
    Admits env root (litMeet s b) j ↔ Admits env root (.lit s) j ∧ Admits env root b j := by
  unfold litMeet
  by_cases hc : (b.checkableB && !b.callAt) = true
  · rw [if_pos hc]
    have hb := (Val.checkableB_iff b).mp (Bool.and_eq_true _ _ |>.mp hc).1
    by_cases hk : check b s.data = true
    · rw [if_pos hk]
      constructor
      · intro h
        obtain rfl := admits_lit_iff.mp h
        exact ⟨h, (check_iff hb _).mp hk⟩
      · exact fun h => h.1
    · rw [if_neg hk]
      constructor
      · exact fun h => nomatch h
      · rintro ⟨h₁, h₂⟩
        obtain rfl := admits_lit_iff.mp h₁
        exact (hk ((check_iff hb _).mpr h₂)).elim
  · rw [if_neg hc]
    exact admits_meet_iff

/-- The result a selection on a literal picks, the checker reading its
patterns: the result of the first arm whose pattern admits the literal,
else the default, else `nil`. -/
def pickArm (s : Scalar) (arms : List (Val × Val)) (d : Option Val) : Val :=
  ((arms.find? fun q => check q.1 s.data).map (·.2)).getD (d.getD .nil)

theorem admits_pickArm {s : Scalar} {d : Option Val} {j : Data} :
    ∀ {arms : List (Val × Val)}, (∀ q, q ∈ arms → q.1.Checkable) →
      (Admits env root (pickArm s arms d) j ↔ Admits env root (.select (.lit s) arms d) j)
  | [], _ => by
    simp only [pickArm, List.find?_nil, Option.map_none, Option.getD_none]
    cases d with
    | none =>
      exact ⟨(fun h => nomatch h), fun h => by
        cases h with
        | selectArm hi _ _ _ => exact nomatch hi⟩
    | some e =>
      simp only [Option.getD_some]
      exact ⟨fun h => .selectElse (fun q hq => nomatch hq) h, fun h => by
        cases h with
        | selectArm hi _ _ _ => exact nomatch hi
        | selectElse _ he => exact he⟩
  | (p, r) :: arms, hc => by
    have hp := check_judge (env := env) (root := root) (hc (p, r) List.mem_cons_self) s.data
    cases hcp : check p s.data with
    | true =>
      have hpa : Admits env root p s.data := hp.of_eq hcp
      simp only [pickArm, List.find?_cons, hcp, Option.map_some, Option.getD_some]
      constructor
      · intro h
        exact .selectArm (i := 0) rfl (fun _ _ hlt _ => absurd hlt (Nat.not_lt_zero _)) hpa h
      · intro h
        cases h with
        | @selectArm _ _ _ _ i p' r' _ hi hpre hp' hr' =>
          cases i with
          | zero =>
            simp only [List.getElem?_cons_zero, Option.some.injEq, Prod.mk.injEq] at hi
            obtain ⟨rfl, rfl⟩ := hi
            exact hr'
          | succ i => exact nomatch judge_unique hpa (hpre 0 (p, r) (Nat.succ_pos _) rfl)
        | selectElse hall _ => exact nomatch judge_unique hpa (hall (p, r) List.mem_cons_self)
    | false =>
      have hpr : Refuses env root p s.data := hp.of_eq hcp
      have ih := admits_pickArm (s := s) (d := d) (j := j) (arms := arms)
        (fun q hq => hc q (List.mem_cons_of_mem _ hq))
      simp only [pickArm, List.find?_cons, hcp] at ih ⊢
      rw [ih]
      exact ⟨judge_select_cons hpr, judge_select_uncons hpr⟩

/-- A term with its selections on a literal made, through the meets and
the riders, wherever the checker reads every pattern: what a spread
gives a member once its key is read. -/
def Val.selectNow : Val → Val
  | .select (.lit s) arms d =>
    if arms.all (fun q => q.1.checkableB) then pickArm s arms d else .select (.lit s) arms d
  | .meet a b => .meet a.selectNow b.selectNow
  | .ride t v r => .ride t v.selectNow r
  | v => v

theorem admits_selectNow (v : Val) (j : Data) :
    Admits env root v.selectNow j ↔ Admits env root v j := by
  induction v using Val.selectNow.induct generalizing j with
  | case1 s arms d hc =>
    rw [Val.selectNow, if_pos hc]
    exact admits_pickArm fun q hq => (Val.checkableB_iff _).mp (List.all_eq_true.mp hc q hq)
  | case2 s arms d hc => rw [Val.selectNow, if_neg hc]
  | case3 a b iha ihb =>
    simp only [Val.selectNow]
    exact ⟨fun h => by cases h with | meet ha hb => exact .meet ((iha j).mp ha) ((ihb j).mp hb),
      fun h => by cases h with | meet ha hb => exact .meet ((iha j).mpr ha) ((ihb j).mpr hb)⟩
  | case4 t v r ih =>
    simp only [Val.selectNow]
    exact judge_ride_iff.trans ((ih j).trans judge_ride_iff.symm)
  | case5 v h1 h2 h3 => rw [Val.selectNow.eq_4 v h1 h2 h3]

theorem Val.CheckableA.selectNow {v : Val} (h : v.CheckableA) : v.selectNow.CheckableA := by
  induction v using Val.selectNow.induct with
  | case1 s arms d hc =>
    rw [Val.selectNow, if_pos hc]
    cases h with
    | selectLit _ hr hd =>
      simp only [pickArm]
      cases hf : arms.find? (fun q => check q.1 s.data) with
      | some q => exact hr q.1 q.2 (List.mem_of_find?_eq_some hf)
      | none =>
        cases d with
        | none => exact .nil
        | some e => exact hd e rfl
  | case2 s arms d hc => rw [Val.selectNow, if_neg hc]; exact h
  | case3 a b iha ihb =>
    simp only [Val.selectNow]
    cases h with | meet ha hb => exact .meet (iha ha) (ihb hb)
  | case4 t v r ih =>
    simp only [Val.selectNow]
    cases h with | ride hv => exact .ride (ih hv)
  | case5 v h1 h2 h3 => rw [Val.selectNow.eq_4 v h1 h2 h3]; exact h

/-- A literal's scalar, if the term is one. -/
def Val.lit? : Val → Option Scalar
  | .lit s => some s
  | _ => none

theorem lit?_eq {v : Val} {s : Scalar} (h : v.lit? = some s) : v = .lit s := by
  cases v <;> simp [Val.lit?] at h <;> rw [h]

def Val.isAny : Val → Bool
  | .any => true
  | _ => false

theorem isAny_eq {v : Val} (h : v.isAny = true) : v = .any := by
  cases v <;> simp [Val.isAny] at h <;> rfl

/-- The meet of two terms neither of which is `nil`, a meet, a
disjunction, or a preference, and that are not two containers or a
container with `any`: `any` is the unit, a literal meets what admits it
by `lm`, the literal meet given, and atoms meet by `atomMeet`. -/
def meetBase (lm : Scalar → Val → Val) (a b : Val) : Val :=
  if a.isAny then b else if b.isAny then a else
  match a.lit?, b.lit? with
  | some s, _ => lm s b
  | none, some t => lm t a
  | none, none => atomMeet a b

theorem admits_meetBase {lm : Scalar → Val → Val}
    (hl : ∀ s b j, Admits env root (lm s b) j ↔ Admits env root (.lit s) j ∧ Admits env root b j)
    (a b : Val) (j : Data) :
    Admits env root (meetBase lm a b) j ↔ Admits env root a j ∧ Admits env root b j := by
  unfold meetBase
  by_cases ha : a.isAny = true
  · rw [if_pos ha, isAny_eq ha]
    exact ⟨fun h => ⟨.any, h⟩, fun h => h.2⟩
  · rw [if_neg ha]
    by_cases hb : b.isAny = true
    · rw [if_pos hb, isAny_eq hb]
      exact ⟨fun h => ⟨h, .any⟩, fun h => h.1⟩
    · rw [if_neg hb]
      cases hla : a.lit? with
      | some s =>
        rw [lit?_eq hla]
        exact hl s b j
      | none =>
        cases hlb : b.lit? with
        | some t =>
          rw [lit?_eq hlb, and_comm]
          exact hl t a j
        | none => exact admits_atomMeet a b j

/-! ## Dead terms -/

mutual
/-- Whether a term is dead on its face: `nil`, a map with a dead
required value, a list with a dead position, a disjunction with no live
arm, or a meet with a dead side. A dead term admits nothing, and a dead
arm drops out of its disjunction. -/
def Val.dead : Val → Bool
  | .nil => true
  | .map fs _ _ => deadField fs
  | .list items _ _ => deadItem items
  | .or arms => allDead arms
  | .meet a b => a.dead || b.dead
  | .ride _ v _ => v.dead
  | _ => false

def deadField : List (String × Bool × Val) → Bool
  | [] => false
  | (_, o, v) :: fs => (!o && v.dead) || deadField fs

def deadItem : List Val → Bool
  | [] => false
  | v :: vs => v.dead || deadItem vs

def allDead : List (ℕ × Val) → Bool
  | [] => true
  | (_, a) :: arms => a.dead && allDead arms
end

mutual
theorem dead_sound : ∀ v : Val, v.dead = true → ∀ j, ¬ Admits env root v j
  | .nil, _, _, h => nomatch h
  | .map fs _ _, hd, _, h => by
    cases h with
    | map hp ha _ _ => exact deadField_sound fs hd _ hp ha
  | .list items _ _, hd, _, h => by
    cases h with
    | list hlen _ hpos _ => exact deadItem_sound items hd _ hlen hpos
  | .or arms, hd, j, h => by
    cases h with
    | or hm ha => exact allDead_sound arms hd _ _ hm j ha
  | .meet a b, hd, j, h => by
    cases h with
    | meet ha hb =>
      rcases Bool.or_eq_true_iff.mp hd with hda | hdb
      · exact dead_sound a hda j ha
      · exact dead_sound b hdb j hb
  | .ride _ v _, hd, j, h => by
    cases h with
    | ride h => exact dead_sound v hd j h
  | .integer, hd, _, _ | .float, hd, _, _ | .biginteger, hd, _, _ | .bigdecimal, hd, _, _
  | .number, hd, _, _ | .string, hd, _, _ | .anyString, hd, _, _ | .boolean, hd, _, _
  | .lit _, hd, _, _ | .min _, hd, _, _ | .max _, hd, _, _ | .above _, hd, _, _
  | .beneath _, hd, _, _ | .neq _, hd, _, _ | .mulof _, hd, _, _ | .len _, hd, _, _
  | .unique _, hd, _, _ | .re _, hd, _, _ | .format _, hd, _, _ | .any, hd, _, _
  | .pref _ _, hd, _, _ | .alias _, hd, _, _ | .path _, hd, _, _ => nomatch hd

theorem deadField_sound : ∀ fs : List (String × Bool × Val), deadField fs = true →
    ∀ jfs : List (String × Data),
      (∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x → Admits env root v x) →
      (∀ k o v, (k, o, v) ∈ fs → lookup k jfs = none → o = true) → False
  | [], h, _, _, _ => nomatch h
  | (k, o, v) :: fs, h, jfs, hp, ha => by
    rcases Bool.or_eq_true_iff.mp h with h₁ | h₂
    · obtain ⟨ho, hv⟩ := Bool.and_eq_true_iff.mp h₁
      cases o with
      | true => exact nomatch ho
      | false =>
        cases hl : lookup k jfs with
        | none => exact Bool.false_ne_true (ha k false v (List.mem_cons_self) hl)
        | some x => exact dead_sound v hv x (hp k false v x (List.mem_cons_self) hl)
    · exact deadField_sound fs h₂ jfs (fun k o v x hm => hp k o v x (List.mem_cons_of_mem _ hm))
        (fun k o v hm => ha k o v (List.mem_cons_of_mem _ hm))

theorem deadItem_sound : ∀ items : List Val, deadItem items = true →
    ∀ xs : List Data, items.length ≤ xs.length →
      (∀ (i : ℕ) (v : Val) (x : Data), items[i]? = some v → xs[i]? = some x →
        Admits env root v x) →
      False
  | [], h, _, _, _ => nomatch h
  | v :: vs, h, xs, hlen, hpos => by
    cases xs with
    | nil => exact absurd hlen (Nat.not_succ_le_zero _)
    | cons x xs =>
      rcases Bool.or_eq_true_iff.mp h with h₁ | h₂
      · exact dead_sound v h₁ x (hpos 0 v x (by simp) (by simp))
      · exact deadItem_sound vs h₂ xs (Nat.le_of_succ_le_succ hlen)
          (fun i v' x' hi hx => hpos (i + 1) v' x' (by simpa using hi) (by simpa using hx))

theorem allDead_sound : ∀ arms : List (ℕ × Val), allDead arms = true →
    ∀ r a, (r, a) ∈ arms → ∀ j, ¬ Admits env root a j
  | [], _, _, _, h => nomatch h
  | (_, a') :: arms, h, r, a, hm => by
    obtain ⟨h₁, h₂⟩ := Bool.and_eq_true_iff.mp h
    rcases List.mem_cons.mp hm with he | hm'
    · cases he; exact dead_sound _ h₁
    · exact allDead_sound arms h₂ r a hm'
end

mutual
/-- A dead term refuses every value. -/
theorem dead_refuses : ∀ v : Val, v.dead = true → ∀ j, Refuses env root v j
  | .nil, _, _ => .nil
  | .map fs sp c, hd, j => match j with
    | .map jfs => deadField_refuses fs fs (fun _ h => h) hd sp c jfs
    | .num _ => .mapNot fun _ h => nomatch h
    | .str _ => .mapNot fun _ h => nomatch h
    | .bool _ => .mapNot fun _ h => nomatch h
    | .null => .mapNot fun _ h => nomatch h
    | .list _ => .mapNot fun _ h => nomatch h
  | .list items sp c, hd, j => match j with
    | .list xs => deadItem_refuses items items 0 (fun _ _ h => by rw [Nat.zero_add]; exact h) hd sp c xs
    | .num _ => .listNot fun _ h => nomatch h
    | .str _ => .listNot fun _ h => nomatch h
    | .bool _ => .listNot fun _ h => nomatch h
    | .null => .listNot fun _ h => nomatch h
    | .map _ => .listNot fun _ h => nomatch h
  | .or arms, hd, j => .orNone fun r a hm => allDead_refuses arms hd r a hm j
  | .meet a b, hd, j => by
    rcases Bool.or_eq_true_iff.mp hd with hda | hdb
    · exact .meetLeft (dead_refuses a hda j)
    · exact .meetRight (dead_refuses b hdb j)
  | .ride _ v _, hd, j => .ride (dead_refuses v hd j)
  | .integer, hd, _ | .float, hd, _ | .biginteger, hd, _ | .bigdecimal, hd, _
  | .number, hd, _ | .string, hd, _ | .anyString, hd, _ | .boolean, hd, _
  | .lit _, hd, _ | .min _, hd, _ | .max _, hd, _ | .above _, hd, _
  | .beneath _, hd, _ | .neq _, hd, _ | .mulof _, hd, _ | .len _, hd, _
  | .unique _, hd, _ | .re _, hd, _ | .format _, hd, _ | .any, hd, _
  | .pref _ _, hd, _ | .alias _, hd, _ | .path _, hd, _ | .nof _ _, hd, _
  | .must _ _, hd, _ | .when _ _ _, hd, _ | .contains _ _, hd, _ | .rest _ _, hd, _
  | .select _ _ _, hd, _ | .filter _ _, hd, _ => nomatch hd

/-- A dead required key, among the keys `fs₀` of a map, refuses every
map: absent, it is a key the map must have; present, its value is
refused. -/
theorem deadField_refuses : ∀ (fs₀ fs : List (String × Bool × Val)), (∀ f, f ∈ fs → f ∈ fs₀) →
    deadField fs = true → ∀ (sp : Option Val) (c : Bool) (jfs : List (String × Data)),
      Refuses env root (.map fs₀ sp c) (.map jfs)
  | _, [], _, h, _, _, _ => nomatch h
  | fs₀, (k, o, v) :: fs, hsub, h, sp, c, jfs => by
    rcases Bool.or_eq_true_iff.mp h with h₁ | h₂
    · obtain ⟨ho, hv⟩ := Bool.and_eq_true_iff.mp h₁
      cases o with
      | true => exact nomatch ho
      | false =>
        cases hl : lookup k jfs with
        | none => exact .mapMissing (hsub _ (List.mem_cons_self)) hl rfl
        | some x => exact .mapField (hsub _ (List.mem_cons_self)) hl (dead_refuses v hv x)
    · exact deadField_refuses fs₀ fs (fun f hf => hsub f (List.mem_cons_of_mem _ hf)) h₂ sp c jfs

/-- A dead position, among the positions `items₀` of a list, refuses
every list: too short to reach it, or refused there. -/
theorem deadItem_refuses : ∀ (items₀ items : List Val) (off : ℕ),
    (∀ (i : ℕ) (v : Val), items[i]? = some v → items₀[off + i]? = some v) →
    deadItem items = true → ∀ (sp : Option Val) (c : Bool) (xs : List Data),
      Refuses env root (.list items₀ sp c) (.list xs)
  | _, [], _, _, h, _, _, _ => nomatch h
  | items₀, v :: vs, off, hidx, h, sp, c, xs => by
    rcases Bool.or_eq_true_iff.mp h with h₁ | h₂
    · have hv : items₀[off + 0]? = some v := hidx 0 v (by simp)
      cases hx : xs[off + 0]? with
      | some x => exact .listItem hv hx (dead_refuses v h₁ x)
      | none =>
        exact .listShort (Nat.lt_of_le_of_lt (List.getElem?_eq_none_iff.mp hx)
          (List.getElem?_eq_some_iff.mp hv).1)
    · exact deadItem_refuses items₀ vs (off + 1)
        (fun i v' hi => by
          rw [show off + 1 + i = off + (i + 1) by omega]
          exact hidx (i + 1) v' (by simpa using hi)) h₂ sp c xs

theorem allDead_refuses : ∀ arms : List (ℕ × Val), allDead arms = true →
    ∀ r a, (r, a) ∈ arms → ∀ j, Refuses env root a j
  | [], _, _, _, h, _ => absurd h (List.not_mem_nil)
  | (_, a') :: arms, h, r, a, hm, j => by
    obtain ⟨h₁, h₂⟩ := Bool.and_eq_true_iff.mp h
    rcases List.mem_cons.mp hm with he | hm'
    · cases he
      exact dead_refuses _ h₁ j
    · exact allDead_refuses arms h₂ r a hm' j
end

/-- An arm, as the arms it stands for: an arm of rank `0` that is itself
a disjunction brings its own arms, so `(*1 | 2) | 3` has the arms of
`*1 | 2 | 3`. -/
def flattenArm : ℕ × Val → List (ℕ × Val)
  | (0, .or inner) => inner
  | p => [p]

theorem admits_flattenArm {p : ℕ × Val} {j : Data} :
    (∃ r a, (r, a) ∈ flattenArm p ∧ Admits env root a j) ↔ Admits env root p.2 j := by
  have hsing : ∀ q : ℕ × Val,
      (∃ r a, (r, a) ∈ [q] ∧ Admits env root a j) ↔ Admits env root q.2 j := by
    rintro ⟨r', a'⟩
    constructor
    · rintro ⟨r, a, hm, ha⟩
      rw [List.mem_singleton, Prod.mk.injEq] at hm
      obtain ⟨rfl, rfl⟩ := hm
      exact ha
    · intro h
      exact ⟨r', a', List.mem_singleton.mpr rfl, h⟩
  obtain ⟨r, a⟩ := p
  cases r with
  | zero =>
    cases a with
    | or inner => exact admits_or_iff.symm
    | _ => exact hsing _
  | succ r => exact hsing _

theorem admits_flattenArms {arms : List (ℕ × Val)} {j : Data} :
    (∃ r a, (r, a) ∈ arms.flatMap flattenArm ∧ Admits env root a j) ↔
      ∃ r a, (r, a) ∈ arms ∧ Admits env root a j := by
  constructor
  · rintro ⟨r, a, hm, ha⟩
    obtain ⟨p, hp, hmem⟩ := List.mem_flatMap.mp hm
    exact ⟨p.1, p.2, hp, admits_flattenArm.mp ⟨r, a, hmem, ha⟩⟩
  · rintro ⟨r, a, hm, ha⟩
    obtain ⟨r', a', hmem, ha'⟩ := (admits_flattenArm (p := (r, a))).mpr ha
    exact ⟨r', a', List.mem_flatMap.mpr ⟨(r, a), hm, hmem⟩, ha'⟩

/-- A disjunction of the live arms, each arm of rank `0` that is a
disjunction opened into its own, or `nil` where no arm is live. -/
def mkOr (arms : List (ℕ × Val)) : Val :=
  let live := (arms.flatMap flattenArm).filter fun p => !p.2.dead
  if live.isEmpty then .nil else .or live

theorem admits_mkOr (arms : List (ℕ × Val)) (j : Data) :
    Admits env root (mkOr arms) j ↔ ∃ r a, (r, a) ∈ arms ∧ Admits env root a j := by
  unfold mkOr
  simp only
  by_cases h : ((arms.flatMap flattenArm).filter fun p => !p.2.dead).isEmpty = true
  · rw [if_pos h]
    rw [List.isEmpty_iff] at h
    constructor
    · exact fun h => nomatch h
    · rintro ⟨r, a, hm, ha⟩
      obtain ⟨r', a', hm', ha'⟩ := admits_flattenArms.mpr ⟨r, a, hm, ha⟩
      cases hd : a'.dead with
      | true => exact (dead_sound a' hd j ha').elim
      | false =>
        have hmem : (r', a') ∈ (arms.flatMap flattenArm).filter (fun p => !p.2.dead) :=
          List.mem_filter.mpr ⟨hm', by simp [hd]⟩
        rw [h] at hmem
        exact nomatch hmem
  · rw [if_neg h, admits_or_iff]
    constructor
    · rintro ⟨r, a, hm, ha⟩
      exact admits_flattenArms.mp ⟨r, a, (List.mem_filter.mp hm).1, ha⟩
    · rintro ⟨r, a, hm, ha⟩
      obtain ⟨r', a', hm', ha'⟩ := admits_flattenArms.mpr ⟨r, a, hm, ha⟩
      have hd : a'.dead = false := by
        cases hd : a'.dead with
        | false => rfl
        | true => exact absurd ha' (dead_sound a' hd j)
      exact ⟨r', a', List.mem_filter.mpr ⟨hm', by simp [hd]⟩, ha'⟩

/-! ## Two maps -/

/-- Whether a map term declares a key. -/
def declared (k : String) (fs : List (String × Bool × Val)) : Bool := fs.any fun f => f.1 == k

/-- Whether every declaration of a key is optional; a key not declared is. -/
def optional (k : String) : List (String × Bool × Val) → Bool
  | [] => true
  | (k', o, _) :: fs => (if k = k' then o else true) && optional k fs

/-- `v` met with every value a map term declares for `k`. -/
def meetDecls (m : Val → Val → Val) (k : String) (v : Val) : List (String × Bool × Val) → Val
  | [] => v
  | (k', _, v') :: fs => meetDecls m k (if k = k' then m v v' else v) fs

theorem declared_iff {k : String} {fs : List (String × Bool × Val)} :
    declared k fs = true ↔ ∃ o v, (k, o, v) ∈ fs := by
  simp only [declared, List.any_eq_true, beq_iff_eq]
  constructor
  · rintro ⟨⟨k', o, v⟩, hm, rfl⟩; exact ⟨o, v, hm⟩
  · rintro ⟨o, v, hm⟩; exact ⟨(k, o, v), hm, rfl⟩

theorem optional_iff {k : String} : ∀ {fs : List (String × Bool × Val)},
    optional k fs = true ↔ ∀ o v, (k, o, v) ∈ fs → o = true
  | [] => by simp [optional]
  | (k', o', v') :: fs => by
    rw [optional, Bool.and_eq_true_iff, optional_iff]
    constructor
    · rintro ⟨h₁, h₂⟩ o v hm
      rcases List.mem_cons.mp hm with he | hm'
      · cases he; simpa using h₁
      · exact h₂ o v hm'
    · intro h
      refine ⟨?_, fun o v hm => h o v (List.mem_cons_of_mem _ hm)⟩
      by_cases hk : k = k'
      · subst hk; simpa using h o' v' (List.mem_cons_self)
      · simp [hk]

theorem admits_meetDecls {m : Val → Val → Val}
    (hm : ∀ a b j, Admits env root (m a b) j ↔ Admits env root a j ∧ Admits env root b j)
    (k : String) (x : Data) :
    ∀ (v : Val) (fs : List (String × Bool × Val)),
      Admits env root (meetDecls m k v fs) x ↔
        Admits env root v x ∧ ∀ o' v', (k, o', v') ∈ fs → Admits env root v' x
  | _, [] => by simp [meetDecls]
  | v, (k', o, v') :: fs => by
    rw [meetDecls, admits_meetDecls hm k x]
    by_cases hk : k = k'
    · subst hk
      rw [if_pos rfl, hm]
      constructor
      · rintro ⟨⟨h₁, h₂⟩, h₃⟩
        refine ⟨h₁, fun o'' v'' hmem => ?_⟩
        rcases List.mem_cons.mp hmem with he | hm'
        · cases he; exact h₂
        · exact h₃ o'' v'' hm'
      · rintro ⟨h₁, h₂⟩
        exact ⟨⟨h₁, h₂ o v' (List.mem_cons_self)⟩,
          fun o'' v'' hm' => h₂ o'' v'' (List.mem_cons_of_mem _ hm')⟩
    · rw [if_neg hk]
      constructor
      · rintro ⟨h₁, h₃⟩
        refine ⟨h₁, fun o'' v'' hmem => ?_⟩
        rcases List.mem_cons.mp hmem with he | hm'
        · cases he; exact absurd rfl hk
        · exact h₃ o'' v'' hm'
      · rintro ⟨h₁, h₂⟩
        exact ⟨h₁, fun o'' v'' hm' => h₂ o'' v'' (List.mem_cons_of_mem _ hm')⟩

/-- The spread of a meet: the meet of the spreads, or the one there is.
Two spreads either of which reads a member's key stay as written, since
the meet of a `key` is known only under the key. -/
def meetSpread (m : Val → Val → Val) : Option Val → Option Val → Option Val
  | some t₁, some t₂ => some (if t₁.keyed || t₂.keyed || (m t₁ t₂).keyed then .meet t₁ t₂ else m t₁ t₂)
  | some t, none => some t
  | none, some t => some t
  | none, none => none

theorem meetSpread_admits {m : Val → Val → Val}
    (hm : ∀ a b j, Admits env root (m a b) j ↔ Admits env root a j ∧ Admits env root b j)
    {s₁ s₂ : Option Val} {k : String} {x : Data} :
    (∀ t, meetSpread m s₁ s₂ = some t → Admits env root (t.atKey k) x) ↔
      (∀ t, s₁ = some t → Admits env root (t.atKey k) x) ∧
        (∀ t, s₂ = some t → Admits env root (t.atKey k) x) := by
  cases s₁ with
  | none => cases s₂ <;> simp [meetSpread]
  | some t₁ =>
    cases s₂ with
    | none => simp [meetSpread]
    | some t₂ =>
      simp only [meetSpread, Option.some.injEq, forall_eq']
      split
      · simp only [Val.atKey]
        exact admits_meet_iff
      · rename_i hk
        simp only [Bool.or_eq_true, not_or, Bool.not_eq_true] at hk
        rw [Val.atKey_of_keyed k hk.2, Val.atKey_of_keyed k hk.1.1, Val.atKey_of_keyed k hk.1.2]
        exact hm _ _ _

theorem meetSpread_none {m : Val → Val → Val} {s₁ s₂ : Option Val} :
    meetSpread m s₁ s₂ = none ↔ s₁ = none ∧ s₂ = none := by
  cases s₁ <;> cases s₂ <;> simp [meetSpread]

/-- The declaration a key of one side yields in the meet, against the
other side: a key the other declares holds the meet of all its
declarations and is optional only where every one is; a key the other
does not declare is met with the other's spread, or with `any` where it
has none; and where the other is sealed the key cannot appear, so an
optional one drops and a required one holds `nil`. -/
def meetKey (m : Val → Val → Val) (other : List (String × Bool × Val)) (s : Option Val)
    (c : Bool) (f : String × Bool × Val) : Option (String × Bool × Val) :=
  if declared f.1 other then some (f.1, f.2.1 && optional f.1 other, meetDecls m f.1 f.2.2 other)
  else if c then (if f.2.1 then none else some (f.1, false, .nil))
  else some (f.1, f.2.1, m f.2.2 ((s.getD .any).atKey f.1).selectNow)

/-- Each declared value met with the spread, where the meet has one. -/
def foldSpread (m : Val → Val → Val) (sp : Option Val) (fs : List (String × Bool × Val)) :
    List (String × Bool × Val) :=
  match sp with
  | none => fs
  | some t => fs.map fun f => (f.1, f.2.1, m f.2.2 (t.atKey f.1).selectNow)

/-- The meet of two maps, key by key: the keys of one side, each against
the other, then the keys of the other side alone, and every value met
with the spread. The spread is the meet of the spreads, and the seal
either side's. -/
def meetMap (m : Val → Val → Val) (fs₁ : List (String × Bool × Val)) (s₁ : Option Val)
    (c₁ : Bool) (fs₂ : List (String × Bool × Val)) (s₂ : Option Val) (c₂ : Bool) : Val :=
  .map (foldSpread m (meetSpread m s₁ s₂)
      (fs₁.filterMap (meetKey m fs₂ s₂ c₂) ++
        fs₂.filterMap fun f =>
          if declared f.1 fs₁ then none else meetKey (fun a b => m b a) fs₁ s₁ c₁ f))
    (meetSpread m s₁ s₂) (c₁ || c₂)

theorem meetKey_eq_some {m : Val → Val → Val} {other : List (String × Bool × Val)} {s : Option Val}
    {c : Bool} {f : String × Bool × Val} {k : String} {o : Bool} {v : Val}
    (h : meetKey m other s c f = some (k, o, v)) :
    k = f.1 ∧
      ((declared k other = true ∧ o = (f.2.1 && optional k other) ∧
          v = meetDecls m k f.2.2 other) ∨
       (declared k other = false ∧ c = true ∧ f.2.1 = false ∧ o = false ∧ v = .nil) ∨
       (declared k other = false ∧ c = false ∧ o = f.2.1 ∧
          v = m f.2.2 ((s.getD .any).atKey k).selectNow)) := by
  unfold meetKey at h
  split at h
  · rename_i hd
    simp only [Option.some.injEq, Prod.mk.injEq] at h
    obtain ⟨rfl, rfl, rfl⟩ := h
    exact ⟨rfl, .inl ⟨hd, rfl, rfl⟩⟩
  · rename_i hd
    split at h
    · rename_i hc
      split at h
      · exact nomatch h
      · rename_i ho
        simp only [Option.some.injEq, Prod.mk.injEq] at h
        obtain ⟨rfl, rfl, rfl⟩ := h
        exact ⟨rfl, .inr (.inl ⟨by simpa using hd, hc, by simpa using ho, rfl, rfl⟩)⟩
    · rename_i hc
      simp only [Option.some.injEq, Prod.mk.injEq] at h
      obtain ⟨rfl, rfl, rfl⟩ := h
      exact ⟨rfl, .inr (.inr ⟨by simpa using hd, by simpa using hc, rfl, rfl⟩)⟩

theorem meetKey_declared {m : Val → Val → Val} {other : List (String × Bool × Val)}
    {s : Option Val} {c : Bool} (f : String × Bool × Val) (h : declared f.1 other = true) :
    meetKey m other s c f =
      some (f.1, f.2.1 && optional f.1 other, meetDecls m f.1 f.2.2 other) := by
  simp [meetKey, h]

theorem meetKey_sealed {m : Val → Val → Val} {other : List (String × Bool × Val)}
    {s : Option Val} (f : String × Bool × Val) (h : declared f.1 other = false)
    (ho : f.2.1 = false) : meetKey m other s true f = some (f.1, false, .nil) := by
  simp [meetKey, h, ho]

theorem meetKey_open {m : Val → Val → Val} {other : List (String × Bool × Val)}
    {s : Option Val} (f : String × Bool × Val) (h : declared f.1 other = false) :
    meetKey m other s false f =
      some (f.1, f.2.1, m f.2.2 ((s.getD .any).atKey f.1).selectNow) := by
  simp [meetKey, h]

theorem meetKey_alone {m : Val → Val → Val} {fs₁ : List (String × Bool × Val)} {s₁ : Option Val}
    {c₁ : Bool} (f : String × Bool × Val) (h : declared f.1 fs₁ = false) :
    (if declared f.1 fs₁ then none else meetKey (fun a b => m b a) fs₁ s₁ c₁ f) =
      meetKey (fun a b => m b a) fs₁ s₁ c₁ f := by
  simp [h]

theorem admits_map_iff {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool}
    {jfs : List (String × Data)} :
    Admits env root (.map fs spread closed) (.map jfs) ↔
      (∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x → Admits env root v x) ∧
      (∀ k o v, (k, o, v) ∈ fs → lookup k jfs = none → o = true) ∧
      (∀ s, spread = some s → ∀ k x, (k, x) ∈ jfs → Admits env root (s.atKey k) x) ∧
      (closed = true → ∀ k x, (k, x) ∈ jfs → ∃ o v, (k, o, v) ∈ fs) :=
  ⟨fun h => by cases h with | map hp ha hs hc => exact ⟨hp, ha, hs, hc⟩,
   fun ⟨hp, ha, hs, hc⟩ => .map hp ha hs hc⟩

theorem lookup_mem {k : String} {x : Data} : ∀ {jfs : List (String × Data)},
    lookup k jfs = some x → (k, x) ∈ jfs
  | [], h => nomatch h
  | (k', y) :: jfs, h => by
    by_cases hk : k = k'
    · subst hk
      simp [lookup] at h
      subst h
      exact List.mem_cons_self
    · simp [lookup, hk] at h
      exact List.mem_cons_of_mem _ (lookup_mem h)

theorem mem_lookup {k : String} {x : Data} : ∀ {jfs : List (String × Data)},
    (k, x) ∈ jfs → ∃ y, lookup k jfs = some y
  | [], h => nomatch h
  | (k', y) :: jfs, h => by
    by_cases hk : k = k'
    · subst hk; exact ⟨y, by simp [lookup]⟩
    · rcases List.mem_cons.mp h with he | hm
      · cases he; exact absurd rfl hk
      · obtain ⟨z, hz⟩ := mem_lookup hm
        exact ⟨z, by simp [lookup, hk, hz]⟩

theorem admits_spread_getD {s : Option Val} {jfs : List (String × Data)} {k : String} {x : Data}
    (hs : ∀ t, s = some t → ∀ k x, (k, x) ∈ jfs → Admits env root (t.atKey k) x) (hx : (k, x) ∈ jfs) :
    Admits env root ((s.getD .any).atKey k).selectNow x := by
  refine (admits_selectNow _ _).mpr ?_
  cases s with
  | none => exact .any
  | some t => exact hs t rfl k x hx

theorem admits_foldSpread {m : Val → Val → Val}
    (hm : ∀ a b j, Admits env root (m a b) j ↔ Admits env root a j ∧ Admits env root b j)
    {sp : Option Val} {fs : List (String × Bool × Val)} {c : Bool} {jfs : List (String × Data)} :
    Admits env root (.map (foldSpread m sp fs) sp c) (.map jfs) ↔
      Admits env root (.map fs sp c) (.map jfs) := by
  cases sp with
  | none => exact Iff.rfl
  | some t =>
    simp only [foldSpread]
    rw [admits_map_iff, admits_map_iff]
    constructor
    · rintro ⟨hp, ha, hs, hc⟩
      refine ⟨fun k o v x hm' hl => ?_, fun k o v hm' hl => ?_, hs, fun hcl k x hx => ?_⟩
      · have h := hp k o (m v (t.atKey k).selectNow) x (List.mem_map.mpr ⟨(k, o, v), hm', rfl⟩) hl
        exact ((hm _ _ _).mp h).1
      · exact ha k o (m v (t.atKey k).selectNow) (List.mem_map.mpr ⟨(k, o, v), hm', rfl⟩) hl
      · obtain ⟨o, v', hmem⟩ := hc hcl k x hx
        obtain ⟨⟨k', o', v⟩, hm', he⟩ := List.mem_map.mp hmem
        simp only [Prod.mk.injEq] at he
        obtain ⟨rfl, rfl, -⟩ := he
        exact ⟨o', v, hm'⟩
    · rintro ⟨hp, ha, hs, hc⟩
      refine ⟨fun k o v' x hm' hl => ?_, fun k o v' hm' hl => ?_, hs, fun hcl k x hx => ?_⟩
      · obtain ⟨⟨k', o', v⟩, hmem, he⟩ := List.mem_map.mp hm'
        simp only [Prod.mk.injEq] at he
        obtain ⟨rfl, rfl, rfl⟩ := he
        exact (hm _ _ _).mpr
          ⟨hp _ _ _ x hmem hl, (admits_selectNow _ _).mpr (hs t rfl _ x (lookup_mem hl))⟩
      · obtain ⟨⟨k', o', v⟩, hmem, he⟩ := List.mem_map.mp hm'
        simp only [Prod.mk.injEq] at he
        obtain ⟨rfl, rfl, -⟩ := he
        exact ha _ _ _ hmem hl
      · obtain ⟨o, v, hmem⟩ := hc hcl k x hx
        exact ⟨o, m v (t.atKey k).selectNow, List.mem_map.mpr ⟨(k, o, v), hmem, rfl⟩⟩

theorem admits_meetMap_core {m : Val → Val → Val}
    (hm : ∀ a b j, Admits env root (m a b) j ↔ Admits env root a j ∧ Admits env root b j)
    (fs₁ : List (String × Bool × Val)) (s₁ : Option Val) (c₁ : Bool)
    (fs₂ : List (String × Bool × Val)) (s₂ : Option Val) (c₂ : Bool)
    (jfs : List (String × Data)) :
    Admits env root (.map (fs₁.filterMap (meetKey m fs₂ s₂ c₂) ++
        fs₂.filterMap fun f =>
          if declared f.1 fs₁ then none else meetKey (fun a b => m b a) fs₁ s₁ c₁ f)
      (meetSpread m s₁ s₂) (c₁ || c₂)) (.map jfs) ↔
      Admits env root (.map fs₁ s₁ c₁) (.map jfs) ∧ Admits env root (.map fs₂ s₂ c₂) (.map jfs) := by
  have hmf : ∀ a b j, Admits env root ((fun a b => m b a) a b) j ↔
      Admits env root a j ∧ Admits env root b j :=
    fun a b j => by simp only; rw [hm, and_comm]
  rw [admits_map_iff, admits_map_iff, admits_map_iff]
  constructor
  · rintro ⟨hp, ha, hs, hc⟩
    refine ⟨⟨?_, ?_, ?_, ?_⟩, ⟨?_, ?_, ?_, ?_⟩⟩
    · intro k o₁ v₁ x hm₁ hl
      cases hd : declared k fs₂ with
      | true =>
        have h := hp k _ _ x (List.mem_append_left _ (List.mem_filterMap.mpr
          ⟨(k, o₁, v₁), hm₁, meetKey_declared (k, o₁, v₁) hd⟩)) hl
        exact ((admits_meetDecls hm k x v₁ fs₂).mp h).1
      | false =>
        cases c₂ with
        | true =>
          cases o₁ with
          | false =>
            have h := hp k _ _ x (List.mem_append_left _ (List.mem_filterMap.mpr
              ⟨(k, false, v₁), hm₁, meetKey_sealed (k, false, v₁) hd rfl⟩)) hl
            exact absurd h (fun h => nomatch h)
          | true =>
            exfalso
            obtain ⟨o, v, hmem⟩ := hc (by simp) k x (lookup_mem hl)
            rcases List.mem_append.mp hmem with h | h
            · obtain ⟨⟨k', o', v'⟩, hm', hf⟩ := List.mem_filterMap.mp h
              obtain ⟨rfl, hcase⟩ := meetKey_eq_some hf
              rcases hcase with ⟨hd', -⟩ | ⟨-, -, -, -, rfl⟩ | ⟨-, hc₂', -⟩
              · exact Bool.false_ne_true (hd ▸ hd')
              · exact absurd (hp _ _ _ x hmem hl) (fun h => nomatch h)
              · exact Bool.false_ne_true hc₂'.symm
            · obtain ⟨⟨k', o', v'⟩, hm', hf⟩ := List.mem_filterMap.mp h
              simp only at hf
              split at hf
              · exact nomatch hf
              · rename_i hnd
                obtain ⟨rfl, -⟩ := meetKey_eq_some hf
                exact hnd (declared_iff.mpr ⟨true, v₁, hm₁⟩)
        | false =>
          have h := hp k _ _ x (List.mem_append_left _ (List.mem_filterMap.mpr
            ⟨(k, o₁, v₁), hm₁, meetKey_open (k, o₁, v₁) hd⟩)) hl
          exact ((hm _ _ _).mp h).1
    · intro k o₁ v₁ hm₁ hl
      cases hd : declared k fs₂ with
      | true =>
        have h := ha k _ _ (List.mem_append_left _ (List.mem_filterMap.mpr
          ⟨(k, o₁, v₁), hm₁, meetKey_declared (k, o₁, v₁) hd⟩)) hl
        exact (Bool.and_eq_true_iff.mp h).1
      | false =>
        cases c₂ with
        | true =>
          cases o₁ with
          | false =>
            have h := ha k _ _ (List.mem_append_left _ (List.mem_filterMap.mpr
              ⟨(k, false, v₁), hm₁, meetKey_sealed (k, false, v₁) hd rfl⟩)) hl
            exact nomatch h
          | true => rfl
        | false =>
          exact ha k _ _ (List.mem_append_left _ (List.mem_filterMap.mpr
            ⟨(k, o₁, v₁), hm₁, meetKey_open (k, o₁, v₁) hd⟩)) hl
    · intro t ht k x hx
      exact ((meetSpread_admits hm).mp (fun t' ht' => hs t' ht' k x hx)).1 t ht
    · intro hc₁ k x hx
      obtain ⟨o, v, hmem⟩ := hc (by simp [hc₁]) k x hx
      rcases List.mem_append.mp hmem with h | h
      · obtain ⟨⟨k', o', v'⟩, hm', hf⟩ := List.mem_filterMap.mp h
        obtain ⟨rfl, -⟩ := meetKey_eq_some hf
        exact ⟨o', v', hm'⟩
      · obtain ⟨⟨k', o', v'⟩, hm', hf⟩ := List.mem_filterMap.mp h
        simp only at hf
        split at hf
        · exact nomatch hf
        · rename_i hnd
          obtain ⟨rfl, hcase⟩ := meetKey_eq_some hf
          rcases hcase with ⟨hd', -⟩ | ⟨-, -, -, -, rfl⟩ | ⟨-, hc₁', -⟩
          · exact absurd hd' hnd
          · obtain ⟨y, hy⟩ := mem_lookup hx
            exact absurd (hp _ _ _ y hmem hy) (fun h => nomatch h)
          · exact absurd hc₁ (hc₁' ▸ Bool.false_ne_true)
    · intro k o₂ v₂ x hm₂ hl
      cases hd : declared k fs₁ with
      | true =>
        obtain ⟨o₁, v₁, hm₁⟩ := declared_iff.mp hd
        have hd₂ : declared k fs₂ = true := declared_iff.mpr ⟨o₂, v₂, hm₂⟩
        have h := hp k _ _ x (List.mem_append_left _ (List.mem_filterMap.mpr
          ⟨(k, o₁, v₁), hm₁, meetKey_declared (k, o₁, v₁) hd₂⟩)) hl
        exact ((admits_meetDecls hm k x v₁ fs₂).mp h).2 o₂ v₂ hm₂
      | false =>
        cases c₁ with
        | true =>
          cases o₂ with
          | false =>
            have h := hp k _ _ x (List.mem_append_right _ (List.mem_filterMap.mpr
              ⟨(k, false, v₂), hm₂,
                (meetKey_alone (k, false, v₂) hd).trans (meetKey_sealed (k, false, v₂) hd rfl)⟩)) hl
            exact absurd h (fun h => nomatch h)
          | true =>
            exfalso
            obtain ⟨o, v, hmem⟩ := hc (by simp) k x (lookup_mem hl)
            rcases List.mem_append.mp hmem with h | h
            · obtain ⟨⟨k', o', v'⟩, hm', hf⟩ := List.mem_filterMap.mp h
              obtain ⟨rfl, -⟩ := meetKey_eq_some hf
              exact Bool.false_ne_true (hd ▸ declared_iff.mpr ⟨o', v', hm'⟩)
            · obtain ⟨⟨k', o', v'⟩, hm', hf⟩ := List.mem_filterMap.mp h
              simp only at hf
              split at hf
              · exact nomatch hf
              · obtain ⟨rfl, hcase⟩ := meetKey_eq_some hf
                rcases hcase with ⟨hd', -⟩ | ⟨-, -, -, -, rfl⟩ | ⟨-, hc₁', -⟩
                · exact Bool.false_ne_true (hd ▸ hd')
                · exact absurd (hp _ _ _ x hmem hl) (fun h => nomatch h)
                · exact Bool.false_ne_true hc₁'.symm
        | false =>
          have h := hp k _ _ x (List.mem_append_right _ (List.mem_filterMap.mpr
            ⟨(k, o₂, v₂), hm₂,
              (meetKey_alone (k, o₂, v₂) hd).trans (meetKey_open (k, o₂, v₂) hd)⟩)) hl
          exact ((hmf _ _ _).mp h).1
    · intro k o₂ v₂ hm₂ hl
      cases hd : declared k fs₁ with
      | true =>
        obtain ⟨o₁, v₁, hm₁⟩ := declared_iff.mp hd
        have hd₂ : declared k fs₂ = true := declared_iff.mpr ⟨o₂, v₂, hm₂⟩
        have h := ha k _ _ (List.mem_append_left _ (List.mem_filterMap.mpr
          ⟨(k, o₁, v₁), hm₁, meetKey_declared (k, o₁, v₁) hd₂⟩)) hl
        exact optional_iff.mp (Bool.and_eq_true_iff.mp h).2 o₂ v₂ hm₂
      | false =>
        cases c₁ with
        | true =>
          cases o₂ with
          | false =>
            have h := ha k _ _ (List.mem_append_right _ (List.mem_filterMap.mpr
              ⟨(k, false, v₂), hm₂,
                (meetKey_alone (k, false, v₂) hd).trans (meetKey_sealed (k, false, v₂) hd rfl)⟩)) hl
            exact nomatch h
          | true => rfl
        | false =>
          exact ha k _ _ (List.mem_append_right _ (List.mem_filterMap.mpr
            ⟨(k, o₂, v₂), hm₂,
              (meetKey_alone (k, o₂, v₂) hd).trans (meetKey_open (k, o₂, v₂) hd)⟩)) hl
    · intro t ht k x hx
      exact ((meetSpread_admits hm).mp (fun t' ht' => hs t' ht' k x hx)).2 t ht
    · intro hc₂ k x hx
      obtain ⟨o, v, hmem⟩ := hc (by simp [hc₂]) k x hx
      rcases List.mem_append.mp hmem with h | h
      · obtain ⟨⟨k', o', v'⟩, hm', hf⟩ := List.mem_filterMap.mp h
        obtain ⟨rfl, hcase⟩ := meetKey_eq_some hf
        rcases hcase with ⟨hd', -⟩ | ⟨-, -, -, -, rfl⟩ | ⟨-, hc₂', -⟩
        · exact declared_iff.mp hd'
        · obtain ⟨y, hy⟩ := mem_lookup hx
          exact absurd (hp _ _ _ y hmem hy) (fun h => nomatch h)
        · exact absurd hc₂ (hc₂' ▸ Bool.false_ne_true)
      · obtain ⟨⟨k', o', v'⟩, hm', hf⟩ := List.mem_filterMap.mp h
        simp only at hf
        split at hf
        · exact nomatch hf
        · obtain ⟨rfl, -⟩ := meetKey_eq_some hf
          exact ⟨o', v', hm'⟩
  · rintro ⟨⟨hp₁, ha₁, hs₁, hc₁⟩, ⟨hp₂, ha₂, hs₂, hc₂⟩⟩
    refine ⟨?_, ?_, ?_, ?_⟩
    · intro k o v x hmem hl
      rcases List.mem_append.mp hmem with h | h
      · obtain ⟨⟨k', o', v'⟩, hmem', hf⟩ := List.mem_filterMap.mp h
        obtain ⟨rfl, hcase⟩ := meetKey_eq_some hf
        rcases hcase with ⟨hd, -, rfl⟩ | ⟨hd, hc, -, -, rfl⟩ | ⟨hd, hc, -, rfl⟩
        · exact (admits_meetDecls hm _ x v' fs₂).mpr
            ⟨hp₁ _ o' v' x hmem' hl, fun o'' v'' hm'' => hp₂ _ o'' v'' x hm'' hl⟩
        · exfalso
          obtain ⟨o'', v'', hm''⟩ := hc₂ hc _ x (lookup_mem hl)
          exact Bool.false_ne_true (hd ▸ declared_iff.mpr ⟨o'', v'', hm''⟩)
        · exact (hm _ _ _).mpr ⟨hp₁ _ o' v' x hmem' hl, admits_spread_getD hs₂ (lookup_mem hl)⟩
      · obtain ⟨⟨k', o', v'⟩, hmem', hf⟩ := List.mem_filterMap.mp h
        simp only at hf
        split at hf
        · exact nomatch hf
        · rename_i hnd
          obtain ⟨rfl, hcase⟩ := meetKey_eq_some hf
          rcases hcase with ⟨hd, -, rfl⟩ | ⟨hd, hc, -, -, rfl⟩ | ⟨hd, hc, -, rfl⟩
          · exact absurd hd hnd
          · exfalso
            obtain ⟨o'', v'', hm''⟩ := hc₁ hc _ x (lookup_mem hl)
            exact hnd (declared_iff.mpr ⟨o'', v'', hm''⟩)
          · exact (hmf _ _ _).mpr ⟨hp₂ _ o' v' x hmem' hl, admits_spread_getD hs₁ (lookup_mem hl)⟩
    · intro k o v hmem hl
      rcases List.mem_append.mp hmem with h | h
      · obtain ⟨⟨k', o', v'⟩, hmem', hf⟩ := List.mem_filterMap.mp h
        obtain ⟨rfl, hcase⟩ := meetKey_eq_some hf
        rcases hcase with ⟨-, rfl, -⟩ | ⟨-, -, ho, rfl, -⟩ | ⟨-, -, rfl, -⟩
        · exact Bool.and_eq_true_iff.mpr ⟨ha₁ _ o' v' hmem' hl,
            optional_iff.mpr fun o'' v'' hm'' => ha₂ _ o'' v'' hm'' hl⟩
        · have ho' : o' = false := ho
          exact (Bool.false_ne_true (ho'.symm.trans (ha₁ _ o' v' hmem' hl))).elim
        · exact ha₁ _ _ _ hmem' hl
      · obtain ⟨⟨k', o', v'⟩, hmem', hf⟩ := List.mem_filterMap.mp h
        simp only at hf
        split at hf
        · exact nomatch hf
        · rename_i hnd
          obtain ⟨rfl, hcase⟩ := meetKey_eq_some hf
          rcases hcase with ⟨hd, -, -⟩ | ⟨-, -, ho, rfl, -⟩ | ⟨-, -, rfl, -⟩
          · exact absurd hd hnd
          · have ho' : o' = false := ho
            exact (Bool.false_ne_true (ho'.symm.trans (ha₂ _ o' v' hmem' hl))).elim
          · exact ha₂ _ _ _ hmem' hl
    · intro t ht k x hx
      exact (meetSpread_admits hm).mpr
        ⟨fun t₁ h₁ => hs₁ t₁ h₁ k x hx, fun t₂ h₂ => hs₂ t₂ h₂ k x hx⟩ t ht
    · intro hcl k x hx
      cases hc : c₁ with
      | true =>
        obtain ⟨o₁, v₁, hm₁⟩ := hc₁ hc k x hx
        cases hd : declared k fs₂ with
        | true =>
          exact ⟨_, _, List.mem_append_left _ (List.mem_filterMap.mpr
            ⟨(k, o₁, v₁), hm₁, meetKey_declared (k, o₁, v₁) hd⟩)⟩
        | false =>
          cases hc₂' : c₂ with
          | true =>
            exfalso
            obtain ⟨o₂, v₂, hm₂⟩ := hc₂ hc₂' k x hx
            exact Bool.false_ne_true (hd ▸ declared_iff.mpr ⟨o₂, v₂, hm₂⟩)
          | false =>
            exact ⟨_, _, List.mem_append_left _ (List.mem_filterMap.mpr
              ⟨(k, o₁, v₁), hm₁, meetKey_open (k, o₁, v₁) hd⟩)⟩
      | false =>
        have hc₂' : c₂ = true := by simpa [hc] using hcl
        obtain ⟨o₂, v₂, hm₂⟩ := hc₂ hc₂' k x hx
        cases hd : declared k fs₁ with
        | true =>
          obtain ⟨o₁, v₁, hm₁⟩ := declared_iff.mp hd
          exact ⟨_, _, List.mem_append_left _ (List.mem_filterMap.mpr
            ⟨(k, o₁, v₁), hm₁, meetKey_declared (k, o₁, v₁) (declared_iff.mpr ⟨o₂, v₂, hm₂⟩)⟩)⟩
        | false =>
          exact ⟨_, _, List.mem_append_right _ (List.mem_filterMap.mpr
            ⟨(k, o₂, v₂), hm₂, (meetKey_alone (k, o₂, v₂) hd).trans (meetKey_open (k, o₂, v₂) hd)⟩)⟩

theorem admits_meetMap {m : Val → Val → Val}
    (hm : ∀ a b j, Admits env root (m a b) j ↔ Admits env root a j ∧ Admits env root b j)
    (fs₁ : List (String × Bool × Val)) (s₁ : Option Val) (c₁ : Bool)
    (fs₂ : List (String × Bool × Val)) (s₂ : Option Val) (c₂ : Bool) (j : Data) :
    Admits env root (meetMap m fs₁ s₁ c₁ fs₂ s₂ c₂) j ↔
      Admits env root (.map fs₁ s₁ c₁) j ∧ Admits env root (.map fs₂ s₂ c₂) j := by
  cases j with
  | num _ | str _ | bool _ | null | list _ =>
    exact ⟨(fun h => nomatch h), (fun ⟨h, _⟩ => nomatch h)⟩
  | map jfs =>
    unfold meetMap
    rw [admits_foldSpread hm]
    exact admits_meetMap_core hm fs₁ s₁ c₁ fs₂ s₂ c₂ jfs

/-! ## Two lists -/

/-- A position of the meet of two lists, from the positions each side
gives it: both, their meet; one side alone, its value, or `nil` where
the other side's length is fixed. -/
def meetPos (m : Val → Val → Val) (f₁ f₂ : Bool) : Option Val → Option Val → Val
  | some a, some b => m a b
  | some a, none => if f₂ then .nil else m a .any
  | none, some b => if f₁ then .nil else m .any b
  | none, none => .nil

/-- A position met with the spread, read under the position, where the
meet has one. -/
def meetWrap (m : Val → Val → Val) (sp : Option Val) (i : ℕ) (e : Val) : Val :=
  match sp with
  | some t => m e (t.atKey (toString i)).selectNow
  | none => e

/-- The positions of the meet of two lists, as many as the longer side
has, each met with the spread. -/
def meetItems (m : Val → Val → Val) (f₁ f₂ : Bool) (sp : Option Val) (is₁ is₂ : List Val) :
    List Val :=
  (List.range (max is₁.length is₂.length)).map fun i =>
    meetWrap m sp i (meetPos m f₁ f₂ is₁[i]? is₂[i]?)

/-- The meet of two lists, position by position, each position met with
the spread, which is the meet of the spreads. A side sealed without a
spread fixes the length, and the meet then keeps no spread. The seal is
either side's. -/
def meetList (m : Val → Val → Val) (is₁ : List Val) (s₁ : Option Val) (c₁ : Bool)
    (is₂ : List Val) (s₂ : Option Val) (c₂ : Bool) : Val :=
  let f₁ := c₁ && s₁.isNone
  let f₂ := c₂ && s₂.isNone
  .list (meetItems m f₁ f₂ (meetSpread m s₁ s₂) is₁ is₂)
    (if f₁ || f₂ then none else meetSpread m s₁ s₂) (c₁ || c₂)

theorem admits_list_iff {items : List Val} {spread : Option Val} {closed : Bool} {xs : List Data} :
    Admits env root (.list items spread closed) (.list xs) ↔
      items.length ≤ xs.length ∧
      (closed = true → spread = none → xs.length = items.length) ∧
      (∀ (i : ℕ) (v : Val) (x : Data), items[i]? = some v → xs[i]? = some x →
        Admits env root v x) ∧
      (∀ s, spread = some s → ∀ (i : ℕ) (x : Data), xs[i]? = some x →
        Admits env root (s.atKey (toString i)) x) :=
  ⟨fun h => by
    cases h with
    | list h₁ h₂ h₃ h₄ =>
      exact ⟨h₁, h₂, h₃, fun s hs i x hx => h₄ s hs _ x (mem_namedItems_zero.mpr ⟨i, hx, rfl⟩)⟩,
   fun ⟨h₁, h₂, h₃, h₄⟩ => .list h₁ h₂ h₃ fun s hs k x hm => by
    obtain ⟨i, hx, rfl⟩ := mem_namedItems_zero.mp hm
    exact h₄ s hs i x hx⟩

theorem getElem?_range_map {α : Type} (f : ℕ → α) (n i : ℕ) :
    ((List.range n).map f)[i]? = if i < n then some (f i) else none := by
  rw [List.getElem?_map]
  by_cases h : i < n
  · rw [List.getElem?_range h, if_pos h]; rfl
  · rw [List.getElem?_eq_none (by rw [List.length_range]; exact Nat.le_of_not_lt h), if_neg h]
    rfl

theorem length_meetItems {m : Val → Val → Val} {f₁ f₂ : Bool} {sp : Option Val}
    {is₁ is₂ : List Val} : (meetItems m f₁ f₂ sp is₁ is₂).length = max is₁.length is₂.length := by
  simp [meetItems]

theorem getElem?_meetItems {m : Val → Val → Val} {f₁ f₂ : Bool} {sp : Option Val}
    {is₁ is₂ : List Val} (i : ℕ) :
    (meetItems m f₁ f₂ sp is₁ is₂)[i]? =
      if i < max is₁.length is₂.length then
        some (meetWrap m sp i (meetPos m f₁ f₂ is₁[i]? is₂[i]?))
      else none :=
  getElem?_range_map _ _ _

theorem forall_pos_iff {n : ℕ} {w : ℕ → Val} {xs : List Data} :
    (∀ (i : ℕ) (v : Val) (x : Data), (if i < n then some (w i) else none) = some v →
      xs[i]? = some x → Admits env root v x) ↔
      ∀ i x, i < n → xs[i]? = some x → Admits env root (w i) x := by
  constructor
  · intro h i x hi hx; exact h i (w i) x (if_pos hi) hx
  · intro h i v x hv hx
    by_cases hi : i < n
    · rw [if_pos hi, Option.some.injEq] at hv; subst hv; exact h i x hi hx
    · rw [if_neg hi] at hv; exact nomatch hv

theorem admits_wrap {m : Val → Val → Val}
    (hm : ∀ a b j, Admits env root (m a b) j ↔ Admits env root a j ∧ Admits env root b j)
    {sp : Option Val} {i : ℕ} {e : Val} {x : Data} :
    Admits env root (meetWrap m sp i e) x ↔
      Admits env root e x ∧ ∀ t, sp = some t → Admits env root (t.atKey (toString i)) x := by
  cases sp <;> simp [meetWrap, hm, admits_selectNow]

theorem admits_meetPos {m : Val → Val → Val}
    (hm : ∀ a b j, Admits env root (m a b) j ↔ Admits env root a j ∧ Admits env root b j)
    {f₁ f₂ : Bool} {a? b? : Option Val} {x : Data} :
    Admits env root (meetPos m f₁ f₂ a? b?) x ↔
      (∀ a, a? = some a → Admits env root a x) ∧ (∀ b, b? = some b → Admits env root b x) ∧
      (a? = none → b?.isSome = true → f₁ = false) ∧ (b? = none → a?.isSome = true → f₂ = false) ∧
      (a?.isSome = true ∨ b?.isSome = true) := by
  cases a? <;> cases b? <;> cases f₁ <;> cases f₂ <;>
    simp [meetPos, hm, admits_nil_iff, admits_any_iff]

theorem lt_max_cases {i a b : ℕ} (h : i < max a b) : i < a ∨ i < b := by
  by_cases ha : i < a
  · exact .inl ha
  · right
    rcases Nat.le_total a b with hab | hab
    · rwa [Nat.max_eq_right hab] at h
    · rw [Nat.max_eq_left hab] at h; exact absurd h ha

theorem admits_meetList_aux {m : Val → Val → Val}
    (hm : ∀ a b j, Admits env root (m a b) j ↔ Admits env root a j ∧ Admits env root b j)
    {f₁ f₂ : Bool} {is₁ : List Val} {s₁ : Option Val} {c₁ : Bool}
    {is₂ : List Val} {s₂ : Option Val} {c₂ : Bool}
    (hf₁ : f₁ = true ↔ c₁ = true ∧ s₁ = none) (hf₂ : f₂ = true ↔ c₂ = true ∧ s₂ = none)
    (xs : List Data) :
    Admits env root (.list (meetItems m f₁ f₂ (meetSpread m s₁ s₂) is₁ is₂)
        (if f₁ || f₂ then none else meetSpread m s₁ s₂) (c₁ || c₂)) (.list xs) ↔
      Admits env root (.list is₁ s₁ c₁) (.list xs) ∧
        Admits env root (.list is₂ s₂ c₂) (.list xs) := by
  rw [admits_list_iff, admits_list_iff, admits_list_iff, length_meetItems]
  simp only [getElem?_meetItems, forall_pos_iff]
  constructor
  · rintro ⟨hn, hfix, hpos, hspr⟩
    have hpos' : ∀ i x, i < max is₁.length is₂.length → xs[i]? = some x →
        ((∀ a, is₁[i]? = some a → Admits env root a x) ∧
          (∀ b, is₂[i]? = some b → Admits env root b x) ∧
          (is₁[i]? = none → is₂[i]?.isSome = true → f₁ = false) ∧
          (is₂[i]? = none → is₁[i]?.isSome = true → f₂ = false) ∧
          (is₁[i]?.isSome = true ∨ is₂[i]?.isSome = true)) ∧
        (∀ t, meetSpread m s₁ s₂ = some t → Admits env root (t.atKey (toString i)) x) := by
      intro i x hi hx
      have h := hpos i x hi hx
      rwa [admits_wrap hm, admits_meetPos hm] at h
    have hX : (f₁ || f₂) = true → xs.length = max is₁.length is₂.length := by
      intro hF
      refine hfix ?_ (by simp [hF])
      rcases Bool.or_eq_true_iff.mp hF with h | h
      · simp [(hf₁.mp h).1]
      · simp [(hf₂.mp h).1]
    refine ⟨⟨Nat.le_trans (Nat.le_max_left _ _) hn, ?_, ?_, ?_⟩,
      ⟨Nat.le_trans (Nat.le_max_right _ _) hn, ?_, ?_, ?_⟩⟩
    · intro hc hs
      have hf : f₁ = true := hf₁.mpr ⟨hc, hs⟩
      have hF : (f₁ || f₂) = true := by simp [hf]
      rw [hX hF]
      rcases Nat.le_total is₂.length is₁.length with hle | hle
      · rw [Nat.max_eq_left hle]
      · rcases Nat.lt_or_eq_of_le hle with hlt | heq
        · exfalso
          have hi : is₁.length < max is₁.length is₂.length := by
            rw [Nat.max_eq_right hle]; exact hlt
          have hx : xs[is₁.length]? = some xs[is₁.length] :=
            List.getElem?_eq_getElem (hX hF ▸ hi)
          have hff := (hpos' _ _ hi hx).1.2.2.1 (List.getElem?_eq_none (Nat.le_refl _))
            (by rw [List.getElem?_eq_getElem hlt]; rfl)
          rw [hff] at hf
          exact Bool.false_ne_true hf
        · rw [Nat.max_eq_right hle]; exact heq.symm
    · intro i a x ha hx
      obtain ⟨hi, -⟩ := List.getElem?_eq_some_iff.mp ha
      exact (hpos' i x (Nat.lt_of_lt_of_le hi (Nat.le_max_left _ _)) hx).1.1 a ha
    · intro t ht i x hx
      cases hF : (f₁ || f₂) with
      | false =>
        have h := hspr
        rw [if_neg (by simp [hF])] at h
        exact ((meetSpread_admits hm).mp fun t' ht' => h t' ht' i x hx).1 t ht
      | true =>
        obtain ⟨hlt, -⟩ := List.getElem?_eq_some_iff.mp hx
        rw [hX hF] at hlt
        exact ((meetSpread_admits hm).mp (hpos' i x hlt hx).2).1 t ht
    · intro hc hs
      have hf : f₂ = true := hf₂.mpr ⟨hc, hs⟩
      have hF : (f₁ || f₂) = true := by simp [hf]
      rw [hX hF]
      rcases Nat.le_total is₁.length is₂.length with hle | hle
      · rw [Nat.max_eq_right hle]
      · rcases Nat.lt_or_eq_of_le hle with hlt | heq
        · exfalso
          have hi : is₂.length < max is₁.length is₂.length := by
            rw [Nat.max_eq_left hle]; exact hlt
          have hx : xs[is₂.length]? = some xs[is₂.length] :=
            List.getElem?_eq_getElem (hX hF ▸ hi)
          have hff := (hpos' _ _ hi hx).1.2.2.2.1 (List.getElem?_eq_none (Nat.le_refl _))
            (by rw [List.getElem?_eq_getElem hlt]; rfl)
          rw [hff] at hf
          exact Bool.false_ne_true hf
        · rw [Nat.max_eq_left hle]; exact heq.symm
    · intro i b x hb hx
      obtain ⟨hi, -⟩ := List.getElem?_eq_some_iff.mp hb
      exact (hpos' i x (Nat.lt_of_lt_of_le hi (Nat.le_max_right _ _)) hx).1.2.1 b hb
    · intro t ht i x hx
      cases hF : (f₁ || f₂) with
      | false =>
        have h := hspr
        rw [if_neg (by simp [hF])] at h
        exact ((meetSpread_admits hm).mp fun t' ht' => h t' ht' i x hx).2 t ht
      | true =>
        obtain ⟨hlt, -⟩ := List.getElem?_eq_some_iff.mp hx
        rw [hX hF] at hlt
        exact ((meetSpread_admits hm).mp (hpos' i x hlt hx).2).2 t ht
  · rintro ⟨⟨h1, h2, h3, h4⟩, ⟨h5, h6, h7, h8⟩⟩
    refine ⟨Nat.max_le.mpr ⟨h1, h5⟩, ?_, ?_, ?_⟩
    · intro hc hnone
      cases hF : (f₁ || f₂) with
      | true =>
        rcases Bool.or_eq_true_iff.mp hF with h | h
        · obtain ⟨hc₁, hs₁⟩ := hf₁.mp h
          have hX := h2 hc₁ hs₁
          rw [hX, Nat.max_eq_left (hX ▸ h5)]
        · obtain ⟨hc₂, hs₂⟩ := hf₂.mp h
          have hX := h6 hc₂ hs₂
          rw [hX, Nat.max_eq_right (hX ▸ h1)]
      | false =>
        exfalso
        rw [if_neg (by simp [hF])] at hnone
        obtain ⟨hs₁, hs₂⟩ := meetSpread_none.mp hnone
        rcases Bool.or_eq_true_iff.mp hc with h | h
        · have := hf₁.mpr ⟨h, hs₁⟩
          simp [this] at hF
        · have := hf₂.mpr ⟨h, hs₂⟩
          simp [this] at hF
    · intro i x hi hx
      rw [admits_wrap hm, admits_meetPos hm]
      refine ⟨⟨fun a ha => h3 i a x ha hx, fun b hb => h7 i b x hb hx, ?_, ?_, ?_⟩, ?_⟩
      · intro hnone _
        cases hf : f₁ with
        | false => rfl
        | true =>
          obtain ⟨hc₁, hs₁⟩ := hf₁.mp hf
          have hX := h2 hc₁ hs₁
          have hle : is₁.length ≤ i := List.getElem?_eq_none_iff.mp hnone
          rw [List.getElem?_eq_none (hX ▸ hle)] at hx
          exact nomatch hx
      · intro hnone _
        cases hf : f₂ with
        | false => rfl
        | true =>
          obtain ⟨hc₂, hs₂⟩ := hf₂.mp hf
          have hX := h6 hc₂ hs₂
          have hle : is₂.length ≤ i := List.getElem?_eq_none_iff.mp hnone
          rw [List.getElem?_eq_none (hX ▸ hle)] at hx
          exact nomatch hx
      · rcases lt_max_cases hi with h | h
        · left; rw [List.getElem?_eq_getElem h]; rfl
        · right; rw [List.getElem?_eq_getElem h]; rfl
      · intro t ht
        exact (meetSpread_admits hm).mpr ⟨fun t₁ h₁ => h4 t₁ h₁ i x hx,
          fun t₂ h₂ => h8 t₂ h₂ i x hx⟩ t ht
    · intro t ht i x hx
      split at ht
      · exact nomatch ht
      · exact (meetSpread_admits hm).mpr
          ⟨fun t₁ h₁ => h4 t₁ h₁ i x hx, fun t₂ h₂ => h8 t₂ h₂ i x hx⟩ t ht

theorem admits_meetList {m : Val → Val → Val}
    (hm : ∀ a b j, Admits env root (m a b) j ↔ Admits env root a j ∧ Admits env root b j)
    (is₁ : List Val) (s₁ : Option Val) (c₁ : Bool) (is₂ : List Val) (s₂ : Option Val) (c₂ : Bool)
    (j : Data) :
    Admits env root (meetList m is₁ s₁ c₁ is₂ s₂ c₂) j ↔
      Admits env root (.list is₁ s₁ c₁) j ∧ Admits env root (.list is₂ s₂ c₂) j := by
  cases j with
  | num _ | str _ | bool _ | null | map _ =>
    exact ⟨(fun h => nomatch h), (fun ⟨h, _⟩ => nomatch h)⟩
  | list xs =>
    exact admits_meetList_aux hm (by simp [Option.isNone_iff_eq_none])
      (by simp [Option.isNone_iff_eq_none]) xs

/-! ## The units of the containers -/

theorem admits_empty_map {j : Data} :
    Admits env root (.map [] none false) j ↔ ∃ jfs, j = .map jfs := by
  constructor
  · intro h; cases h; exact ⟨_, rfl⟩
  · rintro ⟨jfs, rfl⟩
    exact .map (fun _ _ _ _ h => nomatch h) (fun _ _ _ h => nomatch h) (fun _ h => nomatch h)
      (fun h => nomatch h)

theorem admits_empty_list {j : Data} :
    Admits env root (.list [] none false) j ↔ ∃ xs, j = .list xs := by
  constructor
  · intro h; cases h; exact ⟨_, rfl⟩
  · rintro ⟨xs, rfl⟩
    exact .list (Nat.zero_le _) (fun h => nomatch h) (fun _ _ _ h _ => by simp at h)
      (fun _ h => nomatch h)

theorem admits_any_map {m : Val → Val → Val}
    (hm : ∀ a b j, Admits env root (m a b) j ↔ Admits env root a j ∧ Admits env root b j)
    (fs : List (String × Bool × Val)) (s : Option Val) (c : Bool) (j : Data) :
    Admits env root (meetMap m [] none false fs s c) j ↔
      Admits env root .any j ∧ Admits env root (.map fs s c) j := by
  rw [admits_meetMap hm, admits_empty_map]
  constructor
  · rintro ⟨_, h⟩; exact ⟨.any, h⟩
  · rintro ⟨_, h⟩
    refine ⟨?_, h⟩
    cases h; exact ⟨_, rfl⟩

theorem admits_map_any {m : Val → Val → Val}
    (hm : ∀ a b j, Admits env root (m a b) j ↔ Admits env root a j ∧ Admits env root b j)
    (fs : List (String × Bool × Val)) (s : Option Val) (c : Bool) (j : Data) :
    Admits env root (meetMap m fs s c [] none false) j ↔
      Admits env root (.map fs s c) j ∧ Admits env root .any j := by
  rw [admits_meetMap hm, admits_empty_map]
  constructor
  · rintro ⟨h, _⟩; exact ⟨h, .any⟩
  · rintro ⟨h, _⟩
    refine ⟨h, ?_⟩
    cases h; exact ⟨_, rfl⟩

theorem admits_any_list {m : Val → Val → Val}
    (hm : ∀ a b j, Admits env root (m a b) j ↔ Admits env root a j ∧ Admits env root b j)
    (items : List Val) (s : Option Val) (c : Bool) (j : Data) :
    Admits env root (meetList m [] none false items s c) j ↔
      Admits env root .any j ∧ Admits env root (.list items s c) j := by
  rw [admits_meetList hm, admits_empty_list]
  constructor
  · rintro ⟨_, h⟩; exact ⟨.any, h⟩
  · rintro ⟨_, h⟩
    refine ⟨?_, h⟩
    cases h; exact ⟨_, rfl⟩

theorem admits_list_any {m : Val → Val → Val}
    (hm : ∀ a b j, Admits env root (m a b) j ↔ Admits env root a j ∧ Admits env root b j)
    (items : List Val) (s : Option Val) (c : Bool) (j : Data) :
    Admits env root (meetList m items s c [] none false) j ↔
      Admits env root (.list items s c) j ∧ Admits env root .any j := by
  rw [admits_meetList hm, admits_empty_list]
  constructor
  · rintro ⟨h, _⟩; exact ⟨h, .any⟩
  · rintro ⟨h, _⟩
    refine ⟨h, ?_⟩
    cases h; exact ⟨_, rfl⟩

/-! ## Disjunction and preference -/

theorem admits_or_left {m : Val → Val → Val}
    (hm : ∀ a b j, Admits env root (m a b) j ↔ Admits env root a j ∧ Admits env root b j)
    (arms : List (ℕ × Val)) (b : Val) (j : Data) :
    Admits env root (mkOr (arms.map fun p => (p.1, m p.2 b))) j ↔
      Admits env root (.or arms) j ∧ Admits env root b j := by
  rw [admits_mkOr, admits_or_iff]
  constructor
  · rintro ⟨r, a, hmem, ha⟩
    obtain ⟨⟨r', a'⟩, hmem', he⟩ := List.mem_map.mp hmem
    simp only [Prod.mk.injEq] at he
    obtain ⟨rfl, rfl⟩ := he
    rw [hm] at ha
    exact ⟨⟨r', a', hmem', ha.1⟩, ha.2⟩
  · rintro ⟨⟨r, a, hmem, ha⟩, hb⟩
    exact ⟨r, m a b, List.mem_map.mpr ⟨(r, a), hmem, rfl⟩, (hm _ _ _).mpr ⟨ha, hb⟩⟩

theorem admits_or_right {m : Val → Val → Val}
    (hm : ∀ a b j, Admits env root (m a b) j ↔ Admits env root a j ∧ Admits env root b j)
    (a : Val) (arms : List (ℕ × Val)) (j : Data) :
    Admits env root (mkOr (arms.map fun p => (p.1, m a p.2))) j ↔
      Admits env root a j ∧ Admits env root (.or arms) j := by
  rw [admits_mkOr, admits_or_iff]
  constructor
  · rintro ⟨r, b, hmem, hb⟩
    obtain ⟨⟨r', b'⟩, hmem', he⟩ := List.mem_map.mp hmem
    simp only [Prod.mk.injEq] at he
    obtain ⟨rfl, rfl⟩ := he
    rw [hm] at hb
    exact ⟨hb.1, ⟨r', b', hmem', hb.2⟩⟩
  · rintro ⟨ha, ⟨r, b, hmem, hb⟩⟩
    exact ⟨r, m a b, List.mem_map.mpr ⟨(r, b), hmem, rfl⟩, (hm _ _ _).mpr ⟨ha, hb⟩⟩

theorem admits_pref_left {m : Val → Val → Val}
    (hm : ∀ a b j, Admits env root (m a b) j ↔ Admits env root a j ∧ Admits env root b j)
    (r : ℕ) (x b : Val) (j : Data) :
    Admits env root (mkOr [(r, m x b), (0, m x.super b)]) j ↔
      Admits env root (.pref r x) j ∧ Admits env root b j := by
  rw [admits_mkOr, admits_pref_iff]
  simp only [List.mem_cons, Prod.mk.injEq, List.not_mem_nil, or_false]
  constructor
  · rintro ⟨r', a, h, ha⟩
    rcases h with ⟨rfl, rfl⟩ | ⟨rfl, rfl⟩
    · rw [hm] at ha; exact ⟨.inl ha.1, ha.2⟩
    · rw [hm] at ha; exact ⟨.inr ha.1, ha.2⟩
  · rintro ⟨hx | hx, hb⟩
    · exact ⟨r, m x b, .inl ⟨rfl, rfl⟩, (hm _ _ _).mpr ⟨hx, hb⟩⟩
    · exact ⟨0, m x.super b, .inr ⟨rfl, rfl⟩, (hm _ _ _).mpr ⟨hx, hb⟩⟩

theorem admits_pref_right {m : Val → Val → Val}
    (hm : ∀ a b j, Admits env root (m a b) j ↔ Admits env root a j ∧ Admits env root b j)
    (a : Val) (r : ℕ) (y : Val) (j : Data) :
    Admits env root (mkOr [(r, m a y), (0, m a y.super)]) j ↔
      Admits env root a j ∧ Admits env root (.pref r y) j := by
  rw [admits_mkOr, admits_pref_iff]
  simp only [List.mem_cons, Prod.mk.injEq, List.not_mem_nil, or_false]
  constructor
  · rintro ⟨r', b, h, hb⟩
    rcases h with ⟨rfl, rfl⟩ | ⟨rfl, rfl⟩
    · rw [hm] at hb; exact ⟨hb.1, .inl hb.2⟩
    · rw [hm] at hb; exact ⟨hb.1, .inr hb.2⟩
  · rintro ⟨ha, hy | hy⟩
    · exact ⟨r, m a y, .inl ⟨rfl, rfl⟩, (hm _ _ _).mpr ⟨ha, hy⟩⟩
    · exact ⟨0, m a y.super, .inr ⟨rfl, rfl⟩, (hm _ _ _).mpr ⟨ha, hy⟩⟩

/-- A rider met with a value carries the meet of its own: the record
rides the result. -/
theorem admits_ride_left {m : Val → Val → Val}
    (hm : ∀ a b j, Admits env root (m a b) j ↔ Admits env root a j ∧ Admits env root b j)
    (k : Rider) (v : Val) (r : Record) (b : Val) (j : Data) :
    Admits env root (.ride k (m v b) r) j ↔ Admits env root (.ride k v r) j ∧ Admits env root b j := by
  constructor
  · intro h
    cases h with
    | ride h => exact ⟨.ride ((hm v b j).mp h).1, ((hm v b j).mp h).2⟩
  · rintro ⟨h, hb⟩
    cases h with
    | ride h => exact .ride ((hm v b j).mpr ⟨h, hb⟩)

theorem admits_ride_right {m : Val → Val → Val}
    (hm : ∀ a b j, Admits env root (m a b) j ↔ Admits env root a j ∧ Admits env root b j)
    (a : Val) (k : Rider) (v : Val) (r : Record) (j : Data) :
    Admits env root (.ride k (m a v) r) j ↔ Admits env root a j ∧ Admits env root (.ride k v r) j := by
  constructor
  · intro h
    cases h with
    | ride h => exact ⟨((hm a v j).mp h).1, .ride ((hm a v j).mp h).2⟩
  · rintro ⟨ha, h⟩
    cases h with
    | ride h => exact .ride ((hm a v j).mpr ⟨ha, h⟩)

theorem admits_nil_left (b : Val) (j : Data) :
    Admits env root .nil j ↔ Admits env root .nil j ∧ Admits env root b j :=
  ⟨(fun h => nomatch h), (fun h => h.1)⟩

theorem admits_nil_right (a : Val) (j : Data) :
    Admits env root .nil j ↔ Admits env root a j ∧ Admits env root .nil j :=
  ⟨(fun h => nomatch h), (fun h => h.2)⟩

end

/-! ## The meet -/

/-! ## Terms written alike -/

mutual
/-- Whether two terms are written alike, letter for letter. -/
def Val.beq : Val → Val → Bool
  | .integer, .integer | .float, .float | .biginteger, .biginteger | .bigdecimal, .bigdecimal
  | .number, .number | .string, .string | .anyString, .anyString | .boolean, .boolean
  | .any, .any | .nil, .nil => true
  | .lit s, .lit t => decide (s = t)
  | .min a, .min b => decide (a = b)
  | .max a, .max b => decide (a = b)
  | .above a, .above b => decide (a = b)
  | .beneath a, .beneath b => decide (a = b)
  | .neq a, .neq b => decide (a = b)
  | .mulof a, .mulof b => decide (a = b)
  | .len c, .len d => c.beq d
  | .unique a, .unique b => decide (a = b)
  | .re a, .re b => decide (a = b)
  | .format a, .format b => decide (a = b)
  | .map fs s c, .map fs' s' c' => beqFields fs fs' && beqSpread s s' && decide (c = c')
  | .list is s c, .list is' s' c' => beqItems is is' && beqSpread s s' && decide (c = c')
  | .or as, .or bs => beqArms as bs
  | .pref r x, .pref r' y => decide (r = r') && x.beq y
  | .meet a b, .meet c d => a.beq c && b.beq d
  | .alias n, .alias m => decide (n = m)
  | .path p, .path q => decide (p = q)
  | .nof n cs, .nof n' cs' => n.beq n' && beqItems cs cs'
  | .must c m, .must c' m' => c.beq c' && decide (m = m')
  | .when c t e, .when c' t' e' => c.beq c' && t.beq t' && beqSpread e e'
  | .contains c n, .contains c' n' => c.beq c' && n.beq n'
  | .rest t cs, .rest t' cs' => t.beq t' && beqCovers cs cs'
  | .select s as d, .select s' as' d' => s.beq s' && beqPairs as as' && beqSpread d d'
  | .filter s c, .filter s' c' => s.beq s' && c.beq c'
  | .ride k v r, .ride k' v' r' => decide (k = k') && v.beq v' && decide (r = r')
  | .key, .key => true
  | .keyUp m, .keyUp n => decide (m = n)
  | .call f args, .call g bs => decide (f = g) && beqItems args bs
  | _, _ => false
termination_by structural a _ => a

def beqFields : List (String × Bool × Val) → List (String × Bool × Val) → Bool
  | [], [] => true
  | (k, o, v) :: fs, (k', o', v') :: fs' => decide (k = k') && decide (o = o') && v.beq v' && beqFields fs fs'
  | _, _ => false
termination_by structural fs _ => fs

def beqItems : List Val → List Val → Bool
  | [], [] => true
  | v :: vs, w :: ws => v.beq w && beqItems vs ws
  | _, _ => false
termination_by structural vs _ => vs

def beqSpread : Option Val → Option Val → Bool
  | none, none => true
  | some s, some t => s.beq t
  | _, _ => false
termination_by structural s _ => s

def beqPairs : List (Val × Val) → List (Val × Val) → Bool
  | [], [] => true
  | (p, r) :: ps, (p', r') :: ps' => p.beq p' && r.beq r' && beqPairs ps ps'
  | _, _ => false
termination_by structural ps _ => ps

def beqCovers : List Cover → List Cover → Bool
  | [], [] => true
  | (c, k, m) :: cs, (c', k', m') :: cs' =>
    beqSpread c c' && beqSpread k k' && beqSpread m m' && beqCovers cs cs'
  | _, _ => false
termination_by structural cs _ => cs

def beqArms : List (ℕ × Val) → List (ℕ × Val) → Bool
  | [], [] => true
  | (r, a) :: as, (r', b) :: bs => decide (r = r') && a.beq b && beqArms as bs
  | _, _ => false
termination_by structural as _ => as
end

/-- A term met with a meet, `a & (b₁ & b₂)`: `a` meets `b₁`, and where
that combined or refused something, the result meets `b₂`. Where it
left the pair as written, two atoms with nothing to say to each other,
`a` meets `b₂` instead, and `b₁` meets what that gives where it gave
anything; where `a` has nothing to say to either, the three stay as
written. So each atom is tried against each other once, and the two
splitting rules never take a pair up in another association, which
they would otherwise do until the budget ran out. -/
def meetRight (rec : Val → Val → Val) (a b₁ b₂ : Val) : Val :=
  let x := rec a b₁
  if x.beq (.meet a b₁) then
    let y := rec a b₂
    if y.beq (.meet a b₂) then .meet a (.meet b₁ b₂) else rec b₁ y
  else rec x b₂

/-- One step of the meet, given the meet `lm` of a literal with a term
and the meet `rec` of smaller terms: `nil` is the zero, a meet on either
side is met one side at a time, a disjunction distributes over its arms,
a preference alone is `x | super(x)`, two maps and two lists merge,
`any` is the unit of each container, and what remains is `meetBase`. -/
def meetStep (lm : Scalar → Val → Val) (rec : Val → Val → Val) (a b : Val) : Val :=
  match a, b with
  | .nil, _ | _, .nil => .nil
  | .meet a₁ a₂, b => rec a₁ (rec a₂ b)
  | a, .meet b₁ b₂ => meetRight rec a b₁ b₂
  | .ride k v r, b => .ride k (rec v b) r
  | a, .ride k v r => .ride k (rec a v) r
  | .or arms, b => mkOr (arms.map fun p => (p.1, rec p.2 b))
  | a, .or arms => mkOr (arms.map fun p => (p.1, rec a p.2))
  | .pref r x, b => mkOr [(r, rec x b), (0, rec x.super b)]
  | a, .pref r y => mkOr [(r, rec a y), (0, rec a y.super)]
  | .map fs₁ s₁ c₁, .map fs₂ s₂ c₂ => meetMap rec fs₁ s₁ c₁ fs₂ s₂ c₂
  | .any, .map fs s c => meetMap rec [] none false fs s c
  | .map fs s c, .any => meetMap rec fs s c [] none false
  | .list is₁ s₁ c₁, .list is₂ s₂ c₂ => meetList rec is₁ s₁ c₁ is₂ s₂ c₂
  | .any, .list items s c => meetList rec [] none false items s c
  | .list items s c, .any => meetList rec items s c [] none false
  | a, b => meetBase lm a b

/-- The meet of two terms, within a budget of steps. A budget run out
leaves the pair as it was written, which admits what both sides admit
all the same. -/
def meetF : ℕ → Val → Val → Val
  | 0, a, b => .meet a b
  | n + 1, a, b => meetStep litMeet (meetF n) a b

section
variable {env : Env} {root : Data}

theorem admits_meetRight {rec : Val → Val → Val}
    (hr : ∀ a b j, Admits env root (rec a b) j ↔ Admits env root a j ∧ Admits env root b j)
    (a b₁ b₂ : Val) (j : Data) :
    Admits env root (meetRight rec a b₁ b₂) j ↔
      Admits env root a j ∧ Admits env root (.meet b₁ b₂) j := by
  simp only [meetRight]
  split
  · split
    · exact admits_meet_iff
    · simp only [hr, admits_meet_iff]
      constructor
      · intro ⟨h₁, ha, h₂⟩; exact ⟨ha, h₁, h₂⟩
      · intro ⟨ha, h₁, h₂⟩; exact ⟨h₁, ha, h₂⟩
  · simp only [hr, admits_meet_iff, and_assoc]

set_option maxHeartbeats 4000000 in
/-- A step of the meet admits what both of its sides admit, given that
the meets it is built from do. -/
theorem admits_meetStep {lm : Scalar → Val → Val} {rec : Val → Val → Val}
    (hl : ∀ s b j, Admits env root (lm s b) j ↔ Admits env root (.lit s) j ∧ Admits env root b j)
    (hr : ∀ a b j, Admits env root (rec a b) j ↔ Admits env root a j ∧ Admits env root b j)
    (a b : Val) (j : Data) :
    Admits env root (meetStep lm rec a b) j ↔ Admits env root a j ∧ Admits env root b j := by
  cases a <;> cases b <;> (unfold meetStep; dsimp only) <;> first
    | exact admits_meetBase hl ..
    | exact admits_nil_left ..
    | exact admits_nil_right ..
    | exact admits_meetMap hr ..
    | exact admits_meetList hr ..
    | exact admits_any_map hr ..
    | exact admits_map_any hr ..
    | exact admits_any_list hr ..
    | exact admits_list_any hr ..
    | exact admits_or_left hr ..
    | exact admits_or_right hr ..
    | exact admits_pref_left hr ..
    | exact admits_pref_right hr ..
    | exact admits_meetRight hr ..
    | exact admits_ride_left hr ..
    | exact admits_ride_right hr ..
    | (simp only [hr, admits_meet_iff, and_assoc, iff_self]; done)

/-- Whatever the budget, the meet admits what both of its sides admit. -/
theorem admits_meetF : ∀ (n : ℕ) (a b : Val) (j : Data),
    Admits env root (meetF n a b) j ↔ Admits env root a j ∧ Admits env root b j
  | 0, _, _, _ => by simp only [meetF]; exact admits_meet_iff
  | n + 1, a, b, j => by simp only [meetF]; exact admits_meetStep admits_litMeet (admits_meetF n) a b j

end

/-- `a & b`, computed: the budget grows with the two terms faster than
the steps do. -/
def meet (a b : Val) : Val := meetF (2 ^ (a.size + b.size)) a b

/-- The meet admits what both of its sides admit, which is what admits
`meet` into the definition. -/
theorem admits_meet {env : Env} {root : Data} (a b : Val) (j : Data) :
    Admits env root (meet a b) j ↔ Admits env root a j ∧ Admits env root b j :=
  admits_meetF _ a b j

/-- The computed meet and the written one admit alike. -/
theorem admits_meet_eq {env : Env} {root : Data} (a b : Val) (j : Data) :
    Admits env root (meet a b) j ↔ Admits env root (.meet a b) j := by
  rw [admits_meet, admits_meet_iff]

/-- A term in the shape generation reads: met with `any`, the unit,
so that every meet in it is computed and every dead arm dropped. -/
def normalise (v : Val) : Val := meet .any v

/-- A literal is its own normal form. -/
theorem normalise_lit (s : Scalar) : normalise (.lit s) = .lit s := rfl

theorem admits_normalise {env : Env} {root : Data} (v : Val) (j : Data) :
    Admits env root (normalise v) j ↔ Admits env root v j := by
  rw [normalise, admits_meet]
  exact ⟨fun h => h.2, fun h => ⟨.any, h⟩⟩

end Aontu
