import Medusa from "@medusajs/js-sdk";
import type { Product } from "@/types/product";
import { sanitizeExternalPurchaseUrl } from "@/lib/safeExternalUrl";

/** Medusa Store API: минимальные поля для маппинга (типы API гибкие между версиями). */
type MedusaImage = { url?: string | null };
type MedusaCalculatedPrice = {
  calculated_amount?: number | string | null;
  currency_code?: string | null;
};
type MedusaVariant = {
  calculated_price?: MedusaCalculatedPrice | null;
  thumbnail?: string | null;
  images?: MedusaImage[] | null;
};
type MedusaStoreProduct = {
  id: string;
  title: string;
  handle: string;
  description?: string | null;
  subtitle?: string | null;
  thumbnail?: string | null;
  images?: MedusaImage[] | null;
  metadata?: Record<string, unknown> | null;
  variants?: MedusaVariant[] | null;
};

/** База URL для статики: опционально отдельно от API (CDN / тот же Railway без /store). */
function resolveMedusaBaseFromEnv(rawEnv: string | undefined): string {
  const trimmed = (rawEnv ?? "").replace(/\/$/, "");
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) {
    if (typeof window !== "undefined") {
      return `${window.location.origin}${trimmed}`;
    }
    return "";
  }
  return trimmed;
}

function getMedusaAssetBase(): string {
  const fromAsset = resolveMedusaBaseFromEnv(import.meta.env.VITE_MEDUSA_ASSET_URL as string | undefined);
  if (fromAsset) return fromAsset;
  return resolveMedusaBaseFromEnv(import.meta.env.VITE_MEDUSA_BACKEND_URL as string | undefined);
}

/** Локальный модуль файлов Medusa отдаёт преимущественно эти префиксы (jpg, png, webp — без разницы). */
function isMedusaServedFilePath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return p.startsWith("/static/") || p.startsWith("/uploads/");
}

/**
 * Относительные пути — дополняем базой витрины.
 * Абсолютные с «чужим» host (localhost, старый домен, внутренний URL) для /static|/uploads — переписываем на origin из env
 * (PNG часто приходит так же, как JPEG; сбой бывает, когда в JSON другой origin, чем публичный Medusa).
 */
