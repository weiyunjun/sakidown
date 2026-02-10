/**
 * @file settings/theme.js
 * @description 主题数据模型与工具 (Theme Data Model)
 * * 核心职责 (Core Responsibilities):
 * 1. 常量定义 (Constants Definition):
 * - 定义主题相关的存储键名 (`STORAGE_KEY`, `CUSTOM_STORAGE_KEY`) 和默认值。
 * 2. 预设主题 (Preset Themes):
 * - 提供系统内置的主题选项 (`THEME_OPTIONS`)，如 Saki (默认蓝) 和 Anon (粉色)。
 * 3. 颜色解析 (Color Resolution):
 * - `getThemeColor`: 统一的主题色获取接口。优先查找内置主题，若未命中则在用户自定义主题列表中查找，返回十六进制颜色值。
 * * 通信链路 (Communication):
 * - Role: 纯逻辑/数据模块，被 `ThemePanel` 和 `SettingsModal` 引用，提供主题数据支持。
 * * @author weiyunjun
 * @version v0.1.0
 */

const THEME_CONSTANTS = {
    STORAGE_KEY: 'user_theme',
    DEFAULT_THEME: 'default',
    CUSTOM_STORAGE_KEY: 'custom_themes_list',
};
const THEME_OPTIONS = [
    { value: 'default', label: 'Saki', color: '#7799CC' },
    { value: 'anon', label: 'Anon', color: '#FF8899' },
];

function getThemeColor(value, customThemes = []) {
    if (!value || value === 'default') return null;
    let theme = THEME_OPTIONS.find((t) => t.value === value);

    if (!theme && customThemes && Array.isArray(customThemes)) {
        theme = customThemes.find((t) => t.value === value);
    }

    return theme ? theme.color : null;
}

window.Theme = { THEME_CONSTANTS: THEME_CONSTANTS, THEME_OPTIONS: THEME_OPTIONS, getThemeColor: getThemeColor };
