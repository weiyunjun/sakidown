/**
 * @file manager/dom-sync.js
 * @description DOM 同步引擎 (DOM Synchronization Engine)
 * * 核心职责 (Core Responsibilities):
 * 1. 列表差异更新 (List Diff & Reconciliation):
 * - 实现自定义 Diff 算法 (`syncDOMList`)，对比新数据列表与现有 DOM 节点。
 * - 智能决策：优先尝试 `updateTaskCard` 进行局部更新 (如进度/速度)，仅在 DOM 结构不匹配或必须替换时重建节点。
 * * 2. 状态保持 (State Preservation):
 * - 在更新列表前创建 "快照" (Snapshot)，记录当前勾选的 Checkbox UID。
 * - 在 DOM 更新/重建后恢复勾选状态，防止轮询刷新导致用户选择丢失。
 * * 3. 节点复用与排序 (Node Reuse & Ordering):
 * - 维护 `existingMap` 以复用 DOM 节点，根据新列表顺序调整节点位置 (`insertBefore`/`appendChild`)。
 * - 自动清理 (`remove`) 不在可视列表中的旧节点。
 * * 通信链路 (Communication):
 * - Input: 接收新任务列表 (`list`) 和容器 (`container`)。
 * - Output: 调用 `renderTaskCard` / `updateTaskCard` 修改 DOM。
 * * @author weiyunjun
 * @version v0.1.0
 */

import { normalizeTaskData } from './formatters.js';
import { renderTaskCard, updateTaskCard } from './task-card.js';

export function createElementFromHTML(htmlString) {
    const div = document.createElement('div');

    div.innerHTML = htmlString.trim();

    return div.firstChild;
}

export function syncDOMList(container, list, type, emptyEl) {
    if (!list || list.length === 0) {
        container.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'block';

        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    const checkedUids = new Set();

    container.querySelectorAll('.ud-task-checkbox:checked').forEach((cb) => {
        checkedUids.add(cb.dataset.uid);
    });
    const existingMap = new Map();

    Array.from(container.children).forEach((el) => {
        if (el.classList.contains('ud-sentinel')) return;

        if (el.classList.contains('ud-task-card')) {
            existingMap.set(el.dataset.uid, el);
        } else {
            el.remove();
        }
    });
    const keptUids = new Set();

    list.forEach((item, index) => {
        const uid = item.status ? item.status.uid || item.id : item.id;

        keptUids.add(uid);
        const newData = normalizeTaskData(item);
        const newPhase = newData.status;
        let el = existingMap.get(uid);

        if (el) {
            const currentIdx = Array.prototype.indexOf.call(container.children, el);

            if (currentIdx !== index) {
                const ref = container.children[index];

                if (ref) container.insertBefore(el, ref);
                else container.appendChild(el);
            }

            const oldPhase = el.dataset.phase;
            let shouldReplace = oldPhase && oldPhase !== newPhase;

            if (!shouldReplace) {
                const success = updateTaskCard(el, item, type);

                if (!success) shouldReplace = true;
            }

            if (shouldReplace) {
                const newHtml = renderTaskCard(item, type);
                const newEl = createElementFromHTML(newHtml);

                newEl.dataset.phase = newPhase;
                container.replaceChild(newEl, el);
                el = newEl;
            } else {
                el.dataset.phase = newPhase;
            }
        } else {
            const newHtml = renderTaskCard(item, type);
            const newEl = createElementFromHTML(newHtml);

            newEl.dataset.phase = newPhase;
            const ref = container.children[index];

            if (ref) container.insertBefore(newEl, ref);
            else container.appendChild(newEl);
            el = newEl;
        }

        const checkbox = el.querySelector('.ud-task-checkbox');

        if (checkbox) {
            if (checkedUids.has(uid)) {
                checkbox.checked = true;
            } else {
                checkbox.checked = false;
            }
        }
    });
    existingMap.forEach((el, uid) => {
        if (!keptUids.has(uid)) {
            el.remove();
        }
    });
}
