import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { type CmsSectionMarkerProps, cmsSectionProps } from "@/components/cms/cms-section";

type CmsSectionProps = CmsSectionMarkerProps & {
  children: ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">;

export default function CmsSection({
  type,
  index,
  context,
  global,
  slug,
  children,
  className = "contents",
  ...rest
}: CmsSectionProps): ReactElement {
  return (
    <div
      className={className}
      {...cmsSectionProps({ type, index, context, global, slug })}
      {...rest}
    >
      {children}
    </div>
  );
}
