# Alias file scope — implementation note

**Status: DONE 2026-09-18, in both ports.** `ALIASES.0.md` sections 5 to
7 specify that an alias belongs to the file that declares it, and
crosses only by `export` and a named import. The engine had none of it.
This note is the route that was taken; `test/spec/alias.tsv` carries the
rows that decided when it was done, and they are green.

## What was true before it

Aliases were **document-global**. `%t` is `$.%t`, root-absolute by
construction, and `@"…"` merges every file of one parse into one root,
so all declarations landed in one table. Both directions leaked, and a
name collision between unrelated files merged silently wherever the two
bodies happened to unify.

Two separately *parsed* roots — schema and data under `vet` — already
behaved correctly, because each resolves its own names before the two
meet. So the target behaviour existed and was observable at one boundary
and not the other.

## The route

`site.url` already identifies the file a value was written in, for every
value, across include boundaries. A declaration and a reference each
know their own file at parse time, which is all lexical scope needs.

Scoping the alias key by that url gives the four failing scope rows at
once:

- a reference in the included file cannot see the includer's key;
- a reference in the includer cannot see the included file's key;
- two files declaring one name hold two distinct keys;
- a reference inside a template that travels to another file still
  resolves, because it was bound to its own file's key when it was
  written, not when it landed.

The last is the one that makes this lexical rather than positional, and
it is the case apidef's model depends on: the `&:` rule that carries
`%field-args` is written in `apidef.aon` and instantiated against
entities declared elsewhere.

What the scoped key must not disturb: `aliasName` answers the bare name,
so canon still erases an alias to its declaration; `alias_in_path` still
refuses a scoped segment, since it matches on the sigil prefix; and the
root's `aliasKeys` still hides declarations from the output.

## `export` and the destructure

`export({ %a, %b })` is a self-erasing declaration listing which of a
file's names are published. `{ %a } = @"f.aon"` places `f.aon`'s values
exactly as a plain include does and also binds `%a` in the importing
file's scope. `{%}` takes every exported name. An unexported name cannot
be bound, and the refusal names the name.

Both are new syntax in both ports, with `export_arg` and
`import_not_exported` as their refusals.

## Two things the route did not foresee

**Key order is resolution order.** Renaming a declaration in place moved
it to the end of its map, which made `%a = %a` a path cycle rather than
the unexpanded recursion it had always been: the use settled before the
declaration did. The map is rebuilt in its written order instead.

**A refused colon declaration still names something.** `%foo: 1` is
refused, and `a: %foo` had reported that refusal because the reference
reached it. Scoping the key took the refusal out of reach and left
`no_path` — a worse message for the same mistake — so the refusal is
held under the key the name would have had, and is still generated,
since it is not recorded as an alias.

## Done means

The nine rows named `alias-include-does-not-see-includer-name`,
`alias-includer-does-not-see-unexported`,
`alias-same-name-in-two-files-stays-separate`, `alias-export-*` and
`alias-import-*` pass in both ports, and
`alias-template-resolves-where-written` and
`alias-include-still-carries-values` still pass. **They do**, together
with twelve more rows the work added. Nine in `alias.tsv`: five refuse
what the two new forms made writable (`alias-export-wildcard-refused`,
`alias-export-nested-refused` with its path row,
`alias-import-undeclared-refused`, `alias-import-from-a-scalar-refused`
and `alias-import-under-key-refused`); two pin what the refusals say
(`alias-import-unexported-names-it`, `alias-redeclare-conflicts-path`);
and two pin what a name that arrives does
(`alias-import-meets-a-local-declaration`). Three in `fmt.tsv` pin both
spellings through the formatter.
