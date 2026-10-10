import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
declare class IdentFuncVal extends FuncBaseVal {
    isIdentFunc: boolean;
    declared: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    funcname(): string;
    resolve(ctx: AontuContext, args: Val[]): import("./NilVal").NilVal | Val;
}
declare function undeclared(v: any): Val;
export { IdentFuncVal, undeclared, };
