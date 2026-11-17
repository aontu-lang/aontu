import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
declare class GenFuncVal extends FuncBaseVal {
    isGenFunc: boolean;
    cjo: number;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    rides(): boolean;
    resolve(ctx: AontuContext, args: Val[]): any;
}
export { GenFuncVal, };
