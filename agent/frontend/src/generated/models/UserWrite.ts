/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Identifier } from './Identifier';
export type UserWrite = {
    username: string;
    /**
     * Required on creation; blank on update preserves existing password. Supplied passwords need at least 12 characters and at most 72 UTF-8 bytes.
     */
    password?: string;
    role: UserWrite.role;
    enabled: boolean;
    projectIds: Array<Identifier>;
};
export namespace UserWrite {
    export enum role {
        ADMIN = 'ADMIN',
        OPERATOR = 'OPERATOR',
        VIEWER = 'VIEWER',
    }
}

