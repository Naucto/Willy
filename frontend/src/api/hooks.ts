import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./client";
import { tokens } from "./tokens";
import type {
  AddDomainInput,
  CreateBackupDestinationInput,
  CreateBackupInput,
  CreateBackupScheduleInput,
  CreateDeploymentInput,
  CreateDnsRecordInput,
  CreateUserInput,
  ResourceLimits,
  Role,
  SetEnvVarInput,
  UpdateDeploymentInput,
  UpdateDnsRecordInput,
  UpdateDomainTargetInput,
} from "./types";

export const queryKeys = {
  deployments: ["deployments"] as const,
  deployment: (id: string) => ["deployments", id] as const,
  releases: (id: string) => ["deployments", id, "releases"] as const,
  release: (id: string) => ["releases", id] as const,
  env: (id: string) => ["deployments", id, "env"] as const,
  webhook: (id: string) => ["deployments", id, "webhook"] as const,
  systemInfo: ["system", "info"] as const,
};

export function useDnsZones() {
  return useQuery({
    queryKey: ["dns", "zones"],
    queryFn: async () => unwrap(await api.GET("/dns/zones")),
  });
}

export function useDnsRecords(zone: string) {
  return useQuery({
    queryKey: ["dns", "records", zone],
    enabled: zone.length > 0,
    queryFn: async () =>
      unwrap(await api.GET("/dns/zones/{zone}/records", { params: { path: { zone } } })),
  });
}

// Registers a zone for Willy to manage (the zone-registration config surface).
export function useRegisterZone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (zone: string) => unwrap(await api.POST("/dns/zones", { body: { zone } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dns", "zones"] }),
  });
}

export function useUnregisterZone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (zone: string) =>
      unwrap(await api.DELETE("/dns/zones/{zone}", { params: { path: { zone } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dns", "zones"] }),
  });
}

export function useCreateDnsRecord(zone: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateDnsRecordInput) =>
      unwrap(await api.POST("/dns/zones/{zone}/records", { params: { path: { zone } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dns", "records", zone] }),
  });
}

export function useUpdateDnsRecord(zone: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: number; body: UpdateDnsRecordInput }) =>
      unwrap(
        await api.PUT("/dns/zones/{zone}/records/{id}", {
          params: { path: { zone, id: input.id } },
          body: input.body,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dns", "records", zone] }),
  });
}

export function useDeleteDnsRecord(zone: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) =>
      unwrap(
        await api.DELETE("/dns/zones/{zone}/records/{id}", { params: { path: { zone, id } } }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dns", "records", zone] }),
  });
}

export function useSystemInfo() {
  return useQuery({
    queryKey: queryKeys.systemInfo,
    queryFn: async () => unwrap(await api.GET("/system/info")),
    staleTime: Number.POSITIVE_INFINITY,
    // Keep retrying while the backend is unreachable so the login screen recovers on its own.
    retry: true,
    refetchInterval: (query) => (query.state.data ? false : 5000),
  });
}

// Host CPU/memory capacity, for sizing the resource-limit sliders to the real machine.
export function useHostResources() {
  return useQuery({
    queryKey: ["system", "resources"],
    queryFn: async () => unwrap(await api.GET("/system/resources")),
    staleTime: 5 * 60 * 1000,
  });
}

// Tagged images present on the host, for the IMAGE-source "browse images" picker.
export function useDockerImages() {
  return useQuery({
    queryKey: ["system", "images"],
    queryFn: async () => unwrap(await api.GET("/system/images")),
    staleTime: 60 * 1000,
  });
}

// Discovers a git remote's branches without cloning (for the source step's branch picker).
export function useDiscoverBranches() {
  return useMutation({
    mutationFn: async (input: { url: string; token?: string }) => {
      const body = input.token ? { url: input.url, token: input.token } : { url: input.url };

      return unwrap(await api.POST("/git/branches", { body }));
    },
  });
}

export function useBackups() {
  return useQuery({
    queryKey: ["backups"],
    queryFn: async () => unwrap(await api.GET("/backups")),
    // Reflect PENDING → RUNNING → SUCCESS without manual refresh.
    refetchInterval: 4000,
  });
}

export function useBackupVolumes() {
  return useQuery({
    queryKey: ["backups", "volumes"],
    queryFn: async () => unwrap(await api.GET("/backups/volumes")),
  });
}

export function useCreateBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateBackupInput) => unwrap(await api.POST("/backups", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backups"] }),
  });
}

export function useDeleteBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE("/backups/{id}", { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backups"] }),
  });
}

export function useCreateBackupFor(deploymentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (target: string) =>
      unwrap(await api.POST("/backups", { body: { kind: "VOLUME_TAR", target, deploymentId } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backups"] }),
  });
}

export function useRestoreBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.POST("/backups/{id}/restore", { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backups"] }),
  });
}

export function useBackupDestinations() {
  return useQuery({
    queryKey: ["backups", "destinations"],
    queryFn: async () => unwrap(await api.GET("/backups/destinations")),
  });
}

