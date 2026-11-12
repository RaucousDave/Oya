export interface JobLogger {
  error(message: string, error: unknown): void;
}
