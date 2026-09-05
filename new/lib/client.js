window.__ModuleLoader__.load({
	id: "dsh-we-wallpaper",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/WallpaperCard.tsx
		/**
		* The dynamic-wallpaper settings card, registered into the official plugin
		* configuration section (`settings.plugin.item`). Lists the local Wallpaper
		* Engine library with live previews, applies a selection through the
		* `we-wallpaper` settings scope, and drives the layer options (scrim /
		* translucency / fit).
		*
		* The card is a thin React view over the WallpaperCardController: the
		* injected face carries a HostObservable (bound to the `useWallpaper`
		* selector hook by the slot machinery) plus action callbacks.
		*/
		/** Controller: owns the state, talks to the shared store and the host API. */
		var WallpaperCardController = class {
			state = {
				loading: true,
				found: false,
				root: null,
				wallpapers: [],
				activeId: "",
				scrim: 25,
				translucency: 50,
				fit: "cover",
				sharpen: 40,
				sceneMode: "animated-first",
				repkgPath: "",
				error: null
			};
			listeners = /* @__PURE__ */ new Set();
			store;
			/** @param store - the shared wallpaper state store. */
			constructor(store) {
				this.store = store;
				store.subscribe(() => {
					this.resyncFromStore();
					this.publish();
				});
				this.resyncFromStore();
			}
			/** The face handed to the slot registration. */
			inject() {
				return {
					hooks: { wallpaper: this },
					select: (id) => this.select(id),
					refresh: () => {
						this.refresh();
					},
					setScrim: (value) => this.store.setScrim(value),
					setTranslucency: (value) => this.store.setTranslucency(value),
					setFit: (fit) => this.store.setFit(fit),
					setSharpen: (value) => this.store.setSharpen(value),
					setSceneMode: (value) => this.store.setSceneMode(value),
					setRePkgPath: (value) => this.store.setRePkgPath(value)
				};
			}
			getSnapshot() {
				return this.state;
			}
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			publish() {
				for (const listener of this.listeners) listener();
			}
			resyncFromStore() {
				const state = this.store.getSnapshot();
				this.state = {
					...this.state,
					activeId: state.selectedId,
					scrim: state.scrim,
					translucency: state.translucency,
					fit: state.fit,
					sharpen: state.sharpen,
					sceneMode: state.sceneMode,
					repkgPath: state.repkgPath
				};
			}
			/** Apply a wallpaper through the shared store ('' = official background). */
			select(id) {
				this.store.select(id);
			}
			/** Re-fetch the library from the host. */
			async refresh() {
				this.state = {
					...this.state,
					loading: true,
					error: null
				};
				this.publish();
				try {
					const data = await (await fetch("/api/we-wallpaper/list")).json();
					if (data.ok !== true) this.state = {
						...this.state,
						loading: false,
						error: data.error ?? "unknown-error"
					};
					else this.state = {
						...this.state,
						loading: false,
						found: data.found === true,
						root: data.root ?? null,
						wallpapers: Array.isArray(data.wallpapers) ? data.wallpapers : [],
						error: null
					};
				} catch (error) {
					this.state = {
						...this.state,
						loading: false,
						error: error instanceof Error ? error.message : String(error)
					};
				}
				this.publish();
			}
		};
		/** The type-badge key of one wallpaper. */
		function typeKey(type) {
			return `type.${type}`;
		}
		/** The source-badge key of one wallpaper. */
		function sourceKey(source) {
			return `source.${source}`;
		}
		/**
		* Render the card.
		* @param props - locale copy, the live state hook, and the action callbacks.
		*/
		function WallpaperCard(props) {
			const { t } = props;
			const state = props.useWallpaper((snapshot) => snapshot);
			const [query, setQuery] = (0, react.useState)("");
			const filtered = (0, react.useMemo)(() => {
				const needle = query.trim().toLowerCase();
				if (needle === "") return state.wallpapers;
				return state.wallpapers.filter((wallpaper) => wallpaper.title.toLowerCase().includes(needle) || wallpaper.id.toLowerCase().includes(needle));
			}, [state.wallpapers, query]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-we-card",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-we-card-head",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("card.title") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: props.refresh,
								children: t("card.refresh")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => props.select(""),
								title: t("card.clearHint"),
								children: t("card.clear")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-we-card-status",
						children: state.error !== null ? t("card.error", { error: state.error }) : state.found ? t("card.found", { root: state.root ?? "" }) : t("card.notFound")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-we-card-controls",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-we-card-control",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									htmlFor: "dsh-we-scrim",
									children: [
										t("card.option.scrim"),
										": ",
										state.scrim,
										"%"
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									id: "dsh-we-scrim",
									type: "range",
									min: 0,
									max: 100,
									step: 5,
									value: state.scrim,
									onChange: (event) => props.setScrim(Number(event.target.value))
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-we-card-control",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									htmlFor: "dsh-we-translucency",
									children: [
										t("card.option.translucency"),
										": ",
										state.translucency,
										"%"
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									id: "dsh-we-translucency",
									type: "range",
									min: 0,
									max: 90,
									step: 5,
									value: state.translucency,
									onChange: (event) => props.setTranslucency(Number(event.target.value))
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-we-card-control",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									htmlFor: "dsh-we-fit",
									children: t("card.option.fit")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									id: "dsh-we-fit",
									value: state.fit,
									onChange: (event) => props.setFit(event.target.value),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "cover",
										children: t("card.option.fit.cover")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "contain",
										children: t("card.option.fit.contain")
									})]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-we-card-control",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									htmlFor: "dsh-we-sharpen",
									title: t("card.option.sharpenHint"),
									children: [
										t("card.option.sharpen"),
										": ",
										state.sharpen,
										"%"
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									id: "dsh-we-sharpen",
									type: "range",
									min: 0,
									max: 100,
									step: 5,
									value: state.sharpen,
									onChange: (event) => props.setSharpen(Number(event.target.value))
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-we-card-control",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									htmlFor: "dsh-we-scene-mode",
									title: t("card.option.sceneModeHint"),
									children: t("card.option.sceneMode")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									id: "dsh-we-scene-mode",
									value: state.sceneMode,
									onChange: (event) => props.setSceneMode(event.target.value),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "animated-first",
										children: t("card.option.sceneMode.animated")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "static-hd",
										children: t("card.option.sceneMode.static")
									})]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-we-card-control",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									htmlFor: "dsh-we-repkg",
									title: t("card.option.repkgHint"),
									children: t("card.option.repkg")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									id: "dsh-we-repkg",
									type: "text",
									value: state.repkgPath,
									placeholder: "C:\\\\Tools\\\\RePKG.exe",
									onChange: (event) => props.setRePkgPath(event.target.value)
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-we-card-search",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "search",
							value: query,
							placeholder: t("card.search"),
							onChange: (event) => setQuery(event.target.value)
						})
					}),
					state.loading && state.wallpapers.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-we-card-empty",
						children: t("card.loading")
					}) : filtered.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-we-card-empty",
						children: state.wallpapers.length === 0 ? t("card.libraryEmpty") : t("card.empty")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-we-card-grid",
						children: filtered.map((wallpaper) => {
							const active = wallpaper.id === state.activeId;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-we-card-item",
								"data-active": active,
								role: "button",
								tabIndex: 0,
								title: `${wallpaper.title} (${t(typeKey(wallpaper.type))})`,
								onClick: () => props.select(wallpaper.id),
								onKeyDown: (event) => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										props.select(wallpaper.id);
									}
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
									className: "dsh-we-card-thumb",
									loading: "lazy",
									alt: wallpaper.title,
									src: `/api/we-wallpaper/preview/${encodeURIComponent(wallpaper.id)}`,
									onError: (event) => {
										const img = event.currentTarget;
										if (img.dataset.fallback === "true") return;
										img.dataset.fallback = "true";
										img.style.display = "none";
										const holder = document.createElement("div");
										holder.className = "dsh-we-card-thumb-empty";
										holder.textContent = wallpaper.title;
										img.insertAdjacentElement("afterend", holder);
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dsh-we-card-meta",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dsh-we-card-title",
										children: wallpaper.title
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-we-card-badges",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dsh-we-card-badge",
												children: t(typeKey(wallpaper.type))
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dsh-we-card-badge",
												children: t(sourceKey(wallpaper.source))
											}),
											active && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dsh-we-card-badge",
												children: t("card.active")
											}),
											wallpaper.activeOnDesktop && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dsh-we-card-badge",
												"data-hot": "true",
												children: t("card.desktop")
											})
										]
									})]
								})]
							}, wallpaper.id);
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/styles.ts
		/**
		* dsh-we-wallpaper client styles — injected as plain <style> tags by the
		* client apply() (no CSS modules in this bundle). Everything rides the
		* shell's --dsw-alias-* tokens (with neutral fallbacks) so the card matches
		* any base theme, and the layer keeps its own fixed positioning.
		*/
		/** The background layer element id (see src/client/layer.ts). */
		const LAYER_ID = "dsh-we-wallpaper-layer";
		/** Body attribute marking the plugin active (dispose removes it). */
		const BODY_ATTR = "data-dsh-we-wallpaper";
		/** Static CSS for the fixed background layer. */
		const LAYER_CSS = `#${LAYER_ID} {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  background: #000;
}
#${LAYER_ID} > video,
#${LAYER_ID} > img,
#${LAYER_ID} > iframe {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: var(--dsw-we-fit, cover);
  border: 0;
  background: transparent;
  /* The plugin-owned SVG sharpen filter; none when sharpen = 0. */
  filter: var(--dsh-we-filter, none);
}
#${LAYER_ID} > iframe {
  pointer-events: none;
}
body[${BODY_ATTR}] {
  background-color: #000;
}
`;
		/** Static CSS for the settings card. */
		const CARD_CSS = `.dsh-we-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 2px;
}
.dsh-we-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.dsh-we-card-status {
  font-size: 12px;
  opacity: 0.75;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.dsh-we-card-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px 16px;
}
.dsh-we-card-control {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsh-we-card-control label {
  font-size: 12px;
  opacity: 0.85;
}
.dsh-we-card-control input[type='range'] {
  width: 100%;
}
.dsh-we-card-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  opacity: 0.9;
  cursor: pointer;
}
.dsh-we-card-search input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(120, 130, 150, 0.35));
  background: var(--dsw-alias-bg-layer-2, rgba(240, 242, 246, 0.9));
  color: var(--dsw-alias-label-primary, #1c2430);
}
.dsh-we-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 10px;
  max-height: 420px;
  overflow-y: auto;
  padding: 2px;
}
.dsh-we-card-item {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid var(--dsw-alias-border-l2, rgba(120, 130, 150, 0.3));
  background: var(--dsw-alias-bg-layer-2, rgba(240, 242, 246, 0.9));
  cursor: pointer;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}
.dsh-we-card-item:hover {
  border-color: var(--dsw-alias-state-business-primary, #4d6bfe);
}
.dsh-we-card-item[data-active='true'] {
  border-color: var(--dsw-alias-state-business-primary, #4d6bfe);
  box-shadow: 0 0 0 1px var(--dsw-alias-state-business-primary, #4d6bfe);
}
.dsh-we-card-thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  display: block;
  background: #111;
}
.dsh-we-card-thumb-empty {
  width: 100%;
  aspect-ratio: 16 / 9;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  opacity: 0.6;
  background: #1a1f2b;
  color: #cfd6e4;
}
.dsh-we-card-meta {
  padding: 6px 8px 8px;
}
.dsh-we-card-title {
  font-size: 12px;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--dsw-alias-label-primary, #1c2430);
  word-break: break-all;
}
.dsh-we-card-badges {
  display: flex;
  gap: 4px;
  margin-top: 4px;
  flex-wrap: wrap;
}
.dsh-we-card-badge {
  font-size: 10px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(77, 107, 254, 0.1));
  color: var(--dsw-alias-label-secondary, #4a5568);
}
.dsh-we-card-badge[data-hot='true'] {
  background: var(--dsw-alias-state-warn-primary, #d97706);
  color: #fff;
}
.dsh-we-card-empty {
  padding: 18px 8px;
  text-align: center;
  font-size: 13px;
  opacity: 0.7;
  color: var(--dsw-alias-label-secondary, #4a5568);
}
`;
		//#endregion
		//#region src/client/layer.ts
		const API$1 = "/api/we-wallpaper";
		/** SVG namespace for the sharpen filter defs. */
		const SVG_NS = "http://www.w3.org/2000/svg";
		/** The plugin-owned sharpen filter id (referenced by --dsh-we-filter). */
		const SHARPEN_FILTER_ID = "dsh-we-sharpen";
		/** CSS variable carrying the active filter (none when sharpen = 0). */
		const FILTER_VAR = "--dsh-we-filter";
		/** Max sharpen strength (kernel off-center magnitude at 100). */
		const MAX_SHARPEN = .8;
		/** The shell surface tokens the translucency veil remaps. */
		const SURFACE_TOKENS = [
			"--dsw-alias-bg-base",
			"--dsw-alias-bg-layer-1",
			"--dsw-alias-bg-layer-2",
			"--dsw-alias-bg-layer-3",
			"--dsw-alias-bg-mask-1",
			"--dsw-alias-bg-mask-2",
			"--dsw-alias-bg-mask-3",
			"--dsw-alias-bg-module-platform",
			"--dsw-alias-bg-multi-select",
			"--dsw-alias-bg-overlay",
			"--dsw-specific-sidebar-fill",
			"--dsw-specific-menu",
			"--dsw-specific-selector"
		];
		/** Parse a hex / rgb() / rgba() color into [r, g, b, a]; null when unsupported. */
		function parseColor(value) {
			const text = value.trim().toLowerCase();
			let match;
			if ((match = /^#([0-9a-f]{3,4})$/.exec(text)) !== null) {
				const hex = match[1];
				const expand = (index) => parseInt(hex[index] + hex[index], 16);
				const alpha = hex.length === 4 ? expand(3) / 255 : 1;
				return [
					expand(0),
					expand(1),
					expand(2),
					alpha
				];
			}
			if ((match = /^#([0-9a-f]{6,8})$/.exec(text)) !== null) {
				const hex = match[1];
				const alpha = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
				return [
					parseInt(hex.slice(0, 2), 16),
					parseInt(hex.slice(2, 4), 16),
					parseInt(hex.slice(4, 6), 16),
					alpha
				];
			}
			if ((match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(text)) !== null) return [
				Number(match[1]),
				Number(match[2]),
				Number(match[3]),
				match[4] === void 0 ? 1 : Number(match[4])
			];
			return null;
		}
		/** Serialize rgba back to a css color string. */
		function toRgba(parts, alpha) {
			return `rgba(${Math.round(parts[0])}, ${Math.round(parts[1])}, ${Math.round(parts[2])}, ${alpha})`;
		}
		/**
		* The background layer controller. Mount once (plugin apply); it follows the
		* shared state store for its whole life and retracts everything on dispose.
		*/
		var WallpaperLayer = class {
			store;
			root = null;
			media = null;
			scrimEl = null;
			tokensTag = null;
			tokenBase = null;
			metas = null;
			disposers = [];
			darkObserver = null;
			kernelEl = null;
			/** @param store - the shared wallpaper state store. */
			constructor(store) {
				this.store = store;
			}
			/** Mount the layer: body attribute, DOM, store subscription, theme flip watch. */
			mount() {
				document.body.setAttribute(BODY_ATTR, "");
				const root = document.createElement("div");
				root.id = LAYER_ID;
				const scrim = document.createElement("div");
				scrim.style.position = "absolute";
				scrim.style.inset = "0";
				scrim.style.pointerEvents = "none";
				root.appendChild(scrim);
				this.scrimEl = scrim;
				document.body.appendChild(root);
				this.root = root;
				const svg = document.createElementNS(SVG_NS, "svg");
				svg.setAttribute("width", "0");
				svg.setAttribute("height", "0");
				svg.style.position = "absolute";
				const filter = document.createElementNS(SVG_NS, "filter");
				filter.id = SHARPEN_FILTER_ID;
				const kernel = document.createElementNS(SVG_NS, "feConvolveMatrix");
				kernel.setAttribute("order", "3");
				kernel.setAttribute("preserveAlpha", "true");
				filter.appendChild(kernel);
				svg.appendChild(filter);
				document.body.appendChild(svg);
				this.kernelEl = kernel;
				this.disposers.push(this.store.subscribe(() => {
					this.render();
				}));
				this.darkObserver = new MutationObserver(() => this.refreshTokens());
				this.darkObserver.observe(document.body, {
					attributes: true,
					attributeFilter: ["data-ds-dark-theme"]
				});
				this.render();
			}
			/** Retract everything this controller wrote. */
			dispose() {
				for (const dispose of this.disposers.splice(0)) dispose();
				this.darkObserver?.disconnect();
				this.darkObserver = null;
				this.clearMedia();
				this.root?.remove();
				this.root = null;
				this.scrimEl = null;
				this.tokensTag?.remove();
				this.tokensTag = null;
				this.kernelEl?.ownerSVGElement?.remove();
				this.kernelEl = null;
				document.body.removeAttribute(BODY_ATTR);
			}
			/** The resolved state (already clamped by the store). */
			read() {
				return this.store.getSnapshot();
			}
			/** Monotonic render sequence: a superseded async render must not touch the DOM. */
			renderSeq = 0;
			/** The wallpaper + scene mode key the current media element plays. */
			mediaId = "";
			/**
			* Apply the state to the layer. Option changes (scrim / translucency /
			* sharpen) are pure CSS updates; the media element is only (re)created when
			* the selected wallpaper actually changes — recreating a <video> on every
			* slider tick would spawn a new decode pipeline per event (memory churn).
			*/
			async render() {
				const seq = ++this.renderSeq;
				const settings = this.read();
				if (this.scrimEl !== null) this.scrimEl.style.background = `rgba(0, 0, 0, ${settings.scrim / 100})`;
				this.applyTranslucency(settings.translucency);
				this.applySharpen(settings.sharpen);
				if (this.root !== null) this.root.style.setProperty("--dsw-we-fit", settings.fit);
				if (settings.selectedId === "") {
					if (this.mediaId !== "") this.clearMedia();
					return;
				}
				let metas = await this.ensureMetas();
				let meta = metas?.get(settings.selectedId);
				if (meta === void 0 && metas !== null) {
					this.metas = null;
					metas = await this.ensureMetas();
					meta = metas?.get(settings.selectedId);
				}
				if (seq !== this.renderSeq) return;
				if (meta === void 0) {
					if (this.mediaId !== "") this.clearMedia();
					return;
				}
				const mediaKey = meta.type === "scene" || meta.type === "other" ? `${settings.selectedId}:${settings.sceneMode}` : settings.selectedId;
				if (this.mediaId === mediaKey && this.media !== null) return;
				this.renderMedia(meta, mediaKey);
			}
			/** Fetch the library (cached per mount); returns the current map. */
			async ensureMetas() {
				if (this.metas !== null) return this.metas;
				try {
					const data = await (await fetch(`${API$1}/list`)).json();
					if (data.ok === true && Array.isArray(data.wallpapers)) this.metas = new Map(data.wallpapers.map((wallpaper) => [wallpaper.id, wallpaper]));
				} catch {}
				return this.metas;
			}
			/**
			* Swap in the media element for one wallpaper (only called on id change).
			* Animated-first uses the local GIF/video-like preview and loads the exact
			* scene.pkg background only if that preview fails. Static-HD loads the
			* extracted background immediately, keeping the preview underneath.
			*/
			renderMedia(meta, mediaKey) {
				this.clearMedia();
				const root = this.root;
				if (root === null) return;
				const id = encodeURIComponent(meta.id);
				const sceneMode = this.store.getSnapshot().sceneMode;
				let element;
				if (meta.type === "video") {
					const video = document.createElement("video");
					video.src = `${API$1}/media/${id}`;
					video.autoplay = true;
					video.muted = true;
					video.loop = true;
					video.playsInline = true;
					video.preload = "auto";
					video.poster = `${API$1}/preview/${id}`;
					video.disablePictureInPicture = true;
					element = video;
				} else if (meta.type === "web") {
					const frame = document.createElement("iframe");
					frame.src = `${API$1}/web/${id}/`;
					frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
					frame.setAttribute("scrolling", "no");
					frame.setAttribute("allow", "autoplay");
					frame.setAttribute("tabindex", "-1");
					frame.setAttribute("aria-hidden", "true");
					element = frame;
				} else if (meta.type === "image") {
					const image = document.createElement("img");
					image.src = `${API$1}/media/${id}`;
					image.alt = meta.title;
					element = image;
				} else {
					if (meta.type === "scene" && sceneMode === "animated-first") {
						this.renderSceneVideo(meta, mediaKey, id);
						return;
					}
					const preview = meta.previewKind === "video" ? document.createElement("video") : document.createElement("img");
					preview.src = `${API$1}/preview/${id}`;
					if (preview instanceof HTMLVideoElement) {
						preview.autoplay = true;
						preview.muted = true;
						preview.loop = true;
						preview.playsInline = true;
						preview.preload = "auto";
						preview.disablePictureInPicture = true;
					} else preview.alt = meta.title;
					root.appendChild(preview);
					this.media = preview;
					this.mediaId = mediaKey;
					const appendHdFallback = () => {
						if (meta.workshopId === null || root.querySelector("[data-we-pkg-hd]") !== null) return;
						const hd = document.createElement("img");
						hd.dataset.wePkgHd = "true";
						hd.src = `${API$1}/pkg/${id}`;
						hd.alt = meta.title;
						hd.addEventListener("error", () => {
							hd.remove();
						});
						hd.addEventListener("load", () => {
							if (preview.isConnected) preview.style.display = "none";
						});
						root.appendChild(hd);
					};
					preview.addEventListener("error", appendHdFallback, { once: true });
					if (sceneMode === "static-hd") appendHdFallback();
					return;
				}
				root.appendChild(element);
				this.media = element;
				this.mediaId = mediaKey;
			}
			/** Play (or generate once) the cached high-resolution animated scene loop. */
			renderSceneVideo(meta, mediaKey, encodedId) {
				const root = this.root;
				if (root === null) return;
				const video = document.createElement("video");
				video.src = `${API$1}/scene-video/media/${encodedId}`;
				video.poster = `${API$1}/pkg/${encodedId}`;
				video.autoplay = true;
				video.muted = true;
				video.loop = true;
				video.playsInline = true;
				video.preload = "auto";
				video.disablePictureInPicture = true;
				root.appendChild(video);
				this.media = video;
				this.mediaId = mediaKey;
				let generationStarted = false;
				let generatedSourceLoaded = false;
				const stillCurrent = () => this.media === video && this.mediaId === mediaKey && video.isConnected;
				const fallbackPreview = () => {
					if (!stillCurrent()) return;
					const preview = document.createElement("img");
					preview.src = `${API$1}/preview/${encodedId}`;
					preview.alt = meta.title;
					video.replaceWith(preview);
					video.pause();
					video.removeAttribute("src");
					video.load();
					this.media = preview;
				};
				const poll = () => {
					if (!stillCurrent()) return;
					fetch(`${API$1}/scene-video/status/${encodedId}`).then(async (response) => {
						const result = await response.json();
						if (!stillCurrent()) return;
						const phase = result.status?.phase;
						if (phase === "ready") {
							generatedSourceLoaded = true;
							video.src = `${API$1}/scene-video/media/${encodedId}?v=${Date.now()}`;
							video.load();
							video.play().catch(() => {});
						} else if (phase === "error") fallbackPreview();
						else window.setTimeout(poll, 1e3);
					}).catch(() => window.setTimeout(poll, 1500));
				};
				video.addEventListener("error", () => {
					if (!stillCurrent()) return;
					if (generatedSourceLoaded) {
						fallbackPreview();
						return;
					}
					if (generationStarted) return;
					generationStarted = true;
					fetch(`${API$1}/scene-video/generate/${encodedId}`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: "{}"
					}).then((response) => {
						if (!response.ok) fallbackPreview();
						else poll();
					}).catch(fallbackPreview);
				});
			}
			/**
			* Tear the media element down and release its decode resources promptly:
			* pausing + clearing the src + calling load() on a <video> drops the
			* decoder immediately instead of waiting for GC (avoids the memory spike
			* of stacked 4K decode pipelines when switching wallpapers). Every media
			* child goes (scene wallpapers stack a GIF + HD img pair).
			*/
			clearMedia() {
				const media = this.media;
				this.media = null;
				this.mediaId = "";
				const root = this.root;
				if (root !== null) for (const child of [...root.children]) {
					if (child === this.scrimEl) continue;
					child.remove();
				}
				if (media === null) return;
				if (media instanceof HTMLVideoElement) {
					media.pause();
					media.removeAttribute("src");
					media.load();
				}
			}
			/** Re-snapshot the base tokens after a theme flip and re-apply. */
			refreshTokens() {
				this.tokenBase = null;
				this.applyTranslucency(this.read().translucency);
			}
			/** Snapshot the shell's surface tokens (once per theme). */
			ensureTokenBase() {
				if (this.tokenBase !== null) return;
				const computed = getComputedStyle(document.body);
				const base = {};
				for (const token of SURFACE_TOKENS) {
					const value = computed.getPropertyValue(token).trim();
					if (value !== "") base[token] = value;
				}
				this.tokenBase = base;
			}
			/** Re-declare the surface tokens at the chosen alpha (0 = official look). */
			applyTranslucency(translucency) {
				this.tokensTag?.remove();
				this.tokensTag = null;
				const alpha = Math.max(0, Math.min(90, translucency)) / 100;
				if (alpha <= 0) return;
				this.ensureTokenBase();
				if (this.tokenBase === null) return;
				const rules = [`body[${BODY_ATTR}] [id='root'] { background: transparent; }`];
				for (const [token, raw] of Object.entries(this.tokenBase)) {
					const parts = parseColor(raw);
					if (parts === null) continue;
					rules.push(`body[${BODY_ATTR}] { ${token}: ${toRgba(parts, parts[3] * alpha)}; }`);
				}
				const tag = document.createElement("style");
				tag.dataset.pluginCss = "we-wallpaper-tokens";
				tag.textContent = rules.join("\n");
				document.head.appendChild(tag);
				this.tokensTag = tag;
			}
			/**
			* Drive the sharpen filter: an unsharp-style 3x3 convolution
			* ([0 -s 0; -s 1+4s -s; 0 -s 0] — identity + s * (identity - blur)).
			* Scene previews are tiny (often 150-256px) and get upscaled to the full
			* viewport; the mild kernel recovers perceived edge crispness. 0 disables
			* the filter entirely (--dsh-we-filter: none).
			* @param sharpen - 0-100 strength.
			*/
			applySharpen(sharpen) {
				if (this.root === null) return;
				const s = Math.max(0, Math.min(100, sharpen)) / 100 * MAX_SHARPEN;
				if (s <= 0) {
					this.root.style.setProperty(FILTER_VAR, "none");
					return;
				}
				this.root.style.setProperty(FILTER_VAR, `url(#${SHARPEN_FILTER_ID})`);
				const center = 1 + 4 * s;
				const kernel = `0 ${-s.toFixed(3)} 0 ${-s.toFixed(3)} ${center.toFixed(3)} ${-s.toFixed(3)} 0 ${-s.toFixed(3)} 0`;
				this.kernelEl?.setAttribute("kernelMatrix", kernel);
			}
		};
		//#endregion
		//#region src/client/locales.ts
		/**
		* dsh-we-wallpaper copy: zh-first dictionaries with a complete English
		* mirror, registered through the locale service under the `weWallpaper`
		* namespace (the LocaleNamespaceMap merge lives in src/client/index.ts).
		*/
		/** zh dictionary (key-set source of truth). */
		const zh = {
			"card.title": "动态壁纸",
			"card.description": "把 Wallpaper Engine 的本地壁纸库用作 DeepSeek Harness 的背景。视频 / 网页 / 图片壁纸直接播放，场景与程序壁纸使用其预览动画。",
			"card.found": "已发现 Wallpaper Engine：{root}",
			"card.notFound": "未找到 Wallpaper Engine。已检查 Steam 注册表与常见安装目录；可在启动 DSH 前设置环境变量 DSH_WE_DIR 指向安装目录。",
			"card.refresh": "刷新",
			"card.search": "搜索壁纸…",
			"card.empty": "没有匹配的壁纸",
			"card.libraryEmpty": "壁纸库为空。请先在 Wallpaper Engine 中订阅或创建壁纸。",
			"card.clear": "关闭壁纸背景",
			"card.clearHint": "恢复官方背景（保留其他设置）",
			"card.active": "使用中",
			"card.desktop": "桌面使用中",
			"card.apply": "应用",
			"card.option.scrim": "遮罩",
			"card.option.scrimHint": "壁纸上的深色半透明层，保证文字可读",
			"card.option.translucency": "面板透明度",
			"card.option.translucencyHint": "主界面面板的透过程度，让壁纸透出（0 = 不透明官方面板）",
			"card.option.fit": "显示方式",
			"card.option.fit.cover": "铺满",
			"card.option.fit.contain": "完整",
			"card.option.sharpen": "清晰度增强",
			"card.option.sharpenHint": "场景壁纸的预览图分辨率很低（常见 150~256px），放大后发虚；卷积锐化可明显改善观感（0 = 关闭）",
			"card.option.sceneMode": "场景显示模式",
			"card.option.sceneModeHint": "动态优先会播放本地预览动画，加载失败时自动降级到从 scene.pkg 提取的高清静态背景",
			"card.option.sceneMode.animated": "动态优先（推荐）",
			"card.option.sceneMode.static": "高清静态",
			"card.option.repkg": "RePKG 路径（可选）",
			"card.option.repkgHint": "仅在内置解码器无法处理纹理时调用；插件不会自动下载或安装 RePKG",
			"card.loading": "正在读取壁纸库…",
			"card.error": "读取壁纸库失败：{error}",
			"type.video": "视频",
			"type.web": "网页",
			"type.scene": "场景",
			"type.image": "图片",
			"type.audio": "音频",
			"type.other": "其他",
			"source.workshop": "创意工坊",
			"source.myprojects": "我的项目",
			"source.defaultprojects": "默认项目"
		};
		/** en dictionary, complete against the zh key set. */
		const en = {
			"card.title": "Dynamic Wallpapers",
			"card.description": "Use your local Wallpaper Engine library as the DeepSeek Harness background. Video / web / image wallpapers play directly; scene and application wallpapers use their animated preview.",
			"card.found": "Wallpaper Engine found at {root}",
			"card.notFound": "Wallpaper Engine was not found. Steam registry and common install paths were checked; set the DSH_WE_DIR environment variable to its install directory before starting dsh.",
			"card.refresh": "Refresh",
			"card.search": "Search wallpapers…",
			"card.empty": "No matching wallpapers",
			"card.libraryEmpty": "The library is empty. Subscribe to or create wallpapers in Wallpaper Engine first.",
			"card.clear": "Turn the wallpaper background off",
			"card.clearHint": "Restore the official background (other options are kept)",
			"card.active": "Active",
			"card.desktop": "On desktop",
			"card.apply": "Apply",
			"card.option.scrim": "Scrim",
			"card.option.scrimHint": "Dark overlay over the wallpaper so text stays readable",
			"card.option.translucency": "Panel translucency",
			"card.option.translucencyHint": "How much of the main-interface surfaces the wallpaper shows through (0 = opaque official panels)",
			"card.option.fit": "Fit",
			"card.option.fit.cover": "Cover",
			"card.option.fit.contain": "Contain",
			"card.option.sharpen": "Sharpening",
			"card.option.sharpenHint": "Scene previews are very low resolution (often 150-256px) and get blurry when upscaled; convolution sharpening visibly recovers edges (0 = off)",
			"card.option.sceneMode": "Scene display mode",
			"card.option.sceneModeHint": "Animated-first plays the local preview animation and falls back to the extracted HD scene background if it fails",
			"card.option.sceneMode.animated": "Animated first (recommended)",
			"card.option.sceneMode.static": "HD static",
			"card.option.repkg": "RePKG path (optional)",
			"card.option.repkgHint": "Only used when the built-in texture decoder fails; the plugin never downloads or installs RePKG",
			"card.loading": "Reading the wallpaper library…",
			"card.error": "Failed to read the wallpaper library: {error}",
			"type.video": "Video",
			"type.web": "Web",
			"type.scene": "Scene",
			"type.image": "Image",
			"type.audio": "Audio",
			"type.other": "Other",
			"source.workshop": "Workshop",
			"source.myprojects": "My projects",
			"source.defaultprojects": "Default projects"
		};
		//#endregion
		//#region src/client/state.ts
		/** Defaults when the host has no state yet. */
		const DEFAULT_STATE = {
			selectedId: "",
			scrim: 25,
			translucency: 50,
			fit: "cover",
			sharpen: 40,
			sceneMode: "animated-first",
			repkgPath: "",
			animatedPreviews: true
		};
		const API = "/api/we-wallpaper";
		/** Shared store: snapshot + subscribe + optimistic writes through the host. */
		var WallpaperStateStore = class {
			state = { ...DEFAULT_STATE };
			listeners = /* @__PURE__ */ new Set();
			loaded = false;
			getSnapshot() {
				return this.state;
			}
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			/** Fetch the persisted state once (idempotent; retried on next call when it failed). */
			async load() {
				try {
					const data = await (await fetch(`${API}/state`)).json();
					if (data.ok === true && typeof data.state === "object" && data.state !== null) {
						this.state = normalize(data.state);
						this.loaded = true;
						this.publish();
					}
				} catch {}
			}
			/** Apply a wallpaper ('' = official background) — immediate write. */
			select(id) {
				this.write({ selectedId: id });
			}
			/** Option writes are debounced: a slider drag coalesces into one POST. */
			setScrim(value) {
				this.writeSoon({ scrim: value });
			}
			setTranslucency(value) {
				this.writeSoon({ translucency: value });
			}
			setFit(fit) {
				this.writeSoon({ fit });
			}
			setSharpen(value) {
				this.writeSoon({ sharpen: value });
			}
			setSceneMode(value) {
				this.write({
					sceneMode: value,
					animatedPreviews: value === "animated-first"
				});
			}
			setRePkgPath(value) {
				this.writeSoon({ repkgPath: value }, 350);
			}
			/** Trailing-edge debounce state for option writes. */
			pendingTimer = null;
			pendingPatch = {};
			/**
			* Apply optimistically (live preview) and coalesce the host write: rapid
			* option changes during one drag produce exactly one POST.
			* @param patch - the option patch.
			* @param delay - trailing delay in ms.
			*/
			writeSoon(patch, delay = 150) {
				this.state = normalize({
					...this.state,
					...patch
				});
				this.publish();
				Object.assign(this.pendingPatch, patch);
				if (this.pendingTimer !== null) clearTimeout(this.pendingTimer);
				this.pendingTimer = setTimeout(() => {
					this.pendingTimer = null;
					const merged = this.pendingPatch;
					this.pendingPatch = {};
					this.write(merged);
				}, delay);
			}
			/** Optimistic local apply, then persist through the host. */
			async write(patch) {
				const next = normalize({
					...this.state,
					...patch
				});
				this.state = next;
				this.publish();
				try {
					const data = await (await fetch(`${API}/state`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(patch)
					})).json();
					if (data.ok === true && typeof data.state === "object" && data.state !== null) this.state = normalize(data.state);
				} catch {}
				this.publish();
			}
			publish() {
				for (const listener of this.listeners) listener();
			}
		};
		/** Clamp/coerce one raw section (mirrors the host normalizeState). */
		function normalize(raw) {
			const record = raw;
			const sceneMode = record.sceneMode === "static-hd" ? "static-hd" : record.sceneMode === "animated-first" ? "animated-first" : record.animatedPreviews === false ? "static-hd" : "animated-first";
			return {
				selectedId: typeof raw.selectedId === "string" ? raw.selectedId : DEFAULT_STATE.selectedId,
				scrim: typeof raw.scrim === "number" && Number.isFinite(raw.scrim) ? Math.max(0, Math.min(100, Math.round(raw.scrim))) : DEFAULT_STATE.scrim,
				translucency: typeof raw.translucency === "number" && Number.isFinite(raw.translucency) ? Math.max(0, Math.min(90, Math.round(raw.translucency))) : DEFAULT_STATE.translucency,
				fit: raw.fit === "contain" ? "contain" : "cover",
				sharpen: typeof raw.sharpen === "number" && Number.isFinite(raw.sharpen) ? Math.max(0, Math.min(100, Math.round(raw.sharpen))) : DEFAULT_STATE.sharpen,
				sceneMode,
				repkgPath: typeof record.repkgPath === "string" ? record.repkgPath.trim().slice(0, 2048) : "",
				animatedPreviews: sceneMode === "animated-first"
			};
		}
		//#endregion
		//#region src/client/index.ts
		/** Locale namespace owned by this plugin. */
		const NS = "weWallpaper";
		/** Required services: slots + locale (card). The layer itself needs no services. */
		const inject = ["slots", "locale"];
		/** Inject one plugin-owned style tag (idempotent per session). */
		function injectStyle(id, css) {
			const existing = document.querySelector(`style[data-plugin-css="${id}"]`);
			if (existing !== null) return existing;
			const tag = document.createElement("style");
			tag.dataset.pluginCss = id;
			tag.textContent = css;
			document.head.appendChild(tag);
			return tag;
		}
		/**
		* Register the dictionaries, the background layer, and the plugin card.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "we-wallpaper: dictionaries");
			ctx.effect(() => {
				const styles = [injectStyle("we-wallpaper-layer", LAYER_CSS), injectStyle("we-wallpaper-card", CARD_CSS)];
				return () => {
					for (const tag of styles) tag.remove();
				};
			}, "we-wallpaper: styles");
			const store = new WallpaperStateStore();
			store.load();
			const layer = new WallpaperLayer(store);
			ctx.effect(() => {
				try {
					layer.mount();
				} catch (error) {
					console.error("[we-wallpaper] layer mount failed:", error);
				}
				return () => layer.dispose();
			}, "we-wallpaper: layer");
			const card = new WallpaperCardController(store);
			card.refresh();
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				key: "we-wallpaper",
				locale: NS,
				inject: () => card.inject()
			}, WallpaperCard));
		}
		//#endregion
		exports.BODY_ATTR = BODY_ATTR;
		exports.LAYER_ID = LAYER_ID;
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map