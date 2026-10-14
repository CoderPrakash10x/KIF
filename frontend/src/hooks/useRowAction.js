import { useCallback, useRef, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { toUserMessage } from '../lib/api';

// One-click actions (approve, publish, activate…) outside of a form.
export default function useRowAction() {
  const toast = useToast();
  const [pending, setPending] = useState(null);
  const lock = useRef(false);
  const run = useCallback(
    async (key, action, { success, onDone } = {}) => {
      if (lock.current) return;
      lock.current = true;
      setPending(key);
      try {
        const res = await action();
        toast.success(success || res?.message);
        onDone?.(res?.data);
      } catch (e) {
        toast.error(toUserMessage(e));
      } finally {
        lock.current = false;
        setPending(null);
      }
    },
    [toast],
  );
  return { pending, run };
}
