/* Copyright (c) 2026 Richard Rodger, MIT License */


import type {
  Val,
  ValSpec,
} from '../type'

import {
  AontuContext,
} from '../ctx'

import { makeNilErr } from '../err'

import { MapVal } from './MapVal'
import { ListVal } from './ListVal'
import { StringVal } from './StringVal'
import { FuncBaseVal } from './FuncBaseVal'


type CmpDef = {
  cmp: string
  // The children this component admits, by aontu function name. Empty
  // means a leaf: any child at all is a mistake.
  children: string[]
  text?: string
  // Whether that prop is required. `project`'s folder is the one that
  // is not: Jostraca defaults it to `.`.
  req: boolean
  // Whether that prop is a SPAN of target text rather than a name. A
  // blank line is a span; a folder called "" is a mistake.
  span?: boolean
  // A prop that must be present and must be a list.
  bag?: string
  // Hand-kept: no jostraca dependency to derive it from.
  props: string[]
}


const SPAN_PROPS =
  ['arg', 'src', 'name', 'indent', 'extra', 'replace', 'raw']

const CMP_DEF: Record<string, CmpDef> = {
  // The output root. Its `folder` is refused an absolute path or a
  // `..` segment on the Jostraca side, where the tree is data.
  project: {
    cmp: 'Project', text: 'folder', req: false,
    children: ['project', 'folder', 'file', 'copyfiles'],
    props: ['name', 'folder'],
  },
  folder: {
    cmp: 'Folder', text: 'name', req: true,
    children: ['folder', 'file', 'copyfiles'],
    props: ['name'],
  },
  file: {
    cmp: 'File', text: 'name', req: true,
    children: ['content', 'line', 'fragment', 'inject', 'listitems', 'copyfiles'],
    props: ['name', 'exclude', 'mode'],
  },
  content: {
    cmp: 'Content', text: 'src', req: true, span: true,
    children: [],
    props: SPAN_PROPS,
  },
  // A span with a newline added, which is the whole difference.
  line: {
    cmp: 'Line', text: 'src', req: true, span: true,
    children: [],
    props: SPAN_PROPS,
  },
  // A file read from disk with its `<[SLOT]>` markers filled.
  fragment: {
    cmp: 'Fragment', text: 'from', req: true,
    children: ['slot', 'content', 'line', 'listitems'],
    props: ['from', 'indent', 'replace', 'eject'],
  },
  slot: {
    cmp: 'Slot', text: 'name', req: true,
    children: ['content', 'line', 'fragment', 'listitems'],
    props: ['name'],
  },
  // A body written between markers in a file that already exists.
  inject: {
    cmp: 'Inject', text: 'name', req: true,
    children: ['content', 'line', 'listitems'],
    props: ['name', 'markers', 'exclude'],
  },
  // `Copy` under a name aontu has free: `copy` is taken by the builtin
  // that copies a VALUE, and a file copy is a different verb.
  copyfiles: {
    cmp: 'CopyFiles', text: 'from', req: true,
    children: [],
    props: ['from', 'to', 'replace', 'exclude'],
  },
  listitems: {
    cmp: 'ListItems', req: true, bag: 'item',
    children: ['content', 'line', 'fragment'],
    props: ['item', 'line', 'indent'],
  },
}

const BY_CMP: Record<string, string> = {}
for (const fname of Object.keys(CMP_DEF)) {
  BY_CMP[CMP_DEF[fname].cmp] = fname
}

function nodeCmp(v: any): string | undefined {
  if (true !== v?.isMap) {
    return undefined
  }
  const cmp: any = v.peg?.cmp
  const name = (true === cmp?.isScalar && 'string' === typeof cmp.peg) ?
    cmp.peg : undefined
  // The node carries the JOSTRACA name; the grammar is written in aontu
  // names, so read it back through the one table.
  return (undefined === name) ? undefined : BY_CMP[name]
}


function cmpNode(cmp: string, props: Val, children: Val,
  ctx: AontuContext): MapVal {
  const node = new MapVal({ peg: { cmp: new StringVal({ peg: cmp }, ctx), props, children } }, ctx)
  node.closed = true
  return node
}


// A bare string child is a LINE: `Content` writes no newline, and the
// emit mark rides across or `aontu trace` loses the line's rule.
function lineNode(from: any, src: string, ctx: AontuContext): MapVal {
  const node = cmpNode(
    CMP_DEF.line.cmp,
    new MapVal({ peg: { src: new StringVal({ peg: src }, ctx) } }, ctx),
    new ListVal({ peg: [] }, ctx),
    ctx)
  if (null != from?.emitted) {
    ; (node as any).emitted = from.emitted
  }
  return node
}


