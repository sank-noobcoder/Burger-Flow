# PRD: BurgersFlow PINN Studio

**Version:** 3.1 | **Basis:** Lee et al., Sci. Rep. 15:16740 (2025) (RI-PINN)

## 1. Problem
Standard PINNs fail on stiff, nonlinear flows and get stuck in physically wrong minima. Burgers' equation forms steep shocks at low viscosity, which makes it a good testbed. Researchers need a platform to train, monitor and fairly compare PINNs, with re-initialization (RI) as the headline method, through a secure, shared web service.

## 2. Goals
1. Solve **both 1D and 2D** viscous Burgers' equations accurately in the shock regime.
2. Reproduce RI-PINN and benchmark it against N-PINN and FF-PINN (plus causal and adaptive-sampling baselines).
3. Provide a guided, accessible, **modern and animated** UI for launching, monitoring and comparing runs.
4. Run safely as a multi-user service: resistant to abuse, DoS/DDoS, and injection attacks.
5. Keep a PDE-pluggable core (Heat, Wave, Burgers, then cavity flow).

## 3. Non-Goals (v1)
Turbulence modeling, 3D (spatial) flow, inverse problems with real sensor data, public anonymous access, billing.

## 4. Users
Researcher (launches and compares runs), Reviewer (reproduces results), Admin (quotas, abuse handling).

## 5. Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| F1 | Configure a Burgers problem (ν, domain, presets) | P0 |
| F2 | Train N-PINN, FF-PINN, RI-PINN with two-phase training | P0 |
| F3 | Compare to the Cole-Hopf or fine-grid reference | P0 |
| F4 | Metrics: MSE, relative L2, shock-position error, epochs, wall-clock | P0 |
| F5 | Live training monitor (loss, phase, prediction, detected regions) | P0 |
| F6 | Results and multi-run compare views with export (PNG/SVG/CSV/YAML) | P0 |
| F7 | User accounts, authentication, per-user run isolation | P0 |
| F8 | Job queue with per-user quotas and concurrency limits | P0 |
| F9 | Multi-seed runs with mean ± std | P1 |
| F10 | PCA parameter-trajectory view | P1 |
| F11 | Ablations (threshold, period, duration, λ_RI, detection variant) | P1 |
| F12 | Admin console (users, quotas, audit log, block/unblock) | P1 |
| F13 | Cavity-flow reproduction, Re 700 and 1000 | P2 |
| F14 | Dimension selector: **1D Burgers** (x,t → u) and **2D Burgers** (x,y,t → u,v) sharing one wizard, API and trainer | P0 |
| F15 | 2D viewer: animated field over time (scrubber, play/pause), speed magnitude, velocity arrows/streamlines, optional vorticity, slice lines | P0 |
| F16 | Animated landing page and app shell (fluid-flow hero, smooth transitions, animated charts), with reduced-motion and low-power fallbacks | P1 |
| F17 | Typed API client generated from the OpenAPI schema; live updates over SSE | P0 |

## 6. Security Requirements

| ID | Threat | Requirement |
|---|---|---|
| S1 | **DoS (application layer)** | Per-IP and per-user rate limits; request size and timeout limits; hard caps on epochs, points, network size and runtime; per-user job and GPU-minute quotas; bounded queue with `429` and `Retry-After`. |
| S2 | **DDoS (volumetric)** | Traffic passes through a CDN/WAF/DDoS-protection edge; origin accepts traffic only from the edge; autoscaling has hard cost ceilings. No application can fully absorb a large volumetric attack, so this relies on the edge provider. |
| S3 | **SQL injection** | All database access via an ORM or parameterized queries only; no string-built SQL; schema validation on all inputs; allowlists for sort and filter fields; least-privilege DB accounts. |
| S4 | Authentication and access | OAuth2/OIDC or password + MFA; short-lived JWT access tokens; RBAC; ownership checks on every run ID (no IDOR). |
| S5 | Unsafe deserialization and uploads | No pickle; safe YAML loading; checkpoints loaded weights-only; uploads restricted by type and size and scanned. |
| S6 | Data in transit and at rest | TLS 1.2+ everywhere; encrypted DB and object storage; secrets in a secrets manager. |
| S7 | Web attacks (XSS, CSRF, CORS) | Output escaping, strict CSP, SameSite cookies, CSRF tokens for cookie auth, explicit CORS allowlist. |
| S8 | Detection and response | Structured audit logs, alerting on anomalies (spikes, repeated 4xx/5xx, quota abuse), automated IP/user blocking. |
| S9 | Supply chain | Dependency and container scanning in CI; pinned versions; SBOM. |

