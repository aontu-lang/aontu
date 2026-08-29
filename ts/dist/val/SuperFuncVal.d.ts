import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
declare class SuperFuncVal extends FuncBaseVal {
    isSuperFunc: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    deferResolve(_ctx: AontuContext, args?: Val[]): boolean;
    resolve(ctx: AontuContext, args: Val[]): Val;
}
declare function superOf(ctx: AontuContext, v: any): Val;
export { SuperFuncVal, superOf, };
