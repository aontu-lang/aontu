import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
export declare function effectiveScrutinee(v: Val): Val;
declare class MatchFuncVal extends FuncBaseVal {
    isMatchFunc: boolean;
    staged: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    funcname(): string;
    prepare(_ctx: AontuContext, _args: Val[]): null;
    hasDefault(): boolean;
    unify(peer: Val, ctx: AontuContext): Val;
    resolve(ctx: AontuContext, args: Val[]): import("./NilVal").NilVal | Val;
}
export { MatchFuncVal, };
