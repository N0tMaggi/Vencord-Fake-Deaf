import { addGlobalContextMenuPatch, removeGlobalContextMenuPatch, type GlobalContextMenuPatchCallback } from "@api/ContextMenu";
import { Menu } from "@webpack/common";


const textDecoder = new TextDecoder("utf-8");
const textEncoder = new TextEncoder();

let fakeDeafenEnabled = false;

// References for the native deafen control.
let currentDeafenButton: HTMLElement | null = null;
let deafenButtonObserver: MutationObserver | null = null;

let voiceMenuPatch: GlobalContextMenuPatchCallback | null = null;

const navigationEventHandlers = new Map<keyof WindowEventMap, EventListener>();

let isInitialized = false;
let pendingDomReadyListener: (() => void) | null = null;
let styleElement: HTMLStyleElement | null = null;

// WebSocket patch keeps outgoing state aligned with the fake deafening flag.
const originalWebSocketSend = WebSocket.prototype.send;
WebSocket.prototype.send = function sendPatched(
    this: WebSocket,
    data: Parameters<typeof originalWebSocketSend>[0]
): ReturnType<typeof originalWebSocketSend> {
    try {
        if (data instanceof ArrayBuffer) {
            const decoded = textDecoder.decode(data);
            if (fakeDeafenEnabled && decoded.includes("self_deaf")) {
                const modifiedData = decoded.replace(
                    /"self_mute":(true|false)/g,
                    '"self_mute":true'
                );
                return originalWebSocketSend.call(
                    this,
                    textEncoder.encode(modifiedData)
                );
            }
        }

        return originalWebSocketSend.call(this, data);
    } catch (error) {
        console.error("WebSocket Error:", error);
        return originalWebSocketSend.call(this, data);
    }
};

// Toggle fake deafening and propagate the UI feedback.
export function toggleDeafenState(): void {
    try {
        fakeDeafenEnabled = !fakeDeafenEnabled;
        showStatusNotification();
        updateButtonAppearance();
    } catch (error) {
        console.error("Toggle Error:", error);
        showErrorNotification();
    }
}

const MENU_ITEM_ID = "vc-fake-deafen-toggle";

function applyButtonAppearance(target?: HTMLElement | null): void {
    const button = target ?? currentDeafenButton;
    if (!button) {
        return;
    }

    button.classList.add("vc-fake-deafen-control");
    button.classList.toggle("vc-fake-deafen-active", fakeDeafenEnabled);
    button.setAttribute("data-fake-deafen-active", fakeDeafenEnabled ? "true" : "false");
}

function resetButtonAppearance(button: HTMLElement | null): void {
    if (!button) {
        return;
    }

    button.classList.remove("vc-fake-deafen-active", "vc-fake-deafen-control");
    button.removeAttribute("data-fake-deafen-active");
}

function syncDeafenButtonReference(): void {
    const detected = findDeafenButton();

    if (!detected) {
        resetButtonAppearance(currentDeafenButton);
        currentDeafenButton = null;
        return;
    }

    if (currentDeafenButton !== detected) {
        resetButtonAppearance(currentDeafenButton);
        currentDeafenButton = detected;
    }

    applyButtonAppearance(detected);
}

function ensureVoiceMenuPatch(): void {
    if (voiceMenuPatch) {
        return;
    }

    voiceMenuPatch = (navId, children) => {
        if (!isVoiceSettingsMenu(navId, children)) {
            return;
        }

        if (hasFakeDeafenMenuItem(children)) {
            return;
        }

        const insertionIndex = findVoiceMenuInsertionIndex(children);
        const checkbox = (
            <Menu.MenuCheckboxItem
                id={MENU_ITEM_ID}
                key={MENU_ITEM_ID}
                label="Fake Deafen"
                checked={fakeDeafenEnabled}
                action={() => toggleDeafenState()}
            />
        );

        children.splice(insertionIndex, 0, checkbox);
    };

    addGlobalContextMenuPatch(voiceMenuPatch);
}

function teardownVoiceMenuPatch(): void {
    if (!voiceMenuPatch) {
        return;
    }

    removeGlobalContextMenuPatch(voiceMenuPatch);
    voiceMenuPatch = null;
}

function hasFakeDeafenMenuItem(children: Array<any>): boolean {
    let found = false;

    iterateMenuElements(children, element => {
        if (element?.props?.id === MENU_ITEM_ID) {
            element.props.checked = fakeDeafenEnabled;
            found = true;
        }
    });

    return found;
}

