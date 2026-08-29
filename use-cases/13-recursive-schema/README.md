# 13 — recursive schema: an approval chain, one reference deep, any data deep

The dedicated exercise of recursive schemas
(docs/design/RECURSION.0.md, landed 2026-08-29). The vocabulary says
`then?: $.spec.Step` INSIDE `Step`, and that reference simply MEANS
the fixpoint: no marker, no annotation, no unrolled copies.

## The model

An approval-chain vocabulary (schema.aon): a `Step` is an approver, a
decision, and optionally the step that follows it; a `Policy` is a
named root step.

    Step: {
      approver: string & re("^[a-z]+@acme[.]example$")
      decision: *pending | pending | approved | rejected
      then?: $.spec.Step
    }

The data (policy.aon) is a plain three-level chain. The schema applies
AT EVERY DEPTH: the residual the self-reference leaves behind expands
one level per meet with concrete data, so the checks descend exactly
as far as the data does, and no further. Depth never has to be guessed
in advance.

The three moments of the residual:

- **Evaluation** — met by concrete structure, expand one level
  (per destination, ADR-005's clone discipline). Data is finite, so
  expansion terminates; the depth budget is the backstop.
- **Canon and the `aon1-` hash** — SYMBOLIC: the instance unrolls to
  its data and then says `$.spec.Step`; the definition stays one
  reference deep. A recursive schema's canonical form is finite,
  reparses to itself, and its hash pins the mu-form — one string for
  an infinitely deep type.
- **Generation** — an unexpanded residual in a demanded position
  refuses (`recursion_unexpanded`). Guardedness is therefore
  EMERGENT: under `then?:` the refusal is isolated and the optional
  key drops; a REQUIRED recursive tail refuses at the exact position
  no finite document can fill (bad/required-tail.aon). The engine
  never analyses the schema for well-foundedness — the data decides.

## What check.sh proves

1. The good model generates: one expansion per level of data, the
   leaf's `decision` falls back to the ranked default.
2. Canon renders the recursion symbolically (`"then"?:$.spec.Step`),
   never unrolled.
3. The canon reparses to itself — an engine's own output converges to
   the same canon, whatever order the reparse resolves in.
4. `hash schema.aon` answers one fixed `aon1-` string: the mu-form as
   a schema version pin.
5. `vet --at '$.spec.Step'` accepts a plain-JSON chain
   (data/chain-good.json) — no aontu syntax in the data at all.
6. The same vet refuses data/chain-bad.json ONE LEVEL DOWN, both
   findings located in the schema's namespace
   (`$.spec.Step.then.approver`, `$.spec.Step.then.decision`).
7. Full-model evaluation refuses a wrong approver two levels down
   with an ordinary located conflict
   (`$.payments_policy.chain.then.approver`).
8. A schema whose recursive tail is REQUIRED evaluates fine and then
   refuses at generation with `recursion_unexpanded` where the chain
   ran out (`$.doc.then.then`).

## Run

    ./check.sh          # all assertions
    AONTU="go run ../../go/cmd/aontu" ./check.sh   # same checks, Go engine

Shared-spec pins for the behaviour live in test/spec/recursion.tsv
(both engines run them); this case shows the same truths through the
CLI surface an author actually touches.
