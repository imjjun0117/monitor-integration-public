/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type RoleWrite = {
    roleId: string;
    name: string;
    description: string;
    baseRole: RoleWrite.baseRole;
    enabled: boolean;
};
export namespace RoleWrite {
    export enum baseRole {
        ADMIN = 'ADMIN',
        OPERATOR = 'OPERATOR',
        VIEWER = 'VIEWER',
    }
}

