/* Payload admin layout */
import config from "@payload-config";
import "@payloadcms/next/css";
import { handleServerFunctions, RootLayout } from "@payloadcms/next/layouts";
import type { ServerFunctionClient } from "payload";
import type { ReactNode } from "react";
import { importMap } from "./admin/importMap.js";

type Args = {
  children: ReactNode;
};

const serverFunction: ServerFunctionClient = async (args) => {
  "use server";
  return await handleServerFunctions({
    ...args,
    config,
    importMap,
  });
};

export default function PayloadLayout({ children }: Args) {
  return (
    <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
      {children as never}
    </RootLayout>
  );
}
