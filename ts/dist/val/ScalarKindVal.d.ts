import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FeatureVal } from './FeatureVal';
declare class Integer {
}
declare class Float {
}
declare class BigInteger {
}
declare class BigDecimal {
}
declare class Null {
}
declare class Path {
}
declare function kindParent(kind: any): any;
declare function kindSubsumes(sup: any, sub: any): boolean;
type ScalarConstructor = StringConstructor | NumberConstructor | BooleanConstructor | (typeof Integer) | (typeof Float) | (typeof BigInteger) | (typeof BigDecimal) | (typeof Null) | (typeof Path) | (typeof Integer.constructor);
declare class ScalarKindVal extends FeatureVal {
    isScalarKind: boolean;
    emptyOk: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    withEmpty(ctx: AontuContext): Val;
    unify(peer: Val, ctx: AontuContext): Val;
    get canon(): string;
    superior(): Val;
    same(peer: any): boolean;
}
declare const String_: StringConstructor;
export { String_, BigDecimal, BigInteger, Float, Integer, Null, Path, ScalarConstructor, ScalarKindVal, kindParent, kindSubsumes, };
