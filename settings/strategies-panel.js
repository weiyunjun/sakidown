/**
 * @file settings/strategies-panel.js
 * @description 策略管理面板控制器 (Strategy Management Panel)
 * * 核心职责 (Core Responsibilities):
 * 1. 列表渲染 (List Rendering):
 * - 展示所有下载策略卡片，包含策略名称及动态生成的标签组 (`_generateTags`)。
 * - 标签生成逻辑：根据音视频流、合并状态、画质/编码偏好自动生成 "完整视频"、"AV1"、"杜比视界" 等标签。
 * * 2. 策略编辑器 (Strategy Editor):
 * - 提供完整的表单界面，支持修改名称、流媒体选项 (视频/音频/合并)、画质/编码偏好、附件选项。
 * - 实现互斥/联动逻辑：
 * - 当视频或音频未选中时，自动禁用并取消勾选 "合并音视频"。
 * - 画质/编码的 "首选" 与 "次选" 互换逻辑 (`_handleSwap`)，防止二者相同。
 * * 3. 变更检测与保护 (Change Detection & Guard):
 * - `_hasChanges`: 通过对比表单实时状态与原始快照 (`originalStrategy`)，精准识别是否发生变更。
 * - 路由守卫：在未保存变更时点击返回，触发二次确认弹窗，防止数据丢失。
 * * 通信链路 (Communication):
 * - Input: 读取 `chrome.storage.local` 获取策略列表。
 * - Output: 写入 `chrome.storage.local`，并广播 `STRATEGIES_UPDATED` 消息通知 Background 更新。
 * * @author weiyunjun
 * @version v0.1.0
 */

class StrategiesPanel {
    constructor(headerContainer, contentContainer, modal) {
        this.dom = { header: headerContainer, content: contentContainer };
        this.modal = modal;
        this.strategies = [];
        this.viewMode = 'list';
        this.editingStrategy = null;
        this.isNewRecord = false;
        this.formBuilder = null;
    }

    _renderHeaderUI({ title: title, leftBtn: leftBtn, rightBtn: rightBtn } = {}) {
        this.dom.header.innerHTML = '';
        const DOM = window.DOMUtils;
        const leftGroup = DOM.create('div', 'ud-settings-header-left');

        if (leftBtn) {
            const btn = DOM.createButton({
                icon: leftBtn.icon,
                type: 'ghost',
                onClick: leftBtn.onClick,
                className: leftBtn.className || 'ud-icon-btn',
            });

            leftGroup.appendChild(btn);
        }

        const titleEl = DOM.create('span', 'ud-panel-title', title);

        leftGroup.appendChild(titleEl);
        this.dom.header.appendChild(leftGroup);

        if (rightBtn) {
            const rightGroup = DOM.create('div', 'ud-settings-header-right');
            const btn = DOM.createButton({
                text: rightBtn.text,
                icon: rightBtn.icon,
                type: rightBtn.type,
                onClick: rightBtn.onClick,
            });

            rightGroup.appendChild(btn);
            this.dom.header.appendChild(rightGroup);
        }
    }

    _renderEditor() {
        this.dom.content.innerHTML = '';
        
        // 1. 渲染头部
        this._renderHeaderUI({
            title: this.isNewRecord ? '新建策略' : '编辑策略',
            leftBtn: { 
                text: '', 
                icon: window.Icons.chevron, 
                className: 'ud-btn-back', 
                onClick: () => this._handleBack() 
            },
            rightBtn: {
                text: '保存策略',
                type: 'settings-normal',
                icon: window.Icons.save,
                onClick: () => this._handleSave(),
            },
        });

        // 2. 初始化 FormBuilder
        if (window.FormBuilder && window.Strategies && window.Strategies.STRATEGY_SCHEMA) {
            this.formBuilder = new window.FormBuilder(
                window.Strategies.STRATEGY_SCHEMA, 
                this.editingStrategy
            );

            // 3. 挂载生成的 DOM
            this.dom.content.appendChild(this.formBuilder.render());

            // 4. (可选) 监听变更，实时同步 editingStrategy，防止 _handleBack 检测失效
            this.formBuilder.onChange((newData) => {
                this.editingStrategy = newData;
            });
        } else {
            this.dom.content.innerHTML = '<div class="ud-panel-placeholder">FormBuilder 或 Schema 加载失败</div>';
        }
    }



