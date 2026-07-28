import { describe, it, expect } from 'vitest'
import { GenericEscPosDriver } from './generic-escpos.driver'

describe('GenericEscPosDriver', () => {
  it('starts the byte stream with the ESC @ initialize command', () => {
    const bytes = new GenericEscPosDriver().buildTestPrintBytes()
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40])
  })

  it('ends the byte stream with the GS V 0 full-cut command', () => {
    const bytes = new GenericEscPosDriver().buildTestPrintBytes()
    expect(Array.from(bytes.slice(-3))).toEqual([0x1d, 0x56, 0x00])
  })

  it('contains the sample bill text from the project spec', () => {
    const bytes = new GenericEscPosDriver().buildTestPrintBytes()
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('NDT Bubble Tea')
    expect(text).toContain('Order #1001')
    expect(text).toContain('TOTAL')
    expect(text).toContain('$8.50')
    expect(text).toContain('Thank You')
  })
})
