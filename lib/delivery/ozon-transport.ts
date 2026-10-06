export class OzonConnectionError extends Error {
  constructor(
    public endpoint: string,
    public code: string,
  ) {
    super("Не удалось связаться со службой доставки. Повторите попытку.");
  }
}
export class OzonApiError extends Error {
  constructor(
    public path: string,
    public status: number,
    public reason: string,
  ) {
    super("Не удалось выполнить запрос доставки. Повторите позже.");
  }
}
export class OzonAuthError extends Error {
  constructor(
    public status: number,
    public reason: string,
  ) {
    super("Служба доставки временно недоступна. Повторите позже.");
  }
}
// Imported only by the server adapter. Separate transport allows offline contract tests.
export class OzonTransport {
  private cookies = new Map<string, Map<string, string>>();
  private token?: string;
  private tokenUntil = 0;
  private authenticating?: Promise<string>;
  constructor(
    private clientId: string,
    private secret: string,
    private fetcher: typeof fetch = fetch,
  ) {}
  private async request(
    url: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    const signal = AbortSignal.timeout(15000);
    const initial = new URL(url);
    for (let hop = 0; hop < 5; hop++) {
      const current = new URL(url);
      if (current.protocol !== "https:" || current.origin !== initial.origin)
        throw new Error("Ошибка соединения со службой доставки.");
      const jar = this.cookies.get(current.origin) ?? new Map<string, string>();
      this.cookies.set(current.origin, jar);
      const response = await this.fetcher(url, {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          ...headers,
          ...(jar.size
            ? {
                Cookie: Array.from(jar)
                  .map(([k, v]) => `${k}=${v}`)
                  .join("; "),
              }
            : {}),
        },
        redirect: "manual",
        signal,
        cache: "no-store",
      }).catch((error: unknown) => {
        const cause =
          error instanceof Error
            ? (error as Error & { cause?: { code?: string } }).cause
            : undefined;
        const code =
          typeof cause?.code === "string" &&
          /^[A-Z_0-9]{1,60}$/.test(cause.code)
            ? cause.code
            : "NETWORK_ERROR";
        const endpoint = current.hostname + current.pathname;
        console.warn("Ozon connection failed", endpoint, code);
        throw new OzonConnectionError(endpoint, code);
      });
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(";")[0],
          equal = pair.indexOf("=");
        if (equal > 0) jar.set(pair.slice(0, equal), pair.slice(equal + 1));
      }
      if (![302, 307].includes(response.status)) return response;
      const location = response.headers.get("location");
      if (!location) break;
      url = new URL(location, url).toString();
    }
    throw new Error(
      "Не удалось связаться со службой доставки. Повторите расчёт.",
    );
  }
  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenUntil) return this.token;
    if (this.authenticating) return this.authenticating;
    this.authenticating = (async () => {
      const authenticate = async (scope: string[]) => {
        const response = await this.request(
          "https://xapi.ozon.ru/oauth/token",
          {
            client_id: this.clientId,
            client_secret: this.secret,
            grant_type: "client_credentials",
            scope,
          },
        );
        if (!response.ok) {
          // Log only status and a short OAuth error code, never response bodies or credentials.
          let reason = "unknown";
          try {
            const rejected = await response.json();
            const message = String(rejected.message ?? rejected.error ?? "");
            reason = /scope/i.test(message)
              ? "scope"
              : /client.?id.*uuid|invalid uuid/i.test(message)
                ? "client_id_format"
                : /client|secret|credential|unauthoriz|authentication/i.test(
                      message,
                    )
                  ? "credentials"
                  : Number.isInteger(rejected.code)
                    ? `vendor_code_${rejected.code}`
                    : "unknown";
          } catch {}
          throw new OzonAuthError(response.status, reason);
        }
        return response;
      };
      let response: Response;
      try {
        response = await authenticate([
          "delivery-api.shipment-method",
          "delivery-api.delivery",
          "delivery-api.delivery-point",
          "delivery-api.order",
          "delivery-api.posting",
        ]);
      } catch (error) {
        // Apps granted delivery-api.all may reject individual scope names.
        // The retry only uses access already granted to this private application.
        if (!(error instanceof OzonAuthError) || error.reason !== "scope")
          throw error;
        response = await authenticate(["delivery-api.all"]);
      }
      const data = await response.json();
      if (typeof data.access_token !== "string" || !data.access_token)
        throw new Error("Служба доставки временно недоступна.");
      this.token = data.access_token;
      this.tokenUntil =
        Date.now() +
        Math.max(0, Math.min(Number(data.expires_in) || 300, 3600) - 60) * 1000;
      return this.token!;
    })();
    try {
      return await this.authenticating;
    } finally {
      this.authenticating = undefined;
    }
  }
  async call<T>(
    path: string,
    body: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    if (!/^\/v1\/[a-z-]+\/[a-z-]+$/.test(path))
      throw new Error("Недопустимый метод доставки.");
    const token = await this.accessToken();
    const response = await this.request(
      "https://api-delivery.ozon.ru" + path,
      body,
      {
        Authorization: "Bearer " + token,
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
    );
    if (response.status === 401) {
      this.token = undefined;
      this.tokenUntil = 0;
    }
    if (!response.ok) {
      let reason = "unknown";
      try {
        const data = await response.json();
        const message = String(
          data.message ?? data.error?.message ?? data.error ?? "",
        );
        reason = /permission|forbidden|access|scope/i.test(message)
          ? "permissions"
          : /cursor/i.test(message)
            ? "cursor"
            : /limit|pagination/i.test(message)
              ? "pagination"
              : /shipment|method/i.test(message)
                ? "shipment_method"
                : /invalid|validation|required/i.test(message)
                  ? "validation"
                  : Number.isInteger(data.code)
                    ? `vendor_code_${data.code}`
                    : "unknown";
      } catch {}
      console.warn("Ozon API rejected", path, response.status, reason);
      throw new OzonApiError(path, response.status, reason);
    }
    return response.json() as Promise<T>;
  }
}

