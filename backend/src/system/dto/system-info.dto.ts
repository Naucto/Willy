import { ApiProperty } from "@nestjs/swagger";

// Public host/build info surfaced on the login screen.
export class SystemInfoDto {
  @ApiProperty({ type: String })
  version!: string;

  @ApiProperty({ type: String })
  commit!: string;

  // Host kernel release (containers share the host kernel, so this is the VPS kernel).
  @ApiProperty({ type: String })
  kernel!: string;

  @ApiProperty({ type: String })
  platform!: string;

  @ApiProperty({ type: String })
  arch!: string;

  @ApiProperty({ type: String })
  node!: string;

  // The panel's base domain (e.g. willy.localhost in dev). Lets the UI suggest domains that the
  // active cert actually covers instead of a hardcoded placeholder.
  @ApiProperty({ type: String })
  baseDomain!: string;
}
