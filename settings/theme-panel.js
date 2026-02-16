/**
 * @file settings/theme-panel.js
 * @description 个性化设置面板控制器 (Theme & Audio Settings Panel)
 * * 核心职责 (Core Responsibilities):
 * 1. 主题管理 (Theme Management):
 * - 展示系统预设主题与用户自定义主题。
 * - 实现自定义主题的增删改查 (CRUD)，支持 HEX 颜色校验与名称长度限制。
 * - 实时预览：点击主题色块即时应用 CSS 变量 (`--primary`, `--ring`)。
 * * 2. 音效管理 (Audio Management):
 * - 管理下载完成提示音：开关、音量调节 (0-100%)、文件选择。
 * - 支持上传自定义音频文件 (MP3/WAV/FLAC 等)，存储至 IndexedDB (`assets` store)。
 * - 实现音频预览播放，并包含单例控制 (自动停止上一个播放) 和文件大小限制 (10MB)。
 * * 3. 交互细节 (Interaction Details):
 * - 彩蛋逻辑：当播放名为 "春日影" 或 "Haruhikage" 的音频时触发特殊 Toast。
 * - 安全拦截：禁止删除当前正在使用的主题或音效。
 * * 通信链路 (Communication):
 * - Input: 读取 IndexedDB (assets) 和 localStorage (配置)。
 * - Output: 写入 IndexedDB (上传文件) 和 localStorage (保存设置)；调用 `Audio` API 播放声音。
 * * @author weiyunjun
 * @version v0.1.0
 */

class ThemePanel {
    constructor(headerContainer, contentContainer, modal) {
        this.dom = { header: headerContainer, content: contentContainer };
        this.currentTheme = 'default';
        this.modal = modal;
        this.customThemes = [];
        this.soundConfig = { enabled: false, volume: 50, selected: 'default', files: [] };
        this.AUDIO_LIMIT_MB = 10;
        this.currentPreviewAudio = null;
    }

    async render() {
        const Theme = window.Theme || {
            THEME_OPTIONS: [],
            THEME_CONSTANTS: { DEFAULT_THEME: 'default', STORAGE_KEY: 'user_theme' },
        };

        await Promise.all([
            new Promise((resolve) => {
                chrome.storage.local.get([Theme.THEME_CONSTANTS.STORAGE_KEY], (res) => {
                    this.currentTheme = res[Theme.THEME_CONSTANTS.STORAGE_KEY] || Theme.THEME_CONSTANTS.DEFAULT_THEME;
                    resolve();
                });
            }),
            new Promise((resolve) => {
                const key = Theme.THEME_CONSTANTS.CUSTOM_STORAGE_KEY || 'custom_themes_list';

                chrome.storage.local.get([key], (res) => {
                    this.customThemes = res[key] || [];
                    resolve();
                });
            }),
            new Promise((resolve) => {
                chrome.storage.local.get(['sound_enabled', 'sound_volume', 'sound_selected'], (res) => {
                    if (res.sound_enabled !== undefined) this.soundConfig.enabled = res.sound_enabled;
                    if (res.sound_volume !== undefined) this.soundConfig.volume = Math.round(res.sound_volume * 100);
                    if (res.sound_selected) this.soundConfig.selected = res.sound_selected;
                    resolve();
                });
            }),
            this._loadSoundFiles(),
        ]);
        this._renderUI(Theme);
    }

    async _loadSoundFiles() {
        this.soundConfig.files = [{ id: 'default', name: '默认音效', isBuiltin: true }];

        if (window.appDB) {
            try {
                const customFiles = await window.appDB.getAll('assets');

                if (customFiles && customFiles.length > 0) {
                    customFiles.sort((a, b) => a.created - b.created);
                    this.soundConfig.files = this.soundConfig.files.concat(customFiles);
                }
            } catch (e) {
                console.error('[ThemePanel] Failed to load custom sounds:', e);
            }
        }
    }

