import type { Product } from "@/types/product";

type ManifestJson = {
  products?: string[];
  prices?: Record<string, string>;
  images?: Record<string, string[]>;
  gridImages?: Record<string, string[]>;
  vkUrls?: Record<string, unknown>;
};

function normKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function resolveManifestFolder(product: Product, folders: string[]): string | null {
  if (product.clopFolder) {
    const exact = folders.find((f) => f === product.clopFolder);
    if (exact) return exact;
  }
  const idNorm = normKey(String(product.id));
  for (const folder of folders) {
    if (normKey(folder) === idNorm) return folder;
  }
  return null;
}

function isMedusaStaticImageUrl(url: string): boolean {
  if (!url) return true;
  return url.includes("/static/") || url.includes("/static%") || url.includes("localhost:9000");
}

/** Подставляет фото из /cloth/manifest, если Medusa отдаёт битые /static URL. */
export async function enrichProductsWithManifestImages(products: Product[]): Promise<Product[]> {
  if (!products.length) return products;

  const needsFallback = products.some(
    (p) => !p.image || isMedusaStaticImageUrl(p.image) || isMedusaStaticImageUrl(p.images?.[0] ?? ""),
  );
  if (!needsFallback) return products;

  let manifest: ManifestJson;
  try {
    const res = await fetch("/cloth/manifest.json", { cache: "no-cache" });
    if (!res.ok) return products;
    manifest = (await res.json()) as ManifestJson;
  } catch {
    return products;
  }

  const folders = manifest.products ?? [];
  if (!folders.length) return products;

  return products.map((p) => {
    if (p.image && !isMedusaStaticImageUrl(p.image)) return p;

    const folder = resolveManifestFolder(p, folders);
    if (!folder) return p;

    const grid = manifest.gridImages?.[folder] ?? manifest.images?.[folder] ?? [];
    const all = manifest.images?.[folder] ?? grid;
    const toUrl = (file: string) => `/cloth/${folder}/${file}`;
    const images = all.map(toUrl);
    const gridUrls = grid.map(toUrl);

    return {
      ...p,
      images: images.length ? images : p.images,
      image: gridUrls[0] || images[0] || p.image,
      hoverImage: gridUrls[1] || gridUrls[0] || images[1] || images[0] || p.hoverImage,
      price: p.price ?? manifest.prices?.[folder] ?? undefined,
    };
  });
}
