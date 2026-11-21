const MAX_ITEMS = 20;
const MAX_QUANTITY_PER_ITEM = 1000;
const MAX_TOTAL_QUANTITY = 5000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 160;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PRICE = 100_000_000;
const BD_MOBILE = /^(?:01[3-9]\d{8}|8801[3-9]\d{8}|\+8801[3-9]\d{8})$/;

function text(value, maxLength) {
  if (typeof value !== "string") return "";
  const result = value.trim();
  return result.length <= maxLength ? result : "";
}

function normalizeMobile(value) {
  const compact = String(value || "").replace(/[\s()-]/g, "");
  if (!BD_MOBILE.test(compact)) return "";
  if (compact.startsWith("+880")) return `0${compact.slice(4)}`;
  if (compact.startsWith("880")) return `0${compact.slice(3)}`;
  return compact;
}

function parsePrice(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 && value <= MAX_PRICE ? value : null;
  }
  if (typeof value !== "string") return null;
  const compact = value.trim().replace(/,/g, "");
  if (!/^\d+$/.test(compact)) return null;
  const number = Number(compact);
  return Number.isSafeInteger(number) && number > 0 && number <= MAX_PRICE ? number : null;
}

function parseStock(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= 10_000_000 ? number : undefined;
}

function normalizeCheckoutInput(data) {
  const rawItems = Array.isArray(data?.items) ? data.items : [];
  if (rawItems.length < 1 || rawItems.length > MAX_ITEMS) throw new Error("কার্টে ১ থেকে ২০টি পণ্য থাকতে হবে।");
  const buyerName = text(data?.buyerName, 160);
  const buyerPhone = normalizeMobile(data?.buyerPhone);
  const buyerAddress = text(data?.buyerAddress, 500);
  const deliveryMethod = data?.deliveryMethod;
  const paymentMethod = data?.paymentMethod;
  const idempotencyKey = text(data?.idempotencyKey, MAX_IDEMPOTENCY_KEY_LENGTH);
  if (!buyerName || !buyerPhone || !buyerAddress) throw new Error("নাম, ফোন এবং ডেলিভারি ঠিকানা দিন।");
  if (deliveryMethod !== "delivery" && deliveryMethod !== "pickup") throw new Error("ডেলিভারির পদ্ধতি সঠিক নয়।");
  if (paymentMethod !== (deliveryMethod === "pickup" ? "pay_on_pickup" : "cash_on_delivery")) throw new Error("পেমেন্ট পদ্ধতি সঠিক নয়।");
  if (!/^[A-Za-z0-9:_-]{8,160}$/.test(idempotencyKey)) throw new Error("Checkout request key সঠিক নয়।");
  const items = rawItems.map((item) => {
    const productId = text(item?.productId, 160);
    const quantity = Number(item?.quantity);
    if (!productId || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_ITEM) throw new Error("পণ্যের quantity সঠিক নয়।");
    return { productId, quantity };
  });
  if (new Set(items.map((item) => item.productId)).size !== items.length) throw new Error("একই পণ্য একাধিকবার checkout করা যাবে না।");
  if (items.reduce((total, item) => total + item.quantity, 0) > MAX_TOTAL_QUANTITY) throw new Error("মোট পণ্যের quantity সীমার বেশি।");
  return { buyerName, buyerPhone, buyerAddress, deliveryMethod, paymentMethod, idempotencyKey, items };
}

function getProductSnapshot(productId, product, shop, seller) {
  if (!product || typeof product !== "object") throw new Error("পণ্যটি আর পাওয়া যাচ্ছে না।");
  const sellerUid = text(product.uid, 160);
  const shopUid = text(shop?.uid, 160);
  if (!sellerUid || !shop || shopUid !== sellerUid || !seller || seller.status === "deactivated" || seller.status === "deleted") throw new Error("পণ্যের বিক্রেতা account সঠিক নয়।");
  if (sellerUid === seller.__buyerUid) throw new Error("নিজের পণ্যে অর্ডার করা যাবে না।");
  const availability = String(product.availability || "available").toLowerCase();
  if (availability === "unavailable" || availability === "paused") throw new Error("পণ্যটি বর্তমানে পাওয়া যাচ্ছে না।");
  const price = parsePrice(product.price);
  if (price === null) throw new Error("পণ্যের দাম সঠিক নয়।");
  const stock = parseStock(product.stock);
  if (stock === undefined) throw new Error("পণ্যের stock তথ্য সঠিক নয়।");
  return {
    productId,
    sellerUid,
    sellerName: text(product.seller, 160) || text(seller.name, 160) || "বিক্রেতা",
    productTitle: text(product.title, 240) || "পণ্য",
    productImage: text(product.image, 1000) || (Array.isArray(product.images) ? text(product.images[0], 1000) : ""),
    price,
    stock,
    availability,
    stockManaged: stock !== null,
    shopId: text(product.shopId, 160),
  };
}

function buildServerOrder({ orderId, orderGroupId, buyerUid, buyer, item, timestamp }) {
  const totalPrice = item.price * item.quantity;
  return {
    productId: item.productId,
    productTitle: item.productTitle,
    productPrice: String(item.price),
    productImage: item.productImage,
    sellerUid: item.sellerUid,
    sellerName: item.sellerName,
    buyerUid,
    buyerName: buyer.buyerName,
    buyerPhone: buyer.buyerPhone,
    buyerAddress: buyer.buyerAddress,
    quantity: item.quantity,
    totalPrice,
    orderGroupId,
    deliveryMethod: buyer.deliveryMethod,
    paymentMethod: buyer.paymentMethod,
    status: "pending",
    fulfillmentStatus: "pending",
    time: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    statusHistory: [{ status: "pending", time: timestamp, byUid: buyerUid }],
    source: "server_checkout",
    idempotencyKey: buyer.idempotencyKey,
    orderId,
  };
}

module.exports = {
  IDEMPOTENCY_TTL_MS,
  MAX_ITEMS,
  MAX_QUANTITY_PER_ITEM,
  buildServerOrder,
  getProductSnapshot,
  normalizeCheckoutInput,
  normalizeMobile,
  parsePrice,
  parseStock,
};
