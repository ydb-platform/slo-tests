const core = require("@actions/core");
const exec = require("@actions/exec");

async function main() {
  try {
    const dashboardUID = core.getInput("dashboard");
    const pod = core.getInput("pod");
    const text = core.getInput("text");
    const tags = JSON.parse(core.getInput("tags"));
    const time = core.getInput("time");
    const annotationsURL = core.getInput("annotations-url"); // http://localhost:3000/api/annotations

    // "panelId":,
    const postData = {
      isRegion: false,
      timeEnd: 0,
      dashboardUID,
      tags,
      text,
      time,
    };
    if (time === "-1") postData.time = new Date().valueOf();

    const postJSON = JSON.stringify(postData).replace('"', '\\"'); // to preserve JSON's `"`
    const cmd =
      `kubectl exec -it ${pod} --container grafana -- ` +
      `/bin/bash -c "wget --post-data '${postJSON}' '${annotationsURL}'"`;

    console.log("command", cmd);
    const execResult = await exec.getExecOutput(cmd);
    execResult.exitCode;
  } catch (error) {
    core.setFailed(error.message);
  }
}

main();
