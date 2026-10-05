/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Identifier } from './Identifier';
export type Threshold = {
    scope: Threshold.scope;
    projectId: (Identifier | null);
    instanceId: (Identifier | null);
    metricKey: Threshold.metricKey;
    warningValue: number;
    criticalValue: number;
};
export namespace Threshold {
    export enum scope {
        GLOBAL = 'GLOBAL',
        PROJECT = 'PROJECT',
        INSTANCE = 'INSTANCE',
    }
    export enum metricKey {
        SYSTEM_CPU = 'SYSTEM_CPU',
        PHYSICAL_MEMORY = 'PHYSICAL_MEMORY',
        JVM_HEAP = 'JVM_HEAP',
        DISK = 'DISK',
        DB_POOL = 'DB_POOL',
        API_LATENCY_MS = 'API_LATENCY_MS',
        CERTIFICATE_DAYS = 'CERTIFICATE_DAYS',
    }
}

