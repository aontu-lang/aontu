import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
type AggOp = 'sum' | 'least' | 'greatest';
declare class AggFuncVal extends FuncBaseVal {
    isAggFunc: boolean;
    staged: boolean;
    op: AggOp;
    constructor(spec: ValSpec, ctx: AontuContext | undefined, op: AggOp);
    funcname(): AggOp;
    prepare(_ctx: AontuContext, _args: Val[]): null;
    unify(peer: Val, ctx: AontuContext): Val;
    resolve(ctx: AontuContext, args: Val[]): Val;
}
declare class PickFuncVal extends FuncBaseVal {
    isPickFunc: boolean;
    staged: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    funcname(): string;
    prepare(_ctx: AontuContext, _args: Val[]): null;
    unify(peer: Val, ctx: AontuContext): Val;
    resolve(ctx: AontuContext, args: Val[]): Val;
}
declare class JoinFuncVal extends FuncBaseVal {
    isJoinFunc: boolean;
    staged: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    prepare(_ctx: AontuContext, _args: Val[]): null;
    unify(peer: Val, ctx: AontuContext): Val;
    deferResolve(_ctx: AontuContext, args?: Val[]): boolean;
    resolve(ctx: AontuContext, args: Val[]): Val;
}
declare class SumFuncVal extends AggFuncVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class LeastFuncVal extends AggFuncVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class GreatestFuncVal extends AggFuncVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
export { AggFuncVal, JoinFuncVal, PickFuncVal, SumFuncVal, LeastFuncVal, GreatestFuncVal, };
