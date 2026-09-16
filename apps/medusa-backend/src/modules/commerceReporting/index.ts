import { Module } from "@medusajs/framework/utils";
import CommerceReportingModuleService from "./service";

export const COMMERCE_REPORTING_MODULE = "commerceReporting";

export default Module(COMMERCE_REPORTING_MODULE, {
  service: CommerceReportingModuleService,
});
