import type { HttpTypes } from "@medusajs/types";
import { cache } from "react";
import config from "@/config";
import { getMedusaClient } from "./client";
import medusaError from "./error";

export interface Country {
  code: string;
  currency: {
    code: string;
    symbol: string;
  };
  name: string;
}

export const listRegions = cache(async () => {
  try {
    const medusa = await getMedusaClient();
    const { regions } = await medusa.store.region.list({});
    return regions;
  } catch (error) {
    return medusaError(error);
  }
});

export const listCountries = async () => {
  const regions = await listRegions();
  const countries = regions
    .flatMap((region) => {
      if (region.countries) {
        return region.countries.map((country) => {
          if (country.iso_2 && country.display_name) {
            return {
              code: country.iso_2,
              currency: {
                code: region.currency_code,
                symbol: new Intl.NumberFormat("en-US", {
                  currency: region.currency_code,
                  style: "currency",
                })
                  .format(9)
                  .split("9")[0],
              },
              name: country.display_name,
            } satisfies Country;
          }
          return null;
        });
      }
      return null;
    })
    .filter((c) => c !== null);

  return countries.filter(
    (country, index, self) =>
      index === self.findIndex((t) => t?.code === country?.code)
  );
};

const regionMap = new Map<string, HttpTypes.StoreRegion>();

export const getRegion = cache(async (countryCode: string) => {
  try {
    if (regionMap.has(countryCode)) {
      return regionMap.get(countryCode);
    }

    const regions = await listRegions();

    if (!regions) {
      return null;
    }

    for (const region of regions) {
      for (const country of region.countries ?? []) {
        regionMap.set(country?.iso_2 ?? "", region);
      }
    }

    const region = countryCode
      ? regionMap.get(countryCode)
      : regionMap.get(config.defaultCountryCode);

    if (region) {
      return region;
    }

    // Fallback to first region when country code is missing from seed data
    return regions[0] ?? null;
  } catch {
    return null;
  }
});

export type StoreRegion = {
  regionId: string;
  currencyCode: string;
};

function toStoreRegion(region: HttpTypes.StoreRegion | null | undefined): StoreRegion {
  return {
    regionId: region?.id ?? "",
    currencyCode: region?.currency_code ?? "",
  };
}

/** Active storefront region + currency from Medusa (default country, then first region). */
export const getStoreRegion = cache(async (): Promise<StoreRegion> => {
  const region = await getRegion(config.defaultCountryCode);
  if (region?.id && region.currency_code) {
    return toStoreRegion(region);
  }

  const regions = await listRegions();
  return toStoreRegion(regions?.[0]);
});

export const getRegionId = cache(async () => {
  const { regionId } = await getStoreRegion();
  return regionId;
});

export const getCurrencyCode = cache(async () => {
  const { currencyCode } = await getStoreRegion();
  return currencyCode;
});
