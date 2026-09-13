import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
type CmpDef = {
    cmp: string;
    children: string[];
    text?: string;
    req: boolean;
    span?: boolean;
    bag?: string;
};
declare const CMP_DEF: Record<string, CmpDef>;
declare class CmpFuncVal extends FuncBaseVal {
    isCmpFunc: boolean;
    cmp: string;
    constructor(cmp: string, spec: ValSpec, ctx?: AontuContext);
    funcname(): string;
    resolve(ctx: AontuContext, args: Val[]): Val;
}
declare const CMP_FUNCS: Record<string, any>;
export { CMP_DEF, CMP_FUNCS, CmpFuncVal, };
