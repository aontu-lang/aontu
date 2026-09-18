"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALIAS_NAME_RE = exports.ALIAS_RE = void 0;
// ONE PATTERN FOR THE ALIAS NAME. The lexer reads a name off the front
// of the source and RefVal asks whether a whole segment is one; a second
// copy of the shape is how the two came to disagree about the hyphen.
// See docs/design/ALIASES.0.md
const ALIAS_NAME = '%[A-Za-z_][A-Za-z0-9_]*(?:-[A-Za-z0-9_]+)*';
// Reads a name off the front of the source (the lexer).
const ALIAS_RE = new RegExp('^' + ALIAS_NAME);
exports.ALIAS_RE = ALIAS_RE;
// Is this whole string a name (a reference's one segment)?
const ALIAS_NAME_RE = new RegExp('^' + ALIAS_NAME + '$');
exports.ALIAS_NAME_RE = ALIAS_NAME_RE;
//# sourceMappingURL=aliasname.js.map