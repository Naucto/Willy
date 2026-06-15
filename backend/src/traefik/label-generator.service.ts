import { Injectable } from "@nestjs/common";

export const OWNER_LABEL = "willy.deploymentId";

export interface WebLabelInput {
  deploymentId: string;
  routerName: string;
  host: string;
  port: number;
  network: string;
}

// Generates the literal Traefik labels for a WEB deployment's container. Router/service
// names are namespaced per deployment to avoid Traefik route shadowing. WORKER/CRON
// containers get only the owner label (no routing).
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
      [`traefik.http.services.${router}.loadbalancer.server.port`]: String(input.port),
      [OWNER_LABEL]: input.deploymentId,
    };
  }

  forNonWeb(deploymentId: string): Record<string, string> {
    return { [OWNER_LABEL]: deploymentId };
  }
}
