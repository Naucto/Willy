import { ApiProperty } from "@nestjs/swagger";

export class VolumeIdentityDto {
  @ApiProperty({ type: Number })
  id!: number;

  @ApiProperty({ type: String })
  name!: string;
}

// Users/groups parsed from the volume's /etc/passwd and /etc/group (empty when those files aren't
// present in the volume), to label the chmod/chown UID & GID pickers.
export class VolumeIdentitiesDto {
  @ApiProperty({ type: [VolumeIdentityDto] })
  users!: VolumeIdentityDto[];

  @ApiProperty({ type: [VolumeIdentityDto] })
  groups!: VolumeIdentityDto[];
}
