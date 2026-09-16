import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import {
  type JSXConvertersFunction,
  RichText as RichTextConverter,
} from "@payloadcms/richtext-lexical/react";

const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,
});

export function RichText({
  data,
  className,
}: {
  data: unknown;
  className?: string;
}) {
  if (!data) {
    return null;
  }

  return (
    <div
      className={
        className
          ? `cms-prose mx-auto max-w-[800px] ${className}`
          : "cms-prose mx-auto max-w-[800px]"
      }
    >
      <RichTextConverter
        converters={converters}
        data={data as SerializedEditorState}
      />
    </div>
  );
}
