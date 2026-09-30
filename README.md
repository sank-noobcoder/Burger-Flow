# BurgersFlow PINN Studio

A secure web platform for training, monitoring and comparing Physics-Informed Neural Networks (PINNs) on the viscous Burgers' equation. The headline method is the **re-initialization (RI-PINN)** strategy from Lee et al., *Sci. Rep.* 15:16740 (2025).

- Product requirements: [`docs/PRD.md`](docs/PRD.md)
- Technical design and security: [`docs/TRD.md`](docs/TRD.md)
- File-level folder tree: TRD §10 · API reference: TRD §4.1 · Frontend↔backend wiring: TRD §11 · Animated UI spec: PRD §8, TRD §12 · 1D/2D Burgers: PRD §7, TRD §3

---

## 1. Quick Start

```bash
git clone <your-repo> && cd burgersflow
cp .env.example .env            # set secrets, never commit this file
docker compose up --build       # api, worker, redis, postgres, web
# Web UI:  http://localhost:3000
# API docs: http://localhost:8000/docs
```

## 2. Repository Layout

```
burgersflow/
├── apps/web/            # React + TypeScript UI
├── apps/api/            # FastAPI gateway (auth, validation, job API)
├── apps/worker/         # GPU/CPU training workers (PyTorch)
├── core/                # PDEs, models, losses, RI trainer, metrics
├── configs/             # YAML experiment presets
├── docs/                # PRD.md, TRD.md
└── docker-compose.yml
```

---

## 3. UX Principles

1. **Guide, don't overwhelm.** A researcher should launch a valid run in under 2 minutes using presets.
2. **Make training legible.** Show *why* RI is doing something (phase, detected regions), not just a loss number.
3. **Honest results.** Always show baselines beside RI-PINN, with seed variance. Never show a single cherry-picked run.
4. **Safe by default.** Limits are visible in the UI, not hidden behind errors.
5. **Accessible.** WCAG 2.1 AA, keyboard-complete, colorblind-safe plots.

## 4. Personas

| Persona | Goal | Key screens |
|---|---|---|
| Researcher | Launch runs, compare methods, export figures | Wizard, Live Monitor, Compare |
| Reviewer | Reproduce and verify a published run | Run Detail, Config export |
| Admin | Manage users, quotas, abuse | Admin console |

## 5. Information Architecture

```
Dashboard
├── Experiments (list, filters, status)
│   ├── New Experiment (wizard)
│   └── Run Detail
│       ├── Live Monitor
│       ├── Results (field, slices, error)
│       ├── Region Detection Explorer
│       └── PCA Trajectory
├── Compare (multi-run, multi-seed)
├── Ablations
├── Settings (profile, API keys, theme)
└── Admin (users, quotas, audit log)
```

## 6. Key Screens

### 6.1 Dashboard
```
┌────────────────────────────────────────────────────────────┐
│ BurgersFlow        [Search]            ⚙  🌙  (avatar)      │
├──────────┬─────────────────────────────────────────────────┤
│ Dashboard│  Quota: GPU-min 42/120   Active jobs 1/2        │
│ Runs     │  ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│ Compare  │  │ Best L2    │ │ Runs today │ │ Queue      │   │
│ Ablation │  │ 3.1e-3     │ │ 7          │ │ 0 waiting  │   │
│ Settings │  └────────────┘ └────────────┘ └────────────┘   │
│          │  Recent runs         [ + New Experiment ]       │
│          │  ● RI-PINN ν=0.01/π   Running  Phase 1  62%     │
│          │  ✓ FF-PINN ν=0.01/π   Done     L2 1.2e-2        │
└──────────┴─────────────────────────────────────────────────┘
```

### 6.2 New Experiment Wizard (4 steps)
1. **Problem:** PDE (Burgers 1D), viscosity ν (slider with "shock regime" marker), domain, preset.
2. **Model:** N-PINN / FF-PINN / RI-PINN, layers, width, Fourier σ.
3. **RI Settings** (shown only for RI-PINN): detection threshold %, re-init period, duration, λ_RI, target range. Each has a tooltip citing the paper default.
4. **Review & Launch:** resource estimate (GPU-minutes), limit check, config preview, *Launch*.

