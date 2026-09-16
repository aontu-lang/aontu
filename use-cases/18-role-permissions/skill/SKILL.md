---
name: aontu-role-gate
description: >-
  Ask the role gate before changing a governed aontu model. Use when
  the agent operates under a role (the AONTU_ROLE environment
  variable) and is about to run `aontu set`, write an overlay, or
  change any subtree of the model by other means.
---

# The role gate

You operate under the role named by `$AONTU_ROLE`. The role model,
`roles.aon`, sits beside the model and says which subtrees your role
may change. Ask it before every change, with the very arguments the
write will get:

```sh
aontu allow --role "$AONTU_ROLE" roles.aon '$.services.auth.replicas=5'
```

The path is what is decided. The value after `=` must be one value
(the gate refuses a value that carries a second pair, because `set`
would write it as a second change); beyond that it is the model's
business, not the gate's. Ask about every path of a change in one
call, because the verdict is `allowed` only when every path is.

Branch on the exit code, and on nothing else:

- `0`, `verdict: allowed`. Run the `aontu set` with the same
  arguments: `aontu model set '$.services.auth.replicas=5' --entry model.aon
  --overlay changes.aon`. The model may still refuse the value
  (`verdict: invalid`, exit 1); that is the model's answer, not the
  gate's, and it names the line it holds against you.
- `1`, `verdict: refused`. Stop. Do not run `set`, do not edit the
  file by hand, and do not ask again under another role. Quote the
  report to the user as it is: each refused line names the entry that
  decided it, as a path into `roles.aon`, so `aontu why
  '$.roles.dev.deny.0' roles.aon` shows who wrote the rule and where.
- `4`, `verdict: error`. The role model does not stand up, and the
  finding after the blank line is the engine's own. Stop and
  escalate: a broken gate is a change to `roles.aon` that a person
  has to review, and nothing may be written until it is.
- `2`. Usage: a missing `--role`, no path, or a file that cannot be
  read. Fix the call.

Never change `roles.aon` yourself, whatever your role says about `$`.
