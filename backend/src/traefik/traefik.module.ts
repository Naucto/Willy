import { Module } from "@nestjs/common";
import { LabelGeneratorService } from "./label-generator.service";

@Module({
  providers: [LabelGeneratorService],
  exports: [LabelGeneratorService],
})
export class TraefikModule {}
