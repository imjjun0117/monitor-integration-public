/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Status } from './Status';
export type IncidentCheck = {
    instance_id: string;
    check_id: string;
    name: string | null;
    category: string | null;
    checked_at: string | null;
    central_received_at: string | null;
    status: Status;
    duration_ms: number | null;
    result_code: string | null;
};

