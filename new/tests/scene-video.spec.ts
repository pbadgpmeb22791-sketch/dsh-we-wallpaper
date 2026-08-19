import { describe, expect, it } from 'vitest'
import { sceneVideoCachePath, wcapIni } from '../src/scene-video.ts'

describe('scene video capture configuration', () => {
  it('writes a bounded high-quality, silent window-capture profile', () => {
    const ini = wcapIni('D:\\cache\\job', 12)
    expect(ini).toContain('OnlyClientArea=1')
    expect(ini).toContain('VideoMaxWidth=1920')
    expect(ini).toContain('VideoMaxHeight=1080')
    expect(ini).toContain('VideoMaxFramerate=30')
    expect(ini).toContain('VideoBitrate=16000')
    expect(ini).toContain('EnableLimitLength=1')
    expect(ini).toContain('LimitLength=12')
    expect(ini).toContain('CaptureAudio=0')
    expect(ini).toContain('ShortcutWindow=167772204')
  })

  it('keeps generated video inside the plugin cache tree', () => {
    expect(sceneVideoCachePath('3409595232', 'D:\\dsh-home'))
      .toContain('we-wallpaper-cache')
    expect(sceneVideoCachePath('3409595232', 'D:\\dsh-home'))
      .toMatch(/3409595232\.mp4$/)
  })
})
