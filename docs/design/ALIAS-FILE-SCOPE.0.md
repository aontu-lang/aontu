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
`%field-args` is written in `apidef.aontu` and instantiated against
entities declared elsewhere.

What the scoped key must not disturb: `aliasName` answers the bare name,
so canon still erases an alias to its declaration; `alias_in_path` still
refuses a scoped segment, since it matches on the sigil prefix; and the
root's `aliasKeys` still hides declarations from the output.

## `export` and the destructure

`export({ %a, %b })` is a self-erasing declaration listing which of a
file's names are published. `{ %a } = @"f.aontu"` places `f.aontu`'s values
exactly as a plain include does and also binds `%a` in the importing
file's scope. `{%}` takes every exported name. An unexported name cannot
be bound, and the refusal names the name.

Both are new syntax in both ports, with `export_arg` and
`import_not_exported` as their refusals.

## Two features the nine rows did not reach

Neither is in the nine, and both are `ALIASES.0.md` §6's. They landed
in the same change because the first is a hard block and the second is
what the note's own example shows.

**Renaming, `{ %local: %remote }`,** is the only answer to two files
publishing one name: with file scope in place the collision moves into
the taking file's one scope, and the left-hand name is the only place it
can be settled. The set grammar grew an item with an optional second
name; `export` did not take the form, since publishing renames nothing.

**A destructure under a key** places the subtree where the head stands
and still binds the name at the document root, which is where every
alias key lives. For that the other file's OWN declarations are lifted
to the root with its values — without it a file that uses the name it
publishes could not be mounted at all, since its reference resolves from
the root and its declaration would have landed under the key. A plain
value include of such a file stays refused: the destructure is where a
file says it is taking names, and so where the engine knows to lift
them.

## What the scope turned out to reach

A key that carries a file has to be a key nothing else is, and three
places were already comparing keys without asking whether one was a
declaration. All three predate this work and only showed once two
documents could hold the same name for two things.

**A document is its own scope, not just a file.** Two roots parsed from
TEXT both scoped to the empty string, so a schema's `%p` and its data's
`%p` collided under `vet` — the opposite of the rule `ALIASES.0.md`
states. A parse with no file behind it is tagged instead. Go had the
same hole one level out: its root never carries a multisource path, so
even two file-backed roots shared a scope, which TypeScript's did not.

**`close` counted a declaration as a key.** An alias key is erased
before the document exists, so a closed map spliced beside a
declaration refused it as a surplus field.

**`subsume` compared declarations as fields.** It walked raw map keys,
which matched only while both documents scoped a name identically.

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
with twenty-eight more rows the work added. Twenty-two in `alias.tsv`:
six refuse what the new forms made writable (the wildcard and a rename
in `export`, a nested `export` with its path row, a name the other file
never declared, and a right-hand side that is not a document); three pin
what the refusals say; seven pin what the two later features answer for
— a destructure under a key, under a deep key, one whose file uses the
name it publishes, renaming at the root and under a key, the remote name
in a rename refusal, and a name that arrives meeting a local declaration
of it; and six pin what the review of the landed work closed — a closed
document taking a name, a re-export refused, an unexported name refused
where nothing uses it, a wrapped root publishing, a field named like the
sentinel the parser erases, and two documents each declaring one name
under `vet`. Six in `fmt.tsv` pin every spelling through the formatter,
the last of them that same sentinel-named field.
