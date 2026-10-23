# Headlamp reuse decision

Research date: 2026-10-23. Source repository: [kubernetes-sigs/headlamp](https://github.com/kubernetes-sigs/headlamp).
Pinned source commit: `317ccc2009471edd275ad3c38b824a92408a1fba`.

AtSys reuses a small presentational component and Headlamp's resource-console interaction patterns. It does not require Kubernetes. Headlamp's [official architecture documentation](https://headlamp.dev/docs/latest/development/architecture/) describes its React, TypeScript, MUI, Redux and router frontend. Its [official FAQ](https://headlamp.dev/docs/latest/faq/) confirms Apache-2.0 licensing and commercial reuse.

## Implemented source reuse

`src/vendor/headlamp/StatusLabel.tsx` adapts the `StatusLabel` component from [frontend/src/components/common/Label.tsx](https://github.com/kubernetes-sigs/headlamp/blob/317ccc2009471edd275ad3c38b824a92408a1fba/frontend/src/components/common/Label.tsx).

The adaptation extracts the status label from unrelated date/info label helpers, removes Headlamp-specific theme augmentation and tooltip imports, uses MUI's standard palette, types span attributes, and adds distinct shape markers alongside text. It retains the upstream copyright and license header and explicitly describes modifications. Only React and MUI are required. It supports `success`, `warning`, `error`, and an empty-string neutral state for unknown/unavailable data.

Suggested mapping:

| AtSys state | Label status | Text |
| --- | --- | --- |
| Healthy or validated pass | success | Healthy / Validated pass |
| Stale, degraded, awaiting approval | warning | Stale / Awaiting approval |
| Incident, failed validator | error | Incident / Validated fail |
| Unknown, unsupported, disconnected | empty string | Unknown / Unavailable |

Always include meaningful children and show status timestamp in the row or detail view. A success label is never evidence that a task passed validation. Running and validated pass are separate states.

```tsx
import { StatusLabel } from './vendor/headlamp/StatusLabel';

<StatusLabel status="warning" title="Last event received 4 minutes ago">
  Stale heartbeat
</StatusLabel>
```

## Other Headlamp patterns to apply

Use a persistent left navigation, project selector, page action bar, sortable searchable resource tables, summary cards, and evidence-backed details. Agent lists replace Kubernetes resource lists. Run details replace workload details. The copied component is deliberately independent of cluster contexts.

Headlamp's `SectionBox` and `SectionHeader` are good references for consistent sections but contain relative component dependencies and custom palette tokens. Its large `SimpleTable`, `ResourceTable`, resource detail, plugin registry, Kubernetes client, and Redux contexts carry substantial application coupling. Importing the full plugin SDK into a standalone AtSys app would import an unnecessary Kubernetes-oriented runtime. Build AtSys's tables and shell with MUI primitives while adapting further small components only when they provide meaningful value.

An actual Kubernetes integration can link to Headlamp's separate console when explicitly configured. Display unavailable when there is no cluster configuration. Do not create fake cluster connections or ship Kubernetes as an installation requirement.

## Third-party attribution

Upstream [LICENSE](https://github.com/kubernetes-sigs/headlamp/blob/317ccc2009471edd275ad3c38b824a92408a1fba/LICENSE) and [NOTICE](https://github.com/kubernetes-sigs/headlamp/blob/317ccc2009471edd275ad3c38b824a92408a1fba/NOTICE) were inspected and copied verbatim into `src/vendor/headlamp/LICENSE` and `src/vendor/headlamp/NOTICE` from the pinned commit. NOTICE records contributor attribution associated with the CNCF donation. Preserve both files with distributions that contain the adapted component, preserve its source notice, and describe modifications in any further derived files. Include a visible third-party notice link or credits in the built application and ship these texts as distribution assets. Apache-2.0 does not convey trademark rights; AtSys uses its own name and identity.

This is an engineering attribution record, not a legal opinion. No Headlamp logos, screenshots, Kubernetes clients, or third-party image assets were copied.
