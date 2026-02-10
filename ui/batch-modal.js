/**
 * @file ui/batch-modal.js
 * @description 批量下载选择器 (Batch Download Selector)
 * * 核心职责 (Core Responsibilities):
 * 1. 树形列表渲染 (Tree List Rendering):
 * - 将扁平的播放列表数据渲染为可视化的文件夹/文件树结构。
 * - 利用 CSS 变量 (`--tree-level`) 实现层级缩进，支持文件夹折叠/展开。
 * 2. 复杂交互处理 (Complex Interaction):
 * - 联动 `BatchTreeHelper` 处理复选框的三态逻辑 (全选/部分选/未选)。
 * - 实现表头全选与底部信息的实时更新。
 * 3. 策略选择与可视化 (Strategy Selection & Visualization):
 * - 集成策略选择下拉框，并动态生成富文本 Tooltip (`_generateStrategyTooltip`)。
 * - 直观展示当前策略包含的内容：流媒体格式 (AV1/HEVC)、画质标签、附件类型 (封面/弹幕)。
 * * 通信链路 (Communication):
 * - Input: 接收 `playlist` (视频元数据列表)。
 * - Output: 通过 `onConfirm` 回调返回用户选中的 `selectedItems` 和 `strategyConfig`。
 * * @author weiyunjun
 * @version v0.1.0
 */

class BatchModal {
    constructor(playlist) {
        this.playlist = playlist;
        this.modal = null;
        this._batchStorageListener = null;
        this.treeHelper = new window.BatchTreeHelper();
        this.treeHelper.buildTree(playlist);
        this.batchState = { step: 1, strategyId: null };
        this.onConfirmHandler = null;
        this.onCancelHandler = null;
        this.dom = {};
    }

    showModal() {
        if (!window.BaseModal) return;
        this.modal = new window.BaseModal({ title: '批量下载 - 选择视频', width: '700px', mountNode: document.body });
        const originalHide = this.modal.hideModal.bind(this.modal);

        this.modal.hideModal = () => {
            originalHide();
            this._cleanup();
            if (this.onCancelHandler) this.onCancelHandler();
        };

        const Strategies = window.Strategies || {};
        const STORAGE_KEY = (Strategies.STRATEGY_CONSTANTS && Strategies.STRATEGY_CONSTANTS.STORAGE_KEY) || 'bd_strategies';
        const defaultStrategies = Strategies.DEFAULT_STRATEGIES || [];

        chrome.storage.local.get(['bd_pref_single', STORAGE_KEY], (res) => {
            const savedStrategies = res[STORAGE_KEY];

            this.allStrategies =
        savedStrategies && Array.isArray(savedStrategies) && savedStrategies.length > 0
            ? savedStrategies
            : defaultStrategies;

            if (res['bd_pref_single'] && res['bd_pref_single'].lastStrategyId) {
                this.batchState.strategyId = res['bd_pref_single'].lastStrategyId;
            }

            const exists = this.allStrategies.some((s) => s.id === this.batchState.strategyId);

            if (!exists && this.allStrategies.length > 0) {
                this.batchState.strategyId = this.allStrategies[0].id;
            }

            this._renderVideoList({ keepScroll: false, scrollToCurrent: true });
            this.modal.showModal();
        });
    }

