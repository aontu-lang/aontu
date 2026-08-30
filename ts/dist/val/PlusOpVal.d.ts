import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { IntegerVal } from '../val/IntegerVal';
import { NumberVal } from '../val/NumberVal';
import { StringVal } from '../val/StringVal';
import { BooleanVal } from '../val/BooleanVal';
import { BigIntegerVal } from '../val/BigIntegerVal';
import { BigDecimalVal } from '../val/BigDecimalVal';
import { OpBaseVal } from './OpBaseVal';
declare function plusText(v: Val): string | undefined;
declare class PlusOpVal extends OpBaseVal {
    isPlusOp: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    make(_ctx: AontuContext, spec: ValSpec): Val;
    opname(): string;
    operate(ctx: AontuContext, args: Val[]): BigDecimalVal | BigIntegerVal | BooleanVal | IntegerVal | import("./NilVal").NilVal | NumberVal | StringVal | undefined;
    get canon(): string;
}
export { PlusOpVal, plusText, };
