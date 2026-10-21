#!/usr/bin/env node
/**
 * WebNovel Forge — Single-File Launcher
 * Path: C:\Users\rushi\OneDrive\Desktop\web\LAUNCHER.js
 * Usage: node LAUNCHER.js  (or double-click LAUNCHER.bat)
 * This single file checks requirements and starts the app in dev or built mode.
 */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = __dirname; // C:\Users\rushi\OneDrive\Desktop\web
const MAIN_ENTRY = path.join(PROJECT_ROOT, 'dist', 'main', 'main.js');
const PACKAGE_JSON = path.join(PROJECT_ROOT, 'package.json');

function check(cmd, name) {
  try { execSync(cmd, { stdio: 'ignore' }); console.log(`✓ ${name}`); return true; }
  catch { console.log(`✗ ${name} MISSING`); return false; }
}

console.log('=== WebNovel Forge — Single-File Launcher ===');
console.log(`Project: ${PROJECT_ROOT}\n`);

const hasNode = check('node -v', 'Node.js 22+');
const hasNpm = check('npm -v', 'npm');
const hasFfmpeg = check('ffmpeg -version', 'FFmpeg');
const hasNpx = check('npx --version', 'npx');

if (!hasNode || !hasNpm) {
  console.log('\nInstall Node.js 22 LTS from https://nodejs.org');
  process.exit(1);
}
if (!hasFfmpeg) {
  if (process.platform === 'win32') {
    console.log('⚠ FFmpeg not found — install: winget install FFmpeg (or choco install ffmpeg)');
  } else if (process.platform === 'darwin') {
    console.log('⚠ FFmpeg not found — install: brew install ffmpeg');
  } else {
    console.log('⚠ FFmpeg not found — install: sudo apt install ffmpeg (or your distro package manager)');
  }
}

const hasDist = fs.existsSync(MAIN_ENTRY);
const hasElectron = fs.existsSync(path.join(PROJECT_ROOT, 'node_modules', 'electron'));

if (!hasElectron) {
  console.log('\nInstalling dependencies (first run, ~2 min)...');
  spawn('npm', ['install'], { cwd: PROJECT_ROOT, stdio: 'inherit', shell: true });
} else if (!hasDist) {
  console.log('\nBuilding single program file...');
  const build = spawn('npm', ['run', 'build'], { cwd: PROJECT_ROOT, stdio: 'inherit', shell: true });
  build.on('close', (code) => {
    if (code === 0) start();
  });
} else {
  start();
}

function start() {
  const isDev = process.argv.includes('--dev');
  if (isDev) {
    console.log('\nStarting in DEV mode (vite + tsc -w)...');
    spawn('npm', ['run', 'dev'], { cwd: PROJECT_ROOT, stdio: 'inherit', shell: true });
  } else {
    console.log('\nStarting built app...');
    // Try portable exe first, then electron built
    const exeCandidates = [
      path.join(PROJECT_ROOT, 'dist', 'WebNovel Forge 1.0.0.exe'),
      path.join(PROJECT_ROOT, 'dist', 'win-unpacked', 'WebNovel Forge.exe'),
    ];
    const exe = exeCandidates.find(p => fs.existsSync(p));
    if (exe) {
      console.log(`Launching single EXE: ${exe}`);
      spawn(exe, [], { stdio: 'inherit', shell: true });
    } else {
      console.log('No portable EXE found, launching via electron (.js single file)...');
      const electron = path.join(PROJECT_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
      spawn(electron, ['.'], { cwd: PROJECT_ROOT, stdio: 'inherit', shell: true });
    }
  }
}