    _renderUI(Theme) {
        this.dom.content.innerHTML = '';
        const DOM = window.DOMUtils;

        this.dom.header.innerHTML = '';
        const leftGroup = DOM.create('div', 'ud-settings-header-left');
        const titleEl = DOM.create('span', 'ud-panel-title', '个性化');

        leftGroup.appendChild(titleEl);
        this.dom.header.appendChild(leftGroup);
        const form = this.dom.content;
        const appearanceSection = DOM.create('div', 'ud-settings-section');

        appearanceSection.appendChild(DOM.create('div', 'ud-form-header', '主题色'));
        const themeGrid = DOM.create('div', 'ud-theme-grid');
        const allThemes = [...Theme.THEME_OPTIONS, ...this.customThemes];

        allThemes.forEach((opt) => {
            const optionEl = DOM.create('div', 'ud-theme-option');

            if (opt.value === this.currentTheme) {
                optionEl.classList.add('active');
            }

            const preview = DOM.create('div', 'ud-theme-preview');

            preview.style.backgroundColor = opt.color;

            if (opt.isCustom) {
                const actionBtn = DOM.create('div', 'ud-card-overlay-btn');

                actionBtn.innerHTML = window.Icons.ellipsis || '...';

                actionBtn.onclick = (e) => {
                    e.stopPropagation();
                    this._showThemeMenu(actionBtn, opt);
                };

                preview.appendChild(actionBtn);
            }

            const label = DOM.create('div', 'ud-theme-label', opt.label);

            optionEl.appendChild(preview);
            optionEl.appendChild(label);

            optionEl.onclick = () => {
                const allOpts = themeGrid.querySelectorAll('.ud-theme-option');

                allOpts.forEach((el) => el.classList.remove('active'));
                optionEl.classList.add('active');
                this.currentTheme = opt.value;

                if (opt.value === 'default') {
                    document.body.style.removeProperty('--primary');
                    document.body.style.removeProperty('--ring');
                } else {
                    document.body.style.setProperty('--primary', opt.color);
                    document.body.style.setProperty('--ring', opt.color);
                }

                chrome.storage.local.set({ [Theme.THEME_CONSTANTS.STORAGE_KEY]: opt.value }, () => {
                    if (this.modal && this.modal.showToast) {
                        this.modal.showToast(`主题已切换: ${opt.label}`);
                    }
                });
            };

            themeGrid.appendChild(optionEl);
        });
        const addBtn = DOM.create('div', 'ud-theme-option');
        const addPreview = DOM.create('div', 'ud-theme-preview add-btn');

        addPreview.innerHTML = window.Icons.plus || '+';
        const addLabel = DOM.create('div', 'ud-theme-label', '自定义');

        addBtn.appendChild(addPreview);
        addBtn.appendChild(addLabel);
        addBtn.onclick = () => this._showThemeEditModal();
        themeGrid.appendChild(addBtn);
        appearanceSection.appendChild(themeGrid);
        form.appendChild(appearanceSection);
        const soundSection = DOM.create('div', 'ud-settings-section');

        soundSection.appendChild(DOM.create('div', 'ud-form-header', '任务完成音效'));
        
        const soundSwitch = DOM.createSwitchInput({
            checked: this.soundConfig.enabled,
            onChange: (checked) => {
                this.soundConfig.enabled = checked;
                chrome.storage.local.set({ sound_enabled: checked });
            },
        });

        soundSection.appendChild(DOM.createFormRow({
            label: '开启音效',
            content: soundSwitch
        }));

        let sliderWrapper; 
        
        const volInputWrapper = DOM.createInput({
            type: 'number',
            value: this.soundConfig.volume,
            min: 0,
            max: 100,
            defaultValue: 50,
            onChange: (val) => {
                let num = parseInt(val, 10);
                if (isNaN(num)) num = 0;
                if (num < 0) num = 0;
                if (num > 100) num = 100;

                this.soundConfig.volume = num;
                if (sliderWrapper) sliderWrapper.setValue(num);
                chrome.storage.local.set({ sound_volume: num / 100 });
            },
        });
        volInputWrapper.classList.add('ud-input-number-sm');

        sliderWrapper = DOM.createSlider({
            min: 0,
            max: 100,
            value: this.soundConfig.volume,
            onChange: (val) => {
                const num = parseInt(val, 10);
                this.soundConfig.volume = num;
                
                const inputEl = volInputWrapper.querySelector('input');
                if (inputEl) inputEl.value = num;
                
                chrome.storage.local.set({ sound_volume: num / 100 });
            },
        });

        sliderWrapper.style.flex = '1';
        sliderWrapper.style.marginRight = '12px';

        soundSection.appendChild(DOM.createFormRow({
            label: '音量调节',
            content: [sliderWrapper, volInputWrapper]
        }));
        const soundManagerWrapper = DOM.create('div', 'ud-sound-manager-wrapper');
        const actionHeader = DOM.create('div', 'ud-sound-actions-header');
        const soundLabel = DOM.create('div', 'ud-form-label', '音效选择');

        actionHeader.appendChild(soundLabel);
        const fileInput = document.createElement('input');

        fileInput.type = 'file';
        fileInput.accept = 'audio/mp3,audio/wav,audio/x-m4a,audio/mpeg,audio/flac,audio/ogg';
        fileInput.style.display = 'none';

        fileInput.onchange = async (e) => {
            const file = e.target.files[0];

            if (!file) return;
            const validExts = ['.mp3', '.wav', '.m4a', '.flac', '.ogg'];
            const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

            if (!validExts.includes(ext)) {
                if (this.modal) this.modal.showToast('不支持的文件格式。仅支持: mp3, wav, m4a, flac, ogg');
                fileInput.value = '';

                return;
            }

            if (file.size > this.AUDIO_LIMIT_MB * 1024 * 1024) {
                if (this.modal) this.modal.showToast(`文件过大，请上传 ${this.AUDIO_LIMIT_MB}MB 以内的音频`);
                fileInput.value = '';

                return;
            }

            if (window.appDB) {
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const blob = new Blob([arrayBuffer], { type: file.type });
                    const id = 'custom_' + Date.now();

                    await window.appDB.add('assets', { id: id, name: file.name, blob: blob, created: Date.now() });

                    if (this.modal && this.modal.showToast) {
                        this.modal.showToast('音效添加成功');
                    }

                    await this._loadSoundFiles();
                    this.render();
                } catch (err) {
                    console.error('[ThemePanel] Upload failed:', err);

                    if (this.modal && this.modal.showToast) {
                        this.modal.showToast('保存失败: ' + err.message);
                    }
                }
            }

            fileInput.value = '';
        };

