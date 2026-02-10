/**
 * @file background/download-engine.js
 * @description 核心下载引擎 (Download Execution Core)
 * * 核心职责 (Core Responsibilities):
 * 1. 任务执行状态机 (State Machine):
 * - 管理单个任务的生命周期：解析(Resolving) -> 下载(Downloading) -> 合并(Processing) -> 导出(Exporting)。
 * - 维护 `currentPipeline` (StoragePipeline) 实例，协调底层 IO 操作。
 * * 2. 严格流程控制 (Strict Flow Control):
 * - 采用串行化流程 (`_executeStrictFlow`)：音频下载 -> 视频下载 -> 混流合并，以最小化内存占用和并发压力。
 * - 支持 "Raw Mode" (音视频分离) 与 "Merge Mode" (合成 MP4) 两种导出策略。
 * * 3. 附件与异常处理 (Sidecar & Error Handling):
 * - 负责封面、弹幕等附属文件的下载 (`_processSpecificSidecars`)。
 * - 统一捕获异常，区分用户取消、网络错误与不可重试错误，并触发重试机制。
 * * 交互链路 (Interaction):
 * - 调用 `TaskResolver` 补全元数据。
 * - 调用 `StoragePipeline` 进行分片下载与 OPFS 写入。
 * - 调用 `ExportManager` 触发浏览器下载。
 * - 任务完成后通过 `_triggerCompletionSound` 请求 Offscreen 播放音效。
 * * @author weiyunjun
 * @version v0.1.0
 */

import { StoragePipeline } from '../core/storage-pipeline.js';
import { taskScheduler } from './task-scheduler.js';
import { taskResolver } from './task-resolver.js';
import { exportManager } from './export-manager.js';
import { statusManager } from './status-manager.js';
import { historyManager } from './history-manager.js';
import { ErrorHandler } from './error-handler.js';
class DownloadEngine {
    constructor() {
        this.isProcessing = false;
        this.activeTask = null;
        this.currentPipeline = null;
        this.hostTabId = null;
        this.pipelineScriptLoaded = 0;
        this.currentdownload_id = null;
        this.retryTimer = null;
        this.refreshTimeoutTimer = null;
        this.threadCount = 4;
    }

    setHostTabId(id) {
        this.hostTabId = id;
    }

    handleTabRemoved(tabId) {
        if (tabId === this.hostTabId) {
            this.hostTabId = null;
        }
    }

    async execute(task) {
        if (this.isProcessing) return;
        this.isProcessing = true;
        this.activeTask = task;

        if (!task.status.mainMediaSuccess) {
            task.status.phase = 'resolving';
            task.status.phase_text = '解析任务中...';
        }

        await chrome.storage.local.set({ activeTask: task });
        statusManager.resetState();

        try {
            if (!task.status.mainMediaSuccess) {
                await taskResolver.resolve(task, this.hostTabId);
            }

            await this._executeStrictFlow(task);
        } catch (e) {
            console.error('[DownloadEngine] 执行/解析失败:', e);
            const { message: message, retryable: retryable } = ErrorHandler.process(e);

            task.status.error = { message: message, code: e.code };
            this._finishCurrentTask('error', message, retryable);
        }
    }

