import { join } from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile } from 'node:fs/promises'

import { error, getInput, setFailed } from '@actions/core';
import { getOctokit, context } from '@actions/github';
import { DefaultArtifactClient } from '@actions/artifact';

import { prepareDeployConfigs } from './deploy';
import { PROMETHEUS_PUSHGATEWAY_URL, YBD_CONNECTION_STRING } from './constants';
import { collectPrometheus, type WellknownMetrics } from './prometheus';
import { createReport } from './report';
import type { Chart, WellknownCharts } from './chart';

// Test Plan:
// 0. Prescription
// 0.1 Acquire temp dir
// 0.2 Create deployment configs
// 1. Rolling up
// 1.1 Run YDB
// 1.2 Run workload
// 1.3 Run chaos testing
// 2. Save Results
// 2.1 Pull Prometheus Metrics
// 2.2 Store it as an artifact
// 3. Rolling down
// 3.1 Stop YDB
// 4. Publish report
// 4.1 Download metrics for base branch (main)
// 4.2 Merge current metrics and base branch metrics
// 4.3 Render charts
// 4.4 Publish report if PR

export async function run() {
    let head = getInput("GITHUB_HEAD_REF")
    let base = getInput("GITHUB_BASE_REF", { required: true }).replace(/^refs\/heads\//, "")
    let isMain = base === "main" || base === "master"

    // 0.1 Acquire temp dir
    let tmpDir = process.env['RUNNER_TEMP']!;

    // 1.1 Create deployment configs
    let composeFilePath = await prepareDeployConfigs(tmpDir, parseInt(getInput("YDB_DATABASE_NODE_COUNT")));

    // 1.1 Run YDB
    await promisify(exec)(`docker compose -f ${composeFilePath} up --quiet-pull -d`)

    let start = new Date()

    const signal = AbortSignal.timeout(1000 * 60 * 15)
    try {
        const env = {
            ["YDB_CONNECTION_STRING"]: YBD_CONNECTION_STRING,
            ["PROMETHEUS_PUSHGATEWAY_URL"]: PROMETHEUS_PUSHGATEWAY_URL,
        }

        await Promise.race([
            // Run workload
            promisify(exec)(getInput("WORKLOAD_RUNNER"), { signal, env })
                .then(({ stderr }) => {
                    error(stderr, { title: "Error during workload run" })
                })
                .catch(error),
            // Run chaos testing
            promisify(exec)(getInput("CHAOS_TEST_RUNNER"), { signal, env })
                .then(({ stderr }) => {
                    error(stderr, { title: "Error during chaos test run" })
                })
                .catch(error),
        ])

        AbortSignal.abort()
    } catch (err) {
        if (err != signal.reason) {
            setFailed(err as Error)
        }
    }

    let end = new Date()

    let baseMetrics: WellknownMetrics | undefined = undefined;
    let headMetrics: WellknownMetrics | undefined = undefined;

    // 2.1 Pull Prometheus Metrics
    if (head) {
        headMetrics = await collectPrometheus(start, end)
    } else {
        baseMetrics = await collectPrometheus(start, end)
    }

    // 3.2 Store it as an artifact
    let artifact = new DefaultArtifactClient()
    let artifactPath = join(tmpDir, "metrics.json")

    await writeFile(artifactPath, JSON.stringify(headMetrics || baseMetrics), { encoding: "utf-8" })
    await artifact.uploadArtifact(`slo-${head || base}`, [artifactPath], tmpDir, { retentionDays: isMain ? 7 : 1 })

    // 3.1 Stop YDB
    await promisify(exec)(`docker compose -f ${composeFilePath} down`)

    if (!head) {
        return
    }

    // 4. Publish report
    // 4.1 Download metrics for base branch (main/master)
    try {
        let { artifact: baseArtifact } = await artifact.getArtifact(`slo-${base}`, {
            findBy: {
                token: getInput("GITHUB_TOKEN"),
                workflowRunId: context.runId,
                repositoryOwner: context.repo.owner,
                repositoryName: context.repo.repo,
            }
        });

        let { downloadPath } = await artifact.downloadArtifact(baseArtifact.id, {
            path: tmpDir,
            findBy: {
                token: getInput("GITHUB_TOKEN"),
                workflowRunId: context.runId,
                repositoryOwner: context.repo.owner,
                repositoryName: context.repo.repo,
            },
        })

        baseMetrics = JSON.parse(await readFile(downloadPath!, "utf8"))
    } catch (err) {
        console.error(err as Error)
    }

    // 4.2 Merge current metrics and base branch metrics
    let charts: WellknownCharts = {
        availabilityRead: [],
        availabilityWrite: [],
        throughputRead: [],
        throughputWrite: [],
        latencyRead: [],
        latencyWrite: [],
    }

    if (headMetrics) {
        charts.availabilityRead.push(headMetrics.availabilityRead)
        charts.availabilityWrite.push(headMetrics.availabilityWrite)
        charts.throughputRead.push(headMetrics.throughputRead)
        charts.throughputWrite.push(headMetrics.throughputWrite)
        charts.latencyRead.push(headMetrics.latencyRead)
        charts.latencyWrite.push(headMetrics.latencyWrite)
    }

    if (baseMetrics) {
        charts.availabilityRead.push(baseMetrics.availabilityRead)
        charts.availabilityWrite.push(baseMetrics.availabilityWrite)
        charts.throughputRead.push(baseMetrics.throughputRead)
        charts.throughputWrite.push(baseMetrics.throughputWrite)
        charts.latencyRead.push(baseMetrics.latencyRead)
        charts.latencyWrite.push(baseMetrics.latencyWrite)
    }

    const pr = await getOctokit(getInput("GITHUB_TOKEN")).rest.pulls.get({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: context.payload.pull_request?.number!,
    }).then(R => R.data)

    await getOctokit(getInput("GITHUB_TOKEN")).rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: pr.number,
        body: await createReport(charts)
    })
}
