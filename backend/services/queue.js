/**
 * AI 请求队列 — 控制并发，防止 LLM API 被打爆
 *
 * 设计思路：
 * - 最多同时处理 MAX_CONCURRENT 个 LLM 请求
 * - 超出的排队等待，返回队列位置
 * - 每个请求有超时保护
 * - 支持优先级（管理员/付费用户优先）
 */

const MAX_CONCURRENT = 5;       // 最大并发 LLM 请求数
const MAX_QUEUE_SIZE = 100;     // 队列最大长度
const REQUEST_TIMEOUT = 60000;  // 单个请求超时 60s

class RequestQueue {
  constructor() {
    this.running = 0;
    this.queue = [];  // { task, priority, enqueuedAt, resolve, reject }
    this.stats = {
      totalProcessed: 0,
      totalFailed: 0,
      totalTimeout: 0,
      totalRejected: 0,  // 队列满被拒绝
      avgWaitMs: 0,
      avgProcessMs: 0,
    };
  }

  /**
   * 提交任务到队列
   * @param {Function} task - 异步任务函数
   * @param {Object} options
   * @param {number} options.priority - 优先级，数字越小越优先（默认 10）
   * @param {number} options.timeout - 超时时间 ms（默认 60s）
   * @returns {Promise<{result, waitMs, processMs, queuePosition}>}
   */
  enqueue(task, options = {}) {
    const {
      priority = 10,
      timeout = REQUEST_TIMEOUT,
    } = options;

    // 队列满了直接拒绝
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.stats.totalRejected++;
      return Promise.reject(new Error('服务器繁忙，排队人数已满，请稍后再试'));
    }

    return new Promise((resolve, reject) => {
      const item = {
        task,
        priority,
        timeout,
        enqueuedAt: Date.now(),
        resolve,
        reject,
      };

      // 按优先级插入（稳定排序，同优先级 FIFO）
      let inserted = false;
      for (let i = 0; i < this.queue.length; i++) {
        if (this.queue[i].priority > priority) {
          this.queue.splice(i, 0, item);
          inserted = true;
          break;
        }
      }
      if (!inserted) this.queue.push(item);

      this._tryNext();
    });
  }

  /**
   * 获取队列状态
   */
  getStatus() {
    return {
      running: this.running,
      maxConcurrent: MAX_CONCURRENT,
      queued: this.queue.length,
      maxQueueSize: MAX_QUEUE_SIZE,
      stats: { ...this.stats },
    };
  }

  /**
   * 获取某个请求在队列中的位置（0-based，-1 表示不在队列中）
   */
  getPosition(predicate) {
    return this.queue.findIndex(predicate);
  }

  async _tryNext() {
    if (this.running >= MAX_CONCURRENT || this.queue.length === 0) return;

    this.running++;
    const item = this.queue.shift();
    const waitMs = Date.now() - item.enqueuedAt;

    // 超时保护
    let timeoutId;
    let timedOut = false;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        this.stats.totalTimeout++;
        reject(new Error('AI 响应超时，请稍后重试'));
      }, item.timeout);
    });

    const startProcess = Date.now();

    try {
      const result = await Promise.race([
        item.task(),
        timeoutPromise,
      ]);

      clearTimeout(timeoutId);

      if (!timedOut) {
        const processMs = Date.now() - startProcess;
        this.stats.totalProcessed++;
        this._updateAvg(waitMs, processMs);
        item.resolve({ result, waitMs, processMs, queuePosition: -1 });
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (!timedOut) {
        this.stats.totalFailed++;
        item.reject(err);
      }
    } finally {
      this.running--;
      this._tryNext();
    }
  }

  _updateAvg(waitMs, processMs) {
    const n = this.stats.totalProcessed;
    this.stats.avgWaitMs = Math.round(((this.stats.avgWaitMs * (n - 1)) + waitMs) / n);
    this.stats.avgProcessMs = Math.round(((this.stats.avgProcessMs * (n - 1)) + processMs) / n);
  }
}

// 单例
const aiQueue = new RequestQueue();

module.exports = { aiQueue, RequestQueue };
