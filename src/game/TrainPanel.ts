import { TrainState } from "./Train";

export interface TrainInfo {
  id: string;
  name: string;
  colour: number;   // Phaser hex int
  state: TrainState;
  speedTps: number; // 1–20 tiles/sec
}

export interface TrainPanelCallbacks {
  onAdd:         () => void;
  onSelect:      (id: string) => void;
  onStart:       (id: string) => void;
  onStop:        (id: string) => void;
  onReverse:     (id: string) => void;
  onRemove:      (id: string) => void;
  onSpeedChange: (id: string, speed: number) => void;
}

/** Convert a Phaser hex int to a CSS colour string. */
function toCss(hex: number): string {
  return "#" + hex.toString(16).padStart(6, "0");
}

export class TrainPanel {
  private el:         HTMLDivElement;
  private listEl:     HTMLDivElement;
  private addBtn:     HTMLButtonElement;
  private hintEl:     HTMLDivElement;
  private controlsEl: HTMLDivElement;
  private speedSlider!: HTMLInputElement;
  private speedDisplay!: HTMLSpanElement;
  private startStopBtn!: HTMLButtonElement;
  private reverseBtn!:   HTMLButtonElement;
  private removeBtn!:    HTMLButtonElement;

  private selectedId: string | null = null;
  private removeArmed  = false;
  private removeTimer: ReturnType<typeof setTimeout> | null = null;

  // Cache key to avoid DOM thrashing each frame
  private lastRenderKey = "";

  constructor(private cbs: TrainPanelCallbacks) {
    this.el = document.createElement("div");
    this.el.id = "train-panel";
    this.el.style.cssText = [
      "position:fixed", "top:58px", "right:0",
      "width:190px", "height:calc(100vh - 58px)",
      "background:#111111cc", "backdrop-filter:blur(2px)",
      "border-left:1px solid #333",
      "font-family:sans-serif", "font-size:13px", "color:#eee",
      "display:flex", "flex-direction:column",
      "box-sizing:border-box", "z-index:20",
      "overflow-y:auto",
    ].join(";");

    // ── Header ────────────────────────────────────────────────────
    const header = document.createElement("div");
    header.style.cssText = [
      "padding:8px 10px 6px", "font-weight:700",
      "font-size:12px", "letter-spacing:1px",
      "color:#aaa", "border-bottom:1px solid #333",
    ].join(";");
    header.textContent = "TRAINS";

    // ── Train list ────────────────────────────────────────────────
    this.listEl = document.createElement("div");
    this.listEl.style.cssText = "flex:1;padding:4px 0;min-height:0";

    // ── Add button + hint ─────────────────────────────────────────
    const addWrap = document.createElement("div");
    addWrap.style.cssText = "padding:6px 10px 2px";

    this.addBtn = document.createElement("button");
    this.addBtn.textContent = "+ Add Train";
    this.addBtn.style.cssText = this.btnCss("#1a6e30", "100%");
    this.addBtn.addEventListener("click", () => this.cbs.onAdd());

    this.hintEl = document.createElement("div");
    this.hintEl.style.cssText = [
      "display:none", "font-size:11px", "color:#f1c40f",
      "padding:4px 0", "text-align:center",
    ].join(";");
    this.hintEl.textContent = "Click a track tile to place  [Esc to cancel]";

    addWrap.appendChild(this.addBtn);
    addWrap.appendChild(this.hintEl);

    // ── Separator ─────────────────────────────────────────────────
    const sep = document.createElement("div");
    sep.style.cssText = "border-top:1px solid #333;margin:4px 0";

    // ── Controls section ──────────────────────────────────────────
    this.controlsEl = document.createElement("div");
    this.controlsEl.style.cssText = "display:none;padding:8px 10px 10px";
    this.buildControls(this.controlsEl);

    // ── Assemble ──────────────────────────────────────────────────
    this.el.appendChild(header);
    this.el.appendChild(this.listEl);
    this.el.appendChild(addWrap);
    this.el.appendChild(sep);
    this.el.appendChild(this.controlsEl);

    document.body.appendChild(this.el);
  }

