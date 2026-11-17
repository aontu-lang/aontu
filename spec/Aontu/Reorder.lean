import Aontu.Order
import Aontu.Names

/-!
# Order independence

A document's meaning does not depend on the order it is written in
(ADR-081). `Val.Reordered v w` says that `v` and `w` are one value
written in two orders: the members of a map, the two sides of a meet,
the arms of a disjunction, the branches of `nof` and the ends of `neq`
in any order, at each depth the relation reaches. `Val.Reordered.judge`
is the invariant: two such terms admit the same data and refuse the
same data. A document's declarations may be written in any order too
(`judge_env_of_perm`). `OrderIndependent` is the same demand made of a
verdict, the contract a port's `vet` is held to.

A list's elements and the arms of a `match` are no part of it: their
order is what they say.
-/

namespace Aontu

/-! ## One value in two orders -/

/-- `v` and `w` are one value written in two orders. The first block is
what makes the relation an equivalence; the second is the orders a text
has and a value has not; the third carries those beneath each
construct, one member at a time.

Beneath a preference the parent types must judge alike as well, since a
preference admits what its value's parent admits and `Val.super` reads
a meet by how it nests. Beneath `len` the two must lie in `len`'s domain
alike. The relation doesn't reach beneath a branch of `nof`, a cover of
`rest` or an arm of `match`. -/
inductive Val.Reordered : Val → Val → Prop
  | refl (v : Val) : Reordered v v
  | symm {v w : Val} : Reordered v w → Reordered w v
  | trans {u v w : Val} : Reordered u v → Reordered v w → Reordered u w
  | members {fs fs' : List (String × Bool × Val)} (spread : Option Val) (closed : Bool) :
      fs.Perm fs' → Reordered (.map fs spread closed) (.map fs' spread closed)
  | sides (a b : Val) : Reordered (.meet a b) (.meet b a)
  | nest (a b c : Val) : Reordered (.meet (.meet a b) c) (.meet a (.meet b c))
  | arms {as as' : List (ℕ × Val)} : as.Perm as' → Reordered (.or as) (.or as')
  | branches (n : Val) {cs cs' : List Val} : cs.Perm cs' → Reordered (.nof n cs) (.nof n cs')
  | ends {vs vs' : List Bound} : vs.Perm vs' → Reordered (.neq vs) (.neq vs')
  | member {v v' : Val} (pre post : List (String × Bool × Val)) (k : String) (o : Bool)
      (spread : Option Val) (closed : Bool) :
      Reordered v v' →
      Reordered (.map (pre ++ (k, o, v) :: post) spread closed)
        (.map (pre ++ (k, o, v') :: post) spread closed)
  | spread {s s' : Val} (fs : List (String × Bool × Val)) (closed : Bool) :
      (∀ k : String, Reordered (s.atKey k) (s'.atKey k)) →
      Reordered (.map fs (some s) closed) (.map fs (some s') closed)
  | element {v v' : Val} (items : List Val) (i : ℕ) (spread : Option Val) (closed : Bool) :
      items[i]? = some v → Reordered v v' →
      Reordered (.list items spread closed) (.list (items.set i v') spread closed)
  | elements {s s' : Val} (items : List Val) (closed : Bool) :
      (∀ k : String, Reordered (s.atKey k) (s'.atKey k)) →
      Reordered (.list items (some s) closed) (.list items (some s') closed)
  | side {a a' : Val} (b : Val) : Reordered a a' → Reordered (.meet a b) (.meet a' b)
  | arm {a a' : Val} (pre post : List (ℕ × Val)) (r : ℕ) :
      Reordered a a' → Reordered (.or (pre ++ (r, a) :: post)) (.or (pre ++ (r, a') :: post))
  | pref {x x' : Val} (r : ℕ) :
      Reordered x x' →
      (∀ (env : Env) (root : Data) (b : Bool) (j : Data),
        Judge env root b x.super j ↔ Judge env root b x'.super j) →
      Reordered (.pref r x) (.pref r x')
  | ride {v v' : Val} (k : Rider) (r : Record) : Reordered v v' → Reordered (.ride k v r) (.ride k v' r)
  | link {v v' t t' : Val} : Reordered v v' → Reordered t t' → Reordered (.link v t) (.link v' t')
  | must {c c' : Val} (m : String) : Reordered c c' → Reordered (.must c m) (.must c' m)
  | cond {c c' : Val} (t : Val) (e : Option Val) :
      Reordered c c' → Reordered (.when c t e) (.when c' t e)
  | thenOf {t t' : Val} (c : Val) (e : Option Val) :
      Reordered t t' → Reordered (.when c t e) (.when c t' e)
  | elseOf {e e' : Val} (c t : Val) :
      Reordered e e' → Reordered (.when c t (some e)) (.when c t (some e'))
  | count {n n' : Val} (cs : List Val) : Reordered n n' → Reordered (.nof n cs) (.nof n' cs)
  | contained {c c' : Val} (n : Val) : Reordered c c' → Reordered (.contains c n) (.contains c' n)
  | containing {n n' : Val} (c : Val) : Reordered n n' → Reordered (.contains c n) (.contains c n')
  | sized {c c' : Val} : Reordered c c' → c.unsized = c'.unsized → Reordered (.len c) (.len c')

/-! ## What each step keeps

Each lemma carries a judgement one way across one step; the invariant
uses each both ways. -/

section
variable {env : Env} {root : Data}

/-- A map judges as another whose members answer its own: each member of
either has one of the other's under its key, as optional, whose value
judges at least as it does. -/
theorem judge_map_of_members {b : Bool} {fs fs' : List (String × Bool × Val)}
    {spread : Option Val} {closed : Bool} {j : Data}
    (hback : ∀ k o v', (k, o, v') ∈ fs' →
      ∃ v, (k, o, v) ∈ fs ∧ ∀ b j, Judge env root b v j → Judge env root b v' j)
    (hforth : ∀ k o v, (k, o, v) ∈ fs →
      ∃ v', (k, o, v') ∈ fs' ∧ ∀ b j, Judge env root b v j → Judge env root b v' j)
    (h : Judge env root b (.map fs spread closed) j) :
    Judge env root b (.map fs' spread closed) j := by
  cases h with
  | map hp ha hs hc =>
    refine .map ?_ ?_ hs ?_
    · intro k o v' x he hx
      obtain ⟨v, hv, himp⟩ := hback k o v' he
      exact himp true x (hp k o v x hv hx)
    · intro k o v' he hx
      obtain ⟨v, hv, _⟩ := hback k o v' he
      exact ha k o v hv hx
    · intro hcl k x hx
      obtain ⟨o, v, hv⟩ := hc hcl k x hx
      obtain ⟨v', hv', _⟩ := hforth k o v hv
      exact ⟨o, v', hv'⟩
  | mapNot hn => exact .mapNot hn
  | mapField he hx hj =>
    obtain ⟨v', hv', himp⟩ := hforth _ _ _ he
    exact .mapField hv' hx (himp false _ hj)
  | mapMissing he hx ho =>
    obtain ⟨v', hv', _⟩ := hforth _ _ _ he
    exact .mapMissing hv' hx ho
  | mapSpread hs hx hj => exact .mapSpread hs hx hj
  | mapClosed hcl hx hn =>
    refine .mapClosed hcl hx ?_
    intro o v' he
    obtain ⟨v, hv, _⟩ := hback _ o v' he
    exact hn o v hv

/-- A map judges as the map of its members in another order. -/
theorem judge_map_of_perm {b : Bool} {fs fs' : List (String × Bool × Val)}
    {spread : Option Val} {closed : Bool} {j : Data} (hp : fs.Perm fs')
    (h : Judge env root b (.map fs spread closed) j) :
    Judge env root b (.map fs' spread closed) j :=
  judge_map_of_members
    (fun _ _ v he => ⟨v, hp.mem_iff.mpr he, fun _ _ h => h⟩)
    (fun _ _ v he => ⟨v, hp.mem_iff.mp he, fun _ _ h => h⟩) h

/-- A map judges as the map with one member's value changed for one that
judges at least as it does. -/
theorem judge_map_of_member {b : Bool} {pre post : List (String × Bool × Val)} {k : String}
    {o : Bool} {v v' : Val} {spread : Option Val} {closed : Bool} {j : Data}
    (hv : ∀ b j, Judge env root b v j → Judge env root b v' j)
    (h : Judge env root b (.map (pre ++ (k, o, v) :: post) spread closed) j) :
    Judge env root b (.map (pre ++ (k, o, v') :: post) spread closed) j := by
  refine judge_map_of_members ?_ ?_ h
  · intro k₁ o₁ w he
    rcases List.mem_append.mp he with hpre | hrest
    · exact ⟨w, List.mem_append.mpr (.inl hpre), fun _ _ h => h⟩
    · rcases List.mem_cons.mp hrest with heq | hpost
      · cases heq
        exact ⟨v, List.mem_append.mpr (.inr List.mem_cons_self), hv⟩
      · exact ⟨w, List.mem_append.mpr (.inr (List.mem_cons_of_mem _ hpost)), fun _ _ h => h⟩
  · intro k₁ o₁ w he
    rcases List.mem_append.mp he with hpre | hrest
    · exact ⟨w, List.mem_append.mpr (.inl hpre), fun _ _ h => h⟩
    · rcases List.mem_cons.mp hrest with heq | hpost
      · cases heq
        exact ⟨v', List.mem_append.mpr (.inr List.mem_cons_self), hv⟩
      · exact ⟨w, List.mem_append.mpr (.inr (List.mem_cons_of_mem _ hpost)), fun _ _ h => h⟩

/-- A map judges as the map with its spread changed for one that judges
at least as it does under every key. -/
theorem judge_map_of_spread {b : Bool} {fs : List (String × Bool × Val)} {s s' : Val}
    {closed : Bool} {j : Data}
    (hs : ∀ k b j, Judge env root b (s.atKey k) j → Judge env root b (s'.atKey k) j)
    (h : Judge env root b (.map fs (some s) closed) j) :
    Judge env root b (.map fs (some s') closed) j := by
  cases h with
  | map hp ha hsp hc =>
    refine .map hp ha ?_ hc
    intro s₀ e k x hx
    cases e
    exact hs k true x (hsp s rfl k x hx)
  | mapNot hn => exact .mapNot hn
  | mapField he hx hj => exact .mapField he hx hj
  | mapMissing he hx ho => exact .mapMissing he hx ho
  | mapSpread e hx hj =>
    cases e
    exact .mapSpread rfl hx (hs _ false _ hj)
  | mapClosed hcl hx hn => exact .mapClosed hcl hx hn

/-- A list judges as the list with one element changed for one that
judges at least as it does. -/
theorem judge_list_of_element {b : Bool} {items : List Val} {i : ℕ} {v v' : Val}
    {spread : Option Val} {closed : Bool} {j : Data} (hi : items[i]? = some v)
    (hv : ∀ b j, Judge env root b v j → Judge env root b v' j)
    (h : Judge env root b (.list items spread closed) j) :
    Judge env root b (.list (items.set i v') spread closed) j := by
  have hlt : i < items.length := (List.getElem?_eq_some_iff.mp hi).1
  cases h with
  | list hlen hcl hpos hsp =>
    refine .list (by rw [List.length_set]; exact hlen)
      (fun h₁ h₂ => by rw [List.length_set]; exact hcl h₁ h₂) ?_ hsp
    intro n w x hn hx
    by_cases hin : i = n
    · subst hin
      rw [List.getElem?_set_self hlt] at hn
      cases hn
      exact hv true x (hpos i v x hi hx)
    · rw [List.getElem?_set_ne hin] at hn
      exact hpos n w x hn hx
  | listNot hn => exact .listNot hn
  | listShort hlen => exact .listShort (by rw [List.length_set]; exact hlen)
  | listLong hcl hsp hlen => exact .listLong hcl hsp (by rw [List.length_set]; exact hlen)
  | @listItem _ _ _ _ n w x hn hx hj =>
    by_cases hin : i = n
    · subst hin
      rw [hi] at hn
      cases hn
      exact .listItem (List.getElem?_set_self hlt) hx (hv false x hj)
    · exact .listItem (by rw [List.getElem?_set_ne hin]; exact hn) hx hj
  | listSpread hs hx hj => exact .listSpread hs hx hj

/-- A list judges as the list with its spread changed for one that
judges at least as it does under every key. -/
theorem judge_list_of_spread {b : Bool} {items : List Val} {s s' : Val} {closed : Bool} {j : Data}
    (hs : ∀ k b j, Judge env root b (s.atKey k) j → Judge env root b (s'.atKey k) j)
    (h : Judge env root b (.list items (some s) closed) j) :
    Judge env root b (.list items (some s') closed) j := by
  cases h with
  | list hlen hcl hpos hsp =>
    refine .list hlen (fun _ e => nomatch e) hpos ?_
    intro s₀ e k x hx
    cases e
    exact hs k true x (hsp s rfl k x hx)
  | listNot hn => exact .listNot hn
  | listShort hlen => exact .listShort hlen
  | listLong _ e _ => exact nomatch e
  | listItem hn hx hj => exact .listItem hn hx hj
  | listSpread e hx hj =>
    cases e
    exact .listSpread rfl hx (hs _ false _ hj)

/-- A disjunction judges as another whose arms answer its own: each arm
of either has one of the other's, of its rank, that judges at least as
it does. -/
theorem judge_or_of_arms {b : Bool} {as as' : List (ℕ × Val)} {j : Data}
    (hback : ∀ r a', (r, a') ∈ as' →
      ∃ a, (r, a) ∈ as ∧ ∀ b j, Judge env root b a j → Judge env root b a' j)
    (hforth : ∀ r a, (r, a) ∈ as →
      ∃ a', (r, a') ∈ as' ∧ ∀ b j, Judge env root b a j → Judge env root b a' j)
    (h : Judge env root b (.or as) j) : Judge env root b (.or as') j := by
  cases h with
  | or he hj =>
    obtain ⟨a', ha', himp⟩ := hforth _ _ he
    exact .or ha' (himp true j hj)
  | orNone hall =>
    refine .orNone ?_
    intro r a' he
    obtain ⟨a, ha, himp⟩ := hback r a' he
    exact himp false j (hall r a ha)

/-- A disjunction judges as the disjunction with one arm changed for one
that judges at least as it does. -/
theorem judge_or_of_arm {b : Bool} {pre post : List (ℕ × Val)} {r : ℕ} {a a' : Val} {j : Data}
    (ha : ∀ b j, Judge env root b a j → Judge env root b a' j)
    (h : Judge env root b (.or (pre ++ (r, a) :: post)) j) :
    Judge env root b (.or (pre ++ (r, a') :: post)) j := by
  refine judge_or_of_arms ?_ ?_ h
  · intro r₁ w he
    rcases List.mem_append.mp he with hpre | hrest
    · exact ⟨w, List.mem_append.mpr (.inl hpre), fun _ _ h => h⟩
    · rcases List.mem_cons.mp hrest with heq | hpost
      · cases heq
        exact ⟨a, List.mem_append.mpr (.inr List.mem_cons_self), ha⟩
      · exact ⟨w, List.mem_append.mpr (.inr (List.mem_cons_of_mem _ hpost)), fun _ _ h => h⟩
  · intro r₁ w he
    rcases List.mem_append.mp he with hpre | hrest
    · exact ⟨w, List.mem_append.mpr (.inl hpre), fun _ _ h => h⟩
    · rcases List.mem_cons.mp hrest with heq | hpost
      · cases heq
        exact ⟨a', List.mem_append.mpr (.inr List.mem_cons_self), ha⟩
      · exact ⟨w, List.mem_append.mpr (.inr (List.mem_cons_of_mem _ hpost)), fun _ _ h => h⟩

/-- A meet judges as the meet of its sides the other way round. -/
theorem judge_meet_comm {b : Bool} {x y : Val} {j : Data} (h : Judge env root b (.meet x y) j) :
    Judge env root b (.meet y x) j := by
  cases h with
  | meet hx hy => exact .meet hy hx
  | meetLeft hx => exact .meetRight hx
  | meetRight hy => exact .meetLeft hy

/-- Three values met judge alike however the two meets nest. -/
theorem judge_meet_assoc {b : Bool} {x y z : Val} {j : Data} :
    Judge env root b (.meet (.meet x y) z) j ↔ Judge env root b (.meet x (.meet y z)) j := by
  constructor
  · intro h
    cases h with
    | meet hxy hz => cases hxy with | meet hx hy => exact .meet hx (.meet hy hz)
    | meetLeft hxy =>
      cases hxy with
      | meetLeft hx => exact .meetLeft hx
      | meetRight hy => exact .meetRight (.meetLeft hy)
    | meetRight hz => exact .meetRight (.meetRight hz)
  · intro h
    cases h with
    | meet hx hyz => cases hyz with | meet hy hz => exact .meet (.meet hx hy) hz
    | meetLeft hx => exact .meetLeft (.meetLeft hx)
    | meetRight hyz =>
      cases hyz with
      | meetLeft hy => exact .meetLeft (.meetRight hy)
      | meetRight hz => exact .meetRight hz

/-- A meet judges as the meet with its left side changed for one that
judges at least as it does. -/
theorem judge_meet_of_side {b : Bool} {x x' y : Val} {j : Data}
    (hx : ∀ b j, Judge env root b x j → Judge env root b x' j)
    (h : Judge env root b (.meet x y) j) : Judge env root b (.meet x' y) j := by
  cases h with
  | meet h₁ h₂ => exact .meet (hx true j h₁) h₂
  | meetLeft h₁ => exact .meetLeft (hx false j h₁)
  | meetRight h₂ => exact .meetRight h₂

/-- `nof` judges as `nof` of its branches in another order: the count is
the same count. -/
theorem judge_nof_of_perm {b : Bool} {n : Val} {cs cs' : List Val} {j : Data} (hp : cs.Perm cs')
    (h : Judge env root b (.nof n cs) j) : Judge env root b (.nof n cs') j := by
  cases h with
  | nof hk hall hcount hn =>
    exact .nof hk (fun c hc => hall c (hp.mem_iff.mpr hc)) (by rw [← hp.countP_eq]; exact hcount) hn
  | nofBig hall hcount hk =>
    exact .nofBig (fun c hc => hall c (hp.mem_iff.mpr hc)) (by rw [← hp.countP_eq]; exact hcount) hk

/-- `nof` judges as `nof` with its count changed for one that judges at
least as it does. -/
theorem judge_nof_of_count {b : Bool} {n n' : Val} {cs : List Val} {j : Data}
    (hn : ∀ b j, Judge env root b n j → Judge env root b n' j)
    (h : Judge env root b (.nof n cs) j) : Judge env root b (.nof n' cs) j := by
  cases h with
  | nof hk hall hcount h₁ => exact .nof hk hall hcount (hn _ _ h₁)
  | nofBig hall hcount hk => exact .nofBig hall hcount hk

/-- `neq` judges as `neq` of its ends in another order. -/
theorem judge_neq_of_perm {b : Bool} {vs vs' : List Bound} {j : Data} (hp : vs.Perm vs')
    (h : Judge env root b (.neq vs) j) : Judge env root b (.neq vs') j := by
  cases h with
  | neq hall => exact .neq (fun v hv => hall v (hp.mem_iff.mpr hv))
  | neqStr hall => exact .neqStr (fun v hv => hall v (hp.mem_iff.mpr hv))
  | neqNot hnum hstr =>
    refine .neqNot ?_ ?_
    · intro x hx
      obtain ⟨v, hv, h⟩ := hnum x hx
      exact ⟨v, hp.mem_iff.mp hv, h⟩
    · intro s hs
      obtain ⟨v, hv, h⟩ := hstr s hs
      exact ⟨v, hp.mem_iff.mp hv, h⟩

/-- A preference judges as the preference of a value that judges at
least as its own does, and whose parent type does too. -/
theorem judge_pref_of {b : Bool} {r : ℕ} {x x' : Val} {j : Data}
    (hx : ∀ b j, Judge env root b x j → Judge env root b x' j)
    (hs : ∀ b j, Judge env root b x.super j → Judge env root b x'.super j)
    (h : Judge env root b (.pref r x) j) : Judge env root b (.pref r x') j := by
  cases h with
  | pref h₁ => exact .pref (hx true j h₁)
  | prefSuper h₁ => exact .prefSuper (hs true j h₁)
  | prefNone h₁ h₂ => exact .prefNone (hx false j h₁) (hs false j h₂)

/-- A conditional judges as the conditional with its condition changed
for one that judges at least as it does. -/
theorem judge_when_of_cond {b : Bool} {c c' t : Val} {e : Option Val} {j : Data}
    (hc : ∀ b j, Judge env root b c j → Judge env root b c' j)
    (h : Judge env root b (.when c t e) j) : Judge env root b (.when c' t e) j := by
  cases h with
  | whenThen h₁ h₂ => exact .whenThen (hc true j h₁) h₂
  | whenElse h₁ h₂ => exact .whenElse (hc false j h₁) h₂
  | whenPass h₁ => exact .whenPass (hc false j h₁)

/-- A conditional judges as the conditional with its branch changed for
one that judges at least as it does. -/
theorem judge_when_of_then {b : Bool} {c t t' : Val} {e : Option Val} {j : Data}
    (ht : ∀ b j, Judge env root b t j → Judge env root b t' j)
    (h : Judge env root b (.when c t e) j) : Judge env root b (.when c t' e) j := by
  cases h with
  | whenThen h₁ h₂ => exact .whenThen h₁ (ht _ j h₂)
  | whenElse h₁ h₂ => exact .whenElse h₁ h₂
  | whenPass h₁ => exact .whenPass h₁

/-- A conditional judges as the conditional with its other branch changed
for one that judges at least as it does. -/
theorem judge_when_of_else {b : Bool} {c t e e' : Val} {j : Data}
    (he : ∀ b j, Judge env root b e j → Judge env root b e' j)
    (h : Judge env root b (.when c t (some e)) j) : Judge env root b (.when c t (some e')) j := by
  cases h with
  | whenThen h₁ h₂ => exact .whenThen h₁ h₂
  | whenElse h₁ h₂ => exact .whenElse h₁ (he _ j h₂)

/-- `contains` judges as `contains` of a member's schema that judges at
least as its own does. -/
theorem judge_contains_of {b : Bool} {c c' n : Val} {j : Data}
    (hc : ∀ b j, Judge env root b c j → Judge env root b c' j)
    (h : Judge env root b (.contains c n) j) : Judge env root b (.contains c' n) j := by
  cases h with
  | contains hk hm hall hcount hn => exact .contains hk hm (fun x hx => hc _ x (hall x hx)) hcount hn
  | containsNone hm => exact .containsNone hm
  | containsBig hm hall hcount hk => exact .containsBig hm (fun x hx => hc _ x (hall x hx)) hcount hk

/-- `contains` judges as `contains` with its count changed for one that
judges at least as it does. -/
theorem judge_contains_of_count {b : Bool} {c n n' : Val} {j : Data}
    (hn : ∀ b j, Judge env root b n j → Judge env root b n' j)
    (h : Judge env root b (.contains c n) j) : Judge env root b (.contains c n') j := by
  cases h with
  | contains hk hm hall hcount h₁ => exact .contains hk hm hall hcount (hn _ _ h₁)
  | containsNone hm => exact .containsNone hm
  | containsBig hm hall hcount hk => exact .containsBig hm hall hcount hk

/-- `len` judges as `len` of a size's schema that judges at least as its
own does and lies in `len`'s domain as it does. -/
theorem judge_len_of {b : Bool} {c c' : Val} {j : Data}
    (hc : ∀ b j, Judge env root b c j → Judge env root b c' j) (hu : c.unsized = c'.unsized)
    (h : Judge env root b (.len c) j) : Judge env root b (.len c') j := by
  cases h with
  | len hk hun hsize h₁ => exact .len hk (hu ▸ hun) hsize (hc _ _ h₁)
  | lenNone hsize => exact .lenNone hsize
  | lenBig hsize hk => exact .lenBig hsize hk
  | lenOut hun => exact .lenOut (hu ▸ hun)

/-! ## The invariant -/

/-- Order independence: two terms that are one value written in two
orders judge every datum alike. Neither admits what the other refuses,
and neither judges what the other leaves unjudged. -/
theorem Val.Reordered.judge {v w : Val} (h : v.Reordered w) :
    ∀ (env : Env) (root : Data) (b : Bool) (j : Data),
      Judge env root b v j ↔ Judge env root b w j := by
  induction h with
  | refl => exact fun _ _ _ _ => Iff.rfl
  | symm _ ih => exact fun env root b j => (ih env root b j).symm
  | trans _ _ ih₁ ih₂ => exact fun env root b j => (ih₁ env root b j).trans (ih₂ env root b j)
  | members _ _ hp => exact fun _ _ _ _ => ⟨judge_map_of_perm hp, judge_map_of_perm hp.symm⟩
  | sides => exact fun _ _ _ _ => ⟨judge_meet_comm, judge_meet_comm⟩
  | nest => exact fun _ _ _ _ => judge_meet_assoc
  | arms hp =>
    exact fun _ _ _ _ =>
      ⟨judge_or_of_arms (fun _ a he => ⟨a, hp.mem_iff.mpr he, fun _ _ h => h⟩)
          (fun _ a he => ⟨a, hp.mem_iff.mp he, fun _ _ h => h⟩),
        judge_or_of_arms (fun _ a he => ⟨a, hp.mem_iff.mp he, fun _ _ h => h⟩)
          (fun _ a he => ⟨a, hp.mem_iff.mpr he, fun _ _ h => h⟩)⟩
  | branches _ hp => exact fun _ _ _ _ => ⟨judge_nof_of_perm hp, judge_nof_of_perm hp.symm⟩
  | ends hp => exact fun _ _ _ _ => ⟨judge_neq_of_perm hp, judge_neq_of_perm hp.symm⟩
  | member _ _ _ _ _ _ _ ih =>
    exact fun env root _ _ =>
      ⟨judge_map_of_member fun b j => (ih env root b j).mp,
        judge_map_of_member fun b j => (ih env root b j).mpr⟩
  | spread _ _ _ ih =>
    exact fun env root _ _ =>
      ⟨judge_map_of_spread fun k b j => (ih k env root b j).mp,
        judge_map_of_spread fun k b j => (ih k env root b j).mpr⟩
  | @element v v' items i spread closed hi _ ih =>
    intro env root b j
    constructor
    · exact judge_list_of_element hi fun b j => (ih env root b j).mp
    · intro h
      obtain ⟨hlt, heq⟩ := List.getElem?_eq_some_iff.mp hi
      have hback := judge_list_of_element (v' := v) (List.getElem?_set_self hlt)
        (fun b j => (ih env root b j).mpr) h
      rw [List.set_set, ← heq, List.set_getElem_self hlt] at hback
      exact hback
  | elements _ _ _ ih =>
    exact fun env root _ _ =>
      ⟨judge_list_of_spread fun k b j => (ih k env root b j).mp,
        judge_list_of_spread fun k b j => (ih k env root b j).mpr⟩
  | side _ _ ih =>
    exact fun env root _ _ =>
      ⟨judge_meet_of_side fun b j => (ih env root b j).mp,
        judge_meet_of_side fun b j => (ih env root b j).mpr⟩
  | arm _ _ _ _ ih =>
    exact fun env root _ _ =>
      ⟨judge_or_of_arm fun b j => (ih env root b j).mp,
        judge_or_of_arm fun b j => (ih env root b j).mpr⟩
  | pref _ _ hs ih =>
    exact fun env root _ _ =>
      ⟨judge_pref_of (fun b j => (ih env root b j).mp) (fun b j => (hs env root b j).mp),
        judge_pref_of (fun b j => (ih env root b j).mpr) (fun b j => (hs env root b j).mpr)⟩
  | ride _ _ _ ih =>
    exact fun env root b j =>
      ⟨fun h => by cases h with | ride h => exact .ride ((ih env root b j).mp h),
        fun h => by cases h with | ride h => exact .ride ((ih env root b j).mpr h)⟩
  | link _ _ ih _ =>
    exact fun env root b j =>
      ⟨fun h => by cases h with | link h => exact .link ((ih env root b j).mp h),
        fun h => by cases h with | link h => exact .link ((ih env root b j).mpr h)⟩
  | must _ _ ih =>
    exact fun env root b j =>
      ⟨fun h => by cases h with | must h => exact .must ((ih env root b j).mp h),
        fun h => by cases h with | must h => exact .must ((ih env root b j).mpr h)⟩
  | cond _ _ _ ih =>
    exact fun env root _ _ =>
      ⟨judge_when_of_cond fun b j => (ih env root b j).mp,
        judge_when_of_cond fun b j => (ih env root b j).mpr⟩
  | thenOf _ _ _ ih =>
    exact fun env root _ _ =>
      ⟨judge_when_of_then fun b j => (ih env root b j).mp,
        judge_when_of_then fun b j => (ih env root b j).mpr⟩
  | elseOf _ _ _ ih =>
    exact fun env root _ _ =>
      ⟨judge_when_of_else fun b j => (ih env root b j).mp,
        judge_when_of_else fun b j => (ih env root b j).mpr⟩
  | count _ _ ih =>
    exact fun env root _ _ =>
      ⟨judge_nof_of_count fun b j => (ih env root b j).mp,
        judge_nof_of_count fun b j => (ih env root b j).mpr⟩
  | contained _ _ ih =>
    exact fun env root _ _ =>
      ⟨judge_contains_of fun b j => (ih env root b j).mp,
        judge_contains_of fun b j => (ih env root b j).mpr⟩
  | containing _ _ ih =>
    exact fun env root _ _ =>
      ⟨judge_contains_of_count fun b j => (ih env root b j).mp,
        judge_contains_of_count fun b j => (ih env root b j).mpr⟩
  | sized _ hu ih =>
    exact fun env root _ _ =>
      ⟨judge_len_of (fun b j => (ih env root b j).mp) hu,
        judge_len_of (fun b j => (ih env root b j).mpr) hu.symm⟩

end

/-- Two terms that are one value in two orders admit the same data. -/
theorem Val.Reordered.admits {v w : Val} (h : v.Reordered w) (env : Env) (root j : Data) :
    Admits env root v j ↔ Admits env root w j :=
  h.judge env root true j

/-- Two terms that are one value in two orders have the same instances. -/
theorem Val.Reordered.instance_iff {v w : Val} (h : v.Reordered w) (env : Env) (j : Data) :
    Instance env v j ↔ Instance env w j :=
  ⟨fun hi => ⟨hi.1, (h.judge env j true j).mp hi.2⟩, fun hi => ⟨hi.1, (h.judge env j true j).mpr hi.2⟩⟩

/-- Two terms that are one value in two orders lie below each other, so
no `subsume` may tell them apart. -/
theorem Val.Reordered.le {v w : Val} (h : v.Reordered w) (env : Env) : v ⊑[env] w :=
  fun j hi => (h.instance_iff env j).mp hi

/-- A reordering is one under every key, which is what a spread asks of
its template (`Val.Reordered.spread`, `Val.Reordered.elements`). -/
theorem Val.Reordered.atKey {v w : Val} (h : v.Reordered w) (k : String) :
    (v.atKey k).Reordered (w.atKey k) := by
  induction h with
  | refl => exact .refl _
  | symm _ ih => exact .symm ih
  | trans _ _ ih₁ ih₂ => exact .trans ih₁ ih₂
  | members spread closed hp => exact .members spread closed hp
  | sides a b => exact .sides _ _
  | nest a b c => exact .nest _ _ _
  | arms hp => exact .arms hp
  | branches n hp => exact .branches n hp
  | ends hp => exact .ends hp
  | member pre post k₁ o spread closed h _ => exact .member pre post k₁ o spread closed h
  | spread fs closed h _ => exact .spread fs closed h
  | element items i spread closed hi h _ => exact .element items i spread closed hi h
  | elements items closed h _ => exact .elements items closed h
  | side b _ ih => exact .side _ ih
  | arm pre post r h _ => exact .arm pre post r h
  | pref r h hs _ => exact .pref r h hs
  | ride t r _ ih => exact .ride t r ih
  | link _ ht ih _ => exact .link ih ht
  | must m h _ => exact .must m h
  | cond t e h _ => exact .cond t e h
  | thenOf c e h _ => exact .thenOf c e h
  | elseOf c t h _ => exact .elseOf c t h
  | count cs h _ => exact .count cs h
  | contained n h _ => exact .contained n h
  | containing c h _ => exact .containing c h
  | sized h hu _ => exact .sized h hu

/-! ## Declarations in any order

A name declared twice is declared as the meet of its declarations, so
the order a document declares its names in is the order of a meet's
sides, which no judgement reads. -/

/-- `env'` declares what `env` declares, each name as a value that
judges, under any declarations, at least as its value in `env` does. -/
def Env.Follows (env env' : Env) : Prop :=
  ∀ n, (env n = none → env' n = none) ∧
    ∀ v, env n = some v → ∃ v', env' n = some v' ∧
      ∀ (e : Env) (root : Data) (b : Bool) (j : Data), Judge e root b v j → Judge e root b v' j

/-- A judgement under one environment is a judgement under any that
follows it: a rule reads the declarations at a name and nowhere else. -/
theorem judge_of_follows {env env' : Env} (hf : env.Follows env') {root : Data} {b : Bool}
    {v : Val} {j : Data} (h : Judge env root b v j) : Judge env' root b v j := by
  induction h with
  | alias he _ ih =>
    obtain ⟨v', he', himp⟩ := (hf _).2 _ he
    exact .alias he' (himp env' _ _ _ ih)
  | aliasNone he => exact .aliasNone ((hf _).1 he)
  | _ => judge_rebuild

section
variable {env : Env} {root : Data} {j : Data}

/-- Values met one after another admit what each of them admits. -/
theorem judge_foldl_meet_true : ∀ (l : List Val) (a : Val),
    Judge env root true (l.foldl .meet a) j ↔
      Judge env root true a j ∧ ∀ x, x ∈ l → Judge env root true x j
  | [], _ => ⟨fun h => ⟨h, fun _ hx => nomatch hx⟩, fun h => h.1⟩
  | x :: l, a => by
    rw [List.foldl_cons, judge_foldl_meet_true l (.meet a x)]
    constructor
    · rintro ⟨hm, hl⟩
      cases hm with
      | meet ha hx =>
        refine ⟨ha, fun y hy => ?_⟩
        rcases List.mem_cons.mp hy with rfl | hy
        · exact hx
        · exact hl y hy
    · rintro ⟨ha, hall⟩
      exact ⟨.meet ha (hall x List.mem_cons_self), fun y hy => hall y (List.mem_cons_of_mem _ hy)⟩

/-- Values met one after another refuse what any one of them refuses. -/
theorem judge_foldl_meet_false : ∀ (l : List Val) (a : Val),
    Judge env root false (l.foldl .meet a) j ↔
      Judge env root false a j ∨ ∃ x, x ∈ l ∧ Judge env root false x j
  | [], _ => ⟨fun h => .inl h, fun h => h.elim id fun ⟨_, hx, _⟩ => nomatch hx⟩
  | x :: l, a => by
    rw [List.foldl_cons, judge_foldl_meet_false l (.meet a x)]
    constructor
    · rintro (hm | ⟨y, hy, hj⟩)
      · cases hm with
        | meetLeft ha => exact .inl ha
        | meetRight hx => exact .inr ⟨x, List.mem_cons_self, hx⟩
      · exact .inr ⟨y, List.mem_cons_of_mem _ hy, hj⟩
    · rintro (ha | ⟨y, hy, hj⟩)
      · exact .inl (.meetLeft ha)
      · rcases List.mem_cons.mp hy with rfl | hy
        · exact .inl (.meetRight hj)
        · exact .inr ⟨y, hy, hj⟩

end

/-- A reference reads a meet of bodies as the meet of each body as a
reference reads it. -/
theorem foldl_meet_unident_unmark : ∀ (l : List Val) (a : Val),
    (l.foldl .meet a).unident.unmark =
      (l.map fun x => x.unident.unmark).foldl .meet a.unident.unmark
  | [], _ => rfl
  | x :: l, a => by
    rw [List.foldl_cons, foldl_meet_unident_unmark l (.meet a x)]
    simp only [List.map_cons, List.foldl_cons, Val.unident, Val.unmark]

/-- Declarations in another order make an environment that follows the
first: each name is the meet of the same bodies. -/
theorem Decls.env_follows_of_perm {ds ds' : Decls} (hp : ds.Perm ds') :
    (Decls.env ds).Follows (Decls.env ds') := by
  intro n
  have hb : (ds.bodies n).Perm (ds'.bodies n) := (hp.filter _).map _
  unfold Decls.env
  cases h : ds.bodies n with
  | nil =>
    rw [h] at hb
    rw [hb.symm.eq_nil]
    exact ⟨fun _ => rfl, fun _ hv => nomatch hv⟩
  | cons v vs =>
    cases h' : ds'.bodies n with
    | nil =>
      rw [h, h'] at hb
      exact nomatch hb.eq_nil
    | cons v' vs' =>
      refine ⟨(fun e => nomatch e), ?_⟩
      intro w hw
      cases hw
      refine ⟨_, rfl, ?_⟩
      intro e root b j hj
      rw [h, h'] at hb
      have hm : ∀ x, x ∈ (v :: vs).map (fun x => x.unident.unmark) ↔
          x ∈ (v' :: vs').map (fun x => x.unident.unmark) :=
        fun x => (hb.map _).mem_iff
      rw [foldl_meet_unident_unmark] at hj ⊢
      cases b with
      | true =>
        rw [judge_foldl_meet_true] at hj ⊢
        have hall : ∀ x, x ∈ (v :: vs).map (fun x => x.unident.unmark) → Judge e root true x j := by
          intro x hx
          rcases List.mem_cons.mp hx with rfl | hx
          · exact hj.1
          · exact hj.2 x hx
        exact ⟨hall _ ((hm _).mpr List.mem_cons_self),
          fun x hx => hall x ((hm x).mpr (List.mem_cons_of_mem _ hx))⟩
      | false =>
        rw [judge_foldl_meet_false] at hj ⊢
        have hex : ∃ x, x ∈ (v :: vs).map (fun x => x.unident.unmark) ∧ Judge e root false x j := by
          rcases hj with ha | ⟨x, hx, hf⟩
          · exact ⟨_, List.mem_cons_self, ha⟩
          · exact ⟨x, List.mem_cons_of_mem _ hx, hf⟩
        obtain ⟨x, hx, hf⟩ := hex
        rcases List.mem_cons.mp ((hm x).mp hx) with rfl | hx'
        · exact .inl hf
        · exact .inr ⟨x, hx', hf⟩

/-- A document's declarations in any order judge every value alike. -/
theorem judge_env_of_perm {ds ds' : Decls} (hp : ds.Perm ds') {root : Data} {b : Bool} {v : Val}
    {j : Data} : Judge ds.env root b v j ↔ Judge ds'.env root b v j :=
  ⟨judge_of_follows (Decls.env_follows_of_perm hp),
    judge_of_follows (Decls.env_follows_of_perm hp.symm)⟩

/-! ## The contract

`Val.Reordered.judge` and `judge_env_of_perm` are about what a document
admits. A verdict, an output and a canon are readings of a document
too, and each is held to the same demand. -/

/-- A reading of a document is independent of the order the document is
written in: declarations in any order, and a schema that is one value in
two orders, read alike against every datum. It names no algorithm, as
`SubsumeCorrect` names none. -/
def OrderIndependent {α : Type} (read : Decls → Val → Data → α) : Prop :=
  ∀ (ds ds' : Decls) (S S' : Val) (j : Data),
    ds.Perm ds' → S.Reordered S' → read ds S j = read ds' S' j

/-- What a document admits is independent of the order it is written
in. -/
theorem instance_orderIndependent : OrderIndependent fun ds S j => Instance ds.env S j := by
  intro ds ds' S S' j hp hr
  exact propext
    ⟨fun hi => ⟨hi.1, (hr.judge _ _ _ _).mp ((judge_env_of_perm hp).mp hi.2)⟩,
      fun hi => ⟨hi.1, (judge_env_of_perm hp).mpr ((hr.judge _ _ _ _).mpr hi.2)⟩⟩

end Aontu
