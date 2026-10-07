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
    branches: any[];
};
type WhenAtom = {
    c: any;
    t: any;
    e?: any;
};
type ContainsAtom = {
    c: any;
    count: ConstraintState;
};
type RestRecord = {
    keys?: any;
    prefix?: bigint;
    items?: any;
    covers: RestCover[];
    else?: RestRecord;
};
type RestCover = {
    trial: any;
    rec: RestRecord;
    src: any;
};
type RestAtom = {
    t: any;
    covers: RestCover[];
};
type ConstraintState = {
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
    whens?: WhenAtom[];
    contains?: ContainsAtom[];
    rests?: RestAtom[];
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
    whens: WhenAtom[];
    contains: ContainsAtom[];
    rests: RestAtom[];
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
    settle(peer: Val, ctx: AontuContext): Val;
    private admit;
    private checkMusts;
    private checkNofs;
    private checkWhens;
    private checkContains;
    private checkRests;
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
declare function constraintAdmitsScalar(g: ConstraintVal, scalar: any): boolean | 'undecided';
declare function restCanon(r: RestAtom): string;
declare function nofCounts(n: NofAtom): number[];
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
declare class MultipleConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class MustConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class NofConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class WhenConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class ContainsConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class RestConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class LenConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
declare class UniqueConstraintVal extends ConstraintVal {
    constructor(spec: ValSpec, ctx?: AontuContext);
}
export { normaliseRe, constraintSubsumesConstraint, constraintAdmitsScalar, nofCounts, restCanon, ConstraintVal, MinConstraintVal, MaxConstraintVal, AboveConstraintVal, BelowConstraintVal, NeqConstraintVal, MultipleConstraintVal, ReConstraintVal, LenConstraintVal, UniqueConstraintVal, MustConstraintVal, NofConstraintVal, WhenConstraintVal, ContainsConstraintVal, RestConstraintVal, };
