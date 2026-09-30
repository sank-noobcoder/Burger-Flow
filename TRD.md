# TRD: BurgersFlow PINN Studio

**Version:** 3.1 | Companion to PRD.md

---

## 1. High-Level System Design

```
                         Internet
                            │
              ┌─────────────▼──────────────┐
              │  CDN + WAF + DDoS shield   │  volumetric filtering,
              │  (TLS termination, bot mgmt)│  managed WAF rules, geo/ASN rules
              └─────────────┬──────────────┘
                            │ only edge IPs allowed
              ┌─────────────▼──────────────┐
              │  Load balancer / reverse   │  timeouts, body limits,
              │  proxy (Nginx/Envoy)       │  connection limits, slowloris guard
              └───────┬─────────────┬──────┘
                      │             │
        ┌─────────────▼───┐   ┌─────▼────────────┐
        │ Web (static SPA)│   │ API gateway      │  auth, rate limit,
        │ React + TS      │   │ FastAPI (N reps) │  validation, RBAC
        └─────────────────┘   └──┬────┬────┬─────┘
                                 │    │    │
                ┌────────────────▼┐ ┌─▼────▼───────┐  ┌────────────────┐
                │ Redis           │ │ PostgreSQL   │  │ Object storage │
                │ rate-limit state│ │ users, runs, │  │ checkpoints,   │
                │ job queue, pubsub│ │ metrics,audit│  │ figures, exports│
                └───────┬─────────┘ └──────────────┘  └───────▲────────┘
                        │ jobs                                │
                ┌───────▼──────────────────────────────────────┴─┐
                │ Training workers (isolated, GPU/CPU)           │
                │ PyTorch · core/ (PDE, RI trainer, metrics)     │
                │ no inbound internet, resource-limited containers│
                └────────────────────────────────────────────────┘
        Observability: metrics + logs + traces → dashboards and alerts
```

**Design choices**
- **Stateless API replicas** scale horizontally. All state lives in Redis, Postgres and object storage.
- **Training is asynchronous.** The API never trains. It validates, enqueues and returns a job ID, so slow jobs cannot block requests.
- **Workers are isolated.** They run in locked-down containers with no inbound access, pull jobs from the queue, and write results to storage and the database through a narrow internal interface.
- **Live monitoring** uses Redis pub/sub → API → SSE/WebSocket to the browser, throttled.

## 2. Technology Stack

| Layer | Choice |
|---|---|
| Frontend | React, TypeScript, Plotly/ECharts, shadcn/ui |
| API | FastAPI, Pydantic v2, SQLAlchemy (async) |
| Queue | Celery or Arq on Redis |
| DB | PostgreSQL |
| Storage | S3-compatible object store |
| ML | PyTorch (autograd derivatives), NumPy/SciPy, scikit-learn (PCA) |
| Deploy | Docker, Kubernetes or Compose, CI/CD |
| Observability | Prometheus, Grafana, structured JSON logs, OpenTelemetry |

## 3. Scientific Core

### 3.1 Problem
**1D:** u_t + u·u_x = ν·u_xx, x ∈ [-1,1], t ∈ [0,1]; u(0,x) = -sin(πx); u(t,±1) = 0; ν = 0.01/π (shock) and 0.1/π (control). Reference: Cole-Hopf solution or fine-grid solve.

**2D:** u_t + u·u_x + v·u_y = ν(u_xx + u_yy) and v_t + u·v_x + v·v_y = ν(v_xx + v_yy), (x,y) ∈ [0,1]², t ∈ [0,1]; Dirichlet boundaries; smooth initial presets. There is no general closed form, so the reference is a high-resolution numerical solver (`core/reference/fd_solver_2d.py`), validated by a grid-independence test (50², 100², 200², 400², mirroring the paper) and a manufactured-solution test. Residuals are computed with autograd for both components; the loss sums both momentum residuals.

**One abstraction for both:** a `PDEProblem` base class exposes `input_dim` (2 or 3), `output_dim` (1 or 2), `residual(model, x)`, `ic_points()`, `bc_points()` and `reference(grid)`. `Burgers1D` and `Burgers2D` implement it, so the sampler, trainer, RI logic, metrics and API treat them identically.

### 3.2 Models (paper-derived defaults)
MLP with 6 layers (activation assumed tanh; the paper does not state it). Inputs (x,t) → u for 1D, (x,y,t) → (u,v) for 2D. Fourier features γ(X) = [cos(2πβX), sin(2πβX)], β ~ N(0,σ), paper σ = 3, S = 128. All compared models are parameter-matched. Adam. LHS sampling (paper: 20k collocation plus 4k boundary points; Burgers default 10–20k plus 2k). Loss weights: λ_BC = 5, λ_RI = 1.

