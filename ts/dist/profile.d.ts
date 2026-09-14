import type { IncludeOptions } from './utility';
import type { VetFinding } from './vet';
export type ProfileOptions = IncludeOptions & {
    path?: string;
};
export declare function loadProfile(src: string, options?: ProfileOptions): {
    profile?: any;
    errors?: VetFinding[];
};
