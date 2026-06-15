import { ApiProperty } from "@nestjs/swagger";

// Tagged images present on the host, for the IMAGE-source "browse images" picker.
export class DockerImagesDto {
  @ApiProperty({ type: [String] })
  images!: string[];
}
