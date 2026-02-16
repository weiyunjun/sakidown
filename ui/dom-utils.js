/**
 * @file ui/dom-utils.js
 * @description DOM 工厂与 UI 组件构建工具 (DOM Factory & UI Builder)
 * * 核心职责 (Core Responsibilities):
 * 1. 元素工厂 (Element Factory):
 * - 提供 `create` 方法，简化 `document.createElement` 的繁琐操作。
 * - 集中管理 SVG 图标资源 (`window.Icons`)，确保应用内图标风格统一。
 * * 2. 复合组件构建 (Component Construction):
 * - `createCustomSelect`: 构建完全自定义样式的下拉菜单，支持颜色标记、Tooltip 和动态定位。
 * - `createSwitch` / `createSlider`: 封装原生 Input 为符合 Material Design 风格的开关和滑块。
 * - `createInput` / `createButton`: 标准化表单控件的创建逻辑。
 * * 3. 交互逻辑封装 (Interaction Encapsulation):
 * - 封装下拉菜单的点击外部关闭 (`_toggleMenu`) 和窗口自适应定位逻辑。
 * * 通信链路 (Communication):
 * - Role: 纯工具库，挂载于 `window.DOMUtils` 和 `window.Icons`，供所有 UI 相关的脚本调用。
 * * @author weiyunjun
 * @version v0.1.0
 */

