# 13. Recursive schema: an approval chain, one reference deep, any data deep

An approval chain: each step names an approver and a decision, and
may hand on to a following step, for as many steps as the policy
needs. Nothing fixes the depth in advance, so the schema has to hold
at any depth. The vocabulary says `then?: $.spec.Step` inside `Step`,
and that reference means the fixpoint: no marker, no annotation, no
unrolled copies.

![The model tree: a recursive step schema and the approval chain that instantiates it](expected/diagram-doc.svg)

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
at every depth: the residual the self-reference leaves behind expands
one level per meet with concrete data, so the checks descend exactly
as far as the data does, and no further. Depth never has to be guessed
in advance.

The three moments of the residual:

- **Evaluation**—met by concrete structure, expand one level, per
  destination and under the same clone discipline a spread uses. Data
  is finite, so expansion terminates; the depth budget is the backstop.
- **Canon and the `aon1-` hash**—symbolic: the instance unrolls to
  its data and then says `$.spec.Step`; the definition stays one
  reference deep. A recursive schema's canonical form is finite,
  reparses to itself, and its hash pins the mu-form—one string for
  an infinitely deep type.
- **Generation**—an unexpanded residual in a demanded position
  refuses with `[aontu/recursion_unexpanded]`. Guardedness is
  therefore emergent: under `then?:` the refusal is isolated and the
  optional key drops; a required recursive tail refuses at the exact
  position no finite document can fill (bad/required-tail.aon). The
  engine never analyses the schema for well-foundedness—the data
  decides.

## The model tree

`model.aon` is the schema and one instance of it. The recursion is in
`spec`, whose step shape names itself through an optional key;
`payments_policy` is the approval chain that expands it, one level per
step, ending where the optional key drops.

```
$
├── payments_policy
│   ├── chain
│   │   ├── approver "lead@acme.example"
│   │   ├── decision "approved"
│   │   └── then (3)
│   └── name "payments-change"
└── spec
    ├── Policy
    │   ├── chain $.spec.Step
    │   └── name string
    └── Step
        ├── approver re("^[a-z]+@acme[.]example$")
        ├── decision *"pending"|"pending"|"approve...
        └── then $.spec.Step
```

`aontu view doc --depth 3 model.aon` draws it, and `check.sh` pins it
with `--out --check`. A key with `(n)` after it is a container the
depth bound stopped at, and `n` is how many keys are not drawn; a
leaf carries its canon, which is the kind of thing it is rather
than its value.

## What check.sh proves

1. The good model generates (expected/model.json): one expansion per
   level of data, and the leaf's `decision` falls back to the ranked
   default.
2. Canon renders the recursion symbolically (`"then"?:$.spec.Step`),
   never unrolled.
3. The canon reparses to itself—an engine's own output converges to
   the same canon, whatever order the reparse resolves in.
4. `hash schema.aon` answers a single `aon1-` string: the mu-form as
   a schema version pin.
5. `vet --at '$.spec.Step'` accepts a plain-JSON chain
   (data/chain-good.json)—no aontu syntax in the data at all.
6. The same vet refuses data/chain-bad.json one level down, both
   findings located in the schema's namespace
   (`$.spec.Step.then.approver`, `$.spec.Step.then.decision`).
7. Full-model evaluation refuses a wrong approver two levels down
   with an ordinary located conflict
   (`$.payments_policy.chain.then.approver`).
8. A schema whose recursive tail is required is accepted, and
   generation then refuses with `[aontu/recursion_unexpanded]` where
   the chain ran out (`$.doc.then.then`).

## Run

    ./check.sh          # all assertions
    AONTU="go run ../../go/cmd/aontu" ./check.sh   # same checks, Go engine

The shared spec pins the same behaviour in test/spec/recursion.tsv,
which both engines run; this case exercises it through the CLI.