    _renderVideoList(options = { keepScroll: true }) {
        const modal = this.modal;

        modal.dom.title.textContent = '下载视频';
        const body = modal.dom.body;

        body.classList.add('ud-batch-body');
        this._cleanup();
        modal.dom.cancelBtn.textContent = '取消';

        modal.dom.cancelBtn.onclick = () => {
            modal.hideModal();
        };

        let header = body.querySelector('.ud-table-header');

        if (!header) {
            header = document.createElement('div');
            header.className = 'ud-table-header ud-batch-grid';
            header.innerHTML = `\n                <div class="ud-table-cell ud-col-center">\n                    <input type="checkbox" class="ud-checkbox" id="batch-header-check">\n                </div>\n                <div class="ud-table-cell ud-tree-header-fix">名称</div>\n            `;
            body.appendChild(header);
        }

        let tableBody = body.querySelector('.ud-table-body');
        let currentScrollTop = 0;

        if (options.keepScroll && tableBody) {
            currentScrollTop = tableBody.scrollTop;
        }

        if (!tableBody) {
            tableBody = document.createElement('div');
            tableBody.className = 'ud-table-body';
            body.appendChild(tableBody);
        } else {
            tableBody.innerHTML = '';
        }

        const visibleNodes = this.treeHelper.getVisibleRows();

        if (!this.fixedHeight) {
            const estimatedRowHeight = 40;
            const calcHeight = Math.min(Math.max(visibleNodes.length * estimatedRowHeight + 80, 200), 550);

            this.fixedHeight = `${calcHeight}px`;
        }

        body.style.height = this.fixedHeight;
        visibleNodes.forEach((node) => {
            const row = document.createElement('div');

            row.className = 'ud-table-row ud-batch-grid ud-tree-row';

            if (node.type === 'file' && node.data.metadata.is_current) {
                row.classList.add('is-current');
            }

            if (node.expanded) {
                row.classList.add('expanded');
            }

            const treeLevelStyle = `--tree-level: ${node.level}`;
            let toggleHtml = '';
            let iconHtml = '';

            if (node.type === 'folder') {
                toggleHtml = `\n                    <div class="ud-tree-toggle js-toggle-folder">\n                        ${window.Icons.chevron}\n                    </div>\n                `;
                iconHtml = `\n                    <div class="ud-tree-icon-container">\n                        <span class="ud-tree-icon-folder">${window.Icons.folder}</span>\n                    </div>\n                `;
            } else {
                toggleHtml = `<div class="ud-tree-toggle placeholder"></div>`;
                iconHtml = `\n                    <div class="ud-tree-icon-container">\n                        <span class="ud-tree-icon-file">${window.Icons.tv}</span>\n                    </div>\n                `;
            }

            row.innerHTML = `\n                <div class="ud-table-cell ud-col-center">\n                    <input type="checkbox" class="ud-checkbox item-check">\n                </div>\n                <div class="ud-table-cell ud-tree-cell-content" style="${treeLevelStyle}">\n                    ${toggleHtml}\n                    ${iconHtml}\n                    <span class="ud-tree-label" title="${node.title}">\n                        ${node.title}\n                    </span>\n                </div>\n            `;
            const cb = row.querySelector('.item-check');

            cb.checked = node.checked;
            cb.indeterminate = node.indeterminate;

            cb.onchange = (e) => {
                this.treeHelper.toggleSelection(node, e.target.checked);
                this._renderVideoList({ keepScroll: true });
            };

            row.onclick = (e) => {
                if (e.target.closest('.ud-checkbox')) return;

                if (node.type === 'folder') {
                    node.expanded = !node.expanded;
                    this._renderVideoList({ keepScroll: true });
                } else {
                    cb.checked = !cb.checked;
                    this.treeHelper.toggleSelection(node, cb.checked);
                    this._renderVideoList({ keepScroll: true });
                }
            };

            const arrowBtn = row.querySelector('.js-toggle-folder');

            if (arrowBtn) {
                arrowBtn.onclick = (e) => {
                    e.stopPropagation();
                    node.expanded = !node.expanded;
                    this._renderVideoList({ keepScroll: true });
                };
            }

            tableBody.appendChild(row);
        });

        if (options.keepScroll) {
            tableBody.scrollTop = currentScrollTop;
        }

        if (options.scrollToCurrent) {
            requestAnimationFrame(() => {
                const currentItem = tableBody.querySelector('.ud-table-row.is-current');

                if (currentItem) {
                    currentItem.scrollIntoView({ block: 'center', behavior: 'auto' });
                }
            });
        }

        let infoRow = this.dom.infoRow;

        if (!infoRow) {
            infoRow = document.createElement('div');
            infoRow.className = 'text-sm ud-text-muted';
            infoRow.style.marginTop = '6px';
            this.dom.infoRow = infoRow;
            body.appendChild(infoRow);
        }

        const selectedItems = this.treeHelper.getSelectedItems();
        const totalCount = this.treeHelper.getTotalFileCount();

        infoRow.textContent = `已选 ${selectedItems.length} / ${totalCount} 个视频`;
        const headerCheck = header.querySelector('#batch-header-check');
        const roots = this.treeHelper.rootNodes;
        const totalRoots = roots.length;
        const checkedRoots = roots.filter((n) => n.checked).length;
        const hasIndeterminate = roots.some((n) => n.indeterminate);

        if (totalRoots > 0 && checkedRoots === totalRoots) {
            headerCheck.checked = true;
            headerCheck.indeterminate = false;
        } else if (checkedRoots === 0 && !hasIndeterminate) {
            headerCheck.checked = false;
            headerCheck.indeterminate = false;
        } else {
            headerCheck.checked = false;
            headerCheck.indeterminate = true;
        }

        headerCheck.onchange = (e) => {
            const isChecked = e.target.checked;

            roots.forEach((root) => this.treeHelper.toggleSelection(root, isChecked));
            this._renderVideoList({ keepScroll: true });
        };

        this._renderFooterStrategySelect();
        this._updateFooterConfirmState(selectedItems.length);
    }

