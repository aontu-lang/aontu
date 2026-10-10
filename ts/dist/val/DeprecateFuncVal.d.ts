import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
declare class DeprecateFuncVal extends FuncBaseVal {
    isDeprecateFunc: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    rides(): boolean;
    resolve(ctx: AontuContext, args: Val[]): Val;
}
export { DeprecateFuncVal, };
