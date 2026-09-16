import { type AdminLabelsEn, adminLabelsEn } from "./en";

export const DEFAULT_ADMIN_LOCALE = "en" as const;

export type AdminLocale = typeof DEFAULT_ADMIN_LOCALE;

const catalogs: Record<AdminLocale, AdminLabelsEn> = {
  en: adminLabelsEn,
};

type NestedKeys<T, Prefix extends string = ""> = T extends string
  ? Prefix extends ""
    ? never
    : Prefix
  : {
      [K in keyof T & string]: NestedKeys<
        T[K],
        Prefix extends "" ? K : `${Prefix}.${K}`
      >;
    }[keyof T & string];

export type AdminLabelKey = NestedKeys<AdminLabelsEn>;

function resolveLabel(
  catalog: AdminLabelsEn,
  key: AdminLabelKey
): string | undefined {
  const parts = key.split(".");
  let current: unknown = catalog;

  for (const part of parts) {
    if (!(current && typeof current === "object" && part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === "string" ? current : undefined;
}

export function tAdmin(
  key: AdminLabelKey,
  locale: AdminLocale = DEFAULT_ADMIN_LOCALE
): string {
  const text = resolveLabel(catalogs[locale], key);
  if (!text) {
    return key;
  }
  return text;
}

export function tAdminFormat(
  key: AdminLabelKey,
  vars: Record<string, string>,
  locale: AdminLocale = DEFAULT_ADMIN_LOCALE
): string {
  let text = tAdmin(key, locale);
  for (const [name, value] of Object.entries(vars)) {
    text = text.replace(`{${name}}`, value);
  }
  return text;
}
