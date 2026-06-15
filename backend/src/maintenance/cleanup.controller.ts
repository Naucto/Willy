import { Controller, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { CleanupService } from "./cleanup.service";
import { CleanupResultDto } from "./dto/cleanup-result.dto";

@ApiTags("maintenance")
@ApiBearerAuth()
@Controller("maintenance")
export class CleanupController {
  constructor(private readonly cleanup: CleanupService) {}

  // Trigger scoped disk cleanup now (keep-N per deployment + dangling prune).
  @Roles("ADMIN")
  @ApiOkResponse({ type: CleanupResultDto })
  @Post("cleanup")
  run(): Promise<CleanupResultDto> {
    return this.cleanup.run();
  }
}