    _generateStrategyTooltip(config) {
        if (!config) return '';
        const groups = { media: [], codec: [], attachments: [] };

        if (config.video && config.audio) {
            if (config.merge) {
                groups.media.push('完整视频');
            } else {
                groups.media.push('视频流');
                groups.media.push('音频流');
            }
        } else if (config.video) {
            groups.media.push('视频流');
        } else if (config.audio) {
            groups.media.push('音频流');
        }

        if (config.video) {
            const qualityMap = {
                best: '最佳画质',
                '8k': '8K',
                dolby: '杜比视界',
                hdr: 'HDR',
                '4k': '4K',
                '1080p': '1080P',
                '720p': '720P',
                '480p': '480P',
                '360p': '360P',
                '240p': '240P',
            };
            const codecMap = { av1: 'AV1', hevc: 'HEVC', avc: 'AVC' };
            const qLabel = qualityMap[config.quality?.primary] || config.quality?.primary;

            if (qLabel) groups.media.push(qLabel);
            const cLabel = codecMap[config.codec?.primary] || config.codec?.primary;

            if (cLabel) groups.codec.push(cLabel);
        }

        if (config.cover) groups.attachments.push('封面');
        if (config.danmaku) groups.attachments.push('弹幕');
        const hasContent = groups.media.length > 0 || groups.codec.length > 0 || groups.attachments.length > 0;

        if (!hasContent) {
            return `<div class="ud-flex-center"><span class="ud-tag">空壳任务</span></div>`;
        }

        let html = '';
        const groupConfigs = [
            { key: 'media', title: '流媒体' },
            { key: 'codec', title: '编码' },
            { key: 'attachments', title: '附件' },
        ];

        groupConfigs.forEach(({ key: key, title: title }) => {
            const tags = groups[key];

            if (tags.length > 0) {
                html += `\n                    <div class="ud-tooltip-group">\n                        <div class="ud-tooltip-label">${title}</div>\n                        <div class="grid-tags-row">\n                            ${tags.map((t) => `<span class="ud-tag">${t}</span>`).join('')}\n                        </div>\n                    </div>\n                `;
            }
        });

        return `<div style="padding-top:2px;">${html}</div>`;
    }

    _renderFooterStrategySelect() {
        const footerLeft = this.modal.dom.footerLeft;

        footerLeft.innerHTML = '';
        footerLeft.className = 'ud-footer-left ud-modal-spacer ud-flex-center';
        const strategyOptions = this.allStrategies.map((st) => ({
            label: st.name,
            value: st.id,
            tooltip: this._generateStrategyTooltip(st.config),
            tooltipPos: 'right',
            tooltipWidth: '240px',
        }));
        const strategySelect = window.DOMUtils.createCustomSelect({
            label: '下载策略',
            value: this.batchState.strategyId,
            options: strategyOptions,
            layout: 'start',
            width: '220px',
            onChange: (e) => {
                this.batchState.strategyId = e.target.value;
                chrome.storage.local.set({ bd_pref_single: { lastStrategyId: e.target.value } });
            },
        });

        strategySelect.style.marginBottom = '0';
        this.dom.strategySelect = strategySelect;
        footerLeft.appendChild(strategySelect);
    }

    _updateFooterConfirmState(selectedCount) {
        const hasSelection = selectedCount > 0;

        this.modal.setConfirmEnabled(hasSelection);
        this.modal.setConfirmText('下载');
        this.modal.onConfirm(() => {
            const selectedItems = this.treeHelper.getSelectedItems();
            const strategy = this.allStrategies.find((s) => s.id === this.batchState.strategyId) || this.allStrategies[0];

            if (this.onConfirmHandler && strategy) {
                this.onConfirmHandler(selectedItems, strategy.config, strategy);
            }
        });
    }

    destroy() {
        this._cleanup();

        if (this.modal) {
            this.modal.destroy();
            this.modal = null;
        }
    }

    _cleanup() {
        if (this._batchStorageListener) {
            chrome.storage.onChanged.removeListener(this._batchStorageListener);
            this._batchStorageListener = null;
        }
    }

    onConfirm(callback) {
        this.onConfirmHandler = callback;
    }

    onCancel(callback) {
        this.onCancelHandler = callback;
    }

    _formatTime(seconds) {
        if (!seconds) return '';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);

        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    refreshStrategies() {
        const Strategies = window.Strategies || {};
        const STORAGE_KEY = (Strategies.STRATEGY_CONSTANTS && Strategies.STRATEGY_CONSTANTS.STORAGE_KEY) || 'bd_strategies';
        const defaultStrategies = Strategies.DEFAULT_STRATEGIES || [];

        chrome.storage.local.get([STORAGE_KEY], (res) => {
            const savedStrategies = res[STORAGE_KEY];

            this.allStrategies =
        savedStrategies && Array.isArray(savedStrategies) && savedStrategies.length > 0
            ? savedStrategies
            : defaultStrategies;
            const currentId = this.batchState.strategyId;
            const exists = this.allStrategies.some((s) => s.id === currentId);

            if (!exists) {
                if (this.allStrategies.length > 0) {
                    this.batchState.strategyId = this.allStrategies[0].id;
                    chrome.storage.local.set({ bd_pref_single: { lastStrategyId: this.batchState.strategyId } });
                }
            }

            this._renderFooterStrategySelect();
        });
    }
}
window.BatchModal = BatchModal;