    async _executeStrictFlow(task) {
        const isRawMode = !task.preference.strategy_config.merge;
        const collection = task.metadata.collection_title;
        const title = task.metadata.title;
        const audioPath = collection ? `${collection}/${title}.m4a` : `${title}.m4a`;
        const videoPath = collection ? `${collection}/${title}.m4s` : `${title}.m4s`;
        const mergedPath = collection ? `${collection}/${title}.mp4` : `${title}.mp4`;

        if (!task.status.download_ids) {
            task.status.download_ids = {
                full_video: null,
                video_stream: null,
                audio_stream: null,
                cover: null,
                danmaku: null,
            };
        }

        try {
            if (!task.status.mainMediaSuccess) {
                task.status.progress.total = 0;
                task.status.progress.loaded = 0;
                if (!isRawMode) this.currentPipeline = new StoragePipeline();

                try {
                    if (task.status.audio) {
                        if (isRawMode) {
                            this.currentPipeline = new StoragePipeline();
                            this.pipelineScriptLoaded = 0;
                        }

                        task.status.phase = 'downloadingAudio';
                        task.status.phase_text = '下载音频中...';
                        await this._downloadStreamPart(this.currentPipeline, task, 'audio');

                        if (isRawMode) {
                            task.status.phase = 'saveAudio';
                            task.status.phase_text = '保存音频...';
                            task.status.download_ids.audio_stream = await exportManager.exportStream(
                                this.currentPipeline,
                                task,
                                audioPath,
                                this.hostTabId,
                                'raw',
                            );
                            this.currentPipeline = null;
                            this.pipelineScriptLoaded = 0;
                        }
                    }

                    if (task.status.video) {
                        if (isRawMode) {
                            this.currentPipeline = new StoragePipeline();
                            this.pipelineScriptLoaded = 0;
                        }

                        task.status.phase = 'downloadingVideo';
                        task.status.phase_text = '下载视频中...';
                        await this._downloadStreamPart(this.currentPipeline, task, 'video');

                        if (isRawMode) {
                            task.status.phase = 'saveVideo';
                            task.status.phase_text = '保存视频...';
                            task.status.download_ids.video_stream = await exportManager.exportStream(
                                this.currentPipeline,
                                task,
                                videoPath,
                                this.hostTabId,
                                'raw',
                            );
                            this.currentPipeline = null;
                        }
                    }

                    if (!isRawMode) {
                        task.status.phase = 'processing';
                        task.status.phase_text = '合并音视频中...';
                        task.status.download_ids.full_video = await exportManager.exportStream(
                            this.currentPipeline,
                            task,
                            mergedPath,
                            this.hostTabId,
                            'universal',
                        );
                    }

                    task.status.mainMediaSuccess = true;
                } finally {
                    if (this.currentPipeline) {
                        try {
                            await this.currentPipeline.cleanup();
                        } catch (e) {}

                        this.currentPipeline = null;
                    }
                }
            } else {

            }

            if (task.status.attachments && task.status.attachments.length > 0) {
                const pendingAttachments = task.status.attachments.filter((a) => a.status !== 'success');

                if (pendingAttachments.length > 0) {
                    const covers = task.status.attachments.filter((a) => a.type === 'cover');

                    if (covers.length > 0) {
                        task.status.phase = 'fetchCover';
                        task.status.phase_text = '获取封面...';
                        await this._processSpecificSidecars(covers, collection, title, task);
                    }

                    const danmakus = task.status.attachments.filter((a) => a.type === 'danmaku');

                    if (danmakus.length > 0) {
                        task.status.phase = 'fetchDanmaku';
                        task.status.phase_text = '获取弹幕...';
                        await this._processSpecificSidecars(danmakus, collection, title, task);
                    }
                }
            }

            this._finishCurrentTask('done');
        } catch (error) {
            console.error('[DownloadEngine] 任务中断:', error);
            let errorMsg = error.message || '未知错误';
            const isExplicitCancel = errorMsg === 'USER_CANCELED' || errorMsg === 'Aborted';
            const isMarkedCanceled = task.status.phase === 'canceled';
            const isAbortCancel = error.name === 'AbortError' && isMarkedCanceled;
            const isCanceled = isExplicitCancel || isMarkedCanceled || isAbortCancel;
            let processedError = error;

            if (isCanceled) {
                processedError = { message: 'USER_CANCELED' };
            }

            const { message: message } = ErrorHandler.process(processedError);

            errorMsg = message;
            task.status.error = { message: errorMsg };
            this._finishCurrentTask(isCanceled ? 'canceled' : 'error', errorMsg);
        }
    }

