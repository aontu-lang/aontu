"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CmpFuncVal = exports.CMP_FUNCS = exports.CMP_DEF = void 0;
const err_1 = require("../err");
const MapVal_1 = require("./MapVal");
const ListVal_1 = require("./ListVal");
const StringVal_1 = require("./StringVal");
const FuncBaseVal_1 = require("./FuncBaseVal");
const CMP_DEF = {
    // The output root. Its `folder` is refused an absolute path or a
    // `..` segment on the Jostraca side, where the tree is data.
    project: {
        cmp: 'Project', text: 'folder', req: false,
        children: ['project', 'folder', 'file', 'copyfiles'],
    },
    folder: {
        cmp: 'Folder', text: 'name', req: true,
        children: ['folder', 'file', 'copyfiles'],
    },
    file: {
        cmp: 'File', text: 'name', req: true,
        children: ['content', 'line', 'fragment', 'inject', 'listitems', 'copyfiles'],
    },
    content: {
        cmp: 'Content', text: 'src', req: true, span: true,
        children: [],
    },
    // A span with a newline added, which is the whole difference.
    line: {
        cmp: 'Line', text: 'src', req: true, span: true,
        children: [],
    },
    // A file read from disk with its `<[SLOT]>` markers filled.
    fragment: {
        cmp: 'Fragment', text: 'from', req: true,
        children: ['slot', 'content', 'line', 'listitems'],
    },
    slot: {
        cmp: 'Slot', text: 'name', req: true,
        children: ['content', 'line', 'fragment', 'listitems'],
    },
    // A body written between markers in a file that already exists.
    inject: {
        cmp: 'Inject', text: 'name', req: true,
        children: ['content', 'line', 'listitems'],
    },
    // `Copy` under a name aontu has free: `copy` is taken by the builtin
    // that copies a VALUE, and a file copy is a different verb.
    copyfiles: {
        cmp: 'CopyFiles', text: 'from', req: true,
        children: [],
    },
    listitems: {
        cmp: 'ListItems', req: true, bag: 'item',
        children: ['content', 'line', 'fragment'],
    },
};
exports.CMP_DEF = CMP_DEF;
const BY_CMP = {};
for (const fname of Object.keys(CMP_DEF)) {
    BY_CMP[CMP_DEF[fname].cmp] = fname;
}
function nodeCmp(v) {
    if (true !== v?.isMap) {
        return undefined;
    }
    const cmp = v.peg?.cmp;
    const name = (true === cmp?.isScalar && 'string' === typeof cmp.peg) ?
        cmp.peg : undefined;
    // The node carries the JOSTRACA name; the grammar is written in aontu
    // names, so read it back through the one table.
    return (undefined === name) ? undefined : BY_CMP[name];
}
function cmpNode(cmp, props, children, ctx) {
    const node = new MapVal_1.MapVal({ peg: { cmp: new StringVal_1.StringVal({ peg: cmp }, ctx), props, children } }, ctx);
    node.closed = true;
    return node;
}
// A bare string child is this: what a template body line desugars to.
function contentNode(src, ctx) {
    return cmpNode(CMP_DEF.content.cmp, new MapVal_1.MapVal({ peg: { src: new StringVal_1.StringVal({ peg: src }, ctx) } }, ctx), new ListVal_1.ListVal({ peg: [] }, ctx), ctx);
}
function propText(props, key) {
    const v = props?.peg?.[key];
    return (true === v?.isScalar && 'string' === typeof v.peg) ? v.peg : undefined;
}
class CmpFuncVal extends FuncBaseVal_1.FuncBaseVal {
    constructor(cmp, spec, ctx) {
        super(spec, ctx);
        this.isCmpFunc = true;
        this.cmp = cmp;
    }
    funcname() {
        return this.cmp;
    }
    resolve(ctx, args) {
        const def = CMP_DEF[this.cmp];
        // Arity is checked at parse (funcArity); args[0] can be undefined.
        const spec = args[0];
        let props;
        if (undefined === spec) {
            props = new MapVal_1.MapVal({ peg: {} }, ctx);
        }
        else if (true === spec?.isScalar && 'string' === typeof spec.peg) {
            if (undefined === def.text) {
                return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this, spec, 'spec');
            }
            props = new MapVal_1.MapVal({ peg: { [def.text]: spec } }, ctx);
        }
        else if (true === spec?.isMap) {
            props = spec;
        }
        else {
            return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this, spec, 'spec');
        }
        if (undefined !== def.text) {
            const text = propText(props, def.text);
            if (def.req &&
                (undefined === text || ('' === text && true !== def.span))) {
                return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this, props, def.text);
            }
            if (!def.req && undefined !== props.peg?.[def.text] &&
                (undefined === text || ('' === text && true !== def.span))) {
                return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this, props, def.text);
            }
        }
        // A bag prop is required and must be a list: `listitems` with no
        // `item` renders nothing, silently, which is the failure a data
        // path must not have.
        if (undefined !== def.bag) {
            const bag = props.peg?.[def.bag];
            if (true !== bag?.isList) {
                return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this, props, def.bag);
            }
        }
        const kids = args[1];
        let children;
        if (undefined === kids) {
            children = new ListVal_1.ListVal({ peg: [] }, ctx);
        }
        else if (true === kids?.isList) {
            const flat = [];
            const splice = (list) => {
                for (const kid of list) {
                    if (true === kid?.isList) {
                        const bad = splice(kid.peg);
                        if (undefined !== bad) {
                            return bad;
                        }
                        continue;
                    }
                    const text = (true === kid?.isScalar &&
                        'string' === typeof kid.peg) ? kid.peg : undefined;
                    if (undefined !== text) {
                        if (!def.children.includes('content')) {
                            return kid;
                        }
                        flat.push(contentNode(text, ctx));
                        continue;
                    }
                    const kcmp = nodeCmp(kid);
                    if (undefined === kcmp || !def.children.includes(kcmp)) {
                        return kid;
                    }
                    flat.push(kid);
                }
                return undefined;
            };
            const bad = splice(kids.peg);
            if (undefined !== bad) {
                return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this, bad, 'children');
            }
            children = new ListVal_1.ListVal({ peg: flat }, ctx);
        }
        else {
            return (0, err_1.makeNilErr)(ctx, 'invalid-arg', this, kids, 'children');
        }
        return this.place(cmpNode(def.cmp, props, children, ctx));
    }
} /* node:coverage ignore next 3 */
exports.CmpFuncVal = CmpFuncVal;
function cmpFuncClass(fname) {
    class Cmp extends CmpFuncVal {
        constructor(spec, ctx) {
            super(fname, spec, ctx);
        }
        make(_ctx, spec) {
            return new Cmp(spec);
        }
    }
    return Cmp;
}
const CMP_FUNCS = {};
exports.CMP_FUNCS = CMP_FUNCS;
for (const fname of Object.keys(CMP_DEF)) {
    CMP_FUNCS[fname] = cmpFuncClass(fname);
} /* node:coverage ignore next 7 */
//# sourceMappingURL=CmpFuncVal.js.map