import { httpsCallable } from "firebase/functions";
import { pathargataFunctions } from "@/lib/pathargata-firebase";

export type AiCard = {
  type: "directory" | "product" | "order" | "notification" | "service";
  data: Record<string, unknown>;
};

export type AiAction = {
  id: string;
  label: string;
  kind: "open_route" | "call" | "map" | "retry" | "open_blood_request" | "confirm_order";
  payload: Record<string, string>;
};

export type AiAssistantResponse = {
  text: string;
  intent: "answer" | "search_result" | "navigation" | "clarification" | "error" | "blood_request_draft" | "order_confirmation";
  cards: AiCard[];
  actions: AiAction[];
};

type AiAssistantRequest = {
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

const callAiAssistant = httpsCallable<AiAssistantRequest, AiAssistantResponse>(
  pathargataFunctions,
  "aiAssistant",
);
const createBloodRequestCall = httpsCallable<Record<string, string>, { requestId: string; trackingId?: string; duplicate?: boolean }>(
  pathargataFunctions,
  "createBloodRequest",
);
const acceptMarketplaceOrderCall = httpsCallable<{ orderId: string; idempotencyKey: string }, { orderId: string; status: string; alreadyApplied?: boolean }>(
  pathargataFunctions,
  "acceptMarketplaceOrder",
);

function asResponse(value: unknown): AiAssistantResponse {
  if (!value || typeof value !== "object") {
    throw new Error("AI response পাওয়া যায়নি।");
  }
  const response = value as Partial<AiAssistantResponse>;
  if (typeof response.text !== "string") {
    throw new Error("AI response সঠিক format-এ নেই।");
  }
  return {
    text: response.text,
    intent: response.intent || "answer",
    cards: Array.isArray(response.cards) ? response.cards.filter(Boolean) : [],
    actions: Array.isArray(response.actions) ? response.actions.filter(Boolean) : [],
  };
}

export async function askAiAssistant(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = [],
) {
  const result = await callAiAssistant({
    message: message.trim().slice(0, 500),
    history: history.slice(-8).map((item) => ({
      role: item.role,
      content: item.content.slice(0, 500),
    })),
  });
  return asResponse(result.data);
}

export type CreateBloodRequestInput = {
  bloodGroup: string;
  hospital: string;
  area: string;
  units: string;
  urgency: string;
  neededAt: string;
  contact: string;
  patientName: string;
  details: string;
};

export async function createBloodRequest(input: CreateBloodRequestInput) {
  const result = await createBloodRequestCall({
    ...input,
    idempotencyKey: `blood-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  });
  return result.data;
}

export async function acceptMarketplaceOrder(orderId: string) {
  const result = await acceptMarketplaceOrderCall({
    orderId,
    idempotencyKey: `order-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  });
  return result.data;
}
