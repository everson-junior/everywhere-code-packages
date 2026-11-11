window.__ModuleLoader__.load({ id: "@everywhere-harness/client-ui-chat-totvs", factory: function(require) { const module = { exports: {} }; const exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/totvs-entry.ts
var totvs_entry_exports = {};
__export(totvs_entry_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(totvs_entry_exports);

// src/client/document-identity.ts
function record(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Expected a manifest object");
  }
  return value;
}
function rebaseManifest(manifest, base) {
  const rebase = (entry, key, from = base) => {
    if (!(key in entry)) return;
    if (typeof entry[key] !== "string") throw new TypeError(`Invalid manifest ${key}`);
    entry[key] = new URL(entry[key], from).href;
  };
  const entries = (entry, key, visit) => {
    if (!(key in entry)) return;
    const items = entry[key];
    if (!Array.isArray(items)) throw new TypeError(`Invalid manifest ${key}`);
    for (const item of items) visit(record(item));
  };
  const images = (entry, key) => entries(entry, key, (image) => rebase(image, "src"));
  for (const key of ["start_url", "scope"]) rebase(manifest, key);
  const start = typeof manifest.start_url === "string" ? manifest.start_url : base;
  rebase(manifest, "id", `${new URL(start).origin}/`);
  images(manifest, "icons");
  images(manifest, "screenshots");
  entries(manifest, "shortcuts", (shortcut) => {
    rebase(shortcut, "url");
    images(shortcut, "icons");
  });
  entries(manifest, "file_handlers", (handler) => {
    rebase(handler, "action");
    images(handler, "icons");
  });
  entries(manifest, "protocol_handlers", (handler) => rebase(handler, "url"));
  entries(manifest, "related_applications", (app) => rebase(app, "url"));
  if ("share_target" in manifest) rebase(record(manifest.share_target), "action");
  if ("serviceworker" in manifest) {
    const worker = record(manifest.serviceworker);
    rebase(worker, "src");
    rebase(worker, "scope");
  }
}
function installDocumentIdentity(target, css, adapters = {}, options = {}) {
  const {
    pluginId = "@everywhere-harness/client-ui-chat",
    applicationName = "EveryWhere Harness",
    shortName = "EWH",
    errorLabel = "Everywhere application identity failed"
  } = options;
  const style = target.createElement("style");
  style.dataset.plugin = pluginId;
  style.textContent = css;
  target.head.append(style);
  const existingMeta = target.querySelector('meta[name="apple-mobile-web-app-title"]');
  const meta = existingMeta ?? target.createElement("meta");
  const previousContent = meta.getAttribute("content");
  meta.name = "apple-mobile-web-app-title";
  meta.content = shortName;
  if (!existingMeta) target.head.append(meta);
  const manifestLink = target.querySelector('link[rel~="manifest"]');
  const previousHref = manifestLink?.getAttribute("href");
  const controller = new AbortController();
  const urls = adapters.urls ?? globalThis.URL;
  let ownedUrl;
  let active = true;
  if (manifestLink && previousHref !== null && previousHref !== void 0) {
    const manifestUrl = manifestLink.href;
    void (async () => {
      try {
        const request = adapters.fetch ?? globalThis.fetch;
        const response = await request(manifestUrl, {
          signal: controller.signal,
          credentials: manifestLink.crossOrigin === "use-credentials" ? "include" : "same-origin"
        });
        if (!active) return;
        if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);
        const manifest = record(await response.json());
        if (!active || manifestLink.getAttribute("href") !== previousHref) return;
        rebaseManifest(manifest, response.url || manifestUrl);
        manifest.name = applicationName;
        manifest.short_name = shortName;
        ownedUrl = urls.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }));
        manifestLink.href = ownedUrl;
      } catch (error) {
        if (controller.signal.aborted) return;
        if (adapters.onError) adapters.onError(error);
        else console.error(errorLabel, error);
      }
    })();
  }
  return () => {
    if (!active) return;
    active = false;
    controller.abort();
    style.remove();
    if (meta.getAttribute("content") === shortName) {
      if (!existingMeta) meta.remove();
      else if (previousContent === null) meta.removeAttribute("content");
      else meta.setAttribute("content", previousContent);
    }
    if (ownedUrl !== void 0) {
      if (manifestLink?.getAttribute("href") === ownedUrl) manifestLink.setAttribute("href", previousHref);
      urls.revokeObjectURL(ownedUrl);
    }
  };
}

