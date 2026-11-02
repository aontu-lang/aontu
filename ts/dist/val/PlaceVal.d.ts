import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { Val as ValBase } from './Val';
declare class PlaceVal extends ValBase {
    isPlace: boolean;
    held: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    unify(peer: Val, _ctx: AontuContext): Val;
    get canon(): string;
    superior(): Val;
}
declare function boundArgStart(v: any): number;
declare function hasPlace(v: Val): boolean;
declare function doneButHoles(v: any): boolean;
declare function waitsOnHole(v: Val): boolean;
declare const HOLDING: Record<string, number>;
declare function holdHoles(v: any, bagged: boolean): void;
declare function unfillable(ctx: AontuContext, call: any, args: Val[]): boolean;
declare function fillPlace(v: Val, fill: Val, ctx: AontuContext): Val;
declare function bindHole(v: Val, fill: Val, ctx: AontuContext): Val;
declare function rebuild(v: Val, peg: any, ctx: AontuContext): Val;
export { boundArgStart, rebuild, hasPlace, HOLDING, holdHoles, unfillable, doneButHoles, waitsOnHole, fillPlace, bindHole, PlaceVal, };
