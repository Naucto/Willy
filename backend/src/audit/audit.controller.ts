import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { AuditService } from "./audit.service";
import { AuditLogDto, toAuditLogDto } from "./dto/audit.dto";

@ApiTags("audit")
@ApiBearerAuth()
@Roles("ADMIN")
@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @ApiOkResponse({ type: [AuditLogDto] })
  @Get()
  async list(): Promise<AuditLogDto[]> {
    return (await this.audit.list()).map(toAuditLogDto);
  }
}
