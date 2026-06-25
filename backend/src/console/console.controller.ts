import { Controller, HttpCode, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
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

  // Short-lived ticket the browser presents on the console WebSocket upgrade. Bound to the target
  // deployment so a ticket can't be replayed against another deployment's console.
  @Roles("ADMIN", "OPERATOR")
  @HttpCode(200)
  @ApiParam({ name: "deploymentId", type: String })
  @ApiOkResponse({ type: StreamTicketDto })
  @Post("ticket/:deploymentId")
  ticket(
    @CurrentUser() user: AuthUser,
    @Param("deploymentId") deploymentId: string,
  ): StreamTicketDto {
    return { ticket: this.console.issueTicket(user.userId, deploymentId) };
  }
}
