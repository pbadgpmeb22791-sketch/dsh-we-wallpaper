/**
 * High-definition animated fallback for Wallpaper Engine scene packages.
 *
 * Workshop GIF previews are often 160x160.  They cannot look sharp at full
 * screen.  Wallpaper Engine scenes also cannot be exported directly because
 * they have no fixed timeline, so this module records a short native render
 * once with Windows.Graphics.Capture (wcap) and caches the resulting H.264
 * loop.  Harness then plays it through the same <video> path as a normal
 * video wallpaper.
 *
 * Presentation contract: the scene renders in a borderless WE window covering
 * the primary monitor at its physical pixel size, topmost, with the taskbars
 * hidden for the duration and the cursor parked in the centre (wcap's
 * window-capture hotkey grabs the window under the cursor).  The desktop is
 * restored in a finally block, so an aborted capture never leaves the shell
 * hidden.
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { cacheDir } from './pkg-preview.ts'
import type { WallpaperEntry, WeInstall } from './we-scanner.ts'

export const SCENE_VIDEO_VERSION = 2
export const SCENE_VIDEO_SECONDS = 12
/** Fallback capture size when the physical monitor size cannot be probed. */
export const SCENE_VIDEO_WIDTH = 1920
export const SCENE_VIDEO_HEIGHT = 1080

export type SceneVideoPhase = 'idle' | 'capturing' | 'ready' | 'error'

export interface SceneVideoStatus {
  id: string
  phase: SceneVideoPhase
  progress: number
  file: string | null
  width: number
  height: number
  duration: number
  error: string | null
  startedAt: string | null
  updatedAt: string
}

interface SceneVideoMeta {
  version: number
  id: string
  projectMtimeMs: number
  width: number
  height: number
  duration: number
  createdAt: string
}

let activeRecorder: ChildProcess | null = null
let activeLocation: string | null = null
let activeInstall: WeInstall | null = null
const statuses = new Map<string, SceneVideoStatus>()

function now(): string {
  return new Date().toISOString()
}

function sceneVideoDir(home = ''): string {
  return join(cacheDir(home), 'hd-video')
}

export function sceneVideoCachePath(id: string, home = ''): string {
  return join(sceneVideoDir(home), `${id}.mp4`)
}

function sceneVideoMetaPath(id: string, home = ''): string {
  return join(sceneVideoDir(home), `${id}.json`)
}

function projectMtime(entry: WallpaperEntry): number {
  return statSync(join(entry.dir, 'project.json'), { throwIfNoEntry: false })?.mtimeMs ?? -1
}

function readValidMeta(entry: WallpaperEntry, home = ''): SceneVideoMeta | null {
  const video = sceneVideoCachePath(entry.id, home)
  const metaPath = sceneVideoMetaPath(entry.id, home)
  try {
    const stat = statSync(video)
    if (!stat.isFile() || stat.size < 512 * 1024) return null
    const raw = JSON.parse(readFileSync(metaPath, 'utf8')) as Partial<SceneVideoMeta>
    if (
      raw.version !== SCENE_VIDEO_VERSION
      || raw.id !== entry.id
      || raw.projectMtimeMs !== projectMtime(entry)
      || typeof raw.width !== 'number' || !Number.isInteger(raw.width) || raw.width < 640
      || typeof raw.height !== 'number' || !Number.isInteger(raw.height) || raw.height < 480
      || typeof raw.createdAt !== 'string'
    ) return null
    return raw as SceneVideoMeta
  } catch {
    return null
  }
}

function baseStatus(entry: WallpaperEntry, phase: SceneVideoPhase): SceneVideoStatus {
  return {
    id: entry.id,
    phase,
    progress: phase === 'ready' ? 100 : 0,
    file: phase === 'ready' ? sceneVideoCachePath(entry.id) : null,
    width: SCENE_VIDEO_WIDTH,
    height: SCENE_VIDEO_HEIGHT,
    duration: SCENE_VIDEO_SECONDS,
    error: null,
    startedAt: null,
    updatedAt: now(),
  }
}

