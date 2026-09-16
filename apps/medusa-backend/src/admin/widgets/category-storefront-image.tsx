import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { HttpTypes } from "@medusajs/types";
import { Button, Container, Input, Label, Text, toast } from "@medusajs/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { tAdmin, tAdminFormat } from "../lib/labels";
import { sdk } from "../lib/sdk";

const METADATA_IMAGE_URL = "image_url";
const METADATA_NAV_ALL_LABEL = "nav_all_label";
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];

function parseImageUrl(metadata?: Record<string, unknown> | null): string {
  const raw = metadata?.[METADATA_IMAGE_URL];
  return typeof raw === "string" ? raw : "";
}

function parseNavAllLabel(metadata?: Record<string, unknown> | null): string {
  const raw = metadata?.[METADATA_NAV_ALL_LABEL];
  return typeof raw === "string" ? raw : "";
}

function buildMetadata(
  existing: Record<string, unknown> | null | undefined,
  imageUrl: string,
  navAllLabel: string
): Record<string, unknown> {
  const metadata = { ...(existing ?? {}) };
  metadata[METADATA_IMAGE_URL] = imageUrl.trim();

  const trimmedLabel = navAllLabel.trim();
  if (trimmedLabel) {
    metadata[METADATA_NAV_ALL_LABEL] = trimmedLabel;
  } else {
    delete metadata[METADATA_NAV_ALL_LABEL];
  }

  return metadata;
}

const CategoryStorefrontImageWidget = ({
  data: category,
}: {
  data: HttpTypes.AdminProductCategory;
}) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isTopLevel = !category.parent_category_id;
  const savedImageUrl = parseImageUrl(category.metadata);
  const savedNavAllLabel = parseNavAllLabel(category.metadata);
  const [imageUrl, setImageUrl] = useState(savedImageUrl);
  const [navAllLabel, setNavAllLabel] = useState(savedNavAllLabel);
  const isDirty = imageUrl !== savedImageUrl || navAllLabel !== savedNavAllLabel;

  useEffect(() => {
    setImageUrl(parseImageUrl(category.metadata));
    setNavAllLabel(parseNavAllLabel(category.metadata));
  }, [category.metadata]);

  const { mutateAsync: saveImage, isPending: isSaving } = useMutation({
    mutationFn: async (payload: { imageUrl: string; navAllLabel: string }) =>
      sdk.admin.productCategory.update(category.id, {
        metadata: buildMetadata(category.metadata, payload.imageUrl, payload.navAllLabel),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product_categories"] });
      toast.success(tAdmin("categoryStorefrontImage.saved"));
    },
    onError: (error: Error) => {
      toast.error(error.message || tAdmin("categoryStorefrontImage.saveFailed"));
    },
  });

  const { mutateAsync: uploadImage, isPending: isUploading } = useMutation({
    mutationFn: async (file: File) => {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        throw new Error(tAdmin("categoryStorefrontImage.invalidFileType"));
      }

      const { files } = await sdk.admin.upload.create({ files: [file] });
      const uploadedUrl = files[0]?.url;

      if (!uploadedUrl) {
        throw new Error(tAdmin("categoryStorefrontImage.missingUploadUrl"));
      }

      return uploadedUrl;
    },
    onSuccess: (uploadedUrl) => {
      setImageUrl(uploadedUrl);
    },
    onError: (error: Error) => {
      toast.error(error.message || tAdmin("categoryStorefrontImage.uploadFailed"));
    },
  });

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    await uploadImage(file);
  };

  const handleSave = async () => {
    await saveImage({ imageUrl, navAllLabel });
  };

  const isPending = isUploading || isSaving;

  return (
    <Container className="p-0">
      <div className="px-6 py-4">
        <Text leading="compact" size="small" weight="plus">
          {tAdmin("categoryStorefrontImage.title")}
        </Text>
        <Text className="text-ui-fg-subtle" size="small">
          {tAdmin("categoryStorefrontImage.description")}
        </Text>
      </div>

      <div className="flex flex-col gap-y-4 px-6 pb-4">
        <div className="flex flex-col gap-y-2">
          <Label htmlFor={`category-image-upload-${category.id}`}>
            {tAdmin("common.image")}
          </Label>
          <input
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="hidden"
            id={`category-image-upload-${category.id}`}
            onChange={handleFileChange}
            ref={fileInputRef}
            type="file"
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={isPending}
              isLoading={isUploading}
              onClick={() => fileInputRef.current?.click()}
              size="small"
              type="button"
              variant="secondary"
            >
              {imageUrl
                ? tAdmin("categoryStorefrontImage.replaceImage")
                : tAdmin("categoryStorefrontImage.uploadImage")}
            </Button>

            {imageUrl ? (
              <Button
                disabled={isPending}
                onClick={() => setImageUrl("")}
                size="small"
                type="button"
                variant="transparent"
              >
                {tAdmin("common.remove")}
              </Button>
            ) : null}
          </div>
        </div>

        {isTopLevel ? (
          <div className="flex flex-col gap-y-2">
            <Label htmlFor={`category-nav-all-label-${category.id}`}>
              {tAdmin("categoryStorefrontImage.navAllLabel")}
            </Label>
            <Input
              id={`category-nav-all-label-${category.id}`}
              onChange={(event) => setNavAllLabel(event.target.value)}
              placeholder={tAdminFormat("categoryStorefrontImage.navAllPlaceholder", {
                name: category.name ?? "",
              }).trim()}
              value={navAllLabel}
            />
            <Text className="text-ui-fg-subtle" size="small">
              {tAdmin("categoryStorefrontImage.navAllHint")}
            </Text>
          </div>
        ) : null}

        <div className="flex flex-col items-start gap-y-4">
          {imageUrl ? (
            <img
              alt={category.name || tAdmin("categoryStorefrontImage.previewAlt")}
              className="h-24 w-24 rounded-full border border-ui-border-base object-cover"
              height={96}
              src={imageUrl}
              width={96}
            />
          ) : (
            <div
              aria-hidden="true"
              className="h-24 w-24 rounded-full border border-ui-border-base border-dashed bg-ui-bg-subtle"
            />
          )}

          <Button
            disabled={!isDirty || isPending}
            isLoading={isSaving}
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
  zone: "product_category.details.after",
});

export default CategoryStorefrontImageWidget;
