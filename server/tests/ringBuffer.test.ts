import { expect, test, describe } from 'bun:test'
import { RingBuffer } from '../ingestion/ringBuffer.ts'

describe('RingBuffer', () => {
  test('enqueue and drain basic', () => {
    const rb = new RingBuffer<number>(5)
    expect(rb.enqueue(1)).toBe(true)
    expect(rb.enqueue(2)).toBe(true)
    expect(rb.getSize()).toBe(2)

    const batch = rb.drain(5)
    expect(batch).toEqual([1, 2])
    expect(rb.getSize()).toBe(0)
  })

  test('buffer overflow returns false', () => {
    const rb = new RingBuffer<number>(2)
    expect(rb.enqueue(1)).toBe(true)
    expect(rb.enqueue(2)).toBe(true)
    
    // 3rd element should be rejected due to capacity=2
    expect(rb.enqueue(3)).toBe(false)
    
    expect(rb.getSize()).toBe(2)
  })

  test('drain produces correct batches', () => {
    const rb = new RingBuffer<number>(10)
    for (let i = 1; i <= 5; i++) rb.enqueue(i)

    const batch1 = rb.drain(2)
    expect(batch1).toEqual([1, 2])
    expect(rb.getSize()).toBe(3)

    // Drain more than what is available
    const batch2 = rb.drain(5) 
    expect(batch2).toEqual([3, 4, 5])
    expect(rb.getSize()).toBe(0)
  })
})
