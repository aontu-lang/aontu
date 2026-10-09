import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FeatureVal } from './FeatureVal';
declare class RecurseVal extends FeatureVal {
    isRecurse: boolean;
    isGenable: boolean;
    cjo: number;
    target: string[];
    xc: number;
    constructor(spec: ValSpec, ctx?: AontuContext);
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    private body;
    unify(peer: Val, ctx: AontuContext): Val;
    get targetSpelling(): string;
    get canon(): string;
    gen(ctx: AontuContext): undefined;
}
export declare function throughRider(v: any): any;
export declare function declaration(cj: any, key: string): Val | undefined;
declare function bumpRecurse(v: any, xc: number): void;
declare function containsRecurseOf(v: any, target: string[], d: number, root?: any, seen?: Set<string>): boolean;
export { RecurseVal, bumpRecurse, containsRecurseOf, };