    async _handleDelete(st) {
        if (this.strategies.length <= 1) {
            if (this.modal && this.modal.showToast) {
                this.modal.showToast('请至少保留一个下载策略');
            }

            return;
        }

        const easterEggKeywords = ['crychic', '苦来兮苦'];
        const isEasterEgg = easterEggKeywords.includes(st.name.toLowerCase());
        const confirmTitle = isEasterEgg ? '解散乐队' : '删除策略';
        const confirmContent = isEasterEgg ? `确定要解散${st.name}吗？` : `确定要删除下载策略：${st.name}吗？`;

        if (window.ConfirmModal) {
            const ok = await window.ConfirmModal.showModal({
                title: confirmTitle,
                content: confirmContent,
                isDanger: true,
                confirmText: '确定',
            });

            if (!ok) return;
        } else if (!confirm(confirmContent)) {
            return;
        }

        this.strategies = this.strategies.filter((s) => s.id !== st.id);
        this._saveStrategies();
        chrome.runtime.sendMessage({ type: 'STRATEGIES_UPDATED' }).catch(() => {});

        if (this.viewMode === 'edit') {
            this.viewMode = 'list';
        }

        this.render();
    }

    _renderList() {
        this.dom.content.innerHTML = '';
        const DOM = window.DOMUtils;

        this._renderHeaderUI({
            title: '下载策略',
            rightBtn: {
                text: '新建策略',
                icon: window.Icons.plus,
                type: 'settings-normal',
                onClick: () => {
                    if (this.strategies.length >= 20) {
                        if (this.modal && this.modal.showToast) {
                            this.modal.showToast('下载策略数量已达到上限');
                        }

                        return;
                    }

                    const newSt = window.Strategies.createNewStrategy();

                    this._enterEditMode(newSt, true);
                },
            },
        });
        this.strategies.forEach((st) => {
            const card = DOM.create('div', 'ud-strategy-card');
            const stTitle = DOM.create('div', 'ud-st-title', st.name);
            const tagsRow = DOM.create('div');

            tagsRow.style.display = 'flex';
            tagsRow.style.flexWrap = 'wrap';
            tagsRow.style.gap = '6px';
            const tags = this._generateTags(st.config);

            tags.forEach((t) => {
                const tagEl = DOM.create('span', 'ud-tag', t);

                tagsRow.appendChild(tagEl);
            });
            card.appendChild(stTitle);
            card.appendChild(tagsRow);
            const actionBtn = DOM.create('div', 'ud-st-action-trigger');

            actionBtn.innerHTML = window.Icons.ellipsis || '...';

            actionBtn.onclick = (e) => {
                e.stopPropagation();
                this._showStrategyMenu(actionBtn, st);
            };

            card.appendChild(actionBtn);
            card.onclick = null;
            card.style.cursor = 'default';
            this.dom.content.appendChild(card);
        });
    }

    _generateTags(cfg) {
        if (!cfg) return [];
        const tags = [];
        const {
            video: video,
            audio: audio,
            merge: merge,
            cover: cover,
            danmaku: danmaku,
            codec: codec,
            quality: quality,
        } = cfg;

        if (!video && !audio && !cover && !danmaku) {
            tags.push('空壳任务');
        } else {
            if (video && audio && merge) {
                tags.push('完整视频');
            } else if (video && !audio) {
                tags.push('视频流');
            } else if (!video && audio) {
                tags.push('音频流');
            } else if (video && audio && !merge) {
                tags.push('视频流');
                tags.push('音频流');
            }

            if (video && quality && quality.primary) {
                const opt = QUALITY_OPTIONS.find((o) => o.value === quality.primary);
                const label = opt ? opt.label : quality.primary;

                tags.push(label);
            }

            if (video && codec && codec.primary) {
                tags.push(codec.primary.toUpperCase());
            }

            if (cover) {
                tags.push('封面');
            }

            if (danmaku) {
                tags.push('弹幕');
            }
        }

        return tags;
    }

    _showStrategyMenu(triggerBtn, strategy) {
        const DOM = window.DOMUtils;
        const existing = document.querySelector('.ud-floating-menu');

        if (existing) existing.remove();
        triggerBtn.classList.add('active');
        const menu = DOM.create('div', 'ud-floating-menu');

        menu.style.minWidth = '110px';
        const editItem = DOM.create('div', 'ud-menu-item', '编辑');

        editItem.onclick = () => {
            menu.remove();
            triggerBtn.classList.remove('active');
            this._enterEditMode(strategy);
        };

        menu.appendChild(editItem);
        const delItem = DOM.create('div', 'ud-menu-item danger', '删除');

        delItem.onclick = () => {
            menu.remove();
            triggerBtn.classList.remove('active');
            this._handleDelete(strategy);
        };

        menu.appendChild(delItem);
        document.body.appendChild(menu);
        const rect = triggerBtn.getBoundingClientRect();

        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.left = `${rect.right - 110}px`;
        requestAnimationFrame(() => menu.classList.add('show'));

        const closeHandler = (e) => {
            if (!menu.contains(e.target) && e.target !== triggerBtn) {
                menu.remove();
                triggerBtn.classList.remove('active');
                window.removeEventListener('mousedown', closeHandler);
            }
        };

        setTimeout(() => window.addEventListener('mousedown', closeHandler), 0);
    }

