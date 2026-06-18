import { describe, expect, it } from "vitest";
import { isManagedContainer, isManagedImage } from "./admin.service";

const ref = { id: "d1", name: "blog" };

describe("isManagedContainer", () => {
  it("flags a container mapped to a deployment", () => {
    expect(isManagedContainer(undefined, ref)).toBe(true);
  });

  it("flags a container carrying the deploymentId owner label", () => {
    expect(isManagedContainer({ "willy.deploymentId": "d1" }, null)).toBe(true);
  });

  it("treats unmapped, unlabeled containers as unmanaged", () => {
    expect(isManagedContainer({ "com.docker.compose.project": "willy" }, null)).toBe(false);
    expect(isManagedContainer(undefined, null)).toBe(false);
  });
});

describe("isManagedImage", () => {
  const managedTags = new Set(["nginx:1.27"]);

  it("flags Willy-built single-container images", () => {
    expect(isManagedImage(["willy/blog:abc123"], managedTags)).toBe(true);
  });

  it("flags Willy-built compose images (project prefix)", () => {
    expect(isManagedImage(["willy_blog-web:latest"], managedTags)).toBe(true);
  });

  it("flags external images a deployment runs (IMAGE strategy)", () => {
    expect(isManagedImage(["nginx:1.27"], managedTags)).toBe(true);
  });

  it("does not flag the control plane or foreign images", () => {
    expect(isManagedImage(["willy-server"], managedTags)).toBe(false);
    expect(isManagedImage(["postgres:17-alpine"], managedTags)).toBe(false);
  });
});
