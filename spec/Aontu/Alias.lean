import Aontu.Names
import Aontu.Output

/-!
# Declarations in the meet

A document reads as its expansion: a reference to a name that is not
recursive is replaced by the meet of the name's bodies, read the same
way, and a reference to a recursive name stays as written, a residual.
A residual expands by one level each time the meet brings it against
concrete structure, a scalar, a kind, a bound, a literal, a map or a
list, and never against `any`, another reference or a connective, so a
recursion unfolds as far as the data goes and no further. Where no data
reaches it, a residual generates nothing, which `Gen` says of an alias.
-/

namespace Aontu

/-! ## The expansion -/

/-- The size of the bodies declared, summed. -/
def Decls.bodiesSize (ds : Decls) : ℕ := ds.foldl (fun acc d => acc + d.2.size) 0

/-- The expansion of a term, within `k` turns: a reference to a name
that is not recursive is replaced by the meet of its bodies, expanded in
turn; a reference to a recursive name, or to no name, stays. -/
def expandF (ds : Decls) : ℕ → Val → Val
  | 0, v => v
  | k + 1, v =>
    match v with
    | .alias n =>
      if ds.recursiveB n then .alias n
      else
        match ds.env n with
        | some b => expandF ds k b
        | none => .alias n
    | .len c => .len (expandF ds k c)
    | .map fs spread closed =>
      .map (fs.map fun f => (f.1, f.2.1, expandF ds k f.2.2)) (spread.map (expandF ds k)) closed
    | .list items spread closed =>
      .list (items.map (expandF ds k)) (spread.map (expandF ds k)) closed
    | .or arms => .or (arms.map fun p => (p.1, expandF ds k p.2))
    | .pref r x => .pref r (expandF ds k x)
    | .meet a b => .meet (expandF ds k a) (expandF ds k b)
    | v => v

/-- The expansion of a term: enough turns for every chain of names that
are not recursive, which repeats no name, and for the structure each
body adds. -/
def expand (ds : Decls) (v : Val) : Val :=
  expandF ds ((ds.length + 1) * (ds.bodiesSize + v.size + 1)) v

/-- How a document reads: its term expanded. -/
abbrev Decls.read (ds : Decls) (S : Val) : Val := expand ds S

/-- The environment a document reads under: each name's bodies, met and
expanded. -/
def Decls.envE (ds : Decls) : Env := fun n => (ds.env n).map (expand ds)

