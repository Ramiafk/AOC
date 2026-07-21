# Temporary autonomy blocker diagnostic

## Latest comment on Issue #16
```json
{"body":"[AOC-PRODUCT_DIRECTOR] Lot suspendu.\n\n**product_director**\n\nStatut : blocked\n\nfile:///home/runner/work/AOC/AOC/scripts/agents/agent-runtime.mjs:257\n    lastError = new Error(`GitHub Models ${response.status}: ${JSON.stringify(payload).slice(0, 2000)}`);\n                ^\n\nError: GitHub Models 429: {\"raw\":\"Too many requests. For more on scraping GitHub and how it may affect your rights, please review our Terms of Service (https://docs.github.com/en/site-policy/github-terms/github-terms-of-service).\\n\"}\n    at callModel (file:///home/runner/work/AOC/AOC/scripts/agents/agent-runtime.mjs:257:17)\n    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)\n    at async file:///home/runner/work/AOC/AOC/scripts/agents/agent-runtime.mjs:271:19\n\nNode.js v24.18.0\n\n\nBlocages :\n- Agent report missing\n","created_at":"2026-07-21T18:42:16Z","id":5037749269,"updated_at":"2026-07-21T18:42:16Z","user":"github-actions[bot]"}
```

## Recent autonomous runs
```json
[{"conclusion":null,"created_at":"2026-07-21T18:44:36Z","event":"workflow_run","head_branch":"main","head_sha":"4e6084a6df12bce65998e6199c5239ea9b6e4f2a","html_url":"https://github.com/Ramiafk/AOC/actions/runs/29858519798","id":29858519798,"run_number":135,"status":"queued","updated_at":"2026-07-21T18:44:36Z"},{"conclusion":"success","created_at":"2026-07-21T18:41:42Z","event":"workflow_run","head_branch":"main","head_sha":"4e6084a6df12bce65998e6199c5239ea9b6e4f2a","html_url":"https://github.com/Ramiafk/AOC/actions/runs/29858314502","id":29858314502,"run_number":134,"status":"completed","updated_at":"2026-07-21T18:42:46Z"},{"conclusion":"success","created_at":"2026-07-21T18:41:04Z","event":"push","head_branch":"main","head_sha":"4e6084a6df12bce65998e6199c5239ea9b6e4f2a","html_url":"https://github.com/Ramiafk/AOC/actions/runs/29858269869","id":29858269869,"run_number":133,"status":"completed","updated_at":"2026-07-21T18:42:20Z"},{"conclusion":"success","created_at":"2026-07-21T18:40:37Z","event":"issue_comment","head_branch":"main","head_sha":"77c1aaf3d829604a04baaca87c40867b01fb2a10","html_url":"https://github.com/Ramiafk/AOC/actions/runs/29858238400","id":29858238400,"run_number":132,"status":"completed","updated_at":"2026-07-21T18:40:51Z"},{"conclusion":"success","created_at":"2026-07-21T18:39:42Z","event":"workflow_run","head_branch":"main","head_sha":"77c1aaf3d829604a04baaca87c40867b01fb2a10","html_url":"https://github.com/Ramiafk/AOC/actions/runs/29858171483","id":29858171483,"run_number":131,"status":"completed","updated_at":"2026-07-21T18:40:25Z"},{"conclusion":"success","created_at":"2026-07-21T18:39:32Z","event":"workflow_run","head_branch":"main","head_sha":"77c1aaf3d829604a04baaca87c40867b01fb2a10","html_url":"https://github.com/Ramiafk/AOC/actions/runs/29858158660","id":29858158660,"run_number":130,"status":"completed","updated_at":"2026-07-21T18:39:47Z"},{"conclusion":"success","created_at":"2026-07-21T18:37:26Z","event":"workflow_run","head_branch":"main","head_sha":"77c1aaf3d829604a04baaca87c40867b01fb2a10","html_url":"https://github.com/Ramiafk/AOC/actions/runs/29858010500","id":29858010500,"run_number":129,"status":"completed","updated_at":"2026-07-21T18:37:42Z"},{"conclusion":"success","created_at":"2026-07-21T18:33:52Z","event":"issue_comment","head_branch":"main","head_sha":"77c1aaf3d829604a04baaca87c40867b01fb2a10","html_url":"https://github.com/Ramiafk/AOC/actions/runs/29857751198","id":29857751198,"run_number":128,"status":"completed","updated_at":"2026-07-21T18:34:21Z"},{"conclusion":"success","created_at":"2026-07-21T18:27:54Z","event":"workflow_run","head_branch":"main","head_sha":"77c1aaf3d829604a04baaca87c40867b01fb2a10","html_url":"https://github.com/Ramiafk/AOC/actions/runs/29857318651","id":29857318651,"run_number":127,"status":"completed","updated_at":"2026-07-21T18:28:50Z"},{"conclusion":"success","created_at":"2026-07-21T18:27:14Z","event":"push","head_branch":"main","head_sha":"77c1aaf3d829604a04baaca87c40867b01fb2a10","html_url":"https://github.com/Ramiafk/AOC/actions/runs/29857270516","id":29857270516,"run_number":126,"status":"completed","updated_at":"2026-07-21T18:28:22Z"}]
```

## Latest failed autonomous run
Run ID: 29857248875
```text
orchestrate	Run GitHub-only multi-agent orchestrator	﻿2026-07-21T18:27:07.4568016Z ##[group]Run node scripts/agents/orchestrator.mjs
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:07.4568414Z ^[[36;1mnode scripts/agents/orchestrator.mjs^[[0m
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:07.4628986Z shell: /usr/bin/bash -e {0}
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:07.4629248Z env:
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:07.4629456Z   NPM_CONFIG_IGNORE_SCRIPTS: true
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:07.4629721Z   AOC_GITHUB_ONLY: true
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:07.4632133Z   GH_TOKEN: ***
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:07.4634800Z   GITHUB_MODELS_TOKEN: ***
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:07.4635172Z   NODE_OPTIONS: --import=./scripts/agents/github-models-budget.mjs
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:07.4635563Z   AOC_AUTONOMY_ENABLED: true
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:07.4635806Z   AOC_MAX_AGENT_TURNS: 
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:07.4636023Z   AOC_AGENT_MAX_TOKENS: 
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:07.4636250Z   AOC_MODEL_REASONING: 
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:07.4636460Z   AOC_MODEL_CODE: 
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:07.4636656Z   AOC_MODEL_FAST: 
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:07.4636854Z   AOC_MODEL_DESIGN: 
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:07.4637058Z ##[endgroup]
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:11.5774038Z SyntaxError: Bad control character in string literal in JSON at position 100000 (line 1 column 100001)
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:11.5775195Z     at JSON.parse (<anonymous>)
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:11.5776017Z     at ghJson (file:///home/runner/work/AOC/AOC/scripts/agents/orchestrator.mjs:64:106)
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:11.5777129Z     at async main (file:///home/runner/work/AOC/AOC/scripts/agents/orchestrator.mjs:432:16)
orchestrate	Run GitHub-only multi-agent orchestrator	2026-07-21T18:27:12.0586628Z ##[error]Process completed with exit code 1.
```
