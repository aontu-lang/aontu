import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
import { TopVal } from './TopVal';
export declare function idName(v: any): string | undefined;
declare class IdFuncVal extends FuncBaseVal {
    isIdFunc: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    deferResolve(ctx: AontuContext): boolean;
    resolve(ctx: AontuContext, args: Val[]): import("./NilVal").NilVal | TopVal;
}
export { IdFuncVal, };
