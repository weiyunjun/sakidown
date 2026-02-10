/**
 * @file manager/pagination.js
 * @description 通用分页组件 (Generic Pagination Component)
 * * 核心职责 (Core Responsibilities):
 * 1. 分页逻辑计算 (Pagination Logic):
 * - 动态计算页码显示范围 (`_calculatePages`)，处理首尾页码及中间省略号 (...) 的显示逻辑。
 * - 自动计算总页数 (`totalPages`) 并处理边界条件 (如 0 条数据时的隐藏)。
 * * 2. 交互组件渲染 (UI Rendering):
 * - 渲染完整的控制条：每页数量选择器 (Select)、页码按钮、上一页/下一页、快速跳转输入框 (Jump Input)。
 * - 动态调整跳转输入框宽度以适配页码位数。
 * * 3. 性能优化 (Performance Optimization):
 * - 实现指纹机制 (`fingerprint`)：基于 page/size/total 生成唯一标识，数据未变动时跳过 DOM 重绘，防止输入焦点丢失。
 * * 通信链路 (Communication):
 * - Input: 接收 `totalItems`, `currentPage`, `pageSize` 及回调函数。
 * - Output: 触发 `onPageChange` (切页) 和 `onPageSizeChange` (改每页条数) 回调。
 * * @author weiyunjun
 * @version v0.1.0
 */

export const DEFAULT_PAGE_SIZE = 25;

export function renderPagination(_container, totalItems, currentPage, pageSize, onPageChange, onPageSizeChange) {
    const paginationEl = document.getElementById('global-pagination-container');

    if (!paginationEl) return;
    const totalPages = Math.ceil(totalItems / pageSize);

    if (totalItems === 0) {
        paginationEl.innerHTML = '';
        paginationEl.style.display = 'none';
        delete paginationEl.dataset.fingerprint;

        return;
    }

    paginationEl.style.display = 'block';
    const fingerprint = `${currentPage}-${totalPages}-${pageSize}-${totalItems}`;

    if (paginationEl.dataset.fingerprint === fingerprint) {
        return;
    }

    paginationEl.dataset.fingerprint = fingerprint;
    paginationEl.innerHTML = '';
    const wrapper = document.createElement('div');

    wrapper.className = 'ud-pg-wrapper';
    const leftSide = document.createElement('div');

    leftSide.className = 'ud-pg-side';
    const sizeSelect = window.DOMUtils.createCustomSelect({
        label: '每页任务数',
        layout: 'start',
        value: pageSize.toString(),
        options: [
            { value: '10', label: '10个' },
            { value: '25', label: '25个' },
            { value: '50', label: '50个' },
            { value: '100', label: '100个' },
        ],
        onChange: (e) => {
            const val = e.target.value;

            if (onPageSizeChange) onPageSizeChange(parseInt(val));
        },
    });

    leftSide.appendChild(sizeSelect);
    wrapper.appendChild(leftSide);
    const centerSide = document.createElement('div');

    centerSide.className = 'ud-pg-container';
    const pages = _calculatePages(currentPage, totalPages);
    const chevronIcon = window.Icons && window.Icons.chevron ? window.Icons.chevron : '>';
    let html = '';
    const prevDisabled = currentPage <= 1 ? 'disabled' : '';

    html += `\n        <div class="ud-pg-item ud-pg-prev ${prevDisabled}" data-page="${currentPage - 1}">\n            <div class="ud-pg-icon">${chevronIcon}</div>\n        </div>\n    `;

    for (let i = 0; i < pages.length; i++) {
        const p = pages[i];

        if (i > 0 && p - pages[i - 1] > 1) {
            html += `<div class="ud-pg-item dots">...</div>`;
        }

        const isActive = p === currentPage ? 'active' : '';

        html += `<div class="ud-pg-item ${isActive}" data-page="${p}">${p}</div>`;
    }

    const nextDisabled = currentPage >= totalPages ? 'disabled' : '';

    html += `\n        <div class="ud-pg-item ud-pg-next ${nextDisabled}" data-page="${currentPage + 1}">\n            <div class="ud-pg-icon">${chevronIcon}</div>\n        </div>\n    `;
    centerSide.innerHTML = html;
    centerSide.addEventListener('click', (e) => {
        const item = e.target.closest('.ud-pg-item');

        if (
            !item ||
      item.classList.contains('disabled') ||
      item.classList.contains('dots') ||
      item.classList.contains('active')
        ) {
            return;
        }

        const targetPage = parseInt(item.dataset.page);

        if (!isNaN(targetPage)) onPageChange(targetPage);
    });
    wrapper.appendChild(centerSide);
    const rightSide = document.createElement('div');

    rightSide.className = 'ud-pg-side';
    const jumpLabelStart = document.createElement('span');

    jumpLabelStart.textContent = '前往';
    const digits = totalPages.toString().length;
    const jumpInputWrapper = window.DOMUtils.createInput({
        type: 'number',
        width: Math.max(digits, 2),
        min: 1,
        max: totalPages,
        placeholder: '',
        value: '',
    });
    const jumpInput = jumpInputWrapper.querySelector('input');

    if (jumpInput) {
        jumpInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                let val = parseInt(e.target.value);

                if (isNaN(val)) return;
                if (val < 1) val = 1;
                if (val > totalPages) val = totalPages;
                e.target.value = '';

                if (val !== currentPage) {
                    onPageChange(val);
                }
            }
        });
    }

    const jumpLabelEnd = document.createElement('span');

    jumpLabelEnd.textContent = '页';
    rightSide.appendChild(jumpLabelStart);
    rightSide.appendChild(jumpInputWrapper);
    rightSide.appendChild(jumpLabelEnd);
    wrapper.appendChild(rightSide);
    paginationEl.appendChild(wrapper);
}

function _calculatePages(currentPage, totalPages) {
    const pages = new Set();

    pages.add(1);
    pages.add(totalPages);

    if (currentPage <= 3) {
        [1, 2, 3, 4, 5].forEach((p) => {
            if (p <= totalPages) pages.add(p);
        });
    } else if (currentPage >= totalPages - 2) {
        for (let i = 0; i < 5; i++) {
            const p = totalPages - i;

            if (p > 1) pages.add(p);
        }
    } else {
        for (let i = currentPage - 2; i <= currentPage + 2; i++) {
            if (i > 1 && i < totalPages) pages.add(i);
        }
    }

    return Array.from(pages).sort((a, b) => a - b);
}