export function getSceneVideoStatus(entry: WallpaperEntry): SceneVideoStatus {
  const current = statuses.get(entry.id)
  if (current?.phase === 'capturing' || current?.phase === 'error') return { ...current }
  const meta = readValidMeta(entry)
  if (meta !== null) {
    const ready = { ...baseStatus(entry, 'ready'), width: meta.width, height: meta.height }
    statuses.set(entry.id, ready)
    return { ...ready }
  }
  return { ...(current ?? baseStatus(entry, 'idle')) }
}

function packageRoot(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url))
  return dirname(moduleDir)
}

function bundledTool(name: string): string {
  return join(packageRoot(), 'tools', 'wcap', name)
}

function weExecutable(install: WeInstall): string | null {
  for (const name of ['wallpaper64.exe', 'wallpaper32.exe']) {
    const candidate = join(install.root, name)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * Windows PowerShell with an absolute path: the packaged desktop host runs
 * with a minimal PATH where a bare `powershell.exe` may not resolve.
 */
function powershellExecutable(): string {
  const windir = process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows'
  const absolute = join(windir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return existsSync(absolute) ? absolute : 'powershell.exe'
}

/** The primary monitor's physical pixel size (DPI-aware probe). */
export async function probeMonitorSize(): Promise<{ width: number; height: number }> {
  try {
    const out = spawnSync(powershellExecutable(), [
      '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
      '-ExecutionPolicy', 'Bypass', '-File', bundledTool('scene-capture-desktop.ps1'),
      '-Action', 'monitor',
    ], { encoding: 'utf8', shell: false, windowsHide: true, timeout: 10000 })
    const match = /^(\d{2,5})x(\d{2,5})\s*$/m.exec(out.stdout ?? '')
    if (out.status === 0 && match !== null) {
      const width = Number(match[1])
      const height = Number(match[2])
      if (width >= 640 && height >= 480) return { width, height }
    }
  } catch {
    // Fall through to the safe default.
  }
  return { width: SCENE_VIDEO_WIDTH, height: SCENE_VIDEO_HEIGHT }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** The deterministic recorder configuration written beside the runtime exe. */
export function wcapIni(
  outputFolder: string,
  seconds = SCENE_VIDEO_SECONDS,
  width = SCENE_VIDEO_WIDTH,
  height = SCENE_VIDEO_HEIGHT,
): string {
  // Keep the per-pixel bitrate in a sane band so 1440p/4K captures stay sharp.
  const pixels = width * height
  const bitrate = pixels > 2560 * 1440 ? 24000 : pixels > 1920 * 1080 ? 20000 : 16000
  return `[wcap]\nMouseCursor=0\nOnlyClientArea=1\nShowRecordingBorder=0\nKeepRoundedWindowCorners=0\nIncludeSecondaryWindows=0\nHardwareEncoder=1\nHardwarePreferIntegrated=0\nOutputFolder=${outputFolder}\nOpenFolder=0\nFragmentedOutput=0\nEnableLimitLength=1\nEnableLimitSize=0\nLimitLength=${seconds}\nLimitSize=500\nGammaCorrectResize=1\nImprovedColorConversion=1\nVideoCodec=H264\nVideoProfile=High\nVideoMaxWidth=${width}\nVideoMaxHeight=${height}\nVideoMaxFramerate=30\nVideoBitrate=${bitrate}\nCaptureAudio=0\nApplicationLocalAudio=0\nAudioCodec=AAC\nAudioChannels=2\nAudioSamplerate=48000\nAudioBitrate=160\nShortcutMonitor=0\nShortcutWindow=167772204\nShortcutRegion=0\n`
}

function newestMp4(dir: string): string | null {
  try {
    const files = readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith('.mp4'))
      .map((name) => ({ file: join(dir, name), stat: statSync(join(dir, name)) }))
      .filter(({ stat }) => stat.isFile())
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    return files[0]?.file ?? null
  } catch {
    return null
  }
}

function updateProgress(id: string, progress: number): void {
  const status = statuses.get(id)
  if (status === undefined || status.phase !== 'capturing') return
  status.progress = Math.max(status.progress, Math.min(95, Math.round(progress)))
  status.updatedAt = now()
}

/** Run one bundled scene-capture-desktop.ps1 action; null when it fails. */
function runDesktopScript(action: 'present' | 'restore', title: string, width?: number, height?: number): string | null {
  try {
    const args = [
      '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
      '-ExecutionPolicy', 'Bypass', '-File', bundledTool('scene-capture-desktop.ps1'),
      '-Action', action,
    ]
    if (action === 'present') {
      args.push('-Title', title, '-Width', String(width ?? 0), '-Height', String(height ?? 0))
    }
    const out = spawnSync(powershellExecutable(), args, {
      encoding: 'utf8', shell: false, windowsHide: true, timeout: 10000,
    })
    return out.status === 0 ? (out.stdout ?? '').trim() : null
  } catch {
    return null
  }
}

async function runCapture(entry: WallpaperEntry, install: WeInstall): Promise<void> {
  const executable = weExecutable(install)
  if (executable === null) throw new Error('wallpaper-engine-executable-not-found')
  const bundledWcap = bundledTool('wcap-x64.exe')
  const hotkeyScript = bundledTool('send-window-capture-hotkey.ps1')
  if (!existsSync(bundledWcap) || !existsSync(hotkeyScript)) throw new Error('wcap-tool-not-found')

  // Record at the monitor's native resolution instead of a fixed 1080p:
  // the WE window must cover the whole screen for a clean capture.
  const monitor = await probeMonitorSize()

  const cacheRoot = sceneVideoDir()
  const runtimeDir = join(cacheRoot, 'runtime')
  const jobDir = join(cacheRoot, `.job-${entry.id}-${process.pid}-${Date.now()}`)
  mkdirSync(runtimeDir, { recursive: true })
  mkdirSync(jobDir, { recursive: true })
  const runtimeWcap = join(runtimeDir, 'wcap-x64.exe')
  copyFileSync(bundledWcap, runtimeWcap)
  writeFileSync(join(runtimeDir, 'wcap-x64.ini'), wcapIni(jobDir, SCENE_VIDEO_SECONDS, monitor.width, monitor.height), 'utf8')

  const location = `DSH-WE-Record-${entry.id}`
  activeLocation = location
  activeInstall = install
  try {
    activeRecorder = spawn(runtimeWcap, [], {
      cwd: runtimeDir,
      windowsHide: true,
      stdio: 'ignore',
    })
    await delay(700)
    if (activeRecorder.exitCode !== null) throw new Error('wcap-unavailable-or-already-running')
    updateProgress(entry.id, 5)

    const open = spawnSync(executable, [
      '-control', 'openWallpaper',
      '-file', join(entry.dir, 'project.json'),
      '-playInWindow', location,
      '-width', String(monitor.width),
      '-height', String(monitor.height),
      '-x', '0', '-y', '0', '-activate', '-borderless',
    ], { encoding: 'utf8', shell: false, windowsHide: true, timeout: 8000 })
    if (open.status !== 0) throw new Error(`wallpaper-engine-open-failed:${open.status ?? 'unknown'}`)
    await delay(2200)
    updateProgress(entry.id, 10)

    // True fullscreen presentation: hide the taskbars, force the window
    // topmost at the exact monitor rect, centre the cursor on it (wcap
    // captures the window under the cursor), then start the recorder.
    const presented = runDesktopScript('present', location, monitor.width, monitor.height)
    if (presented !== 'ok') throw new Error(`scene-window-present-failed:${presented ?? 'script-error'}`)
    await delay(600)
    updateProgress(entry.id, 15)

    const hotkey = spawnSync(powershellExecutable(), [
      '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
      '-ExecutionPolicy', 'Bypass', '-File', hotkeyScript,
    ], { encoding: 'utf8', shell: false, windowsHide: true, timeout: 8000 })
    if (hotkey.status !== 0) throw new Error(`wcap-hotkey-failed:${hotkey.status ?? 'unknown'}`)

    for (let second = 0; second < SCENE_VIDEO_SECONDS + 4; second += 1) {
      await delay(1000)
      updateProgress(entry.id, 15 + (second + 1) / (SCENE_VIDEO_SECONDS + 4) * 75)
      const candidate = newestMp4(jobDir)
      if (second >= SCENE_VIDEO_SECONDS && candidate !== null) {
        const stat = statSync(candidate)
        await delay(600)
        if (statSync(candidate).size === stat.size && stat.size >= 512 * 1024) break
      }
    }

    const recorded = newestMp4(jobDir)
    if (recorded === null || statSync(recorded).size < 512 * 1024) throw new Error('wcap-output-not-found')
    const finalPath = sceneVideoCachePath(entry.id)
    const tempPath = `${finalPath}.tmp-${process.pid}`
    copyFileSync(recorded, tempPath)
    rmSync(finalPath, { force: true })
    renameSync(tempPath, finalPath)
    const meta: SceneVideoMeta = {
      version: SCENE_VIDEO_VERSION,
      id: entry.id,
      projectMtimeMs: projectMtime(entry),
      width: monitor.width,
      height: monitor.height,
      duration: SCENE_VIDEO_SECONDS,
      createdAt: now(),
    }
    writeFileSync(sceneVideoMetaPath(entry.id), JSON.stringify(meta), 'utf8')
    statuses.set(entry.id, { ...baseStatus(entry, 'ready'), width: meta.width, height: meta.height })
  } finally {
    // Bring the desktop back no matter how the capture ended.
    runDesktopScript('restore', location)
    spawnSync(executable, ['-control', 'closeWallpaper', '-location', location], {
      encoding: 'utf8', shell: false, windowsHide: true, timeout: 8000,
    })
    if (activeRecorder !== null && activeRecorder.exitCode === null) activeRecorder.kill()
    activeRecorder = null
    activeLocation = null
    activeInstall = null
    rmSync(jobDir, { recursive: true, force: true })
  }
}

/** Start a capture in the background or return the existing cache/job. */
export function requestSceneVideo(entry: WallpaperEntry, install: WeInstall): SceneVideoStatus {
  if (entry.type !== 'scene') return { ...baseStatus(entry, 'error'), error: 'scene-video-requires-scene' }
  const existing = getSceneVideoStatus(entry)
  if (existing.phase === 'ready' || existing.phase === 'capturing') return existing
  if ([...statuses.values()].some((status) => status.phase === 'capturing')) {
    return { ...baseStatus(entry, 'error'), error: 'scene-video-capture-busy' }
  }

  const capturing = { ...baseStatus(entry, 'capturing'), startedAt: now(), progress: 1 }
  statuses.set(entry.id, capturing)
  void runCapture(entry, install).catch((error) => {
    statuses.set(entry.id, {
      ...baseStatus(entry, 'error'),
      error: error instanceof Error ? error.message : String(error),
      startedAt: capturing.startedAt,
    })
  })
  return { ...capturing }
}

/** Stop a running recorder and close its temporary WE window on plugin unload. */
export function disposeSceneVideoCapture(): void {
  if (activeRecorder !== null && activeRecorder.exitCode === null) activeRecorder.kill()
  activeRecorder = null
  // Never leave the user's taskbar hidden, even after an aborted capture.
  try {
    spawnSync(powershellExecutable(), [
      '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
      '-ExecutionPolicy', 'Bypass', '-File', bundledTool('scene-capture-desktop.ps1'),
      '-Action', 'restore',
    ], { encoding: 'utf8', shell: false, windowsHide: true, timeout: 10000 })
  } catch {
    // Restore is best-effort; the capture closed its own taskbar hide.
  }
  if (activeInstall !== null && activeLocation !== null) {
    const executable = weExecutable(activeInstall)
    if (executable !== null) {
      spawnSync(executable, ['-control', 'closeWallpaper', '-location', activeLocation], {
        encoding: 'utf8', shell: false, windowsHide: true, timeout: 8000,
      })
    }
  }
  activeLocation = null
  activeInstall = null
}
