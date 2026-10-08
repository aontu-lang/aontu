import type { VetFinding } from './vet';
import type { SchemaLoss, SchemaVerdict } from './jsonschema';
import type { FormatReport } from './format';
export type ImportOptions = {
    path?: string;
    defaults?: boolean;
};
export type ImportReport = {
    verdict: SchemaVerdict;
    aontu: string;
    lossy: SchemaLoss[];
    vet?: string[];
    errors?: VetFinding[];
};
export declare const IMPORT_VET_FLAGS: string[];
export type JEntry = {
    key: string;
    val: JNode;
};
export type JNode = {
    off: number;
    end: number;
} & ({
    t: 'object';
    entries: JEntry[];
} | {
    t: 'array';
    items: JNode[];
} | {
    t: 'string';
    s: string;
} | {
    t: 'number';
    text: string;
} | {
    t: 'true' | 'false' | 'null';
});
export type Fault = {
    why: string;
    off: number;
    end?: number;
    deep?: true;
};
export declare function parseJson(src: string): JNode | Fault;
export declare function importJsonSchema(text: string, options?: ImportOptions): ImportReport;
export declare function agreedForm(text: string, fmt?: (src: string) => FormatReport): string;
