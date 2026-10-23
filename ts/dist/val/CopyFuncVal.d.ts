import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
declare class CopyFuncVal extends FuncBaseVal {
    isCopyFunc: boolean;
    resolved?: Val;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    prepare(_ctx: AontuContext, _args: Val[]): null;
    resolve(ctx: AontuContext, args: Val[]): import("./NilVal").NilVal | Val;
}
export { CopyFuncVal, };
