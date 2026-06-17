import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { AdminService } from "./admin.service";
import { AdminContainerDto } from "./dto/admin-container.dto";
import { AdminImageDto } from "./dto/admin-image.dto";
import { PruneResultDto } from "./dto/prune-result.dto";

@ApiTags("admin")
@ApiBearerAuth()
@Roles("ADMIN")
@Controller("admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @ApiOkResponse({ type: [AdminImageDto] })
  @Get("images")
  getImages(): Promise<AdminImageDto[]> {
    return this.admin.getImages();
  }

  @ApiParam({ name: "id", type: String, description: "Image ID or tag." })
  @ApiNoContentResponse({ description: "Image removed." })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete("images/:id")
  deleteImage(@Param("id") id: string): Promise<void> {
    return this.admin.deleteImage(id);
  }

  @ApiOkResponse({ type: PruneResultDto })
  @Post("images/prune")
  pruneImages(): Promise<PruneResultDto> {
    return this.admin.pruneImages();
  }

  @ApiOkResponse({ type: [AdminContainerDto] })
  @Get("containers")
  getContainers(): Promise<AdminContainerDto[]> {
    return this.admin.getContainers();
  }

  @ApiOkResponse({ type: PruneResultDto })
  @Post("containers/prune")
  pruneContainers(): Promise<PruneResultDto> {
    return this.admin.pruneContainers();
  }
}
