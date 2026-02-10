/**
 * @file ui/batch-tree-helper.js
 * @description 批量列表数据结构助手 (Batch Tree Data Helper)
 * * 核心职责 (Core Responsibilities):
 * 1. 数据结构转换 (Data Transformation):
 * - `buildTree`: 将扁平的视频列表转换为层级化的树节点 (`Root -> Folder -> File`)。
 * - 自动识别 Season / Section / Episode 层级关系。
 * 2. 状态传播算法 (State Propagation Algorithm):
 * - **向下级联 (Cascading)**: `toggleSelection` 实现父节点勾选后，递归更新所有子节点状态。
 * - **向上冒泡 (Bubbling)**: `updateParentStatus` 实现子节点状态变更后，递归计算父节点的 Checked/Indeterminate 状态。
 * 3. 视图辅助 (View Helpers):
 * - `getVisibleRows`: 根据节点的折叠/展开状态，计算当前应当渲染的线性列表，支持虚拟滚动逻辑的基础。
 * * 通信链路 (Communication):
 * - Role: 纯逻辑模块，为 `BatchModal` 提供数据模型支持。
 * * @author weiyunjun
 * @version v0.1.0
 */

class BatchTreeHelper {
    constructor() {
        this.rootNodes = [];
    }

    buildTree(playlist) {
        this.rootNodes = [];
        let globalIdCounter = 0;

        playlist.forEach((item, originalIdx) => {
            const meta = item.metadata;
            let currentLevelChildren = this.rootNodes;
            let parentNode = null;
            let currentLevel = 0;
            const hierarchyFields = ['season_title', 'section_title', 'episode_title'];

            hierarchyFields.forEach((field) => {
                const title = meta[field];

                if (title) {
                    let folderNode = currentLevelChildren.find((n) => n.type === 'folder' && n.title === title);

                    if (!folderNode) {
                        folderNode = {
                            id: `folder_${++globalIdCounter}`,
                            type: 'folder',
                            title: title,
                            level: currentLevel,
                            expanded: true,
                            checked: false,
                            indeterminate: false,
                            parent: parentNode,
                            children: [],
                        };
                        currentLevelChildren.push(folderNode);
                    }

                    parentNode = folderNode;
                    currentLevelChildren = folderNode.children;
                    currentLevel++;
                }
            });
            const fileNode = {
                id: `file_${originalIdx}`,
                type: 'file',
                title: meta.title,
                level: currentLevel,
                checked: !!meta.is_current,
                data: { ...item, originalIdx: originalIdx },
                parent: parentNode,
            };

            currentLevelChildren.push(fileNode);
        });
        this.syncInitialStatus();

        return this.rootNodes;
    }

    syncInitialStatus() {
        const processNode = (node) => {
            if (node.children && node.children.length > 0) {
                node.children.forEach((child) => processNode(child));
                const total = node.children.length;
                const checkedCount = node.children.filter((c) => c.checked).length;
                const hasIndeterminate = node.children.some((c) => c.indeterminate);

                if (checkedCount === total && total > 0) {
                    node.checked = true;
                    node.indeterminate = false;
                } else if (checkedCount === 0 && !hasIndeterminate) {
                    node.checked = false;
                    node.indeterminate = false;
                } else {
                    node.checked = false;
                    node.indeterminate = true;
                }
            }
        };

        this.rootNodes.forEach((root) => processNode(root));
    }

    getTotalFileCount() {
        let count = 0;

        const traverse = (nodes) => {
            nodes.forEach((node) => {
                if (node.type === 'file') count++;
                if (node.children) traverse(node.children);
            });
        };

        traverse(this.rootNodes);

        return count;
    }

    getVisibleRows() {
        const rows = [];

        const traverse = (nodes) => {
            nodes.forEach((node) => {
                rows.push(node);

                if (node.type === 'folder' && node.expanded) {
                    traverse(node.children);
                }
            });
        };

        traverse(this.rootNodes);

        return rows;
    }

    toggleSelection(node, isChecked) {
        node.checked = isChecked;
        node.indeterminate = false;

        if (node.children) {
            const setChildren = (children) => {
                children.forEach((child) => {
                    child.checked = isChecked;
                    child.indeterminate = false;
                    if (child.children) setChildren(child.children);
                });
            };

            setChildren(node.children);
        }

        this.updateParentStatus(node);
    }

    updateParentStatus(node) {
        let p = node.parent;

        while (p) {
            const total = p.children.length;
            const checkedCount = p.children.filter((c) => c.checked).length;
            const hasIndeterminate = p.children.some((c) => c.indeterminate);

            if (checkedCount === 0 && !hasIndeterminate) {
                p.checked = false;
                p.indeterminate = false;
            } else if (checkedCount === total && !hasIndeterminate) {
                p.checked = true;
                p.indeterminate = false;
            } else {
                p.checked = false;
                p.indeterminate = true;
            }

            p = p.parent;
        }
    }

    getSelectedItems() {
        const selected = [];

        const traverse = (nodes) => {
            nodes.forEach((node) => {
                if (node.type === 'file' && node.checked) {
                    selected.push(node.data);
                }

                if (node.children) traverse(node.children);
            });
        };

        traverse(this.rootNodes);

        return selected;
    }
}
window.BatchTreeHelper = BatchTreeHelper;
