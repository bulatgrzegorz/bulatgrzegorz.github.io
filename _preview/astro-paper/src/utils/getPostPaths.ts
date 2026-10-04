import { getRelativeLocaleUrl } from "astro:i18n";
import config from "@/config";

export function getPostSlug(id: string, _filePath?: string): string {
  return id;
}

export function getPostUrl(
  id: string,
  _filePath?: string,
  locale: string = config.site.lang
): string {
  return getRelativeLocaleUrl(locale, `${id}/`);
}
