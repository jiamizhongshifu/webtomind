#!/usr/bin/env node

// 确认当前 HEAD 的 GitHub Actions CI（含 release 部署 job）已全部成功。
// 供 release-cloudflare.mjs --ci-deployed 使用：CI 已做 build/deploy/validate/smoke，
// 本地只需确认线上 == HEAD 并做最终 smoke，避免重复执行整条发布链。

import { execFileSync } from 'node:child_process';
import process from 'node:process';

function git(args) {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function fail(message) {
  throw new Error(`CI deploy confirmation failed: ${message}`);
}

function ghApi(path) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (token) {
    return fetch(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'webtomind-release',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`GitHub API ${response.status} for ${path}`);
      }
      return response.json();
    });
  }
  return new Promise((resolve, reject) => {
    try {
      const stdout = execFileSync(
        'gh',
        ['api', path],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      );
      resolve(JSON.parse(stdout));
    } catch (error) {
      reject(
        new Error(
          `gh api failed (set GITHUB_TOKEN/GH_TOKEN or install gh): ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  });
}

const commit = git(['rev-parse', 'HEAD']);
const remote = git(['remote', 'get-url', 'origin']);
const remoteMatch = remote.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/);
if (!remoteMatch) {
  fail(`unsupported origin remote: ${remote}`);
}
const owner = remoteMatch[1];
const repo = remoteMatch[2];

const runs = await ghApi(
  `/repos/${owner}/${repo}/actions/runs?head_sha=${commit}&event=push&branch=main&per_page=10`
).then((body) => body.workflow_runs || []);

const run = runs.find(
  (item) => item.name === 'CI' && item.status === 'completed'
);
if (!run) {
  fail(`no completed CI run found for ${commit}. Wait for CI or check auto-deploy is enabled.`);
}
if (run.conclusion !== 'success') {
  fail(`CI run ${run.id} conclusion is ${run.conclusion} for ${commit}.`);
}

const jobs = await ghApi(
  `/repos/${owner}/${repo}/actions/runs/${run.id}/jobs?per_page=50`
).then((body) => body.jobs || []);
const releaseJob = jobs.find((job) => job.name === 'release');
if (!releaseJob) {
  fail(`CI run ${run.id} has no release job (auto-deploy may be disabled).`);
}
if (releaseJob.conclusion !== 'success') {
  fail(`CI release job conclusion is ${releaseJob.conclusion} for run ${run.id}.`);
}

console.log(
  `PASS CI deployed ${commit.slice(0, 12)}: run ${run.id}, release job success (${new Date(releaseJob.completed_at || '').toISOString()}).`
);
