import Oracle.Base

/-! The reader's part the oracle plays for the output option `custom`:
the definition takes a `gen` record's expression as data, and the reader
writes it so. -/

open Aontu

/-- A document as the reader reads it: the expression each `gen` record
writes under `custom` held as its quotation (`Val.quote`), the term
written in it read so first. -/
partial def Aontu.Val.readCustom : Val → Val
  | .call .gen [.map fs sp cl] =>
    .call .gen [.map (fs.map fun f => (f.1, f.2.1,
      if f.1 = "custom" then f.2.2.readCustom.quote.term else f.2.2.readCustom)) sp cl]
  | .call f args => .call f (args.map Val.readCustom)
  | .map fs sp cl => .map (fs.map fun f => (f.1, f.2.1, f.2.2.readCustom)) (sp.map Val.readCustom) cl
  | .list xs sp cl => .list (xs.map Val.readCustom) (sp.map Val.readCustom) cl
  | .meet a b => .meet a.readCustom b.readCustom
  | .or arms => .or (arms.map fun a => (a.1, a.2.readCustom))
  | .pref r x => .pref r x.readCustom
  | .ride k v r => .ride k v.readCustom r
  | v => v
