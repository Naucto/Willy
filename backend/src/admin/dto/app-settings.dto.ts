import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional } from "class-validator";

// Full settings payload returned to the panel — every key present, defaults merged in.
export class AppSettingsDto {
  @ApiProperty({
    type: Boolean,
    description:
      "Show all host containers/images on the Images/Containers pages, not only Willy-managed ones.",
  })
  showAllResources!: boolean;
}

// Partial update — only the provided keys are persisted.
export class UpdateAppSettingsDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  showAllResources?: boolean;
}
