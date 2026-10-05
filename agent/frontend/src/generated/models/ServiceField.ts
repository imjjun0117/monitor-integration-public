/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ServiceField = {
    key: string;
    label: string;
    source: ServiceField.source;
    /**
     * Simple JSON path, for example $.balance or $.data.remaining[0]. Only named fields and array indexes are supported.
     */
    path: string;
    kind: ServiceField.kind;
    unit?: string;
    direction?: ServiceField.direction;
    /**
     * Missing this field prevents a healthy service information status.
     */
    required?: boolean;
    warning?: number | null;
    critical?: number | null;
    valueLabels?: Record<string, string>;
    when?: {
        path: string;
        values: Array<(string | boolean | number)>;
    };
};
export namespace ServiceField {
    export enum source {
        DETAILS = 'DETAILS',
        RESPONSE_JSON = 'RESPONSE_JSON',
    }
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

