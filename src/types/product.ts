/** Товар витрины (общий тип для manifest и Medusa). */
export interface Product {
  id: string;
  title: string;
  description: string;
  sizes: Array<{
    size?: string;
    chest?: string;
    waist?: string;
    length?: string;
    [key: string]: string | undefined;
  }>;
  images: string[];
  image?: string;
  hoverImage?: string;
  brand?: string;
  price?: string;
  size?: string;
  /** Полная ссылка «Купить в VK» (Medusa: metadata `clop_vk_url`, manifest: `vkUrls`). */
  vkPurchaseUrl?: string;
  /** Папка в public/cloth (Medusa metadata clop_folder) — fallback фото с manifest. */
  clopFolder?: string;
}
