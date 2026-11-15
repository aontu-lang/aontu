import type { ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { ScalarVal } from './ScalarVal';
declare class CustomVal extends ScalarVal {
    isCustom: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    get canon(): any;
}
export { CustomVal, };
