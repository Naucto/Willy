import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, Max, Min, ValidateNested } from "class-validator";

// The active allocatable host-port sub-range + whether the binding feature is on.
export class PortBindingSettingsDto {
  @ApiProperty({ type: Boolean })
  enabled!: boolean;

  @ApiProperty({ type: Number, description: "Lowest allocatable host port." })
  start!: number;

  @ApiProperty({ type: Number, description: "Highest allocatable host port." })
  end!: number;
}

// The provisioned capacity (WILLY_PORT_BIND_RANGE) Traefik actually publishes entrypoints for.
// Read-only: widening it requires a redeploy. The active sub-range must stay within these bounds.
export class PortBindingCapacityDto {
  @ApiProperty({ type: Number })
  start!: number;

  @ApiProperty({ type: Number })
  end!: number;
}

// Full settings payload returned to the panel — every key present, defaults merged in.
export class AppSettingsDto {
  @ApiProperty({
    type: Boolean,
    description:
      "Show all host containers/images on the Images/Containers pages, not only Willy-managed ones.",
  })
  showAllResources!: boolean;

  @ApiProperty({ type: PortBindingSettingsDto })
  portBinding!: PortBindingSettingsDto;

  @ApiProperty({
    type: PortBindingCapacityDto,
    nullable: true,
    description: "Provisioned host-port capacity; null when WILLY_PORT_BIND_RANGE is unset.",
  })
  portBindingCapacity!: PortBindingCapacityDto | null;
}

// Partial host-port settings — only the provided keys are merged onto the stored value.
export class UpdatePortBindingSettingsDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(1024)
  @Max(65535)
  start?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(1024)
  @Max(65535)
  end?: number;
}

// Partial update — only the provided keys are persisted.
export class UpdateAppSettingsDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  showAllResources?: boolean;

  @ApiPropertyOptional({ type: UpdatePortBindingSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdatePortBindingSettingsDto)
  portBinding?: UpdatePortBindingSettingsDto;
}
