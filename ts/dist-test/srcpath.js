"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.srcPath = void 0;
// srcPath spells a path for EMBEDDING IN SOURCE text.
//
// Inside an `@"..."` include a backslash is an ESCAPE character, so a
// native Windows path interpolated raw is eaten by the lexer:
// `x:"D:\a\aontu\ts"` parses to the string `D:aaontu<TAB>s`. Node
// accepts forward slashes on every platform, so sources spell paths
// that way and filesystem calls keep native ones.
//
// IT IS A NO-OP ON POSIX, which is the point: the tests that need it
// pass either way on the platform contributors run, and fail only on
// the one they cannot. Several suites passed on Windows by ACCIDENT
// before this was applied to them -- `'@"' + __dirname + '/../test/x'`
// mangles the whole prefix into one segment with no separator left in
// it, and the `/../` that follows pops that segment, so the residue
// `D:` resolved drive-relative onto the intended file. One include
// added without the `/../` hop, or a cwd on another drive, and the
// accident stops working.
//
// The Go twin is srcPath in go/trust_test.go (and go/cmd/aontu/
// trust_test.go); it carries the same name so the rule reads as one
// rule across the two ports.
const srcPath = (p) => p.split('\\').join('/');
exports.srcPath = srcPath;
//# sourceMappingURL=srcpath.js.map