/**
 * @file settings/data-panel.js
 * @description 数据管理面板控制器 (Data Settings Panel)
 * * 核心职责 (Core Responsibilities):
 * 1. 数据导出 (Data Export):
 * - 实现将 IndexedDB 中的 `history` 记录导出为 JSON 文件。
 * - 执行数据过滤：仅导出已完成 (`phase === 'done'`) 的任务。
 * - 数据排序：按完成时间 (`finish_time`) 倒序排列。
 * * 2. 大文件分片策略 (Chunked Export Strategy):
 * - 针对海量数据导出场景，采用 `CHUNK_SIZE` (10000条) 进行分卷处理。
 * - 生成带时间戳和分卷号的文件名 (e.g., `SakiDownData-yy-mm-dd-p1.json`)。
 * - 串行执行下载任务，有效避免浏览器内存溢出 (OOM) 和下载请求拥堵。
 * * 3. 内存与性能优化 (Performance Optimization):
 * - 使用 `URL.createObjectURL(Blob)` 替代 Base64 方案，大幅降低大文件导出的内存开销。
 * - 在关键节点显式释放大对象 (`allRecords = null`)，辅助 GC 回收。
 * * 通信链路 (Communication):
 * - Input: 从 `window.appDB` 读取全量历史记录。
 * - Output: 动态创建 `<a>` 标签触发浏览器下载行为。
 * * @author weiyunjun
 * @version v0.1.0
 */

class DataPanel {
    constructor(headerContainer, contentContainer, modal) {
        this.dom = { header: headerContainer, content: contentContainer };
        this.modal = modal;
        this.CHUNK_SIZE = 10000;
    }

    render() {
        this._renderHeader();
        this._renderContent();
    }

    _renderHeader() {
        this.dom.header.innerHTML = '';
        const DOM = window.DOMUtils;
        const leftGroup = DOM.create('div', 'ud-settings-header-left');
        const titleEl = DOM.create('span', 'ud-panel-title', '数据');

        leftGroup.appendChild(titleEl);
        this.dom.header.appendChild(leftGroup);
    }

    _renderContent() {
        this.dom.content.innerHTML = '';
        const DOM = window.DOMUtils;
        const form = this.dom.content;
        const exportSection = DOM.create('div', 'ud-settings-section');

        exportSection.appendChild(DOM.create('div', 'ud-form-header', '数据导出'));
        const exportRow = DOM.create('div', 'ud-form-row align-start');
        const labelGroup = DOM.createLabelGroup({
            label: '任务数据导出',
            note: '导出已完成的任务数据为json文件（数据导入功能开发中）',
        });

        exportRow.appendChild(labelGroup);
        const controls = DOM.create('div', 'ud-form-controls');
        const exportBtn = DOM.createButton({
            text: '导出',
            type: 'settings-normal',
            icon: window.Icons ? window.Icons.export : null,
            onClick: () => this._handleExport(),
        });

        controls.appendChild(exportBtn);
        exportRow.appendChild(controls);
        exportSection.appendChild(exportRow);
        form.appendChild(exportSection);
    }

    async _handleExport() {
        try {
            if (this.modal && this.modal.showToast) {
                this.modal.showToast('正在准备数据...');
            }

            let allRecords = await window.appDB.getAll('history');
            let validRecords = allRecords.filter((r) => r.status && r.status.phase === 'done');

            allRecords = null;

            if (validRecords.length === 0) {
                if (this.modal) this.modal.showToast('没有符合条件的已完成任务');

                return;
            }

            validRecords.sort((a, b) => {
                const tA = a.status.finish_time || 0;
                const tB = b.status.finish_time || 0;

                return tB - tA;
            });
            const timeStr = this._formatDate(new Date());
            const totalCount = validRecords.length;
            const totalParts = Math.ceil(totalCount / this.CHUNK_SIZE);

            if (this.modal) {
                this.modal.showToast(`共 ${totalCount} 条数据，将分为 ${totalParts} 个文件导出`);
            }

            for (let i = 0; i < totalParts; i++) {
                const start = i * this.CHUNK_SIZE;
                const end = Math.min(start + this.CHUNK_SIZE, totalCount);
                const chunkData = validRecords.slice(start, end);
                const filename = `SakiDownData-${timeStr}-p${i + 1}.json`;

                await this._triggerDownload(chunkData, filename);
            }

            validRecords = null;
        } catch (e) {
            console.error('[DataPanel] Export failed:', e);
            if (this.modal) this.modal.showToast('导出失败: ' + e.message);
        }
    }

    _formatDate(date) {
        const pad = (n) => n.toString().padStart(2, '0');
        const yy = date.getFullYear().toString().slice(-2);
        const mm = pad(date.getMonth() + 1);
        const dd = pad(date.getDate());
        const hh = pad(date.getHours());
        const min = pad(date.getMinutes());
        const ss = pad(date.getSeconds());

        return `${yy}-${mm}-${dd}-${hh}-${min}-${ss}`;
    }

    async _triggerDownload(data, filename) {
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        return Promise.resolve();
    }
}
window.DataPanel = DataPanel;
