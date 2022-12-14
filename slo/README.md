# How to setup cluster:

Create Service Account

`kubectl create -f k8s/ci/create-sa.yaml`

Get service account token and save it to `$SA_TOKEN`

```
SA_TOKEN=$(kubectl -n kube-system get secret $(kubectl -n kube-system get secret | \
  grep ci-user | \
  awk '{print $1}') -o json | \
  jq -r .data.token | \
  base64 --d)
```

Get ca.pem from your cluster (depends on your setup) and save it to `ca.pem`

Get master **external** endpoint of your cluster and save it to `$MASTER_ENDPOINT`

Create kube config
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

(Optionally) Test k8s config is working (this command must show your cluster's namespaces)
```
kubectl get namespace --kubeconfig=ci-config.kubeconfig
```

Run base64 through config to get secret string (`pbcopy` is OSX util)
```
cat ci-config.kubeconfig | base64 | pbcopy
```


