# ens3de/YazFi fork

基于 [AMTM-OSR/YazFi](https://github.com/AMTM-OSR/YazFi) `master`（当前 v4.4.12）。给 RT-AC86U / Merlin 386.14_2 用。改动尽量小，方便以后 `merge upstream/master`。

## 相对上游改了什么

1. **访客客户端自定义名称。** Network Map（`index.asp` 右侧列表和客户端详情）里，YazFi 注入的访客原来只显示 DHCP 主机名，没有主机名时则把 MAC 的冒号换成下划线。路由器里已经在 `nvram custom_clientlist` 设过的名字（格式重复 `<name>MAC>flag>type>>`，例如 `<iPhone15PM>72:41:73:9A:A5:25>0>0>>`）会被盖掉。现在只要该 MAC（忽略大小写）有非空自定义名，JSON 的 `name` 和 `nickName` 都用这个名字，Asus 界面才会显示它。没有自定义名时仍是 DHCP 主机名，否则才是 MAC。
2. **更新源。** `YazFi update` / `forceupdate` / `develop` / `stable` 从 `https://raw.githubusercontent.com/ens3de/YazFi/<branch>` 拉脚本。`shared-jy` 仍指向 `AMTM-OSR/shared-jy`。版本号仍是上游的 `SCRIPT_VERSION`（不另加本地方缀）。同一版本号下内容不同时，原有 MD5 检查会当成 hotfix 更新，所以上游合并后版本比较方式不用改。
3. **查看列表按频段拆开，并藏起空表。** `查看列表` 的按接口视图里，同一个访客序号（`isGN`）原来把 2.4G 和 5G 放进一张 `访客网络 - N`。现在每个 `isGN` + `isWL` 单独一张表。主网络标题是 `<#3497#> · 2.4G (SSID)`（例如 `无线 · 5G（Socrates-Pri）`），访客是 `<#376#> N · 2.4G (SSID)`（例如 `访客网络 1 · 2.4G（Black7）`）。频段文字用页面上已有的 `isWL_map`（`2.4G` / `5G`）。SSID 来自 JSON 里的 `ssidMap`（只读 `wlX_ssid` / `wlX.Y_ssid`）。没有 SSID 就不加括号。界面语言替换后的访客/无线标签里有汉字时用全角括号 `（）`，否则用半角 `()`。有线表标题不动。有线、各频段、各访客表在每次重画时如果是 0 个客户端，连表头一起不显示。YazFi JSON 是空数组时这些仍然作用于已经在 networkmap 里的普通客户端，不会把列表弄坏。
4. **刚保存的名字马上生效。** 保存后大约 3 秒内的重画会用还没更新的 `networkmap_clients.json` 把旧 `nickName` 盖回去。现在页面里刚改过的 `custom_clientlist`（查看列表的 `view_custom_name`、卡片的 `card_client_variable.custom_clientlist`、详情里的 `custom_name`，以及若存在的 `originData.customList`）优先于注入的 `name` / `nickName`。已经在 networkmap 里的真实客户端不会被注入条目替换。保存后会立刻改内存里的 `clientList`，并强制再拉一次 JSON；JSON 仍旧时也继续显示刚保存的名字，直到 JSON 的 `nickName` 和它一致。
5. **回车保存名称。** 查看列表里点名字出现的输入框，原来只有失焦才调用 `saveClientName`。现在 Enter 走同一条保存（只提交一次），Esc 取消并且不提交。有线和 YazFi 访客用的是同一个输入框。

## 动过的文件和函数

| 文件 | 函数 / 位置 | 作用 |
| --- | --- | --- |
| `YazFi.sh` | `CustomClientList_Name` | 新增。按 `<` 切条目、按 `>` 切字段：第 1 段是名字，第 2 段是 MAC。同 MAC 多条时用最后一条非空名字。 |
| `YazFi.sh` | `NetworkMap_JSON_Escape` | 原来只转义 `\` 和 `"`。现在也处理换行、制表符、回车，丢掉其它控制字符，并把 `<` `>` `&` 写成 `\u003c` `\u003e` `\u0026`。主机名那条 `sed` 白名单没动。 |
| `YazFi.sh` | `NetworkMap_Resolve_Client` | 新增。有自定义名就同时作为显示名和 nickName；否则主机名，再否则 MAC（冒号仍换成下划线）。输出已转义的两行。 |
| `YazFi.sh` | `NetworkMap_Generate_JSON` | 读一次 `custom_clientlist`，用上面的解析写 `name` 和 `nickName`。数组第一个元素是 `ssidMap`，每个客户端另带该接口的 `ssid`。 |
| `YazFi.sh` | `NetworkMap_Write_SSID_Map` | 新增。只读 `wl0`–`wl3` 和 `IFACELIST_FULL` 的 `*_ssid`。不读 psk、wep、radius、key。 |
| `YazFi.sh` | 客户端列表（`Menu_Status` 里两处 `GUEST_HOST=`） | 原来的 `awk -F '>' '{print $(NF-1)}'` 在整段 `<name>MAC>flag>type>>` 上取到的是空字段。这两处改为调用 `CustomClientList_Name`。仍只在主机名是 `*`、`?` 或长度 ≤ 1 时才查自定义名，不改变 CLI 原来的优先级。 |
| `YazFi.sh` | `SCRIPT_REPO` 初值，以及 `develop` / `stable` | 仓库从 `AMTM-OSR` 改为 `ens3de`。 |
| `YazFi_networkmap.js` | `yazfiMergeIntoOriginData` / `yazfiPickNick` | 注入时若该 MAC 刚在自定义列表里改过名，或各份自定义列表一致地有一个非空名字，就用这个名字当 `name` 和 `nickName`，不用 JSON 里的旧值。真实 networkmap 条目仍然跳过。 |
| `YazFi_networkmap.js` | `create_clientlist_listview`、`sorterClientList`、`sorter.doSorter`、`sorter.drawBorder`、`drawClientListBlock`、`exportClientListLog`、`changeClientListViewMode` | 包一层。按接口视图里把 `gnN` 拆成 `gn{isGN}b{isWL}`，重写标题，删掉空表。原 stock 函数用 `substr(0, 3)` 假定访客键只有 3 个字符，所以排序、画边框、画行必须一起包，展开/收起和点表头排序才还能用。 |
| `YazFi_networkmap.js` | `saveClientName`、`card_confirm`、`edit_confirm` | 保存成功后记住新名字，并 `yazfiRequestClientData(true)`。`edit_confirm` 在 `index.asp` 里、本文件之后才定义，所以用 `setTimeout(0)` 再包。 |
| `YazFi_networkmap.js` | `document` 上的 `keydown` | 只处理 `id` 以 `client_name_` 开头的输入框。Enter 走 `saveClientName` 一次；Esc 恢复原名并不提交。 |

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

- 名称解析（`CustomClientList_Name`、`NetworkMap_Resolve_Client`、`NetworkMap_Generate_JSON` 里的 `nickName`、`YazFi_networkmap.js` 的 `nickName` 和刚保存的名字优先）留本 fork。
- `ssidMap` / 按频段拆表 / 空表隐藏 / Enter 保存也留本 fork。上游如果改了 `create_clientlist_listview` 的表头 HTML，包在外面的包装函数通常还能跟着走；它要是改了 `substr(0, 3)` 那套键，再对一下 `yazfiIsBandBucket`。
- `SCRIPT_REPO` 以及 `develop` / `stable` 里的 raw 地址留 `ens3de`。
- `SHARED_REPO`（`AMTM-OSR/shared-jy`）跟上游走，不要改到本 fork。
- 不要删 `jackyaz`。
- 不要改 `SCRIPT_VERSION` / `YAZFI_VERSION` 的格式。

`README.md` 里的安装命令仍指向 AMTM-OSR。那是文档里的上游安装示例，运行时的 `YazFi update` 不走它。在这台路由上安装本 fork 时，用 `ens3de/YazFi` 的 raw 地址，或直接拷已经打过补丁的 `YazFi.sh`。
