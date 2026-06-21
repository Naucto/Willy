import { ApiProperty } from "@nestjs/swagger";

export class ReadFileResponseDto {
  @ApiProperty({ type: String, description: "Volume-relative file path" })
  path!: string;

  @ApiProperty({ type: Number, description: "Size in bytes" })
  size!: number;

  @ApiProperty({ type: Boolean, description: "True when the content looks binary (download-only)" })
  isBinary!: boolean;

  @ApiProperty({ type: String, description: "base64-encoded file bytes" })
  contentBase64!: string;

  @ApiProperty({ type: String, example: "0644" })
  mode!: string;

  @ApiProperty({ type: Number })
  uid!: number;

  @ApiProperty({ type: Number })
  gid!: number;

  @ApiProperty({ type: String, format: "date-time" })
  mtime!: string;
}
