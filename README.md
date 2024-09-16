# slo-tests

### [Deployment and CI readme](/k8s/README.md)

<hr>

This repo contains github workflows and actions to run SLO tests over YDB and YDB SDK's

Here is simple diagram what's happening inside:
 
```mermaid
graph TD
    A[Pull request] -->| | B(Create YDB cluster in k8s)
    A --> C(Build Workload docker image)
    B --> D[Create tables in cluster using workload image]
    C --> D
    D --> E[Run cluster errors sheduler]
    D --> F[Run workload over cluster]
    E --> G[Clean up tables in cluster using workload image]
    F --> G
    G --> H[Create screenshot in grafana and send it in PR comment]
```

The cluster that is processing workload's request is configured as follows:

```mermaid
flowchart LR
    subgraph storages["Storages (x9)"]
        s0[("Storage 0")]
        s1[("Storage 1")]
        s2[("Storage 2")]
        s3[("Storage 3")]
        s4[("Storage 4")]
        s5[("Storage 5")]
        s6[("Storage 6")]
        s7[("Storage 7")]
        s8[("Storage 8")]
    end
    subgraph databases["Databases (x6)"]
        d0["Database 0"]
        d1["Database 1"]
        d2["Database 2"]
        d3["Database 3"]
        d4["Database 4"]
        d5["Database 5"]
    end
    cluster[YDB Cluster] --> storages
    cluster --> databases
```
