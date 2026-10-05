/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Identifier } from './Identifier';
import type { Status } from './Status';
export type DashboardStatusCause = {
    project_id: Identifier;
    instance_id: (Identifier | null);
    kind: DashboardStatusCause.kind;
    status: Status;
    metric_key: string | null;
    check_category?: DashboardStatusCause.check_category;
    subject_id: string | null;
    subject_name: string | null;
    value: number | null;
    warning_value: number | null;
    critical_value: number | null;
    result_code: string | null;
    observed_at: string | null;
};
export namespace DashboardStatusCause {
    export enum kind {
        COLLECTION = 'COLLECTION',
        METRIC = 'METRIC',
        CHECK = 'CHECK',
        CERTIFICATE = 'CERTIFICATE',
        CLOCK_SKEW = 'CLOCK_SKEW',
        PARTIAL_COLLECTION = 'PARTIAL_COLLECTION',
    }
    export enum check_category {
        INTERNAL = 'INTERNAL',
        API = 'API',
    }
}

