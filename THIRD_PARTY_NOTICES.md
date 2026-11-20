# Third-party notices

| Component | License and source |
| --- | --- |
| Three.js 0.152.2 | [MIT license](frontend/public/vendor/LICENSE.three.txt) · [upstream](https://github.com/mrdoob/three.js) · [exact npm release](https://registry.npmjs.org/three/-/three-0.152.2.tgz) |
| Noto Sans SC and Noto Serif SC | [SIL Open Font License 1.1](frontend/public/vendor/LICENSE.noto.txt) · [Noto Sans SC package](https://fontsource.org/fonts/noto-sans-sc) · [Noto Serif SC package](https://fontsource.org/fonts/noto-serif-sc) |

The same Three.js UMD bundle is used by the [application](frontend/public/vendor/three.min.js) and the [standalone prototype](prototypes/three/vendor/three.min.js). The frontend build distributes both Noto font families from the pinned Fontsource packages and copies their license alongside the Three.js license.