// src/client/DocumentTitle.tsx
var import_react = require("react");
function BrandedDocumentTitle({ useSessions, usePanelInfo, brandTitle }) {
  const showSessionTitle = usePanelInfo((info) => info.activePanelId === null);
  const title = useSessions((state) => Object.values(state.byId).find((session) => (session.retainedBy.mainView ?? 0) > 0)?.title);
  (0, import_react.useEffect)(() => {
    const previousTitle = document.title;
    const nextTitle = showSessionTitle && title !== void 0 ? `${title} \u2014 ${brandTitle}` : brandTitle;
    document.title = nextTitle;
    return () => {
      if (document.title === nextTitle) document.title = previousTitle;
    };
  }, [brandTitle, showSessionTitle, title]);
  return null;
}

// src/client/totvs-visuals.tsx
var import_react2 = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var ACTIVITY_PATH = "M3.173 0.584C6.937 3.809 11.24 3.809 15.005 0.584c.118-.098.289-.098.4.014.112.112.112.282.014.4-3.226 3.764-3.226 8.066 0 11.83l-12.246-12.244Zm12.456 13.249a12.2 12.2 0 0 0-1.4-1.209c-3.574-2.594-7.548-2.39-11.056.618a.28.28 0 0 1-.4-.013.28.28 0 0 1-.013-.4C5.768 9.322 5.972 5.348 3.377 1.775A12.2 12.2 0 0 0 2.168.374C1.367-.427 0 .144 0 1.274v13.458C0 15.435.572 16 1.268 16h13.46c1.13 0 1.696-1.366.901-2.167Z";
function ActivityArtwork({ size, className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "svg",
    {
      width: size,
      height: size,
      className,
      viewBox: "0 0 16 16",
      fill: "currentColor",
      "aria-hidden": "true",
      focusable: "false",
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: ACTIVITY_PATH })
    }
  );
}
function FloatingPlus({ className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className, viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", focusable: "false", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 3v18M3 12h18", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round" }) });
}
function TotvsHeroMark({ size }) {
  const [hovering, setHovering] = (0, import_react2.useState)(false);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "span",
    {
      className: "totvs-chat-hero",
      "aria-hidden": "true",
      "data-hovered": hovering ? "true" : "false",
      onPointerEnter: (event) => {
        setHovering(event.pointerType !== "touch");
      },
      onPointerLeave: () => {
        setHovering(false);
      },
      onPointerCancel: () => {
        setHovering(false);
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActivityArtwork, { size: Math.max(52, size), className: "totvs-chat-hero-artwork" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "totvs-chat-floating-pluses", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FloatingPlus, { className: "totvs-chat-floating-plus totvs-chat-floating-plus-1" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FloatingPlus, { className: "totvs-chat-floating-plus totvs-chat-floating-plus-2" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FloatingPlus, { className: "totvs-chat-floating-plus totvs-chat-floating-plus-3" })
        ] })
      ]
    }
  );
}
function TotvsSidebarMark({ size }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActivityArtwork, { size, className: "totvs-chat-sidebar-mark" });
}
function TotvsBrandName() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "totvs-chat-brand-name", "aria-label": "TOTVS ENG V&D CODE", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "totvs-chat-wordmark-primary", children: "TOTVS ENG V&D" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "totvs-chat-wordmark-badge", children: "CODE" })
  ] });
}
function TotvsRunningMark() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "totvs-chat-running", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActivityArtwork, { size: 16, className: "totvs-chat-running-symbol" }) });
}

