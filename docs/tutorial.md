# Tutorials

Four tutorials, each building one thing from an empty directory and
showing the engine's output at every step. Read them in this order if
you are new; take one on its own if its subject is what you need.

- [Build a config that checks itself](tutorial-config.md). A service
  config that is schema, defaults, and data in one document, validated
  against a second file with `aontu vet` and explained line by line
  with `aontu model why`. Assumes no aontu at all.
- [Model the system, not the tree](tutorial-graph.md). The same config
  as a graph: two views of one service brought into contact, declared
  relations that refuse a cycle, and a schema as deep as its data.
  Assumes the first tutorial.
- [Share a model as a package](tutorial-package.md). A schema
  published as a signed package into a directory, acquired by a second
  project, and pinned so that a change to what it means is refused.
  Assumes the first tutorial.
- [From a model to a file tree](tutorial-generate.md). A TypeScript
  client computed from a model of its routes, as a tree of folders,
  files, and lines, written to disk with `aontu render` and held
  against the model by its check. Assumes the first tutorial.

Every transcript on these pages is run by `ts/test/docs.test.ts`, so
the output beside a command is what the engine printed.

A tutorial is the wrong shape once you can name what you want. Go to
the [how-to guides](how-to/) for a task, the
[language reference](reference-language.md), the
[generation reference](reference-generation.md), the
[functions reference](reference-functions.md) or the
[API reference](reference-api.md) for a fact,
[unification](unification.md) for the operation itself, and the
[explanation](explanation.md) for why the engine works as it does.
