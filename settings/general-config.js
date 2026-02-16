/**
 * @file settings/general-config.js
 * @description 通用设置配置 Schema (General Settings Schema)
 */

const GENERAL_SCHEMA = [
    {
        type: 'section',
        title: '下载设置',
        children: [
            {
                key: 'show_quick_button',
                type: 'switch',
                label: '视频页面显示下载按钮',
                note: '在播放页左下角显示快速下载入口'
            },
            {
                key: 'task_interval',
                type: 'number',
                label: '任务间隔',
                min: 0,
                max: 60,
                note: '前一个任务结束后，下一个任务需要等待的时间'
            }
        ]
    }
];

window.GeneralConfig = {
    GENERAL_SCHEMA: GENERAL_SCHEMA
};