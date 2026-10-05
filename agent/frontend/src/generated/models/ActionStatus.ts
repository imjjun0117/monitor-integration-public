/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ActionStatus = {
    status: string;
    code?: ActionStatus.code;
    days_remaining?: number;
};
export namespace ActionStatus {
    export enum code {
        ADDRESS_NOT_ALLOWED = 'ADDRESS_NOT_ALLOWED',
        ALLOWLIST_CONFIG_ERROR = 'ALLOWLIST_CONFIG_ERROR',
        AUTH_ERROR = 'AUTH_ERROR',
        REDIRECT_REJECTED = 'REDIRECT_REJECTED',
        AGENT_TIMEOUT = 'AGENT_TIMEOUT',
        AGENT_HTTP_ERROR = 'AGENT_HTTP_ERROR',
        IDENTITY_MISMATCH = 'IDENTITY_MISMATCH',
        TLS_ERROR = 'TLS_ERROR',
        DNS_ERROR = 'DNS_ERROR',
        CONNECTION_ERROR = 'CONNECTION_ERROR',
    }
}

