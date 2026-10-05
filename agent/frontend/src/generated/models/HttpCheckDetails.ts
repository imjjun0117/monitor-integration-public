/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { HttpEvidenceHeaders } from './HttpEvidenceHeaders';
export type HttpCheckDetails = {
    method?: HttpCheckDetails.method;
    url?: string;
    request_query?: HttpEvidenceHeaders;
    request_headers?: HttpEvidenceHeaders;
    request_body?: string | null;
    request_body_truncated?: boolean;
    connect_timeout_ms?: number;
    read_timeout_ms?: number;
    expected?: string;
    status_code?: number | null;
    response_headers?: HttpEvidenceHeaders;
    response_body?: string | null;
    response_body_truncated?: boolean;
    response_bytes?: number | null;
};
export namespace HttpCheckDetails {
    export enum method {
        GET = 'GET',
        POST = 'POST',
    }
}