        const uploadBtn = DOM.createButton({
            text: '添加',
            type: 'settings-normal',
            icon: window.Icons.plus,
            onClick: () => fileInput.click(),
        });

        uploadBtn.dataset.udTooltip = `支持 ${this.AUDIO_LIMIT_MB}MB 以内的 mp3 wav m4a flac ogg 格式`;
        uploadBtn.dataset.udTooltipPos = 'top';
        actionHeader.appendChild(uploadBtn);
        actionHeader.appendChild(fileInput);
        soundManagerWrapper.appendChild(actionHeader);
        const listBody = DOM.create('div', 'ud-sound-list-body');

        const renderList = () => {
            listBody.innerHTML = '';
            this.soundConfig.files.forEach((file) => {
                const isDefault = file.id === 'default';
                const item = DOM.createRadioRow({
                    label: file.name,
                    value: file.id,
                    checked: this.soundConfig.selected === file.id,
                    onSelect: (id) => {
                        this.soundConfig.selected = id;
                        chrome.storage.local.set({ sound_selected: id });
                        renderList();
                    },
                    onPlay: async (id) => {
                        this._playPreview(id);
                    },
                    onAction: isDefault
                        ? null
                        : (e, id, triggerBtn) => {
                            this._showSoundMenu(triggerBtn, file);
                        },
                });

                listBody.appendChild(item);
            });
        };

