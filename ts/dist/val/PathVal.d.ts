import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { ScalarVal } from './ScalarVal';
import { ScalarKindVal } from './ScalarKindVal';
declare class PathVal extends ScalarVal {
    isPath: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    get canon(): string;
    superior(): Val;
}
declare class PathKindVal extends ScalarKindVal {
    isPathKind: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    unify(peer: Val, ctx: AontuContext): Val;
    get canon(): string;
}
export { PathVal, PathKindVal, };
