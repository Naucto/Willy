import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { PublicIpDto } from "./dto/public-ip.dto";
import { SystemInfoDto } from "./dto/system-info.dto";
import { SystemService } from "./system.service";

@ApiTags("system")
@Controller("system")
export class SystemController {
  constructor(private readonly system: SystemService) {}

  // Public so the login screen can show it before authentication.
  @Public()
  @ApiOkResponse({ type: SystemInfoDto })
  @Get("info")
  info(): SystemInfoDto {
    return this.system.getInfo();
  }

  @ApiOkResponse({ type: PublicIpDto })
  @Get("public-ip")
  publicIp(): Promise<PublicIpDto> {
    return this.system.getPublicIp();
  }
}
