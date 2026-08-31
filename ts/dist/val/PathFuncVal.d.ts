import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
declare class PathFuncVal extends FuncBaseVal {
    isPathFunc: boolean;
    prepared: number;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    prepare(ctx: AontuContext, args: Val[]): import("./NilVal").NilVal[] | Val[];
    resolve(ctx: AontuContext, args: Val[]): Val;
}
export { PathFuncVal, };
