import type { Access } from "payload";
import { isDemoReadOnlyEnabled } from "@/lib/demo-read-only";

export const demoAdminOnly: Access = ({ req }) => {
  if (isDemoReadOnlyEnabled()) {
    return false;
  }
  return Boolean(req.user);
};
