import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { JunctionVal } from './JunctionVal';
declare class ConjunctVal extends JunctionVal {
    isConjunct: boolean;
    isGenable: boolean;
    cjo: number;
    waits: boolean;
    written: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    append(peer: Val): ConjunctVal;
    unify(peer: Val, ctx: AontuContext): Val;
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    getJunctionSymbol(): string;
    gen(ctx?: AontuContext): any;
}
declare const bareDirective: (t: any) => boolean;
declare function holdsRef(v: any): boolean;
declare function placeTerms(t: any): Val[];
declare function norm(terms: Val[], carried: Val[], lift: boolean): Val[];
declare function unmarkedTemplate(cj: Val, ctx: AontuContext): Val;
export { norm, bareDirective, holdsRef, placeTerms, ConjunctVal, unmarkedTemplate, };
