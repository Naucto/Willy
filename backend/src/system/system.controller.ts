import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { DockerImagesDto } from "./dto/docker-images.dto";
import { HostResourcesDto } from "./dto/host-resources.dto";
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

  // Host CPU/memory capacity (kept behind auth — not login-screen info). Sizes the sliders.
  @ApiBearerAuth()
  @ApiOkResponse({ type: HostResourcesDto })
  @Get("resources")
  resources(): Promise<HostResourcesDto> {
    return this.system.getResources();
  }

  // Local image tags, for the IMAGE-source "browse images" picker.
  @ApiBearerAuth()
  @ApiOkResponse({ type: DockerImagesDto })
  @Get("images")
  async images(): Promise<DockerImagesDto> {
    return { images: await this.system.getDockerImages() };
  }

  @ApiOkResponse({ type: PublicIpDto })
  @Get("public-ip")
  publicIp(): Promise<PublicIpDto> {
    return this.system.getPublicIp();
  }
}
