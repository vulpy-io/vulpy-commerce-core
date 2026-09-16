import Image from "next/image";
import { cmsSectionProps } from "@/components/cms/cms-section";
import { defaultPaymentMethods } from "@/lib/cms/defaults";
import type { CmsPaymentMethod } from "@/lib/cms/types";

export default function PaymentMethodIcons({
  className,
  paymentMethods = defaultPaymentMethods,
}: {
  className?: string;
  paymentMethods?: CmsPaymentMethod[];
}) {
  const icons =
    paymentMethods.length > 0 ? paymentMethods : defaultPaymentMethods;

  if (icons.length === 0) {
    return null;
  }

  return (
    <div
      className={className ?? "flex items-center gap-2"}
      {...cmsSectionProps({ type: "payment-methods", global: "site-settings" })}
    >
      {icons.map((method, index) => (
        <Image
          alt={method.alt}
          height={22}
          key={`${method.iconUrl}-${index}`}
          src={method.iconUrl}
          width={34}
        />
      ))}
    </div>
  );
}
