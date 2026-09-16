import Image from "next/image";
import type { CmsTrustBadge } from "@/lib/cms/types";

const HeroFeature = ({ badges }: { badges: CmsTrustBadge[] }) => {
  return (
    <div className="container w-full">
      <div className="mt-10 flex flex-col gap-7.5 xl:flex-row xl:flex-wrap xl:items-center xl:justify-center xl:gap-12.5">
        {badges.map((item) => (
          <div className="flex w-full items-start gap-4 sm:w-auto sm:items-center" key={item.id}>
            {item.iconUrl ? (
              <Image
                alt={item.title}
                className="shrink-0"
                height={41}
                src={item.iconUrl}
                width={40}
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-content-primary text-lg">{item.title}</h3>
              <p className="w-full text-sm">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HeroFeature;