## 7. Problem Scope: 1D and 2D Burgers

| | **1D Burgers** | **2D Burgers** |
|---|---|---|
| Equation | u_t + u·u_x = ν·u_xx | u_t + u·u_x + v·u_y = ν(u_xx + u_yy); v_t + u·v_x + v·v_y = ν(v_xx + v_yy) |
| Domain | x ∈ [-1,1], t ∈ [0,1] | (x,y) ∈ [0,1]², t ∈ [0,1] |
| Network | (x,t) → u | (x,y,t) → (u,v) |
| Initial condition | u(0,x) = -sin(πx) (plus presets) | Smooth presets (for example Gaussian pulse, sinusoidal field) |
| Boundary | u(t,±1) = 0 | Dirichlet on all four edges |
| Viscosity | ν = 0.01/π (shock), 0.1/π (control) | Low ν (shock-forming) and a higher-ν control |
| Reference | Cole-Hopf analytical solution | High-resolution numerical solver (no general closed form); grid-independence check (50², 100², 200², 400²) as in the paper, plus a manufactured-solution test |
| Compute | CPU-friendly | GPU recommended; stricter caps per run (see TRD §6.1) |

The paper's region-detection metric (Σ|∂V_j/∂X_i| over spatial inputs and velocity components) maps naturally onto 2D Burgers with V = (u,v). The 1D version is the simpler test case.

### 7.1 Presets and defaults (1D and 2D)

| Preset ID | Dim | Initial condition | ν | Purpose |
|---|---|---|---|---|
| `b1d_shock` | 1D | u(0,x) = −sin(πx) | 0.01/π | Headline shock case (paper regime) |
| `b1d_control` | 1D | u(0,x) = −sin(πx) | 0.1/π | Smooth control, no sharp shock |
| `b2d_gaussian_pulse` | 2D | u₀ = v₀ = exp(−r²/2σ²), r measured from (0.5, 0.5), σ = 0.1 | 0.003 | Pulse that steepens into a shock front |
| `b2d_sine_product` | 2D | u₀ = v₀ = sin(πx)·sin(πy) | 0.003 | Smooth field that satisfies the Dirichlet edges exactly |
| `b2d_control` | 2D | same as `b2d_gaussian_pulse` | 0.02 | Higher-ν control |

The 2D presets and ν values are proposed defaults to be validated against the reference solver; the first two to ship are listed under Open Questions.

### 7.2 What the user sees per dimension

| | 1D | 2D |
|---|---|---|
| Main view | x–t heatmap of u | Animated (x,y) field at time t with a play/pause time scrubber |
| Extra views | Time slices (t = 0.25, 0.5, 0.75, 1.0) with reference overlay; moving shock marker | Speed magnitude √(u²+v²), velocity arrows or streamlines, optional vorticity, draggable slice lines linked to 1D line plots |
| Error view | |u − u_ref| heatmap | |u − u_ref| and |v − v_ref| maps, shared color scale |
| Region detection | Points on the x–t plane | Points on the (x,y) plane at a selectable time |
| Metrics | MSE, relative L2, shock-position error | MSE, relative L2 (both components), shock-front position error along slice lines |

## 8. UI/UX Vision: Modern and Animated

The product should feel like a modern scientific tool, not a plain admin panel.

