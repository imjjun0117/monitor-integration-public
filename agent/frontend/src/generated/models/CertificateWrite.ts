/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Identifier } from './Identifier';
export type CertificateWrite = {
    projectId: Identifier;
    hostname: string;
    port: number;
    sniHostname: string;
    enabled: boolean;
    checkIntervalMinutes: number;
};

