#!/usr/bin/env node
/**
 * 生成当前分支与 main 分支比较的发布说明
 *
 * 用法：
 *   node scripts/generate-release-notes.js          # 比较 main..HEAD
 *   node scripts/generate-release-notes.js v1.0.0   # 比较 v1.0.0..HEAD
 *   node scripts/generate-release-notes.js v1.0.0 v2.0.0  # 比较 v1.0.0..v2.0.0
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function exec(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });
  } catch (e) {
    if (opts.fallback) return opts.fallback;
    throw e;
  }
}

function getLastTag() {
  try {
    const tag = exec("git describe --tags --abbrev=0").trim();
    return tag;
  } catch {
    return null;
  }
}

function getCommits(fromRef, toRef) {
  const range = `${fromRef}..${toRef}`;
  try {
    const output = exec(`git log ${range} --pretty=format:"%H|%s|%an" --no-merges`);
    if (!output.trim()) return [];
    return output.trim().split('\n').map(line => {
      const [hash, subject, author] = line.split('|');
      return { hash: hash.slice(0, 7), subject, author };
    });
  } catch {
    return [];
  }
}

function getDiffStat(fromRef, toRef) {
  const range = `${fromRef}..${toRef}`;
  try {
    return exec(`git diff --stat ${range}`).trim();
  } catch {
    return '';
  }
}

function getChangedFiles(fromRef, toRef) {
  const range = `${fromRef}..${toRef}`;
  try {
    const output = exec(`git diff --name-only ${range}`);
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function categorizeCommits(commits) {
  const categories = {
    feat: { label: 'Features', emoji: '## Features', commits: [] },
    fix: { label: 'Bug Fixes', emoji: '## Bug Fixes', commits: [] },
    perf: { label: 'Performance', emoji: '## Performance', commits: [] },
    refactor: { label: 'Refactoring', emoji: '## Refactoring', commits: [] },
    docs: { label: 'Documentation', emoji: '## Documentation', commits: [] },
    test: { label: 'Tests', emoji: '## Tests', commits: [] },
    chore: { label: 'Chores', emoji: '## Chores', commits: [] },
    style: { label: 'Styles', emoji: '## Styles', commits: [] },
    other: { label: 'Other Changes', emoji: '## Other Changes', commits: [] },
  };

  const typeRegex = /^(feat|fix|perf|refactor|docs|test|chore|style)(\(.+\))?:\s*/;

  for (const commit of commits) {
    const match = commit.subject.match(typeRegex);
    if (match) {
      const type = match[1];
      const cleanSubject = commit.subject.replace(typeRegex, '').trim();
      const cat = categories[type] || categories.other;
      cat.commits.push({ ...commit, subject: cleanSubject });
    } else {
      categories.other.commits.push(commit);
    }
  }

  return categories;
}

function formatDate(date = new Date()) {
  return date.toISOString().split('T')[0];
}

function getRepoUrl() {
  try {
    const remote = exec('git remote get-url origin').trim();
    // 将 SSH 或 HTTPS URL 转换为 HTTPS 网页 URL
    const match = remote.match(/github\.com[:/](.+?)\.git?$/);
    if (match) return `https://github.com/${match[1]}`;
  } catch {
    // ignore
  }
  return 'https://github.com/PapyrusOR/Papyrus_Desktop';
}

function generateNotes(fromRef, toRef) {
  const commits = getCommits(fromRef, toRef);
  const diffStat = getDiffStat(fromRef, toRef);
  const changedFiles = getChangedFiles(fromRef, toRef);
  const categories = categorizeCommits(commits);

  const version = toRef === 'HEAD' ? getLastTag() || 'unreleased' : toRef;
  const date = formatDate();
  const repoUrl = getRepoUrl();

  let md = `# Release Notes\n\n`;
  md += `**Version**: ${version}  \n`;
  md += `**Date**: ${date}  \n`;
  md += `**Compare**: ${fromRef}...${toRef}\n\n`;

  // 摘要
  md += `## Summary\n\n`;
  md += `- **Commits**: ${commits.length}\n`;
  md += `- **Files changed**: ${changedFiles.length}\n\n`;

  // 分类提交
  for (const key of Object.keys(categories)) {
    const cat = categories[key];
    if (cat.commits.length === 0) continue;
    md += `${cat.emoji}\n\n`;
    for (const commit of cat.commits) {
      md += `- ${commit.subject} ([${commit.hash}](${repoUrl}/commit/${commit.hash}))\n`;
    }
    md += '\n';
  }

  // Diff 统计
  if (diffStat) {
    md += `## Diff Stat\n\n`;
    md += '```\n' + diffStat + '\n```\n\n';
  }

  // 按区域分类的变更文件
  const frontendFiles = changedFiles.filter(f => f.startsWith('frontend/'));
  const backendFiles = changedFiles.filter(f => f.startsWith('backend/'));
  const electronFiles = changedFiles.filter(f => f.startsWith('electron/'));
  const otherFiles = changedFiles.filter(
    f => !f.startsWith('frontend/') && !f.startsWith('backend/') && !f.startsWith('electron/')
  );

  if (frontendFiles.length || backendFiles.length || electronFiles.length) {
    md += `## Changed Areas\n\n`;
    if (frontendFiles.length) md += `- **Frontend**: ${frontendFiles.length} files\n`;
    if (backendFiles.length) md += `- **Backend**: ${backendFiles.length} files\n`;
    if (electronFiles.length) md += `- **Electron**: ${electronFiles.length} files\n`;
    if (otherFiles.length) md += `- **Other**: ${otherFiles.length} files\n`;
    md += '\n';
  }

  // 贡献者
  const contributors = [...new Set(commits.map(c => c.author))];
  if (contributors.length) {
    md += `## Contributors\n\n`;
    for (const author of contributors) {
      md += `- ${author}\n`;
    }
    md += '\n';
  }

  return md.trim();
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  let fromRef, toRef;

  if (args.length >= 2) {
    fromRef = args[0];
    toRef = args[1];
  } else if (args.length === 1) {
    fromRef = args[0];
    toRef = 'HEAD';
  } else {
    // 默认：比较 main..HEAD
    fromRef = 'main';
    toRef = 'HEAD';
  }

  // 验证引用是否存在
  try {
    exec(`git rev-parse --verify ${fromRef}`);
    exec(`git rev-parse --verify ${toRef}`);
  } catch (e) {
    console.error(`Error: Invalid git reference. from=${fromRef}, to=${toRef}`);
    console.error('Make sure you are in a git repository and the refs exist.');
    process.exit(1);
  }

  const notes = generateNotes(fromRef, toRef);

  // 写入文件
  const outputPath = path.join(process.cwd(), 'RELEASE_NOTES.md');
  fs.writeFileSync(outputPath, notes + '\n');

  // 同时输出到 stdout 供 CI 使用
  console.log(notes);

  console.error(`\nRelease notes written to: ${outputPath}`);
}

main();
