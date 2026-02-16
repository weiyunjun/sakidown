/**
 * @file ui/form-builder.js
 * @description 声明式表单构建器 (Declarative Form Builder)
 * * 核心职责:
 * 1. 解析 Schema 自动生成 DOM 结构。
 * 2. 维护数据模型与 DOM 的双向绑定 (Model <-> View)。
 * 3. 处理字段间的联动逻辑 (showIf / disabledIf)。
 * 4. 支持局部更新 (Patch Update)，避免全量重绘导致的焦点丢失。
 */

class FormBuilder {
    constructor(schema, initialData = {}) {
        this.schema = schema;
        this.formData = JSON.parse(JSON.stringify(initialData));
        this.fieldMap = new Map(); // Key -> DOM Element
        this.container = document.createElement('div');
        this.container.className = 'ud-form-builder';
        this.onChangeCallback = null;
    }

    /**
     * 渲染表单
     * @returns {HTMLElement} 表单容器
     */
    render() {
        this.container.innerHTML = '';
        this.fieldMap.clear();

        this.schema.forEach(item => {
            if (item.type === 'section') {
                this._renderSection(item);
            } else {
                const el = this._createField(item);
                if (el) this.container.appendChild(el);
            }
        });

        // 初始触发一次联动检查
        this._handleDependencies();
        return this.container;
    }

    /**
     * 获取当前表单数据
     */
    getData() {
        return this.formData;
    }

    /**
     * 注册数据变更回调
     */
    onChange(fn) {
        this.onChangeCallback = fn;
    }

    _renderSection(sectionConfig) {
        const DOM = window.DOMUtils;
        const section = DOM.create('div', 'ud-settings-section');
        
        if (sectionConfig.title) {
            section.appendChild(DOM.create('div', 'ud-form-header', sectionConfig.title));
        }

        if (sectionConfig.children && Array.isArray(sectionConfig.children)) {
            sectionConfig.children.forEach(fieldConfig => {
                const el = this._createField(fieldConfig);
                if (el) section.appendChild(el);
            });
        }

        this.container.appendChild(section);
    }

    _createField(config) {
        const DOM = window.DOMUtils;
        let control = null;
        let wrapper = null;
        const currentValue = this._getValueByPath(this.formData, config.key);

        // 1. 根据类型创建控件
        switch (config.type) {
            case 'text':
            case 'number':
                control = DOM.createInput({
                    type: config.type,
                    value: currentValue,
                    placeholder: config.placeholder,
                    width: config.width,
                    min: config.min,
                    max: config.max,
                    onChange: (val) => this._updateModel(config.key, val)
                });
                break;
            
            case 'switch':
                control = DOM.createSwitchInput({
                    checked: currentValue,
                    dataset: { key: config.key },
                    onChange: (checked) => this._updateModel(config.key, checked)
                });
                break;

            case 'select':
                control = DOM.createCustomSelect({
                    value: currentValue,
                    options: config.options || [],
                    layout: config.layout || 'between',
                    onChange: (e) => this._updateModel(config.key, e.target.value)
                });
                break;
            
            default:
                console.warn(`[FormBuilder] Unknown type: ${config.type}`);
                return null;
        }

        // 2. 包装成 FormRow
        if (config.label) {
            wrapper = DOM.createFormRow({
                label: config.label,
                note: config.note,
                content: control,
                className: config.rowClassName,
                layout: config.layout // [新增] 透传 layout 配置
            });
        } else {
            wrapper = control;
        }

        // 3. 注册到 Map (用于后续更新)
        // 我们存储 wrapper 以便控制显示隐藏，同时也存储 control 以便设置值
        this.fieldMap.set(config.key, { wrapper, control, config });

        return wrapper;
    }

    _updateModel(path, value) {
        this._setValueByPath(this.formData, path, value);
        
        // 触发联动检查
        this._handleDependencies();

        // 通知外部
        if (this.onChangeCallback) {
            this.onChangeCallback(this.formData);
        }
    }

    _handleDependencies() {
        this.fieldMap.forEach((node) => {
            const { wrapper, control, config } = node;

            // 处理 showIf (显示/隐藏)
            if (config.showIf && typeof config.showIf === 'function') {
                const shouldShow = config.showIf(this.formData);
                wrapper.style.display = shouldShow ? '' : 'none';
            }

            // 处理 disabledIf (禁用/启用)
            if (config.disabledIf && typeof config.disabledIf === 'function') {
                const shouldDisable = config.disabledIf(this.formData);
                if (control.setDisabled) {
                    control.setDisabled(shouldDisable);
                }
            }
            
            // 处理 value 联动 (如果数据被外部修改，或者联动导致数据重置)
            // 注意：这里简单比对，避免循环触发
            const modelVal = this._getValueByPath(this.formData, config.key);
            const viewVal = control.getValue ? control.getValue() : null;
            
            if (modelVal !== viewVal && control.setValue) {
                control.setValue(modelVal);
            }
        });
    }

    // --- 工具函数：处理嵌套路径 (如 'config.video') ---

    _getValueByPath(obj, path) {
        if (!path) return undefined;
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    }

    _setValueByPath(obj, path, value) {
        if (!path) return;
        const parts = path.split('.');
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) current[parts[i]] = {};
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
    }
}

window.FormBuilder = FormBuilder;