/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL Medusa Store API. В dev можно указать относительный `/medusa` при включённом proxy в vite.config. */
  readonly VITE_MEDUSA_BACKEND_URL?: string;
  /**
   * Опционально: публичный URL только для файлов (/static, /uploads), если отличается от BACKEND_URL.
   * Иначе для картинок используется VITE_MEDUSA_BACKEND_URL.
   */
  readonly VITE_MEDUSA_ASSET_URL?: string;
  /** Publishable API key из Medusa Admin → Settings → Publishable API Keys */
  readonly VITE_MEDUSA_PUBLISHABLE_KEY?: string;
  /** Fallback для фото из public/cloth (если в Medusa URL битый /static). */
  readonly VITE_CLOP_CLOTH_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
