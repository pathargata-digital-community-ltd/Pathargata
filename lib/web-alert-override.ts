import { Alert, Platform } from "react-native";

type WebAlertButton = {
  text?: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};

type WebAlertRequest = {
  title: string;
  message?: string;
  buttons: WebAlertButton[];
  cancelable: boolean;
};

const pending: WebAlertRequest[] = [];
let dialogOpen = false;

function closeDialog(
  overlay: HTMLDivElement,
  previousOverflow: string,
  previousFocus: HTMLElement | null,
  onClose?: () => void,
) {
  overlay.remove();
  document.body.style.overflow = previousOverflow;
  dialogOpen = false;
  try {
    onClose?.();
  } finally {
    if (previousFocus?.isConnected) previousFocus.focus();
    queueMicrotask(showNextDialog);
  }
}

function showNextDialog() {
  if (dialogOpen || typeof document === "undefined" || !document.body) return;
  const request = pending.shift();
  if (!request) return;
  dialogOpen = true;

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const previousOverflow = document.body.style.overflow;
  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    background: "rgba(5, 20, 14, 0.58)",
    backdropFilter: "blur(4px)",
  });

  const panel = document.createElement("section");
  panel.setAttribute("role", "alertdialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", request.title || "পাথরঘাটা ডিজিটাল");
  Object.assign(panel.style, {
    width: "min(100%, 420px)",
    boxSizing: "border-box",
    padding: "24px",
    border: "1px solid #dce8df",
    borderRadius: "22px",
    background: "#ffffff",
    color: "#10231b",
    boxShadow: "0 24px 72px rgba(0,0,0,.24)",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  });

  const title = document.createElement("h2");
  title.textContent = request.title || "পাথরঘাটা ডিজিটাল";
  Object.assign(title.style, { margin: "0", color: "#0b2d26", fontSize: "18px", lineHeight: "1.4", fontWeight: "800" });
  panel.appendChild(title);

  if (request.message) {
    const message = document.createElement("p");
    message.textContent = request.message;
    Object.assign(message.style, { margin: "10px 0 0", color: "#52645a", fontSize: "14px", lineHeight: "1.6", whiteSpace: "pre-wrap" });
    panel.appendChild(message);
  }

  const actions = document.createElement("div");
  Object.assign(actions.style, { display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "9px", marginTop: "22px" });
  const buttons = request.buttons.length ? request.buttons : [{ text: "ঠিক আছে" }];
  for (const item of buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.text || "ঠিক আছে";
    button.setAttribute("aria-label", item.text || "ঠিক আছে");
    const destructive = item.style === "destructive";
    const cancel = item.style === "cancel";
    Object.assign(button.style, {
      minHeight: "42px",
      padding: "10px 16px",
      border: cancel ? "1px solid #d7e1db" : "1px solid transparent",
      borderRadius: "12px",
      background: destructive ? "#b42318" : cancel ? "#f5f8f6" : "#15803d",
      color: cancel ? "#34483c" : "#ffffff",
      font: "600 14px/1.2 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      cursor: "pointer",
    });
    button.addEventListener("click", () => {
      closeDialog(overlay, previousOverflow, previousFocus, item.onPress);
    });
    actions.appendChild(button);
  }
  panel.appendChild(actions);
  overlay.appendChild(panel);
  document.body.style.overflow = "hidden";
  document.body.appendChild(overlay);
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!request.cancelable) return;
      event.preventDefault();
      const cancelButton = request.buttons.find((button) => button.style === "cancel");
      closeDialog(overlay, previousOverflow, previousFocus, cancelButton?.onPress);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(actions.querySelectorAll("button"));
    if (focusable.length < 2) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  actions.querySelector("button")?.focus();

  if (request.cancelable) {
    overlay.addEventListener("click", (event) => {
      if (event.target !== overlay) return;
      const cancelButton = request.buttons.find((button) => button.style === "cancel");
      closeDialog(overlay, previousOverflow, previousFocus, cancelButton?.onPress);
    });
  }
}

function showWebAlert(title: string, message?: string, buttons?: WebAlertButton[], options?: { cancelable?: boolean }) {
  pending.push({
    title: String(title ?? ""),
    message: message == null ? undefined : String(message),
    buttons: buttons ?? [],
    cancelable: Boolean(options?.cancelable),
  });
  queueMicrotask(showNextDialog);
}

export function installWebAlertOverride() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const alertObject = Alert as unknown as { alert: typeof showWebAlert };
  try {
    Object.defineProperty(alertObject, "alert", { configurable: true, writable: true, value: showWebAlert });
  } catch {
    try {
      alertObject.alert = showWebAlert;
    } catch {
      // If the runtime locks the module object, native behavior remains unchanged.
    }
  }
  return alertObject.alert === showWebAlert;
}
