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

// An invariant about the database was violated (e.g. an insert returned no row).
export class DatabaseError extends WillyError {}

// A volume file-manager operation was rejected (bad path, escape attempt, too large) or failed
// inside the helper container. Mapped to a 4xx/5xx by the controller layer.
export class FileManagerError extends WillyError {}
