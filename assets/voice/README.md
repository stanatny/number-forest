# 中文讲题语音

这些 MP3 由本项目的数学题文本在本地预生成。页面只播放音频文件，不下载或运行语音模型，不调用在线语音服务，不上传孩子的答案或录音。声音为模型提供的通用中文音色 Serena，没有使用任何人的参考录音或进行声音模仿。

## 来源

- 原始模型：[Qwen3-TTS-12Hz-1.7B-CustomVoice](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice)，官方标注 Apache-2.0。
- 本地推理权重：[MLX 8-bit 转换](https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit)，同为 Apache-2.0，使用修订 `41d3337e8b7f2843a75841595fc14e4b9a7a4b96`。
- 推理实现：[MLX-Audio](https://github.com/Blaizzy/mlx-audio)，MIT，生成时版本 0.6.2；MLX 0.32.4。
- [Qwen3-TTS 项目和许可](https://github.com/QwenLM/Qwen3-TTS)与 [MLX-Audio 许可](https://github.com/Blaizzy/mlx-audio/blob/main/LICENSE)由各自作者维护。本目录不包含第三方模型权重或库代码；上游模型及软件的许可与本项目代码许可分别适用。

## 音频与索引

音频为 24 kHz、单声道、64 kbit/s MP3，响度统一到目标 −18 LUFS。每道题以完整句子生成，数字没有用零碎录音拼接。合成前把数字转换为中文读法，时钟的 `12:30` 和 `12:00` 分别转为“十二点半”和“十二点整”；屏幕题文不变。

`manifest.js` 是可直接由经典 `<script>` 加载的索引，支持本地 `file://`。它设置 `window.NumberForestVoiceClips`，键是原始题文经以下规则标准化后的字符串，值是相对站点根目录的音频路径：

```js
text.replace(/\s+/g, '').replace(/[！!]/g, '。').replace(/[？?]/g, '。')
```

题干、欢迎、成功、通关和各题型的静态引导都有独立完整录音。详细的具体数量解释继续由画面展示，静态语音引导不冒充逐字朗读这些动态说明。

生成环境、模型缓存、覆盖报告和试验录音保存在项目忽略的 `.local/tts-research/`；可提交的生成脚本位于 `scripts/`。可续跑脚本按文本哈希命名音频，并在每条成功保存后原子更新索引；未完成生成不应作为完整覆盖发布。

## 更新语音

`scripts/voice-corpus.cjs` 直接枚举 `src/core.js` 的离散整数分支，而不是用随机抽样猜测覆盖范围。Node.js 中可调用 `enumerateCorpus()`，命令行可运行 `node scripts/voice-corpus.cjs` 取得 JSON。新增随机题型应通过 `context.integer` 产生有限选择；无法穷举的随机来源会报错，需要先明确新增题型的语音范围。

生成工具是 `scripts/generate-voice.py`。本地合成需要支持 MLX 的 Apple Silicon Mac、Node.js、ffmpeg，以及项目内虚拟环境中的 `mlx-audio==0.6.2` 和 `soundfile`；游戏播放不受这个生成环境限制。先按上面的 Hugging Face 模型页下载固定修订的权重到本地目录，再运行：

```bash
.local/tts-research/.venv/bin/python scripts/generate-voice.py \
  --model .local/tts-research/models/qwen3-1.7b-custom-8bit \
  --batch-size 8
```

`--scratch` 默认使用 `.local/tts-research/`，`--output` 默认使用 `assets/voice/`。`--dry-run` 只检查现有覆盖情况，不需要加载语音模型，也不写文件；`--limit N` 可先生成少量试听。运行时不会自动下载模型。再次执行会跳过已经正确保存的句子；新 clone 没有生成进度时，也会通过 ffmpeg 附带的 ffprobe 检查并复用仓库已有 MP3。改变音色、模型或读音规则后，使用 `--regenerate` 重新生成，避免误用旧录音。

默认使用 Serena、中文、温和讲题指令、温度 `0.7`、起始种子 `42`、每句最多 `384` 个音频 token。通用引导先生成，题干按句长分批。种子固定用于控制采样；批量大小、运行顺序、续跑位置或模型实现变化仍可能改变音频，不承诺字节完全一致。文件名根据标准化原题文的 SHA-256 前 20 位计算，与声音内容无关；替换声音时应同步更新发布版本的缓存标识。

当前语料共 790 条：767 个题干、9 条通用语句、14 条题型引导，MP3 总计约 41.8 MB。本次在 32 GB Apple Silicon Mac 上以 8 条一批生成，99 批合成与编码累计约 20.2 分钟，不含模型下载与初次加载；模型权重约 3.1 GB。这些是本次实测值，不是其他设备的速度保证。

生成器会拒绝不完整或无效的输出，并逐条更新忽略目录中的 `voice-coverage.json`。生成后需确认 `missing` 为空、用浏览器测试播放与中断，并对包含零、两位数、比较多少和时间跨点的题目抽查数字与关系。自动转录有同音字误识别，不能替代实际试听。新的数字范围、时间精度或数学表达式，也应先更新读音规则。
