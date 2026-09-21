// A single locale date formatter, shared by every screen that shows a timestamp
// (PostCard, PostDetail, CommentThread). Extracted here once three consumers
// appeared — the same "add when the need arrives" rule the scaffold followed, not
// a pre-stubbed utils bucket.
const dateFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
}
