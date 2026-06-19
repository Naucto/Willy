import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export const OWNER_LABEL = "willy.deploymentId";

// Marks a container as Willy's own infrastructure (control plane + throwaway helpers) so the admin
// panel can hide it from the Images/Containers views by default.
export const INTERNAL_LABEL = "willy.internal";

// A domain's routing target: the compose service it points at (null = the deployment's single
// container) and the internal port (null = fall back to the deployment's default port).
export interface DomainTarget {
  fqdn: string;
  targetService: string | null;
  targetPort: number | null;
}

// A set of FQDNs that share one (service, port) and so become a single Traefik router/service.
export interface RouteGroup {
  // Compose service name; null for a single-container deployment (one container, no service name).
  service: string | null;
  port: number;
  hosts: string[];
}

export interface WebRoutesInput {
  deploymentId: string;
  // Router/service names are derived from this prefix + service + port to stay unique across
  // deployments and across versions during a swap. Single-container callers fold the release id
  // into the prefix; compose uses the deployment name (it recreates in place, no parallel old/new).
  routerPrefix: string;
  network: string;
  // Lower priority loses to a higher one when two routers share a Host rule. During a swap the
  // incoming (newer) container is given a *lower* priority than the one it replaces, so the old
  // version keeps serving until it is removed at cutover.
  priority: number;
  groups: RouteGroup[];
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9-]/g, "-");
}

// A `*.BASE_DOMAIN` wildcard (obtained once on the panel's own router) covers exactly one label
// under the base domain. Hosts it covers don't need their own per-domain ACME issuance.
function coveredByWildcard(host: string, baseDomain: string): boolean {
  if (!baseDomain || host === baseDomain) {
    return host === baseDomain;
  }

  if (!host.endsWith(`.${baseDomain}`)) {
    return false;
  }

  const label = host.slice(0, host.length - baseDomain.length - 1);

  return label.length > 0 && !label.includes(".");
}

// Collapse per-domain targets into route groups keyed by (service, port). For single-container
// deployments pass defaultService: null so every domain lands on the one container, grouped by
// port; for compose pass the default web service so untargeted domains route there.
export function groupRoutes(
  targets: DomainTarget[],
  defaults: { defaultService: string | null; defaultPort: number },
): RouteGroup[] {
  const groups = new Map<string, RouteGroup>();

  for (const target of targets) {
    const service =
      defaults.defaultService === null ? null : (target.targetService ?? defaults.defaultService);
    const port = target.targetPort ?? defaults.defaultPort;
    const key = `${service ?? ""}:${port}`;
    const existing = groups.get(key);

    if (existing) {
      existing.hosts.push(target.fqdn);
    } else {
      groups.set(key, { service, port, hosts: [target.fqdn] });
    }
  }

  return [...groups.values()];
}

// Generates the literal Traefik labels for a WEB container. Each route group becomes its own
// router (Host(`a`) || Host(`b`) over its FQDNs) + service (load-balanced to that port), so a
// single container can serve several domains on different ports. WORKER/CRON containers get only
// the owner label (no routing).
@Injectable()
export class LabelGeneratorService {
  constructor(private readonly config: ConfigService) {}

  forWebRoutes(input: WebRoutesInput): Record<string, string> {
    const baseDomain = this.config.get<string>("BASE_DOMAIN") ?? "";
    const labels: Record<string, string> = {
      "traefik.enable": "true",
      "traefik.docker.network": input.network,
      [OWNER_LABEL]: input.deploymentId,
    };

    for (const group of input.groups) {
      const router = sanitize(`${input.routerPrefix}-${group.service ?? "app"}-${group.port}`);
      const rule = group.hosts.map((host) => `Host(\`${host}\`)`).join(" || ");

      labels[`traefik.http.routers.${router}.rule`] = rule;
      labels[`traefik.http.routers.${router}.entrypoints`] = "websecure";
      labels[`traefik.http.routers.${router}.tls`] = "true";

      // Base-domain subdomains are served by the panel's `*.BASE_DOMAIN` wildcard, so they need no
      // resolver. Anything outside the base domain (a custom external domain) gets its own cert.
      if (!group.hosts.every((host) => coveredByWildcard(host, baseDomain))) {
        labels[`traefik.http.routers.${router}.tls.certresolver`] = "ovh";
      }

      labels[`traefik.http.routers.${router}.middlewares`] = "sec-headers@file";
      labels[`traefik.http.routers.${router}.priority`] = String(input.priority);
      labels[`traefik.http.services.${router}.loadbalancer.server.port`] = String(group.port);
    }

    return labels;
  }

  forNonWeb(deploymentId: string): Record<string, string> {
    return { [OWNER_LABEL]: deploymentId };
  }
}
