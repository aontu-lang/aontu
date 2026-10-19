import Aontu.Syntax

/-!
# What a value admits, and what it refuses

`Judge env root b v j`: the value `v`, tried on the data `j`, comes out
`b`, where `env` holds the alias declarations and `root` is the whole
value `j` is found inside. `true` is admission, `j` an instance of `v`,
written `Admits env root v j`; `false` is refusal, `v` ruling `j` out,
written `Refuses env root v j`. Each rule is one constructor, and a
judgement holds exactly when a finite derivation of it exists, so
recursion through an alias follows the data down and stops where the
data stops. The two polarities are one relation so that a rule can read
a refusal where it needs one: a trial schema counts the branches that
refuse a value as well as those that admit it, which a rule of
admission alone cannot say, since Lean's kernel refuses a rule that
mentions its own negation. No rule reads `root`: a path reads by
declaration, in `spec/Aontu/Paths.lean`, and `root` rides the relation
for the profiles of subsumption to come. `nil` admits nothing and
refuses everything; `any` admits everything and refuses nothing; a name
declared as itself alone, `%U = %U`, admits nothing and refuses nothing,
since no derivation of either is finite.

Refusal is the complement of admission, rule for rule: `judge_unique`
proves that no value both admits and refuses a datum, and `checkR_iff`,
in `spec/Aontu/Alias.lean`, that the checker's `true` is admission and
its `false` refusal, so that a value the checker can read judges every
datum one way or the other.
-/

namespace Aontu

/-- What the definition leaves to the engines: which strings a pattern
matches, and which strings a format, a name or a grammar, reads to its
end. Each is a predicate on two strings, and nothing here says what
either holds of, so a theorem about `re` or `format` holds whatever they
are. -/
structure Host where
  pattern : String → String → Prop
  format : String → String → Prop

instance : Inhabited Host := ⟨⟨fun _ _ => True, fun _ _ => True⟩⟩

/-- The predicates behind `re` and `format`: a constant no proof can
unfold, so they are read and never computed. -/
opaque host : Host

