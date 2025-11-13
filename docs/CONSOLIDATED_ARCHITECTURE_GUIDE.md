# Consolidated Architecture Guide: Strands AI Agent Platform with Multi-Tenant Isolation

**Date**: November 2025
**Status**: Strategic Planning Document
**Company Location**: Switzerland (Primary) / Europe (Secondary)

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Core Architecture Decision Tree](#core-architecture-decision-tree)
3. [Chosen Stack: Swiss-First Hybrid](#chosen-stack-swiss-first-hybrid)
4. [Multi-Tenancy Strategy](#multi-tenancy-strategy)
5. [Infrastructure Isolation Tiers](#infrastructure-isolation-tiers)
6. [Marketing & Positioning](#marketing--positioning)
7. [Implementation Roadmap](#implementation-roadmap)
8. [Key Technologies Explained](#key-technologies-explained)

---

## Executive Summary

### Your Core Requirements Met By
- **Each customer gets their own "computer"** → KubeVirt VMs
- **Idles when not in use** → Auto-suspend via spec.running=false
- **Backed by powerful compute** → Shared backend pool
- **Europe-based, privacy-first** → Exoscale (Switzerland) primary
- **Data separation primarily** → Database schemas + folder isolation
- **Cost-effective scaling** → Smart infrastructure abstraction

### Key Decisions
| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Company Entity** | Swiss GmbH | Banking-grade privacy, EU market access |
| **Primary Infrastructure** | Exoscale (Switzerland) | Swiss jurisdiction, managed K8s, KVM-native |
| **Compute Orchestration** | KubeVirt on Exoscale SKS | Auto-suspend, multi-tenant, Kubernetes-native |
| **Data Isolation** | Database schemas per tenant | Simple, scalable, meets data separation needs |
| **Execution Isolation** | VMs per tenant (KubeVirt) | Full OS isolation, strong security boundary |
| **Compute Backend** | Hetzner (Germany) for bulk compute | Cost optimization, heavy workloads |
| **Secondary Compute** | Modal/Fly.io GPU burst | Overflow capacity, GPU-intensive tasks |

---

## Core Architecture Decision Tree

```
START: What isolation do you need?
│
├─ JUST data separation
│  └─ Use: PostgreSQL schemas + folder isolation
│     Cost: ~$100-200/month for 100 customers
│     Market as: "Secure Multi-Tenant"
│     ❌ Cannot claim "private cloud"
│
├─ Better isolation + growth path
│  └─ Use: Kubernetes namespaces
│     Cost: ~$200-400/month for 100 customers
│     Market as: "Enterprise Isolated Environment"
│     ⚠️ Do not claim "private cloud"
│
├─ Premium tier appearance
│  └─ Use: KubeVirt VMs (THIS IS YOUR PATH)
│     Cost: ~$500-1000/month per customer tier
│     Market as: "Private Virtual Infrastructure"
│     ✅ Can claim "private environment"
│
└─ Enterprise compliance
   └─ Use: Dedicated servers per customer
      Cost: $1000-5000+/month per customer
      Market as: "Private Cloud"
      ✅✅ Full private cloud legitimacy
```

---

## Chosen Stack: Swiss-First Hybrid

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   CONTROL PLANE                         │
│              (Single Exoscale SKS Cluster)              │
│                   (Switzerland)                         │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ KubeVirt Layer                                   │  │
│  │ ├─ Tenant VMs (one per active customer)         │  │
│  │ ├─ Auto-suspend controller                      │  │
│  │ └─ Persistent volumes (customer workspaces)     │  │
│  │                                                  │  │
│  │ Supporting Services:                             │  │
│  │ ├─ PostgreSQL (multi-tenant schemas)            │  │
│  │ ├─ Redis (activity tracking, tenant-prefixed)   │  │
│  │ ├─ Vault (secrets per tenant)                   │  │
│  │ ├─ Your control plane API                       │  │
│  │ └─ Monitoring (Grafana/Prometheus)              │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  Exoscale Object Storage (SOS):                        │
│  ├─ Backups (VM snapshots)                             │
│  ├─ Artifacts (generated files)                        │
│  └─ Logs/archives per tenant                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
         │
         │ Heavy compute offloaded
         ↓
┌─────────────────────────────────────────────────────────┐
│           BACKEND COMPUTE POOL (Optional)               │
│              (Hetzner Germany or Modal)                 │
│                                                         │
│  ├─ GPU instances for ML workloads                     │
│  ├─ Batch processing                                   │
│  ├─ Model training/inference                           │
│  └─ Results returned to Swiss storage                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Why This Stack Works

1. **Swiss/EU Privacy**: Data never crosses borders
2. **Cost Efficiency**: Exoscale for customer-facing, Hetzner for commodity compute
3. **Automation**: Kubernetes + KubeVirt = fully automated multi-tenant management
4. **Scaling**: Add servers as needed, economics improve per tenant
5. **Compliance**: SOC 2, GDPR, Swiss banking-grade security standards
6. **Marketing**: "Swiss-hosted" becomes a feature, not a limitation

---

## Multi-Tenancy Strategy

### Layer 1: Data Isolation (REQUIRED)

**PostgreSQL Multi-Tenancy**
```sql
-- On customer signup
CREATE SCHEMA tenant_abc123;
CREATE TABLE tenant_abc123.agent_memory (...);
CREATE TABLE tenant_abc123.execution_logs (...);
CREATE TABLE tenant_abc123.agents (...);
```

**File Storage Isolation**
```
/storage/
├── tenant_abc123/
│   ├── workspace/
│   ├── uploads/
│   └── artifacts/
├── tenant_xyz789/
│   └── [similar structure]
```

**Secrets Isolation (Vault)**
```
vault/
├── tenants/abc123/
│   ├── openai_key
│   ├── slack_oauth
│   └── github_token
├── tenants/xyz789/
```

**Implementation Pattern**
```python
# In your Strands application
class TenantContext:
    def __init__(self, tenant_id):
        self.tenant_id = tenant_id
        self.schema = f"tenant_{tenant_id}"
        self.storage_path = f"/storage/{tenant_id}"
        self.secrets = vault[f"tenants/{tenant_id}"]

    def query(self, sql):
        # All queries scoped to their schema
        return db.execute(f"SET search_path TO {self.schema}; {sql}")
```

### Layer 2: Compute Isolation (KubeVirt VMs)

Each customer gets a lightweight VM:
```yaml
apiVersion: kubevirt.io/v1
kind: VirtualMachine
metadata:
  name: tenant-abc123
  labels:
    tenant-id: abc123
    tier: standard
spec:
  running: true  # Set to false to suspend
  template:
    spec:
      domain:
        cpu:
          cores: 2
        memory:
          guest: 4Gi
        devices:
          disks:
          - name: system
            disk:
              bus: virtio
          - name: workspace
            disk:
              bus: virtio
      volumes:
      - name: system
        containerDisk:
          image: your-registry/agent-runtime:latest
      - name: workspace
        persistentVolumeClaim:
          claimName: workspace-abc123
```

### Layer 3: Auto-Suspend Logic

```python
# Custom Kubernetes controller
class TenantVMController:
    async def monitor_idle_vms(self):
        """Check VM activity and suspend idle ones"""
        for vm in all_vms:
            tenant_id = vm.labels['tenant-id']
            last_active = redis.get(f"activity:{tenant_id}")

            if time.time() - last_active > 900:  # 15 minutes
                # Suspend by setting running=false
                k8s.patch(vm, {"spec": {"running": False}})

    def mark_active(self, tenant_id):
        """Called when tenant's VM becomes active"""
        redis.set(f"activity:{tenant_id}", time.time())
```

---

## Infrastructure Isolation Tiers

### Marketing & Pricing Tiers

#### Tier 1: Starter - $99/month
- **Shared infrastructure** with logical isolation
- **PostgreSQL schemas** per customer
- **Shared compute** resources
- Marketing: "Secure Multi-Tenant Platform"
- **Not positioned as**: "private" or "dedicated"

#### Tier 2: Professional - $299/month
- **Kubernetes namespace** per customer
- **Network isolation policies**
- **Resource guarantees** (CPU/memory limits)
- **Dedicated compute pods**
- Marketing: "Isolated Environment" / "Dedicated Workspace"
- **Not claimed as**: "private cloud"

#### Tier 3: Enterprise - $999/month ✅ YOUR TIER 1
- **Dedicated KubeVirt VM** per customer
- **Isolated persistent storage**
- **Custom resource allocation**
- **Optional VPN access**
- **Marketing: "Private Virtual Infrastructure"**
- **Can claim**: "private environment" / "isolated infrastructure"

#### Tier 4: Private Cloud - Custom Pricing
- **Dedicated physical/virtual server** per customer
- **Customer's cloud account** (optional)
- **Your own datacenter** (optional)
- **Full control and isolation**
- **Marketing: "Private Cloud"**
- **Can legitimately claim**: "private cloud" / "single-tenant"

### Honest Marketing

✅ **Can Claim:**
- "Swiss-hosted infrastructure"
- "Banking-grade security standards"
- "Enterprise-grade isolation" (Tier 2+)
- "Dedicated virtual infrastructure" (Tier 3+)
- "Private environment" (Tier 3+, with explanation)
- "Private cloud" (Tier 4 only)

❌ **Cannot/Should Not Claim:**
- "Your own private server" (if VM on shared hardware)
- "Completely isolated infrastructure" (if any sharing)
- "Dedicated cloud" (unless clear about what's dedicated)

⚠️ **Be Honest During Technical Due Diligence:**
- Enterprise buyers WILL ask technical questions
- Lying about architecture kills deals
- Transparency builds trust

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)

**Company Setup**
- [ ] Register Swiss GmbH (via LEXR/Fidinam, ~CHF 3-5k)
  - Alternative: Start with Estonian OÜ, migrate later
- [ ] Open Swiss CHF bank account (PostFinance or Neon)
- [ ] Set up Vault for secrets management

**Exoscale Account Setup**
- [ ] Create Exoscale account, verify Swiss entity
- [ ] Set up billing and cost tracking
- [ ] Create initial project

**Infrastructure Setup (Week 2)**
```bash
# Deploy Exoscale SKS cluster
exo compute sks create my-cluster \
  --zone ch-gva-2 \
  --nodepool-size 1 \
  --nodepool-instance-type medium

# Install KubeVirt
kubectl apply -f https://github.com/kubevirt/kubevirt/releases/download/latest/kubevirt-operator.yaml
kubectl apply -f https://github.com/kubevirt/kubevirt/releases/download/latest/kubevirt-cr.yaml

# Install Longhorn for storage
kubectl apply -f https://raw.githubusercontent.com/longhorn/longhorn/master/deploy/longhorn.yaml

# Install PostgreSQL (Helm)
helm install postgres bitnami/postgresql --set auth.postgresPassword=secure_password
```

### Phase 2: Multi-Tenancy Core (Weeks 3-4)

**Database Setup**
- [ ] Create tenant provisioning logic
- [ ] Schema creation scripts
- [ ] Access control patterns (row-level security)

**Tenant Provisioning API**
```python
# Your Railway/Exoscale service
async def create_tenant(username: str):
    tenant_id = generate_id()

    # 1. Create PostgreSQL schema
    await db.execute(f"CREATE SCHEMA tenant_{tenant_id}")

    # 2. Create file storage folder
    os.makedirs(f"/storage/{tenant_id}", exist_ok=True)

    # 3. Create secrets in Vault
    vault.write(f"tenants/{tenant_id}", {
        "tenant_id": tenant_id,
        "api_keys": {}
    })

    # 4. Create VM via KubeVirt
    vm_spec = build_vm_spec(tenant_id)
    await k8s.create_custom_object(
        group="kubevirt.io",
        version="v1",
        namespace="tenants",
        plural="virtualmachines",
        body=vm_spec
    )

    return {
        "tenant_id": tenant_id,
        "status": "ready",
        "endpoint": f"https://{tenant_id}.yourapp.com"
    }
```

**Docker Image for Tenant VM**
```dockerfile
FROM ubuntu:22.04

# Install runtime environment
RUN apt-get update && apt-get install -y \
    python3.11 nodejs-20 git curl wget

# Install Strands framework
COPY strands/ /opt/strands/
RUN pip install -e /opt/strands

# MCP servers
COPY mcp-servers/ /opt/mcp/

# Configuration
COPY .config/ /home/agent/.config/

# Startup script
COPY entrypoint.sh /
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
```

### Phase 3: Auto-Suspend & Scaling (Week 4)

**Activity Monitoring**
- [ ] Deploy activity tracking controller
- [ ] Implement idle detection logic
- [ ] Set up Redis for activity state

**Testing**
- [ ] Create 5 test tenants
- [ ] Verify suspend/resume cycles
- [ ] Monitor resource usage
- [ ] Test data isolation

### Phase 4: Production Ready (Week 5)

**Scaling Infrastructure**
- [ ] Add second and third nodes to cluster (3-node HA)
- [ ] Configure Longhorn distributed storage
- [ ] Set up backup/restore procedures

**Monitoring & Observability**
- [ ] Deploy Prometheus + Grafana
- [ ] Set up alerting
- [ ] Create dashboards for:
  - Tenant VM resource usage
  - Database performance
  - Cost tracking per tenant
  - Activity metrics

**Security & Compliance**
- [ ] Set up SOC 2 compliance framework
- [ ] Implement GDPR data processing agreement
- [ ] Configure network policies
- [ ] Security audit

### Phase 5+: Beyond MVP

**Month 2-3: Optimization & Scaling**
- [ ] Add Hetzner compute backend for heavy workloads
- [ ] Implement cost tracking/billing
- [ ] Create customer dashboard
- [ ] Implement usage tiers

**Month 3+: Enterprise Features**
- [ ] Add Premium tier (Tier 3: Full KubeVirt isolation)
- [ ] Dedicated compute pods per customer
- [ ] Custom SLAs
- [ ] Private Cloud tier (Tier 4)

---

## Key Technologies Explained

### KubeVirt: Simple Explanation

**What it is**: Run real virtual machines inside Kubernetes using simple `kubectl` commands

**Why you need it**:
- Give each customer a real "computer" (VM)
- Automate suspend/resume when idle
- Strong security boundaries

**How it works**:
1. You write a YAML template once: "2 CPU, 4GB RAM, Ubuntu, pre-loaded with Strands"
2. System creates 100 customer VMs instantly
3. Set rule: "Pause after 15 min idle"
4. KubeVirt handles the rest automatically

**Key Features**:
- `running: true/false` in YAML suspends/resumes VMs
- Persistent volumes for customer data
- Network isolation built-in
- Lives migration without downtime
- Full OS isolation (stronger than containers)

### Exoscale SKS: Managed Kubernetes

**What it provides**:
- Managed Kubernetes cluster in Switzerland (Geneva: CH-GVA-2 or Zurich: CH-DK-2)
- Control plane managed (you don't pay for it)
- KVM-native (perfect for KubeVirt)
- S3-compatible object storage
- Swiss data protection laws apply

**Cost Example (100 Active Tenants)**:
```
3x Medium nodes (SKS):     CHF 300/month
Block storage (Longhorn):  CHF 50/month
Object storage (SOS):      CHF 20/month
                          ─────────────
Total:                     CHF 370/month (~$420)

Per active tenant:         CHF 3.70/month (~$4.20)
```

### PostgreSQL Multi-Tenancy Pattern

**Strategy**: Schema-per-tenant (simplest, most scalable)

```python
# Every tenant has their own schema
db.execute(f"SET search_path TO tenant_{tenant_id}")
db.query("SELECT * FROM agents")  # Only sees their data
```

**Alternative**: Separate databases per enterprise customer
```python
# For premium tier
db = postgresql://tenant_abc.db.exoscale.com
```

**Why schemas work**:
- Zero code changes needed
- Automatic data isolation
- Easy backups (per schema)
- Scales to thousands of tenants
- Meets GDPR requirements

---

## Critical Implementation Details

### Tenant VM Lifecycle

```
1. Customer Signup
   └─> create_tenant(username)
       ├─ Generate tenant_id
       ├─ Create PostgreSQL schema
       ├─ Create storage folder
       ├─ Create Vault secrets
       └─ Deploy KubeVirt VM
       └─> VM starts (running: true)

2. Customer Active
   └─> Activity detector runs
       ├─ Monitors for SSH/API/process activity
       ├─ Updates Redis: activity:{tenant_id} = now()
       └─> VM stays running

3. Customer Idle (>15 min)
   └─> Controller checks activity
       ├─ last_active = now() - 900 seconds
       ├─ Patches VM: running: false
       └─> VM suspends (costs $0 compute, just storage)

4. Customer Returns
   └─> HTTP request to endpoint
       ├─ Fly.io/Exoscale auto-wakes VM
       ├─ VM boots (300ms - 5s)
       └─> API returns, customer never notices

5. Customer Deletes Account
   └─> delete_tenant(tenant_id)
       ├─ VM deletion: kubectl delete vm
       ├─ PostgreSQL: DROP SCHEMA
       ├─ Storage: rm -rf /storage/{tenant_id}
       ├─ Vault: Delete secrets
       └─> All customer data gone
```

### Cost Model (Monthly)

**100 customers, 10% active at once**:
```
Active machines (10):     10 × CHF 5/month  = CHF 50
Storage for active:       10 × CHF 0.50     = CHF 5
Idle machines (90):       0 (they're sleeping)
Storage for idle (90):    90 × CHF 0.15     = CHF 13.50
Shared infra (DB, etc):   CHF 50
                                            ─────────
Total:                                      CHF 118.50/month

Per-customer cost:                          CHF 1.19/month (!!)
```

**Comparison to competitors**:
- Fly.io alone: ~$185/month (similar config)
- AWS with isolation: ~$1000+/month
- Your Swiss stack: ~$120/month

### Security Boundaries

**What's isolated per tenant**:
- ✅ VM (own Linux kernel, own OS)
- ✅ Database schema (own tables/data)
- ✅ File storage (own folder)
- ✅ Secrets (own Vault paths)
- ✅ Network (own vNIC)
- ✅ Memory/CPU (hypervisor-enforced limits)

**What's shared (but safe)**:
- Physical servers (KVM isolation is strong)
- Kubernetes cluster (namespaces + network policies)
- PostgreSQL instance (schema isolation is secure)
- Redis (key prefixes, no shared data)

**Threat model covered**:
- ✅ Accidental data access (schema/key isolation)
- ✅ Intentional data theft (SQL injection, permission checks)
- ✅ VM escape (KVM is battle-tested)
- ✅ Resource exhaustion (quotas enforced)
- ✅ Cryptographic attacks (data encrypted in transit)

---

## Questions to Answer Before Proceeding

1. **Compliance Requirements**
   - Do you need HIPAA? (healthcare)
   - Do you need SOC 2/ISO 27001?
   - What data residency requirements? (Switzerland sufficient?)

2. **Customer Profile**
   - Expected number of customers? (10, 1000, 10,000?)
   - Enterprise vs SMB?
   - Price sensitive or security focused?

3. **Workload Profile**
   - What do agents execute?
   - How much GPU compute needed?
   - How often do cold starts happen?

4. **Timeline**
   - Launch date?
   - MVP vs production?
   - Enterprise features needed at launch?

5. **Integration Points**
   - How does Strands fit in?
   - What MCP servers needed?
   - Any existing systems to integrate?

---

## Next Steps

1. **Week 1**: Register Swiss company + complete infrastructure design
2. **Week 2-3**: Set up Exoscale SKS + KubeVirt, build provisioning API
3. **Week 4**: Multi-tenancy core + auto-suspend
4. **Week 5+**: Production hardening + customer onboarding

---

**Document Purpose**: This serves as the single source of truth for your multi-tenant, auto-suspending, Swiss-hosted AI agent platform architecture.

**Questions?** Ask before implementing to avoid rework.

**Last Updated**: November 2025
