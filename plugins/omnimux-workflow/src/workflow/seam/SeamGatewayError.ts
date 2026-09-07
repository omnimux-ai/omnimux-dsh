/** Typed execution-boundary failure shared by live, mock and material executors. */
export class SeamGatewayError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`[omnimux:${code}] ${message}`);
    this.name = 'SeamGatewayError';
    this.code = code;
  }
}