export function useCreateDestination() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateBackupDestinationInput) =>
      unwrap(await api.POST("/backups/destinations", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backups", "destinations"] }),
  });
}

export function useTestDestination() {
  return useMutation({
    mutationFn: async (body: CreateBackupDestinationInput) =>
      unwrap(await api.POST("/backups/destinations/test", { body })),
  });
}

export function useDeleteDestination() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE("/backups/destinations/{id}", { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backups", "destinations"] }),
  });
}

export function usePushBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; destinationId: string }) =>
      unwrap(
        await api.POST("/backups/{id}/push/{destinationId}", {
          params: { path: { id: input.id, destinationId: input.destinationId } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backups"] }),
  });
}

export function useBackupSchedules() {
  return useQuery({
    queryKey: ["backups", "schedules"],
    queryFn: async () => unwrap(await api.GET("/backups/schedules")),
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateBackupScheduleInput) =>
      unwrap(await api.POST("/backups/schedules", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backups", "schedules"] }),
  });
}

export function useSetScheduleEnabled() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; enabled: boolean }) =>
      unwrap(
        await api.PATCH("/backups/schedules/{id}", {
          params: { path: { id: input.id } },
          body: { enabled: input.enabled },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backups", "schedules"] }),
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE("/backups/schedules/{id}", { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backups", "schedules"] }),
  });
}

// Fetches the artifact with the bearer token (a plain link can't set headers) and saves it.
export async function downloadBackup(id: string): Promise<void> {
  const response = await fetch(`/api/backups/${id}/download`, {
    headers: { Authorization: `Bearer ${tokens.getAccess() ?? ""}` },
  });

  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }

  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${id}.tar.gz`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: async () => unwrap(await api.GET("/users")),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateUserInput) => unwrap(await api.POST("/users", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useSetUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; role: Role }) =>
      unwrap(
        await api.PATCH("/users/{id}/role", {
          params: { path: { id: input.id } },
          body: { role: input.role },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useSetUserPassword() {
  return useMutation({
    mutationFn: async (input: { id: string; password: string }) =>
      unwrap(
        await api.PATCH("/users/{id}/password", {
          params: { path: { id: input.id } },
          body: { password: input.password },
        }),
      ),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE("/users/{id}", { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useHostPublicIp() {
  return useQuery({
    queryKey: ["system", "public-ip"],
    queryFn: async () => unwrap(await api.GET("/system/public-ip")),
    staleTime: 5 * 60 * 1000,
  });
}

export function useDeployments() {
  return useQuery({
    queryKey: queryKeys.deployments,
    queryFn: async () => unwrap(await api.GET("/deployments")),
    // Keep states fresh while a deploy is in flight without hammering the API.
    refetchInterval: 5000,
  });
}

export function useDeployment(id: string) {
  return useQuery({
    queryKey: queryKeys.deployment(id),
    queryFn: async () => unwrap(await api.GET("/deployments/{id}", { params: { path: { id } } })),
    enabled: id.length > 0,
    refetchInterval: 5000,
  });
}

export function useDeploymentContainers(id: string) {
  return useQuery({
    queryKey: ["deployments", id, "containers"],
    queryFn: async () =>
      unwrap(await api.GET("/deployments/{id}/containers", { params: { path: { id } } })),
    enabled: id.length > 0,
    refetchInterval: 5000,
  });
}

export function useDeploymentDomains(id: string) {
  return useQuery({
    queryKey: ["deployments", id, "domains"],
    queryFn: async () =>
      unwrap(await api.GET("/deployments/{id}/domains", { params: { path: { id } } })),
  });
}

// Domain changes affect the deployment's primaryDomain (shown in the header/overview), so refresh
// the detail + list alongside the domains query.
function invalidateDomains(queryClient: ReturnType<typeof useQueryClient>, id: string): void {
  void queryClient.invalidateQueries({ queryKey: ["deployments", id, "domains"] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.deployment(id) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.deployments });
}

export function useAddDomain(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: AddDomainInput) =>
      unwrap(await api.POST("/deployments/{id}/domains", { params: { path: { id } }, body })),
    onSuccess: () => invalidateDomains(queryClient, id),
  });
}

export function useUpdateDomainTarget(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { domainId: string; body: UpdateDomainTargetInput }) =>
      unwrap(
        await api.PATCH("/deployments/{id}/domains/{domainId}", {
          params: { path: { id, domainId: input.domainId } },
          body: input.body,
        }),
      ),
    onSuccess: () => invalidateDomains(queryClient, id),
  });
}

export function useMakeDomainPrimary(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (domainId: string) =>
      unwrap(
        await api.PATCH("/deployments/{id}/domains/{domainId}/primary", {
          params: { path: { id, domainId } },
        }),
      ),
    onSuccess: () => invalidateDomains(queryClient, id),
  });
}

export function useRemoveDomain(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (domainId: string) =>
      unwrap(
        await api.DELETE("/deployments/{id}/domains/{domainId}", {
          params: { path: { id, domainId } },
        }),
      ),
    onSuccess: () => invalidateDomains(queryClient, id),
  });
}

export function useServiceResources(id: string, service: string) {
  return useQuery({
    queryKey: ["deployments", id, "services", service, "resources"],
    enabled: id.length > 0 && service.length > 0,
    queryFn: async () =>
      unwrap(
        await api.GET("/deployments/{id}/services/{service}/resources", {
          params: { path: { id, service } },
        }),
      ),
  });
}

export function useUpdateServiceResources(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { service: string; body: ResourceLimits }) =>
      unwrap(
        await api.PATCH("/deployments/{id}/services/{service}/resources", {
          params: { path: { id, service: input.service } },
          body: input.body,
        }),
      ),
    onSuccess: (_data, input) =>
      queryClient.invalidateQueries({
        queryKey: ["deployments", id, "services", input.service, "resources"],
      }),
  });
}

export function useResetVolume(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) =>
      unwrap(
        await api.POST("/deployments/{id}/volumes/{name}/reset", {
          params: { path: { id, name } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deployments", id, "containers"] }),
  });
}

export function useReleases(id: string) {
  return useQuery({
    queryKey: queryKeys.releases(id),
    queryFn: async () =>
      unwrap(await api.GET("/deployments/{id}/releases", { params: { path: { id } } })),
    refetchInterval: 5000,
  });
}

export function useCronRuns(id: string) {
  return useQuery({
    queryKey: ["deployments", id, "cron-runs"],
    queryFn: async () =>
      unwrap(await api.GET("/deployments/{id}/cron-runs", { params: { path: { id } } })),
    refetchInterval: 5000,
  });
}

export function useRunCron(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () =>
      unwrap(await api.POST("/deployments/{id}/run", { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deployments", id, "cron-runs"] }),
  });
}

export function useEnvVars(id: string, service = "") {
  return useQuery({
    queryKey: [...queryKeys.env(id), service],
    queryFn: async () =>
      unwrap(
        await api.GET("/deployments/{id}/env", {
          params: { path: { id }, query: { service } },
        }),
      ),
  });
}

export function useCreateDeployment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateDeploymentInput) =>
      unwrap(await api.POST("/deployments", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.deployments }),
  });
}

export function useUpdateDeployment(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: UpdateDeploymentInput) =>
      unwrap(await api.PATCH("/deployments/{id}", { params: { path: { id } }, body })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.deployment(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.deployments });
    },
  });
}

export function useWebhook(id: string) {
  return useQuery({
    queryKey: queryKeys.webhook(id),
    queryFn: async () =>
      unwrap(await api.GET("/deployments/{id}/webhook", { params: { path: { id } } })),
  });
}

export function useRotateWebhook(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () =>
      unwrap(await api.POST("/deployments/{id}/webhook", { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.webhook(id) }),
  });
}

export function useDeploy(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () =>
      unwrap(await api.POST("/deployments/{id}/deploy", { params: { path: { id } } })),
    onSuccess: () => invalidateDeployment(queryClient, id),
  });
}

export function useRollback(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (releaseId: string) =>
      unwrap(
        await api.POST("/deployments/{id}/rollback/{releaseId}", {
          params: { path: { id, releaseId } },
        }),
      ),
    onSuccess: () => invalidateDeployment(queryClient, id),
  });
}

export function useDeleteRelease(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (releaseId: string) =>
      unwrap(
        await api.DELETE("/deployments/{id}/releases/{releaseId}", {
          params: { path: { id, releaseId } },
        }),
      ),
    onSuccess: () => invalidateDeployment(queryClient, id),
  });
}

export function useRestart(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () =>
      unwrap(await api.POST("/deployments/{id}/restart", { params: { path: { id } } })),
    onSuccess: () => invalidateDeployment(queryClient, id),
  });
}

export function useStop(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () =>
      unwrap(await api.POST("/deployments/{id}/stop", { params: { path: { id } } })),
    onSuccess: () => invalidateDeployment(queryClient, id),
  });
}

export function useStart(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () =>
      unwrap(await api.POST("/deployments/{id}/start", { params: { path: { id } } })),
    onSuccess: () => invalidateDeployment(queryClient, id),
  });
}

export function useRemoveDeployment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE("/deployments/{id}", { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.deployments }),
  });
}

export function useSetEnvVar(id: string, service = "") {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { key: string; body: SetEnvVarInput }) =>
      unwrap(
        await api.PUT("/deployments/{id}/env/{key}", {
          params: { path: { id, key: input.key }, query: { service } },
          body: input.body,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...queryKeys.env(id), service] }),
  });
}

export function useDeleteEnvVar(id: string, service = "") {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (key: string) =>
      unwrap(
        await api.DELETE("/deployments/{id}/env/{key}", {
          params: { path: { id, key }, query: { service } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...queryKeys.env(id), service] }),
  });
}

function invalidateDeployment(queryClient: ReturnType<typeof useQueryClient>, id: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.deployment(id) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.releases(id) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.deployments });
}
