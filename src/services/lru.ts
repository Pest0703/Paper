export class LruCache<K, V> {
  private values = new Map<K, V>();
  constructor(private readonly limit: number) {}
  get(key: K) {
    const value = this.values.get(key);
    if (value === undefined) return undefined;
    this.values.delete(key);
    this.values.set(key, value);
    return value;
  }
  set(key: K, value: V) {
    this.values.delete(key);
    this.values.set(key, value);
    while (this.values.size > this.limit)
      this.values.delete(this.values.keys().next().value!);
  }
  get size() {
    return this.values.size;
  }
  keys() {
    return [...this.values.keys()];
  }
}
