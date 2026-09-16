import { Module } from "@medusajs/framework/utils";
import PayloadSyncModuleService from "./service";

export const PAYLOAD_SYNC_MODULE = "payloadSync";

export default Module(PAYLOAD_SYNC_MODULE, {
  service: PayloadSyncModuleService,
});

export * from "./suppress";
