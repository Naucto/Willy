/**
 * Base for all backend errors. Derive named subclasses so failures are typed and
 * catchable by class rather than by string matching.
 */
export class WillyError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);

    // Without this, instanceof checks break for subclasses compiled to ES targets.
    this.name = new.target.name;
  }
}

export class ConfigError extends WillyError {}
