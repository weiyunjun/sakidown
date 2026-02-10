/**
 * @file background/error-handler.js
 * @description 错误代码映射器 (Error Translation Layer)
 * * 核心职责 (Core Responsibilities):
 * 1. 错误标准化 (Error Standardization):
 * - 将底层晦涩的技术错误信息 (如 `QuotaExceededError`, `AbortError`) 转化为用户友好的中文文案。
 * - 统一处理网络错误、存储错误、文件占用等浏览器级异常。
 * * 2. 业务异常转义 (Business Error Mapping):
 * - 专门处理 Bilibili API 返回的错误码，例如将 `code: 0` 且无 DASH 数据的情况转义为 "用户权限不足" (通常通过充电/付费拦截)。
 * - 格式化其他 API 错误码为 "哔哩哔哩API错误（错误码：xxx）"。
 * * 3. 状态判定 (Status Determination):
 * - 为每个错误附加 `retryable` 标记，指导上层业务逻辑 (DownloadEngine) 是否应该进行自动重试。
 * * @author weiyunjun
 * @version v0.1.0
 */

export const ErrorHandler = {
    process: (error) => {
        let message = error.message || '未知错误';
        let retryable = true;
        const name = error.name || '';

        if (
            message === 'Failed to fetch' ||
      message.includes('NetworkError') ||
      name === 'AbortError' ||
      /HTTP 5\d{2}/.test(message) ||
      name === 'SyntaxError'
        ) {
            return { message: '网络请求失败', retryable: true };
        }

        if (name === 'QuotaExceededError' || message.includes('QuotaExceededError')) {
            return { message: '存储空间不足', retryable: true };
        }

        if (name === 'NoModificationAllowedError' || message.includes('NoModificationAllowedError')) {
            return { message: '文件读写冲突', retryable: true };
        }

        const isApiError = name === 'BilibiliApiError' || name === 'BiliApiError';

        if (isApiError) {
            const code = error.code;

            if (code === 0 && message === 'NO_DASH_DATA') {
                return { message: '用户权限不足', retryable: true };
            }

            return { message: `哔哩哔哩API错误（错误码：${code}）`, retryable: true };
        }

        if (message.includes('Extension context invalidated')) {
            return { message: '插件已更新，请重试下载', retryable: true };
        }

        if (message === 'USER_CANCELED') {
            return { message: '用户手动取消', retryable: true };
        }

        if (message.includes('Export timeout')) {
            return { message: '导出超时', retryable: true };
        }

        return { message: message, retryable: retryable };
    },
};
