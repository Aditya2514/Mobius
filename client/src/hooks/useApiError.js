import { useSnackbar } from 'notistack';
import { toApiError } from '../api/client';

export function useApiError(setError) {
  const { enqueueSnackbar } = useSnackbar();

  return (err) => {
    const e = toApiError(err);
    if (e.field && setError) {
      setError(e.field, { message: e.message });
    } else {
      enqueueSnackbar(e.message, { variant: 'error' });
    }
    return e;
  };
}

