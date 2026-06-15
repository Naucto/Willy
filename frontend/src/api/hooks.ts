import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./client";
import type { CreateDeploymentInput, SetEnvVarInput } from "./types";

export const queryKeys = {
  deployments: ["deployments"] as const,
  deployment: (id: string) => ["deployments", id] as const,
  releases: (id: string) => ["deployments", id, "releases"] as const,
  release: (id: string) => ["releases", id] as const,
  env: (id: string) => ["deployments", id, "env"] as const,
};

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
    refetchInterval: 5000,
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

export function useEnvVars(id: string) {
  return useQuery({
    queryKey: queryKeys.env(id),
    queryFn: async () =>
      unwrap(await api.GET("/deployments/{id}/env", { params: { path: { id } } })),
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

export function useDeploy(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () =>
      unwrap(await api.POST("/deployments/{id}/deploy", { params: { path: { id } } })),
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

export function useSetEnvVar(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { key: string; body: SetEnvVarInput }) =>
      unwrap(
        await api.PUT("/deployments/{id}/env/{key}", {
          params: { path: { id, key: input.key } },
          body: input.body,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.env(id) }),
  });
}

export function useDeleteEnvVar(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (key: string) =>
      unwrap(await api.DELETE("/deployments/{id}/env/{key}", { params: { path: { id, key } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.env(id) }),
  });
}

function invalidateDeployment(queryClient: ReturnType<typeof useQueryClient>, id: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.deployment(id) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.releases(id) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.deployments });
}
