/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type LogWrite = {
    name: string;
    path: string;
    encoding: LogWrite.encoding;
    enabled: boolean;
    pollIntervalSeconds: number;
};
export namespace LogWrite {
    export enum encoding {
        UTF_8 = 'UTF-8',
        MS949 = 'MS949',
        EUC_KR = 'EUC-KR',
    }
}

