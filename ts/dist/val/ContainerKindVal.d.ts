import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FeatureVal } from './FeatureVal';
import { FuncBaseVal } from './FuncBaseVal';
declare class MapKindVal extends FeatureVal {
    isContainerKind: boolean;
    isMapKind: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    unify(peer: Val, ctx: AontuContext): Val;
    get canon(): string;
    same(peer: any): boolean;
}
declare class ListKindVal extends FeatureVal {
    isContainerKind: boolean;
    isListKind: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    unify(peer: Val, ctx: AontuContext): Val;
    get canon(): string;
    same(peer: any): boolean;
}
declare class MapFuncVal extends FuncBaseVal {
    isMapFunc: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    resolve(ctx: AontuContext, _args: Val[]): MapKindVal;
}
declare class ListFuncVal extends FuncBaseVal {
    isListFunc: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    funcname(): string;
    resolve(ctx: AontuContext, _args: Val[]): ListKindVal;
}
export { MapKindVal, ListKindVal, MapFuncVal, ListFuncVal, };
