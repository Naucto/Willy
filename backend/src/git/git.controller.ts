import { Body, Controller, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { DiscoverBranchesDto, GitBranchesDto } from "./dto/git.dto";
import { GitService } from "./git.service";

@ApiTags("git")
@ApiBearerAuth()
@Controller("git")
export class GitController {
  constructor(private readonly git: GitService) {}

  // Lists a remote's branches without cloning, for the source step's branch picker.
  @Roles("ADMIN", "OPERATOR")
  @ApiBody({ type: DiscoverBranchesDto })
  @ApiOkResponse({ type: GitBranchesDto })
  @Post("branches")
  async branches(@Body() dto: DiscoverBranchesDto): Promise<GitBranchesDto> {
    return {
      branches: await this.git.listBranches(dto.url.trim(), dto.token?.trim() || undefined),
    };
  }
}
