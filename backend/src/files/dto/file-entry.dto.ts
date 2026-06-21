import { ApiProperty } from "@nestjs/swagger";

const ENTRY_TYPES = ["file", "dir", "symlink", "other"] as const;
export type FileEntryType = (typeof ENTRY_TYPES)[number];

export class DirEntryDto {
  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ enum: ENTRY_TYPES })
  type!: FileEntryType;

  @ApiProperty({ type: Number, description: "Size in bytes" })
  size!: number;

  @ApiProperty({ type: String, example: "0644", description: "Octal permission bits" })
  mode!: string;

  @ApiProperty({ type: String, example: "rw-r--r--" })
  modeHuman!: string;

  @ApiProperty({ type: Number })
  uid!: number;

  @ApiProperty({ type: Number })
  gid!: number;

  @ApiProperty({ type: String, format: "date-time" })
  mtime!: string;
}

export class ListDirResponseDto {
  @ApiProperty({ type: String, description: "Volume-relative directory that was listed" })
  path!: string;

  @ApiProperty({ type: [DirEntryDto] })
  entries!: DirEntryDto[];
}
