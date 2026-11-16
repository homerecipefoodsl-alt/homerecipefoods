export function getStickyHeaderOffset(): number {
  if (typeof document === 'undefined') return 0;
  const stickyHeader = document.querySelector<HTMLElement>('[data-sticky-header="true"]');
  if (!stickyHeader) return 0;
  return Math.ceil(stickyHeader.getBoundingClientRect().height);
}

export function scrollToPageTop(): void {
  if (typeof window === 'undefined') return;
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}

export function scrollToSectionById(id: string): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !id) {
    return false;
  }
  const target = document.getElementById(id);
  if (!target) return false;

  const headerOffset = getStickyHeaderOffset();
  const rect = target.getBoundingClientRect();
  const targetTop = Math.max(0, Math.round(rect.top + window.scrollY - headerOffset - 8));

  const prefersReducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  window.scrollTo({
    top: targetTop,
    left: 0,
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
  });
  return true;
}
