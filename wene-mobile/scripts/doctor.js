#!/usr/bin/env node
/**
 * We-ne Mobile Doctor Script
 * 
 * 一般的な問題を自動検出・修正するスクリプト
 * 
 * 使い方:
 *   node scripts/doctor.js        # 問題を検出
 *   node scripts/doctor.js --fix  # 問題を自動修正
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FIX_MODE = process.argv.includes('--fix');

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
};

const log = {
  error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
  fix: (msg) => console.log(`${colors.green}🔧 ${msg}${colors.reset}`),
  lock: (msg) => console.log(`${colors.magenta}🔒 ${msg}${colors.reset}`),
};

let issues = 0;
let fixed = 0;

// ========================================
// 完成形ファイルのハッシュ (変更検出用)
// ========================================
const LOCKED_FILES = {
  'assets/icon.png': 'b16d15261c57c8df5567574b0573ef20',
  'assets/adaptive-icon.png': 'b16d15261c57c8df5567574b0573ef20',
};

// 必須パターン (これらが含まれていないとエラー)
const REQUIRED_PATTERNS = {
  'src/polyfills.ts': [
    "react-native-get-random-values",
    "buffer",
  ],
  'src/utils/phantom.ts': [
    "bs58.encode",
    "dappKeyBase58",
    "handlePhantomConnectRedirect",
  ],
  'app/_layout.tsx': [
    "SafeAreaProvider",
    "polyfills",
  ],
  'src/screens/HomeScreen.tsx': [
    "SafeAreaView",
  ],
  'src/screens/ReceiveScreen.tsx': [
    "SafeAreaView",
  ],
  'src/screens/WalletScreen.tsx': [
    "SafeAreaView",
  ],
};

// 禁止パターン (これらが含まれているとエラー)
const FORBIDDEN_PATTERNS = {
  'src/polyfills.ts': [
    '/ingest/',
  ],
  'src/utils/phantom.ts': [
    '/ingest/',
  ],
  'app/_layout.tsx': [
    '/ingest/',
  ],
  'src/screens/HomeScreen.tsx': [
    '/ingest/',
  ],
  'src/screens/ReceiveScreen.tsx': [
    '/ingest/',
  ],
  'src/screens/WalletScreen.tsx': [
    '/ingest/',
  ],
};

// ========================================
// Utility Functions
// ========================================
function getFileMD5(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

// ========================================
// Check 0: Locked Files (完成形保護)
// ========================================
function checkLockedFiles() {
  log.info('Checking locked files (完成形保護)...');
  
  for (const [relativePath, expectedHash] of Object.entries(LOCKED_FILES)) {
    const fullPath = path.join(ROOT, relativePath);
    
    if (!fs.existsSync(fullPath)) {
      log.error(`${relativePath} not found (LOCKED FILE MISSING!)`);
      issues++;
      continue;
    }
    
    const actualHash = getFileMD5(fullPath);
    
    if (actualHash === expectedHash) {
      log.lock(`${relativePath} is intact`);
    } else {
      log.error(`${relativePath} has been MODIFIED! (expected: ${expectedHash}, got: ${actualHash})`);
      log.warn(`  → This file should not be changed. Restore from backup or git.`);
      issues++;
    }
  }
}

// ========================================
// Check 1: Required Patterns
// ========================================
function checkRequiredPatterns() {
  log.info('Checking required code patterns...');
  
  for (const [relativePath, patterns] of Object.entries(REQUIRED_PATTERNS)) {
    const fullPath = path.join(ROOT, relativePath);
    
    if (!fs.existsSync(fullPath)) {
      log.error(`${relativePath} not found`);
      issues++;
      continue;
    }
    
    const content = fs.readFileSync(fullPath, 'utf8');
    let fileOk = true;
    
    for (const pattern of patterns) {
      if (!content.includes(pattern)) {
        log.error(`${relativePath} missing required pattern: "${pattern}"`);
        issues++;
        fileOk = false;
      }
    }
    
    if (fileOk) {
      log.success(`${relativePath} has all required patterns`);
    }
  }
}

// ========================================
// Check 2: Forbidden Patterns
// ========================================
function checkForbiddenPatterns() {
  log.info('Checking for forbidden patterns (debug code)...');
  
  for (const [relativePath, patterns] of Object.entries(FORBIDDEN_PATTERNS)) {
    const fullPath = path.join(ROOT, relativePath);
    
    if (!fs.existsSync(fullPath)) {
      continue; // Skip if file doesn't exist (handled elsewhere)
    }
    
    const content = fs.readFileSync(fullPath, 'utf8');
    let fileOk = true;
    
    for (const pattern of patterns) {
      if (content.includes(pattern)) {
        log.error(`${relativePath} contains forbidden pattern: "${pattern}"`);
        issues++;
        fileOk = false;
        
        if (FIX_MODE) {
          // Remove agent log blocks
          let cleaned = content.replace(/\/\/ #region agent log[\s\S]*?\/\/ #endregion\n?/g, '');
          fs.writeFileSync(fullPath, cleaned);
          log.fix(`Removed debug code from ${relativePath}`);
          fixed++;
        }
      }
    }
    
    if (fileOk) {
      log.success(`${relativePath} has no forbidden patterns`);
    }
  }
}

// ========================================
// Check 3: Dependencies
// ========================================
function checkDependencies() {
  log.info('Checking required dependencies...');
  const packagePath = path.join(ROOT, 'package.json');
  
  if (!fs.existsSync(packagePath)) {
    log.error('package.json not found');
    issues++;
    return;
  }
  
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  
  const required = [
    'react-native-get-random-values',
    'react-native-safe-area-context',
    'buffer',
    'bs58',
    'tweetnacl',
  ];
  
  const missing = [];
  for (const dep of required) {
    if (deps[dep]) {
      log.success(`${dep} is installed`);
    } else {
      log.error(`${dep} is missing`);
      missing.push(dep);
      issues++;
    }
  }
  
  if (FIX_MODE && missing.length > 0) {
    log.fix(`Installing missing dependencies: ${missing.join(', ')}`);
    try {
      execSync(`npm install ${missing.join(' ')} --legacy-peer-deps`, { 
        cwd: ROOT, 
        stdio: 'inherit' 
      });
      fixed += missing.length;
    } catch (e) {
      log.error('Failed to install dependencies');
    }
  }
}

// ========================================
// Check 4: Android local.properties
// ========================================
function checkAndroidConfig() {
  log.info('Checking Android configuration...');
  const androidDir = path.join(ROOT, 'android');
  const localPropsPath = path.join(androidDir, 'local.properties');
  
  if (!fs.existsSync(androidDir)) {
    log.warn('android directory not found (run prebuild first)');
    return;
  }
  
  if (!fs.existsSync(localPropsPath)) {
    log.error('android/local.properties not found');
    issues++;
    if (FIX_MODE) {
      const possibleSdkPaths = [
        process.env.ANDROID_HOME,
        process.env.ANDROID_SDK_ROOT,
        '/opt/homebrew/share/android-commandlinetools',
        `${process.env.HOME}/Library/Android/sdk`,
        `${process.env.HOME}/Android/Sdk`,
      ].filter(Boolean);
      
      let sdkPath = null;
      for (const p of possibleSdkPaths) {
        if (p && fs.existsSync(p)) {
          sdkPath = p;
          break;
        }
      }
      
      if (sdkPath) {
        fs.writeFileSync(localPropsPath, `sdk.dir=${sdkPath}\n`);
        log.fix(`Created local.properties with sdk.dir=${sdkPath}`);
        fixed++;
      } else {
        log.error('Could not find Android SDK path');
      }
    }
  } else {
    const content = fs.readFileSync(localPropsPath, 'utf8');
    if (content.includes('sdk.dir')) {
      log.success('local.properties has sdk.dir');
    } else {
      log.error('local.properties missing sdk.dir');
      issues++;
    }
  }
}

// ========================================
// Check 5: node_modules existence
// ========================================
function checkNodeModules() {
  log.info('Checking node_modules...');
  const nodeModulesPath = path.join(ROOT, 'node_modules');
  
  if (!fs.existsSync(nodeModulesPath)) {
    log.error('node_modules not found');
    issues++;
    if (FIX_MODE) {
      log.fix('Running npm ci...');
      try {
        execSync('npm ci --legacy-peer-deps', { cwd: ROOT, stdio: 'inherit' });
        fixed++;
      } catch (e) {
        log.error('npm ci failed');
      }
    }
  } else {
    log.success('node_modules exists');
  }
}

// ========================================
// Check 6: Assets
// ========================================
function checkAssets() {
  log.info('Checking assets...');
  const assetsDir = path.join(ROOT, 'assets');
  
  if (!fs.existsSync(assetsDir)) {
    log.error('assets directory not found');
    issues++;
    if (FIX_MODE) {
      fs.mkdirSync(assetsDir, { recursive: true });
      log.fix('Created assets directory');
      fixed++;
    }
    return;
  }
  
  const requiredAssets = ['icon.png', 'adaptive-icon.png'];
  for (const asset of requiredAssets) {
    const assetPath = path.join(assetsDir, asset);
    if (fs.existsSync(assetPath)) {
      log.success(`${asset} exists`);
    } else {
      log.error(`${asset} not found`);
      issues++;
    }
  }
}

// ========================================
// Main
// ========================================
console.log('\n🏥 We-ne Mobile Doctor\n');
console.log(`Mode: ${FIX_MODE ? 'FIX' : 'CHECK'}\n`);
console.log('─'.repeat(50));

// Critical checks first
checkLockedFiles();
console.log('');

checkNodeModules();
console.log('');

checkDependencies();
console.log('');

checkRequiredPatterns();
console.log('');

checkForbiddenPatterns();
console.log('');

checkAndroidConfig();
console.log('');

checkAssets();

console.log('\n' + '─'.repeat(50));
console.log(`\n📊 Summary: ${issues} issue(s) found`);
if (FIX_MODE) {
  console.log(`🔧 Fixed: ${fixed} issue(s)`);
}

if (issues > 0 && !FIX_MODE) {
  console.log(`\n💡 Run with --fix to auto-fix some issues:`);
  console.log(`   node scripts/doctor.js --fix\n`);
}

if (issues === 0) {
  console.log(`\n✨ All checks passed! App is in stable state.\n`);
}

process.exit(issues > 0 ? 1 : 0);
