import { getStore } from "@netlify/blobs";

declare const Netlify: {
  env: {
    get(name: string): string | undefined;
  };
};

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export default async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const configuredSecret = Netlify.env.get("FULFILLMENT_ADMIN_SECRET");
  const providedSecret = req.headers.get("x-upload-secret");

  if (!configuredSecret || !providedSecret || providedSecret !== configuredSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > MAX_UPLOAD_BYTES) {
    return new Response("File is too large", { status: 413 });
  }

  const file = await req.blob();
  if (file.size === 0) {
    return new Response("Empty file", { status: 400 });
  }

  const store = getStore("shturval-fulfillment");
  await store.set("shturval-ukrainian.epub", file, {
    metadata: {
      contentType: "application/epub+zip",
      filename: "ШТУРВАЛ — українська версія.epub",
    },
  });

  return Response.json({
    ok: true,
    filename: "ШТУРВАЛ — українська версія.epub",
    size: file.size,
  });
};

export const config = {
  path: "/admin/upload-epub",
};
