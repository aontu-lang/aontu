import Aontu.Admits

/-!
# The order

`a ⊑[env] b`: every instance of `a` is an instance of `b`, which is the
question `aontu subsume b a` answers. The meet is the order's greatest
lower bound, `any` and `nil` are its ends, and two declarations of one
key are one declaration of their meet. A `subsume` is held to the
order by a contract, which names no algorithm.
-/

namespace Aontu

/-- Every document `a` admits, `b` admits, each read as a whole. -/
def Le (env : Env) (a b : Val) : Prop := ∀ j, Instance env a j → Instance env b j

notation:50 a:51 " ⊑[" env "] " b:51 => Le env a b

theorem Le.refl (env : Env) (a : Val) : a ⊑[env] a := fun _ h => h

theorem Le.trans {env : Env} {a b c : Val} (h₁ : a ⊑[env] b) (h₂ : b ⊑[env] c) :
    a ⊑[env] c :=
  fun j h => h₂ j (h₁ j h)

theorem le_any (env : Env) (a : Val) : a ⊑[env] .any := fun _ _ => .any

theorem nil_le (env : Env) (a : Val) : .nil ⊑[env] a := fun _ h => nomatch h

/-! ## The meet is the greatest lower bound -/

theorem meet_le_left (env : Env) (a b : Val) : .meet a b ⊑[env] a := by
  intro _ h; cases h with | meet h _ => exact h

theorem meet_le_right (env : Env) (a b : Val) : .meet a b ⊑[env] b := by
  intro _ h; cases h with | meet _ h => exact h

theorem le_meet {env : Env} {a b c : Val} (ha : c ⊑[env] a) (hb : c ⊑[env] b) :
    c ⊑[env] .meet a b :=
  fun j h => .meet (ha j h) (hb j h)

/-- `string & empty()` admits `""`, which `string` refuses, so it is no
meet with `string`: no meet with `string` admits `""`. It is a form of
its own. -/
theorem no_meet_with_string_admits_empty (env : Env) (root : Json) (b : Val) :
    ¬ Admits env root (.meet .string b) (.str "") := by
  intro h
  cases h with
  | meet hs _ => cases hs with | string hne => exact hne rfl

/-! ## Two declarations of one key -/

/-- ADR-045: `{k?: a} & {k: b}` is `{k: a & b}`. Two declarations of one
key admit what one declaration of their meet admits, and the key is
optional only where every declaration says so. -/
theorem merge_exact (env : Env) (root : Json) (k : String) (o₁ o₂ : Bool) (v₁ v₂ : Val)
    (j : Json) :
    Admits env root (.map [(k, o₁ && o₂, .meet v₁ v₂)] none false) j ↔
      Admits env root (.meet (.map [(k, o₁, v₁)] none false) (.map [(k, o₂, v₂)] none false))
        j := by
  constructor
  · intro h
    cases h with
    | map hp ha _ _ =>
      refine .meet (.map ?_ ?_ (fun _ h => nomatch h) (fun h => nomatch h))
        (.map ?_ ?_ (fun _ h => nomatch h) (fun h => nomatch h))
      · intro k' o v x hm hx
        cases List.mem_singleton.mp hm
        cases hp _ _ _ x (List.mem_singleton.mpr rfl) hx with | meet h _ => exact h
      · intro k' o v hm hx
        cases List.mem_singleton.mp hm
        have h := ha _ _ _ (List.mem_singleton.mpr rfl) hx
        simp only [Bool.and_eq_true] at h
        exact h.1
      · intro k' o v x hm hx
        cases List.mem_singleton.mp hm
        cases hp _ _ _ x (List.mem_singleton.mpr rfl) hx with | meet _ h => exact h
      · intro k' o v hm hx
        cases List.mem_singleton.mp hm
        have h := ha _ _ _ (List.mem_singleton.mpr rfl) hx
        simp only [Bool.and_eq_true] at h
        exact h.2
  · intro h
    cases h with
    | meet h₁ h₂ =>
      cases h₁ with
      | map hp₁ ha₁ _ _ =>
        cases h₂ with
        | map hp₂ ha₂ _ _ =>
          refine .map ?_ ?_ (fun _ h => nomatch h) (fun h => nomatch h)
          · intro k' o v x hm hx
            cases List.mem_singleton.mp hm
            exact .meet (hp₁ _ _ _ x (List.mem_singleton.mpr rfl) hx)
              (hp₂ _ _ _ x (List.mem_singleton.mpr rfl) hx)
          · intro k' o v hm hx
            cases List.mem_singleton.mp hm
            simp [ha₁ _ _ _ (List.mem_singleton.mpr rfl) hx,
              ha₂ _ _ _ (List.mem_singleton.mpr rfl) hx]

/-! ## What any `subsume` must answer -/

/-- The answers `aontu subsume` gives about two documents that stand. -/
inductive Subsumption where
  | subsumes
  | doesNotSubsume
  | undecided

/-- The contract on an implementation: `subsumes` only where the order
holds, `doesNotSubsume` only where it fails, and `undecided` anywhere.
`Le` quantifies over every document, infinitely many, so the contract
says what a correct answer is and leaves how to reach one open. -/
def SubsumeCorrect (env : Env) (subsume : Val → Val → Subsumption) : Prop :=
  ∀ general specific,
    (subsume general specific = .subsumes → specific ⊑[env] general) ∧
    (subsume general specific = .doesNotSubsume → ¬ specific ⊑[env] general)

/-- Where the order holds, no correct `subsume` answers
`doesNotSubsume`. -/
theorem never_no_when_le {env : Env} {sub : Val → Val → Subsumption}
    (h : SubsumeCorrect env sub) {a b : Val} (hle : b ⊑[env] a) :
    sub a b ≠ .doesNotSubsume :=
  fun hno => (h a b).2 hno hle

end Aontu