        renderList();
        soundManagerWrapper.appendChild(listBody);
        soundSection.appendChild(soundManagerWrapper);
        form.appendChild(soundSection);
    }

    _showThemeMenu(triggerBtn, theme) {
        const DOM = window.DOMUtils;
        const existing = document.querySelector('.ud-floating-menu');

        if (existing) existing.remove();
        triggerBtn.classList.add('active');
        const menu = DOM.create('div', 'ud-floating-menu');

        menu.style.minWidth = '110px';
        const editItem = DOM.create('div', 'ud-menu-item', '编辑');

        editItem.onclick = () => {
            this._closeMenu(menu, triggerBtn);
            this._showThemeEditModal(theme);
        };

        menu.appendChild(editItem);
        const delItem = DOM.create('div', 'ud-menu-item danger', '删除');

        delItem.onclick = () => {
            this._closeMenu(menu, triggerBtn);
            this._handleDeleteTheme(theme);
        };

        menu.appendChild(delItem);
        document.body.appendChild(menu);
        const rect = triggerBtn.getBoundingClientRect();

        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.left = `${rect.right - 110}px`;
        requestAnimationFrame(() => menu.classList.add('show'));

        const closeHandler = (e) => {
            if (!menu.contains(e.target) && e.target !== triggerBtn && !triggerBtn.contains(e.target)) {
                this._closeMenu(menu, triggerBtn);
                window.removeEventListener('mousedown', closeHandler);
            }
        };

        setTimeout(() => window.addEventListener('mousedown', closeHandler), 0);
    }

    _closeMenu(menu, triggerBtn) {
        if (menu) menu.remove();
        if (triggerBtn) triggerBtn.classList.remove('active');
    }

    _showSoundMenu(triggerBtn, file) {
        const DOM = window.DOMUtils;
        const existing = document.querySelector('.ud-floating-menu');

        if (existing) existing.remove();
        triggerBtn.classList.add('active');
        const menu = DOM.create('div', 'ud-floating-menu');

        menu.style.minWidth = '110px';
        const delItem = DOM.create('div', 'ud-menu-item danger', '删除');

        delItem.onclick = () => {
            this._closeMenu(menu, triggerBtn);
            this._handleDeleteSound(file);
        };

        menu.appendChild(delItem);
        document.body.appendChild(menu);
        const rect = triggerBtn.getBoundingClientRect();

        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.left = `${rect.right - 110}px`;
        requestAnimationFrame(() => menu.classList.add('show'));

        const closeHandler = (e) => {
            if (!menu.contains(e.target) && e.target !== triggerBtn && !triggerBtn.contains(e.target)) {
                this._closeMenu(menu, triggerBtn);
                window.removeEventListener('mousedown', closeHandler);
            }
        };

        setTimeout(() => window.addEventListener('mousedown', closeHandler), 0);
    }

    async _handleDeleteSound(file) {
        if (this.soundConfig.selected === file.id) {
            if (this.modal && this.modal.showToast) {
                this.modal.showToast('无法删除使用中的音效');
            }

            return;
        }

        if (window.ConfirmModal) {
            const ok = await window.ConfirmModal.showModal({
                title: '删除音效',
                content: `确定要删除 "${file.name}" 吗？`,
                isDanger: true,
                confirmText: '确定',
            });

            if (!ok) return;
        } else if (!confirm(`确定要删除 "${file.name}" 吗？`)) {
            return;
        }

        if (window.appDB) {
            try {
                await window.appDB.delete('assets', file.id);
                await this._loadSoundFiles();
                this.render();

                if (this.modal && this.modal.showToast) {
                    this.modal.showToast('删除成功');
                }
            } catch (e) {
                console.error(e);

                if (this.modal && this.modal.showToast) {
                    this.modal.showToast('删除失败');
                }
            }
        }
    }

    _showThemeEditModal(targetTheme = null) {
        if (!window.BaseModal) return;
        const isEdit = !!targetTheme;
        const modal = new window.BaseModal({
            title: isEdit ? '编辑自定义主题色' : '添加自定义主题色',
            width: '400px',
            confirmText: '确定',
        });
        const DOM = window.DOMUtils;
        const container = DOM.create('div');
        const nameWrapper = DOM.createInput({
            label: '名称',
            placeholder: '例如：中国红',
            value: isEdit ? targetTheme.label : '',
        });

        nameWrapper.classList.add('ud-modal-input-group');
        container.appendChild(nameWrapper);
        const colorWrapper = DOM.createInput({
            label: '十六进制颜色编码',
            placeholder: '例如：#D12C25',
            value: isEdit ? targetTheme.color : '',
            onChange: (val) => {
                const inputEl = colorWrapper.querySelector('input');
                const cleanVal = val.replace(/[^0-9a-fA-F#]/g, '');

                if (cleanVal !== val) {
                    inputEl.value = cleanVal;
                }
            },
        });

        colorWrapper.classList.add('ud-modal-input-group');
        container.appendChild(colorWrapper);
        modal.dom.body.innerHTML = '';
        modal.dom.body.appendChild(container);
        modal.onConfirm(() => {
            const rawName = nameWrapper.querySelector('input').value.trim();
            const rawColor = colorWrapper.querySelector('input').value.trim();
            const normalizedColor = this._normalizeHexColor(rawColor);

            if (!normalizedColor) {
                if (this.modal) this.modal.showToast('颜色格式无效 (需为 #FFF 或 #FFFFFF 格式)');

                return;
            }

            const nameCheck = this._validateThemeName(rawName);

            if (!nameCheck.valid) {
                if (this.modal) this.modal.showToast(nameCheck.msg);

                return;
            }

            const validName = nameCheck.name;

            if (isEdit) {
                targetTheme.label = validName;
                targetTheme.color = normalizedColor;

                if (this.currentTheme === targetTheme.value) {
                    document.body.style.setProperty('--primary', normalizedColor);
                    document.body.style.setProperty('--ring', normalizedColor);
                }
            } else {
                this.customThemes.push({
                    value: 'custom_' + Date.now(),
                    label: validName,
                    color: normalizedColor,
                    isCustom: true,
                });
            }

            this._saveCustomThemes(() => {
                modal.hideModal();
                if (this.modal) this.modal.showToast(isEdit ? '主题已更新' : '自定义主题添加成功');
            });
        });
        modal.showModal();
    }

    _validateThemeName(name) {
        if (!name) return { valid: false, msg: '名称不能为空' };
        let charLength = 0;
        const MAX_LEN = 12;

        for (let i = 0; i < name.length; i++) {
            charLength += name.charCodeAt(i) > 127 ? 2 : 1;
        }

        if (charLength > MAX_LEN) {
            return { valid: false, msg: `名称不能超过 ${MAX_LEN} 个字符 (当前: ${charLength})` };
        }

        return { valid: true, name: name };
    }

    _normalizeHexColor(input) {
        if (!input) return null;
        let hex = input.replace(/^#/, '');

        if (/[^0-9a-fA-F]/.test(hex)) return null;

        if (hex.length === 3) {
            hex = hex
                .split('')
                .map((c) => c + c)
                .join('');
        }

        if (hex.length !== 6) return null;

        return '#' + hex.toUpperCase();
    }

    async _handleDeleteTheme(theme) {
        if (this.currentTheme === theme.value) {
            if (this.modal && this.modal.showToast) {
                this.modal.showToast('无法删除使用中的主题色');
            }

            return;
        }

        if (window.ConfirmModal) {
            const ok = await window.ConfirmModal.showModal({
                title: '删除主题',
                content: `确定要删除 ${theme.label} ${theme.color} 吗？`,
                isDanger: true,
                confirmText: '删除',
            });

            if (!ok) return;
        } else if (!confirm(`确定要删除 ${theme.label} ${theme.color} 吗？`)) {
            return;
        }

        this.customThemes = this.customThemes.filter((t) => t.value !== theme.value);
        this._saveCustomThemes(() => {
            if (this.modal) this.modal.showToast('主题已删除');
        });
    }

    _saveCustomThemes(callback) {
        const key =
      (window.Theme && window.Theme.THEME_CONSTANTS && window.Theme.THEME_CONSTANTS.CUSTOM_STORAGE_KEY) ||
      'custom_themes_list';

        chrome.storage.local.set({ [key]: this.customThemes }, () => {
            this.render();
            if (callback) callback();
        });
    }

    async _playPreview(id) {
        if (this.currentPreviewAudio) {
            this.currentPreviewAudio.pause();
            this.currentPreviewAudio = null;
        }

        const fileInfo = this.soundConfig.files.find((f) => f.id === id);

        if (fileInfo && fileInfo.name) {
            const lowerName = fileInfo.name.toLowerCase();

            if (lowerName.includes('春日影') || lowerName.includes('haruhikage')) {
                if (this.modal && this.modal.showToast) {
                    this.modal.showToast('为什么要演奏春日影？');
                }
            }
        }

        let url = '';

        if (id === 'default') {
            url = chrome.runtime.getURL('assets/default.wav');
        } else {
            if (window.appDB) {
                try {
                    const record = await window.appDB.get('assets', id);

                    if (record && record.blob) {
                        url = URL.createObjectURL(record.blob);
                    }
                } catch (e) {
                    console.error(e);
                }
            }
        }

        if (url) {
            const audio = new Audio(url);

            this.currentPreviewAudio = audio;
            audio.volume = this.soundConfig.volume / 100;
            audio.play().catch((e) => console.warn('Play failed:', e));

            audio.onended = () => {
                if (this.currentPreviewAudio === audio) {
                    this.currentPreviewAudio = null;
                }

                if (id !== 'default') {
                    URL.revokeObjectURL(url);
                }
            };
        }
    }
}
window.ThemePanel = ThemePanel;
