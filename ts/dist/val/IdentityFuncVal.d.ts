import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
declare class IdentityFuncVal extends FuncBaseVal {
    isIdentityFunc: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    resolve(ctx: AontuContext, args: Val[]): import("./NilVal").NilVal | Val;
}
export { IdentityFuncVal, };
