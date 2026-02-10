/**
 * @file background/task-registry.js
 * @description 任务注册表 (InMemory Task Registry)
 * * 核心职责 (Core Responsibilities):
 * 1. 跨模块数据共享 (Inter-Module Data Sharing):
 * - 作为一个全局单例的内存 Map，充当 `ExportManager` (生产者) 和 `StreamInterceptor` (消费者) 之间的中间件。
 * - 存储待导出的任务上下文 (Pipeline 实例、文件名、标题等)。
 * * 2. 临时状态保持 (Ephemeral State Holding):
 * - 数据生命周期短暂：从生成下载链接开始，到拦截器接收到请求并提取数据后立即删除 (`get` -> `del`)，确保内存不泄露。
 * * @author weiyunjun
 * @version v0.1.0
 */

const taskMap = new Map();

export const TaskRegistry = {
    set: (uuid, data) => {
        taskMap.set(uuid, data);
    },
    get: (uuid) => taskMap.get(uuid),
    del: (uuid) => {
        taskMap.delete(uuid);
    },
    has: (uuid) => taskMap.has(uuid),
};
