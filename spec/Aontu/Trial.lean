import Aontu.Admits

/-!
# Trial schemas

`nof` and `when` try a schema against an instance rather than meet it,
and ask whether the trial fails, which a rule of `Admits` cannot say
about itself: Lean's kernel refuses a rule that mentions its own
negation. The trials live in a layer above `Admits`, defined by
recursion on the trial, and for now that layer sits at the top of a
document only.
-/

namespace Aontu

/-- A trial schema. -/
inductive Trial where
  | is (v : Val)                     -- a value, tried
  | when (c t e : Trial)             -- `when(c, t, e)`; `when(c, t)` is `when(c, t, any)`
  | nof (n : Val) (cs : List Trial)  -- `nof(n, c₁, …, cₖ)`

mutual
/-- `Holds env root c j`: the trial `c` passes on `j`. `nof(n, …)`
passes where `n` admits the number of its trials that pass. -/
def Holds (env : Env) (root : Data) : Trial → Data → Prop
  | .is v, j => Admits env root v j
  | .when c t e, j =>
    (Holds env root c j ∧ Holds env root t j) ∨ (¬ Holds env root c j ∧ Holds env root e j)
  | .nof n cs, j => ∃ k, Count env root cs j k ∧ Admits env root n (.int k)

/-- `Count env root cs j k`: exactly `k` of the trials `cs` pass on `j`. -/
def Count (env : Env) (root : Data) : List Trial → Data → Nat → Prop
  | [], _, k => k = 0
  | c :: cs, j, k =>
    (Holds env root c j ∧ ∃ k', k = k' + 1 ∧ Count env root cs j k') ∨
      (¬ Holds env root c j ∧ Count env root cs j k)
end

/-- A list of trials has one count at most. -/
theorem Count.unique {env : Env} {root : Data} :
    ∀ {cs : List Trial} {j : Data} {k k' : Nat},
      Count env root cs j k → Count env root cs j k' → k = k'
  | [], _, _, _, h, h' => by simp only [Count] at h h'; omega
  | _ :: _, _, _, _, h, h' => by
    simp only [Count] at h h'
    rcases h with ⟨hc, m, rfl, hm⟩ | ⟨hc, hm⟩ <;>
      rcases h' with ⟨hc', m', rfl, hm'⟩ | ⟨hc', hm'⟩
    · rw [Count.unique hm hm']
    · exact absurd hc hc'
    · exact absurd hc' hc
    · exact Count.unique hm hm'

end Aontu
