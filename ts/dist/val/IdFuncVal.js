"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdFuncVal = void 0;
exports.idName = idName;
const err_1 = require("../err");
const FuncBaseVal_1 = require("./FuncBaseVal");
const TopVal_1 = require("./TopVal");
const Val_1 = require("./Val");
// A FLAT IDENTIFIER (D-1, docs/design/RELATIONS.0.md): no slash --
// hierarchy belongs in document structure and kind fields, never in
// name punctuation -- no leading digit or hyphen, and NO DOTS: a dot
// separates an entity address from a sub-path (G4 phase 2).
const ID_NAME = /^[_a-zA-Z][-_a-zA-Z0-9]*$/;
// The name an argument spells, or undefined when it does not spell
// one. A bare `svc_auth` parses as a string, as does `"svc_auth"`;
// anything else — a number, a map, an unresolved reference — is not a
// name, and saying so at once beats an entity nobody can address.
function idName(v) {
    if (true !== v?.isScalar || 'string' !== typeof v.peg) {
        return undefined;
    }
    return ID_NAME.test(v.peg) ? v.peg : undefined;
}
class IdFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(spec, ctx) {
        super(spec, ctx);
        this.isIdFunc = true;
        // BARE `id()` IS NAMED BY THE ENCLOSING KEY, so its meaning
        // depends on where it LANDS -- which is exactly what
        // isPathDependent declares. Marking it is what plugs the no-arg
        // form into the pre-resolution snapshot machinery (spread
        // templates, referenced type() bodies), so each destination
        // resolves its own name -- the fix for the id(key(0)) include gap
        // (use-cases/10-data-model, gap 6) -- and what exempts it from the
        // constant-id template refusal (id_spread), which is about one
        // name stamped on every child. Every construction site — the
        // grammar factory, make(), clone() — supplies peg, so read it
        // plainly and let a site that stops doing so fail loudly.
        if (0 === this.peg.length) {
            this._isPathDependent = true;
        }
    }
    make(_ctx, spec) {
        return new IdFuncVal(spec);
    }
    funcname() {
        return 'id';
    }
    // BARE id() HOLDS ITS ANSWER FOR ONE PASS, and that single pass is
    // what makes the schema idiom work: a spread of a type body
    // (`&: $.S`) takes its pre-resolution SNAPSHOT on pass zero, and the
    // snapshot must find the id() still open and path-dependent, so each
    // child resolves its own name at its own key. Resolved eagerly, the
    // body's identity was taken at the definition before any snapshot
    // could copy it, and the children got nothing (probed; the register
    // records it). The definition's own position still resolves -- on
    // pass one, at its own key -- so a type body IS an entity named by
    // the schema's key, and a plain `$.S &` reference copies it
    // identity-free, exactly as clearing rule 1 says a copy must be.
    deferResolve(ctx) {
        // peg is a real array by the time the resolve gate consults this
        // hook: FuncBaseVal.unify has already iterated it.
        return 0 === this.peg.length && 0 === ctx.cc;
    }
    resolve(ctx, args) {
        let name;
        if (0 === args.length) {
            // (Pass-zero deferral lives in deferResolve, on the
            // args-not-done path, so the fixpoint sees an ordinary
            // still-residuating function rather than zero progress.)
            // NAMED BY THE ENCLOSING KEY, late-bound: the name is the last
            // segment of the path the value is being driven at, by exactly
            // key()'s discipline (level 0 -- id() sits AT the field's value,
            // where key() sits one level inside it). The stored path is
            // authoritative when it is a real position; a template's shared
            // body has none, and there the driving context is the truth
            // (KeyFuncVal.resolve, `positioned`).
            let positioned = 0 < this.path.length;
            for (const seg of this.path) {
                if ('string' !== typeof seg) {
                    positioned = false;
                    break;
                }
            }
            const here = positioned ? this.path : ctx.path;
            const key = here[here.length - 1];
            // At the document root there is no enclosing key to be named by.
            name = 'string' === typeof key && ID_NAME.test(key) ? key : undefined;
        }
        else {
            name = idName(args[0]);
        }
        if (undefined === name) {
            return (0, err_1.makeNilErr)(ctx, 'id_name', this, undefined, 'id');
        }
        // THE UNIT, carrying the identity: `id(x) & v` must be `v` with an
        // identity, so the function resolves to what unifies with anything
        // and lets the rider in `unite` do the stamping.
        const out = new TopVal_1.TopVal({}, ctx);
        // NOT id 0: TopVal pins that, and `unite`'s fast path returns
        // early for two done Vals sharing an id — which would drop one of
        // two identities before the rider could refuse them.
        out.id = (0, Val_1.nextValId)();
        out.entity = name;
        return out;
    }
} /* node:coverage ignore next 6 */
exports.IdFuncVal = IdFuncVal;
//# sourceMappingURL=IdFuncVal.js.map