// src/client/totvs-styles.css
var totvs_styles_default = ".totvs-chat-hero {\n  position: relative;\n  display: inline-flex;\n  flex: none;\n  align-items: center;\n  justify-content: center;\n  color: var(--totvs-chat-brand-ink, var(--dsw-alias-label-primary, currentColor));\n}\n\n.totvs-chat-hero-artwork,\n.totvs-chat-sidebar-mark {\n  display: block;\n  flex: none;\n  overflow: visible;\n  transform-origin: 50% 50%;\n  color: var(--totvs-chat-brand-ink, var(--dsw-alias-label-primary, currentColor));\n}\n\n.totvs-chat-floating-pluses {\n  display: none;\n  position: absolute;\n  top: 50%;\n  left: 50%;\n  width: 0;\n  height: 0;\n  pointer-events: none;\n  overflow: visible;\n}\n\n.totvs-chat-floating-plus {\n  position: absolute;\n  color: var(--totvs-chat-plus-color, #00a6a6);\n  filter: drop-shadow(0 2px 5px var(--totvs-chat-plus-shadow, rgba(0, 166, 166, 0.5)));\n  opacity: 0;\n  transform: translate(-50%, -50%) scale(0);\n}\n\n.totvs-chat-floating-plus-1 { width: 14px; height: 14px; }\n.totvs-chat-floating-plus-2 { width: 11px; height: 11px; }\n.totvs-chat-floating-plus-3 { width: 13px; height: 13px; }\n\n@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) and (forced-colors: none) {\n  .totvs-chat-hero[data-hovered='true'] .totvs-chat-hero-artwork {\n    animation: totvs-chat-hero-heartbeat-rotate 1.2s ease-in-out infinite;\n    filter: drop-shadow(0 0 8px var(--totvs-chat-hero-glow, rgba(0, 166, 166, 0.45)));\n  }\n\n  .totvs-chat-hero[data-hovered='true'] .totvs-chat-floating-pluses { display: block; }\n  .totvs-chat-hero[data-hovered='true'] .totvs-chat-floating-plus-1 { animation: totvs-chat-float-plus-1 1.5s ease-out infinite; }\n  .totvs-chat-hero[data-hovered='true'] .totvs-chat-floating-plus-2 { animation: totvs-chat-float-plus-2 1.5s ease-out infinite 0.25s; }\n  .totvs-chat-hero[data-hovered='true'] .totvs-chat-floating-plus-3 { animation: totvs-chat-float-plus-3 1.5s ease-out infinite 0.5s; }\n}\n\n.totvs-chat-brand-name {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  min-width: 0;\n  max-width: 100%;\n  color: var(--totvs-chat-brand-ink, var(--dsw-alias-label-primary, currentColor));\n  white-space: nowrap;\n  font-family: var(--dsw-font-family-brand), 'Montserrat', sans-serif;\n  font-size: 10.5px;\n  font-weight: 700;\n  letter-spacing: 0.25px;\n  line-height: 1;\n}\n\n.totvs-chat-wordmark-primary {\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.totvs-chat-wordmark-badge {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  min-height: 14px;\n  padding: 1px 4px;\n  border-radius: 2px;\n  color: var(--totvs-chat-brand-inverted, var(--dsw-alias-label-primary-inverted, Canvas));\n  background: var(--totvs-chat-brand-ink, var(--dsw-alias-label-primary, currentColor));\n  font-size: 8px;\n  letter-spacing: 0.5px;\n}\n\n.totvs-chat-running {\n  position: relative;\n  display: inline-flex;\n  flex: none;\n  width: calc(14px + var(--dsh-content-font-delta, 0px));\n  height: calc(14px + var(--dsh-content-font-delta, 0px));\n  contain: strict;\n  overflow: hidden;\n}\n\n.totvs-chat-running-symbol {\n  display: block;\n  position: absolute;\n  inset: 0;\n  width: 100%;\n  height: 100%;\n  animation: totvs-chat-running-pulse-rotate 1.2s ease-in-out infinite;\n  transform-origin: 50% 50%;\n}\n\n@keyframes totvs-chat-hero-heartbeat-rotate {\n  0%, 28%, 70%, 100% { transform: rotate(0deg) scale(1); }\n  14% { transform: rotate(6deg) scale(1.14); }\n  42% { transform: rotate(-6deg) scale(1.14); }\n}\n\n@keyframes totvs-chat-float-plus-1 {\n  0% { opacity: 0; transform: translate(-50%, -10px) scale(0.3) rotate(0deg); }\n  20% { opacity: 0.95; transform: translate(-90%, -24px) scale(1) rotate(70deg); }\n  80% { opacity: 0.8; transform: translate(-130%, -46px) scale(1.05) rotate(220deg); }\n  100% { opacity: 0; transform: translate(-150%, -60px) scale(0.8) rotate(320deg); }\n}\n\n@keyframes totvs-chat-float-plus-2 {\n  0% { opacity: 0; transform: translate(-50%, -10px) scale(0.3) rotate(0deg); }\n  20% { opacity: 0.95; transform: translate(-40%, -26px) scale(1) rotate(-60deg); }\n  80% { opacity: 0.8; transform: translate(-30%, -52px) scale(1.05) rotate(-210deg); }\n  100% { opacity: 0; transform: translate(-20%, -68px) scale(0.75) rotate(-315deg); }\n}\n\n@keyframes totvs-chat-float-plus-3 {\n  0% { opacity: 0; transform: translate(-50%, -10px) scale(0.3) rotate(0deg); }\n  20% { opacity: 0.95; transform: translate(20%, -22px) scale(1) rotate(80deg); }\n  80% { opacity: 0.8; transform: translate(50%, -44px) scale(1.1) rotate(230deg); }\n  100% { opacity: 0; transform: translate(70%, -58px) scale(0.8) rotate(340deg); }\n}\n\n@keyframes totvs-chat-running-pulse-rotate {\n  0%, 70%, 100% { transform: rotate(0deg) scale(0.9); opacity: 0.85; }\n  14% { transform: rotate(8deg) scale(1.15); opacity: 1; }\n  28% { transform: rotate(0deg) scale(0.95); opacity: 0.9; }\n  42% { transform: rotate(-8deg) scale(1.12); opacity: 1; }\n}\n\n@media (prefers-reduced-motion: reduce), (forced-colors: active) {\n  .totvs-chat-hero-artwork,\n  .totvs-chat-floating-plus,\n  .totvs-chat-running-symbol {\n    animation: none;\n    transition: none;\n    filter: none;\n    transform: none;\n  }\n\n  .totvs-chat-floating-pluses { display: none; }\n}\n\n@media (forced-colors: active) {\n  .totvs-chat-hero,\n  .totvs-chat-hero-artwork,\n  .totvs-chat-sidebar-mark,\n  .totvs-chat-brand-name,\n  .totvs-chat-running { color: CanvasText; }\n\n  .totvs-chat-wordmark-badge {\n    color: Canvas;\n    background: CanvasText;\n  }\n}\n";

