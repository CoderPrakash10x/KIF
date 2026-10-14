import { useCallback, useRef, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { toUserMessage } from '../lib/api';

// Shared submit flow for every form: validate -> disable -> call API -> map backend errors -> toast.
// `action` is an async function that calls the API (it may throw ApiError).
export default function useSubmit() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const lock = useRef(false);

  const run = useCallback(
    async (validate, action, { success, onDone } = {}) => {
      if (lock.current) return; // no double submission
      const local = validate ? validate() : {};
      if (Object.keys(local).length) {
        setErrors(local);
        toast.error('Please complete all required fields.');
        return;
      }
      setErrors({});
      lock.current = true;
      setBusy(true);
      try {
        const res = await action();
        toast.success(success || res?.message);
        onDone?.(res?.data);
      } catch (e) {
        setErrors(e.fieldErrors || {});
        toast.error(toUserMessage(e));
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [toast],
  );

  return { busy, errors, setErrors, run };
}
