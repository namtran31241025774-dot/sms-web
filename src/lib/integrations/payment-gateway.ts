// Adapter giả lập Cổng thanh toán trực tuyến (FR-70, DEC-13)
// Mô phỏng tạo giao dịch thanh toán và webhook phản hồi

export interface PaymentGatewayAdapter {
  createPaymentRequest(input: {
    code: string;
    amount: number;
    orderCode: string;
    returnUrl?: string;
  }): {
    gatewayRef: string;
    checkoutUrl: string;
  };
  simulateCallback(
    code: string,
    status: "SUCCESS" | "FAILED",
  ): {
    gatewayRef: string;
    status: "SUCCESS" | "FAILED";
    completedAt: string;
  };
}

export const paymentGateway: PaymentGatewayAdapter = {
  createPaymentRequest(input) {
    const gatewayRef = `PGW-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    console.info(`[payment-gateway-mock] Tạo yêu cầu thanh toán ${input.code} (${input.amount.toLocaleString("vi-VN")} VND) -> ${gatewayRef}`);
    return {
      gatewayRef,
      checkoutUrl: `mock://payment-gateway/checkout?ref=${gatewayRef}&amount=${input.amount}`,
    };
  },
  simulateCallback(code, status) {
    console.info(`[payment-gateway-mock] Webhook callback ${code}: ${status}`);
    return {
      gatewayRef: `PGW-HOOK-${code}`,
      status,
      completedAt: new Date().toISOString(),
    };
  },
};