function absolutizeMedusaImageUrl(url: string): string {
  let u = url.trim();
  if (!u) return u;

  const base = getMedusaAssetBase();

  const rewriteToConfiguredOrigin = (pathname: string, search: string, hash: string): string | null => {
    if (!base || !isMedusaServedFilePath(pathname)) return null;
    try {
      return `${new URL(base).origin}${pathname}${search}${hash}`;
    } catch {
      return null;
    }
  };

  if (u.startsWith("//")) u = `https:${u}`;

  if (/^https?:\/\//i.test(u)) {
    try {
      const parsed = new URL(u);
      const target = rewriteToConfiguredOrigin(parsed.pathname, parsed.search, parsed.hash);
      if (target && base) {
        try {
          if (parsed.origin !== new URL(base).origin) return target;
        } catch {
          return u;
        }
      }
      if (/^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname) && base) {
        try {
          return `${new URL(base).origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
    return u;
  }

  if (!base) return u.startsWith("/") ? u : `/${u}`;
  const path = u.startsWith("/") ? u : `/${u}`;
  return `${base}${path}`;
}

function getClopClothBase(): string {
  const fromEnv = (import.meta.env.VITE_CLOP_CLOTH_BASE as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (typeof window !== "undefined") return `${window.location.origin}/cloth`;
  return "https://clop-market.vercel.app/cloth";
}

function isMedusaHostedStaticUrl(url: string): boolean {
  try {
    const p = new URL(url, "https://placeholder.local").pathname.toLowerCase();
    return p.startsWith("/static/") || p.startsWith("/uploads/");
  } catch {
    return url.includes("/static/") || url.includes("/uploads/");
  }
}

function parseClopImageFiles(metadata: Record<string, unknown>): string[] {
  const raw = metadata.clop_image_files;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
      }
    } catch {
      /* ignore */
    }
  }
  return ["1.webp", "2.webp"];
}

function imagesFromClopFolder(folder: string, metadata: Record<string, unknown>): string[] {
  const base = getClopClothBase();
  const files = parseClopImageFiles(metadata);
  return files.map(
    (file) => `${base}/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`,
  );
}

/** Собираем все URL картинок: товар, thumbnail, вариант (в v2 часть фото только у варианта). */
function collectMedusaImageUrls(p: MedusaStoreProduct): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(absolutizeMedusaImageUrl(s));
  };

  for (const img of p.images ?? []) {
    push(img?.url);
  }
  push(p.thumbnail);

  const v0 = p.variants?.[0];
  if (v0) {
    push(v0.thumbnail);
    for (const img of v0.images ?? []) {
      push(img?.url);
    }
  }

  return out;
}

function parseSizesFromMetadata(metadata: Record<string, unknown> | null | undefined): Product["sizes"] {
  if (!metadata) return [];
  const raw = metadata.clop_sizes;
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is Record<string, string> => row !== null && typeof row === "object");
  } catch {
    return [];
  }
}

function formatPriceFromCalculated(cp: MedusaCalculatedPrice | null | undefined, fallback: string): string {
  if (!cp || cp.calculated_amount == null) return fallback;
  const raw = cp.calculated_amount;
  const n = typeof raw === "string" ? Number(raw) : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const code = (cp.currency_code ?? "rub").toUpperCase();
  const currency = code === "RUR" ? "RUB" : code;
  try {
    // Medusa v2 Store API: calculated_amount уже в основных единицах валюты (рубли, евро…),
    // см. https://docs.medusajs.com/resources/storefront-development/products/price/examples/show-price
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: currency === "RUB" ? "RUB" : currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return fallback;
  }
}

function derivePrice(p: MedusaStoreProduct, fallback: string): string {
  const meta = p.metadata ?? {};
  if (typeof meta.clop_price_label === "string" && meta.clop_price_label.trim()) {
    return meta.clop_price_label.trim();
  }
  const v = p.variants?.[0];
  return formatPriceFromCalculated(v?.calculated_price ?? null, fallback);
}

export function mapMedusaStoreProductToProduct(p: MedusaStoreProduct, fallbackPrice: string): Product {
  const meta = p.metadata ?? {};
  let urls = collectMedusaImageUrls(p);

  const clopFolder = typeof meta.clop_folder === "string" ? meta.clop_folder.trim() : "";
  if (clopFolder && (urls.length === 0 || urls.every(isMedusaHostedStaticUrl))) {
    urls = imagesFromClopFolder(clopFolder, meta);
  }

  const description = [p.description, p.subtitle].filter(Boolean).join("\n\n").trim();
  const vkPurchaseUrl = sanitizeExternalPurchaseUrl(meta.clop_vk_url);

  return {
    id: p.handle || p.id,
    title: p.title,
    description,
    sizes: parseSizesFromMetadata(p.metadata),
    images: urls,
    image: urls[0] ?? "",
    hoverImage: urls[1] ?? urls[0] ?? "",
    price: derivePrice(p, fallbackPrice),
    ...(vkPurchaseUrl ? { vkPurchaseUrl } : {}),
  };
}

export function isMedusaConfigured(): boolean {
  const url = import.meta.env.VITE_MEDUSA_BACKEND_URL;
  const pk = import.meta.env.VITE_MEDUSA_PUBLISHABLE_KEY;
  return typeof url === "string" && url.length > 0 && typeof pk === "string" && pk.length > 0;
}

const DEFAULT_FALLBACK_PRICE = "10 000 ₽";

/**
 * Загрузка опубликованных товаров из Medusa Store API.
 * В админке: регион с RUB, sales channel, publishable key для витрины.
 */
export async function loadProductsFromMedusa(): Promise<Product[]> {
  const baseUrl = import.meta.env.VITE_MEDUSA_BACKEND_URL as string;
  const publishableKey = import.meta.env.VITE_MEDUSA_PUBLISHABLE_KEY as string;

  const medusa = new Medusa({
    baseUrl: baseUrl.replace(/\/$/, ""),
    publishableKey,
  });

  const { regions } = await medusa.store.region.list({ limit: 50 });
  const regionId =
    regions.find((r) => (r.currency_code ?? "").toLowerCase() === "rub")?.id ?? regions[0]?.id;

  if (!regionId) {
    throw new Error(
      "Medusa: не найден регион. Создайте регион с валютой RUB в админке (Settings → Regions).",
    );
  }

  // Как в nextjs-starter-medusa: иначе без *variants.images картинки часто пустые (v2).
  const { products } = await medusa.store.product.list({
    region_id: regionId,
    limit: 300,
    fields: "*variants.calculated_price,*variants.images,*images,+metadata",
  });

  let list = (products ?? []) as MedusaStoreProduct[];

  list = list.filter((p) => {
    const hidden = p.metadata?.clop_hidden;
    return hidden !== true && hidden !== "true" && hidden !== "1";
  });

  list.sort((a, b) => {
    const ao = Number(a.metadata?.clop_order ?? 999);
    const bo = Number(b.metadata?.clop_order ?? 999);
    const na = Number.isFinite(ao) ? ao : 999;
    const nb = Number.isFinite(bo) ? bo : 999;
    if (na !== nb) return na - nb;
    return (a.title ?? "").localeCompare(b.title ?? "", "ru");
  });

  return list.map((p) => mapMedusaStoreProductToProduct(p, DEFAULT_FALLBACK_PRICE));
}
