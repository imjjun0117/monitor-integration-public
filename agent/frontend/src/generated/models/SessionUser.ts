/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ManagedMenu } from './ManagedMenu';
export type SessionUser = {
    menus?: Array<ManagedMenu>;
    username: string;
    role_id?: string;
    role_name?: string;
    role: SessionUser.role;
    project_ids?: Array<string>;
};
export namespace SessionUser {
    export enum role {
        ADMIN = 'ADMIN',
        OPERATOR = 'OPERATOR',
        VIEWER = 'VIEWER',
    }
}

