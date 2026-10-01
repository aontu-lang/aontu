import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FeatureVal } from './FeatureVal';
type Bound = {
    v: any;
    open: boolean;
};
type ReAtom = {
    v: any;
    src: string;
    norm: string;
    re: RegExp;
};
type MustAtom = {
    v: any;
    msg: any;
};
type NofAtom = {
    count: ConstraintState;
    cs: any[];
};
type ConstraintState = {
    domain?: 'number' | 'string';
    kind?: any;
    lo?: Bound;
    hi?: Bound;
    neqs: any[];
    mults?: any[];
    res: ReAtom[];
    count?: ConstraintState;
    uniq: boolean;
    uniqBy: string[];
    musts: MustAtom[];
    nofs?: NofAtom[];
    clash?: boolean;
    invalid?: string;
    nonEmpty?: boolean;
    emptyOk?: boolean;
    pathKind?: boolean;
};
declare function normaliseRe(src: string): [string, string];
declare class ConstraintVal extends FeatureVal {
    isConstraint: boolean;
    cjo: number;
    domain?: 'number' | 'string';
    kind?: any;
    lo?: Bound;
    hi?: Bound;
    neqs: any[];
    mults: any[];
    res: ReAtom[];
    count?: ConstraintState;
    uniq: boolean;
    uniqBy: string[];
    musts: MustAtom[];
    nofs: NofAtom[];
    pending?: {
        atom: string;
        args: any[];
    };
    clash?: boolean;
    invalid?: string;
    invalidWhy?: string;
    nonEmpty?: boolean;
    emptyOk?: boolean;
    pathKind?: boolean;
    constructor(spec: ValSpec & {
        atom?: string;
        state?: ConstraintState;
    }, ctx?: AontuContext);
    private fromAtom;
    unify(peer: Val, ctx: AontuContext): Val;
    private settle;
    private admit;
    private checkMusts;
    private checkNofs;
    settleContainer(peer: any, ctx: AontuContext): Val;
    private admitContainer;
    private hold;
    private meetKind;
    private meetConstraint;
    private finish;
    private fail;
    private cloneState;
    allowEmpty(ctx: AontuContext, peer: Val): Val;
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    get canon(): string;
    same(peer: any): boolean;
}
declare function constraintSubsumesConstraint(g: ConstraintVal, s: ConstraintVal): boolean | 'undecided';
declare function constraintSubsumesKind(g: ConstraintVal, marker: any): boolean;
declare function constraintAdmitsScalar(g: ConstraintVal, scalar: any): boolean | 'undecided';
declare class MinConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class MaxConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class AboveConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class BelowConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class NeqConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class MultipleConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class ReConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class MustConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class NofConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class LenConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare function nofCounts(n: NofAtom): boolean[];
declare class UniqueConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
export { normaliseRe, nofCounts, constraintSubsumesConstraint, constraintSubsumesKind, constraintAdmitsScalar, ConstraintVal, MinConstraintVal, MaxConstraintVal, AboveConstraintVal, BelowConstraintVal, NeqConstraintVal, MultipleConstraintVal, ReConstraintVal, LenConstraintVal, UniqueConstraintVal, MustConstraintVal, NofConstraintVal, };