theorem Decls.envE_eq {ds : Decls} {n : String} {b : Val} (h : ds.env n = some b) :
    ds.envE n = some (expand ds b) := by
  simp only [Decls.envE, h, Option.map_some']

/-! ## The meet with the declarations -/

/-- Whether a term is concrete structure, which a residual expands
against: everything but `any`, `nil`, a reference and a connective. -/
def Val.concrete : Val → Bool
  | .any | .nil | .alias _ | .path _ | .meet _ _ | .or _ | .pref _ _ => false
  | _ => true

/-- The name a term refers to, where it is a reference. -/
def Val.alias? : Val → Option String
  | .alias n => some n
  | _ => none

theorem Val.alias?_some {v : Val} {n : String} : v.alias? = some n ↔ v = .alias n := by
  cases v <;> simp [Val.alias?]

/-- A step of the meet with the declarations: a residual against
concrete structure expands by one level, and every other pair takes a
step of the meet. -/
def meetStepA (ds : Decls) (rec : Val → Val → Val) (a b : Val) : Val :=
  match a.alias?, b.alias? with
  | some k, _ =>
    if b.concrete then
      match ds.env k with
      | some body => rec (expand ds body) b
      | none => meetStep rec a b
    else meetStep rec a b
  | none, some k =>
    if a.concrete then
      match ds.env k with
      | some body => rec a (expand ds body)
      | none => meetStep rec a b
    else meetStep rec a b
  | none, none => meetStep rec a b

/-- The meet with the declarations, within a budget of steps. -/
def meetA (ds : Decls) : ℕ → Val → Val → Val
  | 0, a, b => .meet a b
  | n + 1, a, b => meetStepA ds (meetA ds n) a b

section
variable {ds : Decls} {root : Data}

theorem admits_alias_iff {k : String} {body : Val} {j : Data} (h : ds.env k = some body) :
    Admits ds.envE root (.alias k) j ↔ Admits ds.envE root (expand ds body) j := by
  constructor
  · intro ha
    cases ha with
    | alias he hb =>
      rw [Decls.envE_eq h] at he
      exact Option.some.inj he ▸ hb
  · exact fun hb => .alias (Decls.envE_eq h) hb

theorem admits_meetStepA {rec : Val → Val → Val}
    (hr : ∀ a b j, Admits ds.envE root (rec a b) j ↔ Admits ds.envE root a j ∧ Admits ds.envE root b j)
    (a b : Val) (j : Data) :
    Admits ds.envE root (meetStepA ds rec a b) j ↔ Admits ds.envE root a j ∧ Admits ds.envE root b j := by
  unfold meetStepA
  cases ha : a.alias? with
  | some k =>
    obtain rfl := Val.alias?_some.mp ha
    cases hc : b.concrete with
    | false => exact admits_meetStep hr _ _ _
    | true =>
      simp only [↓reduceIte]
      cases he : ds.env k with
      | none => exact admits_meetStep hr _ _ _
      | some body => rw [hr, admits_alias_iff he]
  | none =>
    cases hb : b.alias? with
    | some k =>
      obtain rfl := Val.alias?_some.mp hb
      cases hc : a.concrete with
      | false => exact admits_meetStep hr _ _ _
      | true =>
        simp only [↓reduceIte]
        cases he : ds.env k with
        | none => exact admits_meetStep hr _ _ _
        | some body => rw [hr, admits_alias_iff he]
    | none => exact admits_meetStep hr _ _ _

/-- Whatever the budget, the meet with the declarations admits what both
of its sides admit. -/
theorem admits_meetA : ∀ (n : ℕ) (a b : Val) (j : Data),
    Admits ds.envE root (meetA ds n a b) j ↔ Admits ds.envE root a j ∧ Admits ds.envE root b j
  | 0, _, _, _ => by simp only [meetA]; exact admits_meet_iff
  | n + 1, a, b, j => by simp only [meetA]; exact admits_meetStepA (admits_meetA n) a b j

end

/-- The size of the bodies declared, each expanded, summed: what a
residual can add to a term at each level of the data. -/
def Decls.expandedSize (ds : Decls) : ℕ := ds.foldl (fun acc d => acc + (expand ds d.2).size) 0

/-- `a & b` under the declarations, computed: the budget grows with the
two terms and with what their residuals can expand to. -/
def meetD (ds : Decls) (a b : Val) : Val :=
  meetA ds (2 ^ ((a.size + b.size) * (ds.expandedSize + 1))) a b

theorem admits_meetD {ds : Decls} {root : Data} (a b : Val) (j : Data) :
    Admits ds.envE root (meetD ds a b) j ↔ Admits ds.envE root a j ∧ Admits ds.envE root b j :=
  admits_meetA _ a b j

/-- The normal form under the declarations: met with `any`, so that
every meet is computed, every dead arm dropped, and every residual the
term's own structure reaches expanded. -/
def normaliseD (ds : Decls) (v : Val) : Val := meetD ds .any v

theorem admits_normaliseD {ds : Decls} {root : Data} (v : Val) (j : Data) :
    Admits ds.envE root (normaliseD ds v) j ↔ Admits ds.envE root v j := by
  rw [normaliseD, admits_meetD]
  exact ⟨fun h => h.2, fun h => ⟨.any, h⟩⟩

/-! ## Without declarations -/

theorem meetStepA_nil (rec : Val → Val → Val) (a b : Val) : meetStepA [] rec a b = meetStep rec a b := by
  unfold meetStepA
  cases a.alias? <;> cases b.alias? <;> simp [Decls.env, Decls.bodies]

theorem meetA_nil : ∀ (n : ℕ) (a b : Val), meetA [] n a b = meetF n a b
  | 0, _, _ => rfl
  | n + 1, a, b => by
    simp only [meetA, meetF, meetStepA_nil]
    congr 1
    funext a b
    exact meetA_nil n a b

theorem meetD_nil (a b : Val) : meetD [] a b = meet a b := by
  simp only [meetD, meet, Decls.expandedSize, List.foldl_nil, Nat.zero_add, Nat.mul_one, meetA_nil]

theorem normaliseD_nil (v : Val) : normaliseD [] v = normalise v := meetD_nil .any v

/-! ## What evaluation singles out, under the declarations -/

/-- What evaluation singles out for `v` under the declarations: what
its normal form generates. -/
def OutputD (ds : Decls) (root : Data) (v : Val) (j : Data) : Prop :=
  Gen ds.envE root (normaliseD ds v) j

/-- What evaluation singles out under the declarations is an instance. -/
theorem outputD_admits {ds : Decls} {root : Data} (v : Val) (j : Data) (h : OutputD ds root v j) :
    Admits ds.envE root v j :=
  (admits_normaliseD v j).mp (gen_admits _ j h)

theorem outputD_unique {ds : Decls} {root : Data} {v : Val} {j j' : Data}
    (h : OutputD ds root v j) (h' : OutputD ds root v j') : j = j' :=
  gen_unique _ _ _ h h'

/-- What evaluation singles out under the declarations, computed. -/
def outputD (ds : Decls) (v : Val) : Option Data := gen (normaliseD ds v)

theorem outputD_iff {ds : Decls} {root : Data} {v : Val} (h : (normaliseD ds v).Checkable) (j : Data) :
    outputD ds v = some j ↔ OutputD ds root v j :=
  gen_iff h j

end Aontu
