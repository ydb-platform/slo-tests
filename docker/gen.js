// This scripts generate compose file

import fs from 'node:fs';

let tenant = "/Root/slo"

// YDB Ports
let YDB_GRPC_PORT = 2135
let YDB_MON_PORT = 8765
let YDB_IC_PORT = 19001

// Generate YDB Static Node
let generateStaticNode = () => /** YAML */`
  static-0:
    <<: *ydb-common
    container_name: ydb-static-0
    command:
      - /opt/ydb/bin/ydbd
      - server
      - --grpc-port
      - "${YDB_GRPC_PORT}"
      - --mon-port
      - "${YDB_MON_PORT}"
      - --ic-port
      - "${YDB_IC_PORT}"
      - --yaml-config
      - /opt/ydb/cfg/config.yaml
      - --node
      - static
      - --label
      - deployment=docker
    ports:
      - ${YDB_GRPC_PORT}:${YDB_GRPC_PORT}
      - ${YDB_MON_PORT}:${YDB_MON_PORT}
      - ${YDB_IC_PORT}:${YDB_IC_PORT}
    healthcheck:
      test: bash -c "exec 6<> /dev/tcp/localhost/${YDB_GRPC_PORT}"
      interval: 10s
      timeout: 1s
      retries: 3
      start_period: 30s
    deploy:
      <<: *ydb-deploy

  static-init:
    <<: *ydb-common
    restart: on-failure
    container_name: static-init
    command:
      - /opt/ydb/bin/ydbd
      - -s
      - grpc://localhost:${YDB_GRPC_PORT}
      - admin
      - blobstorage
      - config
      - init
      - --yaml-file
      - /opt/ydb/cfg/config.yaml
    depends_on:
      static-0:
        condition: service_healthy

  tenant-init:
    <<: *ydb-common
    restart: on-failure
    container_name: tenant-init
    command:
      - /opt/ydb/bin/ydbd
      - -s
      - grpc://localhost:${YDB_GRPC_PORT}
      - admin
      - database
      - ${tenant}
      - create
      - ssd:1
    depends_on:
      static-init:
        condition: service_completed_successfully
`.slice(1)

// Generate YDB Dynamic Node
let generateDynamicNode = (idx) => /** YAML */`
  dynamic-${idx}:
    <<: *ydb-common
    container_name: ydb-dynamic-${idx}
    command:
      - /opt/ydb/bin/ydbd
      - server
      - --grpc-port
      - "${YDB_GRPC_PORT+idx}"
      - --mon-port
      - "${YDB_MON_PORT+idx}"
      - --ic-port
      - "${YDB_IC_PORT+idx}"
      - --yaml-config
      - /opt/ydb/cfg/config.yaml
      - --tenant
      - ${tenant}
      - --node-broker
      - grpc://localhost:${YDB_GRPC_PORT}
      - --label
      - deployment=docker
    ports:
      - ${YDB_GRPC_PORT+idx}:${YDB_GRPC_PORT+idx}
      - ${YDB_MON_PORT+idx}:${YDB_MON_PORT+idx}
      - ${YDB_IC_PORT+idx}:${YDB_IC_PORT+idx}
    healthcheck:
      test: bash -c "exec 6<> /dev/tcp/localhost/${YDB_GRPC_PORT+idx}"
      interval: 10s
      timeout: 1s
      retries: 3
      start_period: 30s
    depends_on:
      static-0:
        condition: service_healthy
      static-init:
        condition: service_completed_successfully
      tenant-init:
        condition: service_completed_successfully
    deploy:
      <<: *ydb-deploy
`.slice(1)

// Generate Monitoring
let generateMonitoring = () => /** YAML */`
  prometheus:
    image: prom/prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./configs/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
    network_mode: host
    deploy: &monitoring-deploy
      resources:
        limits:
          cpus: '0.1'
          memory: 1000M
        reservations:
          cpus: '0.001'
          memory: 50M

  prometheus-pushgateway:
    image: prom/pushgateway
    restart: unless-stopped
    ports:
      - "9091:9091"
    network_mode: host
    deploy:
      <<: *monitoring-deploy

  grafana:
    image: grafana/grafana-oss
    restart: unless-stopped
    platform: linux/amd64
    ports:
      - "10000:10000"
    volumes:
      - ./configs/grafana/provisioning:/etc/grafana/provisioning
    environment:
      - GF_SERVER_HTTP_PORT=10000
      - GF_AUTH_DISABLE_LOGIN_FORM=true
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_NAME=Main Org.
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_RENDERING_SERVER_URL=http://localhost:10001/render
      - GF_RENDERING_CALLBACK_URL=http://localhost:10000/
    network_mode: host
    deploy:
      <<: *monitoring-deploy

  grafana-renderer:
    image: grafana/grafana-image-renderer
    ports:
      - "10001:10001"
    volumes:
      - ./configs/grafana/renderer/config.json:/usr/src/app/config.json
    network_mode: host
    deploy:
      <<: *monitoring-deploy
`.slice(1)

let composeFile = `
x-node: &ydb-common
  image: cr.yandex/crptqonuodf51kdj7a7d/ydb:24.2.7
  restart: always
  hostname: localhost
  platform: linux/amd64
  privileged: true
  network_mode: host
  volumes:
    - ./configs/ydb/config.yaml:/opt/ydb/cfg/config.yaml

x-deploy: &ydb-deploy
  restart_policy:
    condition: any
  resources:
    limits:
      cpus: '1'
      memory: 1000M
    reservations:
      cpus: '0.1'
      memory: 250M

name: ydb

services:
${generateStaticNode()}
${generateDynamicNode(1)}
${generateDynamicNode(2)}
${generateDynamicNode(3)}
${generateMonitoring()}
`;

fs.writeFileSync('compose.yaml', composeFile);
