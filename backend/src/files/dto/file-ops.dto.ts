import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Min } from "class-validator";

export class WriteFileDto {
  @ApiProperty({ type: String, description: "Volume-relative file path" })
  @IsString()
  path!: string;

  @ApiProperty({ type: String, description: "base64-encoded new content" })
  @IsString()
  contentBase64!: string;

  // Default true: a write doubles as "create new file". Set false to require the file to exist (save).
  @ApiPropertyOptional({ type: Boolean, default: true })
  @IsOptional()
  @IsBoolean()
  create?: boolean;
}

export class MkdirDto {
  @ApiProperty({ type: String })
  @IsString()
  path!: string;
}

export class MoveDto {
  @ApiProperty({ type: String, description: "Source path (volume-relative)" })
  @IsString()
  from!: string;

  @ApiProperty({ type: String, description: "Destination path (volume-relative)" })
  @IsString()
  to!: string;
}

export class DeleteDto {
  @ApiProperty({ type: String })
  @IsString()
  path!: string;

  @ApiPropertyOptional({ type: Boolean, description: "Recurse into a non-empty directory" })
  @IsOptional()
  @IsBoolean()
  recursive?: boolean;
}

export class ChmodDto {
  @ApiProperty({ type: String })
  @IsString()
  path!: string;

  @ApiProperty({ type: String, example: "0644", description: "Octal mode (3 or 4 digits)" })
  @Matches(/^[0-7]{3,4}$/, { message: "mode must be octal, e.g. 0644" })
  mode!: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  recursive?: boolean;
}

export class ChownDto {
  @ApiProperty({ type: String })
  @IsString()
  path!: string;

  @ApiProperty({ type: Number })
  @IsInt()
  @Min(0)
  uid!: number;

  @ApiProperty({ type: Number })
  @IsInt()
  @Min(0)
  gid!: number;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  recursive?: boolean;
}