function isVoiceSettingsMenu(navId: string, children: Array<any>): boolean {
    const navHint = typeof navId === "string" ? navId.toLowerCase() : "";

    let hasSlider = false;
    let hasVoiceIndicator = false;

    iterateMenuElements(children, element => {
        if (hasSlider && hasVoiceIndicator) {
            return;
        }

        const id = typeof element?.props?.id === "string" ? element.props.id.toLowerCase() : "";
        const labelText = extractText(element?.props?.label ?? element?.props?.children);

        if (!hasSlider && (element?.type === Menu.MenuControlItem || element?.props?.control != null)) {
            hasSlider = true;
        }

        if (!hasVoiceIndicator) {
            if (
                id.includes("voice") ||
                id.includes("output") ||
                id.includes("device") ||
                id.includes("audio")
            ) {
                hasVoiceIndicator = true;
            } else if (labelText) {
                const lowered = labelText.toLowerCase();
                if (
                    lowered.includes("voice") ||
                    lowered.includes("output") ||
                    lowered.includes("input") ||
                    lowered.includes("audio") ||
                    lowered.includes("sprache") ||
                    lowered.includes("ausgabe")
                ) {
                    hasVoiceIndicator = true;
                }
            }
        }
    });

    if (hasSlider && hasVoiceIndicator) {
        return true;
    }

    return navHint.includes("voice") || navHint.includes("audio");
}

function findVoiceMenuInsertionIndex(children: Array<any>): number {
    for (let index = 0; index < children.length; index++) {
        const child = children[index];
        if (!child) {
            continue;
        }

        const labelText = extractText(child?.props?.label ?? child?.props?.children);
        if (!labelText) {
            continue;
        }

        const lowered = labelText.toLowerCase();
        if (
            lowered.includes("settings") ||
            lowered.includes("einstellungen")
        ) {
            return index;
        }
    }

    return children.length;
}

function iterateMenuElements(children: Array<any>, handler: (element: any) => void): void {
    for (const child of children) {
        if (child == null) {
            continue;
        }

        if (Array.isArray(child)) {
            iterateMenuElements(child, handler);
            continue;
        }

        handler(child);

        const subChildren = child.props?.children;
        if (subChildren == null) {
            continue;
        }

        if (Array.isArray(subChildren)) {
            iterateMenuElements(subChildren, handler);
        } else {
            iterateMenuElements([subChildren], handler);
        }
    }
}

function extractText(content: any): string {
    if (typeof content === "string") {
        return content;
    }

    if (typeof content === "number") {
        return content.toString();
    }

    if (Array.isArray(content)) {
        return content.map(extractText).join(" ").trim();
    }

    if (content && typeof content === "object") {
        if (typeof content.props?.children !== "undefined") {
            return extractText(content.props.children);
        }

        if (typeof content.props?.label !== "undefined") {
            return extractText(content.props.label);
        }
    }

    return "";
}
// Temporary notification to indicate state changes.
function showStatusNotification(): void {
    const notification = document.createElement("div");

    Object.assign(notification.style, {
        position: "fixed",
        bottom: "80px",
        right: "25px",
        padding: "12px 20px",
        background: fakeDeafenEnabled ? "#3a3f45" : "#2d2f33",
        color: fakeDeafenEnabled ? "#d34040" : "#43b581",
        borderRadius: "6px",
        boxShadow: "0 3px 10px rgba(0,0,0,0.2)",
        fontSize: "13px",
        fontWeight: "500",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        zIndex: "2147483646",
        animation: "slideIn 0.3s ease-out",
        opacity: "1",
        transition: "opacity 0.3s ease"
    });

    notification.innerHTML = `
        <div style="width:10px;height:10px;border-radius:50%;background:${
            fakeDeafenEnabled ? "#ed4245" : "#3ba55c"
        }"></div>
        ${fakeDeafenEnabled ? "Fake deafened active" : "Fake deafened disabled"}
    `;

    document.body.appendChild(notification);

    window.setTimeout(() => {
        notification.style.opacity = "0";
        window.setTimeout(() => notification.remove(), 300);
    }, 2000);
}


function updateButtonAppearance(): void {
    syncDeafenButtonReference();
}

// Simple fallback error toast for unexpected failures.
function showErrorNotification(): void {
    const err = document.createElement("div");
    err.textContent = "?? Script Error - Refresh the page!";

    Object.assign(err.style, {
        position: "fixed",
        top: "20px",
        right: "20px",
        background: "#ed4245",
        color: "white",
        padding: "12px 24px",
        borderRadius: "8px",
        zIndex: "2147483647",
        animation: "shake 0.5s ease-in-out"
    });

    document.body.appendChild(err);
    window.setTimeout(() => err.remove(), 3000);
}