    async _downloadStreamPart(pipeline, task, targetType) {
        const isRawMode = !task.preference.strategy_config.merge;
        let pipelineData = {
            title: task.metadata.title,
            rawMode: isRawMode,
            video: null,
            audio: null,
            video_candidates: null,
            audio_candidates: null,
        };

        if (isRawMode) {
            if (targetType === 'audio' && task.status.audio) {
                if (task.status.audio_candidates && task.status.audio_candidates.length > 0) {
                    pipelineData.audio_candidates = task.status.audio_candidates;
                } else {
                    pipelineData.audio = { urls: task.status.audio.urls };
                }
            } else if (targetType === 'video') {
                if (task.status.video_candidates && task.status.video_candidates.length > 0) {
                    pipelineData.video_candidates = task.status.video_candidates;
                } else if (task.status.video) {
                    pipelineData.video = { urls: task.status.video.urls };
                }
            }
        } else {
            if (task.status.video_candidates && task.status.video_candidates.length > 0) {
                pipelineData.video_candidates = task.status.video_candidates;
            } else if (task.status.video) {
                pipelineData.video = { urls: task.status.video.urls };
            }

            if (task.status.audio_candidates && task.status.audio_candidates.length > 0) {
                pipelineData.audio_candidates = task.status.audio_candidates;
            } else if (task.status.audio) {
                pipelineData.audio = { urls: task.status.audio.urls };
            }
        }

        let estimatedPartSize = 0;

        if (targetType === 'audio' && task.status.audio)
            estimatedPartSize = this._calculateEstimatedSize(task.status.audio, task.metadata.duration);
        else if (targetType === 'video' && task.status.video)
            estimatedPartSize = this._calculateEstimatedSize(task.status.video, task.metadata.duration);
        const effectiveTargetType = targetType;
        let startOffset = 0;

        if (!isRawMode && this.pipelineScriptLoaded > 0) startOffset = this.pipelineScriptLoaded;

        if (isRawMode) {
            task.status.progress.total = estimatedPartSize;
            task.status.progress.loaded = 0;
        } else {
            task.status.progress.total = (task.status.progress.loaded || 0) + estimatedPartSize;
        }

        statusManager.updateProgress(task, task.status.progress.loaded, task.status.progress.total, this.hostTabId);
        const selectedInfo = await pipeline.preload(
            pipelineData,
            effectiveTargetType,
            (loaded, total) => {
                this.pipelineScriptLoaded = loaded;
                task.status.progress.loaded = loaded;

                if (total > 0) {
                    task.status.progress.total = total;
                }

                statusManager.updateProgress(task, task.status.progress.loaded, task.status.progress.total, this.hostTabId);
            },
            (selectedVideo) => {},
            this.threadCount,
        );

        if (selectedInfo) {
            let changed = false;

            if (selectedInfo.video && task.status.video !== selectedInfo.video) {
                task.status.video = selectedInfo.video;
                changed = true;
            }

            if (selectedInfo.videoBytes > 0) {
                if (targetType === 'audio' && isRawMode) {
                    if (task.status.audio) task.status.audio.size = selectedInfo.videoBytes;
                } else if (targetType === 'video' || !isRawMode) {
                    if (task.status.video) task.status.video.size = selectedInfo.videoBytes;
                }
            }

            if (selectedInfo.audio && task.status.audio !== selectedInfo.audio) {
                task.status.audio = selectedInfo.audio;
                changed = true;
            }

            if (selectedInfo.audioBytes > 0) {
                if (task.status.audio) task.status.audio.size = selectedInfo.audioBytes;
            }

            if (changed) {
                statusManager.updateProgress(task, task.status.progress.loaded, task.status.progress.total, this.hostTabId);
            }
        }
    }

    _calculateEstimatedSize(stream, duration) {
        if (!stream || !stream.bandwidth || !duration) return 0;

        return Math.floor((stream.bandwidth * duration) / 8);
    }