inductive Judge (env : Env) (root : Data) : Bool → Val → Data → Prop
  /-- A kind admits the values of its kind, and refuses every other
  value. -/
  | integer {x : Integer} : Judge env root true .integer (.num (.integer x))
  | integerNot {j : Data} : (∀ x : Integer, j ≠ .num (.integer x)) → Judge env root false .integer j
  | float {x : Float} : Judge env root true .float (.num (.float x))
  | floatNot {j : Data} : (∀ x : Float, j ≠ .num (.float x)) → Judge env root false .float j
  | biginteger {x : BigInteger} : Judge env root true .biginteger (.num (.biginteger x))
  | bigintegerNot {j : Data} :
      (∀ x : BigInteger, j ≠ .num (.biginteger x)) → Judge env root false .biginteger j
  | bigdecimal {x : BigDecimal} : Judge env root true .bigdecimal (.num (.bigdecimal x))
  | bigdecimalNot {j : Data} :
      (∀ x : BigDecimal, j ≠ .num (.bigdecimal x)) → Judge env root false .bigdecimal j
  | number {x : Number} : Judge env root true .number (.num x)
  | numberNot {j : Data} : (∀ x : Number, j ≠ .num x) → Judge env root false .number j
  | string {s : String} : s ≠ "" → Judge env root true .string (.str s)
  | stringNot {j : Data} : (∀ s, j = .str s → s = "") → Judge env root false .string j
  | anyString {s : String} : Judge env root true .anyString (.str s)
  | anyStringNot {j : Data} : (∀ s, j ≠ .str s) → Judge env root false .anyString j
  | boolean {b : Bool} : Judge env root true .boolean (.bool b)
  | booleanNot {j : Data} : (∀ b, j ≠ .bool b) → Judge env root false .boolean j
  /-- A literal admits its own value alone, of its own leaf, and refuses
  every other. -/
  | num {x : Number} : Judge env root true (.lit (.num x)) (.num x)
  | str {s : String} : Judge env root true (.lit (.str s)) (.str s)
  | bool {b : Bool} : Judge env root true (.lit (.bool b)) (.bool b)
  | null : Judge env root true (.lit .null) .null
  | litNot {s : Scalar} {j : Data} : j ≠ s.data → Judge env root false (.lit s) j
  /-- A bound with a number at its end admits a number, by exact value,
  and one with a string at its end a string, in code-point order; the
  bound's domain is its end's, so `min(0)` admits no string and
  `max("b")` no number. It refuses a value of its domain that falls
  outside it, and every value outside its domain. -/
  | min {n x : Number} : n.le x → Judge env root true (.min (.num n)) (.num x)
  | minStr {b s : String} : b ≤ s → Judge env root true (.min (.str b)) (.str s)
  | minNot {b : Bound} {j : Data} :
      (∀ n x, b = .num n → j = .num x → ¬ n.le x) → (∀ t s, b = .str t → j = .str s → ¬ t ≤ s) →
      Judge env root false (.min b) j
  | max {n x : Number} : x.le n → Judge env root true (.max (.num n)) (.num x)
  | maxStr {b s : String} : s ≤ b → Judge env root true (.max (.str b)) (.str s)
  | maxNot {b : Bound} {j : Data} :
      (∀ n x, b = .num n → j = .num x → ¬ x.le n) → (∀ t s, b = .str t → j = .str s → ¬ s ≤ t) →
      Judge env root false (.max b) j
  | above {n x : Number} : n.lt x → Judge env root true (.above (.num n)) (.num x)
  | aboveStr {b s : String} : b < s → Judge env root true (.above (.str b)) (.str s)
  | aboveNot {b : Bound} {j : Data} :
      (∀ n x, b = .num n → j = .num x → ¬ n.lt x) → (∀ t s, b = .str t → j = .str s → ¬ t < s) →
      Judge env root false (.above b) j
  | beneath {n x : Number} : x.lt n → Judge env root true (.beneath (.num n)) (.num x)
  | beneathStr {b s : String} : s < b → Judge env root true (.beneath (.str b)) (.str s)
  | beneathNot {b : Bound} {j : Data} :
      (∀ n x, b = .num n → j = .num x → ¬ x.lt n) → (∀ t s, b = .str t → j = .str s → ¬ s < t) →
      Judge env root false (.beneath b) j
  /-- `neq` excludes each of its ends by identity, a number by leaf and
  value, so `neq(1)` admits the float `1.0`; its domain is its ends',
  so a list of numbers admits no string, a list of strings no number,
  and a list of both nothing. It refuses a value that is one of its
  ends, or outside its domain. -/
  | neq {vs : List Bound} {x : Number} :
      (∀ v, v ∈ vs → ∃ n, v = .num n ∧ n ≠ x) → Judge env root true (.neq vs) (.num x)
  | neqStr {vs : List Bound} {s : String} :
      (∀ v, v ∈ vs → ∃ t, v = .str t ∧ t ≠ s) → Judge env root true (.neq vs) (.str s)
  | neqNot {vs : List Bound} {j : Data} :
      (∀ x, j = .num x → ∃ v, v ∈ vs ∧ ∀ n, v = .num n → n = x) →
      (∀ s, j = .str s → ∃ v, v ∈ vs ∧ ∀ t, v = .str t → t = s) →
      Judge env root false (.neq vs) j
  /-- `multiple` reads the value a number shows, which for a float is
  its shortest decimal; `multiple(0)` and a negative divisor admit
  nothing. -/
  | multiple {d x : Number} :
      d.Positive → x.multipleOf d → Judge env root true (.multiple d) (.num x)
  | multipleNot {d : Number} {j : Data} :
      (∀ x, j = .num x → d.Positive → ¬ x.multipleOf d) → Judge env root false (.multiple d) j
  /-- `len(c)` judges a string, a list, or a map as `c` judges its size,
  an integer; `len(0)` admits `""`, and a scalar has no size, so `len`
  refuses it, as it refuses a size no integer leaf holds. -/
  | len {b : Bool} {c : Val} {j : Data} {n : ℕ} (h : IntegerLeaf n) :
      j.size = some n → Judge env root b c (.num (.integer ⟨n, h⟩)) → Judge env root b (.len c) j
  | lenNone {c : Val} {j : Data} : j.size = none → Judge env root false (.len c) j
  | lenBig {c : Val} {j : Data} {n : ℕ} :
      j.size = some n → ¬ IntegerLeaf n → Judge env root false (.len c) j
  /-- `unique()` admits a list or a map whose members are pairwise
  distinct as values, and `unique("k")` one whose members each give
  `k` a value and whose values at `k` are; a member that is no map, or
  lacks the key, is a distinctness the container cannot show, so
  `unique` refuses it, as it refuses a scalar and two members alike. -/
  | unique {k : Option String} {j : Data} {ms : List Data} :
      j.members = some ms →
      (∀ x, x ∈ ms → (x.project k).isSome) →
      ms.Pairwise (fun x y => ∀ x' y', x.project k = some x' → y.project k = some y' →
        ¬ x'.Same y') →
      Judge env root true (.unique k) j
  | uniqueNone {k : Option String} {j : Data} : j.members = none → Judge env root false (.unique k) j
  | uniqueBare {k : Option String} {j : Data} {ms : List Data} {x : Data} :
      j.members = some ms → x ∈ ms → x.project k = none → Judge env root false (.unique k) j
  | uniqueDup {k : Option String} {j : Data} {ms : List Data} :
      j.members = some ms →
      ¬ ms.Pairwise (fun x y => ∀ x' y', x.project k = some x' → y.project k = some y' →
        ¬ x'.Same y') →
      Judge env root false (.unique k) j
  /-- `re(p)` admits the strings the pattern matches, and `format(g)`
  the strings the format reads, by the host's predicates; each admits
  `""` exactly where its predicate holds of it, admits no other kind of
  value, and refuses whatever it does not admit. -/
  | re {p s : String} : host.pattern p s → Judge env root true (.re p) (.str s)
  | reNot {p : String} {j : Data} :
      (∀ s, j = .str s → ¬ host.pattern p s) → Judge env root false (.re p) j
  | format {g s : String} : host.format g s → Judge env root true (.format g) (.str s)
  | formatNot {g : String} {j : Data} :
      (∀ s, j = .str s → ¬ host.format g s) → Judge env root false (.format g) j
  | any {j : Data} : Judge env root true .any j
  | nil {j : Data} : Judge env root false .nil j
  /-- A map: every declared key that is present holds its value, and
  holds every declaration of it; a key that is absent is optional in
  every declaration; the spread holds every member, declared or not;
  a sealed map holds no key it does not declare. It refuses a value
  that is no map, and a map that breaks any one of those. -/
  | map {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool}
      {jfs : List (String × Data)} :
      (∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x → Judge env root true v x) →
      (∀ k o v, (k, o, v) ∈ fs → lookup k jfs = none → o = true) →
      (∀ s, spread = some s → ∀ k x, (k, x) ∈ jfs → Judge env root true s x) →
      (closed = true → ∀ k x, (k, x) ∈ jfs → ∃ o v, (k, o, v) ∈ fs) →
      Judge env root true (.map fs spread closed) (.map jfs)
  | mapNot {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool} {j : Data} :
      (∀ jfs, j ≠ .map jfs) → Judge env root false (.map fs spread closed) j
  | mapField {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool}
      {jfs : List (String × Data)} {k : String} {o : Bool} {v : Val} {x : Data} :
      (k, o, v) ∈ fs → lookup k jfs = some x → Judge env root false v x →
      Judge env root false (.map fs spread closed) (.map jfs)
  | mapMissing {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool}
      {jfs : List (String × Data)} {k : String} {o : Bool} {v : Val} :
      (k, o, v) ∈ fs → lookup k jfs = none → o = false →
      Judge env root false (.map fs spread closed) (.map jfs)
  | mapSpread {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool}
      {jfs : List (String × Data)} {s : Val} {k : String} {x : Data} :
      spread = some s → (k, x) ∈ jfs → Judge env root false s x →
      Judge env root false (.map fs spread closed) (.map jfs)
  | mapClosed {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool}
      {jfs : List (String × Data)} {k : String} {x : Data} :
      closed = true → (k, x) ∈ jfs → (∀ o v, (k, o, v) ∉ fs) →
      Judge env root false (.map fs spread closed) (.map jfs)
  /-- A list: each of its positions is present and holds its value;
  later elements are allowed, but in a sealed list without a spread,
  whose length is its positions'; the spread holds every element. It
  refuses a value that is no list, and a list that breaks any one of
  those. -/
  | list {items : List Val} {spread : Option Val} {closed : Bool} {xs : List Data} :
      items.length ≤ xs.length →
      (closed = true → spread = none → xs.length = items.length) →
      (∀ (i : ℕ) (v : Val) (x : Data), items[i]? = some v → xs[i]? = some x →
        Judge env root true v x) →
      (∀ s, spread = some s → ∀ x, x ∈ xs → Judge env root true s x) →
      Judge env root true (.list items spread closed) (.list xs)
  | listNot {items : List Val} {spread : Option Val} {closed : Bool} {j : Data} :
      (∀ xs, j ≠ .list xs) → Judge env root false (.list items spread closed) j
  | listShort {items : List Val} {spread : Option Val} {closed : Bool} {xs : List Data} :
      xs.length < items.length → Judge env root false (.list items spread closed) (.list xs)
  | listLong {items : List Val} {spread : Option Val} {closed : Bool} {xs : List Data} :
      closed = true → spread = none → xs.length ≠ items.length →
      Judge env root false (.list items spread closed) (.list xs)
  | listItem {items : List Val} {spread : Option Val} {closed : Bool} {xs : List Data}
      {i : ℕ} {v : Val} {x : Data} :
      items[i]? = some v → xs[i]? = some x → Judge env root false v x →
      Judge env root false (.list items spread closed) (.list xs)
  | listSpread {items : List Val} {spread : Option Val} {closed : Bool} {xs : List Data}
      {s : Val} {x : Data} :
      spread = some s → x ∈ xs → Judge env root false s x →
      Judge env root false (.list items spread closed) (.list xs)
  /-- A disjunction admits what any arm admits, whatever the arm's
  rank: a rank picks the output, which is no part of admission. It
  refuses what every arm refuses. -/
  | or {arms : List (ℕ × Val)} {r : ℕ} {a : Val} {j : Data} :
      (r, a) ∈ arms → Judge env root true a j → Judge env root true (.or arms) j
  | orNone {arms : List (ℕ × Val)} {j : Data} :
      (∀ r a, (r, a) ∈ arms → Judge env root false a j) → Judge env root false (.or arms) j
  /-- A preference alone admits its value, and what its value's parent
  type admits: `*1` admits `2`, and refuses `1.5` and `"a"`, which
  both refuse. -/
  | pref {r : ℕ} {x : Val} {j : Data} : Judge env root true x j → Judge env root true (.pref r x) j
  | prefSuper {r : ℕ} {x : Val} {j : Data} :
      Judge env root true x.super j → Judge env root true (.pref r x) j
  | prefNone {r : ℕ} {x : Val} {j : Data} :
      Judge env root false x j → Judge env root false x.super j → Judge env root false (.pref r x) j
  /-- A meet admits what both sides admit, and refuses what either
  refuses. -/
  | meet {a b : Val} {j : Data} :
      Judge env root true a j → Judge env root true b j → Judge env root true (.meet a b) j
  | meetLeft {a b : Val} {j : Data} : Judge env root false a j → Judge env root false (.meet a b) j
  | meetRight {a b : Val} {j : Data} : Judge env root false b j → Judge env root false (.meet a b) j
  /-- An alias judges as its declaration judges. A name with no
  declaration, and a path left unread, refuse every value: the answer
  for a reading the definition was not given, which no verdict reaches,
  since `Vet` refuses a document with an undeclared name as an `error`
  and `VetP` reads every path, in `spec/Aontu/Paths.lean`, before it
  judges. -/
  | alias {b : Bool} {n : String} {v : Val} {j : Data} :
      env n = some v → Judge env root b v j → Judge env root b (.alias n) j
  | aliasNone {n : String} {j : Data} : env n = none → Judge env root false (.alias n) j
  | path {p : List Seg} {j : Data} : Judge env root false (.path p) j
  /-- A trial schema tries each branch on the value, as a term is tried,
  and counts those that admit it: `nof(n, c₁, …)` judges as `n` judges
  the count, an integer, and `must(c, m)` as `c` judges the value, which
  is what `nof(1, c)` asks. Each branch judges the value one way or the
  other, so a branch that judges it neither way, a name declared as
  itself alone, leaves the trial unjudged; a count no integer leaf holds
  is refused. -/
  | nof {b : Bool} {n : Val} {cs : List Val} {j : Data} {f : Val → Bool} {k : ℕ} (h : IntegerLeaf k) :
      (∀ c, c ∈ cs → Judge env root (f c) c j) → cs.countP f = k →
      Judge env root b n (.num (.integer ⟨k, h⟩)) → Judge env root b (.nof n cs) j
  | nofBig {n : Val} {cs : List Val} {j : Data} {f : Val → Bool} {k : ℕ} :
      (∀ c, c ∈ cs → Judge env root (f c) c j) → cs.countP f = k → ¬ IntegerLeaf k →
      Judge env root false (.nof n cs) j
  | must {b : Bool} {c : Val} {m : String} {j : Data} :
      Judge env root b c j → Judge env root b (.must c m) j
  /-- A conditional holds the value to the branch its condition picks:
  where `c` admits the value, `when(c, t, e)` judges it as `t` does;
  where `c` refuses it, as `e` does; and an `e` not written admits it. -/
  | whenThen {b : Bool} {c t : Val} {e : Option Val} {j : Data} :
      Judge env root true c j → Judge env root b t j → Judge env root b (.when c t e) j
  | whenElse {b : Bool} {c t e : Val} {j : Data} :
      Judge env root false c j → Judge env root b e j → Judge env root b (.when c t (some e)) j
  | whenPass {c t : Val} {j : Data} :
      Judge env root false c j → Judge env root true (.when c t none) j
  /-- `contains(c, n)` judges a list or a map as `n` judges the number of
  its members `c` admits, an integer, each member tried alone. A scalar
  has no members, so `contains` refuses it, as it refuses a count no
  integer leaf holds. -/
  | contains {b : Bool} {c n : Val} {j : Data} {ms : List Data} {f : Data → Bool} {k : ℕ} (h : IntegerLeaf k) :
      j.members = some ms → (∀ x, x ∈ ms → Judge env root (f x) c x) → ms.countP f = k →
      Judge env root b n (.num (.integer ⟨k, h⟩)) → Judge env root b (.contains c n) j
  | containsNone {c n : Val} {j : Data} : j.members = none → Judge env root false (.contains c n) j
  | containsBig {c n : Val} {j : Data} {ms : List Data} {f : Data → Bool} {k : ℕ} :
      j.members = some ms → (∀ x, x ∈ ms → Judge env root (f x) c x) → ms.countP f = k → ¬ IntegerLeaf k →
      Judge env root false (.contains c n) j

