import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
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
}
