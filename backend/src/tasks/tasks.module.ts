import { Global, Module } from "@nestjs/common";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";

// Activity tracker for long-running administrative operations. Global so feature modules (backups,
// admin, build) can record task lifecycle as their async work progresses without re-importing.
@Global()
@Module({
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
