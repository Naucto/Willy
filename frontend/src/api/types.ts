import type { components } from "./schema";

// Convenience aliases over the generated OpenAPI schema — the single source of truth.
export type Deployment = components["schemas"]["DeploymentDto"];
export type Release = components["schemas"]["ReleaseDto"];
export type MaskedEnvVar = components["schemas"]["MaskedEnvVarDto"];
export type Session = components["schemas"]["SessionDto"];
export type AuthUser = components["schemas"]["AuthUserDto"];

export type CreateDeploymentInput = components["schemas"]["CreateDeploymentDto"];
export type UpdateDeploymentInput = components["schemas"]["UpdateDeploymentDto"];
export type SetEnvVarInput = components["schemas"]["SetEnvVarDto"];
export type WebhookStatus = components["schemas"]["WebhookStatusDto"];
export type WebhookSecret = components["schemas"]["WebhookSecretDto"];

export type DnsRecord = components["schemas"]["DnsRecordDto"];
export type CreateDnsRecordInput = components["schemas"]["CreateDnsRecordDto"];
export type UpdateDnsRecordInput = components["schemas"]["UpdateDnsRecordDto"];

export type Backup = components["schemas"]["BackupDto"];
export type CreateBackupInput = components["schemas"]["CreateBackupDto"];

export type DeploymentType = Deployment["type"];
export type DeploymentState = Deployment["state"];
export type BuildStrategy = Deployment["buildStrategy"];
export type ReleaseStatus = Release["status"];
export type EnvScope = MaskedEnvVar["scope"];
export type Role = AuthUser["role"];
