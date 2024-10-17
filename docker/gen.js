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
    container_name: static-0
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
`

// Generate YDB Dynamic Node
let generateDynamicNode = (idx) => /** YAML */`
  dynamic-${idx}:
    <<: *ydb-common
    container_name: dynamic-${idx}
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
`

let composeFile = `x-template: &ydb-common
  image: cr.yandex/crptqonuodf51kdj7a7d/ydb:24.2.7
  restart: always
  hostname: localhost
  platform: linux/amd64
  privileged: true
  volumes:
    - ./cfg/config.yaml:/opt/ydb/cfg/config.yaml

name: ydb

services:
${generateStaticNode()}${generateDynamicNode(1)}${generateDynamicNode(2)}${generateDynamicNode(3)}
`;

fs.writeFileSync('compose.yaml', composeFile);
