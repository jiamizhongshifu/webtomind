export const EXIT = {
  OK: 0,
  ERROR: 1,
  USAGE: 2,
  AUTH: 3,
  ENTITLEMENT: 4,
  INTEGRITY: 5
};

export class CliError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {{ exitCode?: number, details?: Record<string, unknown> }} [options]
   */
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.exitCode = options.exitCode ?? EXIT.ERROR;
    this.details = options.details ?? {};
  }
}
