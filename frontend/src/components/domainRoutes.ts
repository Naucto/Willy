import type { Container, DeploymentDomain } from "../api/types";

export interface ServiceOption {
  value: string;
  label: string;
}

// One row of the route grid: a domain's 443 web route, or one of its hard-bound host ports. Both
// kinds can coexist on a single domain, so the grid flattens domains + their bindings into rows.
export interface RouteRow {
  id: string;
  domain: DeploymentDomain;
  kind: "web" | "port";
  fqdn: string;
  isPrimary: boolean;
  targetService: string | null;
  targetPort: number | null;
  hostPort: number | null;
  bindingId: string | null;
}

export function toRows(domains: DeploymentDomain[]): RouteRow[] {
  return domains.flatMap((domain) => {
    const rows: RouteRow[] = [];

    if (domain.webRoute) {
      rows.push({
        id: `${domain.id}:web`,
        domain,
        kind: "web",
        fqdn: domain.fqdn,
        isPrimary: domain.isPrimary,
        targetService: domain.targetService,
        targetPort: domain.targetPort,
        hostPort: null,
        bindingId: null,
      });
    }

    for (const binding of domain.bindings) {
      rows.push({
        id: binding.id,
        domain,
        kind: "port",
        fqdn: domain.fqdn,
        isPrimary: false,
        targetService: binding.targetService,
        targetPort: binding.targetPort,
        hostPort: binding.hostPort,
        bindingId: binding.id,
      });
    }

    return rows;
  });
}

// Resolves the container backing a target service so the port picker can offer that image's exposed
// ports. For compose, an empty service means the configured web service.
export function exposedPortsFor(
  containers: Container[],
  isCompose: boolean,
  service: string,
  defaultService: string,
): number[] {
  if (!isCompose) {
    return containers[0]?.exposedPorts ?? [];
  }

  const wanted = service || defaultService;
  const match = containers.find((container) => container.service === wanted);

  return match?.exposedPorts ?? [];
}

// Service options come from the running containers (plus whatever domains already reference and the
// configured default), so the service is always picked from a list rather than typed.
export function serviceOptionsFor(
  defaultService: string,
  containers: Container[],
  domains: DeploymentDomain[],
): ServiceOption[] {
  const serviceNames = Array.from(
    new Set(
      [
        defaultService,
        ...containers.map((c) => c.service ?? ""),
        ...domains.map((d) => d.targetService ?? ""),
      ].filter(Boolean),
    ),
  );

  return [
    { value: "", label: defaultService ? `default (${defaultService})` : "default" },
    ...serviceNames.map((name) => ({ value: name, label: name })),
  ];
}

// A hard-bound host port must fall inside the provisioned, allocatable range (else Traefik has no
// entrypoint published for it).
export function hostPortInRange(
  value: number,
  range: { start: number; end: number } | null,
): boolean {
  return !!range && Number.isInteger(value) && value >= range.start && value <= range.end;
}
