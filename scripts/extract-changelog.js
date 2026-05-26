#!/usr/bin/env node
/**
 * 提取指定版本的变更日志
 * 用法：node scripts/extract-changelog.js [version]
 * 示例：node scripts/extract-changelog.js v2.0.0-beta.1
 * 如果不提供版本，则提取 [Unreleased] 章节
 */

const fs = require('fs');
const path = require('path');

function extractChangelog(version) {
  const changelogPath = path.join(process.cwd(), 'docs', 'guides', 'CHANGELOG.md');
  
  if (!fs.existsSync(changelogPath)) {
    console.error('Error: CHANGELOG.md not found');
    process.exit(1);
  }
  
  const content = fs.readFileSync(changelogPath, 'utf-8');
  
  // 确定搜索模式
  let searchVersion = version || 'Unreleased';
  
  // 标准化版本格式（如果缺失且不是 Unreleased，则添加 'v' 前缀）
  if (searchVersion !== 'Unreleased' && !searchVersion.startsWith('v')) {
    searchVersion = 'v' + searchVersion;
  }
  
  // 同时支持 ## [version] 和 ## version 两种格式
  const headerPatterns = searchVersion === 'Unreleased'
    ? ['## [Unreleased]', '## Unreleased']
    : [`## [${searchVersion}]`, `## ${searchVersion}`];

  // 查找章节
  const lines = content.split('\n');
  let startIndex = -1;
  let endIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (headerPatterns.some(p => lines[i].startsWith(p))) {
      startIndex = i;
      break;
    }
  }

  if (startIndex === -1) {
    console.error(`Error: Version ${searchVersion} not found in CHANGELOG.md`);
    process.exit(1);
  }

  // 查找下一个版本标题或文件末尾
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (lines[i].match(/^## /) || lines[i].match(/^---$/)) {
      endIndex = i;
      break;
    }
  }
  
  if (endIndex === -1) {
    endIndex = lines.length;
  }
  
  // 提取内容
  let section = lines.slice(startIndex, endIndex).join('\n');
  
  // 移除版本标题行本身（只保留内容）
  section = section.replace(/^## \[.*?\].*?\n/, '');
  
  // 清理
  section = section.trim();
  
  // 移除尾部分隔符
  section = section.replace(/\n---\s*$/, '');
  
  return section;
}

// 主函数
const version = process.argv[2];

try {
  const changelog = extractChangelog(version);
  
  if (!changelog) {
    console.error(`Warning: No changelog content found for ${version || 'Unreleased'}`);
    process.exit(0);
  }
  
  // 为 GitHub Actions 输出
  if (process.env.GITHUB_OUTPUT) {
    // GitHub Actions 的多行输出
    const delimiter = `CHANGELOG_${Date.now()}`;
    console.log(`changelog<<${delimiter}`);
    console.log(changelog);
    console.log(delimiter);
  } else {
    console.log(changelog);
  }
  
  // 同时写入文件供参考
  const outputPath = path.join(process.cwd(), 'RELEASE_NOTES.md');
  fs.writeFileSync(outputPath, changelog);
  
} catch (error) {
  console.error('Error extracting changelog:', error.message);
  process.exit(1);
}