/-- `j` is an instance of `v`: the trial comes out `true`. -/
abbrev Admits (env : Env) (root : Data) : Val → Data → Prop := Judge env root true

/-- `v` rules `j` out: the trial comes out `false`. -/
abbrev Refuses (env : Env) (root : Data) : Val → Data → Prop := Judge env root false

/-- `j` is an instance of `v` under the declarations `env`: `j` is a
value, taken whole, so that it is its own root. This is the question
`aontu vet` answers. A Lean `Data` that is no value, a map that gives
one key twice, is no instance of anything, so it is never a witness. -/
abbrev Instance (env : Env) (v : Val) (j : Data) : Prop := j.WellFormed ∧ Admits env j v j

/-- Two predicates that agree on a list count alike. -/
theorem countP_congr {α : Type} {p q : α → Bool} :
    ∀ {l : List α}, (∀ x, x ∈ l → p x = q x) → l.countP p = l.countP q
  | [], _ => rfl
  | x :: l, h => by
    simp only [List.countP_cons, h x (List.mem_cons_self x l),
      countP_congr fun y hy => h y (List.mem_cons_of_mem x hy)]

/-- A value judges a datum one way at most: no value both admits and
refuses it. A judgement that holds is therefore the judgement. -/
theorem judge_unique {env : Env} {root : Data} {b : Bool} {v : Val} {j : Data}
    (h : Judge env root b v j) : ∀ {b' : Bool}, Judge env root b' v j → b = b' := by
  induction h with
  | integer => intro b' h'; cases h' with
    | integer => rfl
    | integerNot hn => exact absurd rfl (hn _)
  | integerNot hn => intro b' h'; cases h' with
    | integer => exact absurd rfl (hn _)
    | integerNot _ => rfl
  | float => intro b' h'; cases h' with
    | float => rfl
    | floatNot hn => exact absurd rfl (hn _)
  | floatNot hn => intro b' h'; cases h' with
    | float => exact absurd rfl (hn _)
    | floatNot _ => rfl
  | biginteger => intro b' h'; cases h' with
    | biginteger => rfl
    | bigintegerNot hn => exact absurd rfl (hn _)
  | bigintegerNot hn => intro b' h'; cases h' with
    | biginteger => exact absurd rfl (hn _)
    | bigintegerNot _ => rfl
  | bigdecimal => intro b' h'; cases h' with
    | bigdecimal => rfl
    | bigdecimalNot hn => exact absurd rfl (hn _)
  | bigdecimalNot hn => intro b' h'; cases h' with
    | bigdecimal => exact absurd rfl (hn _)
    | bigdecimalNot _ => rfl
  | number => intro b' h'; cases h' with
    | number => rfl
    | numberNot hn => exact absurd rfl (hn _)
  | numberNot hn => intro b' h'; cases h' with
    | number => exact absurd rfl (hn _)
    | numberNot _ => rfl
  | string hs => intro b' h'; cases h' with
    | string _ => rfl
    | stringNot hn => exact absurd (hn _ rfl) hs
  | stringNot hn => intro b' h'; cases h' with
    | string hs => exact absurd (hn _ rfl) hs
    | stringNot _ => rfl
  | anyString => intro b' h'; cases h' with
    | anyString => rfl
    | anyStringNot hn => exact absurd rfl (hn _)
  | anyStringNot hn => intro b' h'; cases h' with
    | anyString => exact absurd rfl (hn _)
    | anyStringNot _ => rfl
  | boolean => intro b' h'; cases h' with
    | boolean => rfl
    | booleanNot hn => exact absurd rfl (hn _)
  | booleanNot hn => intro b' h'; cases h' with
    | boolean => exact absurd rfl (hn _)
    | booleanNot _ => rfl
  | num => intro b' h'; cases h' with
    | num => rfl
    | litNot hn => exact absurd rfl hn
  | str => intro b' h'; cases h' with
    | str => rfl
    | litNot hn => exact absurd rfl hn
  | bool => intro b' h'; cases h' with
    | bool => rfl
    | litNot hn => exact absurd rfl hn
  | null => intro b' h'; cases h' with
    | null => rfl
    | litNot hn => exact absurd rfl hn
  | @litNot s j hn => intro b' h'; cases h' with
    | num | str | bool | null => exact absurd rfl hn
    | litNot _ => rfl
  | min h => intro b' h'; cases h' with
    | min _ => rfl
    | minNot hn _ => exact absurd h (hn _ _ rfl rfl)
  | minStr h => intro b' h'; cases h' with
    | minStr _ => rfl
    | minNot _ hn => exact absurd h (hn _ _ rfl rfl)
  | minNot hn hs => intro b' h'; cases h' with
    | min h => exact absurd h (hn _ _ rfl rfl)
    | minStr h => exact absurd h (hs _ _ rfl rfl)
    | minNot _ _ => rfl
  | max h => intro b' h'; cases h' with
    | max _ => rfl
    | maxNot hn _ => exact absurd h (hn _ _ rfl rfl)
  | maxStr h => intro b' h'; cases h' with
    | maxStr _ => rfl
    | maxNot _ hn => exact absurd h (hn _ _ rfl rfl)
  | maxNot hn hs => intro b' h'; cases h' with
    | max h => exact absurd h (hn _ _ rfl rfl)
    | maxStr h => exact absurd h (hs _ _ rfl rfl)
    | maxNot _ _ => rfl
  | above h => intro b' h'; cases h' with
    | above _ => rfl
    | aboveNot hn _ => exact absurd h (hn _ _ rfl rfl)
  | aboveStr h => intro b' h'; cases h' with
    | aboveStr _ => rfl
    | aboveNot _ hn => exact absurd h (hn _ _ rfl rfl)
  | aboveNot hn hs => intro b' h'; cases h' with
    | above h => exact absurd h (hn _ _ rfl rfl)
    | aboveStr h => exact absurd h (hs _ _ rfl rfl)
    | aboveNot _ _ => rfl
  | beneath h => intro b' h'; cases h' with
    | beneath _ => rfl
    | beneathNot hn _ => exact absurd h (hn _ _ rfl rfl)
  | beneathStr h => intro b' h'; cases h' with
    | beneathStr _ => rfl
    | beneathNot _ hn => exact absurd h (hn _ _ rfl rfl)
  | beneathNot hn hs => intro b' h'; cases h' with
    | beneath h => exact absurd h (hn _ _ rfl rfl)
    | beneathStr h => exact absurd h (hs _ _ rfl rfl)
    | beneathNot _ _ => rfl
  | neq h => intro b' h'; cases h' with
    | neq _ => rfl
    | neqNot hn _ =>
      obtain ⟨v, hv, hvn⟩ := hn _ rfl
      obtain ⟨n, rfl, hnx⟩ := h v hv
      exact absurd (hvn n rfl) hnx
  | neqStr h => intro b' h'; cases h' with
    | neqStr _ => rfl
    | neqNot _ hn =>
      obtain ⟨v, hv, hvt⟩ := hn _ rfl
      obtain ⟨t, rfl, hts⟩ := h v hv
      exact absurd (hvt t rfl) hts
  | neqNot hn hs => intro b' h'; cases h' with
    | neq h =>
      obtain ⟨v, hv, hvn⟩ := hn _ rfl
      obtain ⟨n, rfl, hnx⟩ := h v hv
      exact absurd (hvn n rfl) hnx
    | neqStr h =>
      obtain ⟨v, hv, hvt⟩ := hs _ rfl
      obtain ⟨t, rfl, hts⟩ := h v hv
      exact absurd (hvt t rfl) hts
    | neqNot _ _ => rfl
  | multiple hp hm => intro b' h'; cases h' with
    | multiple _ _ => rfl
    | multipleNot hn => exact absurd hm (hn _ rfl hp)
  | multipleNot hn => intro b' h'; cases h' with
    | multiple hp hm => exact absurd hm (hn _ rfl hp)
    | multipleNot _ => rfl
  | len h hs _ ih => intro b' h'; cases h' with
    | len h' hs' hc' => rw [hs] at hs'; cases hs'; exact ih hc'
    | lenNone hs' => rw [hs] at hs'; cases hs'
    | lenBig hs' hn => rw [hs] at hs'; cases hs'; exact absurd h hn
  | lenNone hs => intro b' h'; cases h' with
    | len _ hs' _ => rw [hs] at hs'; cases hs'
    | lenNone _ => rfl
    | lenBig _ _ => rfl
  | lenBig hs hn => intro b' h'; cases h' with
    | len h hs' _ => rw [hs] at hs'; cases hs'; exact absurd h hn
    | lenNone _ => rfl
    | lenBig _ _ => rfl
  | unique hm h1 h2 => intro b' h'; cases h' with
    | unique _ _ _ => rfl
    | uniqueNone hm' => rw [hm] at hm'; cases hm'
    | uniqueBare hm' hx hp =>
      rw [hm] at hm'; cases hm'
      have := h1 _ hx
      rw [hp] at this
      cases this
    | uniqueDup hm' hnp => rw [hm] at hm'; cases hm'; exact absurd h2 hnp
  | uniqueNone hm => intro b' h'; cases h' with
    | unique hm' _ _ => rw [hm] at hm'; cases hm'
    | uniqueNone _ => rfl
    | uniqueBare _ _ _ => rfl
    | uniqueDup _ _ => rfl
  | uniqueBare hm hx hp => intro b' h'; cases h' with
    | unique hm' h1 _ =>
      rw [hm] at hm'; cases hm'
      have := h1 _ hx
      rw [hp] at this
      cases this
    | uniqueNone _ => rfl
    | uniqueBare _ _ _ => rfl
    | uniqueDup _ _ => rfl
  | uniqueDup hm hnp => intro b' h'; cases h' with
    | unique hm' _ h2 => rw [hm] at hm'; cases hm'; exact absurd h2 hnp
    | uniqueNone _ => rfl
    | uniqueBare _ _ _ => rfl
    | uniqueDup _ _ => rfl
  | re h => intro b' h'; cases h' with
    | re _ => rfl
    | reNot hn => exact absurd h (hn _ rfl)
  | reNot hn => intro b' h'; cases h' with
    | re h => exact absurd h (hn _ rfl)
    | reNot _ => rfl
  | format h => intro b' h'; cases h' with
    | format _ => rfl
    | formatNot hn => exact absurd h (hn _ rfl)
  | formatNot hn => intro b' h'; cases h' with
    | format h => exact absurd h (hn _ rfl)
    | formatNot _ => rfl
  | any => intro b' h'; cases h' with
    | any => rfl
  | nil => intro b' h'; cases h' with
    | nil => rfl
  | map h1 h2 h3 h4 ih1 ih3 => intro b' h'; cases h' with
    | map _ _ _ _ => rfl
    | mapNot hn => exact absurd rfl (hn _)
    | mapField hm hx hr => exact nomatch ih1 _ _ _ _ hm hx hr
    | mapMissing hm hx ho => rw [h2 _ _ _ hm hx] at ho; cases ho
    | mapSpread hs hm hr => exact nomatch ih3 _ hs _ _ hm hr
    | mapClosed hc hm hn =>
      obtain ⟨o, v, hv⟩ := h4 hc _ _ hm
      exact absurd hv (hn o v)
  | mapNot hn => intro b' h'; cases h' with
    | map _ _ _ _ => exact absurd rfl (hn _)
    | mapNot _ => rfl
    | mapField _ _ _ => exact absurd rfl (hn _)
    | mapMissing _ _ _ => exact absurd rfl (hn _)
    | mapSpread _ _ _ => exact absurd rfl (hn _)
    | mapClosed _ _ _ => exact absurd rfl (hn _)
  | mapField hm hx _ ih => intro b' h'; cases h' with
    | map h1 _ _ _ => exact nomatch ih (h1 _ _ _ _ hm hx)
    | mapNot hn => exact absurd rfl (hn _)
    | mapField _ _ _ | mapMissing _ _ _ | mapSpread _ _ _ | mapClosed _ _ _ => rfl
  | mapMissing hm hx ho => intro b' h'; cases h' with
    | map _ h2 _ _ => rw [h2 _ _ _ hm hx] at ho; cases ho
    | mapNot hn => exact absurd rfl (hn _)
    | mapField _ _ _ | mapMissing _ _ _ | mapSpread _ _ _ | mapClosed _ _ _ => rfl
  | mapSpread hs hm _ ih => intro b' h'; cases h' with
    | map _ _ h3 _ => exact nomatch ih (h3 _ hs _ _ hm)
    | mapNot hn => exact absurd rfl (hn _)
    | mapField _ _ _ | mapMissing _ _ _ | mapSpread _ _ _ | mapClosed _ _ _ => rfl
  | mapClosed hc hm hn => intro b' h'; cases h' with
    | map _ _ _ h4 =>
      obtain ⟨o, v, hv⟩ := h4 hc _ _ hm
      exact absurd hv (hn o v)
    | mapNot hn' => exact absurd rfl (hn' _)
    | mapField _ _ _ | mapMissing _ _ _ | mapSpread _ _ _ | mapClosed _ _ _ => rfl
  | list h1 h2 h3 h4 ih3 ih4 => intro b' h'; cases h' with
    | list _ _ _ _ => rfl
    | listNot hn => exact absurd rfl (hn _)
    | listShort hl => exact absurd h1 (Nat.not_le_of_lt hl)
    | listLong hc hs hl => exact absurd (h2 hc hs) hl
    | listItem hv hx hr => exact nomatch ih3 _ _ _ hv hx hr
    | listSpread hs hx hr => exact nomatch ih4 _ hs _ hx hr
  | listNot hn => intro b' h'; cases h' with
    | list _ _ _ _ => exact absurd rfl (hn _)
    | listNot _ => rfl
    | listShort _ => exact absurd rfl (hn _)
    | listLong _ _ _ => exact absurd rfl (hn _)
    | listItem _ _ _ => exact absurd rfl (hn _)
    | listSpread _ _ _ => exact absurd rfl (hn _)
  | listShort hl => intro b' h'; cases h' with
    | list h1 _ _ _ => exact absurd h1 (Nat.not_le_of_lt hl)
    | listNot hn => exact absurd rfl (hn _)
    | listShort _ | listLong _ _ _ | listItem _ _ _ | listSpread _ _ _ => rfl
  | listLong hc hs hl => intro b' h'; cases h' with
    | list _ h2 _ _ => exact absurd (h2 hc hs) hl
    | listNot hn => exact absurd rfl (hn _)
    | listShort _ | listLong _ _ _ | listItem _ _ _ | listSpread _ _ _ => rfl
  | listItem hv hx _ ih => intro b' h'; cases h' with
    | list _ _ h3 _ => exact nomatch ih (h3 _ _ _ hv hx)
    | listNot hn => exact absurd rfl (hn _)
    | listShort _ | listLong _ _ _ | listItem _ _ _ | listSpread _ _ _ => rfl
  | listSpread hs hx _ ih => intro b' h'; cases h' with
    | list _ _ _ h4 => exact nomatch ih (h4 _ hs _ hx)
    | listNot hn => exact absurd rfl (hn _)
    | listShort _ | listLong _ _ _ | listItem _ _ _ | listSpread _ _ _ => rfl
  | or hm _ ih => intro b' h'; cases h' with
    | or _ _ => rfl
    | orNone hall => exact nomatch ih (hall _ _ hm)
  | orNone _ ih => intro b' h'; cases h' with
    | or hm ha => exact nomatch ih _ _ hm ha
    | orNone _ => rfl
  | pref _ ih => intro b' h'; cases h' with
    | pref _ | prefSuper _ => rfl
    | prefNone hx _ => exact nomatch ih hx
  | prefSuper _ ih => intro b' h'; cases h' with
    | pref _ | prefSuper _ => rfl
    | prefNone _ hs => exact nomatch ih hs
  | prefNone _ _ ihx ihs => intro b' h'; cases h' with
    | pref hx => exact nomatch ihx hx
    | prefSuper hs => exact nomatch ihs hs
    | prefNone _ _ => rfl
  | meet _ _ iha ihb => intro b' h'; cases h' with
    | meet _ _ => rfl
    | meetLeft ha => exact nomatch iha ha
    | meetRight hb => exact nomatch ihb hb
  | meetLeft _ iha => intro b' h'; cases h' with
    | meet ha _ => exact nomatch iha ha
    | meetLeft _ | meetRight _ => rfl
  | meetRight _ ihb => intro b' h'; cases h' with
    | meet _ hb => exact nomatch ihb hb
    | meetLeft _ | meetRight _ => rfl
  | alias he _ ih => intro b' h'; cases h' with
    | alias he' hv => rw [he] at he'; cases he'; exact ih hv
    | aliasNone he' => rw [he] at he'; cases he'
  | aliasNone he => intro b' h'; cases h' with
    | alias he' _ => rw [he] at he'; cases he'
    | aliasNone _ => rfl
  | path => intro b' h'; cases h' with
    | path => rfl
  | @nof _ _ cs _ f k h _ hk _ ihf ihn => intro b' h'; cases h' with
    | @nof _ _ _ _ f' k' h' hf' hk' hn' =>
      have hkk : k = k' := by rw [← hk, ← hk']; exact countP_congr fun c hc => ihf c hc (hf' c hc)
      subst hkk
      exact ihn hn'
    | @nofBig _ _ _ f' k' hf' hk' hbig =>
      have hkk : k = k' := by rw [← hk, ← hk']; exact countP_congr fun c hc => ihf c hc (hf' c hc)
      subst hkk
      exact absurd h hbig
  | @nofBig _ cs _ f k _ hk hbig ihf => intro b' h'; cases h' with
    | @nof _ _ _ _ f' k' h' hf' hk' _ =>
      have hkk : k = k' := by rw [← hk, ← hk']; exact countP_congr fun c hc => ihf c hc (hf' c hc)
      subst hkk
      exact absurd h' hbig
    | nofBig _ _ _ => rfl
  | must _ ih => intro b' h'; cases h' with
    | must h => exact ih h
  | whenThen _ _ ihc iht => intro b' h'; cases h' with
    | whenThen _ ht' => exact iht ht'
    | whenElse hc' _ => exact nomatch ihc hc'
    | whenPass hc' => exact nomatch ihc hc'
  | whenElse _ _ ihc ihe => intro b' h'; cases h' with
    | whenThen hc' _ => exact nomatch ihc hc'
    | whenElse _ he' => exact ihe he'
  | whenPass _ ihc => intro b' h'; cases h' with
    | whenThen hc' _ => exact nomatch ihc hc'
    | whenPass _ => rfl
  | @contains _ _ _ _ ms f k h hm hf hk _ ihf ihn => intro b' h'; cases h' with
    | @contains _ _ _ _ ms' f' k' h' hm' hf' hk' hn' =>
      rw [hm] at hm'; cases hm'
      have hkk : k = k' := by rw [← hk, ← hk']; exact countP_congr fun x hx => ihf x hx (hf' x hx)
      subst hkk
      exact ihn hn'
    | containsNone hm' => rw [hm] at hm'; cases hm'
    | @containsBig _ _ _ ms' f' k' hm' hf' hk' hbig =>
      rw [hm] at hm'; cases hm'
      have hkk : k = k' := by rw [← hk, ← hk']; exact countP_congr fun x hx => ihf x hx (hf' x hx)
      subst hkk
      exact absurd h hbig
  | containsNone hm => intro b' h'; cases h' with
    | contains _ hm' _ _ _ => rw [hm] at hm'; cases hm'
    | containsNone _ => rfl
    | containsBig _ _ _ _ => rfl
  | @containsBig _ _ _ ms f k hm hf hk hbig ihf => intro b' h'; cases h' with
    | @contains _ _ _ _ ms' f' k' h' hm' hf' hk' _ =>
      rw [hm] at hm'; cases hm'
      have hkk : k = k' := by rw [← hk, ← hk']; exact countP_congr fun x hx => ihf x hx (hf' x hx)
      subst hkk
      exact absurd h' hbig
    | containsNone _ => rfl
    | containsBig _ _ _ _ => rfl

/-- The judgement a term's trial comes out: the computed answer `c` is the
judgement `b` exactly when the two agree. -/
theorem Judge.toIff {env : Env} {root : Data} {c : Bool} {v : Val} {j : Data}
    (h : Judge env root c v j) {b : Bool} : c = b ↔ Judge env root b v j :=
  ⟨fun e => e ▸ h, fun h' => judge_unique h h'⟩

end Aontu
