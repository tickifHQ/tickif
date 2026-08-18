export class VisitorProfileAccessDeniedError extends Error {
  constructor() {
    super('Visitor profile access is not permitted');
    this.name = 'VisitorProfileAccessDeniedError';
  }
}

export class VisitorProfileConstraintError extends Error {
  constructor() {
    super('Invalid visitor onboarding profile');
    this.name = 'VisitorProfileConstraintError';
  }
}
