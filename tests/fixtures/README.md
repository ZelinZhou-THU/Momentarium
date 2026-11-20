# 测试素材

`synthetic/` 中的 12 张 JPEG 是程序生成的虚构海港、街道、室内和山景。冒烟测试和浏览器回归使用 `smoke/synthetic-smoke-1024.jpg`，Three.js 原型使用对应的合成海岸图。演示的地点名称、坐标和人物资料均为示例。图片没有 EXIF、GPS 或摄影原片。

仓库已提供生成结果。需要重新生成时，在安装 Pillow 的 Python 环境中从仓库根目录执行：

```powershell
python scripts/fixtures/generate-synthetic.py
```

`images/` 中还提供用于验证 WebP 解码的 [合成图片](images/README.md)，包括透明、动画及故意截断的样本。
