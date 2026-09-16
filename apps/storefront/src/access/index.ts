import type { Access } from "payload";

export { demoAdminOnly } from "./demo-read-only";

export const publicRead: Access = () => true;

export const adminOnly: Access = ({ req: { user } }) => Boolean(user);
