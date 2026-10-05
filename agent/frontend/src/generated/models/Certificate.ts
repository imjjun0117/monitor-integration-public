/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Identifier } from './Identifier';
import type { Status } from './Status';
export type Certificate = {
    certificate_target_id: number;
    project_id: Identifier;
    hostname: string;
    port: number;
    sni_hostname: string;
    check_interval_minutes: number;
    subject: string | null;
    issuer: string | null;
    serial_number: string | null;
    not_before: string | null;
    not_after: string | null;
    days_remaining: number | null;
    chain_valid: boolean | null;
    hostname_valid: boolean | null;
    signature_algorithm: string | null;
    status: (Status | null);
    message: string | null;
    checked_at: string | null;
    enabled: boolean;
};