    async _processSpecificSidecars(attachmentList, collection_title, title, task) {
        if (!attachmentList || attachmentList.length === 0) return;

        for (const att of attachmentList) {
            if (att.status === 'success') continue;

            let url = null;

            if (att.type === 'cover') {
                url = task.metadata.cover_url;
            } else if (att.type === 'danmaku') {
                url = task.metadata.danmaku_url;
            }

            if (!url) {
                throw new Error('INVALID_ATTACHMENT_URL');
            }

            const ext = att.format;
            let sidecarFilename = collection_title ? collection_title + '/' + title + '.' + ext : title + '.' + ext;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            try {
                // 使用动态获取的 url 进行请求
                const res = await fetch(url, { referrerPolicy: 'no-referrer', signal: controller.signal });

                if (!res.ok) throw new Error(`Sidecar HTTP ${res.status}`);
                const blob = await res.blob();

                clearTimeout(timeoutId);
                const dataUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader();

                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
                // 使用动态生成的文件名进行下载
                const dlId = await exportManager.downloadAttachment(dataUrl, sidecarFilename);

                if (task && task.status && task.status.download_ids) {
                    if (att.type === 'cover') task.status.download_ids.cover = dlId;
                    if (att.type === 'danmaku') task.status.download_ids.danmaku = dlId;
                }

                att.status = 'success';
            } catch (e) {
                clearTimeout(timeoutId);
                throw e;
            }
        }
    }

    async cancelCurrentTask() {
        if (this.isProcessing && this.activeTask) {
            this.activeTask.status.phase = 'canceled';
        }

        if (this.isProcessing && this.currentPipeline) {
            try {
                await this.currentPipeline.cancel();
            } catch (e) {
                console.warn('Cancel failed:', e);
            }
        }
    }

    handleRefreshSuccess(newPayload) {
        if (!this.isProcessing || !this.activeTask) return;
    }

    async _finishCurrentTask(finalPhase, errorDetail = '', retryable = true) {
        if (!this.activeTask) return;
        const task = this.activeTask;

        if (!task.status.download_ids) {
            task.status.download_ids = {
                full_video: null,
                video_stream: null,
                audio_stream: null,
                cover: null,
                danmaku: null,
            };
        }

        delete task.status.download_id;
        task.status.phase = finalPhase;
        task.status.phase_text = errorDetail || (finalPhase === 'done' ? '已完成' : '未完成');

        if (finalPhase === 'done') {
            task.status.finish_time = Date.now();
            delete task.status.progress;
            delete task.status.streams;
            delete task.status.totalBytes;
            delete task.status.mainMediaSuccess;
            delete task.originalIdx;

            if (task.status.video) {
                task.status.video.urls = [];
                task.status.video_candidates = [task.status.video];
                delete task.status.video;
            }

            if (task.status.audio) {
                task.status.audio.urls = [];
                task.status.audio_candidates = [task.status.audio];
                delete task.status.audio;
            }

            this._triggerCompletionSound();
        } else {
            delete task.status.progress;
        }

        historyManager.addRecord(task);

        try {
            await chrome.storage.local.remove('activeTask');
        } catch (e) {
            console.error('[DownloadEngine] Failed to remove activeTask from storage:', e);
        }

        this._resetState();
        taskScheduler.triggerCooldown();
        setTimeout(() => taskScheduler.triggerNext(), 200);

        if (taskScheduler.queue.length === 0) {
            statusManager.resetState();
        }
    }

    async _triggerCompletionSound() {
        try {
            const config = await chrome.storage.local.get(['sound_enabled', 'sound_volume', 'sound_selected']);

            if (config.sound_enabled !== true) {
                return;
            }

            chrome.runtime.sendMessage({ target: 'OFFSCREEN', type: 'PLAY_SOUND', payload: config }).catch(() => {});
        } catch (e) {
            console.warn('[DownloadEngine] Failed to trigger sound:', e);
        }
    }

    _resetState() {
        this.activeTask = null;
        this.currentPipeline = null;
        this.pipelineScriptLoaded = 0;
        this.currentdownload_id = null;

        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }

        if (this.refreshTimeoutTimer) {
            clearTimeout(this.refreshTimeoutTimer);
            this.refreshTimeoutTimer = null;
        }

        this.isProcessing = false;
        statusManager.resetState();
    }
}

export const downloadEngine = new DownloadEngine();
