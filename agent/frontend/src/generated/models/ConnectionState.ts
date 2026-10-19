/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ConnectionState = {
    state: string;
    mode?: ConnectionState.mode;
    xlog_enabled?: boolean;
    reason?: string;
    dropped?: number;
    last_received_at?: string;
};
export namespace ConnectionState {
    export enum mode {
        HTTP = 'HTTP',
        WSS = 'WSS',
    }
}

