import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
import type { ArithOp } from './arith';
declare class ArithFuncVal extends FuncBaseVal {
    isArithFunc: boolean;
    op: ArithOp;
    constructor(spec: ValSpec, ctx: AontuContext | undefined, op: ArithOp);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): ArithOp;
    resolve(ctx: AontuContext | undefined, args: Val[]): Val;
}
declare class AddFuncVal extends ArithFuncVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class SubFuncVal extends ArithFuncVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class MulFuncVal extends ArithFuncVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class DivFuncVal extends ArithFuncVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class ModFuncVal extends ArithFuncVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class RemFuncVal extends ArithFuncVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
export { ArithFuncVal, AddFuncVal, SubFuncVal, MulFuncVal, DivFuncVal, ModFuncVal, RemFuncVal, };
