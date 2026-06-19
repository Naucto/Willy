import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
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

  // Clears every finished task. Running tasks are left untouched.
  @HttpCode(204)
  @Delete()
  async clearAll(): Promise<void> {
    await this.tasks.clearFinished();
  }

  // Clears a single finished task (409 if it's still running).
  @ApiParam({ name: "id", type: String })
  @HttpCode(204)
  @Delete(":id")
  async clear(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.tasks.clear(id);
  }
}
