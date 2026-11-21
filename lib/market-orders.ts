export type MarketOrderStatus =
  | "pending"
  | "accepted"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled";

export type MarketplaceDeliveryMethod = "delivery" | "pickup";
export type MarketplacePaymentMethod = "cash_on_delivery" | "pay_on_pickup";
export type MarketplaceOrderStatusHistoryEntry = {
  status: MarketOrderStatus;
  time: number;
  byUid: string;
};

export type MarketplaceOrder = {
  id: string;
  productId: string;
  productTitle: string;
  productPrice: string;
  productImage: string;
  sellerUid: string;
  sellerName: string;
  buyerUid: string;
  buyerName: string;
  buyerPhone: string;
  buyerAddress: string;
  quantity: number;
  status: MarketOrderStatus;
  fulfillmentStatus?: MarketOrderStatus;
  time: number;
  deliveryMethod?: MarketplaceDeliveryMethod;
  paymentMethod?: MarketplacePaymentMethod;
  statusHistory?: MarketplaceOrderStatusHistoryEntry[];
  orderGroupId?: string;
  totalPrice?: number;
  createdAt?: number;
};

export type MarketplaceOrderInput = Omit<
  MarketplaceOrder,
  "id" | "status" | "time"
>;

const statuses: MarketOrderStatus[] = [
  "pending", "accepted", "preparing", "shipped", "delivered", "cancelled",
];

export function canTransitionMarketplaceOrder(
  from: MarketOrderStatus,
  to: MarketOrderStatus,
): boolean {
  if (from === "pending") return to === "accepted" || to === "cancelled";
  if (from === "accepted") return to === "preparing" || to === "cancelled";
  if (from === "preparing") return to === "shipped";
  if (from === "shipped") return to === "delivered";
  return false;
}

export function getMarketplaceOrderStatusLabel(status: MarketOrderStatus): string {
  const labels: Record<MarketOrderStatus, string> = {
    pending: "অপেক্ষমাণ",
    accepted: "গৃহীত",
    preparing: "প্রস্তুত করা হচ্ছে",
    shipped: "পাঠানো হয়েছে",
    delivered: "ডেলিভারি সম্পন্ন",
    cancelled: "বাতিল",
  };
  return labels[status];
}

function asText(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function normalizeMobile(value: string): string | null {
  const digits = value.replace(/[\s()-]/g, "");
  if (/^01[3-9]\d{8}$/.test(digits)) return digits;
  if (/^8801[3-9]\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^\+8801[3-9]\d{8}$/.test(digits)) return `0${digits.slice(4)}`;
  return null;
}

export function normalizeMarketplaceOrder(
  id: string,
  value: unknown,
): MarketplaceOrder {
  const raw = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
  const legacyStatus = asText(raw.status).toLowerCase();
  const stagedStatus = asText(raw.fulfillmentStatus).toLowerCase();
  const rawStatus = legacyStatus === "delivered" || legacyStatus === "cancelled"
    ? legacyStatus
    : statuses.includes(stagedStatus as MarketOrderStatus) ? stagedStatus : legacyStatus;
  const status: MarketOrderStatus = statuses.includes(rawStatus as MarketOrderStatus)
    ? (rawStatus as MarketOrderStatus)
    : "pending";
  const parsedQuantity = Number(raw.quantity);
  const parsedTime = Number(raw.time ?? raw.timestamp);
  const deliveryMethod: MarketplaceDeliveryMethod = raw.deliveryMethod === "pickup" ? "pickup" : "delivery";
  const paymentMethod: MarketplacePaymentMethod = raw.paymentMethod === "pay_on_pickup"
    ? "pay_on_pickup"
    : deliveryMethod === "pickup" ? "pay_on_pickup" : "cash_on_delivery";
  const rawHistory = Array.isArray(raw.statusHistory)
    ? raw.statusHistory
    : raw.statusHistory && typeof raw.statusHistory === "object"
      ? Object.values(raw.statusHistory as Record<string, unknown>)
      : undefined;
  const statusHistory = rawHistory
    ? rawHistory.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      const entryStatus = asText(item.status).toLowerCase() as MarketOrderStatus;
      const time = Number(item.time);
      if (!statuses.includes(entryStatus) || !Number.isFinite(time)) return [];
      return [{ status: entryStatus, time, byUid: asText(item.byUid) }];
    })
    : undefined;

  return {
    id,
    productId: asText(raw.productId),
    productTitle: asText(raw.productTitle) || "পণ্য",
    productPrice: asText(raw.productPrice) || "দাম উল্লেখ নেই",
    productImage: asText(raw.productImage),
    sellerUid: asText(raw.sellerUid),
    sellerName: asText(raw.sellerName) || "বিক্রেতা",
    buyerUid: asText(raw.buyerUid),
    buyerName: asText(raw.buyerName) || "ক্রেতা",
    buyerPhone: asText(raw.buyerPhone),
    buyerAddress: asText(raw.buyerAddress || raw.deliveryAddress),
    quantity: Number.isFinite(parsedQuantity) && parsedQuantity >= 1 ? Math.floor(parsedQuantity) : 1,
    status,
    fulfillmentStatus: status,
    time: Number.isFinite(parsedTime) ? parsedTime : 0,
    deliveryMethod,
    paymentMethod,
    ...(statusHistory ? { statusHistory } : {}),
    orderGroupId: asText(raw.orderGroupId) || undefined,
    totalPrice: Number.isFinite(Number(raw.totalPrice)) ? Number(raw.totalPrice) : undefined,
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : undefined,
  };
}

export function buildMarketplaceOrderPayload(
  input: MarketplaceOrderInput,
  timestamp = Date.now(),
): Omit<MarketplaceOrder, "id"> {
  const buyerName = input.buyerName.trim();
  const buyerPhone = normalizeMobile(input.buyerPhone.trim());
  const buyerAddress = input.buyerAddress.trim();
  const quantity = Math.floor(Number(input.quantity));
  const deliveryMethod = input.deliveryMethod ?? "delivery";
  const paymentMethod = input.paymentMethod ?? (deliveryMethod === "pickup" ? "pay_on_pickup" : "cash_on_delivery");

  if (!buyerName || !buyerAddress) {
    throw new Error("নাম, ফোন এবং ডেলিভারি ঠিকানা দিন।");
  }
  if (!buyerPhone) throw new Error("সঠিক বাংলাদেশি মোবাইল নম্বর দিন।");
  if (!input.buyerUid || !input.sellerUid) {
    throw new Error("ক্রেতা ও বিক্রেতার account শনাক্ত করা যায়নি।");
  }
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new Error("পণ্যের সঠিক পরিমাণ দিন।");
  }
  if (deliveryMethod !== "delivery" && deliveryMethod !== "pickup") {
    throw new Error("ডেলিভারির পদ্ধতি সঠিক নয়।");
  }
  if (paymentMethod !== "cash_on_delivery" && paymentMethod !== "pay_on_pickup") {
    throw new Error("পেমেন্ট পদ্ধতি সঠিক নয়।");
  }

  return {
    productId: input.productId,
    productTitle: input.productTitle,
    productPrice: input.productPrice,
    productImage: input.productImage,
    sellerUid: input.sellerUid,
    sellerName: input.sellerName,
    buyerUid: input.buyerUid,
    buyerName,
    buyerPhone,
    buyerAddress,
    quantity,
    status: "pending",
    fulfillmentStatus: "pending",
    time: timestamp,
    deliveryMethod,
    paymentMethod,
    ...(input.statusHistory ? { statusHistory: input.statusHistory } : {}),
  };
}
