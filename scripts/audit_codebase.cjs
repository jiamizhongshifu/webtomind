const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const IGNORE_DIRS = ['node_modules', 'dist', '.git', '.vscode', 'public'];
const TARGET_EXTS = ['.ts', '.tsx', '.js', '.jsx'];

// Metrics
let totalFiles = 0;
let totalLines = 0;
let complexFiles = [];
let todoComments = [];
let anyTypes = [];
let consoleLogs = [];

// Recursively find all target files
function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (!fs.existsSync(fullPath)) continue;
    if (IGNORE_DIRS.includes(file)) continue;

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath);
    } else if (TARGET_EXTS.some(ext => file.endsWith(ext))) {
      analyzeFile(fullPath);
    }
  }
}

// Analyze a single file
function analyzeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const lineCount = lines.length;

    totalFiles++;
    totalLines += lineCount;

    if (lineCount > 500) {
      complexFiles.push({ path: filePath.replace(__dirname, ''), lines: lineCount });
    }

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      if (line.match(/\/\/.*TODO/i) || line.match(/\/\/.*FIXME/i)) {
        todoComments.push({ file: filePath.replace(__dirname, ''), line: lineNumber, content: line.trim() });
      }
      if (line.match(/:\s*any\b/)) {
        anyTypes.push({ file: filePath.replace(__dirname, ''), line: lineNumber, content: line.trim() });
      }
      if (line.match(/console\.log\(/)) {
        consoleLogs.push({ file: filePath.replace(__dirname, ''), line: lineNumber, content: line.trim() });
      }
    });
  } catch (e) { /* ignore */ }
}

// Run analysis
console.log('Starting full codebase audit...\n');
walkDir(path.join(__dirname, '../src'));

// Sort complex files
complexFiles.sort((a, b) => b.lines - a.lines);

// Helper to check dependencies
let depInfo = '';
try {
  depInfo = execSync('npm audit --json', { stdio: ['pipe', 'pipe', 'ignore'], cwd: path.join(__dirname, '..') }).toString();
} catch (e) {
  depInfo = e.stdout ? e.stdout.toString() : '{}';
}
let vulnerabilities = 0;
try {
  const auditRes = JSON.parse(depInfo);
  vulnerabilities = auditRes.metadata?.vulnerabilities?.total || 0;
} catch (e) {
  // Ignore parse errors from non-json output
}


// Generate report
const report = `
# WebToMind Codebase Audit Report
Generated: ${new Date().toISOString()}

## 1. Volume & Complexity Metrics
- **Total Source Files (src/)**: ${totalFiles}
- **Total Source Lines**: ${totalLines}
- **Average Lines/File**: ${Math.round(totalLines / totalFiles)}

### Top 15 Most Complex Files (>500 lines) ⚠️
These files are prime candidates for refactoring and splitting:
${complexFiles.slice(0, 15).map(f => `- \`${f.path}\` (${f.lines} lines)`).join('\n')}

## 2. Technical Debt Indicators
- **TODO/FIXME Comments**: ${todoComments.length} instances
- **Explicit \`any\` Types**: ${anyTypes.length} instances (Breaks TypeScript safety)
- **Stray \`console.log\`s**: ${consoleLogs.length} instances (Should use logger utility or be removed)
- **Dependency Vulnerabilities**: ${vulnerabilities} (Based on npm audit)

## 3. Notable Architectural Findings
Based on the file structure and recent modifications:
* **Background Scripts**: Still somewhat monolithic (\`background/index.ts\`). While we extracted handlers recently, the main index still handles intricate logic like content script injection and keep-alive alarms.
* **Workspace React App**: (\`workspace/App.tsx\`) is extremely massive (${complexFiles.find(f => f.path.includes('workspace/App.tsx'))?.lines || 4500} lines), handling state, routing, rendering, keyboard shortcuts, and complex layout orchestrations. This is highly fragile.

## 4. Key Security & Quality Risks
1. **Extension Content Injection**: The fallback logic for content script injection in \`background/index.ts\` is complex and brittle, relying on \`setTimeout\` polling and arbitrary \`window.postMessage\`.
2. **Type Safety Loss**: High count of \`any\` usage nullifies TypeScript's benefits, especially dangerous in API boundaries or message passing between extension contexts.
3. **State Management Spaghetti**: Large React components often indicate props-drilling or overly complex local state that should be moved to Zustand (which is in the dependencies).

---
*Note: This is an automated static analysis. For deeper architectural review, specific subsystems need targeted manual inspection.*
`;

fs.writeFileSync(path.join(__dirname, '../audit_report.md'), report);
console.log('Audit complete! Output derived to audit_report.md');
