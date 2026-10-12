import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Image imports resolve to Next's StaticImageData shape ({ src, width, height }) as they do in the build.
  plugins: [{
    name: "static-image",
    enforce: "pre",
    load(id) {
      if (!/\.(webp|png|jpe?g)$/.test(id)) return null;
      return `export default { src: ${JSON.stringify(`/_next/static/media/${id.split("/").pop()}`)}, width: 208, height: 208 };`;
    },
  }],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/server-only-stub.ts", import.meta.url)),
    },
  },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
