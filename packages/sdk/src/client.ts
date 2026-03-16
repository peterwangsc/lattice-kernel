export interface LatticeClientConfig {
  endpoint?: string;
}

export class LatticeClient {
  readonly config: LatticeClientConfig;

  constructor(config: LatticeClientConfig = {}) {
    this.config = config;
  }
}
