import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from "@nestjs/swagger";
import { TaskDto, toTaskDto } from "./dto/task.dto";
import { TasksService } from "./tasks.service";

@ApiTags("tasks")
@ApiBearerAuth()
@Controller("tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @ApiQuery({ name: "scope", required: false, enum: ["active", "recent"] })
  @ApiOkResponse({ type: [TaskDto] })
  @Get()
  async list(@Query("scope") scope?: "active" | "recent"): Promise<TaskDto[]> {
    return (await this.tasks.list(scope === "active" ? "active" : "recent")).map(toTaskDto);
  }
}
