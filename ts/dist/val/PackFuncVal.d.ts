import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FuncBaseVal } from './FuncBaseVal';
type Member = {
    key: string;
    val: Val;
};
declare function packMembers(ctx: AontuContext, data: Val | undefined, k: Val | undefined): Member[] | string | Val | undefined;
declare class PackFuncVal extends FuncBaseVal {
    isPackFunc: boolean;
    staged: boolean;
    packed: Member[] | string | Val | undefined;
    constructor(spec: ValSpec, ctx?: AontuContext);
    funcname(): string;
    prepare(_ctx: AontuContext, _args: Val[]): null;
    unify(peer: Val, ctx: AontuContext): Val;
    resolve(ctx: AontuContext, args: Val[]): import("./NilVal").NilVal | Val;
}
export { packMembers, PackFuncVal, };
