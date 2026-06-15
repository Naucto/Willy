import { Controller, HttpCode, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/jwt-payload.interface";
import { ConsoleService } from "./console.service";
import { StreamTicketDto } from "./dto/ticket.dto";

@ApiTags("console")
@ApiBearerAuth()
@Controller("streams")
export class ConsoleController {
  constructor(private readonly console: ConsoleService) {}

  // Short-lived ticket the browser presents on the console WebSocket upgrade.
  @Roles("ADMIN", "OPERATOR")
  @HttpCode(200)
  @ApiOkResponse({ type: StreamTicketDto })
  @Post("ticket")
  ticket(@CurrentUser() user: AuthUser): StreamTicketDto {
    return { ticket: this.console.issueTicket(user.userId) };
  }
}
