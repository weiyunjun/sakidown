![SakiDown_Banner](./assets/SakiDown_Banner.png)

![Version](https://img.shields.io/badge/version-v0.1.0-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Chrome](https://img.shields.io/badge/Chrome-Manifest_V3-yellow)

**SakiDown**是一个遵循Chrome Manifest V3标准的哔哩哔哩视频下载和管理插件。基于原生JavaScript开发，无任何外部依赖，开箱即用。
1. **流式合并算法**：采用原生JavaScript实现了DASH音视频流的解封装与无损合并，配合OPFS存储技术，解决了ffmpeg.wasm在合并大文件时遇到的内存墙问题。
2. **透明隐私保护**：SakiDown承诺不收集任何用户数据，除Bilibili官方接口外无任何网络请求。代码完全开源且未混淆，逻辑清晰透明。用户可随时查阅或使用AI工具辅助审计源代码，确保数据安全。
3. **数据安全**：坚持“本地优先”原则，所有运行数据均存储于用户本地。可以完整导出已完成任务的json数据。
4. **极简交互体验**：集成于浏览器，无需额外登录账号。下载单个视频，在打开视频页面后只需要点击2次鼠标（批量下载点击3次）。可以不点击Chrome插件图标完成插件的全部操作。
5. **支持全面**：支持当前用户观看范围内非DRM加密的个人投稿/番剧/课堂，完整支持合集/播放列表/稍后再看。支持封面和XML弹幕下载。

## 安装
### 1. 下载项目文件

#### 方法一：git clone
```bash
git clone https://github.com/weiyunjun/sakidown.git
```
#### 方法二：点击下载
在GitHub页面点击Code -> Download ZIP下载并解压。

#### 方法三：release版
在GitHub页面点击Releases，选择你需要的版本。

### 2. 在浏览器中加载
本项目基于原生JavaScript开发，**开箱即用**，无需任何构建流程。

#### Chrome浏览器：
1. 打开浏览器，打开设置 - 扩展程序。
2. 开启开发者模式。
3. 选择：加载未打包的项目程序。
4. 选择项目文件夹。

#### Edge浏览器：
1. 打开浏览器，打开设置 - 扩展。
2. 开启开发人员模式。
3. 选择：加载解压缩的扩展。
4. 选择项目文件夹。

## 更新
### 方法一：git更新
在项目文件夹内打开终端，执行以下命令即可同步最新代码：
```bash
git pull
```
然后在浏览器的扩展管理页面点击刷新或更新图标即可。

### 方法二：重新下载
删除旧文件夹，重新下载zip包或release的zip包并解压到原文件夹（需要确保文件夹名称一致，否则不会被Chrome视为同一个插件）。

**默认文件夹名称**：sakidown-main

### 注意事项
- 更新插件或者日常使用时，请不要移除插件，移除操作会直接清空插件数据！
- 重装系统且清除系统盘数据通常会清除浏览器数据，请提前做好数据导出工作。

## 用户指南
非技术向的详细使用教程请参阅 [用户指南](docs/user_guide.md)。

## 任务数据导出
### 导出格式
支持导出已完成的任务数据，格式为`.json`。

### 数据结构
任务数据包括视频的元数据（`task.metadata`），下载该视频的下载策略配置（`task.preference`），该视频的下载状态（`task.status`）。

### 分卷导出
一次最多导出10000条数据，如果数据大于10000条，会分为多个`.json`文件导出。

### 备注
导入功能开发中，敬请期待。

### 数据展示
下面是一份示例数据：

<details>
<summary><b>点击查看完整数据结构示例 (JSON)</b></summary>

```json
{
  "metadata": {
    "type": "ugc",
    "aid": 657756942,
    "bvid": "BV1na4y1c7bR",
    "cid": 1179447493,
    "ep_id": null,
    "is_current": true,
    "season_title": "MyGO!!!!! 原创MV",
    "section_title": null,
    "episode_title": null,
    "part_title": null,
    "part_num": 1,
    "is_multi_part": null,
    "title": "栞 (Shiori)",
    "author_mid": 1459104794,
    "author_name": "MyGO_AveMujica",
    "author_image": "https://i2.hdslb.com/bfs/face/5f70adc443b0739c237847ef29acaea07a13db71.jpg",
    "author_url": "https://space.bilibili.com/1459104794",
    "duration": 267,
    "pubdate": 1688119200,
    "page_url": "https://www.bilibili.com/video/BV1na4y1c7bR",
    "cover_url": "https://i2.hdslb.com/bfs/archive/f07dad2340feb0d0f92a8bbddde843ab40cad63b.jpg",
    "thumbnail_url": "https://i2.hdslb.com/bfs/archive/f07dad2340feb0d0f92a8bbddde843ab40cad63b.jpg@320w_180h_1c_!web-home-common-cover.avif",
    "thumbnail_id": "BV1na4y1c7bR",
    "danmaku_url": "https://comment.bilibili.com/1179447493.xml",
    "collection_title": "MyGO!!!!! 原创MV"
  },
  "preference": {
    "strategy_config": {
      "audio": true,
      "video": true,
      "quality": {
        "primary": "best",
        "secondary": "dolby"
      },
      "codec": {
        "primary": "av1",
        "secondary": "hevc"
      },
      "merge": true,
      "cover": true,
      "cover_format": "jpg",
      "danmaku": true,
      "danmaku_format": "xml",
      "name": "最佳画质视频+封面+弹幕"
    }
  },
  "status": {
    "uid": "afbf5eb0-6789-43ba-8ac2-fffa83237692",
    "phase": "done",
    "phase_text": "已完成",
    "retry_count": 0,
    "error": null,
    "download_ids": {
      "full_video": 3207,
      "video_stream": null,
      "audio_stream": null,
      "cover": 3208,
      "danmaku": 3209
    },
    "finish_time": 1770820519286,
    "audio_candidates": [
      {
        "urls": [],
        "bandwidth": 233545,
        "id": 30280,
        "codec_label": "AAC",
        "size": 7766769
      }
    ],
    "video_candidates": [
      {
        "id": 112,
        "urls": [],
        "bandwidth": 638501,
        "width": 1920,
        "height": 1080,
        "frame_rate": "24.024",
        "quality_label": "1080P+",
        "codec_label": "AV1",
        "codecid": 13,
        "size": 21288136
      }
    ],
    "attachments": [
      {
        "type": "cover",
        "format": "jpg",
        "status": "success"
      },
      {
        "type": "danmaku",
        "format": "xml",
        "status": "success"
      }
    ]
  }
}
```
</details>

## 已知问题与局限性
尽管我已经努力测试覆盖所有可能的情况，但受限于自身技术能力和Chrome Manifest V3扩展的沙箱机制的双重限制，本项目在部分场景下仍存在以下已知局限：

### 1. 平台与架构限制
由于Manifest V3严格的安全策略与生命周期管理，部分功能在实现上存在物理瓶颈：
- **无法“真”暂停**：由于流式合并算法（DASH -> MP4）涉及复杂的二进制缓冲区管理，目前的架构不支持中途暂停下载。点击“取消”即意味着销毁任务。
- **UI交互限制**：Chrome限制了扩展程序对原生“下载栏”的控制权，使得静默通知难以真正实现。

### 2. 性能瓶颈
本项目采用Service Worker ↔ Offscreen ↔ Web Worker的三层通信架构。
- **高延迟IO环境**：当下载目标路径位于NAS且通过无线网络传输时，IO写入速度可能低于下载流的积压速度。
- **后果**：这可能导致内存缓冲区溢出或数据写入不完整。
- **建议**：在下载高码率视频时，建议优先保存至本地硬盘。

### 3. 设计理念
SakiDown采用了策略优先的设计哲学，这可能不符合手动选择下载内容的用户的习惯：
- **自动化决策**：为了优化批量下载，插件强制通过预设的下载策略来决定下载内容。
- **无单独选项**：不提供单次任务的下载选项。所有选项只能在下载策略中调整。

### 4. 项目成熟度
- **可维护性**：本项目是我在学习JavaScript一段时间后的练习性质的作品，主要角色更接近传统项目中的架构师+产品经理+测试。大部分具体业务代码由AI生成。虽然核心功能稳定，但可维护性有待于我对业务代码的进一步学习。
- **边缘情况**：目前的测试覆盖率主要集中在主流场景。在极端网络环境或特定硬件配置下，可能会出现未定义的行为。欢迎提交Issue反馈。

## 开发路线图
基于实际开发情况和功能复杂度，目前预估v0.2.0完整版本将于4月初发布。期间会陆续更新下列待办事项中的内容。

### v0.2.0
- [ ] 测试流程：单元测试、环境兼容性测试。
- [ ] 文档：技术文档和贡献者文档。
- [ ] 注释：数据嗅探、后端、合并算法部分，完善注释。
- [ ] 功能：任务数据的**导入功能**。
- [ ] 功能：ASS和JSON格式的弹幕下载。
- [ ] 功能：内嵌元数据到视频中。


### 长期计划
- [ ] 功能：任务管理，筛选功能。
- [ ] 功能：任务管理，排序功能。
- [ ] 性能：优化后端性能（具体内容待补充...）。
- [ ] 测试流程：集成测试、性能与压力测试。
- [ ] 界面交互：UI/UX优化。
- [ ] 注释：UI/UX部分，完善注释。

## 致谢
SakiDown的开发工作，是出于对二创社区的爱，一时冲动下开启的。如果没有以下存在，SakiDown完全没机会坚持到开源的这一天：
- **哔哩哔哩It's MyGO!!!!! & Ave Mujica二创社区**：谢谢你们带给我的美好回忆。对所有二创作者，致以最深，最深的敬意。
- [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect/)：谢谢你提供的API的详细文档，没有它，我会无从下手。
- [mp4box](https://github.com/gpac/mp4box.js/)：虽然代码部分无法提供直接参考，但在开发初期，`mp4box -info`在测试和验证DASH流合并算法时提供了巨大的帮助。
- [hakadao](https://github.com/hakadao/)：感谢你的bewlybewly插件，从你这里我知道了It's MyGO!!!!!这部作品。你的遭遇，让我鼓起勇气真正去在乎我爱的人。
- 我的家人和Steam家庭组的朋友。谢谢你们包容我像疯子一样的开发状态，还有...让我白嫖游戏。

## 第三方依赖与素材
- **MD5算法**
    * **来源**：JavaScript implementation of RSA Data Security, Inc. MD5 Message Digest Algorithm.
    * **作者**：Paul Johnston et al.
    * **协议**：BSD License
    * 注：源代码已包含完整版权声明。
- **默认音效**
    * **文件**：`assets/default.wav`
    * **来源**：[Directory Audio - Email Notification Gentle Ping](https://directory.audio/sound-effects/interface-ui/38142-email-notification-gentle-ping)
    * **协议**：CC0 1.0 Universal (Public Domain)

## 免责声明
- **软件许可**：本项目基于MIT License开源。在遵守协议的前提下，你可以自由地使用、修改或分发本软件。
- **内容版权**：本软件仅作为下载工具。用户使用本软件下载的任何内容（包括但不限于视频、音频、封面），其版权归原作者或平台所有。
- **使用责任**：用户需自行承担因使用本软件下载、传播版权内容而产生的任何法律责任。开发者不对用户的具体使用行为负责。