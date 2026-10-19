/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type XlogPage = {
    enabled_projects: number;
    eligible_instances: number;
    connected_instances: number;
    summary: {
        count: number;
        errors: number;
        average_ms: number;
        p95_ms: number;
    };
    items: Array<{
        id: number;
        project_id: string;
        instance_id: string;
        project_name: string;
        instance_name: string;
        received_at: string;
        payload: {
            started_at: number;
            duration_ms: number;
            method: string;
            path: string;
            status: number;
        };
    }>;
};

