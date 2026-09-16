import { revalidatePath } from "next/cache";
import type { GlobalAfterChangeHook } from "payload";

export const revalidateSiteGlobal: GlobalAfterChangeHook = () => {
  revalidatePath("/", "layout");
};

export const revalidateHomeGlobal: GlobalAfterChangeHook = () => {
  revalidatePath("/");
};
