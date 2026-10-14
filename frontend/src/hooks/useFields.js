import { useCallback, useState } from 'react';

// Tiny controlled-form helper: `const f = useFields({ a: '' }); <Input {...f.input('a')} />`
export default function useFields(initial) {
  const [values, setValues] = useState(initial);
  const set = useCallback((name, value) => setValues(v => ({ ...v, [name]: value })), []);
  const input = useCallback(
    name => ({ name, value: values[name] ?? '', onChange: e => set(name, e.target.value) }),
    [values, set],
  );
  const reset = useCallback(() => setValues(initial), [initial]);
  return { values, set, input, reset, setValues };
}
