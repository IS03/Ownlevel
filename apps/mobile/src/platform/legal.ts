import * as WebBrowser from 'expo-web-browser';

/** Public legal pages (Web). Always the production site: a local or preview API does not serve them. */
export const LEGAL_URLS = {
  privacy: 'https://www.ownlevel.fit/privacidad',
  terms: 'https://www.ownlevel.fit/terminos',
} as const;

/** Opens a legal page in the in-app browser; never blocks or throws if it cannot open. */
export function openLegal(page: keyof typeof LEGAL_URLS): void {
  void WebBrowser.openBrowserAsync(LEGAL_URLS[page], { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET }).catch(() => undefined);
}
