import { ApiProperty } from "@nestjs/swagger";
import { Matches } from "class-validator";

// Same constraint as creation — the name is woven into Docker resource identifiers.
export class RenameDeploymentDto {
  @ApiProperty({ type: String, pattern: "^[a-z0-9][a-z0-9-]{0,40}$", example: "my-app" })
  @Matches(/^[a-z0-9][a-z0-9-]{0,40}$/, {
    message: "name must be lowercase alphanumeric/hyphen, 1-41 chars",
  })
  name!: string;
}
