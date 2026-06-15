import { ApiProperty } from "@nestjs/swagger";

// The host's real capacity, used to size the resource-limit sliders. Zero means "unknown"
// (the Docker daemon was unreachable) — the client then falls back to default ceilings.
export class HostResourcesDto {
  @ApiProperty({ type: Number, description: "Logical CPU count reported by the Docker daemon." })
  cpus!: number;

  @ApiProperty({ type: Number, description: "Total host memory in MB." })
  memoryMb!: number;
}