function findDeafenButton(): HTMLElement | null {
    if (currentDeafenButton && document.contains(currentDeafenButton)) {
        return currentDeafenButton;
    }

    const candidates = Array.from(
        document.querySelectorAll<HTMLElement>('button[aria-label], [role="button"][aria-label]')
    );

    const keywords = ["deafen", "self deaf", "deaf", "taub"];

    for (const candidate of candidates) {
        const label = candidate.getAttribute("aria-label");
        if (!label) {
            continue;
        }
        const normalized = label.toLowerCase();
        if (keywords.some(keyword => normalized.includes(keyword))) {
            return candidate;
        }
    }

    return null;
}

// Mutation observer keeps pace with Discord re-render cycles.
function ensureDeafenObserver(): void {
    if (deafenButtonObserver) {
        return;
    }

    deafenButtonObserver = new MutationObserver(() => {
        syncDeafenButtonReference();
    });

    deafenButtonObserver.observe(document.body, {
        subtree: true,
        childList: true
    });

    syncDeafenButtonReference();
}

// Handle Discord's SPA navigation so bindings stay fresh.
function registerNavigationHandlers(): void {
    if (navigationEventHandlers.size > 0) {
        return;
    }

    const softNavigationHandler: EventListener = () => {
        resetButtonAppearance(currentDeafenButton);
        currentDeafenButton = null;
        window.setTimeout(() => syncDeafenButtonReference(), 100);
    };

    const hardNavigationHandler: EventListener = () => {
        destroy();
    };

    navigationEventHandlers.set("popstate", softNavigationHandler);
    window.addEventListener("popstate", softNavigationHandler);

    navigationEventHandlers.set("hashchange", softNavigationHandler);
    window.addEventListener("hashchange", softNavigationHandler);

    navigationEventHandlers.set("beforeunload", hardNavigationHandler);
    window.addEventListener("beforeunload", hardNavigationHandler);

    navigationEventHandlers.set("pagehide", hardNavigationHandler);
    window.addEventListener("pagehide", hardNavigationHandler);
}

// One-stop teardown used on hard navigations.
function destroy(): void {
    teardownVoiceMenuPatch();
    resetButtonAppearance(currentDeafenButton);
    currentDeafenButton = null;

    if (deafenButtonObserver) {
        deafenButtonObserver.disconnect();
        deafenButtonObserver = null;
    }

    navigationEventHandlers.forEach((handler, eventName) => {
        window.removeEventListener(eventName, handler);
    });

    navigationEventHandlers.clear();

    fakeDeafenEnabled = false;

    isInitialized = false;
}

// Entry point once the DOM is ready.
function initialize(): void {
    if (isInitialized || !document.body) {
        return;
    }

    isInitialized = true;

    try {
        ensureStyleTag();
        ensureVoiceMenuPatch();
        ensureDeafenObserver();
        registerNavigationHandlers();
    } catch (error) {
        console.error("Initialization Error:", error);
    }
}

// Shared animations and native button styling.
function ensureStyleTag(): void {
    if (styleElement && document.head.contains(styleElement)) {
        return;
    }

    if (!styleElement) {
        styleElement = document.createElement("style");
        styleElement.textContent = `
            .vc-fake-deafen-control {
                position: relative;
                transition: color 0.15s ease, transform 0.12s ease;
            }

            .vc-fake-deafen-control svg {
                transition: color 0.15s ease;
            }

            .vc-fake-deafen-control.vc-fake-deafen-active {
                color: var(--status-danger, #ed4245);
            }

            .vc-fake-deafen-control.vc-fake-deafen-active svg {
                color: inherit;
            }

            .vc-fake-deafen-control.vc-fake-deafen-active::after {
                content: "";
                position: absolute;
                inset: 2px;
                border-radius: inherit;
                border: 1px solid var(--status-danger, #ed4245);
                opacity: 0.8;
                pointer-events: none;
            }

            @keyframes slideIn {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
            }

            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-8px); }
                75% { transform: translateX(8px); }
            }
        `;
    }

    document.head.appendChild(styleElement);
}

export function startFakeDeafen(): void {
    ensureStyleTag();

    if (pendingDomReadyListener) {
        window.removeEventListener("DOMContentLoaded", pendingDomReadyListener);
        pendingDomReadyListener = null;
    }

    if (document.readyState === "complete" || document.readyState === "interactive") {
        initialize();
    } else {
        pendingDomReadyListener = () => {
            if (pendingDomReadyListener) {
                window.removeEventListener("DOMContentLoaded", pendingDomReadyListener);
                pendingDomReadyListener = null;
            }
            initialize();
        };

        window.addEventListener("DOMContentLoaded", pendingDomReadyListener);
    }
}

export function stopFakeDeafen(): void {
    if (pendingDomReadyListener) {
        window.removeEventListener("DOMContentLoaded", pendingDomReadyListener);
        pendingDomReadyListener = null;
    }

    destroy();

    if (styleElement?.isConnected) {
        styleElement.remove();
    }
    styleElement = null;
}

