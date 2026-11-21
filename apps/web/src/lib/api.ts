import type {
  ApiError, ChainTransaction, CheckoutPayment, CreatePaymentRequest, CursorPage, MerchantPayment,
  MerchantPayments, MerchantSummary, PaymentAuditEvent, PaymentEvent, PaymentFilters, PaymentLedgerEntry, PaymentReceipt,
} from "@oya/contracts";

const apiOrigin = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const merchantPayment = (id: string) => `/merchant/payments/${encodeURIComponent(id)}`;
const checkout = (id: string) => `/payments/${encodeURIComponent(id)}`;

export class RequestError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, signal?: AbortSignal, body?: object, method = body ? "POST" : "GET", headers?: HeadersInit): Promise<T> {
  const response = await fetch(apiOrigin + path, {
    credentials: "include", signal, method,
    headers: body ? { "Content-Type": "application/json", ...headers } : headers,
    body: body && JSON.stringify(body),
  });
  if (!response.ok) {
    const error: Partial<ApiError> = await response.json().catch(() => ({}));
    throw new RequestError(response.status, error.message ?? "Request could not be completed");
  }
  return response.status === 204 ? undefined as T : response.json();
}

function query(filters: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}

type Credentials = { email: string; password: string };
export const api = {
  session: (signal?: AbortSignal) => request<MerchantSummary>("/auth/session", signal),
  login: (body: Credentials) => request<MerchantSummary>("/auth/login", undefined, body),
  signup: (body: Credentials & { businessName: string }) => request<MerchantSummary>("/auth/signup", undefined, body),
  logout: () => request<void>("/auth/logout", undefined, undefined, "POST"),
  createPayment: (body: CreatePaymentRequest, key: string) =>
    request<CheckoutPayment>("/payments", undefined, body, "POST", { "Idempotency-Key": key }),
  checkout: (id: string, signal?: AbortSignal) => request<CheckoutPayment>(checkout(id), signal),
  merchantPayments: (filters: PaymentFilters, signal?: AbortSignal) =>
    request<MerchantPayments>(`/merchant/payments${query(filters)}`, signal),
  merchantPayment: (id: string, signal?: AbortSignal) => request<MerchantPayment>(merchantPayment(id), signal),
  transactions: (id: string, cursor: string, signal?: AbortSignal) =>
    request<CursorPage<ChainTransaction>>(`${merchantPayment(id)}/transactions${query({ cursor })}`, signal),
  audit: (id: string, cursor: string, signal?: AbortSignal) =>
    request<CursorPage<PaymentAuditEvent>>(`${merchantPayment(id)}/audit${query({ cursor })}`, signal),
  ledger: (id: string, cursor: string, signal?: AbortSignal) =>
    request<CursorPage<PaymentLedgerEntry>>(`${merchantPayment(id)}/ledger${query({ cursor })}`, signal),
  receipt: (id: string, merchant: boolean, signal?: AbortSignal) =>
    request<PaymentReceipt>(`${(merchant ? merchantPayment : checkout)(id)}/receipt`, signal),
  subscribe(id: string, onPayment: (payment: PaymentEvent) => void, onConnection: (connected: boolean) => void) {
    const stream = new EventSource(`${apiOrigin}${checkout(id)}/events`);
    stream.onopen = () => onConnection(true);
    stream.onerror = () => onConnection(false);
    stream.addEventListener("payment", (event: MessageEvent<string>) => {
      onPayment(JSON.parse(event.data) as PaymentEvent);
    });
    return () => stream.close();
  },
};
