import type { components, paths } from "./schema";

// Convenience aliases over the generated OpenAPI schema — the single source of truth.
export type Deployment = components["schemas"]["DeploymentDto"];
export type Release = components["schemas"]["ReleaseDto"];
export type CronRun = components["schemas"]["CronRunDto"];
export type MaskedEnvVar = components["schemas"]["MaskedEnvVarDto"];
export type Session = components["schemas"]["SessionDto"];
export type AuthUser = components["schemas"]["AuthUserDto"];

export type CreateDeploymentInput = components["schemas"]["CreateDeploymentDto"];
export type UpdateDeploymentInput = components["schemas"]["UpdateDeploymentDto"];
export type SetEnvVarInput = components["schemas"]["SetEnvVarDto"];
export type UpdateEnvVarMetaInput = components["schemas"]["UpdateEnvVarMetaDto"];
export type WebhookStatus = components["schemas"]["WebhookStatusDto"];
export type WebhookSecret = components["schemas"]["WebhookSecretDto"];

export type DnsRecord = components["schemas"]["DnsRecordDto"];
export type CreateDnsRecordInput = components["schemas"]["CreateDnsRecordDto"];
export type UpdateDnsRecordInput = components["schemas"]["UpdateDnsRecordDto"];

export type Backup = components["schemas"]["BackupDto"];
export type CreateBackupInput = components["schemas"]["CreateBackupDto"];
export type PanelUser = components["schemas"]["UserDto"];
export type CreateUserInput = components["schemas"]["CreateUserDto"];
export type UpdateUserInput = components["schemas"]["UpdateUserDto"];
export type LoginResult = components["schemas"]["LoginResultDto"];
export type TotpSetupResponse = components["schemas"]["TotpSetupResponseDto"];
export type Container = components["schemas"]["ContainerDto"];
export type HostResources = components["schemas"]["HostResourcesDto"];
export type VolumeMount = components["schemas"]["VolumeMountDto"];
export type BackupSchedule = components["schemas"]["BackupScheduleDto"];
export type CreateBackupScheduleInput = components["schemas"]["CreateBackupScheduleDto"];
export type BackupDestination = components["schemas"]["BackupDestinationDto"];
export type CreateBackupDestinationInput = components["schemas"]["CreateBackupDestinationDto"];

export type DeploymentDomain = components["schemas"]["DomainDto"];
export type AddDomainInput = components["schemas"]["AddDomainDto"];
export type UpdateDomainTargetInput = components["schemas"]["UpdateDomainTargetDto"];
export type PortBinding = components["schemas"]["PortBindingDto"];
export type AddPortBindingInput = components["schemas"]["AddPortBindingDto"];
export type UpdatePortBindingInput = components["schemas"]["UpdatePortBindingDto"];
export type ResourceLimits = components["schemas"]["ResourceLimitsDto"];
export type Healthcheck = components["schemas"]["HealthcheckDto"];
export type DeclaredHealthcheck = components["schemas"]["DeclaredHealthcheckDto"];

export type AdminImage = components["schemas"]["AdminImageDto"];
export type AdminContainer = components["schemas"]["AdminContainerDto"];
export type AdminPruneResult = components["schemas"]["PruneResultDto"];
export type AppSettings = components["schemas"]["AppSettingsDto"];
export type UpdateAppSettings = components["schemas"]["UpdateAppSettingsDto"];
export type DeploymentStats = components["schemas"]["DeploymentStatsDto"];
export type SystemStats = components["schemas"]["SystemStatsDto"];
export type HostStatsHistory = components["schemas"]["HostStatsHistoryDto"];
export type HostStatsSample = components["schemas"]["HostStatsSampleDto"];
export type DeploymentStatsHistory = components["schemas"]["DeploymentStatsHistoryDto"];
export type DeploymentStatsSample = components["schemas"]["DeploymentStatsSampleDto"];
export type StatsWindow = NonNullable<
  NonNullable<paths["/admin/stats/history"]["get"]["parameters"]["query"]>["window"]
>;
export type Task = components["schemas"]["TaskDto"];
export type AuditLog = components["schemas"]["AuditLogDto"];
export type DeploymentRef = components["schemas"]["DeploymentRefDto"];

export type DeploymentType = Deployment["type"];
export type DeploymentState = Deployment["state"];
export type BuildStrategy = Deployment["buildStrategy"];
export type ReleaseStatus = Release["status"];
export type EnvScope = MaskedEnvVar["scope"];
export type Role = AuthUser["role"];