  private buildControls(parent: HTMLElement): void {
    // Speed row
    const speedRow = document.createElement("div");
    speedRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:8px";

    const lbl = document.createElement("span");
    lbl.style.cssText = "font-size:11px;color:#aaa;white-space:nowrap";
    lbl.textContent = "Speed";

    this.speedSlider = document.createElement("input");
    this.speedSlider.type = "range";
    this.speedSlider.min  = "1";
    this.speedSlider.max  = "20";
    this.speedSlider.value = "6";
    this.speedSlider.style.cssText = "flex:1;cursor:pointer;accent-color:#e67e22";
    this.speedSlider.addEventListener("input", () => {
      this.speedDisplay.textContent = this.speedSlider.value;
      if (this.selectedId) this.cbs.onSpeedChange(this.selectedId, Number(this.speedSlider.value));
    });

    this.speedDisplay = document.createElement("span");
    this.speedDisplay.style.cssText = "min-width:18px;text-align:right;font-size:12px";
    this.speedDisplay.textContent = "6";

    speedRow.appendChild(lbl);
    speedRow.appendChild(this.speedSlider);
    speedRow.appendChild(this.speedDisplay);

    // Start/Stop + Reverse row
    const actionRow = document.createElement("div");
    actionRow.style.cssText = "display:flex;gap:6px;margin-bottom:6px";

    this.startStopBtn = document.createElement("button");
    this.startStopBtn.style.cssText = this.btnCss("#27ae60", "50%");
    this.startStopBtn.addEventListener("click", () => {
      if (!this.selectedId) return;
      if (this.startStopBtn.dataset.running === "1") this.cbs.onStop(this.selectedId);
      else this.cbs.onStart(this.selectedId);
    });

    this.reverseBtn = document.createElement("button");
    this.reverseBtn.textContent = "⇄ Rev";
    this.reverseBtn.style.cssText = this.btnCss("#2980b9", "50%");
    this.reverseBtn.addEventListener("click", () => {
      if (this.selectedId) this.cbs.onReverse(this.selectedId);
    });

    actionRow.appendChild(this.startStopBtn);
    actionRow.appendChild(this.reverseBtn);

    // Remove button
    this.removeBtn = document.createElement("button");
    this.removeBtn.textContent = "🗑 Remove Train";
    this.removeBtn.style.cssText = this.btnCss("#7f1d1d", "100%");
    this.removeBtn.addEventListener("click", () => this.handleRemoveClick());

    parent.appendChild(speedRow);
    parent.appendChild(actionRow);
    parent.appendChild(this.removeBtn);
  }

  /**
   * Call each frame (or whenever train state changes).
   * Rebuilds the list only when something actually changed.
   */
  render(trains: TrainInfo[], selectedId: string | null): void {
    const key = trains.map(t => `${t.id}:${t.state}`).join("|") + "|" + selectedId;
    if (key === this.lastRenderKey) return;
    this.lastRenderKey = key;

    const prevSelectedId = this.selectedId;
    this.selectedId = selectedId;

    // ── Rebuild train rows ─────────────────────────────────────────
    this.listEl.innerHTML = "";
    for (const t of trains) {
      this.listEl.appendChild(this.buildRow(t, t.id === selectedId));
    }

    // Disable add button when at max or in placement mode
    this.addBtn.disabled = trains.length >= 4;

    // ── Controls section ──────────────────────────────────────────
    if (!selectedId) {
      this.controlsEl.style.display = "none";
      return;
    }
    this.controlsEl.style.display = "block";

    const sel = trains.find(t => t.id === selectedId);
    if (!sel) return;

    // Sync speed slider only when a different train is selected
    if (selectedId !== prevSelectedId) {
      this.speedSlider.value     = String(sel.speedTps);
      this.speedDisplay.textContent = String(sel.speedTps);
      this.disarmRemove();
    }

    // Sync start/stop button
    const isRunning = sel.state !== "stopped";
    this.startStopBtn.dataset.running = isRunning ? "1" : "0";
    this.startStopBtn.textContent     = isRunning ? "⏹ Stop" : "▶ Start";
    this.startStopBtn.style.background = isRunning ? "#c0392b" : "#27ae60";

    // Reverse: disabled only when stopped
    const canReverse = sel.state !== "stopped";
    this.reverseBtn.disabled          = !canReverse;
    this.reverseBtn.style.opacity     = canReverse ? "1" : "0.35";
    this.reverseBtn.style.cursor      = canReverse ? "pointer" : "default";
  }

