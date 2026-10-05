/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Identifier } from './Identifier';
export type InstanceUpdate = {
    instanceId: Identifier;
    displayName: string;
    environment?: string | null;
    /**
     * Normalized HTTP(S) URL without credentials, query, or fragment
     */
    agentBaseUrl: string;
    /**
     * Null or blank preserves the existing token; otherwise at least 32 bytes when UTF-8 encoded
     */
    token?: string | null;
    apiChecksEnabled: boolean;
    pollIntervalSeconds: number;
    enabled: boolean;
};