### 3.3 Losses
- No-RI: L_G + λ_BC·L_BC + λ_IC·L_IC (paper Eq. 5)
- RI: L_RI = (1/N_dr) Σ |R(x_dr) − NN(x_dr; θ)|² (paper Eq. 4)
- With-RI: no-RI loss + λ_RI·L_RI (paper Eq. 6)
- Random targets R ~ U[0,1] in the paper. For Burgers use U[-1,1] (configurable).

### 3.4 RI trainer
```
Phase 1 (search, lr 5e-5, ≤100k epochs):
  every detect_every (2000) epochs:
      metric = detection_metric(colloc); X_dr = lowest A% (30)
  during the first ri_duration (500) epochs after each detection:
      use with-RI loss, otherwise no-RI loss
  keep best checkpoint by total loss; stop after 10k epochs without improvement
Phase 2 (fine-tune, lr 5e-6, ≤50k epochs):
  RI off, same patience stopping
```
Detection metric: paper Eq. 3 is Σ|∂V_j/∂X_i|. For Burgers, implement three variants: (1) |u_x|, (2) |u_x| + |u_t|, (3) variant 2 with high-residual points excluded. Ablate all three. For 2D, the metric sums over spatial inputs and both velocity components, Σ_i Σ_j |∂V_j/∂X_i| with i ∈ {x,y}, j ∈ {u,v} (plus the time derivative in variants 2 and 3), which is the direct analogue of the paper's Eq. 3. The 2D detected-region map is shown on the (x,y) plane at a selectable time.

### 3.5 Evaluation
MSE, relative L2, shock-position error (max |u_x| at t = 0.5 and 1.0), epochs, wall-clock, mean ± std over ≥ 5 seeds. Reference error is for evaluation only and never used to select checkpoints.

### 3.6 1D and 2D Burgers: numerics, sampling and data formats

**Loss (both dimensions).** L = L_PDE + λ_BC·L_BC + L_IC (+ λ_RI·L_RI during the search phase). L_PDE is the mean squared residual (summed over both momentum equations in 2D); L_BC and L_IC are mean squared errors at boundary and initial points. λ_BC = 5 and λ_RI = 1 follow the paper; the IC weight of 1 is an assumption to tune.

**1D reference (Cole-Hopf).** With f(y) = exp(−cos(πy) / (2πν)):

u(x,t) = − ∫ sin(π(x−η)) f(x−η) exp(−η²/(4νt)) dη  /  ∫ f(x−η) exp(−η²/(4νt)) dη

Evaluate with Gauss-Hermite quadrature in log-space (log-sum-exp) so that ν = 0.01/π does not overflow. At t = 0 use the initial condition directly.

**2D reference solver (`fd_solver_2d.py`).**

| Item | Choice |
|---|---|
| Grid | Uniform N×N on [0,1]², N ∈ {50, 100, 200, 400} for the grid-independence study, N = 200 as the default reference |
| Form | Advective (non-conservative) form, matching the PDE as written |
| Convection | Third-order upwind-biased differences for u_x, u_y, v_x, v_y, with the upwind direction chosen by the sign of the local velocity (first-order upwind used as a robustness fallback) |
| Diffusion | Second-order central differences |
| Time stepping | SSP-RK3 with adaptive dt = min(CFL·h / max(|u|,|v|), h² / (4ν) · 0.5), CFL ≤ 0.4 |
| Boundaries | Dirichlet (zero) on all four edges |
| Checks | Grid-independence (relative L2 change between successive grids below a documented tolerance); manufactured-solution test with a forcing term to confirm the observed convergence order |

Both scheme and tolerances are design proposals to be confirmed in M7.

**Sampling.** LHS over the space-time box: 1D uses (x,t) ∈ [−1,1]×[0,1]; 2D uses (x,y,t) ∈ [0,1]³. Default counts: 1D 10–20k collocation + 2k boundary/initial points; 2D 30k collocation + 6k boundary/initial points, capped per tier (§6.1).

**Snapshot and artifact format.** The worker writes binary artifacts so the browser can upload them straight to a GPU texture.

| Field | 1D | 2D |
|---|---|---|
| Header (JSON, first 256 bytes, padded) | `{dtype:"f16", shape:[T,X], channels:1, vmin, vmax, t:[…]}` | `{dtype:"f16", shape:[T,Y,X], channels:2, vmin, vmax, t:[…]}` |
| Body layout | `[t][x]` | `[t][y][x][c]` with c = (u, v) |
| Typical size | 256×100 → about 51 KB | 64×64×50 frames×2 channels → about 820 KB |

Artifact names per run: `config.yaml`, `loss_history.json`, `reference.bin`, `prediction_final.bin`, `error.bin`, `regions.json`, `pca.json`, `figures/*.png`.

