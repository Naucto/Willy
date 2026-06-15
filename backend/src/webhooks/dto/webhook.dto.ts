import { ApiProperty } from "@nestjs/swagger";

export class WebhookStatusDto {
  @ApiProperty({ type: Boolean })
  configured!: boolean;

  // Path the provider should POST to (UI prefixes it with the panel origin).
  @ApiProperty({ type: String })
  path!: string;
}

export class WebhookSecretDto {
  @ApiProperty({ type: String })
  secret!: string;

  @ApiProperty({ type: String })
  path!: string;
}