    async render() {
        await this._loadStrategies();

        if (this.viewMode === 'list') {
            this._renderList();
        } else {
            this._renderEditor();
        }
    }

    async _loadStrategies() {
        const { STRATEGY_CONSTANTS: STRATEGY_CONSTANTS, DEFAULT_STRATEGIES: DEFAULT_STRATEGIES } = window.Strategies;

        return new Promise((resolve) => {
            chrome.storage.local.get([STRATEGY_CONSTANTS.STORAGE_KEY], (res) => {
                const saved = res[STRATEGY_CONSTANTS.STORAGE_KEY];

                this.strategies = saved && saved.length > 0 ? saved : DEFAULT_STRATEGIES;
                resolve();
            });
        });
    }

    _saveStrategies() {
        const { STRATEGY_CONSTANTS: STRATEGY_CONSTANTS } = window.Strategies;

        chrome.storage.local.set({ [STRATEGY_CONSTANTS.STORAGE_KEY]: this.strategies });
    }

    _enterEditMode(strategy, isNew = false) {
        this.viewMode = 'edit';
        this.isNewRecord = isNew;
        this.editingStrategy = JSON.parse(JSON.stringify(strategy));
        this.originalStrategy = JSON.parse(JSON.stringify(strategy));
        this._renderEditor();
    }

    _hasChanges() {
        if (!this.formBuilder) return false;
        const current = JSON.parse(JSON.stringify(this.formBuilder.getData()));
        const original = JSON.parse(JSON.stringify(this.originalStrategy));

        // 清理无关字段进行比对
        delete current.description;
        delete original.description;

        return JSON.stringify(current) !== JSON.stringify(original);
    }

    async _handleBack() {
        const form = this.dom.content;

        if (this._hasChanges()) {
            let shouldSave = false;

            if (window.ConfirmModal) {
                shouldSave = await window.ConfirmModal.showModal({
                    title: '保存策略',
                    content: '检测到未保存的修改，是否保存？',
                    confirmText: '保存',
                    cancelText: '放弃',
                });
            } else {
                shouldSave = confirm('检测到您有未保存的修改，是否保存？');
            }

            if (shouldSave) {
                this._handleSave(form);
            } else {
                this.viewMode = 'list';
                this.render();
            }
        } else {
            this.viewMode = 'list';
            this.render();
        }
    }

    async _handleSave(form) {
        if (!this.formBuilder) return;
        
        // 1. 获取最新数据
        this.editingStrategy = this.formBuilder.getData();
        const rawName = this.editingStrategy.name || '';

        if (!this.isNewRecord) {
            if (!this._hasChanges()) {
                if (this.modal && this.modal.showToast) {
                    this.modal.showToast('没有修改下载策略');
                }
                return;
            }
        }

        const check = window.Strategies.validateStrategyName(rawName);

        if (!check.valid) {
            if (this.modal && this.modal.showToast) {
                this.modal.showToast(check.msg);
            } else {
                alert(check.msg);
            }

            return;
        }

        const validName = check.name;
        const isDuplicate = this.strategies.some((s) => s.name === validName && s.id !== this.editingStrategy.id);

        if (isDuplicate) {
            const msg = '下载策略名称已存在，请使用其他名称';

            if (this.modal && this.modal.showToast) {
                this.modal.showToast(msg);
            } else {
                alert(msg);
            }

            return;
        }

        this.editingStrategy.name = validName;
        delete this.editingStrategy.description;

        if (this.isNewRecord) {
            this.editingStrategy.id = 'custom-' + Date.now();
            this.strategies.push(this.editingStrategy);
        } else {
            const idx = this.strategies.findIndex((s) => s.id === this.editingStrategy.id);

            if (idx !== -1) this.strategies[idx] = this.editingStrategy;
        }

        this._saveStrategies();
        chrome.runtime.sendMessage({ type: 'STRATEGIES_UPDATED' }).catch(() => {});
        this.viewMode = 'list';
        this.render();

        if (this.modal && this.modal.showToast) {
            this.modal.showToast('策略保存成功');
        }
    }
}
window.StrategiesPanel = StrategiesPanel;
