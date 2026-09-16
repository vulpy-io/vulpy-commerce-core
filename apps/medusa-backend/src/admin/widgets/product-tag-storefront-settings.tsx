import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { HttpTypes } from "@medusajs/types";
import { Button, Checkbox, Container, Label, Text, toast } from "@medusajs/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { tAdmin } from "../lib/labels";
import { sdk } from "../lib/sdk";

const METADATA_SHOW_IN_STORE = "show_in_store";
const METADATA_COLOR = "color";
const DEFAULT_TAG_COLOR = "#3B82F6";
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

interface StorefrontSettings {
  showInStore: boolean;
  color: string;
}

function parseStorefrontSettings(
  metadata?: Record<string, unknown> | null
): StorefrontSettings {
  const showInStore = metadata?.[METADATA_SHOW_IN_STORE] === true;
  const rawColor = metadata?.[METADATA_COLOR];
  const color =
    typeof rawColor === "string" && HEX_COLOR_PATTERN.test(rawColor)
      ? rawColor
      : DEFAULT_TAG_COLOR;

  return { showInStore, color };
}

function buildMetadata(
  existing: Record<string, unknown> | null | undefined,
  settings: StorefrontSettings
): Record<string, unknown> {
  const metadata = { ...(existing ?? {}) };

  if (settings.showInStore) {
    metadata[METADATA_SHOW_IN_STORE] = true;
    metadata[METADATA_COLOR] = settings.color;
  } else {
    metadata[METADATA_SHOW_IN_STORE] = "";
    metadata[METADATA_COLOR] = "";
  }

  return metadata;
}

const ProductTagStorefrontSettingsWidget = ({
  data: productTag,
}: {
  data: HttpTypes.AdminProductTag;
}) => {
  const queryClient = useQueryClient();
  const initial = parseStorefrontSettings(productTag.metadata);
  const [showInStore, setShowInStore] = useState(initial.showInStore);
  const [color, setColor] = useState(initial.color);

  useEffect(() => {
    const next = parseStorefrontSettings(productTag.metadata);
    setShowInStore(next.showInStore);
    setColor(next.color);
  }, [productTag.metadata]);

  const { mutateAsync, isPending } = useMutation({
    mutationFn: async () =>
      sdk.admin.productTag.update(productTag.id, {
        metadata: buildMetadata(productTag.metadata, { showInStore, color }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast.success(tAdmin("productTagStorefront.saved"));
    },
    onError: (error: Error) => {
      toast.error(error.message || tAdmin("productTagStorefront.saveFailed"));
    },
  });

  const handleSave = async () => {
    await mutateAsync();
  };

  return (
    <Container className="p-0">
      <div className="px-6 py-4">
        <Text leading="compact" size="small" weight="plus">
          {tAdmin("productTagStorefront.title")}
        </Text>
        <Text className="text-ui-fg-subtle" size="small">
          {tAdmin("productTagStorefront.description")}
        </Text>
      </div>

      <div className="flex flex-col gap-y-4 px-6 pb-4">
        <div className="flex items-center gap-x-2">
          <Checkbox
            checked={showInStore}
            id={`show-in-store-${productTag.id}`}
            onCheckedChange={(checked) => setShowInStore(checked === true)}
          />
          <Label htmlFor={`show-in-store-${productTag.id}`}>
            {tAdmin("productTagStorefront.showInStore")}
          </Label>
        </div>

        {showInStore ? (
          <div className="flex flex-col gap-y-2">
            <Label htmlFor={`tag-color-${productTag.id}`}>
              {tAdmin("productTagStorefront.badgeColor")}
            </Label>
            <div className="flex items-center gap-x-3">
              <input
                aria-label={tAdmin("productTagStorefront.badgeColorAria")}
                className="h-10 w-14 cursor-pointer rounded-md border border-ui-border-base bg-ui-bg-base"
                id={`tag-color-${productTag.id}`}
                onChange={(event) => setColor(event.target.value)}
                type="color"
                value={color}
              />
              <Text className="font-mono text-ui-fg-subtle" size="small">
                {color}
              </Text>
              <span
                className="inline-flex rounded px-2.5 py-0.5 font-semibold text-white text-xs"
                style={{ backgroundColor: color }}
              >
                {productTag.value}
              </span>
            </div>
          </div>
        ) : null}

        <div className="flex justify-start pt-2">
          <Button
            disabled={isPending}
            isLoading={isPending}
            onClick={handleSave}
            size="small"
            type="button"
          >
            {tAdmin("common.save")}
          </Button>
        </div>
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "product_tag.details.after",
});

export default ProductTagStorefrontSettingsWidget;
