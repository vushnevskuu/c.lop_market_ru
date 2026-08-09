import { useState, useEffect } from "react";
import type { Product } from "@/types/product";
import { isMedusaConfigured, loadProductsFromMedusa } from "@/lib/medusaProducts";
import { enrichProductsWithManifestImages } from "@/lib/manifestImageFallback";
import { sanitizeExternalPurchaseUrl } from "@/lib/safeExternalUrl";

export type { Product };

const DEFAULT_PRICE = "10 000 ₽";

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function loadProducts() {
      try {
        setLoading(true);

        if (isMedusaConfigured()) {
          try {
            const fromMedusa = await loadProductsFromMedusa();
            const enriched = await enrichProductsWithManifestImages(fromMedusa);
            setProducts(enriched);
            setError(null);
            return;
          } catch (medusaErr) {
            console.warn("[CLOP] Medusa недоступна, грузим manifest.json:", medusaErr);
          }
        }

        const manifestResponse = await fetch("/cloth/manifest.json", { cache: "no-cache" });

        if (!manifestResponse.ok) {
          console.warn("manifest.json not found in /cloth/, products will not be loaded");
          setProducts([]);
          setLoading(false);
          return;
        }

        const manifest = await manifestResponse.json();
        const priceMap: Record<string, string> =
          manifest.prices && typeof manifest.prices === "object" ? manifest.prices : {};
        const vkUrlMap: Record<string, unknown> =
          manifest.vkUrls && typeof manifest.vkUrls === "object" ? manifest.vkUrls : {};

        const productPromises = (manifest.products || []).map(async (productFolder: string) => {
          const productPath = `/cloth/${encodeURIComponent(productFolder)}`;

          let description = "";
          let sizes: Product["sizes"] = [];

          try {
            let descResponse = await fetch(`${productPath}/description.txt`, { cache: "no-cache" });
            if (!descResponse.ok) {
              descResponse = await fetch(`${productPath}/discription.txt`, { cache: "no-cache" });
            }
            if (descResponse.ok) {
              const descContent = await descResponse.text();
              const parsed = parseDescriptionFile(descContent);
              description = parsed.description;
              sizes = parsed.sizes;
            }
          } catch (err) {
            console.warn(`Failed to load description for ${productFolder}:`, err);
          }

          const images: string[] = (manifest.images?.[productFolder] || [])
            .map((img: string) => `/cloth/${productFolder}/${img}`)
            .sort((a: string, b: string) => {
              const numA = parseInt(a.match(/(\d+)/)?.[1] || "0", 10);
              const numB = parseInt(b.match(/(\d+)/)?.[1] || "0", 10);
              return numA - numB;
            });

          const gridImages: string[] = (manifest.gridImages?.[productFolder] || manifest.images?.[productFolder] || [])
            .map((img: string) => `/cloth/${productFolder}/${img}`);

          const vkPurchaseUrl = sanitizeExternalPurchaseUrl(vkUrlMap[productFolder]);

          return {
            id: productFolder,
            title: productFolder,
            description,
            sizes,
            images,
            image: gridImages[0] || images[0] || "",
            hoverImage: gridImages[1] || gridImages[0] || images[1] || images[0] || "",
            price: priceMap[productFolder] ?? DEFAULT_PRICE,
            ...(vkPurchaseUrl ? { vkPurchaseUrl } : {}),
          };
        });

        const loaded = await Promise.all(productPromises);
        setProducts(loaded);
        setError(null);
      } catch (err) {
        console.error("Error loading products:", err);
        setError(err instanceof Error ? err : new Error("Не удалось загрузить каталог"));
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }

    loadProducts();
  }, []);

  return { products, loading, error };
}

const SIZE_SECTION_START =
  /approximate\s+measurements|measurements\s*\(laid\s+flat\)|приблизительные\s+замеры|замеры\s*\([^)]*разложен/i;

const MEASUREMENT_KEY =
  /^(chest|waist|shoulder\s*width|back\s*length|front\s*length|arm\s*opening|size|размер|грудь|талия|ширина(\s*плеч)?|длина\s*спины|длина\s*переда|пройма)/i;

const LOOKS_LIKE_MEASUREMENT =
  /^[\d\s–\-~]+(?:cm|см)$|^\d+\s*[–\-]\s*\d+(\s*(?:cm|см))?$/i;

function parseDescriptionFile(content: string): { description: string; sizes: Product["sizes"] } {
  const lines = content.split("\n").map((line) => line.trim());

  let description = "";
  let sizes: Product["sizes"] = [];
  let inSizesSection = false;
  const measurementRow: { [key: string]: string } = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.length > 0 && SIZE_SECTION_START.test(line)) {
      inSizesSection = true;
      continue;
    }

    if (inSizesSection) {
      const keyValue = line.match(/^(.+?):\s*(.+)$/);
      if (keyValue) {
        const key = keyValue[1].trim();
        const value = keyValue[2].trim();
        const isMeasurementKey = MEASUREMENT_KEY.test(key);
        const isMeasurementValue =
          LOOKS_LIKE_MEASUREMENT.test(value) || /^\d+[–\-]\d+\s*(?:cm|см)/i.test(value);
        if (isMeasurementKey && isMeasurementValue) {
          measurementRow[key] = value;
          continue;
        }
      }
    } else {
      if (description) description += "\n";
      description += line;
    }
  }

  if (Object.keys(measurementRow).length > 0) {
    sizes.push(measurementRow);
  }

  return { description: description.trim(), sizes };
}
