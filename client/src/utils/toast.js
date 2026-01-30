function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function toast(input) {
  const detail = {
    id: input?.id || uid(),
    title: input?.title || '',
    message: input?.message || '',
    kind: input?.kind || 'info', // 'info' | 'success' | 'warning' | 'danger'
    durationMs: Number.isFinite(input?.durationMs) ? Number(input.durationMs) : 4200,
  };
  window.dispatchEvent(new CustomEvent('healis:toast', { detail }));
  return detail.id;
}

