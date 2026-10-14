import { ErrorState, PageSkeleton } from './Feedback';
import { toUserMessage } from '../../lib/api';

// Standard page-level handling for a useApi() query: skeleton on first load, friendly error + retry.
export default function QueryBoundary({ query, children, skeleton = <PageSkeleton /> }) {
  if (query.error && !query.data) {
    return <div className="page"><ErrorState title="Could not load this page" description={toUserMessage(query.error)} onRetry={query.reload} /></div>;
  }
  if (query.loading && !query.data) return skeleton;
  return children;
}
