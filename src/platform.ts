import { createBrowserAPI } from '../browser/api';
import type { DesktopAPI } from '../shared/model';

export const isBrowser = !window.desktop;
export const api: DesktopAPI = window.desktop || createBrowserAPI();
window.recallDesk = api;
declare global { interface Window { recallDesk: DesktopAPI } }
