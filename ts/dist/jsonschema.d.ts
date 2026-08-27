import type { VetFinding } from './vet';
import type { TrustOptions } from './type';
export type SchemaLoss = {
    path: string;
    construct: string;
    reason: string;
};
export type SchemaVerdict = 'ok' | 'lossy' | 'error';
export type SchemaReport = {
    verdict: SchemaVerdict;
    schema: any;
    lossy: SchemaLoss[];
    errors?: VetFinding[];
};
export type SchemaOptions = {
    at?: string;
    path?: string;
    trust?: TrustOptions;
};
export declare function jsonSchema(src: string, options?: SchemaOptions): SchemaReport;
