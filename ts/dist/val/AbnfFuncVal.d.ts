import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
declare class AbnfFuncVal extends FuncBaseVal {
    isAbnfFunc: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    resolve(ctx: AontuContext, args: Val[]): Val;
}
declare class ParseFuncVal extends FuncBaseVal {
    isParseFunc: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    unify(peer: Val, ctx: AontuContext): Val;
    hold(peer: Val, ctx: AontuContext): Val;
    resolve(ctx: AontuContext, args: Val[]): Val;
}
export { AbnfFuncVal, ParseFuncVal, };
