import { useLocation } from 'react-router-dom';

export default function useQueryParam(name) {
  const { search } = useLocation();
  return new URLSearchParams(search).get(name) || '';
}
