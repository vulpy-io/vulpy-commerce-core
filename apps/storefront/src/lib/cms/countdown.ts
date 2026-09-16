export function isCountdownDeadlineFuture(deadline: string): boolean {
  if (!deadline.trim()) {
    return false;
  }

  const timestamp = Date.parse(deadline);
  if (Number.isNaN(timestamp)) {
    return false;
  }

  return timestamp > Date.now();
}
