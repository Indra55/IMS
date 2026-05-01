import { config } from '../config.ts'
import { type SignalInput } from './schema.ts'

export class RingBuffer<T>{
  private buffer: (T | null)[]
  private head: number = 0
  private tail: number = 0
  private size: number = 0
  private readonly capacity: number

  constructor(capacity: number) {
    this.capacity = capacity
    this.buffer = new Array(capacity).fill(null)
  }

  enqueue(item: T): boolean{
    if (this.isFull()) return false
    this.buffer[this.tail] = item
    this.tail = (this.tail + 1) % this.capacity
    this.size++
    return true
  }

  drain(batchSize: number): T[]{
    const batch: T[] = []
    const count = Math.min(batchSize, this.size)
    for (let i = 0; i < count; i++){
      batch.push(this.buffer[this.head] as T)
      this.buffer[this.head] = null
      this.head = (this.head + 1) % this.capacity
      this.size --
    }
    return batch
  }

  isFull(): boolean { return this.size >= this.capacity }
  isEmpty(): boolean { return this.size === 0 }
  getSize(): number { return this.size }
  getCapacity(): number { return this.capacity}
  
}

export const signalBuffer = new RingBuffer<SignalInput>(config.RING_BUFFER_CAPACITY)