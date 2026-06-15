import { Injectable } from "@nestjs/common";

export const OWNER_LABEL = "willy.deploymentId";

export interface WebLabelInput {
  deploymentId: string;
  routerName: string;
  host: string;
  port: number;
  network: string;
  // Lower priority loses to a higher one when two routers share a Host rule. During a
  // swap the incoming (newer) container is given a *lower* priority than the one it
  // replaces, so the old version keeps serving until it is removed at cutover.
  priority: number;
}

// Generates the literal Traefik labels for a WEB deployment's container. Router/service
// names are namespaced per deployment + git SHA to avoid Traefik route shadowing across
// versions. WORKER/CRON containers get only the owner label (no routing).
@Injectable()
export class LabelGeneratorService {
  forWeb(input: WebLabelInput): Record<string, string> {
    const router = input.routerName;

    return {
      "traefik.enable": "true",
      "traefik.docker.network": input.network,
      [`traefik.http.routers.${router}.rule`]: `Host(\`${input.host}\`)`,
      [`traefik.http.routers.${router}.entrypoints`]: "websecure",
      [`traefik.http.routers.${router}.tls`]: "true",
      [`traefik.http.routers.${router}.tls.certresolver`]: "ovh",
      [`traefik.http.routers.${router}.middlewares`]: "sec-headers@file",
      [`traefik.http.routers.${router}.priority`]: String(input.priority),
      [`traefik.http.services.${router}.loadbalancer.server.port`]: String(input.port),
      [OWNER_LABEL]: input.deploymentId,
    };
  }

  forNonWeb(deploymentId: string): Record<string, string> {
    return { [OWNER_LABEL]: deploymentId };
  }
}