Validation is inline. Out-of-range values show the allowed range and the reason (for example "Max epochs 150,000 per run to protect shared GPUs").

### 6.3 Live Monitor
```
┌ Run: RI-PINN ν=0.01/π ───────── [Pause] [Stop] ────────────┐
│ Phase: ● Searching (RI active)  → ○ Fine-tuning            │
│ ┌ Loss (log) ───────────────┐ ┌ Prediction u(x,t) ───────┐ │
│ │ ╱╲╱╲╱╲╱╲ sawtooth ↓       │ │   heatmap, updates/500ep │ │
│ └───────────────────────────┘ └──────────────────────────┘ │
│ ┌ Detected regions (low-gradient 30%) ┐ Epoch 38,200/100k  │
│ │ red points over domain              │ Best loss 4.1e-4   │
│ └─────────────────────────────────────┘ Patience 3.2k/10k  │
└────────────────────────────────────────────────────────────┘
```
Updates stream over WebSocket/SSE and are throttled to ~1 update/2 s. The UI explains the sawtooth: *"Spikes are expected: re-initialization is exploring alternative solutions."*

### 6.4 Results and Compare
- Side-by-side heatmaps: reference, each model, absolute error (shared color scale).
- Time-slice selector (t = 0.25, 0.5, 0.75, 1.0) with reference overlay.
- Metrics table: MSE, relative L2, shock-position error, epochs, time, **mean ± std over seeds**.
- Export: PNG/SVG figures, CSV metrics, YAML config.

### 6.5 PCA Trajectory
Scatter/line of layer-0 parameters in 2D, phases colored, end-of-training markers, hover to jump to the prediction at that checkpoint.

## 7. Design System

| Element | Spec |
|---|---|
| Typography | Inter (UI), JetBrains Mono (numbers, configs) |
| Spacing | 4 px base grid |
| Colors | Neutral gray surfaces; accent blue; semantic green/amber/red. Field plots use perceptually uniform colormaps (viridis, cividis). Avoid jet. |
| Themes | Light and dark, following system setting |
| Components | shadcn/ui or MUI, Plotly or ECharts for plots |
| Icons | Lucide |

## 8. UI States (every screen)

| State | Behavior |
|---|---|
| Loading | Skeletons, never blank screens |
| Empty | Explains the next step with a primary button |
| Error | Plain-language cause, recovery action, request ID for support |
| Rate-limited (429) | Banner with countdown from `Retry-After` |
| Quota exceeded | Shows usage, reset time, and what the limit protects |
| Offline or stream lost | Auto-reconnect with status chip; run continues server-side |

## 9. Accessibility and Responsiveness
- Keyboard navigable, visible focus rings, ARIA labels on charts with a data-table fallback.
- Contrast ≥ 4.5:1, no color-only encoding (use markers/line styles too).
- Breakpoints: ≥1200 px full dashboard; 768–1199 px collapsible sidebar; <768 px monitor and results view only (wizard works, dense compare is desktop-first).
- Respect `prefers-reduced-motion`.

## 10. Security as Seen in the UI
- Login with short-lived sessions; session-expiry warning before logout.
- Quotas and limits are shown up front (TRD §6).
- API keys are shown once, stored hashed, and revocable.
- All user text is escaped. The UI never renders raw HTML from API responses.
- Admin console has an audit log and a block/unblock action for abusive accounts.

## 11. Usability Success Criteria
- First valid run launched in ≤ 2 minutes (preset path).
- ≥ 90% of test users can explain the phase indicator after one session.
- No critical accessibility violations in automated (axe) and manual keyboard audits.

## 12. Citation
Lee, J. et al. *Physics informed neural networks for fluid flow analysis with repetitive parameter initialization.* Sci. Rep. 15, 16740 (2025). https://doi.org/10.1038/s41598-025-99354-5
