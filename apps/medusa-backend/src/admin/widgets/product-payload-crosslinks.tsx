import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { HttpTypes } from "@medusajs/types";
import { Button, Container, Text } from "@medusajs/ui";
import { useQuery } from "@tanstack/react-query";
import { tAdmin } from "../lib/labels";

const payloadUrl = (import.meta.env.VITE_PAYLOAD_URL || "http://localhost:3000").replace(
  /\/$/,
  ""
);
const storefrontUrl = (
  import.meta.env.VITE_STOREFRONT_URL || "http://localhost:3000"
).replace(/\/$/, "");

interface PayloadDoc {
    id?: string | number 
}

async function findPayloadDoc(collection: string, handle: string) {
  const query = new URLSearchParams({
    "where[handle][equals]": handle,
    limit: "1",
  });
  const response = await fetch(`${payloadUrl}/api/${collection}?${query.toString()}`);
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as { docs?: PayloadDoc[] };
  return data.docs?.[0] ?? null;
}

const ProductPayloadCrosslinksWidget = ({
  data: product,
}: {
  data: HttpTypes.AdminProduct;
}) => {
  const handle = product.handle || "";

  const { data: payloadDoc, isLoading } = useQuery({
    queryKey: ["payload-product-content", handle],
    enabled: Boolean(handle),
    queryFn: () => findPayloadDoc("productContent", handle),
  });

  const storefrontHref = handle ? `${storefrontUrl}/products/${handle}` : "";
  const payloadHref = payloadDoc?.id
    ? `${payloadUrl}/admin/collections/productContent/${payloadDoc.id}`
    : `${payloadUrl}/admin/collections/productContent`;

  return (
    <Container className="p-0">
      <div className="px-6 py-4">
        <Text leading="compact" size="small" weight="plus">
          {tAdmin("payloadCrosslinks.title")}
        </Text>
        <Text className="text-ui-fg-subtle" size="small">
          {tAdmin("payloadCrosslinks.productDescription")}
        </Text>
      </div>
      <div className="flex flex-wrap gap-2 px-6 pb-4">
        <Button asChild disabled={!storefrontHref} size="small" variant="secondary">
          <a href={storefrontHref} rel="noreferrer" target="_blank">
            {tAdmin("payloadCrosslinks.viewOnStorefront")}
          </a>
        </Button>
        <Button asChild disabled={!handle || isLoading} size="small" variant="secondary">
          <a href={payloadHref} rel="noreferrer" target="_blank">
            {tAdmin("payloadCrosslinks.editInPayload")}
          </a>
        </Button>
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "product.details.side.before",
});

export default ProductPayloadCrosslinksWidget;
