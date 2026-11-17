type RiderRecord<T> = Record<string, T[]>;
declare function unionRecords<T>(records: (RiderRecord<T> | undefined)[], key: (v: T) => string): RiderRecord<T>;
declare function unionVia(...lists: (string[] | undefined)[]): string[];
export type DeclRecord = {
    acyclic: boolean;
    inverses: string[];
};
declare function unionDecls(records: (DeclRecord | undefined)[]): DeclRecord;
declare function graphAtomsText(d: DeclRecord): string;
declare function rides(v: any): boolean;
declare function bare(v: any): boolean;
declare function recordLayers<T>(rec: RiderRecord<T>): Record<string, T>[];
declare function sameRec(a: any, b: any): boolean;
declare function riderText(s: string, v: any): string;
export { bare, graphAtomsText, unionDecls, unionRecords, unionVia, recordLayers, riderText, rides, sameRec, };
