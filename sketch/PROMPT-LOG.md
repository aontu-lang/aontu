# Prompt log

Every prompt given to an agent working in this repository, oldest
first: when it was given, in UTC, the agent that took it, and the
prompt as it was written, typos included
([ADR-076](../ADR.md#adr-076--every-prompt-is-logged)).

An agent appends the prompt it is given before it starts the work, and
commits the entry with the first change that follows; a prompt that
changes nothing, such as a question, rides the next commit. A prompt
given while a turn is running is logged when it arrives. An entry is
never rewritten.

The agent is named by its tool and its session. A Claude Code
session's commits carry the same session in their `Claude-Session`
trailer.

The entries before 2026-10-20 16:45 were written from that session's
transcript, with the times it recorded.

## 2026-10-18 21:40:48 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
Merge open prs; complete the work to fully describe aontu using a Lean specification. Post issues discovered to github. Update the tutorial on the definition as you go. Work in small steps, commit frequently. Do not wait for ci, and just test locally using unit tests
```

## 2026-10-19 10:39:15 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
We need to optimize the CI. It is taking too long. Break it apart into standard CI, which is just used for PR merges. That should consist of a two to three minute happy path and a two to three minute sample break apart unit tests files as needed into smaller groups to facilitate sampling. Other operations like veil or long-running operations should run on a daily build. To put all of this in place, uh, create a patch that I will run manually . Also, before starting, measure the various parts of the CI. Find out which takes the longest. Also, check the caching. Also, for standard PR merges, it is not necessary to do Windows and Mac OS tests . Leave that to the daily. Also, change the publication process so that main is where normal work PRs are merged into, but we have a new branch called release, main merges onto release for releases.
```

## 2026-10-19 11:20:40 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
status?
```

## 2026-10-19 15:08:31 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
status?
```

## 2026-10-19 15:17:58 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
commit patches to main
```

## 2026-10-19 15:25:02 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
any unpushed work?
```

## 2026-10-19 17:22:48 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
git pull latest main; confirm that local development and pr ci is not optimised and does not take longer than 5 minutes to test
```

## 2026-10-19 18:04:32 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
rename multiple() to mulof()
```

## 2026-10-19 18:57:32 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
How long did the push and pr ci take?
```

## 2026-10-19 19:12:34 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
What does the lean definition of aontu allow us to do? Can it be considered the ground truth  reference
```

## 2026-10-19 20:11:26 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
Walk me through the jsonschema additions
```

## 2026-10-19 20:42:57 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
Explain meta
```

## 2026-10-19 21:51:18 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
Why not make meta name to accept any metadata? Why restrict ourselves to jsonschema? Seems like this is a jsonschema infection?
```

## 2026-10-20 07:09:20 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
Make the change
```

## 2026-10-20 08:13:58 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
Explain ident wrt jsonschema
```

## 2026-10-20 08:29:42 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
What is the purpose in jsonschema
```

## 2026-10-20 11:55:16 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
so this is about pulling external files from arbitrary URIs?
```

## 2026-10-20 11:59:09 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
why not use meta for this, with keys $id etc, and drop ident altogether?
```

## 2026-10-20 14:03:47 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
generalise ident into an open declaration rider
```

## 2026-10-20 15:19:03 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
dont report losses on export to jsonschema for meta and ident, since they are now general purpose, and jsonschema only cares about certain keys; surely ident should also only accept static values like meta?
```

## 2026-10-20 16:25:08 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
he local coverage gate is about 13 minutes into a run of roughly 42 - really? is it? what happened to my specific instruction to spend no more than a few minutes on testing, and leave the long runs to the daily ci on github
```

## 2026-10-20 16:25:51 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
you need to record this process instruction - where will you record it?
```

## 2026-10-20 16:45:16 UTC · Claude Code · session_01XG9G5jizDciS8aeZfUZPs2

```text
establish a new process: all prompts must be recorded in a sketch/PROMPT-LOG.md file, recording date and time and agent
```
