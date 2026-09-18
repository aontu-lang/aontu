# Alias file scope — implementation note

`ALIASES.0.md` sections 5 to 7 specify that an alias belongs to the file
that declares it, and crosses only by `export` and a named import. The
engine has none of it. This note is what the work is, and
`test/spec/alias.tsv` carries the rows that decide when it is done.

## What is true today

Aliases are **document-global**. `%t` is `$.%t`, root-absolute by
construction, and `@"…"` merges every file of one parse into one root,
so all declarations land in one table. Both directions leak, and a name
collision between unrelated files merges silently wherever the two
bodies happen to unify.

Two separately *parsed* roots — schema and data under `vet` — already
behave correctly, because each resolves its own names before the two
meet. So the target behaviour exists and is observable at one boundary
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

## Done means

The nine rows named `alias-include-does-not-see-includer-name`,
`alias-includer-does-not-see-unexported`,
`alias-same-name-in-two-files-stays-separate`, `alias-export-*` and
`alias-import-*` pass in both ports, and
`alias-template-resolves-where-written` and
`alias-include-still-carries-values` still pass.
