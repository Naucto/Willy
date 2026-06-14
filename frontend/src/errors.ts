/**
 * Base for all frontend errors. Derive named subclasses so failures are typed and
 * catchable by class rather than by string matching.
 */
export class WillyError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);

    this.name = new.target.name;
  }
}

export class MissingRootElementError extends WillyError {}
