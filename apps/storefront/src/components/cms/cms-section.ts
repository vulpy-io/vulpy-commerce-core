export type CmsSectionMarkerProps = {
  type: string;
  index?: number;
  context?: string;
  global?: string;
  slug?: string;
};

export function cmsSectionProps({
  type,
  index,
  context,
  global,
  slug,
}: CmsSectionMarkerProps): Record<string, string | number> {
  const props: Record<string, string | number> = {
    "data-cms-source": "payload",
    "data-cms-type": type,
  };

  if (index !== undefined) {
    props["data-cms-index"] = index;
  }
  if (context) {
    props["data-cms-context"] = context;
  }
  if (global) {
    props["data-cms-global"] = global;
  }
  if (slug) {
    props["data-cms-slug"] = slug;
  }

  return props;
}