const Icons = {
    close:
    '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path></svg>',
    more: 
    '<svg viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>',
    link: 
    '<svg viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"></path></svg>',
    trash:
    '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path></svg>',
    refresh:
    '<svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg>',
    strategy:
    '<svg viewBox="0 0 24 24"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"></path></svg>',
    about:
    '<svg viewBox="0 0 24 24"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"></path></svg>',
    check: 
    '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path></svg>',
    chevron: 
    '<svg viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path></svg>',
    download: 
    '<svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>',
    batch:
    '<svg viewBox="0 0 24 24"><path d="M18 13v5.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5V7.5A1.5 1.5 0 0 1 5.5 6H10"/><path d="M10 6l3.5-3.5a6 6 0 0 1 8 8L18 13"/></svg>',
    tools:
    '<svg viewBox="0 0 24 24"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>',
    queue:
    '<svg viewBox="0 0 24 24"><path d="M4 14h4v-4H4v4zm0 5h4v-4H4v4zM4 9h4V5H4v4zm5 5h12v-4H9v4zm0 5h12v-4H9v4zM9 5v4h12V5H9z"></path></svg>',
    history:
    '<svg viewBox="0 0 24 24"><path d="M12 24C5.4 24 0 18.6 0 12S5.4 0 12 0s12 5.4 12 12-5.4 12-12 12m0-22C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2"/><path d="M11 16c-.3 0-.5-.1-.7-.3l-3-3c-.4-.4-.4-1 0-1.4s1-.4 1.4 0l3 3c.4.4.4 1 0 1.4-.2.2-.4.3-.7.3"/><path d="M11 16c-.3 0-.5-.1-.7-.3-.4-.4-.4-1 0-1.4l6-6c.4-.4 1-.4 1.4 0s.4 1 0 1.4l-6 6c-.2.2-.4.3-.7.3"/></svg>',
    alert:
    '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"></path></svg>',
    menu: 
    '<svg viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"></path></svg>',
    sidebar_toggle:
    '<svg style="fill: none;" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>',
    folder:
    '<svg viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"></path></svg>',
    tv: 
    '<svg viewBox="0 0 24 24" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M7 5C4.79086 5 3 6.79086 3 9V16C3 18.2091 4.79086 20 7 20H17C19.2091 20 21 18.2091 21 16V9C21 6.79086 19.2091 5 17 5H7ZM10 10.5C10 9.68 10.91 9.19 11.6 9.62L15.1 11.62C15.74 11.98 15.74 13.02 15.1 13.38L11.6 15.38C10.91 15.81 10 15.32 10 14.5V10.5Z" fill="currentColor"/><path d="M15 5L16.1 3.6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 5L7.9 3.6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search:
    '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path></svg>',
    copy: 
    '<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"></path></svg>',
    fence:
    '<svg viewBox="0 0 24 24"><path d="M4 11h5V5H4v6zm0 7h5v-6H4v6zm6 0h5v-6h-5v6zm6 0h5v-6h-5v6zm-6-7h5V5h-5v6zm6-6v6h5V5h-5z"></path></svg>',
    volume:
    '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path></svg>',
    plus: 
    '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"></path></svg>',
    ellipsis:
    '<svg viewBox="0 0 24 24"><path d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>',
    database:
    '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 4.02 2 6.5S6.48 11 12 11s10-2.02 10-4.5S17.52 2 12 2zm0 13c-5.52 0-10-2.02-10-4.5V10c0 2.48 4.48 4.5 10 4.5s10-2.02 10-4.5V7.5c0 2.48-4.48 4.5-10 4.5zm0 7c-5.52 0-10-2.02-10-4.5V17c0 2.48 4.48 4.5 10 4.5s10-2.02 10-4.5v-2.5c0 2.48-4.48 4.5-10 4.5z" fill="currentColor"/></svg>',
    export:
    '<svg viewBox="0 0 24 24"><path d="M20 24H0V0h14.41L20 5.59v4.38h-2V8h-6V2H2v20h18zM14 6h3.59L14 2.41zm4.71 14.71L17.3 19.3l2.29-2.3H11v-2h8.59l-2.29-2.29 1.41-1.41 4.7 4.7z"/></svg>',
    save: 
    '<svg viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"></path></svg>',
    selector:
    '<svg viewBox="0 0 24 24"><path d="M7 10l5-5 5 5-1.41 1.41L12 7.83l-3.59 3.58L7 10z"></path><path d="M7 14l5 5 5-5-1.41-1.41L12 16.17l-3.59-3.58L7 14z"></path></svg>',
    general:
    '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.96l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.26-1.13.59-1.62.96l-2.39-.96c-.21-.08-.47.01-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.21.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.96l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.26 1.13-.59 1.62-.96l2.39.96c.21.08.47-.01.59-.22l1.92-3.32c.12-.21.08-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"></path></svg>',
    settings:
    '<svg viewBox="0 0 16 16"><path fill="none" d="M0 0h16v16H0z"/><path d="M15.379 12.379 8.79 5.79c.123-.411.21-.839.21-1.29A4.5 4.5 0 0 0 4.5 0c-.451 0-.879.087-1.29.21l2.291 2.291a2.12 2.12 0 0 1 0 2.998l-.002.002a2.12 2.12 0 0 1-2.998 0L.21 3.21C.087 3.621 0 4.049 0 4.5A4.5 4.5 0 0 0 4.5 9c.451 0 .879-.087 1.29-.21l6.589 6.589a2.12 2.12 0 0 0 2.998 0l.002-.002a2.12 2.12 0 0 0 0-2.998M13.75 14.75a1 1 0 1 1 0-2 1 1 0 0 1 0 2"/></svg>',
    palette:
    '<svg viewBox="0 0 24 24"><path d="M8 10.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0M10.5 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M17 6.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0M7.5 17a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3"/><path fill-rule="evenodd" d="M1 12C1 5.925 5.925 1 12 1c5.971 0 11 4.35 11 10v.015c0 .528 0 1.43-.317 2.484-.833 2.758-3.863 3.497-6.188 2.903-.484-.123-.97-.257-1.438-.391-.806-.232-1.54.479-1.39 1.22l.317 1.589.114.687c.297 1.782-1.096 3.595-3.081 3.343-3.367-.427-5.897-1.75-7.581-3.717C1.757 17.17 1 14.66 1 12m11-9a9 9 0 0 0-9 9c0 2.285.647 4.303 1.956 5.833 1.303 1.523 3.344 2.656 6.312 3.033.467.059.967-.375.857-1.03l-.109-.656-.311-1.556c-.458-2.291 1.737-4.158 3.904-3.535.453.13.92.258 1.38.376 1.787.456 3.385-.24 3.779-1.544.229-.76.232-1.415.232-1.921 0-4.35-3.925-8-9-8" clip-rule="evenodd"/></svg>',
    batch_check:
    '<svg viewBox="0 0 24 24"><path fill="none" d="M0 0h24v24H0z"/><path d="M7 7V3a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-4v3.993c0 .556-.449 1.007-1.007 1.007H3.007A1.006 1.006 0 0 1 2 20.993l.003-12.986C2.003 7.451 2.452 7 3.01 7zm2 0h6.993C16.549 7 17 7.449 17 8.007V15h3V4H9zm6 2H4.003L4 20h11zm-6.497 9-3.536-3.536 1.414-1.414 2.122 2.122 4.242-4.243 1.414 1.414z"/></svg>',
    cancel:
    '<svg viewBox="0 0 24 24"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2m5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12z"/></svg>',
    manager:
    '<svg viewBox="0 0 24 24"><path d="M20 19.261h-9.07c-.45 0-.82-.37-.82-.82s.37-.82.82-.82H20c.45 0 .82.37.82.82 0 .46-.37.82-.82.82M20 12.968h-9.07c-.45 0-.82-.37-.82-.82s.37-.82.82-.82H20c.45 0 .82.37.82.82s-.37.82-.82.82M20 6.671h-9.07c-.45 0-.82-.37-.82-.82s.37-.82.82-.82H20c.45 0 .82.37.82.82s-.37.82-.82.82M4.91 8.032c-.22 0-.43-.09-.58-.24l-.91-.91a.82.82 0 0 1 1.16-1.16l.33.33 2.14-2.14a.82.82 0 0 1 1.16 1.16l-2.72 2.72c-.16.15-.36.24-.58.24M4.91 14.329c-.21 0-.42-.08-.58-.24l-.91-.91a.82.82 0 0 1 1.16-1.16l.33.33 2.14-2.14a.82.82 0 0 1 1.16 1.16l-2.72 2.72c-.16.16-.37.24-.58.24M4.91 20.329c-.21 0-.42-.08-.58-.24l-.91-.91a.82.82 0 0 1 1.16-1.16l.33.33 2.14-2.14a.821.821 0 0 1 1.16 1.16l-2.72 2.72c-.16.16-.37.24-.58.24"/></svg>',
};
const DOMUtils = {
    create: (tag, className, text) => {
        const el = document.createElement(tag);

        if (className) el.className = className;
        if (text) el.textContent = text;

        return el;
    },
    html: (el, html) => {
        el.innerHTML = html;

        return el;
    },
    createButton: (options = {}) => {
        const btn = document.createElement('button');
        let typeClass = 'ud-btn-important';

        if (options.type === 'normal') {
            typeClass = 'ud-btn-normal';
        } else if (options.type === 'settings-primary') {
            typeClass = 'ud-btn-settings primary';
        } else if (options.type === 'settings-normal') {
            typeClass = 'ud-btn-settings normal';
        }

        btn.className = `ud-btn ${typeClass} ${options.className || ''}`;
        if (options.id) btn.id = options.id;

        if (options.icon) {
            const iconSpan = document.createElement('span');

            iconSpan.className = 'ud-flex-center';
            iconSpan.innerHTML = options.icon;
            btn.appendChild(iconSpan);

            if (options.text) {
                const textSpan = document.createElement('span');

                textSpan.textContent = options.text;
                btn.appendChild(textSpan);
            }
        } else {
            btn.textContent = options.text || 'Button';
        }

        if (options.onClick) btn.onclick = options.onClick;

        return btn;
    },
    createInput: (options = {}) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'ud-input-wrapper';

        if (options.width) {
            wrapper.style.width = options.width;
        }

        if (options.label) {
            const label = document.createElement('div');

            label.textContent = options.label;
            label.className = 'ud-form-label';
            wrapper.appendChild(label);
        }

        const input = document.createElement('input');

        input.type = options.type === 'number' ? 'text' : 'text';
        input.className = 'ud-input';
        if (options.id) input.id = options.id;
        input.value = options.value !== undefined ? options.value : '';
        if (options.placeholder) input.placeholder = options.placeholder;

        if (options.disabled) {
            input.disabled = true;
        }

        if (options.type === 'number') {
            input.inputMode = 'numeric';
            const charCount = options.width !== undefined ? options.width : 4;

            input.style.width = `calc(${charCount}ch + 26px)`;
            input.style.textAlign = 'center';
            const min = options.min !== undefined ? options.min : -Infinity;
            const max = options.max !== undefined ? options.max : Infinity;
            const defVal = options.defaultValue;

            input.oninput = (e) => {
                let val = e.target.value;

                val = val.replace(/[^0-9]/g, '');

                if (val !== '') {
                    const num = parseInt(val, 10);

                    if (num > max) {
                        val = max.toString();
                    }
                }

                if (e.target.value !== val) {
                    e.target.value = val;
                }

                if (options.onChange) options.onChange(val);
            };

            input.onblur = (e) => {
                let val = e.target.value;
                const num = parseInt(val, 10);
                let fallback = null;

                if (val === '') {
                    if (defVal !== undefined) {
                        fallback = defVal.toString();
                    } else {
                        fallback = (min !== -Infinity ? min : 1).toString();
                    }
                } else if (!isNaN(num) && num < min) {
                    fallback = (min !== -Infinity ? min : 1).toString();
                }

                if (fallback !== null) {
                    e.target.value = fallback;
                    if (options.onChange) options.onChange(fallback);
                }
            };
        } else {
            if (options.onChange) {
                input.oninput = (e) => options.onChange(e.target.value);
            }
        }

        wrapper.appendChild(input);

        wrapper.setValue = (val) => {
            input.value = val;
            input.dispatchEvent(new Event('input'));
        };
        wrapper.getValue = () => input.value;
        wrapper.setDisabled = (disabled) => {
            input.disabled = disabled;
            if (disabled) wrapper.classList.add('disabled');
            else wrapper.classList.remove('disabled');
        };

        return wrapper;
    },
    createLabelGroup: (options = {}) => {
        const group = document.createElement('div');

        group.className = 'ud-form-label-group';

        if (options.label) {
            const label = document.createElement('div');

            label.className = 'ud-form-label';
            label.textContent = options.label;
            group.appendChild(label);
        }

        if (options.note) {
            const note = document.createElement('div');

            note.className = 'ud-form-note';
            note.textContent = options.note;
            group.appendChild(note);
        }

        return group;
    },
    createBadge: (text, type = 'gray') => {
        const span = document.createElement('span');

        span.className = 'ud-tag';
        span.textContent = text;
        if (type === 'success') span.classList.add('text-success');

        return span;
    },
    createCard: (className = '') => {
        const card = document.createElement('div');

        card.className = `ud-manager-card ${className}`;

        return card;
    },
    createActionMenu: (options = {}) => {
        const container = document.createElement('div');

        container.className = 'ud-action-menu-wrap';
        const trigger = document.createElement('div');

        trigger.className = 'ud-icon-btn';
        trigger.innerHTML = options.icon || window.Icons.more;
        container.appendChild(trigger);
        const menu = document.createElement('div');

        menu.className = 'ud-floating-menu';
        options.items.forEach((item) => {
            const el = document.createElement('div');

            el.className = `ud-menu-item ${item.type === 'danger' ? 'danger' : ''}`;
            const iconPlace = document.createElement('div');

            iconPlace.className = 'ud-menu-icon-check';
            el.appendChild(iconPlace);
            const text = document.createElement('span');

            text.textContent = item.label;
            el.appendChild(text);

            el.onclick = (e) => {
                e.stopPropagation();
                if (item.onClick) item.onClick();
                DOMUtils._toggleMenu(menu, false);
            };

            menu.appendChild(el);
        });
        container.appendChild(menu);

        trigger.onclick = (e) => {
            e.stopPropagation();
            const isVisible = menu.classList.contains('show');

            DOMUtils._toggleMenu(menu, !isVisible);
        };

        return container;
    },
    createCustomSelect: (options = {}) => {
        const wrapper = document.createElement('div');
        const layoutMode = options.layout || 'start';

        wrapper.className = `ud-select-wrapper layout-${layoutMode}`;
        if (options.disabled) wrapper.classList.add('disabled');

        if (options.label) {
            const label = document.createElement('div');

            label.className = 'ud-form-label';
            label.textContent = options.label;
            wrapper.appendChild(label);
        }

        const container = document.createElement('div');

        container.className = 'ud-custom-select-container';

        if (options.width) {
            container.style.width = options.width;
        }

        if (options.disabled) container.style.pointerEvents = 'none';
        const trigger = document.createElement('div');

        trigger.className = 'ud-select-trigger';

        if (options.dataset) {
            for (const [k, v] of Object.entries(options.dataset)) {
                trigger.dataset[k] = v;
            }
        }

        trigger.value = options.value;
        const createColorDot = (color) => `<span class="ud-color-dot" style="background-color:${color};"></span>`;

        const updateTriggerDisplay = () => {
            const currentOpt = (options.options || []).find((o) => o.value === trigger.value);
            const currentLabel = currentOpt ? currentOpt.label : trigger.value;
            let contentHtml = currentLabel;

            if (currentOpt && currentOpt.color) {
                contentHtml = `<div class="ud-flex-center">${createColorDot(currentOpt.color)}<span>${currentLabel}</span></div>`;
            }

            trigger.innerHTML = `\n                <div class="ud-select-value">${contentHtml}</div>\n                <div class="ud-select-arrow">${window.Icons.selector}</div>\n            `;
        };

        wrapper.setValue = (val) => {
            trigger.value = val;
            updateTriggerDisplay();
        };
        wrapper.getValue = () => trigger.value;
        wrapper.setDisabled = (disabled) => {
            if (disabled) {
                wrapper.classList.add('disabled');
                container.style.pointerEvents = 'none';
            } else {
                wrapper.classList.remove('disabled');
                container.style.pointerEvents = 'auto';
            }
        };

        updateTriggerDisplay();
        container.appendChild(trigger);

        trigger.onclick = (e) => {
            e.stopPropagation();
            if (options.disabled) return;
            if (document.getElementById('ud-active-select-menu')) return;
            trigger.classList.add('active');
            const menu = document.createElement('div');

            menu.id = 'ud-active-select-menu';
            menu.className = 'ud-floating-menu fixed-mode show';
            menu.style.position = 'fixed';
            menu.style.marginTop = '0';
            menu.style.marginBottom = '0';
            const opts = options.options || [];

            opts.forEach((opt) => {
                const item = document.createElement('div');
                const isSelected = opt.value === trigger.value;

                item.className = `ud-menu-item ${isSelected ? 'selected' : ''}`;

                if (opt.tooltip) {
                    item.dataset.udTooltip = opt.tooltip;
                    item.dataset.udTooltipPos = opt.tooltipPos || 'right';

                    if (opt.tooltipWidth) {
                        item.dataset.udTooltipWidth = opt.tooltipWidth;
                    }

                    item.dataset.udTooltipDelay = '50';
                }

                const iconBox = document.createElement('div');

                iconBox.className = 'ud-menu-icon-check';
                iconBox.innerHTML = window.Icons.check;
                item.appendChild(iconBox);

                if (opt.color) {
                    const dot = document.createElement('span');

                    dot.className = 'ud-color-dot';
                    dot.style.backgroundColor = opt.color;
                    item.appendChild(dot);
                }

                const text = document.createElement('span');

                text.textContent = opt.label;
                item.appendChild(text);

                item.onclick = (ev) => {
                    ev.stopPropagation();
                    trigger.value = opt.value;
                    updateTriggerDisplay();
                    if (options.onChange) options.onChange({ target: { value: opt.value } });
                    closeMenu();
                };

                menu.appendChild(item);
            });
            document.body.appendChild(menu);
            const triggerRect = trigger.getBoundingClientRect();
            const menuHeight = menu.offsetHeight;
            const viewportHeight = window.innerHeight;

            menu.style.width = `${triggerRect.width}px`;
            menu.style.left = `${triggerRect.left}px`;
            const spaceBelow = viewportHeight - triggerRect.top;
            const spaceAbove = triggerRect.bottom;
            let finalTop = 0;
            let transformOrigin = 'top center';

            if (spaceBelow >= menuHeight) {
                finalTop = triggerRect.top;
                transformOrigin = 'top center';
            } else if (spaceAbove >= menuHeight) {
                finalTop = triggerRect.bottom - menuHeight;
                transformOrigin = 'bottom center';
            } else {
                finalTop = triggerRect.top;

                if (viewportHeight - triggerRect.top < menuHeight) {
                    menu.style.maxHeight = `${viewportHeight - triggerRect.top - 20}px`;
                }
            }

            menu.style.top = `${finalTop}px`;
            menu.style.transformOrigin = transformOrigin;
            const selectedItem = menu.querySelector('.selected');

            if (selectedItem) {
                selectedItem.scrollIntoView({ block: 'start' });
            }

            const scrollHandler = (ev) => {
                if (menu.contains(ev.target)) return;
                closeMenu();
            };

            const closeMenu = () => {
                if (menu.parentNode) menu.parentNode.removeChild(menu);
                trigger.classList.remove('active');
                document.removeEventListener('click', outsideClickListener);
                window.removeEventListener('resize', closeMenu);
                window.removeEventListener('wheel', scrollHandler, true);
            };

            const outsideClickListener = (ev) => {
                if (!menu.contains(ev.target) && ev.target !== trigger) {
                    closeMenu();
                }
            };

            setTimeout(() => document.addEventListener('click', outsideClickListener), 0);
            window.addEventListener('resize', closeMenu);
            window.addEventListener('wheel', scrollHandler, true);
        };

        wrapper.appendChild(container);

        return wrapper;
    },
    _toggleMenu: (menu, show, onClose) => {
        if (show) {
            document.querySelectorAll('.ud-floating-menu.show').forEach((el) => {
                el.classList.remove('show');
            });
            menu.classList.add('show');
            setTimeout(() => {
                const closeHandler = (e) => {
                    if (!menu.contains(e.target)) {
                        menu.classList.remove('show');
                        if (onClose) onClose();
                        document.removeEventListener('click', closeHandler);
                    }
                };

                document.addEventListener('click', closeHandler);
            }, 0);
        } else {
            menu.classList.remove('show');
            if (onClose) onClose();
        }
    },
    createRadioRow: (options = {}) => {
        const wrapper = document.createElement('div');

        wrapper.className = 'ud-radio-wrapper';
        const row = document.createElement('div');

        row.className = `ud-radio-row ${options.checked ? 'checked' : ''}`;

        row.onclick = () => {
            if (options.onSelect) options.onSelect(options.value);
            if (options.onPlay) options.onPlay(options.value);
        };

        const leftArea = document.createElement('div');

        leftArea.className = 'ud-radio-left';
        const radio = document.createElement('div');

        radio.className = 'ud-radio-circle';

        if (options.checked) {
            const dot = document.createElement('div');

            dot.className = 'ud-radio-dot';
            radio.appendChild(dot);
        }

        leftArea.appendChild(radio);
        const labelWrapper = document.createElement('div');

        labelWrapper.className = 'ud-radio-filename-wrapper';
        let nameText = options.label || options.value;
        let extText = '';
        const lastDotIndex = nameText.lastIndexOf('.');

        if (lastDotIndex > 0) {
            extText = nameText.substring(lastDotIndex);
            nameText = nameText.substring(0, lastDotIndex);
        }

        const nameSpan = document.createElement('span');

        nameSpan.className = 'ud-radio-fname';
        nameSpan.textContent = nameText;
        const extSpan = document.createElement('span');

        extSpan.className = 'ud-radio-fext';
        extSpan.textContent = extText;
        labelWrapper.appendChild(nameSpan);
        labelWrapper.appendChild(extSpan);
        leftArea.appendChild(labelWrapper);
        row.appendChild(leftArea);
        wrapper.appendChild(row);

        if (options.onAction) {
            const actionBtn = document.createElement('div');

            actionBtn.className = 'ud-radio-action-btn';
            actionBtn.innerHTML = options.actionIcon || window.Icons.ellipsis;

            actionBtn.onclick = (e) => {
                e.stopPropagation();
                options.onAction(e, options.value, actionBtn);
            };

            wrapper.appendChild(actionBtn);
        } else if (options.onDelete) {
            const delBtn = document.createElement('div');

            delBtn.className = 'ud-radio-action-btn';
            delBtn.innerHTML = window.Icons.trash;
            delBtn.style.color = 'var(--destructive)';

            delBtn.onclick = (e) => {
                e.stopPropagation();
                options.onDelete(options.value);
            };

            wrapper.appendChild(delBtn);
        }

        return wrapper;
    },
    createSlider: (options = {}) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'ud-slider-container';
        
        const input = document.createElement('input');
        input.type = 'range';
        input.className = 'ud-slider-input';
        
        input.min = options.min !== undefined ? options.min : 0;
        input.max = options.max !== undefined ? options.max : 100;
        input.step = options.step || 1;
        input.value = options.value !== undefined ? options.value : 50;

        // 4. 背景渐变逻辑 (JS 控制轨道左蓝右灰)
        const updateBackground = (val) => {
            const min = parseFloat(input.min);
            const max = parseFloat(input.max);
            const range = max - min || 1; 
            const percentage = ((val - min) / range) * 100;
            
            input.style.background = `linear-gradient(to right, var(--primary) 0%, var(--primary) ${percentage}%, var(--input) ${percentage}%, var(--input) 100%)`;
        };

        updateBackground(input.value);

        input.oninput = (e) => {
            const val = e.target.value;
            updateBackground(val);
            if (options.onChange) options.onChange(val);
        };

        wrapper.appendChild(input);
        
        wrapper.setValue = (newVal) => {
            input.value = newVal;
            updateBackground(newVal);
        };

        return wrapper;
    },
    createSwitchInput: (options = {}) => {
        const labelSwitch = document.createElement('label');
        labelSwitch.className = 'ud-switch';
        
        const input = document.createElement('input');
        input.type = 'checkbox';
        if (options.checked) input.checked = true;
        if (options.disabled) input.disabled = true;

        if (options.dataset) {
            for (const [k, v] of Object.entries(options.dataset)) {
                input.dataset[k] = v;
            }
        }

        if (options.onChange) {
            input.onchange = (e) => options.onChange(e.target.checked, e);
        }

        const slider = document.createElement('span');
        slider.className = 'ud-slider';
        
        labelSwitch.appendChild(input);
        labelSwitch.appendChild(slider);

        labelSwitch.setValue = (checked) => {
            input.checked = !!checked;
            // 触发 change 以保持一致性
            input.dispatchEvent(new Event('change'));
        };
        labelSwitch.getValue = () => input.checked;
        labelSwitch.setDisabled = (disabled) => {
            input.disabled = disabled;
            if (disabled) labelSwitch.classList.add('disabled');
            else labelSwitch.classList.remove('disabled');
        };
        
        return labelSwitch;
    },
    createFormRow: (options = {}) => {
        
        const wrapper = document.createElement('div');
        wrapper.className = 'ud-form-row';

        // 1. 处理垂直布局容器 (利用 gap 自动处理垂直间距)
        if (options.layout === 'vertical') {
            wrapper.style.flexDirection = 'column';
            wrapper.style.alignItems = 'stretch';
            wrapper.style.height = 'auto';
            wrapper.style.padding = '8px 0';
        }

        if (options.alignStart || options.note || options.subLabel) {
            wrapper.classList.add('align-start');
        }
        if (options.className) wrapper.classList.add(options.className);

        const labelGroup = DOMUtils.createLabelGroup({ 
            label: options.label, 
            note: options.note || options.subLabel
        });
        wrapper.appendChild(labelGroup);

        const controls = document.createElement('div');
        controls.className = 'ud-form-controls';

        // 2. 垂直布局下 Controls 占满宽度 + 左对齐
        if (options.layout === 'vertical') {
            controls.style.width = '100%';
            controls.style.justifyContent = 'flex-start';
        }
        
        if (options.content) {
            if (options.content instanceof Node) {
                controls.appendChild(options.content);
            } else if (Array.isArray(options.content)) {
                options.content.forEach(node => controls.appendChild(node));
            }
        }
        wrapper.appendChild(controls);

        return wrapper;
    },
};

window.Icons = Icons;
window.DOMUtils = DOMUtils;