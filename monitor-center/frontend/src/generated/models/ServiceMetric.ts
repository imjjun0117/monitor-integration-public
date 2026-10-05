/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Status } from './Status';
export type ServiceMetric = {
    key: string;
    label: string;
    kind: ServiceMetric.kind;
    unit: string;
    direction: ServiceMetric.direction;
    value: (number | string | boolean | null);
    status: Status;
    warning: number | null;
    critical: number | null;
};
export namespace ServiceMetric {
    export enum kind {
        NUMBER = 'NUMBER',
        TEXT = 'TEXT',
        BOOLEAN = 'BOOLEAN',
    }
    export enum direction {
        LOW = 'LOW',
        HIGH = 'HIGH',
    }
}

