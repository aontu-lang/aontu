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
export declare function importJsonSchema(text: string): SchemaImportReport;
