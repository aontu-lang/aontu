# Agent and editor reference

An editor and an agent read a model through the same doors, and there
are more of them than the command line. This page is normative for
that surface taken as a whole: which doors there are, what each
answers, what none of them does, what posture each takes towards
`@"..."` includes, and which implementation carries it.

Each door's own specification is elsewhere and is linked from the
table below. Nothing here repeats a tool list, an option or an exit
table: the [API reference](reference-api.md#command-line-interface)
specifies every verb, [the language server](lsp.md) specifies the
protocol and the library behind it, and the [errors
reference](reference-errors.md#exit-codes) specifies the exit codes and
the codes a report carries.

## Contents

- [The doors](#the-doors)
- [The machine answer](#the-machine-answer)
- [What none of them does](#what-none-of-them-does)
- [Includes, by door](#includes-by-door)
- [The teaching topics](#the-teaching-topics)
- [Which implementation has it](#which-implementation-has-it)
- [Related](#related)

---

## The doors

| door | reached by | answers | specified in |
|---|---|---|---|
| the verbs | `aontu <verb>`, with `--format json` where a report is wanted | one report a verb | [command-line interface](reference-api.md#command-line-interface) |
| the embedded API | a library call, in either implementation | the same reports, as values rather than text | [TypeScript API](reference-api.md#typescript-api), [Go API](reference-api.md#go-api) |
| the language server | `aontu lsp`, or the `aontu-lsp` binary, over stdio | diagnostics, hover and completion as an editor asks for them | [the language server](lsp.md) |
| the tool server | `aontu mcp`, or the `aontu-mcp` binary, over stdio | a tool for each report it serves, which is a subset of the verbs, under the same JSON contract | [the MCP server](reference-api.md#the-mcp-server) |
| the teaching pack | `aontu help <topic>` | the language, from inside the binary, with no network and no checkout | [`aontu help`](reference-api.md#aontu-help) |
| the code index | `aontu explain <code>`, or `--list` | what one refusal means, or every registered code with its class | [errors reference](reference-errors.md#the-codes) |
| the starting documents | `aontu init [dir]` | a model, an instance of it, and the checks to run | [`aontu init`](reference-api.md#aontu-init) |
| the prose entrypoint | `aontu agentsmd --write <file>` | the stanza naming a document's pin, root keys, shape and commands | [`aontu agentsmd`](reference-api.md#aontu-agentsmd) |
| the structured-output bridge | `aontu jsonschema` | a JSON Schema for the document, and the list of what it could not say | [`aontu jsonschema`](reference-api.md#aontu-jsonschema) |
| the published grammars | the files in [`grammar/`](../grammar/) | the emission surface, for a constrained decoder or a highlighter | [grammar reference](reference-grammar.md) |
| the editor plugins | [`editors/`](../editors/) for Visual Studio Code, Emacs and Vim | the language server, wired to an editor | [editor configuration](lsp.md#editor-configuration) |

A door is a way in, not a tier: the tool server answers with the
report the verb prints, and the verb prints what the library returned.
One question has one answer whichever door it arrives by, which is the
property that makes a transcript in a document and a tool call in an
agent the same evidence.

## The machine answer

`--format json` is a per-verb option rather than a global one: `fmt`,
`template` and `agentsmd` do not take it, and refuse it by name.

Where a verb does answer JSON it answers one object, and every one of
them opens with the same block:

| key | carries |
|---|---|
| `aontu` | `verb` and `version`: which verb answered, and the version that answered it |

`aontu trace --format json` is the one exception: it answers its record
alone, under `trace`.

**How an answer says whether it holds** is one of three shapes. The
shape belongs to the verb rather than to the run, so a document that
does not hold changes the values and never the keys:

| shape | the answer carries | the verbs |
|---|---|---|
| `ok` and the answer beside it | `ok`, with `out` or `record` | the bare entry point, `model get`, `model why` |
| a verdict word | `verdict`, with the verb's own fields | `vet`, `subsume`, `breaking`, `relations`, `reaches`, `trim`, `jsonschema`, `view`, `render --check`, `allow` |
| the payload alone | neither: the object is the answer | `hash`, `help`, `explain` |

**A refusal is an answer**, and the findings say what was refused. The
key they arrive under is the verb's too:

| findings under | the verbs |
|---|---|
| `findings` | the bare entry point, `model get`, `model why`, `vet`, `subsume`, `breaking`, `relations`, `allow` |
| `errors` | `reaches` |
| nothing: the verb reports none | `trim`, `jsonschema`, `view`, `render --check`, `hash`, `help`, `explain` |

A verb that reports no findings says what it could not do in a field of
its own instead: `view`'s `loss`, `jsonschema`'s `lossy` and
`render --check`'s `drift`.

A caller branches on `ok` or on `verdict` rather than parsing prose, and
the exit code carries the same answer: the [errors
reference](reference-errors.md#exit-codes) is normative for it. Each
verb's own section names the fields beside these.

The tool server keeps the same rule at the protocol level: a tool whose
document does not hold answers with its own report and `isError:
false`, because the report is the answer. `isError` is reserved for a
call that could not be made at all, such as an unknown tool, a
malformed argument, or a file argument the server does not serve.

## What none of them does

These hold across every door, and each is the property an integrator
needs before wiring one into something that runs unattended:

- **The language server never writes a file.** It answers, and the
  editor owns the buffer.
- **The tool server never writes a file.** `set` answers the new
  overlay text, and the caller owns the write.
- **`init` never overwrites.** If any member of the trio already
  stands in the directory it refuses before writing any of them, so a
  refused run leaves nothing half written.
- **`agentsmd --write` changes only what lies between its two
  markers.** Everything outside them is left exactly as it was, which
  is what makes it safe to re-run and safe to point at a file someone
  else writes prose in.
- **A `--check` run writes nothing.** It compares and exits.
- **Evaluation never reaches the network.** A module resolves from
  local stores only; the package verbs are the only ones that fetch,
  and they say so by name.

## Includes, by door

`@"..."` reads a file while a document is evaluated, so every door
that evaluates a document a caller supplied has a posture towards it.
The postures are the [trust contract](trust.md); this is which door
takes which by default.

| door | default | how it is set |
|---|---|---|
| the verbs | `system`: an include reads what the process can read | `--trust none`, `--trust root[:dir]`, or `--include-root <dir>`, on every verb that reads a document; `help`, `explain` and `init` read none and refuse them, and `lsp` takes no arguments at all |
| the embedded API | whatever the caller passes, and `system` where it passes nothing | the `trust` option of the call |
| the language server | confined below the workspace folder the client named, and `system` where the client named none | `initializationOptions.aontu.trust.include`: `system`, `none`, a root, or an in-memory map |
| the tool server | `none`: every include is denied | `--root <dir>`, which confines includes below the resolved root and serves the path arguments of every tool |

A server that evaluates source from a caller is exactly the place an
unconfined include is a mistake, which is why the tool server denies
them until a root says otherwise, and why a path argument is refused
until then too.

## The teaching topics

`aontu help` lists what the binary carries, and `aontu help <topic>`
prints one. Each is staged into both implementations at build time from
its source, and both suites hold the staged copy to that source byte
for byte, so the answer travels with the binary rather than with a
checkout.

| topic | what it carries |
|---|---|
| `tasks` | the job-to-verb index: which verb answers the question you have |
| `language` | the grammar card: everything the language spells, on one page |
| `examples` | the ladder, from plain JSON upward, one addition at a time |
| `codes` | what a refusal means, and what to do about it |
| `grammar` | the published ABNF, for a parser or a constrained decoder |

`aontu help` with no topic lists them, `aontu --help` documents the
verbs and their flags, and `--format json` answers either as an object.

## Which implementation has it

| door | TypeScript | Go |
|---|---|---|
| the verbs | yes | yes, less the tool server |
| the embedded API | yes | yes |
| the language server | yes | yes |
| the tool server | yes | no: `aontu mcp` says so and exits `2` |
| the teaching pack | yes | yes, from a committed copy of the staged pack |
| the code index | yes | yes |
| the starting documents | yes | yes |
| the prose entrypoint | yes | yes |
| the structured-output bridge | yes | yes |
| the published grammars | shared: the files are the distribution's, not a port's | shared |
| the editor plugins | either binary serves them | either binary serves them |

The tool server is the one door with no Go half. Its role there is the
embedded API, which carries the same calls.

## Related

- [The language server](lsp.md) for the protocol surface, the library
  API in both implementations, and how diagnostics are computed.
- [The MCP server](reference-api.md#the-mcp-server) for the tools, what
  each answers, and the confinement the `--root` posture adds.
- [The trust contract](trust.md) for what an include may read, and what
  a profile confines.
- [Exit codes](reference-errors.md#exit-codes) in the errors reference
  for the verdict every verb carries out of a run.
- [Grammar reference](reference-grammar.md) for the published grammars
  and what holds them to the engine.
- [Give an agent an
  entrypoint](how-to/give-an-agent-an-entrypoint.md) and [wire your
  editor](how-to/wire-your-editor.md) for the two jobs in recipe form.
