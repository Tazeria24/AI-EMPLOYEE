/** Renders an auth error or informational message from the URL query. */
export function AuthMessage({
  error,
  message,
}: {
  error?: string;
  message?: string;
}) {
  if (error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error}
      </p>
    );
  }
  if (message) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {message}
      </p>
    );
  }
  return null;
}