export async function activeShipmentMethod(
  transport: Pick<OzonTransport, "call">,
  configured?: string,
): Promise<number> {
  let id: number;
  if (configured) {
    id = Number(configured);
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Error(
        "Проверьте OZON_SHIPMENT_METHOD_ID в настройках сервера.",
      );
  } else {
    const found = await transport.call<{
      shipment_methods?: {
        shipment_method_id: number;
        name: string;
        status: string;
      }[];
      shipment_method?: {
        shipment_method_id: number;
        name: string;
        status: string;
      }[];
      next_cursor?: string;
    }>("/v1/shipment-method/search", {
      filters: { statuses: ["active"] },
      pagination: { limit: 100 },
    });
    const active = (
      found.shipment_methods ??
      found.shipment_method ??
      []
    ).filter((m) => m.status.toLowerCase() === "active");
    // Safe diagnostic contains method identifiers and status, never account or contact fields.
    console.info(
      "Ozon shipment methods",
      JSON.stringify({
        keys: Object.keys(found).filter((k) => /^[a-z_]{1,40}$/.test(k)),
        methods: (found.shipment_methods ?? found.shipment_method ?? []).map(
          (m) => ({ id: Number(m.shipment_method_id), status: m.status }),
        ),
        hasNextPage: Boolean(found.next_cursor),
      }),
    );
    // Never silently choose between multiple dispatch methods.
    if (found.next_cursor || active.length !== 1)
      throw new Error(
        "В Ozon должен быть один активный метод доставки. Для нескольких методов укажите OZON_SHIPMENT_METHOD_ID.",
      );
    id = active[0].shipment_method_id;
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Error("Ozon вернул неверный идентификатор метода доставки.");
  }
  const info = await transport.call<{
    shipment_methods: { shipment_method_id: number; status: string }[];
  }>("/v1/shipment-method/info", { shipment_method_ids: [id] });
  if (
    !info.shipment_methods?.some(
      (m) => m.shipment_method_id === id && m.status.toLowerCase() === "active",
    )
  )
    throw new Error("Метод доставки Ozon неактивен. Свяжитесь со студией.");
  return id;
}
