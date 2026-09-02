interface Props {
  message?: string;
}

export function LoadingState({ message = "Loading…" }: Props) {
  return <div className="state-box state-loading">{message}</div>;
}

export function EmptyState({ message }: { message: string }) {
  return <div className="state-box state-empty">{message}</div>;
}

export function ErrorState({ message }: { message: string }) {
  return <div className="state-box state-error">{message}</div>;
}
