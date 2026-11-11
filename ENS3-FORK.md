# ens3de/YazFi fork

基于 [AMTM-OSR/YazFi](https://github.com/AMTM-OSR/YazFi) `master`（当前 v4.4.12）。给 RT-AC86U / Merlin 386.14_2 用。改动尽量小，方便以后 `merge upstream/master`。

## 相对上游改了什么

1. **访客客户端自定义名称。** Network Map（`index.asp` 右侧列表和客户端详情）里，YazFi 注入的访客原来只显示 DHCP 主机名，没有主机名时则把 MAC 的冒号换成下划线。路由器里已经在 `nvram custom_clientlist` 设过的名字（格式重复 `<name>MAC>flag>type>>`，例如 `<iPhone15PM>72:41:73:9A:A5:25>0>0>>`）会被盖掉。现在只要该 MAC（忽略大小写）有非空自定义名，JSON 的 `name` 和 `nickName` 都用这个名字，Asus 界面才会显示它。没有自定义名时仍是 DHCP 主机名，否则才是 MAC。
2. **更新源。** `YazFi update` / `forceupdate` / `develop` / `stable` 从 `https://raw.githubusercontent.com/ens3de/YazFi/<branch>` 拉脚本。`shared-jy` 仍指向 `AMTM-OSR/shared-jy`。版本号仍是上游的 `SCRIPT_VERSION`（不另加本地方缀）。同一版本号下内容不同时，原有 MD5 检查会当成 hotfix 更新，所以上游合并后版本比较方式不用改。

## 动过的文件和函数

| 文件 | 函数 / 位置 | 作用 |
| --- | --- | --- |
| `YazFi.sh` | `CustomClientList_Name` | 新增。按 `<` 切条目、按 `>` 切字段：第 1 段是名字，第 2 段是 MAC。同 MAC 多条时用最后一条非空名字。 |
| `YazFi.sh` | `NetworkMap_JSON_Escape` | 原来只转义 `\` 和 `"`。现在也处理换行、制表符、回车，并丢掉其它控制字符，避免自定义名把 JSON 弄坏。主机名那条 `sed` 白名单没动。 |
| `YazFi.sh` | `NetworkMap_Resolve_Client` | 新增。有自定义名就同时作为显示名和 nickName；否则主机名，再否则 MAC（冒号仍换成下划线）。输出已转义的两行。 |
| `YazFi.sh` | `NetworkMap_Generate_JSON` | 读一次 `custom_clientlist`，用上面的解析写 `name` 和 `nickName`。 |
| `YazFi.sh` | 客户端列表（`Menu_Status` 里两处 `GUEST_HOST=`） | 原来的 `awk -F '>' '{print $(NF-1)}'` 在整段 `<name>MAC>flag>type>>` 上取到的是空字段。这两处改为调用 `CustomClientList_Name`。仍只在主机名是 `*`、`?` 或长度 ≤ 1 时才查自定义名，不改变 CLI 原来的优先级。 |
| `YazFi.sh` | `SCRIPT_REPO` 初值，以及 `develop` / `stable` | 仓库从 `AMTM-OSR` 改为 `ens3de`。 |
| `YazFi_networkmap.js` | `yazfiMergeIntoOriginData` | `nickName` 改用 JSON 里的 `nickName`，没有则为空。不再写死成空字符串。 |

`jackyaz` 这串仍留在脚本里（文件头和 `ScriptHeader`）。更新例程用 `grep -qF jackyaz` 确认下载到的是脚本本身，删掉的话 `YazFi update` 会当成 404 停掉。

## 为什么不加版本后缀

`Update_Check` 用正则 `v[0-9]{1,2}([.][0-9]{1,2})([.][0-9]{1,2})` 抽取 `SCRIPT_VERSION`，再用字符串是否相等判断要不要更新；版本相同再比 MD5。如果改成 `v4.4.12-ens3`：

- 后缀对不上这个正则，远端版本会被抽成空的或抽错，更新判断失真。
- 和上游版本号永远不相等，合并上游后每次都要手工处理版本冲突。

同一版本、内容不同已经走 MD5 hotfix 路径，所以这里保持 `v4.4.12`。

## 合并上游

```sh
git remote add upstream https://github.com/AMTM-OSR/YazFi
git fetch upstream
git merge upstream/master
```

冲突时两边都留：

- 名称解析（`CustomClientList_Name`、`NetworkMap_Resolve_Client`、`NetworkMap_Generate_JSON` 里的 `nickName`、`YazFi_networkmap.js` 的 `nickName`）留本 fork。
- `SCRIPT_REPO` 以及 `develop` / `stable` 里的 raw 地址留 `ens3de`。
- `SHARED_REPO`（`AMTM-OSR/shared-jy`）跟上游走，不要改到本 fork。
- 不要删 `jackyaz`。
- 不要改 `SCRIPT_VERSION` / `YAZFI_VERSION` 的格式。

`README.md` 里的安装命令仍指向 AMTM-OSR。那是文档里的上游安装示例，运行时的 `YazFi update` 不走它。在这台路由上安装本 fork 时，用 `ens3de/YazFi` 的 raw 地址，或直接拷已经打过补丁的 `YazFi.sh`。
