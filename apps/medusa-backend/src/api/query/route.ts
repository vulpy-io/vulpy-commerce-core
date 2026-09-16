import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "payload_product.id", "payload_product.title", "payload_product.handle"],
    pagination: { skip: 0, take: 100 },
  });

  res.json({ data });
};