- **Look:** dark-first theme with a light option, glassmorphism panels, soft gradient mesh backgrounds, crisp typography, generous spacing.
- **Landing hero:** a full-screen animated particle/flow field driven by a precomputed Burgers solution, with a shock front that steepens as the visitor scrolls. One clear call to action (*Launch an experiment*).
- **App motion:** smooth page and route transitions, staggered card reveals, animated number counters, loss curves that draw in live, spring-based wizard step transitions, subtle hover and press feedback.
- **Scientific visuals:** GPU-rendered (WebGL) field heatmaps; a time scrubber that animates the solution; a moving shock marker; animated compare-slider between reference and prediction; animated detected-region overlay showing where re-initialization applies.
- **Guardrails:** 60 fps on mid-range laptops, LCP < 2.5 s, animations never block interaction, `prefers-reduced-motion` and low-power or no-WebGL devices fall back to static or 2D canvas visuals, and animation must stay WCAG 2.1 AA compliant (no flashing, pausable).
- **Consistent with security:** all assets self-hosted or from allowlisted CDNs so the strict CSP still holds.

### 8.1 Visual language

| Element | Spec |
|---|---|
| Mood | "Scientific instrument meets fluid art": deep navy canvas, luminous flow-colored accents, generous whitespace |
| Dark palette | Background `#0B0F1A`, glass surface `rgba(255,255,255,0.06)` with 16 px backdrop blur, border `rgba(255,255,255,0.10)`, text `#E6EAF2`, muted text `#8B95A7` |
| Light palette | Background `#F7F9FC`, surface `#FFFFFF`, text `#0F172A`, accent `#0369A1` (meets 4.5:1 on white) |
| Accents | Flow cyan `#38BDF8` → violet `#8B5CF6` gradient (primary); shock orange `#F97316` (highlights the shock and detected regions); semantic green `#22C55E`, amber `#F59E0B`, red `#EF4444` |
| Type | Space Grotesk (headings), Inter (UI text), JetBrains Mono (numbers, configs); all self-hosted |
| Field colormaps | viridis for u and speed, magma for absolute error, RdBu (reversed) for signed quantities such as vorticity; no jet |
| Shape and depth | 16 px radius cards, soft glow on the primary action, 1 px gradient borders on active panels |

### 8.2 Landing page, section by section

| # | Section | Content | Motion | Fallback |
|---|---|---|---|---|
| 1 | Hero | Headline, one-line pitch, primary button *Launch an experiment*, secondary *See a live example* | Full-screen WebGL particle flow field advected by a precomputed Burgers velocity field; headline fades up with a stagger | Static gradient mesh with a still flow-line image |
| 2 | The shock problem | Short text plus a pinned 1D plot of u(x,t) | Scroll position drives time t, so the wave visibly steepens into a shock | Three static snapshots (t = 0, 0.5, 1) |
| 3 | How RI-PINN works | Three steps: train, detect low-gradient regions, re-initialize | Step cards reveal in sequence; detected points fade in on a small domain diagram, then re-scatter | Static three-panel diagram |
| 4 | 1D to 2D | Toggle between a 1D shock and a 2D pulse preview | Looping animated field with a moving shock marker | First frame of each |
| 5 | Honest comparison | Reference vs prediction with mean ± std metrics | Drag-to-reveal comparison slider; metric counters count up when scrolled into view | Side-by-side static images with final numbers |
| 6 | Built for shared labs | Three short cards: quotas, secure by default, reproducible runs | Staggered card reveal | Plain cards |
| 7 | Call to action and footer | Final button, paper citation, links | Subtle gradient shift on the button | Static button |

Navigation: sticky glass top bar with logo, section links, theme toggle and *Log in*. Every animation has a pause control (bottom-right on the hero) and respects `prefers-reduced-motion`.

### 8.3 Motion inside the app

