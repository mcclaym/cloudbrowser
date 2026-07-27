export const MAX_BODY_BYTES = 8192;

export interface ApiErrorPayload {
  code: string;
  message: string;
  field?: string;
  retryAfter?: number;
}

/** Error that carries the HTTP status and machine readable code to the client. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field?: string;
  readonly retryAfter?: number;

  constructor(
    status: number,
    code: string,
    message: string,
    options: { field?: string; retryAfter?: number } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = options.field;
    this.retryAfter = options.retryAfter;
  }

  static notFound(message = "没有这个 API 路径。"): ApiError {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static badRequest(code: string, message: string, field?: string): ApiError {
    return new ApiError(400, code, message, { field });
  }
}

export function json(
  data: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return withApiHeaders(
    new Response(JSON.stringify(data), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...headers,
      },
    }),
  );
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  options: { field?: string; retryAfter?: number; headers?: HeadersInit } = {},
): Response {
  const payload: ApiErrorPayload = { code, message };
  if (options.field) {
    payload.field = options.field;
  }
  if (options.retryAfter !== undefined) {
    payload.retryAfter = options.retryAfter;
  }
  return json({ error: payload }, status, options.headers ?? {});
}

export function errorResponseFrom(error: ApiError): Response {
  const headers: Record<string, string> = {};
  if (error.retryAfter !== undefined) {
    headers["retry-after"] = String(Math.ceil(error.retryAfter));
  }
  return errorResponse(error.status, error.code, error.message, {
    field: error.field,
    retryAfter: error.retryAfter,
    headers,
  });
}

export function methodNotAllowed(allow: string): Response {
  return errorResponse(405, "METHOD_NOT_ALLOWED", "不支持这个请求方法。", {
    headers: { allow },
  });
}

export function withApiHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Reads and parses a JSON body, refusing anything larger than the limit. */
export async function readJsonBody<T = Record<string, unknown>>(
  request: Request,
  maxBytes = MAX_BODY_BYTES,
): Promise<T> {
  const declared = Number.parseInt(
    request.headers.get("content-length") ?? "0",
    10,
  );
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "请求内容过大。");
  }

  const text = await request.text();
  if (!text) {
    return {} as T;
  }
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "请求内容过大。");
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as T;
  } catch {
    throw ApiError.badRequest("INVALID_JSON", "请求内容不是有效的 JSON 对象。");
  }
}

export function binaryResponse(
  body: ArrayBuffer | Uint8Array,
  contentType: string,
  fileName: string,
): Response {
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return withApiHeaders(
    new Response(buffer, {
      headers: {
        "content-type": contentType,
        "content-disposition": `attachment; filename="${sanitizeFileName(fileName)}"`,
      },
    }),
  );
}

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[^\w.-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "");
  return cleaned.slice(0, 80) || "cloudbrowser";
}
