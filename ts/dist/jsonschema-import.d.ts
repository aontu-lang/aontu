import type { SchemaLoss } from './jsonschema';
export type SchemaImportError = {
    code: string;
    class: string;
    path: string;
    message: string;
};
export type SchemaImportReport = {
    source: string;
    lossy: SchemaLoss[];
    verdict: 'ok' | 'lossy' | 'error';
    errors?: SchemaImportError[];
};
export type SchemaImportOptions = {
    defaults?: boolean;
    formatAssertion?: boolean;
    documents?: Record<string, string>;
};
export declare const DEPRECATE_KEY = "x-aontu-deprecate";
export declare function isKeyword(k: string): boolean;
export declare function importJsonSchema(text: string, options?: SchemaImportOptions): SchemaImportReport;
