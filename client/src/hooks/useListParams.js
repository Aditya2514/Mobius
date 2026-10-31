import { useSearchParams } from 'react-router-dom';

export function useListParams(defaults = {}) {
  const [sp, setSp] = useSearchParams();
  const fromUrl = Object.fromEntries(sp.entries());

  const params = {
    ...defaults,
    ...fromUrl,
    page: Number(fromUrl.page ?? defaults.page ?? 1),
    pageSize: Number(fromUrl.pageSize ?? defaults.pageSize ?? 25),
  };

  const setParams = (patch) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === '') {
          next.delete(k);
        } else {
          next.set(k, String(v));
        }
      }
      if (!('page' in patch)) {
        next.set('page', '1'); // Any filter change resets to page 1
      }
      return next;
    });
  };

  return [params, setParams];
}

