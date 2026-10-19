/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CollectorEventPage = {
    items: Array<{
        id: number;
        received_at: string;
        payload: {
            started_at?: number;
            duration_ms?: number;
            method?: string;
            path?: string;
            status?: number;
            text?: string;
        };
    }>;
};

