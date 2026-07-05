export interface BridgeCommandRequest {
  command: string;
  transactionId?: string;
  payload: Record<string, unknown>;
}

export class BridgeClient {
  constructor(private readonly baseUrl = "http://127.0.0.1:17857") {}

  async getStatus(): Promise<unknown> {
    return this.request("GET", "/status");
  }

  async sendCommand(request: BridgeCommandRequest): Promise<unknown> {
    return this.request("POST", "/command", request);
  }

  private async request(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const text = await response.text();
    const data = text.length > 0 ? parseJson(text) : {};

    if (!response.ok) {
      throw new Error(`Bridge ${method} ${path} failed with ${response.status}: ${text}`);
    }

    return data;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Bridge returned invalid JSON: ${text}`);
  }
}
