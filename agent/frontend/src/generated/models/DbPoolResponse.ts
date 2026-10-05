/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DbPool } from './DbPool';
import type { DbPoolMetricSample } from './DbPoolMetricSample';
export type DbPoolResponse = {
    items: Array<DbPool>;
    history: Array<DbPoolMetricSample>;
    stale: boolean;
};

