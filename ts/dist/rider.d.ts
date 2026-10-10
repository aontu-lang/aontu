type RiderRecord<T> = Record<string, T[]>;
declare function unionRecords<T>(records: (RiderRecord<T> | undefined)[], key: (v: T) => string): RiderRecord<T>;
declare function unionVia(...lists: (string[] | undefined)[]): string[];
declare function rides(v: any): boolean;
declare function recordLayers<T>(rec: RiderRecord<T>): Record<string, T>[];
declare function riderText(s: string, v: any): string;
export { unionRecords, unionVia, recordLayers, riderText, rides, };
