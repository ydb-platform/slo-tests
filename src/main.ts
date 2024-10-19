import { getInput } from '@actions/core';
import { exec } from '@actions/exec';
import { getOctokit, context } from '@actions/github';

import { createComposeFile } from './compose';

// Test Plan:
// 1. Rolling up
// 1.1 Create compose file
// 1.2 Run compose file
// 1.3 Run workload
// 1.4 Run chaos
// 2. Rolling down
// 2.1 Stop chaos
// 2.2 Stop workload?
// 2.3 Stop compose file
// 3. Save Results
// 3.1 Dowload Prometheus Metrics
// 3.2 Dowload Grafana Dashboard
// 3.3 Push reports to file.io
// 3.4 Comment PR

const renderChart = () => `
\`\`\`mermaid
xychart-beta
    title "Sales Revenue"
    x-axis [jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec]
    y-axis "Revenue (in $)" 4000 --> 11000
    bar [5000, 6000, 7500, 8200, 9500, 10500, 11000, 10200, 9200, 8500, 7000, 6000]
    line [5000, 6000, 7500, 8200, 9500, 10500, 11000, 10200, 9200, 8500, 7000, 6000]
\`\`\`
`

export async function run() {
    // 1.1 Create compose file
    await createComposeFile();

    await exec("pwd");
    await exec("ls", ["-la"]);

    // 1.2 Run compose file
    let r0 = await exec('docker', ['compose', 'up', '--quiet-pull', '-d'])

    // 1.3 Run workload
    let r1 = await exec(getInput("YDB_WORKLOAD_CMD"), getInput("YDB_WORKLOAD_ARGS").split(" "), { failOnStdErr: true })

    // 2.3 Stop compose file
    let r2 = await exec('docker', ['compose', 'down'])

    console.log(context.payload)
    console.log(context)

    let pr = context.issue.number
    if (!pr) {
        let { data } = await getOctokit(getInput("GITHUB_TOKEN")).rest.repos.listPullRequestsAssociatedWithCommit({
            commit_sha: context.sha,
            owner: context.repo.owner,
            repo: context.repo.repo,
        })

        console.log(data)

        if (data?.length) {
            pr = data[0].number
        }
    }

    // curl -F "file=@${fileName}" https://file.io/?expires=2w

    // 3. Save Results
    await getOctokit(getInput("GITHUB_TOKEN")).rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: pr,
        body: renderChart()
    })

}