function propText(props: any, key: string): string | undefined {
  const v: any = props?.peg?.[key]
  return (true === v?.isScalar && 'string' === typeof v.peg) ? v.peg : undefined
}


class CmpFuncVal extends FuncBaseVal {
  isCmpFunc = true

  // The function's own name, which is also the node's `cmp` key.
  cmp: string

  constructor(
    cmp: string,
    spec: ValSpec,
    ctx?: AontuContext
  ) {
    super(spec, ctx)
    this.cmp = cmp
  }


  funcname() {
    return this.cmp
  }


  resolve(ctx: AontuContext, args: Val[]): Val {
    const def: CmpDef = CMP_DEF[this.cmp]

    // Arity is checked at parse (funcArity); args[0] can be undefined.
    const spec: any = args[0]
    let props: Val
    if (undefined === spec) {
      props = new MapVal({ peg: {} }, ctx)
    }
    else if (true === spec?.isScalar && 'string' === typeof spec.peg) {
      if (undefined === def.text) {
        return makeNilErr(ctx, 'invalid-arg', this, spec, 'spec')
      }
      props = new MapVal({ peg: { [def.text]: spec } }, ctx)
    }
    else if (true === spec?.isMap) {
      props = spec
    }
    else {
      return makeNilErr(ctx, 'invalid-arg', this, spec, 'spec')
    }

    // An unknown prop is a silently dropped `indent` or `mode`.
    for (const key of Object.keys((props as any).peg)) {
      if (!def.props.includes(key)) {
        return makeNilErr(ctx, 'invalid-arg', this, props, key)
      }
    }

    if (undefined !== def.text) {
      const text = propText(props, def.text)
      if (def.req &&
        (undefined === text || ('' === text && true !== def.span))) {
        return makeNilErr(ctx, 'invalid-arg', this, props, def.text)
      }
      if (!def.req && undefined !== (props as any).peg?.[def.text] &&
        (undefined === text || ('' === text && true !== def.span))) {
        return makeNilErr(ctx, 'invalid-arg', this, props, def.text)
      }
    }

    // A bag prop is required and must be a list: `listitems` with no
    // `item` renders nothing, silently, which is the failure a data
    // path must not have.
    if (undefined !== def.bag) {
      const bag: any = (props as any).peg?.[def.bag]
      if (true !== bag?.isList) {
        return makeNilErr(ctx, 'invalid-arg', this, props, def.bag)
      }
    }

    const kids: any = args[1]
    let children: Val
    if (undefined === kids) {
      children = new ListVal({ peg: [] }, ctx)
    }
    else if (true === kids?.isList) {
      const flat: Val[] = []
      const splice = (list: Val[]): Val | undefined => {
        for (const kid of list) {
          if (true === (kid as any)?.isList) {
            const bad = splice((kid as any).peg as Val[])
            if (undefined !== bad) {
              return bad
            }
            continue
          }
          const text = (true === (kid as any)?.isScalar &&
            'string' === typeof (kid as any).peg) ? (kid as any).peg : undefined
          if (undefined !== text) {
            if (!def.children.includes('line')) {
              return kid
            }
            flat.push(lineNode(kid, text, ctx))
            continue
          }
          const kcmp = nodeCmp(kid)
          if (undefined === kcmp || !def.children.includes(kcmp)) {
            return kid
          }
          flat.push(kid)
        }
        return undefined
      }
      const bad = splice(kids.peg as Val[])
      if (undefined !== bad) {
        return makeNilErr(ctx, 'invalid-arg', this, bad, 'children')
      }
      children = new ListVal({ peg: flat }, ctx)
    }
    else {
      return makeNilErr(ctx, 'invalid-arg', this, kids, 'children')
    }

    return this.place(cmpNode(def.cmp, props, children, ctx))
  }

} /* node:coverage ignore next 3 */


function cmpFuncClass(fname: string): any {
  class Cmp extends CmpFuncVal {
    constructor(spec: ValSpec, ctx?: AontuContext) {
      super(fname, spec, ctx)
    }

    make(_ctx: AontuContext, spec: ValSpec): Val {
      return new Cmp(spec)
    }
  }
  return Cmp
}


const CMP_FUNCS: Record<string, any> = {}
for (const fname of Object.keys(CMP_DEF)) {
  CMP_FUNCS[fname] = cmpFuncClass(fname)
} /* node:coverage ignore next 7 */


export {
  CMP_DEF,
  CMP_FUNCS,
  CmpFuncVal,
}
