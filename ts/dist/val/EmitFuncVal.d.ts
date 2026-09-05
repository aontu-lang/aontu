import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { ListVal } from './ListVal';
import { FuncBaseVal } from './FuncBaseVal';
type Template = {
    match: Val;
    body: Val;
};
type BindFail = {
    ref?: string;
};
declare class EmitFuncVal extends FuncBaseVal {
    isEmitFunc: boolean;
    staged: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    funcname(): string;
    prepare(_ctx: AontuContext, _args: Val[]): null;
    unify(peer: Val, ctx: AontuContext): Val;
    resolve(ctx: AontuContext, args: Val[]): ListVal | import("./NilVal").NilVal;
    dispatch(ctx: AontuContext, node: Val, templates: Template[]): Template | string;
    instantiate(ctx: AontuContext, node: Val, tmpl: Template, out: Val[], fail: BindFail): void;
}
export { EmitFuncVal, };
