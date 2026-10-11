import { useEffect, useState } from 'react';
export function usePhoneLayout() {
  const [phone, setPhone] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)');
    const update = () => setPhone(query.matches); query.addEventListener('change', update); return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!phone) { document.documentElement.style.removeProperty('--mobile-height'); return; }
    const update = () => document.documentElement.style.setProperty('--mobile-height', `${window.visualViewport?.height || window.innerHeight}px`);
    update(); window.visualViewport?.addEventListener('resize', update); window.addEventListener('resize', update);
    return () => { window.visualViewport?.removeEventListener('resize', update); window.removeEventListener('resize', update); };
  }, [phone]);
  return phone;
}
export function useDrawer(open: boolean, selector: string, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const panel = document.querySelector<HTMLElement>(selector); if (!panel) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.querySelector<HTMLElement>('button:not(:disabled),input,select,textarea')?.focus();
    const key = (e: KeyboardEvent) => {
      if (document.querySelector('.modal-shade')) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') {
        const controls = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el => el.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key); return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, [open, selector]);
}
