import { Global, Module } from "@nestjs/common";
import { OvhClient } from "./ovh-client";

@Global()
@Module({
  providers: [OvhClient],
  exports: [OvhClient],
})
export class OvhModule {}
