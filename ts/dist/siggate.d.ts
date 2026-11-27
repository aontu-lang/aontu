import type { Val } from './type';
import { AontuContext } from './ctx';
declare function sigRefuse(ctx: AontuContext, fn: any, args: Val[]): Val | undefined;
declare function restRefuse(ctx: AontuContext, fn: any, args: Val[]): Val | undefined;
export { restRefuse, sigRefuse, };