// src/client/totvs.tsx
var PRODUCT_TITLE = "TOTVS ENG V&D CODE";
function TotvsDocumentTitle(props) {
  return BrandedDocumentTitle({ ...props, brandTitle: PRODUCT_TITLE });
}
function applyTotvs(ctx) {
  ctx.effect(() => installDocumentIdentity(document, totvs_styles_default, {}, {
    pluginId: "@everywhere-harness/client-ui-chat/totvs",
    applicationName: PRODUCT_TITLE,
    shortName: "TOTVS CODE",
    errorLabel: "TOTVS application identity failed"
  }));
  ctx.slots.inject("shell.document.title", () => ctx.slots.register({
    name: "shell.document.title",
    priority: -90
  }, TotvsDocumentTitle));
  ctx.slots.inject("sidebar.brand.mark", () => ctx.slots.register({
    name: "sidebar.brand.mark",
    priority: -90
  }, TotvsSidebarMark));
  ctx.slots.inject("sidebar.brand.name", () => ctx.slots.register({
    name: "sidebar.brand.name",
    priority: -90
  }, TotvsBrandName));
  ctx.slots.inject("conversation.hero.brand.mark", () => ctx.slots.register({
    name: "conversation.hero.brand.mark",
    priority: -90
  }, TotvsHeroMark));
  ctx.slots.inject("conversation.chat.running.icon", () => ctx.slots.register({
    name: "conversation.chat.running.icon",
    priority: -90
  }, TotvsRunningMark));
}

// src/client/totvs-entry.ts
var inject = ["slots"];
function apply(ctx) {
  applyTotvs(ctx);
}
return module.exports; } });