| Moment | Behavior |
|---|---|
| Route change | 250 ms fade with 8 px upward translate |
| Dashboard load | Cards reveal with 60 ms stagger; metric numbers count up over about 800 ms |
| Wizard | Spring transition between steps; resource gauge animates as settings change |
| Live Monitor | Loss curve draws progressively; phase chip morphs between *Searching* and *Fine-tuning*; detected regions fade in and out as re-init windows open and close |
| Viewers | Time scrubber updates the field at 60 fps; moving shock marker; animated reference-vs-prediction slider |
| Feedback | Hover lift and press scale on buttons and cards; toasts slide in from the top right |

## 9. Repository Folder Structure

```
burgersflow/
├── README.md
├── docs/
│   ├── PRD.md
│   ├── TRD.md
│   ├── architecture/            # diagrams, sequence charts
│   └── adr/                     # architecture decision records
├── apps/
│   ├── web/                     # React + TypeScript frontend
│   │   ├── public/
│   │   └── src/
│   │       ├── app/             # routes: landing, dashboard, runs, compare, admin
│   │       ├── components/      # ui/, charts/, animation/, layout/
│   │       ├── features/        # wizard/, monitor/, results/, viewer1d/, viewer2d/, pca/
│   │       ├── hooks/           # useAuth, useRunStream, useReducedMotion
│   │       ├── lib/             # apiClient.ts, sse.ts, queryClient.ts
│   │       ├── api/generated/   # types generated from OpenAPI
│   │       └── styles/          # design tokens, theme
│   ├── api/                     # FastAPI backend
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── core/            # config, security, rate_limit, logging
│   │   │   ├── api/v1/          # auth, runs, stream, compare, admin
│   │   │   ├── schemas/         # Pydantic request/response models
│   │   │   ├── models/          # SQLAlchemy models
│   │   │   ├── repositories/    # the only layer that touches SQL
│   │   │   └── services/        # run_service, quota_service
│   │   ├── migrations/          # Alembic
│   │   └── tests/
│   └── worker/                  # training workers
│       ├── tasks/               # train_run.py
│       └── runtime/             # resource limits, sandboxing
├── core/                        # scientific Python package (framework-agnostic)
│   ├── pdes/                    # base, heat, wave, burgers1d, burgers2d
│   ├── models/                  # mlp, fourier_features
│   ├── losses/
│   ├── sampling/                # LHS
│   ├── training/                # trainer, region_detector, reinit
│   ├── reference/               # cole_hopf, fd_solver_2d
│   ├── evaluation/              # metrics, pca
│   └── tests/
├── configs/                     # burgers1d_*.yaml, burgers2d_*.yaml, cavity_*.yaml
├── infra/                       # docker/, k8s/, nginx/, waf/, terraform/
├── scripts/
├── .github/workflows/           # CI: tests, lint, security scans
├── docker-compose.yml
└── .env.example
```

### 9.1 What each top-level folder is for

| Folder | Responsibility | May depend on |
|---|---|---|
| `apps/web` | Everything the user sees: landing page, dashboard, wizard, monitor, viewers | Generated API client only |
| `apps/api` | HTTP gateway: auth, validation, quotas, job API, SSE, signed URLs | Database, Redis, object storage. Never imports training code |
| `apps/worker` | Pulls jobs from the queue, runs training with resource limits, publishes progress | `core/`, Redis, object storage |
| `core/` | Framework-agnostic science code: PDEs (1D and 2D Burgers), models, losses, RI trainer, reference solvers, metrics | NumPy, SciPy, PyTorch only |
| `configs/` | YAML experiment presets, one per preset ID in §7.1 | none |
| `infra/` | Docker, Kubernetes, reverse proxy, WAF and Terraform definitions | none |
| `scripts/` | CLI experiment runner, OpenAPI export, DB seeding, landing-page field generator | `core/` |
| `docs/` | PRD, TRD, architecture diagrams, ADRs | none |

The file-level tree is in TRD §10.

## 10. Frontend-Backend Integration (Summary)

The browser talks only to the **API gateway** over HTTPS, routed by the reverse proxy on one origin (`/` serves the web app, `/api/v1/*` goes to the API). The UI never talks to workers, the database or storage directly.

