import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

// Branch discovery is a POST (not a GET with query params) so the optional private-repo token
// stays out of URLs and logs.
export class DiscoverBranchesDto {
  @ApiProperty({ type: String, example: "https://github.com/owner/repo.git" })
  @IsString()
  url!: string;

  @ApiPropertyOptional({ type: String, description: "Token for a private repo (not stored)." })
  @IsOptional()
  @IsString()
  token?: string;
}

export class GitBranchesDto {
  @ApiProperty({ type: [String] })
  branches!: string[];
}
