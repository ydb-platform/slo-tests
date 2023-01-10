# How to setup cluster:

1. [Setup k8s cluster to use in actions](#setup-k8s)
   1. [Create Service Account](#create-sa)
   2. [Create kube config](#create-k8s-conf)
   3. [(Optionally) Test if k8s config is working](#test-k8s-conf)
2. [Setup prometheus and grafana](#prom-grafana)
3. [Additional commands in case of manual work](#manual)
   1. [YDB cluster startup](#manual-startup)
   2. [YDB cluster shutdown](#manual-shutdown)

<a name="setup-k8s"></a>

## Setup k8s cluster to use in actions

<a name="create-sa"></a>

### Create Service Account

`kubectl create -f k8s/ci/create-sa.yaml`

Get service account token and save it to `$SA_TOKEN`

```
SA_TOKEN=$(kubectl -n kube-system get secret $(kubectl -n kube-system get secret | \
  grep ci-user | \
  awk '{print $1}') -o json | \
  jq -r .data.token | \
  base64 --d)
```

<a name="create-k8s-conf"></a>

### Create kube config

Get ca.pem from your cluster (depends on your setup) and save it to `ca.pem`

Get master **external** endpoint of your cluster and save it to `$MASTER_ENDPOINT`

```
kubectl config set-cluster ci-cluster-config \
  --certificate-authority=ca.pem \
  --server=$MASTER_ENDPOINT \
  --embed-certs \
  --kubeconfig=ci-config.kubeconfig

kubectl config set-credentials ci-user \
  --token=$SA_TOKEN \
  --kubeconfig=ci-config.kubeconfig

kubectl config set-context default \
  --cluster=ci-cluster-config \
  --user=ci-user \
  --kubeconfig=ci-config.kubeconfig

kubectl config use-context default \
  --kubeconfig=ci-config.kubeconfig
```

<a name="test-k8s-conf"></a>

### (Optionally) Test if k8s config is working

**this command must show your cluster's namespaces**

```
kubectl get namespace --kubeconfig=ci-config.kubeconfig
```

Run base64 through config to get secret string (`pbcopy` is OSX util)

```
cat ci-config.kubeconfig | base64 | pbcopy
```

<a name="prom-grafana"></a>

## Setup prometheus and grafana

```
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm install prometheus prometheus-community/prometheus --values k8s/ci/prometheus/prom.yaml
helm install grafana grafana/grafana --values k8s/ci/prometheus/grafana.yaml
```

<hr>

<a name="manual"></a>

## Additional commands in case of manual work

<a name="manual-startup"></a>

### Whole process of cluster startup - it is automated

```
# install ydb-operator
helm install ydb-operator ydb/operator

# check if ydb-operator is up
kubectl get pods -l 'app.kubernetes.io/instance=ydb-operator' -o=jsonpath="{.items[0].status.phase}"

# create storage
kubectl apply -f k8s/storage.yaml

# check if storage created
kubectl get storages.ydb.tech -o=jsonpath="{.items[0].status.state}"

# create DBs
kubectl apply -f k8s/database.yaml

# check if database created
kubectl get database.ydb.tech -o=jsonpath="{.items[0].status.state}"
```

<a name="manual-shutdown"></a>

### Whole process of cluster shutdown - it is automated (but not turned on)

```
# delete DBs
kubectl delete -f k8s/database.yaml

# delete storage
kubectl delete -f k8s/storage.yaml

# remove PVCs
kubectl delete pvc `kubectl get pvc -o=jsonpath="{.items[*].metadata.name}"`

helm uninstall ydb-operator
```