## 4. API Design (REST + SSE)

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/auth/login`, `/refresh`, `/logout` | Sessions |
| POST | `/v1/runs` | Validate config, check quota, enqueue (returns 202 + run ID) |
| GET | `/v1/runs` | List own runs (paginated, allowlisted filters and sorts) |
| GET | `/v1/runs/{id}` | Run detail, metrics (ownership enforced) |
| POST | `/v1/runs/{id}/cancel` | Cancel |
| GET | `/v1/runs/{id}/stream` | SSE live metrics |
| GET | `/v1/runs/{id}/artifacts/{name}` | Short-lived signed URL |
| GET | `/v1/compare?ids=…` | Multi-run comparison |
| Admin | `/v1/admin/users`, `/quotas`, `/audit`, `/block` | Admin-only |

`POST /v1/runs` accepts a `dimension` field (1 or 2) and validates against the matching per-dimension schema. `GET /v1/presets` lists 1D/2D presets. Conventions: versioned paths, Pydantic schemas with strict types, uniform error body with request ID, cursor pagination, idempotency key on `POST /runs`.

### 4.1 Endpoint reference

Base path `/api/v1`. All endpoints except `/auth/login`, `/auth/refresh` and health checks require `Authorization: Bearer <access token>`. Health checks live at `/healthz` and `/readyz` outside `/api/v1` and are not exposed through the public edge.

| Method and path | Request | Success response | Errors |
|---|---|---|---|
| `POST /auth/login` | `{email, password}` (+ `totp` if MFA) | `200 {access_token, expires_in}` and a refresh cookie | 401, 422, 429 |
| `POST /auth/refresh` | refresh cookie + CSRF header | `200 {access_token, expires_in}` | 401 |
| `POST /auth/logout` | refresh cookie + CSRF header | `204` | 401 |
| `GET /me` | none | `200 {id, email, role}` | 401 |
| `GET /me/quota` | none | `200 {gpu_minutes_used, gpu_minutes_limit, active_jobs, max_active_jobs, resets_at}` | 401 |
| `GET /presets` | `?dimension=1\|2` (optional) | `200 [{id, name, dimension, config}]` | 401 |
| `POST /runs` | header `Idempotency-Key`; body: run config (below) | `202 {run_id, status:"queued", estimated_gpu_minutes}` | 400/422 invalid config, 409 duplicate key with different body, 429 quota or queue full |
| `GET /runs` | `?cursor&limit≤50&status&dimension&model&sort=created_at\|final_l2` | `200 {items:[RunSummary], next_cursor}` | 401, 422 |
| `GET /runs/{id}` | none | `200 RunDetail` | 401, 404 |
| `POST /runs/{id}/cancel` | none | `202 {status:"cancelling"}` | 404, 409 already finished |
| `DELETE /runs/{id}` | none | `204` | 404, 409 still running |
| `GET /runs/{id}/stream` | header `Last-Event-ID` (optional) | `200 text/event-stream` (events in §11.4) | 401, 404, 429 too many streams |
| `GET /runs/{id}/artifacts` | none | `200 [{name, size, content_type}]` | 404 |
| `GET /runs/{id}/artifacts/{name}` | none | `200 {url, expires_in}` (signed, about 5 min) | 404 |
| `GET /compare` | `?ids=a,b,c` (max 6, all owned by caller) | `200 {runs:[…], metrics:{mean, std, per_seed}}` | 404, 422 |
| `GET/PATCH /admin/users`, `GET/PUT /admin/quotas`, `GET /admin/audit`, `POST /admin/block`, `POST /admin/unblock` | admin role required | `200/204` | 403 |

**RunSummary:** `{id, name, dimension, model, status, phase, progress, final_l2, created_at}`.
**RunDetail:** RunSummary plus `{config, seed, git_hash, versions, metrics:{mse, rel_l2, shock_pos_err, epochs, wall_clock_s}, artifacts:[names]}`.
**Status values:** `queued`, `running`, `cancelling`, `cancelled`, `succeeded`, `failed`.

**Error body (all endpoints):**
```json
{"error": {"code": "quota_exceeded", "message": "Concurrent job limit (2) reached.", "request_id": "01J..."}}
```

**Example: 1D run config (`POST /runs`)**
```json
{
  "dimension": 1,
  "name": "RI-PINN shock",
  "problem": {"nu": 0.003183, "ic_preset": "neg_sin", "t_max": 1.0},
  "model": {"type": "ri", "layers": 6, "width": 128, "fourier_sigma": 3, "fourier_size": 128},
  "ri": {"threshold_pct": 30, "period": 2000, "duration": 500, "lambda_ri": 1, "detect_variant": 1},
  "training": {"seed": 0, "n_colloc": 15000, "lr_phase1": 5e-5, "lr_phase2": 5e-6, "patience": 10000, "seeds": [0,1,2,3,4]}
}
```
The 2D example is in §11.7. Both are validated by the matching Pydantic model (`run_config_1d`, `run_config_2d`) with `extra="forbid"` so unknown fields are rejected.

## 5. Data Model (PostgreSQL)

`users(id, email, password_hash, role, status)` · `api_keys(id, user_id, key_hash, last_used, revoked)` · `runs(id, user_id, config_json, seed, status, phase, created_at, finished_at, git_hash)` · `run_metrics(run_id, epoch, loss, phase)` · `run_results(run_id, mse, rel_l2, shock_err, epochs, wall_s)` · `artifacts(id, run_id, name, object_key)` · `quotas(user_id, gpu_min_limit, gpu_min_used, max_active_jobs)` · `audit_log(id, user_id, action, ip, ts, detail)`

Indexes on `(user_id, created_at)` and `(run_id, epoch)`. Every query is filtered by `user_id` unless the caller is an admin.

## 6. Security Architecture

### 6.1 DoS and DDoS protection (layered)

| Layer | Control |
|---|---|
| **Edge (DDoS)** | CDN with managed DDoS protection; WAF managed rules plus rate rules; bot challenge on login and signup; origin firewall allows only edge IP ranges; anycast absorbs volumetric floods. The app tier cannot stop large volumetric attacks alone, so the edge is mandatory. |
| **Proxy** | Client header and body timeouts (slowloris defense); max body 1 MB for JSON (uploads separate, capped); max connections per IP; HTTP/2 stream limits; request buffering. |
| **API rate limiting** | Redis-backed token bucket per IP (anonymous), per user and per API key. Stricter limits on `/auth/*` (for example 5/min per IP+account) and on `POST /runs`. Response: `429` with `Retry-After`. |
| **Expensive-operation guards** | The heavy work is training, so it is bounded: max epochs, collocation points, layers × width, seeds per request, and wall-clock timeout per job, **with separate, stricter caps for 2D runs** (more input dimensions and two outputs make them costlier) and GPU-tier-only access for large 2D jobs; per-user concurrent jobs (for example 2) and GPU-minute quota; global bounded queue with backpressure (reject when full rather than grow unbounded); SSE connections capped per user. |
| **Resource isolation** | Worker containers have CPU/GPU/memory/time limits and no inbound network; one user's job cannot starve the API tier. |
| **Resilience** | Timeouts and circuit breakers on DB, Redis and storage calls; autoscaling with a hard maximum to prevent cost-exhaustion attacks; health-check-based ejection; graceful degradation (read-only mode if the queue is saturated). |
| **Response** | Alerts on request-rate spikes, 429 ratios and queue depth; automated temporary IP/user blocks; admin block action. |

### 6.2 SQL injection prevention
1. **Parameterized queries only.** Use SQLAlchemy ORM or bound parameters. String concatenation or f-strings in SQL are forbidden and enforced by lint rules and code review.
2. **Validate every input** with Pydantic (types, ranges, lengths, enums). UUIDs for IDs.
3. **Allowlist dynamic identifiers.** Sort and filter fields map from a fixed dictionary, never taken from user text.
4. **Least privilege.** The API's DB role has only the needed `SELECT/INSERT/UPDATE` on its tables; no DDL and no superuser; workers use a separate, narrower role; migrations run under a separate role.
5. **Defense in depth.** WAF SQLi rules at the edge; generic error messages (no SQL or stack traces to clients); DB statement timeouts.
6. **Verify.** Static analysis (Bandit/Semgrep) and automated injection tests in CI; pre-release penetration test.

### 6.3 Other controls
- **Auth:** Argon2id password hashes; MFA for admins; short-lived access tokens (about 15 min) with rotating refresh tokens; login throttling and lockout backoff.
- **Authorization:** RBAC plus per-resource ownership checks on every run ID (no IDOR); artifact downloads via short-lived signed URLs.
- **Unsafe input:** `yaml.safe_load`; no pickle; `torch.load(weights_only=True)`; reject unknown config keys; path traversal checks; upload type and size limits.
- **Web hardening:** TLS 1.2+/HSTS; strict CSP; `SameSite` and `HttpOnly` cookies; CSRF protection; explicit CORS allowlist; output escaping.
- **Secrets:** secrets manager, never in repo or images; rotated keys.
- **Network:** private subnets for DB, Redis and workers; workers egress-restricted.
- **Data:** encryption at rest; backups with tested restores; retention policy.
- **Supply chain:** pinned dependencies, image and dependency scanning in CI, SBOM, signed images.
- **Audit:** immutable structured logs of logins, run creation, admin actions; no secrets or tokens in logs.

## 7. Deployment and Operations
- Environments: dev, staging, prod, with infrastructure as code and CI/CD gates (tests, lint, security scans).
- Autoscale API replicas on CPU and request rate; scale GPU workers on queue depth within a fixed ceiling.
- SLOs: API 99.5%, p95 < 300 ms (non-training), stream lag < 3 s.
- Dashboards and alerts: latency, error rate, 429 rate, queue depth, GPU utilization, failed logins, DB connections.
- Backups: daily DB snapshots plus object-store versioning; quarterly restore test.

## 8. Testing Strategy

| Type | Coverage |
|---|---|
| Unit | PDE residual ≈ 0 on the analytical solution; LHS bounds; detector returns exactly A% of points; RI loss inactive outside its window |
| Integration | Enqueue, train (tiny config), results, artifact flow |
| Scientific | Cavity reproduction near paper Table 1 (RI MSE ~1e-4; N-PINN ~1e-2) |
| Security | SQLi payload suite, IDOR tests, auth and rate-limit tests, dependency scans, pre-release penetration test |
| Load and DoS | Load test at 10× expected traffic; verify 429s and queue backpressure, not crashes; slowloris simulation against staging |
| UI | Component tests, end-to-end wizard flow for 1D and 2D, axe accessibility checks, visual regression on viewers, Lighthouse performance budget in CI, reduced-motion tests |
| Contract | Generated API client is up to date in CI; schema-conformance tests for SSE events |

## 9. Acceptance Criteria
1. The full flow (login → configure → train → compare → export) works end to end.
2. The cavity reproduction lands in the paper's MSE order of magnitude for RI-PINN and shows clear failure for N-PINN.
3. Every paper hyperparameter is configurable.
4. SQLi test suite passes with zero injectable endpoints; all DB access is parameterized.
5. Both 1D and 2D Burgers run end to end (wizard → train → live monitor → viewer → compare); the 2D solver passes the grid-independence and manufactured-solution checks.
6. Frontend meets the performance budget and motion-accessibility rules (§12); the generated API client matches the live schema.
7. Under 10× load and simulated slowloris, the service degrades gracefully (rate limits and queue backpressure) and recovers without manual action.
8. No critical or high findings remain in the pre-release penetration test or dependency scans.

## 10. Repository Folder Structure

```
burgersflow/
├── README.md
├── docs/ (PRD.md, TRD.md, architecture/, adr/)
├── apps/
│   ├── web/                       # React + TypeScript (Vite)
│   │   ├── public/                # static assets, fonts, shader/texture files
│   │   ├── src/
│   │   │   ├── app/               # routes: landing, dashboard, runs/[id], compare, admin
│   │   │   ├── components/
│   │   │   │   ├── ui/            # buttons, inputs, dialogs (design system)
│   │   │   │   ├── charts/        # LossChart, MetricsTable, PCAPlot
│   │   │   │   ├── animation/     # FlowHero, PageTransition, CountUp, Reveal
│   │   │   │   └── layout/        # AppShell, Sidebar, Topbar
│   │   │   ├── features/
│   │   │   │   ├── wizard/        # 4-step experiment wizard (1D/2D aware)
│   │   │   │   ├── monitor/       # live training view
│   │   │   │   ├── viewer1d/      # x-t heatmap, time slices
│   │   │   │   ├── viewer2d/      # WebGL field, scrubber, arrows/streamlines
│   │   │   │   ├── results/  compare/  pca/  admin/
│   │   │   ├── hooks/             # useAuth, useRunStream, useReducedMotion
│   │   │   ├── lib/               # apiClient.ts, sse.ts, queryClient.ts, webgl/
│   │   │   ├── api/generated/     # OpenAPI-generated types and client
│   │   │   └── styles/            # tokens.css, theme (light/dark)
│   │   ├── tests/ (unit, e2e)
│   │   └── package.json, vite.config.ts, tsconfig.json
│   ├── api/                       # FastAPI gateway
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── core/              # config.py, security.py, rate_limit.py, logging.py
│   │   │   ├── middleware/        # request_id, limits, security_headers
│   │   │   ├── api/v1/            # auth.py, runs.py, stream.py, compare.py, admin.py
│   │   │   ├── schemas/           # Pydantic models (run_config_1d, run_config_2d, ...)
│   │   │   ├── models/            # SQLAlchemy ORM
│   │   │   ├── repositories/      # the only layer that touches the DB (parameterized)
│   │   │   └── services/          # run_service.py, quota_service.py, artifact_service.py
│   │   ├── migrations/            # Alembic
│   │   └── tests/
│   └── worker/
│       ├── tasks/train_run.py     # loads config -> core trainer -> publishes progress
│       ├── runtime/               # resource limits, sandbox, timeouts
│       └── tests/
├── core/                          # package: burgersflow_core
│   ├── pdes/                      # base.py, heat.py, wave.py, burgers1d.py, burgers2d.py
│   ├── models/                    # mlp.py, fourier_features.py
│   ├── losses/                    # pde.py, bc_ic.py, reinit.py
│   ├── sampling/                  # lhs.py
│   ├── training/                  # trainer.py, region_detector.py, schedules.py
│   ├── reference/                 # cole_hopf.py, fd_solver_2d.py
│   ├── evaluation/                # metrics.py, pca.py
│   └── tests/
├── configs/                       # burgers1d_shock.yaml, burgers2d_pulse.yaml, cavity_re1000.yaml
├── infra/                         # docker/, k8s/, nginx/, waf/, terraform/
├── scripts/                       # run_experiment.py, export_openapi.py, seed_db.py
├── .github/workflows/             # ci.yml (tests, lint, SAST, dependency and image scan)
├── docker-compose.yml
└── .env.example
```

**Boundaries:** `core/` has no web or DB dependencies and is used by `apps/worker` (and by the CLI). `apps/api` never imports training code. `repositories/` is the only place that builds queries. `apps/web` depends only on the generated API client.

### 10.1 Key files and what they do

| File | Purpose |
|---|---|
| `apps/web/vite.config.ts` | Dev proxy: `/api` → `http://localhost:8000` |
| `apps/web/src/lib/apiClient.ts` | Single `fetch` wrapper: base URL, auth header, refresh-once-on-401, error normalization |
| `apps/web/src/lib/sse.ts` | Fetch-based SSE reader with reconnect and `Last-Event-ID` |
| `apps/web/src/hooks/useRunStream.ts` | Subscribes to a run's stream and exposes phase, metrics, regions, snapshots |
| `apps/web/src/components/animation/FlowHero.tsx` | WebGL particle flow field for the landing hero |
| `apps/web/src/features/viewer2d/FieldViewer.tsx` | Float-texture field renderer with time scrubber |
| `apps/api/app/main.py` | App factory, middleware, router registration |
| `apps/api/app/api/v1/runs.py` | Run endpoints (validate → quota → enqueue) |
| `apps/api/app/api/v1/stream.py` | SSE endpoint fed by Redis pub/sub |
| `apps/api/app/schemas/run_config_1d.py`, `run_config_2d.py` | Strict per-dimension config models and caps |
| `apps/worker/tasks/train_run.py` | Job entry point: build problem from config, train, publish progress, upload artifacts |
| `core/pdes/burgers1d.py`, `burgers2d.py` | PDE residuals, IC/BC point generators, reference hooks |
| `core/reference/cole_hopf.py`, `fd_solver_2d.py` | 1D analytic and 2D numerical references |
| `core/training/region_detector.py`, `schedules.py` | Detection variants and re-init schedule |
| `scripts/build_landing_field.py` | Precomputes the compact Burgers field used by the landing hero |
| `scripts/export_openapi.py` | Dumps the OpenAPI schema for client generation |
| `infra/nginx/default.conf` | Single-origin routing and SSE-safe proxy settings |

Additional top-level items: `.env.example` (documented variables, no secrets), `Makefile` (`make dev`, `make test`, `make gen-api`), `docker-compose.yml` (web, api, worker, redis, postgres).

## 11. Frontend-Backend Integration

### 11.1 Topology and routing
```
Browser ──HTTPS──► CDN/WAF ──► Reverse proxy
                                 ├── /          → static SPA (apps/web build)
                                 ├── /api/v1/*  → FastAPI (REST + SSE)
                                 └── (nothing else reaches workers, DB or storage)
```
Single origin means no CORS for production and simple `SameSite` cookies. In development, the Vite dev server proxies `/api` to `localhost:8000`. If a separate origin is ever needed, use an explicit CORS allowlist (no wildcard with credentials).

### 11.2 Typed contract
1. FastAPI publishes the OpenAPI schema. `scripts/export_openapi.py` dumps it in CI.
2. `openapi-typescript` (or `orval`) generates `apps/web/src/api/generated/`. The build fails if generated types are out of date.
3. `lib/apiClient.ts` wraps `fetch`: base URL `/api/v1`, JSON handling, request-ID header, error normalization, automatic token refresh.
4. TanStack Query manages caching, retries (never retry `POST`), polling fallback, and invalidation after mutations.

### 11.3 Authentication flow
- `POST /auth/login` returns a short-lived **access token** (kept in memory only, never in `localStorage`) and sets a rotating **refresh token** in an `HttpOnly; Secure; SameSite=Strict` cookie.
- On `401`, the client calls `/auth/refresh` once, retries the original request, and otherwise redirects to login.
- Cookie-authenticated mutations require a CSRF token header.

### 11.4 Launching and watching a run
```
UI                         API                     Queue/Worker            Storage/DB
│ POST /runs (config,      │                       │                       │
│  Idempotency-Key)───────►│ validate (Pydantic),  │                       │
│                          │ check quota ─────────►│ enqueue job           │ insert run
│◄── 202 {run_id} ─────────│                       │                       │
│ GET /runs/{id}/stream    │                       │ train (core)          │
│  (SSE)──────────────────►│◄── Redis pub/sub ─────│ publish progress      │
│◄── event: phase/metrics  │                       │ checkpoints ─────────────────► save
│◄── event: snapshot       │                       │                       │
│◄── event: done           │                       │ final metrics ───────────────► save
│ GET /runs/{id}           │                       │                       │
│ GET artifact (signed URL)│                       │                       │
```

**SSE event schema** (JSON, one per event):

| Event | Payload |
|---|---|
| `phase` | `{phase: "search" or "finetune", epoch}` |
| `metrics` | `{epoch, loss, best_loss, patience, lr}` (throttled to about 1 per 2 s) |
| `regions` | `{n_detected, sample: [[x,y],...]}` (downsampled point set) |
| `snapshot` | `{epoch, kind: "1d" or "2d", artifact_url}` for grids |
| `done` / `error` | final status, metrics summary or error code and request ID |

Large grids (for example a 64×64×frames 2D field) are written by the worker as compact binary artifacts (float16) and fetched through signed URLs. The stream carries only small JSON messages, so it stays light. The stream is read with a fetch-based SSE client so it can send the bearer header (see §11.8). If SSE drops, the client reconnects with `Last-Event-ID` and falls back to polling `GET /runs/{id}`.

### 11.5 Screen-to-endpoint map

| Screen | Endpoints |
|---|---|
| Wizard | `GET /v1/presets`, `POST /v1/runs` (config includes `dimension: 1 or 2`) |
| Dashboard / list | `GET /v1/runs`, `GET /v1/me/quota` |
| Live Monitor | `GET /v1/runs/{id}/stream` |
| Results and viewers | `GET /v1/runs/{id}`, artifact signed URLs |
| Compare | `GET /v1/compare?ids=…` |
| Admin | `/v1/admin/*` |

### 11.6 Error contract and UX mapping
Uniform error body `{error: {code, message, request_id}}`. `400/422` show inline field errors in the wizard; `401` triggers refresh/login; `403` shows a permission screen; `404` shows a not-found state (also returned for other users' runs); `409` handles duplicate submissions; `429` shows a banner with a countdown from `Retry-After`; `5xx` shows a retry card with the request ID.

### 11.7 Run config (same endpoint for 1D and 2D)
```json
{
  "dimension": 2,
  "problem": {"nu": 0.003, "ic_preset": "gaussian_pulse", "t_max": 1.0},
  "model": {"type": "ri", "layers": 6, "width": 128, "fourier_sigma": 3, "fourier_size": 128},
  "ri": {"threshold_pct": 30, "period": 2000, "duration": 500, "lambda_ri": 1, "detect_variant": 2},
  "training": {"seed": 0, "n_colloc": 30000, "lr_phase1": 5e-5, "lr_phase2": 5e-6, "patience": 10000}
}
```
Server-side schemas (`run_config_1d`, `run_config_2d`) enforce per-dimension caps (TRD §6.1): for example, lower max points and epochs on CPU tiers, higher on GPU tiers for 2D.

### 11.8 Code patterns (illustrative skeletons)

**Dev proxy: `apps/web/vite.config.ts`**
```ts
export default defineConfig({
  server: { proxy: { "/api": { target: "http://localhost:8000", changeOrigin: false } } },
});
```

**Production routing: `infra/nginx/default.conf`**
```nginx
location /api/ {
    proxy_pass http://api:8000;
    proxy_set_header X-Request-ID $request_id;
    proxy_read_timeout 3600s;     # long-lived SSE
}
location /api/v1/runs/ {          # stream endpoints
    proxy_pass http://api:8000;
    proxy_buffering off;          # deliver SSE events immediately
    proxy_cache off;
}
location / { try_files $uri /index.html; }   # static SPA
```

**API client: `apps/web/src/lib/apiClient.ts`**
```ts
let accessToken: string | null = null;            // memory only

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const doFetch = () => fetch(`/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json",
               ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
               ...init.headers },
  });
  let res = await doFetch();
  if (res.status === 401 && path !== "/auth/refresh") {
    if (await refresh()) res = await doFetch();    // refresh once, retry once
  }
  if (!res.ok) throw await normalizeError(res);    // {code, message, request_id}
  return res.status === 204 ? (undefined as T) : res.json();
}
```

**Live stream: `apps/web/src/hooks/useRunStream.ts`.** The browser's built-in `EventSource` cannot send an `Authorization` header, and putting tokens in URLs leaks them into logs. So the stream uses a fetch-based SSE reader (for example `@microsoft/fetch-event-source`) that sends the bearer token, and reconnects with `Last-Event-ID`.
```ts
fetchEventSource(`/api/v1/runs/${id}/stream`, {
  headers: { Authorization: `Bearer ${getToken()}` },
  onmessage(ev) {
    const data = JSON.parse(ev.data);
    if (ev.event === "metrics") pushMetrics(data);
    if (ev.event === "snapshot") loadArtifact(data.artifact_url, data.kind);
    if (ev.event === "done") close();
  },
  openWhenHidden: false,        // pause when the tab is hidden
});
```

**Stream endpoint: `apps/api/app/api/v1/stream.py`**
```python
@router.get("/runs/{run_id}/stream")
async def stream(run_id: UUID, user: User = Depends(current_user)):
    run = await runs_repo.get_owned(run_id, user.id)      # 404 if not owner
    async def gen():
        async for msg in redis_channel(f"run:{run.id}"):  # published by the worker
            yield f"id: {msg.id}\nevent: {msg.event}\ndata: {msg.json}\n\n"
    return StreamingResponse(gen(), media_type="text/event-stream")
```

**Contract generation**
```bash
python scripts/export_openapi.py > apps/web/openapi.json
npx openapi-typescript apps/web/openapi.json -o apps/web/src/api/generated/schema.ts
```

## 12. Animated Frontend Architecture

**Stack:** React, TypeScript, Vite, Tailwind CSS with design tokens, **Framer Motion** (UI/route/spring animations), **WebGL** for scientific rendering (regl or three.js, lazy-loaded) with Canvas 2D fallback, Plotly or ECharts for standard charts, TanStack Query, Zustand for light UI state.

| Element | Implementation |
|---|---|
| Landing hero | WebGL particle flow field advected by a precomputed Burgers velocity field; scroll position controls time so the shock steepens as the user scrolls; static gradient fallback |
| Field viewers | Solution uploaded as a float texture; fragment shader applies a perceptually uniform colormap, so scrubbing time is a cheap uniform update (smooth 60 fps) |
| 2D extras | Instanced arrows or GPU streamlines for (u,v); vorticity shader toggle; slice lines with linked 1D plots |
| Compare | Animated reveal slider between reference and prediction; shared color scale |
| Charts | Loss curve draws progressively as events arrive; animated counters for metrics |
| Wizard | Spring-animated step transitions; live resource-estimate gauge |
| Region overlay | Detected points fade in and out as re-initialization windows open and close |
| Shell | Staggered card reveals, skeleton loaders, glass panels, gradient mesh background |

**Performance budget:** initial JS < 250 KB gzipped (route-level code splitting; WebGL chunk loaded on demand); LCP < 2.5 s; 60 fps target; pause rendering when the tab is hidden; cap device-pixel-ratio on mobile; throttle stream updates.

**Accessibility and safety of motion:** `prefers-reduced-motion` disables parallax and particle motion (static frames, instant transitions); every animation is pausable; no flashing above WCAG thresholds; charts keep data-table fallbacks; WebGL-unavailable devices get Canvas 2D or static images.

**Security interplay:** no inline scripts or `eval` (shaders bundled as assets), strict CSP kept intact, fonts and textures self-hosted, artifact URLs validated before use.

### 12.1 Design tokens: `styles/tokens.css`
```css
:root[data-theme="dark"] {
  --bg: #0B0F1A;  --surface: rgba(255,255,255,0.06);  --border: rgba(255,255,255,0.10);
  --text: #E6EAF2;  --muted: #8B95A7;
  --accent-a: #38BDF8;  --accent-b: #8B5CF6;  --shock: #F97316;
  --ok: #22C55E;  --warn: #F59E0B;  --danger: #EF4444;
  --radius: 16px;  --blur: 16px;
}
:root[data-theme="light"] {
  --bg: #F7F9FC;  --surface: #FFFFFF;  --border: rgba(15,23,42,0.12);
  --text: #0F172A;  --muted: #475569;  --accent-a: #0369A1;  --accent-b: #6D28D9;
}
```
Theme follows the system setting by default and is overridable in Settings. Tailwind reads these variables so components never hardcode colors.

### 12.2 Motion tokens

| Token | Value |
|---|---|
| Durations | fast 150 ms, base 250 ms, slow 400 ms, hero 700 ms |
| Easing | standard `cubic-bezier(0.2, 0, 0, 1)` |
| Spring (wizard, cards) | stiffness 260, damping 24 |
| Stagger | 60 ms between siblings |
| Counter | 800 ms ease-out |

All values live in `lib/motion.ts`; a `useReducedMotion` hook swaps springs for instant transitions.

### 12.3 Landing hero pipeline

1. `scripts/build_landing_field.py` evaluates the 1D Cole-Hopf solution (and a coarse 2D solver frame set) and writes a small float16 texture, about 256×128 for 1D, to `apps/web/public/landing/field.bin`.
2. `FlowHero` uploads it as a texture. A vertex shader advects the particles by the field's velocity; a fragment shader colors each by speed using the cyan→violet ramp, with the shock front highlighted in orange.
3. Particle count adapts to the device: about 20k on desktop, 4k on mobile, 0 (static image) when reduced motion is on, WebGL is missing, or the device reports low power mode.
4. Scroll progress from the page maps to simulation time, so the shock steepens as the visitor scrolls (section 2 of the landing spec, PRD §8.2).

### 12.4 2D viewer data path

`snapshot` SSE event → fetch signed URL → read the binary artifact (§3.6 header + body) → upload as an RG16F texture of shape (X, Y, T) or as T slices → time scrubber sets a `uTime` uniform → fragment shader interpolates between adjacent frames, applies the colormap, and optionally overlays streamlines or vorticity. Scrubbing therefore needs no network round trips and no CPU-side recomputation.

## 13. Open Questions
Hosting provider and edge/WAF product; SSO/IdP; retention policy; Which 2D presets ship first; framework (PyTorch assumed). Cross-check the authors' repo (github.com/jongmok7/RI-PINN) to resolve paper ambiguities (re-init schedule wording, activation function, whether random targets are resampled each step).
