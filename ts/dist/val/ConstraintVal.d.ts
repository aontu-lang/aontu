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
type ConstraintState = {
    domain?: 'number' | 'string';
    kind?: any;
    lo?: Bound;
    hi?: Bound;
    neqs: any[];
    res: ReAtom[];
    count?: ConstraintState;
    uniq: boolean;
    uniqBy: string[];
    musts: MustAtom[];
    clash?: boolean;
    invalid?: string;
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
    res: ReAtom[];
    count?: ConstraintState;
    uniq: boolean;
    uniqBy: string[];
    musts: MustAtom[];
    pending?: {
        atom: string;
        args: any[];
    };
    clash?: boolean;
    invalid?: string;
    invalidWhy?: string;
    constructor(spec: ValSpec & {
        atom?: string;
        state?: ConstraintState;
    }, ctx?: AontuContext);
    private fromAtom;
    unify(peer: Val, ctx: AontuContext): Val;
    private settle;
    private admit;
    private checkMusts;
    private admitContainer;
    private meetKind;
    private meetConstraint;
    private finish;
    private fail;
    private cloneState;
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    get canon(): string;
    same(peer: any): boolean;
}
declare function constraintSubsumesConstraint(g: ConstraintVal, s: ConstraintVal): boolean | 'undecided';
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
declare class ReConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class MustConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class LengthConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class UniqueConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
export { normaliseRe, constraintSubsumesConstraint, constraintAdmitsScalar, ConstraintVal, MinConstraintVal, MaxConstraintVal, AboveConstraintVal, BelowConstraintVal, NeqConstraintVal, ReConstraintVal, LengthConstraintVal, UniqueConstraintVal, MustConstraintVal, };
