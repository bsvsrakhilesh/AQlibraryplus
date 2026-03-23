import axios from "axios";
import { env } from "../config/env";

export type InstitutionalCaptureMode = "text" | "pdf";

type InstitutionalCaptureWireResponse = {
  ok?: boolean;
  fileName?: string | null;
  mimeType?: string | null;
  finalUrl?: string | null;
  contentBase64?: string | null;
  provider?: string | null;
  nodeName?: string | null;
  note?: string | null;
  message?: string | null;
};

export type InstitutionalCaptureResult = {
  buffer: Buffer;
  fileName: string | null;
  mimeType: string | null;
  finalUrl: string | null;
  provider: string | null;
  nodeName: string | null;
  note: string | null;
};

export async function captureViaInstitutionalNode(input: {
  mode: InstitutionalCaptureMode;
  url: string;
  fileName?: string | null;
  requestId?: string | null;
}): Promise<InstitutionalCaptureResult> {
  if (!env.ICN_ENABLED) {
    const err: any = new Error(
      "Institutional capture is disabled on this backend. Set ICN_ENABLED=true to route through the IIT session node.",
    );
    err.status = 503;
    throw err;
  }

  const endpoint = input.mode === "pdf" ? "/capture/pdf" : "/capture/text";

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (env.ICN_SHARED_SECRET) {
      headers["x-icn-shared-secret"] = env.ICN_SHARED_SECRET;
    }
    if (input.requestId) {
      headers["x-request-id"] = input.requestId;
    }

    const res = await axios.post<InstitutionalCaptureWireResponse>(
      `${env.ICN_BASE_URL}${endpoint}`,
      {
        url: input.url,
        fileName: input.fileName ?? null,
      },
      {
        timeout: env.ICN_TIMEOUT_MS,
        headers,
      },
    );

    const data = res.data;

    if (!data?.contentBase64) {
      const err: any = new Error(
        data?.message || "Institutional capture node returned no content.",
      );
      err.status = 502;
      throw err;
    }

    return {
      buffer: Buffer.from(data.contentBase64, "base64"),
      fileName: data.fileName ?? null,
      mimeType: data.mimeType ?? null,
      finalUrl: data.finalUrl ?? null,
      provider: data.provider ?? null,
      nodeName: data.nodeName ?? null,
      note: data.note ?? null,
    };
  } catch (error: any) {
    const status = error?.response?.status ?? error?.status ?? 502;
    const message =
      error?.response?.data?.message ||
      error?.message ||
      "Institutional capture request failed.";

    const err: any = new Error(`Institutional capture failed: ${message}`);
    err.status = status;
    throw err;
  }
}
