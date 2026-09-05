import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
declare class EscFuncVal extends FuncBaseVal {
    isEscFunc: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    resolve(ctx: AontuContext, args: Val[]): import("./NilVal").NilVal | Val;
}
declare class UscFuncVal extends FuncBaseVal {
    isUscFunc: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    resolve(ctx: AontuContext, args: Val[]): import("./NilVal").NilVal | Val;
}
declare class RepFuncVal extends FuncBaseVal {
    isRepFunc: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    resolve(ctx: AontuContext, args: Val[]): import("./NilVal").NilVal | Val;
}
declare class SplitFuncVal extends FuncBaseVal {
    isSplitFunc: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    resolve(ctx: AontuContext, args: Val[]): import("./NilVal").NilVal | Val;
}
export { EscFuncVal, UscFuncVal, RepFuncVal, SplitFuncVal, };
