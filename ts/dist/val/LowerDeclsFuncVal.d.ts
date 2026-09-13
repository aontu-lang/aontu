import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
declare class LowerDeclsFuncVal extends FuncBaseVal {
    isLowerDeclsFunc: boolean;
    staged: boolean;
    loss: boolean;
    constructor(loss: boolean, spec: ValSpec, ctx?: AontuContext);
    funcname(): "lowerdecls" | "lowerloss";
    unify(peer: Val, ctx: AontuContext): Val;
    resolve(ctx: AontuContext, args: Val[]): Val;
}
declare class LowerDeclsFunc extends LowerDeclsFuncVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class LowerLossFunc extends LowerDeclsFuncVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
export { LowerDeclsFunc, LowerLossFunc, };
