# Patches awaiting a push with the `workflow` scope

A change under `.github/workflows/` can only be pushed by a credential
that holds GitHub's `workflow` scope. When a writing session does not
have that scope, the change travels here instead as a patch against
`main`, for a maintainer to apply and push.

Remove the patch in the same change that applies it, so this folder
holds only what is still pending.

## Pending patches

### `docs-workflow-recorded-alert-counts.patch`

Adds a `Recorded alert counts` step to the `prose` job in
`.github/workflows/docs.yml`, running `node ts/scripts/vale-counts.cjs`
after the Vale gate that is already there.

`.vale.ini` gives every demoted rule the number of alerts it produced,
and `docs/STYLE-GUIDE.md` repeats the total. Both numbers were written
by hand, and both were out by a factor of two before anything compared
them to a run. The script compares them and fails on drift.
`make prose` runs it locally and the style guide names it as a gate, so
the only thing missing is the CI half: until this step exists a branch
that skips the local target can move a number without anything noticing.

`ts/scripts/vale-counts.cjs` is already on `main`, but the numbers it
reads are not yet right there: `main` records 3851 alerts where Vale
reports 3853, drift that accumulated because nothing in CI was
checking. Run `make prose` before applying this patch. If it fails,
land the correction first, or the new step fails on its first run;
[#215](https://github.com/aontu-lang/aontu/pull/215) carries it.

Apply it with:

```sh
git am patch/docs-workflow-recorded-alert-counts.patch
```

Then delete the patch, restore this section to `None.`, and fold both
into the applied commit with `git commit --amend`.
