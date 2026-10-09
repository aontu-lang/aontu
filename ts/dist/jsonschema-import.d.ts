import type { VetFinding } from './vet';
import type { SchemaLoss, SchemaVerdict } from './jsonschema';
import type { FormatReport } from './format';
export type ImportOptions = {
    path?: string;
    defaults?: boolean;
    uri?: string;
    documents?: Record<string, string>;
    formatAssertion?: boolean;
    formats?: Record<string, string>;
    dialect?: string;
    noMetaCheck?: boolean;
};
export type ImportReport = {
    verdict: SchemaVerdict;
    aontu: string;
    lossy: SchemaLoss[];
    vet?: string[];
    errors?: VetFinding[];
};
export declare const IMPORT_VET_FLAGS: string[];
export type UpgradeReport = {
    verdict: 'ok' | 'error';
    dialect: string;
    schema: unknown;
    rewritten: [string, string][];
    errors?: VetFinding[];
};
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
    was?: Map<string, JNode>;
    unknown?: JEntry[];
    ignored?: string[];
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
export type Dialect = 'draft-04' | 'draft-06' | 'draft-07' | '2019-09' | '2020-12';
export declare function importJsonSchema(text: string, options?: ImportOptions): ImportReport;
export declare function upgradeJsonSchema(text: string, options?: ImportOptions): UpgradeReport;
export declare function agreedForm(text: string, fmt?: (src: string) => FormatReport): string;
