export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function assertValid(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ValidationError(message);
}
