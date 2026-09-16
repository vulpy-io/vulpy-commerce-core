import { defineLink } from "@medusajs/framework/utils";
import ProductModule from "@medusajs/medusa/product";
import { PAYLOAD_SYNC_MODULE } from "../modules/payloadSync";

export default defineLink(
  {
    linkable: ProductModule.linkable.product.id,
    field: "id",
  },
  {
    linkable: {
      serviceName: PAYLOAD_SYNC_MODULE,
      alias: "payload_product",
      primaryKey: "id",
    },
  },
  {
    readOnly: true,
  }
);
