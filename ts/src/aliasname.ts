/* Copyright (c) 2026 Richard Rodger, MIT License */

// ONE PATTERN FOR THE ALIAS NAME. The lexer reads a name off the front
// of the source and RefVal asks whether a whole segment is one; a second
// copy of the shape is how the two came to disagree about the hyphen.
// See docs/design/ALIASES.0.md
const ALIAS_NAME = '%[A-Za-z_][A-Za-z0-9_]*(?:-[A-Za-z0-9_]+)*'

// Reads a name off the front of the source (the lexer).
const ALIAS_RE = new RegExp('^' + ALIAS_NAME)

// Is this whole string a name (a reference's one segment)?
const ALIAS_NAME_RE = new RegExp('^' + ALIAS_NAME + '$')
/* node:coverage ignore next 6 */


export {
  ALIAS_RE,
  ALIAS_NAME_RE,
}