1. **Request/response (REST/JSON):** login, create run, list runs, fetch results, compare.
2. **Live updates (SSE):** training progress and field snapshots stream to the Live Monitor.
3. **Files:** figures and exports are fetched through short-lived signed URLs.
4. **Typed contract:** the frontend client is generated from the API's OpenAPI schema, so UI and API cannot drift apart.

Details: TRD §11.

### 10.1 API at a glance

| Area | Endpoints | Used by |
|---|---|---|
| Auth | `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `GET /me`, `GET /me/quota` | Login page, app shell |
| Presets | `GET /presets` | Wizard step 1 |
| Runs | `POST /runs`, `GET /runs`, `GET /runs/{id}`, `POST /runs/{id}/cancel`, `DELETE /runs/{id}` | Wizard, dashboard, run detail |
| Live updates | `GET /runs/{id}/stream` (SSE) | Live Monitor |
| Files | `GET /runs/{id}/artifacts`, `GET /runs/{id}/artifacts/{name}` | Viewers, export |
| Compare | `GET /compare?ids=…` | Compare and Ablations |
| Admin | `/admin/users`, `/admin/quotas`, `/admin/audit`, `/admin/block` | Admin console |

All paths are under `/api/v1`. Request and response schemas are in TRD §4.1; frontend code patterns are in TRD §11.8.

## 11. Non-Functional Requirements

| Area | Target |
|---|---|
| Availability | 99.5% for the API and UI |
| API latency | p95 < 300 ms for non-training endpoints |
| Live stream | Update lag < 3 s |
| Frontend performance | LCP < 2.5 s; 60 fps animations; initial JS < 250 KB gzipped (WebGL code lazy-loaded) |
| Scale | 100 concurrent users, 10 concurrent training jobs (v1) |
| Reproducibility | Every run stores config, seed, git hash, versions |
| Accessibility | WCAG 2.1 AA |

## 12. Success Metrics
- RI-PINN relative L2 beats N-PINN and FF-PINN on the shock case across ≥ 5 seeds (or the result is reported honestly if not).
- Shock-position error under 1 grid cell (1D) and below a documented tolerance on the 2D reference.
- Both 1D and 2D runs complete end to end through the same UI and API.
- Users rate the interface as clear and engaging in usability testing, with no accessibility regressions from animation.
- First valid run launched in ≤ 2 minutes.
- Security: zero critical findings in pre-release penetration test and CI scans. A load test shows graceful degradation (429s, not outages) at 10× expected load.

## 13. Risks

| ID | Risk | Mitigation |
|---|---|---|
| R1 | The paper's failure mode (near-zero solution in steady cavity flow) differs from time-dependent Burgers, which has an initial condition. RI may help less. | Treat as a hypothesis test; include cavity reproduction and extra baselines. |
| R2 | The paper reports one run per case, so results are not statistically established. | Multi-seed evaluation. |
| R3 | Paper inconsistencies (re-init schedule stated two ways, equation references swapped). | Configurable schedule; default to every 2,000 epochs for 500 epochs (supported by Fig. 10); cross-check the authors' repo. |
| R4 | GPU cost abuse. | Quotas, caps, admin controls (S1). |

## 14. Milestones
1. M1: Core, N-PINN, reference solver
2. M2: FF-PINN, metrics, plots
3. M3: RI-PINN and two-phase trainer
4. M4: API, auth, queue, database
5. M5: Web UI (wizard, monitor, results, compare) with the animated design system
6. M6: Security hardening, load and penetration testing
7. M7: 2D Burgers (core, numerical reference solver, 2D viewer)
8. M8: Seeds, ablations, PCA, cavity reproduction
9. M9: Motion polish, performance and accessibility pass

## 15. Open Questions
Which 2D initial-condition presets to ship first; hosting provider (affects edge/WAF choice); SSO requirement; retention period for runs and checkpoints.
