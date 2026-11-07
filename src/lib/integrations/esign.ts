// Adapter giả lập dịch vụ Ký điện tử (E-Signature) - System Context & DEC-13, FR-55.

export interface EsignRequestInput {
  title: string;
  recipientEmail: string;
  recipientName: string;
  documentRef?: string;
  metadata?: Record<string, unknown>;
}

export interface EsignRequestResult {
  externalReference: string;
  signUrl: string;
  provider: string;
}

export interface EsignStatusResult {
  status: "PENDING" | "SIGNED" | "DECLINED" | "EXPIRED";
  signedAt?: string;
  declinedReason?: string;
}

export interface EsignAdapter {
  requestSignature(input: EsignRequestInput): EsignRequestResult;
  checkStatus(externalReference: string): EsignStatusResult;
  simulateWebhook(externalReference: string, outcome: "SIGNED" | "DECLINED"): EsignStatusResult;
}

// Bộ lưu trữ trạng thái giả lập trong bộ nhớ
const mockSignatures = new Map<string, EsignStatusResult>();

export const esign: EsignAdapter = {
  requestSignature(input) {
    const ref = `ESIGN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const signUrl = `https://mock-esign.example.com/sign/${ref}`;
    mockSignatures.set(ref, { status: "PENDING" });
    console.info(`[esign-mock] Request signature for "${input.title}" -> ${input.recipientEmail} (${ref})`);
    return {
      externalReference: ref,
      signUrl,
      provider: "mock-esign",
    };
  },

  checkStatus(externalReference) {
    const current = mockSignatures.get(externalReference);
    if (!current) {
      return { status: "PENDING" };
    }
    return current;
  },

  simulateWebhook(externalReference, outcome) {
    if (outcome === "SIGNED") {
      const updated: EsignStatusResult = {
        status: "SIGNED",
        signedAt: new Date().toISOString(),
      };
      mockSignatures.set(externalReference, updated);
      console.info(`[esign-mock] Document ${externalReference} SIGNED`);
      return updated;
    } else {
      const updated: EsignStatusResult = {
        status: "DECLINED",
        declinedReason: "Khách hàng từ chối điều khoản ký số",
      };
      mockSignatures.set(externalReference, updated);
      console.info(`[esign-mock] Document ${externalReference} DECLINED`);
      return updated;
    }
  },
};
