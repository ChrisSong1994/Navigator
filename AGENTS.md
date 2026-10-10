这是一个用于链接导航的静态页面的完整配置信息，用于配置数据后：执行 pnpm refresh 进行数据解析,解析 global_original.json5 更新到  src/global_runtime.json ，只是做 json5 到 json 的转换，并验证配置格式正确,
在前端页面的运行时配置使用  src/global_runtime.json 里面的信息，用于整个导航精灵项目的数据渲染

精灵导航页面在运行时就把 global_runtime.json 数据解析并放到本地 localstorage 里面，用户可以在 精灵导航 的右侧弹出抽屉的配置面板里面修改配置并更新到 localstorage 里面去，用户可以直接导出导入 存在 localstorage 的配置信息到 json 文件，并且 global_runtime.json、localstorage、global_original.json5 的 格式要做到一致

前端页面，要求整洁简洁高级，主要信息就是跟  global_original.json5 设计的一样分为系统配置 和 导航分组两部分，页面内主要就是显示导航信息

ui 主要是基于 ant design 和 tailwindcss 实现，需要支持 暗黑模式以及系统自动切换的能力，需要支持卡片和列表两种展示模式，链接的点击都是新打开窗口

github action ： 增加github action 的能力，当 main 分支更新后就 执行 refresh（校验，解析，同步到 src/global_runtime.json），前端构建，发布到 github page

另外，当运行时 global_runtime.json 和 本地的 localstorage 数据不一致的时候，进行 merge ，以 localstorage 权重最高为主 