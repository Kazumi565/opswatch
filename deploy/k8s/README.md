# OpsWatch Kubernetes Deployment

OpsWatch 0.4.0 adds a Kubernetes deployment track with a local-first acceptance path and an AWS-ready overlay.

The default workflow costs $0 because it runs locally and only renders the AWS overlay. Do not apply the AWS overlay as part of normal project acceptance.

## Layout

- `base/`: shared Kubernetes objects for API, frontend, worker, scheduler, Postgres, Redis, migration Job, backup CronJob, Services, PVCs, ConfigMaps, Secret examples, probes, resource limits, and Ingress.
- `overlays/local/`: local k3d/k3s overlay using local image tags.
- `overlays/aws/`: AWS k3s overlay using GHCR placeholders and AWS runtime metadata.

## Render Manifests

```bash
make k8s-render
```

This writes:

- `/tmp/opswatch-k8s-local.yaml`
- `/tmp/opswatch-k8s-aws.yaml`

## Local k3d Smoke Path

### 1. Create a local cluster

```bash
k3d cluster create opswatch --servers 1 --agents 1 --wait
kubectl config use-context k3d-opswatch
kubectl cluster-info
```

### 2. Build local images

Build the backend images through Docker Compose:

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml --profile frontend --profile observability build
```

Tag the backend images for Kubernetes:

```bash
docker tag opswatch-api:latest opswatch-api:local
docker tag opswatch-worker:latest opswatch-worker:local
docker tag opswatch-scheduler:latest opswatch-scheduler:local
```

Build the frontend image with the Kubernetes API service name baked into the Next.js rewrite config:

```bash
docker build \
  --build-arg OPSWATCH_API_ORIGIN=http://opswatch-api:8000 \
  -t opswatch-frontend:local \
  ./frontend
```

Import the local images into k3d:

```bash
k3d image import \
  opswatch-api:local \
  opswatch-worker:local \
  opswatch-scheduler:local \
  opswatch-frontend:local \
  -c opswatch
```

### 3. Deploy

```bash
make k8s-local-up
make k8s-status
```

Expected result:

- API deployment rolls out.
- Worker deployment rolls out.
- Scheduler deployment rolls out.
- Frontend deployment rolls out.
- Migration Job completes.
- Postgres and Redis are running.

### 4. Check API readiness

In one terminal:

```bash
kubectl -n opswatch port-forward svc/opswatch-api 8000:8000
```

In another terminal:

```bash
curl -f http://localhost:8000/health/ready
```

Expected response includes:

```json
{
  "status": "ready",
  "ready": true
}
```

### 5. Bootstrap demo data and admin user

Seed demo monitors/incidents:

```bash
kubectl -n opswatch exec deployment/opswatch-api -- python demo_seed.py
```

Create the first admin user:

```bash
kubectl -n opswatch exec deployment/opswatch-api -- python create_admin.py \
  --email admin@example.com \
  --display-name "Ops Admin" \
  --password admin12345
```

Login credentials:

- Email: `admin@example.com`
- Password: `admin12345`

The password must be at least 8 characters.

### 6. Open the frontend

If local port `3000` is already used by Grafana, forward the Kubernetes frontend to local port `3001`:

```bash
kubectl -n opswatch port-forward svc/opswatch-frontend 3001:3000
```

Open:

```text
http://localhost:3001
```

If port `3000` is free, you can instead use:

```bash
kubectl -n opswatch port-forward svc/opswatch-frontend 3000:3000
```

and open:

```text
http://localhost:3000
```

### 7. Verify Runtime/Cloud

After login, open the Runtime page.

Expected values for local k3d:

- Deployment mode: `local-k3d`
- Orchestrator: `kubernetes`
- Cloud provider: `local`
- Namespace: `opswatch`
- Pod: `opswatch-api-...`
- Node: `k3d-opswatch-...`
- Image tag: `local`
- API version: `v0.4.0-local`
- Health: `ok`

## Required Frontend Kubernetes Env

The frontend deployment must bind to all interfaces for Kubernetes port-forwarding and probes to work.

`deploy/k8s/base/frontend-deployment.yaml` should include:

```yaml
env:
  - name: HOSTNAME
    value: "0.0.0.0"
  - name: PORT
    value: "3000"
  - name: OPSWATCH_API_ORIGIN
    valueFrom:
      configMapKeyRef:
        name: opswatch-config
        key: OPSWATCH_API_ORIGIN
  - name: NEXT_TELEMETRY_DISABLED
    valueFrom:
      configMapKeyRef:
        name: opswatch-config
        key: NEXT_TELEMETRY_DISABLED
```

`deploy/k8s/base/configmap.yaml` should include:

```yaml
OPSWATCH_API_ORIGIN: http://opswatch-api:8000
```

The frontend Docker build must also use:

```bash
--build-arg OPSWATCH_API_ORIGIN=http://opswatch-api:8000
```

This prevents the Next.js production rewrite from using the Compose-only service name `http://api:8000`.

## Useful Checks

Check Kubernetes objects:

```bash
kubectl -n opswatch get pods,svc,ingress,jobs,cronjobs,pvc
```

Check API logs:

```bash
kubectl -n opswatch logs deployment/opswatch-api --tail=80
```

Check frontend logs:

```bash
kubectl -n opswatch logs deployment/opswatch-frontend --tail=80
```

Check worker and scheduler logs:

```bash
kubectl -n opswatch logs deployment/opswatch-worker --tail=80
kubectl -n opswatch logs deployment/opswatch-scheduler --tail=80
```

## Tear Down

Remove OpsWatch from the cluster:

```bash
make k8s-local-down
```

Delete the k3d cluster:

```bash
k3d cluster delete opswatch
```

## AWS Overlay

The AWS overlay is intentionally render-only by default. Before applying it anywhere:

- Replace GHCR owner/image tags in `overlays/aws/kustomization.yaml`.
- Replace secrets in `overlays/aws/secret-placeholder-patch.yaml`.
- Replace `opswatch.example.com` in `overlays/aws/ingress-patch.yaml`.
- Confirm AWS billing, budgets, and destroy steps.
- Confirm Terraform is still zero-resource-by-default unless explicitly opted in.

Do not apply the AWS overlay as part of normal project acceptance.

## Release Acceptance Checklist

Before tagging `v0.4.0`, verify:

- `make k8s-render` succeeds.
- `make tf-fmt-check` succeeds.
- `make tf-validate` succeeds.
- Local k3d deploy starts successfully.
- Migration Job completes.
- API `/health/ready` returns ready.
- Frontend login works.
- Demo data and admin bootstrap work.
- Runtime/Cloud page reports Kubernetes metadata correctly.