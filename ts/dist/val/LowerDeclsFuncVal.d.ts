import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
declare const DECL_KINDS: string[];
declare class LowerDeclsFuncVal extends FuncBaseVal {
    isLowerDeclsFunc: boolean;
    staged: boolean;
    loss: boolean;
    constructor(loss: boolean, spec: ValSpec, ctx?: AontuContext);
    funcname(): "lowerdecls" | "lowerloss";
    unify(peer: Val, ctx: AontuContext): Val;
    resolve(ctx: AontuContext, args: Val[]): Val;
}
declare const LowerDeclsFunc: any;
declare const LowerLossFunc: any;
export { DECL_KINDS, LowerDeclsFunc, LowerLossFunc, LowerDeclsFuncVal, };
