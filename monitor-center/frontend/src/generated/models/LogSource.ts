/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type LogSource = {
    log_id: number;
    name: string;
    path: string;
    encoding: LogSource.encoding;
    enabled: boolean;
    poll_interval_seconds: number;
};
export namespace LogSource {
    export enum encoding {
        UTF_8 = 'UTF-8',
        MS949 = 'MS949',
        EUC_KR = 'EUC-KR',
    }
}