  setPlacementMode(active: boolean): void {
    this.addBtn.style.display  = active ? "none" : "block";
    this.hintEl.style.display  = active ? "block" : "none";
  }

  destroy(): void {
    this.disarmRemove();
    this.el.remove();
  }

  // ── Row builder ───────────────────────────────────────────────

  private buildRow(t: TrainInfo, selected: boolean): HTMLDivElement {
    const row = document.createElement("div");
    row.style.cssText = [
      "display:flex", "align-items:center", "gap:8px",
      "padding:5px 10px", "cursor:pointer",
      "border-left:3px solid " + (selected ? toCss(t.colour) : "transparent"),
      selected ? "background:#ffffff18" : "background:transparent",
    ].join(";");
    row.addEventListener("click", () => this.cbs.onSelect(t.id));
    row.addEventListener("mouseenter", () => {
      if (!selected) row.style.background = "#ffffff0e";
    });
    row.addEventListener("mouseleave", () => {
      if (!selected) row.style.background = "transparent";
    });

    // Colour dot
    const dot = document.createElement("span");
    dot.style.cssText = [
      `width:10px`, `height:10px`, `border-radius:50%`,
      `background:${toCss(t.colour)}`,
      `flex-shrink:0`, `border:1px solid #ffffff44`,
    ].join(";");

    // Name
    const name = document.createElement("span");
    name.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    name.textContent = t.name;

    // State icon
    const icon = document.createElement("span");
    icon.style.cssText = "font-size:10px;color:#aaa;flex-shrink:0";
    icon.textContent = t.state === "stopped" ? "⏹" : "▶";

    row.appendChild(dot);
    row.appendChild(name);
    row.appendChild(icon);
    return row;
  }

  // ── Remove confirmation ────────────────────────────────────────

  private handleRemoveClick(): void {
    if (!this.selectedId) return;
    if (!this.removeArmed) {
      this.removeArmed = true;
      this.removeBtn.textContent   = "Confirm?";
      this.removeBtn.style.background = "#c0392b";
      this.removeTimer = setTimeout(() => this.confirmRemove(), 3000);
    } else {
      this.confirmRemove();
    }
  }

  private confirmRemove(): void {
    if (this.removeTimer) { clearTimeout(this.removeTimer); this.removeTimer = null; }
    this.removeArmed = false;
    this.removeBtn.textContent   = "🗑 Remove Train";
    this.removeBtn.style.background = "#7f1d1d";
    if (this.selectedId) this.cbs.onRemove(this.selectedId);
  }

  private disarmRemove(): void {
    if (this.removeTimer) { clearTimeout(this.removeTimer); this.removeTimer = null; }
    this.removeArmed = false;
    if (this.removeBtn) {
      this.removeBtn.textContent   = "🗑 Remove Train";
      this.removeBtn.style.background = "#7f1d1d";
    }
  }

  // ── Helpers ───────────────────────────────────────────────────

  private btnCss(bg: string, width = "auto"): string {
    return [
      `background:${bg}`, "border:none", "border-radius:4px",
      "color:#fff", "font-size:12px", "font-family:sans-serif",
      `padding:5px 8px`, `width:${width}`,
      "cursor:pointer", "font-weight:600", "text-align:center",
    ].join(";");
  }
}
