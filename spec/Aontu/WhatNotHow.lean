/-!
# What, not how

Three things a definition fixes without saying how to compute them: what a
value admits (as inference rules, recursion included), what any `subsume`
must answer, and what an alias that names only itself means.
-/

namespace WhatNotHow

inductive Json where
  | null
  | bool (b : Bool)
  | int (n : Int)
  | str (s : String)
  | obj (fs : List (String × Json))

def lookup (k : String) : List (String × Json) → Option Json
  | [] => none
  | (k', v) :: fs => if k = k' then some v else lookup k fs

def Json.get? : Json → String → Option Json
  | .obj fs, k => lookup k fs
  | _, _ => none

def Json.isObj : Json → Bool
  | .obj _ => true
  | _ => false

inductive Val where
  | top                                       -- `any`
  | int                                       -- `integer`
  | str                                       -- `string`
  | anyStr                                    -- `string & empty()`
  | field (k : String) (opt : Bool) (v : Val) -- a map holding `k: v`, or `k?: v`
  | meet (a b : Val)                          -- `a & b`
  | ref (name : String)                       -- `%name`

/-! ## 1. What a value admits, as inference rules

Each constructor is one rule: if the premises hold, the conclusion holds.
`Admits env v j` holds exactly when some finite tree of these rules proves
it. Nothing here says in what order to try rules, how to merge two maps,
when to expand an alias, or how deep to go. -/

inductive Admits (env : String → Val) : Val → Json → Prop
  | top {j : Json} :
      Admits env .top j
  | int {n : Int} :
      n.natAbs ≤ 9007199254740992 → Admits env .int (.int n)
  | str {s : String} :
      s ≠ "" → Admits env .str (.str s)
  | anyStr {s : String} :
      Admits env .anyStr (.str s)
  | absent {k : String} {v : Val} {j : Json} :
      j.isObj = true → j.get? k = none → Admits env (.field k true v) j
  | present {k : String} {opt : Bool} {v : Val} {j x : Json} :
      j.isObj = true → j.get? k = some x → Admits env v x →
      Admits env (.field k opt v) j
  | meet {a b : Val} {j : Json} :
      Admits env a j → Admits env b j → Admits env (.meet a b) j
  | ref {name : String} {j : Json} :
      Admits env (env name) j → Admits env (.ref name) j

/-! ## 2. Recursion: `%T = {n?: %T, v?: integer}`

The `ref` rule is the whole of recursion. A document is admitted when a
finite proof exists, and a JSON document is finite, so the proof follows
the data down and stops where the data stops. -/

abbrev T : Val := .meet (.field "n" true (.ref "T")) (.field "v" true .int)

def env : String → Val := fun _ => T

/-- `{"n": {"v": 1}}` is a `%T`. The proof is the derivation itself. -/
example : Admits env T (.obj [("n", .obj [("v", .int 1)])]) :=
  .meet
    (.present rfl rfl
      (.ref (.meet (.absent rfl rfl) (.present rfl rfl (.int (by decide))))))
    (.absent rfl rfl)

/-- `{"v": "x"}` is not: no derivation exists. -/
example : ¬ Admits env T (.obj [("v", .str "x")]) := by
  intro h
  cases h with
  | meet _ hv =>
    cases hv with
    | absent _ hk => simp [Json.get?, lookup] at hk
    | present _ hk hx =>
      simp [Json.get?, lookup] at hk
      subst hk
      cases hx

/-! ## 3. A meaning the definition decides: `%U = %U`

Read as rules, `%U` is admitted only through `%U` again, so no finite proof
exists and `%U` admits nothing. That reading is the choice of `inductive`
(the least solution); the greatest would admit everything. The ports
answer `unify_cycle`, class `budget`: the same verdict, reached by running
out of steps rather than from a meaning. -/

def envU : String → Val := fun _ => .ref "U"

theorem loop_admits_nothing (j : Json) : ¬ Admits envU (.ref "U") j := by
  intro h
  generalize hv : Val.ref "U" = v at h
  induction h with
  | ref _ ih => exact ih rfl
  | top => cases hv
  | int _ => cases hv
  | str _ => cases hv
  | anyStr => cases hv
  | absent _ _ => cases hv
  | present _ _ _ _ => cases hv
  | meet _ _ _ _ => cases hv

/-! ## 4. What any `subsume` must answer

`Le env a b` quantifies over every JSON document, infinitely many, so it is
not something to run. `SubsumeCorrect` is a contract on an implementation:
a `yes` must be true and a `no` must be true; `undecided` is always
allowed. It names no algorithm, and many satisfy it. -/

def Le (env : String → Val) (a b : Val) : Prop :=
  ∀ j, Admits env a j → Admits env b j

inductive Verdict
  | yes
  | no
  | undecided

def SubsumeCorrect (env : String → Val) (subsume : Val → Val → Verdict) : Prop :=
  ∀ general specific,
    (subsume general specific = .yes → Le env specific general) ∧
    (subsume general specific = .no → ¬ Le env specific general)

/-- One implementation: never commit. Correct, and useless. -/
def subsumeNever : Val → Val → Verdict := fun _ _ => .undecided

theorem subsumeNever_correct (env : String → Val) :
    SubsumeCorrect env subsumeNever := by
  intro _ _; simp [subsumeNever]

/-- Another: `any` subsumes everything. Correct, and a little less useless. -/
def subsumeTop : Val → Val → Verdict
  | .top, _ => .yes
  | _, _ => .undecided

theorem subsumeTop_correct (env : String → Val) :
    SubsumeCorrect env subsumeTop := by
  intro g _
  cases g <;> simp [subsumeTop]
  exact fun _ _ => .top

/-- A wrong one: it says `{k: any}` subsumes `{k?: any}`. -/
def subsumeWrong : Val → Val → Verdict
  | .field _ false _, .field _ true _ => .yes
  | _, _ => .undecided

/-- The definition refutes it, with `{}` as the witness, and no engine run. -/
theorem subsumeWrong_incorrect : ¬ SubsumeCorrect (fun _ => .top) subsumeWrong := by
  intro h
  have hle := (h (.field "x" false .top) (.field "x" true .top)).1 rfl
  have h₁ : Admits (fun _ => .top) (.field "x" true .top) (.obj []) := .absent rfl rfl
  cases hle _ h₁ with
  | present _ hk _ => simp [Json.get?, lookup] at hk

/-- Two values with the same instances: no correct `subsume` answers `no`.
`subsume 'string & empty()' 'empty()'`, which answers `does_not_subsume`
in both ports today, is refuted by this as soon as the definition gives
the two spellings one meaning. -/
theorem never_no_when_le (env : String → Val) (sub : Val → Val → Verdict)
    (h : SubsumeCorrect env sub) (a b : Val) (hle : Le env b a) :
    sub a b ≠ .no :=
  fun hno => (h a b).2 hno hle

end WhatNotHow
