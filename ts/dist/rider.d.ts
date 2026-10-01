type RiderRecord<T> = Record<string, T[]>;
declare function unionRecords<T>(records: (RiderRecord<T> | undefined)[], key: (v: T) => string): RiderRecord<T>;
declare function recordLayers<T>(rec: RiderRecord<T>): Record<string, T>[];
declare function riderText(s: string, v: any): string;
export { unionRecords, recordLayers, riderText, };
