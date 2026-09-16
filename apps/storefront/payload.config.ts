import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { mcpPlugin } from "@payloadcms/plugin-mcp";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { en } from "@payloadcms/translations/languages/en";
import { buildConfig } from "payload";
import sharp from "sharp";
import { CategoryContent } from "./src/collections/CategoryContent";
import { ContactSubmissions } from "./src/collections/ContactSubmissions";
import {
  BlogCategories,
  Pages,
  Posts,
  Tags,
} from "./src/collections/Content";
import { Media } from "./src/collections/Media";
import { ProductContent } from "./src/collections/ProductContent";
import { Users } from "./src/collections/Users";
import { FooterGlobal, Navigation, SiteSettings } from "./src/globals";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  i18n: {
    supportedLanguages: { en },
    fallbackLanguage: "en",
  },
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname, "src"),
    },
  },
  editor: lexicalEditor(),
  collections: [
    Users,
    Media,
    BlogCategories,
    Tags,
    Posts,
    Pages,
    ProductContent,
    CategoryContent,
    ContactSubmissions,
  ],
  globals: [SiteSettings, Navigation, FooterGlobal],
  plugins: [
    mcpPlugin({
      collections: {
        pages: { enabled: { find: true, create: true, update: true, delete: false } },
        productContent: { enabled: { find: true, create: false, update: true, delete: false } },
        categoryContent: { enabled: { find: true, create: false, update: true, delete: false } },
        media: { enabled: { find: true, create: true, update: true, delete: false } },
        posts: { enabled: { find: true, create: false, update: true, delete: false } },
      } as Record<string, { enabled: boolean | Record<string, boolean> }>,
      globals: {
        "site-settings": { enabled: { find: true, update: true } },
        navigation: { enabled: { find: true, update: true } },
        footer: { enabled: { find: true, update: true } },
      },
    }),
  ],
  secret: process.env.PAYLOAD_SECRET || "dev-payload-secret-change-me",
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: postgresAdapter({
    pool: {
      connectionString:
        process.env.DATABASE_URI ||
        process.env.PAYLOAD_DATABASE_URL ||
        "",
    },
    push: process.env.PAYLOAD_DISABLE_PUSH !== "1" && process.env.NODE_ENV !== "production",
    migrationDir: path.resolve(dirname, "src/migrations"),
  }),
  sharp,
});